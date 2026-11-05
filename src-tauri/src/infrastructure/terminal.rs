use crate::{
    domain::AppResult,
    infrastructure::{filesystem::WorkspaceRoot, process::kill_tree},
};
use serde::Serialize;
use std::{
    io::Read,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const MAX_OUTPUT: u64 = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalResult {
    pub output: String,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

/// Runs one non-interactive shell command in the project root.
/// The user typed it, so stdout and stderr are shown as they are.
pub fn run(root: &WorkspaceRoot, line: &str) -> AppResult<TerminalResult> {
    let line = line.trim();
    if line.is_empty() || line.len() > 4000 || line.contains('\0') {
        return Err("Digite um comando de até 4 mil caracteres.".into());
    }
    let mut command = shell(line);
    command
        .current_dir(root.path())
        .env("GIT_PAGER", "cat")
        .env("PAGER", "cat")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("FORCE_COLOR", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Não foi possível iniciar o terminal do sistema.")?;
    let mut stdout = child.stdout.take().unwrap();
    let mut stderr = child.stderr.take().unwrap();
    let out = thread::spawn(move || {
        let mut data = Vec::new();
        let _ = (&mut stdout).take(MAX_OUTPUT).read_to_end(&mut data);
        data
    });
    let err = thread::spawn(move || {
        let mut data = Vec::new();
        let _ = (&mut stderr).take(MAX_OUTPUT).read_to_end(&mut data);
        data
    });
    let start = Instant::now();
    let mut timed_out = false;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if start.elapsed() < Duration::from_secs(180) => {
                thread::sleep(Duration::from_millis(25))
            }
            _ => {
                timed_out = true;
                kill_tree(&mut child);
                break None;
            }
        }
    };
    let mut output = String::from_utf8_lossy(&out.join().unwrap_or_default()).into_owned();
    let error = String::from_utf8_lossy(&err.join().unwrap_or_default()).into_owned();
    if !error.is_empty() {
        if !output.is_empty() && !output.ends_with('\n') {
            output.push('\n');
        }
        output.push_str(&error);
    }
    // stdout and stderr are capped independently so neither pipe can block;
    // enforce the same bound on the merged transcript before returning it.
    if output.len() as u64 > MAX_OUTPUT * 2 {
        output = output.chars().take((MAX_OUTPUT * 2) as usize).collect();
    }
    Ok(TerminalResult {
        output,
        exit_code: status.and_then(|s| s.code()),
        timed_out,
    })
}

#[cfg(windows)]
fn shell(line: &str) -> Command {
    use std::os::windows::process::CommandExt;
    let mut command = Command::new("cmd.exe");
    command
        .args(["/D", "/S", "/C"])
        .raw_arg(format!("\"{line}\""));
    command
}

#[cfg(not(windows))]
fn shell(line: &str) -> Command {
    let mut command = Command::new("sh");
    command.arg("-c").arg(line);
    command
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn runs_in_project_root_and_merges_streams() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("marca.txt"), "x").unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let result = run(&root, if cfg!(windows) { "dir /b" } else { "ls" }).unwrap();
        assert!(result.output.contains("marca.txt"));
        assert_eq!(result.exit_code, Some(0));
        assert!(run(&root, "   ").is_err());
    }

    #[test]
    fn reports_exit_codes_and_stderr() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let result = run(&root, "echo falhou 1>&2 && exit 3").unwrap();
        assert_eq!(result.exit_code, Some(3));
        assert!(result.output.contains("falhou"));
        assert!(!result.timed_out);
    }

    #[test]
    fn rejects_oversized_and_nul_commands() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        assert!(run(&root, &"a".repeat(4001)).is_err());
        assert!(run(&root, "echo a\0b").is_err());
    }

    #[test]
    fn output_is_capped() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let command = if cfg!(windows) {
            "for /L %i in (1,1,40000) do @echo 0123456789012345678901234567890123456789"
        } else {
            "yes 0123456789012345678901234567890123456789 | head -n 40000"
        };
        let result = run(&root, command).unwrap();
        assert!(result.output.len() as u64 <= MAX_OUTPUT * 2);
    }
}
