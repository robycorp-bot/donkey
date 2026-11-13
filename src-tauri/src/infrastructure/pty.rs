use crate::{domain::AppResult, infrastructure::filesystem::WorkspaceRoot};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::Path,
    sync::{
        atomic::{AtomicU32, Ordering},
        Mutex,
    },
    thread,
};
use tauri::{AppHandle, Emitter};

const MAX_WRITE: usize = 64 * 1024;

#[derive(Clone, Serialize)]
struct Output {
    id: u32,
    data: String,
}

#[derive(Clone, Serialize)]
struct Exit {
    id: u32,
}

struct Session {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Box<dyn Child + Send + Sync>,
}

/// Interactive terminals. Only a fixed list of shells can be started, never an arbitrary program.
#[derive(Default)]
pub struct Ptys {
    next: AtomicU32,
    sessions: Mutex<HashMap<u32, Session>>,
}

/// Shells the user may pick. The frontend sends only the key.
fn shell_command(key: &str) -> AppResult<CommandBuilder> {
    #[cfg(windows)]
    {
        let git_bash = [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
        ]
        .into_iter()
        .find(|path| Path::new(path).exists());
        let command = match key {
            "powershell" => {
                let mut c = CommandBuilder::new("powershell.exe");
                c.arg("-NoLogo");
                c
            }
            "pwsh" => {
                let mut c = CommandBuilder::new("pwsh.exe");
                c.arg("-NoLogo");
                c
            }
            "cmd" => CommandBuilder::new("cmd.exe"),
            "bash" => {
                let path = git_bash.ok_or("Git Bash não encontrado. Instale o Git for Windows.")?;
                let mut c = CommandBuilder::new(path);
                c.args(["--login", "-i"]);
                c
            }
            "wsl" => CommandBuilder::new("wsl.exe"),
            _ => return Err("Terminal desconhecido.".into()),
        };
        Ok(command)
    }
    #[cfg(not(windows))]
    {
        let _ = Path::new("");
        let program = match key {
            "bash" => "bash".to_string(),
            "powershell" | "pwsh" => "pwsh".to_string(),
            "cmd" | "wsl" => return Err("Terminal indisponível neste sistema.".into()),
            _ => return Err("Terminal desconhecido.".into()),
        };
        Ok(CommandBuilder::new(program))
    }
}

fn size(cols: u16, rows: u16) -> AppResult<PtySize> {
    if !(2..=500).contains(&cols) || !(1..=300).contains(&rows) {
        return Err("Tamanho de terminal inválido.".into());
    }
    Ok(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })
}

/// Splits off a trailing incomplete UTF-8 sequence so multi-byte characters survive chunk borders.
fn take_valid_utf8(buffer: &mut Vec<u8>) -> String {
    let keep = match std::str::from_utf8(buffer) {
        Ok(_) => 0,
        Err(error) if error.error_len().is_none() => buffer.len() - error.valid_up_to(),
        Err(_) => 0,
    };
    let split = buffer.len() - keep;
    let text = String::from_utf8_lossy(&buffer[..split]).into_owned();
    buffer.drain(..split);
    text
}

