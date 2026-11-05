use crate::{
    domain::AppResult,
    infrastructure::{
        filesystem::WorkspaceRoot,
        process::{hide, kill_tree},
    },
};
use serde::Serialize;
use std::{
    collections::VecDeque,
    io::{BufReader, Read},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    pub running: bool,
    pub label: String,
    pub url: Option<String>,
    pub logs: Vec<String>,
    pub exit_code: Option<i32>,
}
#[derive(Serialize)]
pub struct Script {
    pub name: String,
    pub command: String,
}
pub struct Projects {
    session: Mutex<Option<Session>>,
}
struct Session {
    root: PathBuf,
    label: String,
    child: Option<Child>,
    stop: Arc<AtomicBool>,
    logs: Arc<Mutex<VecDeque<String>>>,
    url: Option<String>,
    exit_code: Option<i32>,
}
impl Drop for Session {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(child) = self.child.as_mut() {
            kill_tree(child);
        }
    }
}
impl Default for Projects {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
        }
    }
}
/// Bumped on every save; the live-reload script polls it.
pub static LIVE_VERSION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

pub fn bump_live() {
    LIVE_VERSION.fetch_add(1, Ordering::Relaxed);
}

const LIVE_SCRIPT: &str = "<script>/* Coder mega-brain live reload */(()=>{let v;setInterval(async()=>{try{const r=await fetch('/__cmb_live',{cache:'no-store'});const t=await r.text();if(v&&t!==v)location.reload();v=t}catch(e){}},600)})();</script>";

fn append(logs: &Mutex<VecDeque<String>>, line: String) {
    if let Ok(mut entries) = logs.lock() {
        if entries.len() >= 350 {
            entries.pop_front();
        }
        entries.push_back(line.chars().take(4096).collect());
    }
}

