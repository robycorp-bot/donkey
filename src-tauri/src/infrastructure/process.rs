use crate::domain::AppResult;
use std::{
    io::Read,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub fn hide(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command.stdin(Stdio::null());
}

pub fn capture(mut command: Command, timeout: Duration) -> AppResult<Vec<u8>> {
    hide(&mut command);
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|_| "Não foi possível iniciar o Git. Instale o Git e reabra o editor.")?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let out = thread::spawn(move || {
        let mut data = Vec::new();
        let _ = stdout.take(4 * 1024 * 1024).read_to_end(&mut data);
        data
    });
    let err = thread::spawn(move || {
        let mut data = Vec::new();
        let _ = stderr.take(65536).read_to_end(&mut data);
        data
    });
    let start = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if start.elapsed() < timeout => thread::sleep(Duration::from_millis(25)),
            _ => {
                kill_tree(&mut child);
                return Err("A operação excedeu o tempo limite e foi interrompida. Confira o estado do repositório antes de repetir.".into());
            }
        }
    };
    let output = out.join().unwrap_or_default();
    let error = String::from_utf8_lossy(&err.join().unwrap_or_default()).into_owned();
    if !status.success() {
        // Git may print remote URLs with credentials. Do not return arbitrary stderr.
        let message = if error.contains("Author identity unknown")
            || error.contains("unable to auto-detect email")
        {
            "Configure seu nome e e-mail no Git antes do primeiro commit: git config --global user.name e user.email."
        } else if error.contains("Authentication")
            || error.contains("could not read Username")
            || error.contains("Permission denied")
        {
            "O Git recusou a autenticação. Entre na sua conta pelo Git Credential Manager ou GitHub CLI e tente novamente."
        } else if error.contains("would be overwritten") || error.contains("local changes") {
            "O Git preservou suas alterações locais. Faça commit ou resolva as alterações antes de trocar de branch ou atualizar."
        } else if error.contains("non-fast-forward")
            || error.contains("fetch first")
            || error.contains("Not possible to fast-forward")
        {
            "As branches divergiram. Atualize e resolva a divergência antes de enviar; o editor não faz push forçado."
        } else if error.contains("nothing to commit") {
            "Não há alterações preparadas para commit."
        } else if error.contains("not a git repository") {
            "Esta pasta ainda não é um repositório Git."
        } else if error.contains("no upstream") || error.contains("no tracking") {
            "Esta branch ainda não tem upstream. Use Enviar para publicar em origin."
        } else {
            "O Git não concluiu a operação. Confira a branch, o remoto, suas permissões e eventuais hooks pelo terminal do sistema."
        };
        return Err(message.into());
    }
    Ok(output)
}

pub fn kill_tree(child: &mut std::process::Child) {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return;
    }
    #[cfg(windows)]
    {
        let mut command = Command::new("taskkill.exe");
        command.args(["/PID", &child.id().to_string(), "/T", "/F"]);
        hide(&mut command);
        let _ = command.stdout(Stdio::null()).stderr(Stdio::null()).status();
    }
    let _ = child.kill();
    let _ = child.wait();
}