impl Ptys {
    pub fn open(
        &self,
        app: AppHandle,
        root: &WorkspaceRoot,
        shell: &str,
        cols: u16,
        rows: u16,
    ) -> AppResult<u32> {
        let pair = native_pty_system()
            .openpty(size(cols, rows)?)
            .map_err(|_| "Não foi possível criar o terminal.")?;
        let mut command = shell_command(shell)?;
        command.cwd(root.path());
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        let child = pair
            .slave
            .spawn_command(command)
            .map_err(|_| "Não foi possível iniciar o shell escolhido.")?;
        drop(pair.slave);
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|_| "Não foi possível ler o terminal.")?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|_| "Não foi possível escrever no terminal.")?;
        let id = self.next.fetch_add(1, Ordering::Relaxed) + 1;
        thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            let mut pending: Vec<u8> = Vec::new();
            loop {
                match reader.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        pending.extend_from_slice(&chunk[..n]);
                        let data = take_valid_utf8(&mut pending);
                        if !data.is_empty() && app.emit("pty-output", Output { id, data }).is_err()
                        {
                            break;
                        }
                    }
                }
            }
            let _ = app.emit("pty-exit", Exit { id });
        });
        self.sessions.lock().map_err(|_| "Terminal indisponível.")?.insert(
            id,
            Session {
                master: pair.master,
                writer,
                child,
            },
        );
        Ok(id)
    }

    pub fn write(&self, id: u32, data: &str) -> AppResult<()> {
        if data.len() > MAX_WRITE {
            return Err("Entrada grande demais para o terminal.".into());
        }
        let mut sessions = self.sessions.lock().map_err(|_| "Terminal indisponível.")?;
        let session = sessions.get_mut(&id).ok_or("Terminal encerrado.")?;
        session
            .writer
            .write_all(data.as_bytes())
            .and_then(|_| session.writer.flush())
            .map_err(|_| "Terminal encerrado.".into())
    }

    pub fn resize(&self, id: u32, cols: u16, rows: u16) -> AppResult<()> {
        let size = size(cols, rows)?;
        let sessions = self.sessions.lock().map_err(|_| "Terminal indisponível.")?;
        let session = sessions.get(&id).ok_or("Terminal encerrado.")?;
        session
            .master
            .resize(size)
            .map_err(|_| "Não foi possível redimensionar o terminal.".into())
    }

    pub fn close(&self, id: u32) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(mut session) = sessions.remove(&id) {
                let _ = session.child.kill();
            }
        }
    }

    pub fn close_all(&self) {
        if let Ok(mut sessions) = self.sessions.lock() {
            for (_, mut session) in sessions.drain() {
                let _ = session.child.kill();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_split_multibyte_characters_together() {
        let bytes = "ação".as_bytes();
        let mut pending = bytes[..2].to_vec(); // 'a' + first byte of 'ç'
        assert_eq!(take_valid_utf8(&mut pending), "a");
        pending.extend_from_slice(&bytes[2..]);
        assert_eq!(take_valid_utf8(&mut pending), "ção");
        assert!(pending.is_empty());
    }

    /// Real PowerShell inside a pseudo-terminal: it must start, run a command and exit.
    #[cfg(windows)]
    #[test]
    fn powershell_runs_inside_a_real_pty() {
        let pair = native_pty_system().openpty(size(80, 24).unwrap()).unwrap();
        let mut command = shell_command("powershell").unwrap();
        command.args(["-NoProfile", "-Command", "Write-Output pty-ok-$((1+2))"]);
        let mut child = pair.slave.spawn_command(command).unwrap();
        drop(pair.slave);
        let mut reader = pair.master.try_clone_reader().unwrap();
        let mut writer = pair.master.take_writer().unwrap();
        let reading = thread::spawn(move || {
            let mut out = Vec::new();
            let mut chunk = [0u8; 4096];
            let mut answered = false;
            while let Ok(n) = reader.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                out.extend_from_slice(&chunk[..n]);
                // ConPTY asks "where is the cursor?" and waits; xterm.js answers this in the app.
                if !answered && String::from_utf8_lossy(&out).contains("\x1b[6n") {
                    answered = true;
                    let _ = writer.write_all(b"\x1b[1;1R");
                    let _ = writer.flush();
                }
                if String::from_utf8_lossy(&out).contains("pty-ok-3") {
                    break;
                }
            }
            String::from_utf8_lossy(&out).into_owned()
        });
        let text = reading.join().unwrap();
        let _ = child.kill();
        assert!(text.contains("pty-ok-3"), "saída do PowerShell: {text:?}");
    }

    #[test]
    fn rejects_unknown_shells_and_bad_sizes() {
        assert!(shell_command("rm -rf /").is_err());
        assert!(size(0, 10).is_err());
        assert!(size(80, 24).is_ok());
    }
}