pub fn scripts(root: &WorkspaceRoot) -> AppResult<Vec<Script>> {
    let file = root.read("package.json")?;
    let value: serde_json::Value =
        serde_json::from_str(&file.content).map_err(|_| "O package.json não é um JSON válido.")?;
    Ok(value
        .get("scripts")
        .and_then(|v| v.as_object())
        .into_iter()
        .flatten()
        .filter_map(|(name, command)| {
            command.as_str().map(|command| Script {
                name: name.clone(),
                command: command.into(),
            })
        })
        .collect())
}
fn valid_script(name: &str) -> bool {
    !name.is_empty()
        && name.len() < 150
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.'))
        && !name.starts_with('-')
}
impl Projects {
    pub fn stop(&self) -> AppResult<()> {
        self.session
            .lock()
            .map_err(|_| "Execução indisponível.")?
            .take();
        Ok(())
    }
    pub fn state(&self) -> AppResult<ProjectState> {
        let mut guard = self.session.lock().map_err(|_| "Execução indisponível.")?;
        let Some(session) = guard.as_mut() else {
            return Ok(ProjectState {
                running: false,
                label: String::new(),
                url: None,
                logs: vec![],
                exit_code: None,
            });
        };
        let running = if let Some(child) = session.child.as_mut() {
            match child.try_wait() {
                Ok(Some(exit)) => {
                    session.exit_code = exit.code();
                    false
                }
                Ok(None) => true,
                Err(_) => false,
            }
        } else {
            !session.stop.load(Ordering::Relaxed)
        };
        let logs: Vec<String> = session
            .logs
            .lock()
            .map_err(|_| "Logs indisponíveis.")?
            .iter()
            .cloned()
            .collect();
        let url = session
            .url
            .clone()
            .or_else(|| logs.iter().rev().find_map(|line| local_url_in(line)));
        Ok(ProjectState {
            running,
            label: session.label.clone(),
            url,
            logs,
            exit_code: session.exit_code,
        })
    }
    pub fn start(
        &self,
        root: &WorkspaceRoot,
        kind: &str,
        script: Option<&str>,
    ) -> AppResult<ProjectState> {
        let mut guard = self.session.lock().map_err(|_| "Execução indisponível.")?;
        if let Some(session) = guard.as_mut() {
            let running = if let Some(child) = session.child.as_mut() {
                matches!(child.try_wait(), Ok(None))
            } else {
                !session.stop.load(Ordering::Relaxed)
            };
            if running {
                return Err("Pare a execução atual antes de iniciar outra.".into());
            }
        }
        guard.take();
        let logs = Arc::new(Mutex::new(VecDeque::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let mut session = Session {
            root: root.path().to_owned(),
            label: String::new(),
            child: None,
            stop: stop.clone(),
            logs: logs.clone(),
            url: None,
            exit_code: None,
        };
        match kind {
            "static" => {
                let entry = script
                    .map(|s| s.trim_start_matches(['/', '\\']).replace('\\', "/"))
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| "index.html".into());
                if !(entry.ends_with(".html") || entry.ends_with(".htm"))
                    || entry.split('/').any(|part| part.starts_with('.'))
                {
                    return Err("O Live Server abre arquivos .html da pasta do projeto.".into());
                }
                root.read(&entry).map_err(|_| {
                    "Não achei esse HTML. Abra um arquivo .html ou crie um index.html na raiz."
                })?;
                let entry_url: String = entry
                    .split('/')
                    .map(|part| {
                        percent_encoding::utf8_percent_encode(
                            part,
                            percent_encoding::NON_ALPHANUMERIC,
                        )
                        .to_string()
                        .replace("%2E", ".")
                        .replace("%2D", "-")
                        .replace("%5F", "_")
                    })
                    .collect::<Vec<_>>()
                    .join("/");
                let server = tiny_http::Server::http("127.0.0.1:0")
                    .map_err(|_| "Não foi possível abrir uma porta local.")?;
                let address = server
                    .server_addr()
                    .to_ip()
                    .ok_or("Endereço local indisponível.")?;
                session.label = "Live Server".into();
                session.url = Some(format!("http://127.0.0.1:{}/{entry_url}", address.port()));
                append(
                    &logs,
                    format!("Servidor local: {}", session.url.as_ref().unwrap()),
                );
                let server_root = WorkspaceRoot::select(&session.root)?;
                thread::spawn(move || {
                    while !stop.load(Ordering::Relaxed) {
                        if let Ok(Some(request)) = server.recv_timeout(Duration::from_millis(100)) {
                            serve(&server_root, request);
                        }
                    }
                });
            }
            "script" | "install" => {
                let script = script.unwrap_or("");
                if kind == "script"
                    && (!valid_script(script)
                        || !scripts(root)?.iter().any(|item| item.name == script))
                {
                    return Err(
                        "Escolha um script existente no package.json com nome simples.".into(),
                    );
                }
                if kind == "install" {
                    root.read("package.json")?;
                }
                #[cfg(windows)]
                let mut command = {
                    let mut c = Command::new("cmd.exe");
                    c.args(["/d", "/c", "npm.cmd"]);
                    c
                };
                #[cfg(not(windows))]
                let mut command = Command::new("npm");
                if kind == "install" {
                    command.arg("install");
                    session.label = "npm install".into();
                } else {
                    command.args(["run", script]);
                    session.label = format!("npm run {script}");
                }
                hide(&mut command);
                command
                    .current_dir(root.path())
                    .env("NO_COLOR", "1")
                    .env("FORCE_COLOR", "0")
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped());
                let mut child = command.spawn().map_err(|_| {
                    "Não foi possível iniciar o npm. Instale o Node.js e reabra o editor."
                })?;
                append(
                    &logs,
                    format!("{} · {}", session.label, session.root.display()),
                );
                let stdout = child.stdout.take().unwrap();
                let stderr = child.stderr.take().unwrap();
                let read_stream =
                    |stream: Box<dyn Read + Send>, logs: Arc<Mutex<VecDeque<String>>>| {
                        thread::spawn(move || {
                            let reader = BufReader::new(stream);
                            let mut bytes = Vec::new();
                            for byte in reader.bytes() {
                                match byte {
                                    Ok(b'\n') => {
                                        append(&logs, strip_ansi(&String::from_utf8_lossy(&bytes)));
                                        bytes.clear();
                                    }
                                    Ok(byte) => {
                                        if bytes.len() < 16384 {
                                            bytes.push(byte);
                                        }
                                    }
                                    Err(_) => break,
                                }
                            }
                            if !bytes.is_empty() {
                                append(&logs, strip_ansi(&String::from_utf8_lossy(&bytes)));
                            }
                        });
                    };
                read_stream(Box::new(stdout), logs.clone());
                read_stream(Box::new(stderr), logs.clone());
                session.child = Some(child);
            }
            _ => return Err("Tipo de execução desconhecido.".into()),
        }
        *guard = Some(session);
        drop(guard);
        self.state()
    }
}
fn strip_ansi(line: &str) -> String {
    let mut result = String::new();
    let mut escape = false;
    for c in line.chars() {
        if c == '\x1b' {
            escape = true;
        } else if escape {
            if c.is_ascii_alphabetic() {
                escape = false;
            }
        } else if c != '\r' {
            result.push(c);
        }
    }
    result
}
fn local_url_in(line: &str) -> Option<String> {
    line.split_whitespace().find_map(|piece| {
        let piece = piece.trim_matches(|c: char| matches!(c, '(' | ')' | '"' | '\''));
        validate_url(piece).ok().map(|_| piece.to_owned())
    })
}
pub fn validate_url(value: &str) -> AppResult<()> {
    let url = reqwest::Url::parse(value)
        .map_err(|_| "Informe uma URL local como http://localhost:5173.")?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("A prévia aceita somente HTTP em localhost ou 127.0.0.1.".into());
    }
    Ok(())
}
pub fn open_browser(value: &str) -> AppResult<()> {
    validate_url(value)?;
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("rundll32.exe");
        c.arg("url.dll,FileProtocolHandler");
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = Command::new("open");
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut command = Command::new("xdg-open");
    hide(&mut command);
    command
        .arg(value)
        .spawn()
        .map_err(|_| "Não foi possível abrir o navegador.")?;
    Ok(())
}
fn serve(root: &WorkspaceRoot, request: tiny_http::Request) {
    if !matches!(
        request.method(),
        tiny_http::Method::Get | tiny_http::Method::Head
    ) {
        let _ = request.respond(tiny_http::Response::empty(405));
        return;
    }
    if request.url() == "/__cmb_live" {
        let version = LIVE_VERSION.load(Ordering::Relaxed).to_string();
        let response = tiny_http::Response::from_string(version)
            .with_header(tiny_http::Header::from_bytes("Cache-Control", "no-store").unwrap());
        let _ = request.respond(response);
        return;
    }
    let decoded =
        percent_encoding::percent_decode_str(request.url().split('?').next().unwrap_or("/"))
            .decode_utf8();
    let Ok(decoded) = decoded else {
        let _ = request.respond(tiny_http::Response::empty(400));
        return;
    };
    let mut path = decoded.trim_start_matches('/').to_owned();
    if path.is_empty() || path.ends_with('/') {
        path.push_str("index.html");
    }
    if path.split(['/', '\\']).any(|part| part.starts_with('.')) {
        let _ = request.respond(tiny_http::Response::empty(403));
        return;
    }
    let result = (|| -> AppResult<(Vec<u8>, String)> {
        let resolved = root.resolve(&path)?;
        let metadata = std::fs::metadata(&resolved).map_err(|_| "Indisponível")?;
        if !metadata.is_file() || metadata.len() > 20 * 1024 * 1024 {
            return Err("Arquivo indisponível".into());
        }
        let mut bytes = std::fs::read(&resolved).map_err(|_| "Falha de leitura")?;
        let mime = mime_guess::from_path(&resolved)
            .first_or_octet_stream()
            .to_string();
        if mime.starts_with("text/html") {
            bytes = inject_live(bytes);
        }
        Ok((bytes, mime))
    })();
    match result {
        Ok((bytes, mime)) => {
            let response = tiny_http::Response::from_data(bytes)
                .with_header(tiny_http::Header::from_bytes("Content-Type", mime).unwrap())
                .with_header(tiny_http::Header::from_bytes("Cache-Control", "no-store").unwrap())
                .with_header(
                    tiny_http::Header::from_bytes("X-Content-Type-Options", "nosniff").unwrap(),
                );
            let _ = request.respond(response);
        }
        Err(_) => {
            let _ = request.respond(tiny_http::Response::empty(404));
        }
    }
}

fn inject_live(bytes: Vec<u8>) -> Vec<u8> {
    let html = String::from_utf8_lossy(&bytes).into_owned();
    let lower = html.to_ascii_lowercase();
    let mut out = html;
    match lower.rfind("</body>") {
        Some(at) => out.insert_str(at, LIVE_SCRIPT),
        None => out.push_str(LIVE_SCRIPT),
    }
    out.into_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn live_reload_script_is_injected_before_body_end() {
        let out = String::from_utf8(inject_live(b"<html><BODY>oi</BODY></html>".to_vec())).unwrap();
        assert!(out.find("__cmb_live").unwrap() < out.find("</BODY>").unwrap());
    }
    #[test]
    fn previews_are_loopback_only() {
        assert!(validate_url("http://localhost:5173/").is_ok());
        for bad in [
            "https://example.com",
            "http://localhost.evil.test/",
            "file:///C:/",
            "http://token@localhost/",
        ] {
            assert!(validate_url(bad).is_err());
        }
        assert!(!valid_script("dev & whoami"));
        assert!(valid_script("dev:web"));
    }
    #[test]
    fn static_server_serves_and_stops() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<h1>Teste local</h1>").unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let projects = Projects::default();
        let state = projects.start(&root, "static", None).unwrap();
        let url = reqwest::Url::parse(state.url.as_ref().unwrap()).unwrap();
        use std::io::{Read, Write};
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", url.port().unwrap())).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        stream.write_all(b"GET / HTTP/1.0\r\n\r\n").unwrap();
        let mut result = String::new();
        stream.read_to_string(&mut result).unwrap();
        assert!(result.contains("Teste local"));
        projects.stop().unwrap();
        assert!(!projects.state().unwrap().running);
    }

    fn get(url: &reqwest::Url, path: &str) -> String {
        use std::io::{Read, Write};
        let mut stream = std::net::TcpStream::connect(("127.0.0.1", url.port().unwrap())).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(3)))
            .unwrap();
        stream
            .write_all(format!("GET {path} HTTP/1.0\r\n\r\n").as_bytes())
            .unwrap();
        let mut result = String::new();
        stream.read_to_string(&mut result).unwrap();
        result
    }

    #[test]
    fn live_server_opens_any_html_injects_reload_and_bumps_version() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("paginas")).unwrap();
        std::fs::write(
            dir.path().join("paginas/sobre nós.html"),
            "<html><body>Sobre</body></html>",
        )
        .unwrap();
        std::fs::write(dir.path().join(".env"), "SEGREDO=1").unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let projects = Projects::default();
        let state = projects
            .start(&root, "static", Some("paginas/sobre nós.html"))
            .unwrap();
        assert_eq!(state.label, "Live Server");
        let url = reqwest::Url::parse(state.url.as_ref().unwrap()).unwrap();
        assert!(url.path().ends_with("sobre%20n%C3%B3s.html"), "{url}");
        let page = get(&url, url.path());
        assert!(page.contains("Sobre") && page.contains("__cmb_live"));
        let before = get(&url, "/__cmb_live");
        bump_live();
        let after = get(&url, "/__cmb_live");
        assert_ne!(before.rsplit("\r\n").next(), after.rsplit("\r\n").next());
        assert!(
            get(&url, "/.env").starts_with("HTTP/1.1 403")
                || get(&url, "/.env").starts_with("HTTP/1.0 403")
        );
        projects.stop().unwrap();
    }

    #[test]
    fn live_server_only_accepts_html_inside_the_project() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("app.js"), "1").unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let projects = Projects::default();
        assert!(projects.start(&root, "static", Some("app.js")).is_err());
        assert!(projects
            .start(&root, "static", Some("../fora.html"))
            .is_err());
        assert!(projects
            .start(&root, "static", Some(".oculto/x.html"))
            .is_err());
        assert!(projects.start(&root, "static", None).is_err());
        assert!(projects.start(&root, "foguete", None).is_err());
    }

    #[test]
    fn only_one_execution_runs_at_a_time() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("index.html"), "<p>1</p>").unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let projects = Projects::default();
        projects.start(&root, "static", None).unwrap();
        assert!(projects.start(&root, "static", None).is_err());
        projects.stop().unwrap();
        assert!(projects.start(&root, "static", None).is_ok());
        projects.stop().unwrap();
    }

    #[test]
    fn non_get_methods_and_ansi_are_handled() {
        assert_eq!(strip_ansi("\x1b[32mverde\x1b[0m\r"), "verde");
        assert_eq!(
            local_url_in("Local: (http://localhost:5173/)").as_deref(),
            Some("http://localhost:5173/")
        );
        assert!(local_url_in("https://example.com").is_none());
    }
}
