//! Contained local executor for vendor CLIs (ADR-007, card T3b).
//!
//! A vendor CLI running here is Grau 33 (domain rule 3), not Donkey. The executor:
//! 1. starts only programs from `ALLOWED_TARGETS`, never a path that came from outside;
//! 2. starts each run in its own directory under a dedicated base, never in the workspace;
//! 3. clears the environment and passes only a minimal, non-personal set;
//! 4. enforces a timeout and an output cap, and kills the whole process tree;
//! 5. declares the tools the target may use and passes them on the target's command line.
//!
//! There is NO operating-system isolation here. The run directory is a working directory,
//! not a jail: a process that guesses an absolute path reads or writes it with the user's
//! rights. The tests cover escape through `..`, environment variables and arguments only.
//! Real isolation (AppContainer or a low-integrity token) needs its own card before any CLI
//! with tools joins the list; until then the defence against tool use is the target's own
//! allow list plus the mediated MCP access in `packages/mcp-harness`.
//!
//! Event format: v1, frozen in `src/application/cli-executor.ts`.

// The Tauri commands that reach this module land in card T3c; until then only tests call it.
#![allow(dead_code)]

use crate::{
    domain::AppResult,
    infrastructure::process::{hide, kill_tree},
};
use serde::Serialize;
use std::{
    ffi::OsString,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, RecvTimeoutError},
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub const EXECUTION_EVENT_VERSION: u8 = 1;
pub const EVENT_CHANNEL: &str = "cli-execution";

const MAX_PROMPT_BYTES: usize = 64 * 1024;
const MAX_MODEL_CHARS: usize = 128;
/// Bytes per read; leaves room for a split UTF-8 character so a text chunk stays within 8 KiB.
const READ_CHUNK: usize = 8 * 1024 - 4;
/// Chunks in flight between the pipe readers and the supervisor. Bounds memory under a flood.
const CHANNEL_DEPTH: usize = 16;
const POLL: Duration = Duration::from_millis(25);
/// After the process exits, how long to wait for pipes held open by stray grandchildren.
const DRAIN_GRACE: Duration = Duration::from_secs(2);

pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(120);
const MIN_TIMEOUT: Duration = Duration::from_secs(1);
const MAX_TIMEOUT: Duration = Duration::from_secs(600);
pub const DEFAULT_MAX_OUTPUT: usize = 1024 * 1024;
const MIN_MAX_OUTPUT: usize = 1024;
const MAX_MAX_OUTPUT: usize = 8 * 1024 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Billing {
    Local,
    Subscription,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Stream {
    Stdout,
    Stderr,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Completed,
    Failed,
    TimedOut,
    OutputLimit,
    Cancelled,
    Refused,
}

/// Same list as the TypeScript contract; the gate codes are produced there, not here.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    GateBlocked,
    GateNeedsReview,
    TargetNotAllowed,
    RootOutsideSandbox,
    InvalidRequest,
    CliMissing,
    SpawnFailed,
    Timeout,
    OutputLimit,
    Cancelled,
    ExitNonzero,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEvent {
    pub v: u8,
    pub run_id: String,
    pub seq: u64,
    pub at: u64,
    #[serde(flatten)]
    pub body: EventBody,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum EventBody {
    Started {
        target: String,
        allowed_tools: Vec<String>,
        billing: Billing,
        prompt_chars: u64,
    },
    Output {
        stream: Stream,
        text: String,
    },
    Error {
        code: ErrorCode,
        message: String,
    },
    Finished {
        status: Status,
        exit_code: Option<i32>,
        duration_ms: u64,
        output_bytes: u64,
        truncated: bool,
    },
}

/// One CLI the executor may start. `program` is a bare name looked up on the system PATH.
pub struct TargetSpec {
    key: &'static str,
    program: &'static str,
    billing: Billing,
    /// Tools the target may use; the target denies everything else.
    allowed_tools: &'static [&'static str],
    /// Command line for an already validated model and the allowed tools.
    args: fn(&str, &[&str]) -> Vec<String>,
}

/// Fixed list, like the shells in `pty.rs`. A CLI joins only by recorded decision (ADR-007),
/// with both containment locks covered by tests.
const ALLOWED_TARGETS: &[TargetSpec] = &[TargetSpec {
    key: "ollama",
    program: "ollama",
    billing: Billing::Local,
    // Ollama has no tools: it neither reads the disk nor runs commands, so there is nothing to
    // deny and no flag to pass. The list is empty on purpose and NOT field-tested against a CLI
    // with tools; only the escaping fixture in the tests exercises the pass-through.
    allowed_tools: &[],
    args: ollama_args,
}];

fn ollama_args(model: &str, _tools: &[&str]) -> Vec<String> {
    vec!["run".into(), model.into()]
}

pub struct ExecutionRequest {
    /// UUID created by the frontend before the Harness gate.
    pub run_id: String,
    pub target: String,
    pub model: String,
    /// Goes to the process on stdin, never on the command line.
    pub prompt: String,
}

#[derive(Clone, Copy)]
pub struct Limits {
    pub timeout: Duration,
    pub max_output: usize,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            timeout: DEFAULT_TIMEOUT,
            max_output: DEFAULT_MAX_OUTPUT,
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct RunOutcome {
    pub status: Status,
    pub exit_code: Option<i32>,
    pub output_bytes: u64,
    pub truncated: bool,
    pid: Option<u32>,
}

impl RunOutcome {
    fn without_process(status: Status) -> Self {
        Self {
            status,
            exit_code: None,
            output_bytes: 0,
            truncated: false,
            pid: None,
        }
    }
}

/// Dedicated base for run directories (in the app, `%LOCALAPPDATA%\Donkey\exec`).
pub struct SandboxBase(PathBuf);

impl SandboxBase {
    /// `forbidden` are roots the base may neither sit inside nor contain, such as the open workspace.
    pub fn open(path: &Path, forbidden: &[&Path]) -> AppResult<Self> {
        if fs::symlink_metadata(path).is_ok_and(|meta| meta.file_type().is_symlink()) {
            return Err("O diretório de execução não pode ser um link.".into());
        }
        fs::create_dir_all(path)
            .map_err(|_| "Não foi possível preparar o diretório de execução.")?;
        let base = fs::canonicalize(path)
            .map_err(|_| "Não foi possível preparar o diretório de execução.")?;
        if !base.is_dir() {
            return Err("O diretório de execução precisa ser uma pasta.".into());
        }
        for root in forbidden {
            // A root that cannot be checked is treated as a clash: fail closed.
            let root = fs::canonicalize(root)
                .map_err(|_| "Não foi possível conferir o projeto aberto.")?;
            if base.starts_with(&root) || root.starts_with(&base) {
                return Err("O diretório de execução não pode ficar dentro do projeto nem conter o projeto.".into());
            }
        }
        Ok(Self(base))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }
}

struct Refusal {
    code: ErrorCode,
    message: &'static str,
}

const ROOT_OUTSIDE: Refusal = Refusal {
    code: ErrorCode::RootOutsideSandbox,
    message: "A pasta de execução precisa ficar dentro do diretório dedicado do Donkey.",
};
const INVALID: Refusal = Refusal {
    code: ErrorCode::InvalidRequest,
    message: "Pedido de execução inválido.",
};

fn valid_run_id(id: &str) -> bool {
    id.len() == 36
        && id.char_indices().all(|(i, c)| match i {
            8 | 13 | 18 | 23 => c == '-',
            _ => c.is_ascii_digit() || ('a'..='f').contains(&c),
        })
}

fn valid_model(model: &str) -> bool {
    !model.is_empty()
        && model.chars().count() <= MAX_MODEL_CHARS
        && !model.starts_with('-')
        && model
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | ':' | '/' | '-'))
        && !model.split('/').any(|part| part == "..")
}

fn validate(request: &ExecutionRequest, limits: &Limits) -> Result<(), Refusal> {
    let prompt_ok = !request.prompt.trim().is_empty()
        && request.prompt.len() <= MAX_PROMPT_BYTES
        && !request.prompt.contains('\0');
    let limits_ok = (MIN_TIMEOUT..=MAX_TIMEOUT).contains(&limits.timeout)
        && (MIN_MAX_OUTPUT..=MAX_MAX_OUTPUT).contains(&limits.max_output);
    if valid_model(&request.model) && prompt_ok && limits_ok {
        Ok(())
    } else {
        Err(INVALID)
    }
}

/// A run directory must be a direct child of the canonical base. Anything else is refused.
fn contained_root(base: &SandboxBase, candidate: &Path) -> Result<PathBuf, Refusal> {
    let canonical = fs::canonicalize(candidate).map_err(|_| ROOT_OUTSIDE)?;
    if canonical.parent() != Some(base.path()) || !canonical.is_dir() {
        return Err(ROOT_OUTSIDE);
    }
    Ok(canonical)
}

fn create_run_root(base: &SandboxBase, run_id: &str) -> Result<PathBuf, Refusal> {
    if !valid_run_id(run_id) {
        return Err(INVALID);
    }
    // `create_dir` fails when the directory exists, so a repeated run id is refused.
    fs::create_dir(base.path().join(run_id)).map_err(|_| INVALID)?;
    contained_root(base, &base.path().join(run_id))
}

/// Deletes only the run's own directory, validated again as a child of the base.
fn remove_run_root(base: &SandboxBase, root: &Path) {
    if let Ok(root) = contained_root(base, root) {
        let _ = fs::remove_dir_all(root);
    }
}

/// Drops the `\\?\` prefix of a canonical local path; some programs reject it as a cwd or in env.
fn plain(path: &Path) -> PathBuf {
    if let Some(rest) = path.to_str().and_then(|text| text.strip_prefix(r"\\?\")) {
        if rest.as_bytes().get(1) == Some(&b':') {
            return PathBuf::from(rest);
        }
    }
    path.to_path_buf()
}

/// Looks the fixed program name up on absolute PATH entries only, so the cwd cannot plant one.
fn locate(program: &str) -> Option<PathBuf> {
    let file = if cfg!(windows) {
        format!("{program}.exe")
    } else {
        program.to_owned()
    };
    std::env::split_paths(&std::env::var_os("PATH")?)
        .filter(|dir| dir.is_absolute())
        .map(|dir| dir.join(&file))
        .find(|candidate| candidate.is_file())
}

/// The whole environment of the child. Home and temp point at the run directory itself, so
/// no personal path, key or token from the parent reaches the process.
fn clean_env(root: &Path) -> Vec<(OsString, OsString)> {
    let root: OsString = plain(root).into_os_string();
    let mut env: Vec<(OsString, OsString)> = Vec::new();
    #[cfg(windows)]
    {
        let system_root =
            std::env::var_os("SystemRoot").unwrap_or_else(|| OsString::from(r"C:\Windows"));
        let mut path = system_root.clone();
        path.push(r"\System32;");
        path.push(&system_root);
        env.push(("SystemRoot".into(), system_root.clone()));
        env.push(("windir".into(), system_root));
        env.push(("PATH".into(), path));
        for key in [
            "HOME",
            "USERPROFILE",
            "TEMP",
            "TMP",
            "APPDATA",
            "LOCALAPPDATA",
        ] {
            env.push((key.into(), root.clone()));
        }
    }
    #[cfg(not(windows))]
    {
        env.push(("PATH".into(), "/usr/bin:/bin".into()));
        for key in ["HOME", "TMPDIR"] {
            env.push((key.into(), root.clone()));
        }
    }
    env.push(("OLLAMA_HOST".into(), "127.0.0.1:11434".into()));
    env.push(("NO_COLOR".into(), "1".into()));
    env.push(("TERM".into(), "dumb".into()));
    env
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

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

struct Emitter<'a> {
    run_id: String,
    seq: u64,
    started: Instant,
    sink: &'a mut dyn FnMut(ExecutionEvent),
}

impl Emitter<'_> {
    fn emit(&mut self, body: EventBody) {
        let event = ExecutionEvent {
            v: EXECUTION_EVENT_VERSION,
            run_id: self.run_id.clone(),
            seq: self.seq,
            at: now_ms(),
            body,
        };
        self.seq += 1;
        (self.sink)(event);
    }

    fn duration_ms(&self) -> u64 {
        self.started.elapsed().as_millis() as u64
    }

    /// Error + finished without a process: refused by policy, or failed before it was born.
    fn end_early(&mut self, status: Status, refusal: Refusal) -> RunOutcome {
        self.emit(EventBody::Error {
            code: refusal.code,
            message: refusal.message.into(),
        });
        self.emit(EventBody::Finished {
            status,
            exit_code: None,
            duration_ms: self.duration_ms(),
            output_bytes: 0,
            truncated: false,
        });
        RunOutcome::without_process(status)
    }
}

/// Kills the process tree if supervision ends by any path, including a panic.
struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        kill_tree(&mut self.0);
    }
}

enum Ending {
    Exited(ExitStatus),
    Lost,
    TimedOut,
    OutputLimit,
    Cancelled,
}

struct Collected {
    total: usize,
    truncated: bool,
    pending: [Vec<u8>; 2],
}

impl Collected {
    /// Emits what fits in the output budget. Returns false once the budget is exceeded.
    fn accept(
        &mut self,
        stream: Stream,
        bytes: &[u8],
        max_output: usize,
        out: &mut Emitter,
    ) -> bool {
        let take = bytes.len().min(max_output.saturating_sub(self.total));
        self.total += take;
        let pending = &mut self.pending[stream as usize];
        pending.extend_from_slice(&bytes[..take]);
        let text = take_valid_utf8(pending);
        if !text.is_empty() {
            out.emit(EventBody::Output { stream, text });
        }
        if take < bytes.len() {
            self.truncated = true;
            return false;
        }
        true
    }

    fn flush(&mut self, out: &mut Emitter) {
        for stream in [Stream::Stdout, Stream::Stderr] {
            let pending = std::mem::take(&mut self.pending[stream as usize]);
            if !pending.is_empty() {
                let text = String::from_utf8_lossy(&pending).into_owned();
                out.emit(EventBody::Output { stream, text });
            }
        }
    }
}

fn spawn_reader(
    mut source: impl Read + Send + 'static,
    stream: Stream,
    tx: mpsc::SyncSender<(Stream, Vec<u8>)>,
) {
    thread::spawn(move || {
        let mut chunk = vec![0u8; READ_CHUNK];
        loop {
            match source.read(&mut chunk) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send((stream, chunk[..n].to_vec())).is_err() {
                        break;
                    }
                }
            }
        }
    });
}

/// Runs one request on an allowed target. Always ends with exactly one `finished` event,
/// except for an invalid run id, which cannot name a run and gets no events at all.
pub fn run(
    base: &SandboxBase,
    request: &ExecutionRequest,
    limits: Limits,
    cancel: &AtomicBool,
    sink: &mut dyn FnMut(ExecutionEvent),
) -> RunOutcome {
    match ALLOWED_TARGETS
        .iter()
        .find(|spec| spec.key == request.target)
    {
        Some(spec) => run_spec(spec, base, request, limits, cancel, sink),
        None => {
            if !valid_run_id(&request.run_id) {
                return RunOutcome::without_process(Status::Refused);
            }
            Emitter {
                run_id: request.run_id.clone(),
                seq: 0,
                started: Instant::now(),
                sink,
            }
            .end_early(
                Status::Refused,
                Refusal {
                    code: ErrorCode::TargetNotAllowed,
                    message: "Este CLI não está na lista permitida do Donkey.",
                },
            )
        }
    }
}

fn run_spec(
    spec: &TargetSpec,
    base: &SandboxBase,
    request: &ExecutionRequest,
    limits: Limits,
    cancel: &AtomicBool,
    sink: &mut dyn FnMut(ExecutionEvent),
) -> RunOutcome {
    if !valid_run_id(&request.run_id) {
        return RunOutcome::without_process(Status::Refused);
    }
    let mut out = Emitter {
        run_id: request.run_id.clone(),
        seq: 0,
        started: Instant::now(),
        sink,
    };
    if let Err(refusal) = validate(request, &limits) {
        return out.end_early(Status::Refused, refusal);
    }
    let root = match create_run_root(base, &request.run_id) {
        Ok(root) => root,
        Err(refusal) => return out.end_early(Status::Refused, refusal),
    };
    let outcome = supervise(spec, &root, request, limits, cancel, &mut out);
    remove_run_root(base, &root);
    outcome
}

fn supervise(
    spec: &TargetSpec,
    root: &Path,
    request: &ExecutionRequest,
    limits: Limits,
    cancel: &AtomicBool,
    out: &mut Emitter,
) -> RunOutcome {
    let Some(program) = locate(spec.program) else {
        return out.end_early(
            Status::Failed,
            Refusal {
                code: ErrorCode::CliMissing,
                message: "O CLI escolhido não está instalado nesta máquina.",
            },
        );
    };
    let tools: Vec<&str> = spec.allowed_tools.to_vec();
    let mut command = Command::new(program);
    hide(&mut command);
    command
        .args((spec.args)(&request.model, &tools))
        .current_dir(plain(root))
        .env_clear()
        .envs(clean_env(root))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = match command.spawn() {
        Ok(child) => ChildGuard(child),
        Err(_) => {
            return out.end_early(
                Status::Failed,
                Refusal {
                    code: ErrorCode::SpawnFailed,
                    message: "Não foi possível iniciar o CLI.",
                },
            )
        }
    };
    let pid = child.0.id();
    out.emit(EventBody::Started {
        target: spec.key.into(),
        allowed_tools: tools.iter().map(|tool| tool.to_string()).collect(),
        billing: spec.billing,
        prompt_chars: request.prompt.chars().count() as u64,
    });
    if let Some(mut stdin) = child.0.stdin.take() {
        let prompt = request.prompt.clone().into_bytes();
        thread::spawn(move || {
            let _ = stdin.write_all(&prompt);
        });
    }
    let (tx, rx) = mpsc::sync_channel(CHANNEL_DEPTH);
    if let Some(stdout) = child.0.stdout.take() {
        spawn_reader(stdout, Stream::Stdout, tx.clone());
    }
    if let Some(stderr) = child.0.stderr.take() {
        spawn_reader(stderr, Stream::Stderr, tx);
    }

    let mut collected = Collected {
        total: 0,
        truncated: false,
        pending: [Vec::new(), Vec::new()],
    };
    let ending = loop {
        match rx.recv_timeout(POLL) {
            Ok((stream, bytes)) => {
                if !collected.accept(stream, &bytes, limits.max_output, out) {
                    kill_tree(&mut child.0);
                    break Ending::OutputLimit;
                }
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => thread::sleep(POLL),
        }
        if cancel.load(Ordering::Relaxed) {
            kill_tree(&mut child.0);
            break Ending::Cancelled;
        }
        match child.0.try_wait() {
            Ok(Some(status)) => break Ending::Exited(status),
            Ok(None) if out.started.elapsed() >= limits.timeout => {
                kill_tree(&mut child.0);
                break Ending::TimedOut;
            }
            Ok(None) => {}
            Err(_) => {
                kill_tree(&mut child.0);
                break Ending::Lost;
            }
        }
    };
    if !matches!(ending, Ending::OutputLimit) {
        let deadline = Instant::now() + DRAIN_GRACE;
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            match rx.recv_timeout(left) {
                Ok((stream, bytes)) => {
                    if !collected.accept(stream, &bytes, limits.max_output, out) {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
    }
    drop(rx);
    collected.flush(out);

    let (status, exit_code, error) = match ending {
        Ending::Exited(exit) if exit.success() => (Status::Completed, exit.code(), None),
        Ending::Exited(exit) => (
            Status::Failed,
            exit.code(),
            Some((ErrorCode::ExitNonzero, "O CLI terminou com erro.")),
        ),
        Ending::Lost => (
            Status::Failed,
            None,
            Some((
                ErrorCode::ExitNonzero,
                "O CLI terminou de forma inesperada.",
            )),
        ),
        Ending::TimedOut => (
            Status::TimedOut,
            None,
            Some((
                ErrorCode::Timeout,
                "A execução passou do tempo máximo e foi encerrada.",
            )),
        ),
        Ending::OutputLimit => (
            Status::OutputLimit,
            None,
            Some((
                ErrorCode::OutputLimit,
                "A saída passou do limite e a execução foi encerrada.",
            )),
        ),
        Ending::Cancelled => (
            Status::Cancelled,
            None,
            Some((ErrorCode::Cancelled, "Execução cancelada.")),
        ),
    };
    if let Some((code, message)) = error {
        out.emit(EventBody::Error {
            code,
            message: message.into(),
        });
    }
    out.emit(EventBody::Finished {
        status,
        exit_code,
        duration_ms: out.duration_ms(),
        output_bytes: collected.total as u64,
        truncated: collected.truncated,
    });
    RunOutcome {
        status,
        exit_code,
        output_bytes: collected.total as u64,
        truncated: collected.truncated,
        pid: Some(pid),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::AtomicU64;

    /// Same JSON as the contract test in `src/application/cli-executor.test.ts`.
    const CONTRACT_SAMPLE: &str = r#"[
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":0,"at":1763060000000,"kind":"started","target":"ollama","allowedTools":[],"billing":"local","promptChars":12},
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":1,"at":1763060000100,"kind":"output","stream":"stdout","text":"olá"},
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":2,"at":1763060000200,"kind":"error","code":"exit_nonzero","message":"O CLI terminou com erro."},
  {"v":1,"runId":"0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6","seq":3,"at":1763060000250,"kind":"finished","status":"failed","exitCode":3,"durationMs":250,"outputBytes":4,"truncated":false}
]"#;

    fn run_id() -> String {
        static NEXT: AtomicU64 = AtomicU64::new(1);
        format!(
            "00000000-0000-4000-8000-{:012x}",
            NEXT.fetch_add(1, Ordering::Relaxed)
        )
    }

    fn request(target: &str, model: &str, prompt: &str) -> ExecutionRequest {
        ExecutionRequest {
            run_id: run_id(),
            target: target.into(),
            model: model.into(),
            prompt: prompt.into(),
        }
    }

    fn base() -> (tempfile::TempDir, SandboxBase) {
        let dir = tempfile::tempdir().unwrap();
        let base = SandboxBase::open(&dir.path().join("exec"), &[]).unwrap();
        (dir, base)
    }

    fn collect(
        spec: Option<&TargetSpec>,
        base: &SandboxBase,
        request: &ExecutionRequest,
        limits: Limits,
    ) -> (RunOutcome, Vec<ExecutionEvent>) {
        let mut events = Vec::new();
        let cancel = AtomicBool::new(false);
        let outcome = match spec {
            Some(spec) => run_spec(spec, base, request, limits, &cancel, &mut |e| {
                events.push(e)
            }),
            None => run(base, request, limits, &cancel, &mut |e| events.push(e)),
        };
        (outcome, events)
    }

    fn kinds(events: &[ExecutionEvent]) -> Vec<&'static str> {
        events
            .iter()
            .map(|event| match event.body {
                EventBody::Started { .. } => "started",
                EventBody::Output { .. } => "output",
                EventBody::Error { .. } => "error",
                EventBody::Finished { .. } => "finished",
            })
            .collect()
    }

    fn error_code(events: &[ExecutionEvent]) -> Option<ErrorCode> {
        events.iter().find_map(|event| match event.body {
            EventBody::Error { code, .. } => Some(code),
            _ => None,
        })
    }

    fn text(events: &[ExecutionEvent]) -> String {
        events
            .iter()
            .filter_map(|event| match &event.body {
                EventBody::Output { text, .. } => Some(text.as_str()),
                _ => None,
            })
            .collect()
    }

    fn entries(path: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(path)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn event_serializes_exactly_as_the_frozen_contract() {
        let id = "0f8c2a4e-5b6d-4c7e-8f90-a1b2c3d4e5f6";
        let event = |seq, at, body| ExecutionEvent {
            v: EXECUTION_EVENT_VERSION,
            run_id: id.into(),
            seq,
            at,
            body,
        };
        let events = vec![
            event(
                0,
                1763060000000,
                EventBody::Started {
                    target: "ollama".into(),
                    allowed_tools: vec![],
                    billing: Billing::Local,
                    prompt_chars: 12,
                },
            ),
            event(
                1,
                1763060000100,
                EventBody::Output {
                    stream: Stream::Stdout,
                    text: "olá".into(),
                },
            ),
            event(
                2,
                1763060000200,
                EventBody::Error {
                    code: ErrorCode::ExitNonzero,
                    message: "O CLI terminou com erro.".into(),
                },
            ),
            event(
                3,
                1763060000250,
                EventBody::Finished {
                    status: Status::Failed,
                    exit_code: Some(3),
                    duration_ms: 250,
                    output_bytes: 4,
                    truncated: false,
                },
            ),
        ];
        let expected: serde_json::Value = serde_json::from_str(CONTRACT_SAMPLE).unwrap();
        assert_eq!(serde_json::to_value(&events).unwrap(), expected);
        assert_eq!(EVENT_CHANNEL, "cli-execution");
    }

    #[test]
    fn allow_list_holds_only_ollama_without_tools() {
        let keys: Vec<&str> = ALLOWED_TARGETS.iter().map(|spec| spec.key).collect();
        assert_eq!(keys, ["ollama"]);
        let ollama = &ALLOWED_TARGETS[0];
        assert!(ollama.allowed_tools.is_empty());
        assert_eq!((ollama.args)("llama3.2", &[]), ["run", "llama3.2"]);
    }

    #[test]
    fn binary_outside_the_list_is_refused_before_anything_starts() {
        let (_dir, base) = base();
        for target in [
            "powershell",
            r"C:\Windows\System32\cmd.exe",
            "/bin/sh",
            "../ollama",
            "OLLAMA",
            "ollama.exe",
            "",
        ] {
            let (outcome, events) =
                collect(None, &base, &request(target, "m", "oi"), Limits::default());
            assert_eq!(outcome.status, Status::Refused, "{target}");
            assert_eq!(kinds(&events), ["error", "finished"], "{target}");
            assert_eq!(error_code(&events), Some(ErrorCode::TargetNotAllowed));
            assert_eq!(events[1].seq, 1);
        }
        assert!(entries(base.path()).is_empty());
    }

    #[test]
    fn root_outside_the_dedicated_base_is_refused() {
        let (dir, base) = base();
        let outside = tempfile::tempdir().unwrap();
        let child = base.path().join(run_id());
        fs::create_dir(&child).unwrap();
        fs::create_dir(child.join("neto")).unwrap();
        assert!(contained_root(&base, outside.path()).is_err());
        assert!(contained_root(&base, base.path()).is_err());
        assert!(contained_root(&base, dir.path()).is_err());
        assert!(contained_root(&base, &child.join("neto")).is_err());
        assert!(contained_root(&base, &child.join("..").join("..")).is_err());
        assert!(contained_root(&base, &base.path().join("nao-existe")).is_err());
        assert!(contained_root(&base, &child).is_ok());
        for bad in ["../fora", "..", "x", "00000000-0000-4000-8000-00000000000G"] {
            assert!(create_run_root(&base, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn base_never_sits_inside_or_around_the_workspace() {
        let dir = tempfile::tempdir().unwrap();
        let workspace = dir.path().join("projeto");
        fs::create_dir(&workspace).unwrap();
        let forbidden = [workspace.as_path()];
        assert!(SandboxBase::open(&workspace.join("exec"), &forbidden).is_err());
        assert!(SandboxBase::open(dir.path(), &forbidden).is_err());
        assert!(SandboxBase::open(&dir.path().join("exec"), &forbidden).is_ok());
        let missing = dir.path().join("sumiu");
        assert!(SandboxBase::open(&dir.path().join("exec2"), &[missing.as_path()]).is_err());
    }

    #[test]
    fn repeated_run_id_is_refused() {
        let (_dir, base) = base();
        let id = run_id();
        fs::create_dir(base.path().join(&id)).unwrap();
        let mut request = request("ollama", "llama3.2", "oi");
        request.run_id = id;
        let (outcome, events) = collect(None, &base, &request, Limits::default());
        assert_eq!(outcome.status, Status::Refused);
        assert_eq!(error_code(&events), Some(ErrorCode::InvalidRequest));
    }

    #[test]
    fn invalid_requests_are_refused_and_bad_run_ids_get_no_events() {
        let (_dir, base) = base();
        let mut bad_id = request("ollama", "llama3.2", "oi");
        bad_id.run_id = "../../fora".into();
        let (outcome, events) = collect(None, &base, &bad_id, Limits::default());
        assert_eq!(outcome.status, Status::Refused);
        assert!(events.is_empty());

        for (model, prompt) in [
            ("", "oi"),
            ("--verbose", "oi"),
            ("llama 3", "oi"),
            ("a/../b", "oi"),
            ("llama3.2", "   "),
            ("llama3.2", "a\0b"),
        ] {
            let (outcome, events) = collect(
                None,
                &base,
                &request("ollama", model, prompt),
                Limits::default(),
            );
            assert_eq!(outcome.status, Status::Refused, "{model:?} {prompt:?}");
            assert_eq!(error_code(&events), Some(ErrorCode::InvalidRequest));
        }
        let huge = "a".repeat(MAX_PROMPT_BYTES + 1);
        let (outcome, _) = collect(
            None,
            &base,
            &request("ollama", "m", &huge),
            Limits::default(),
        );
        assert_eq!(outcome.status, Status::Refused);
        for limits in [
            Limits {
                timeout: Duration::from_millis(10),
                ..Limits::default()
            },
            Limits {
                timeout: Duration::from_secs(3600),
                ..Limits::default()
            },
            Limits {
                max_output: 10,
                ..Limits::default()
            },
        ] {
            let (outcome, _) = collect(None, &base, &request("ollama", "m", "oi"), limits);
            assert_eq!(outcome.status, Status::Refused);
        }
        assert!(entries(base.path()).is_empty());
    }

    #[test]
    fn missing_cli_fails_without_starting() {
        let (_dir, base) = base();
        let spec = TargetSpec {
            key: "fantasma",
            program: "donkey-cli-que-nao-existe",
            billing: Billing::Local,
            allowed_tools: &[],
            args: ollama_args,
        };
        let (outcome, events) = collect(
            Some(&spec),
            &base,
            &request("fantasma", "m", "oi"),
            Limits::default(),
        );
        assert_eq!(outcome.status, Status::Failed);
        assert_eq!(kinds(&events), ["error", "finished"]);
        assert_eq!(error_code(&events), Some(ErrorCode::CliMissing));
        assert!(entries(base.path()).is_empty());
    }

    #[test]
    fn child_environment_is_clean_and_points_home_at_the_run_root() {
        let dir = tempfile::tempdir().unwrap();
        let env = clean_env(dir.path());
        let mut keys: Vec<String> = env
            .iter()
            .map(|(key, _)| key.to_string_lossy().into_owned())
            .collect();
        keys.sort();
        let mut expected: Vec<&str> = if cfg!(windows) {
            vec![
                "APPDATA",
                "HOME",
                "LOCALAPPDATA",
                "NO_COLOR",
                "OLLAMA_HOST",
                "PATH",
                "SystemRoot",
                "TEMP",
                "TERM",
                "TMP",
                "USERPROFILE",
                "windir",
            ]
        } else {
            vec!["HOME", "NO_COLOR", "OLLAMA_HOST", "PATH", "TERM", "TMPDIR"]
        };
        expected.sort();
        assert_eq!(keys, expected);
        let root = plain(dir.path()).into_os_string();
        let personal = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
        for (key, value) in &env {
            let key = key.to_string_lossy();
            if [
                "HOME",
                "USERPROFILE",
                "TEMP",
                "TMP",
                "APPDATA",
                "LOCALAPPDATA",
                "TMPDIR",
            ]
            .contains(&&*key)
            {
                assert_eq!(value, &root, "{key}");
            } else if let Some(personal) = &personal {
                let personal = personal.to_string_lossy().to_lowercase();
                assert!(
                    !value.to_string_lossy().to_lowercase().contains(&personal),
                    "{key} carrega caminho pessoal"
                );
            }
        }
    }

    #[test]
    fn keeps_split_multibyte_characters_together() {
        let bytes = "ação".as_bytes();
        let mut pending = bytes[..2].to_vec();
        assert_eq!(take_valid_utf8(&mut pending), "a");
        pending.extend_from_slice(&bytes[2..]);
        assert_eq!(take_valid_utf8(&mut pending), "ção");
        assert!(pending.is_empty());
    }

    #[test]
    fn verbatim_prefix_is_dropped_only_for_drive_paths() {
        assert_eq!(plain(Path::new(r"\\?\C:\x")), PathBuf::from(r"C:\x"));
        assert_eq!(
            plain(Path::new(r"\\?\UNC\srv\x")),
            PathBuf::from(r"\\?\UNC\srv\x")
        );
    }

    /// The escaping fixture: a test-only target that is never part of `ALLOWED_TARGETS`.
    #[cfg(windows)]
    mod fixture {
        use super::*;

        const SECRET: &str = "SEGREDO-T3B-42";
        const LEAKED_TOKEN: &str = "token-que-nao-pode-chegar";

        const ECHO: &str = r#"'ALLOWED-TOOLS:[' + $allowed + ']'; $t = [Console]::In.ReadToEnd(); 'ECO:' + $t.Trim()"#;
        const FAIL: &str = "'vai falhar'; exit 3";
        const SLEEP: &str = "Start-Sleep -Seconds 60";
        const FLOOD: &str = "$s = 'x' * 65536; while ($true) { [Console]::Out.Write($s) }";
        /// Tries the three vectors this card covers: `..`, environment variables and arguments.
        /// It only probes its own marker file name, so no real secret of the machine is read.
        const ESCAPE: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$name = 'segredo-t3b.txt'
function Probe($path) { $c = Get-Content -LiteralPath $path -Raw; if ($c) { 'LEU ' + $path + ' => ' + $c } }
function Plant($path) { Set-Content -LiteralPath $path -Value 'ESCAPOU' }
$up = ''
for ($i = 0; $i -lt 12; $i++) { $up += '..\'; Probe ($up + $name) }
Plant '..\escapou.txt'
Plant '..\..\escapou.txt'
foreach ($v in Get-ChildItem env:) {
  'ENV ' + $v.Name + '=' + $v.Value
  foreach ($part in ($v.Value -split ';')) { if ($part) { Probe (Join-Path $part $name) } }
}
foreach ($k in 'USERPROFILE','HOME','APPDATA','LOCALAPPDATA','TEMP','TMP') {
  $d = [Environment]::GetEnvironmentVariable($k)
  if ($d) { Plant (Join-Path $d 'donkey-t3b-escapou.txt') }
}
foreach ($a in [Environment]::GetCommandLineArgs()) { 'ARG ' + $a; Probe $a; Probe (Join-Path $a $name) }
'FIM'
"#;

        fn fixture_args(model: &str, tools: &[&str]) -> Vec<String> {
            let script = match model {
                "echo" => ECHO,
                "fail" => FAIL,
                "sleep" => SLEEP,
                "flood" => FLOOD,
                _ => ESCAPE,
            };
            vec![
                "-NoProfile".into(),
                "-NonInteractive".into(),
                "-ExecutionPolicy".into(),
                "Bypass".into(),
                "-Command".into(),
                format!("$allowed = '{}'; {script}", tools.join(",")),
            ]
        }

        const FIXTURE: TargetSpec = TargetSpec {
            key: "fixture",
            program: "powershell",
            billing: Billing::Local,
            allowed_tools: &["donkey-harness"],
            args: fixture_args,
        };

        fn alive(pid: u32) -> bool {
            let mut command = Command::new("tasklist.exe");
            command.args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"]);
            hide(&mut command);
            let output = command.output().unwrap();
            String::from_utf8_lossy(&output.stdout).contains(&format!("\"{pid}\""))
        }

        fn fixture(model: &str, prompt: &str, limits: Limits) -> (RunOutcome, Vec<ExecutionEvent>) {
            let (_dir, base) = base();
            let request = request("fixture", model, prompt);
            let result = collect(Some(&FIXTURE), &base, &request, limits);
            assert!(
                !base.path().join(&request.run_id).exists(),
                "a pasta da execução deve ser apagada"
            );
            result
        }

        #[test]
        fn passes_the_prompt_on_stdin_and_the_allowed_tools_on_the_command_line() {
            let (outcome, events) = fixture("echo", "ola mundo", Limits::default());
            assert_eq!(outcome.status, Status::Completed, "{events:?}");
            assert_eq!(outcome.exit_code, Some(0));
            assert_eq!(kinds(&events).first(), Some(&"started"));
            assert_eq!(kinds(&events).last(), Some(&"finished"));
            match &events[0].body {
                EventBody::Started {
                    target,
                    allowed_tools,
                    prompt_chars,
                    ..
                } => {
                    assert_eq!(target, "fixture");
                    assert_eq!(allowed_tools, &["donkey-harness"]);
                    assert_eq!(*prompt_chars, 9);
                }
                other => panic!("primeiro evento deveria ser started: {other:?}"),
            }
            let output = text(&events);
            assert!(
                output.contains("ALLOWED-TOOLS:[donkey-harness]"),
                "{output}"
            );
            assert!(output.contains("ECO:ola mundo"), "{output}");
            assert!(events.windows(2).all(|pair| pair[1].seq == pair[0].seq + 1));
        }

        #[test]
        fn non_zero_exit_is_reported_as_failure() {
            let (outcome, events) = fixture("fail", "oi", Limits::default());
            assert_eq!(outcome.status, Status::Failed);
            assert_eq!(outcome.exit_code, Some(3));
            assert_eq!(error_code(&events), Some(ErrorCode::ExitNonzero));
        }

        #[test]
        fn cannot_reach_files_outside_the_root_through_parent_env_or_args() {
            std::env::set_var("DONKEY_T3B_FAKE_TOKEN", LEAKED_TOKEN);
            let dir = tempfile::tempdir().unwrap();
            let workspace = dir.path().join("projeto");
            fs::create_dir(&workspace).unwrap();
            fs::write(workspace.join("segredo-t3b.txt"), SECRET).unwrap();
            let base = SandboxBase::open(&dir.path().join("exec"), &[workspace.as_path()]).unwrap();
            let personal = std::env::var_os("USERPROFILE").map(PathBuf::from);
            let planted = personal
                .as_ref()
                .map(|home| home.join("donkey-t3b-escapou.txt"));
            let planted_before = planted.as_ref().is_some_and(|path| path.exists());

            let request = request("fixture", "escape", "oi");
            let (outcome, events) = collect(Some(&FIXTURE), &base, &request, Limits::default());
            let output = text(&events);

            assert_eq!(outcome.status, Status::Completed, "{output}");
            assert!(output.contains("FIM"), "{output}");
            assert!(
                !output.contains(SECRET),
                "a fixture leu o segredo:\n{output}"
            );
            assert!(
                !output.contains(LEAKED_TOKEN),
                "token do pai chegou ao processo"
            );
            assert_eq!(entries(&workspace), ["segredo-t3b.txt"]);
            if let Some(planted) = &planted {
                assert_eq!(planted.exists(), planted_before, "gravou no perfil real");
            }
            let workspace_text = plain(&fs::canonicalize(&workspace).unwrap())
                .to_string_lossy()
                .to_lowercase();
            for key in [
                "USERPROFILE",
                "HOME",
                "APPDATA",
                "LOCALAPPDATA",
                "TEMP",
                "TMP",
            ] {
                let line = output
                    .lines()
                    .find(|line| line.starts_with(&format!("ENV {key}=")))
                    .unwrap_or_else(|| panic!("{key} ausente:\n{output}"));
                assert!(line.contains(&request.run_id), "{line}");
            }
            for line in output
                .lines()
                .filter(|line| line.starts_with("ARG ") || line.starts_with("ENV PATH="))
            {
                let line = line.to_lowercase();
                assert!(!line.contains(&workspace_text), "{line}");
                if let Some(personal) = &personal {
                    assert!(
                        !line.contains(&personal.to_string_lossy().to_lowercase()),
                        "{line}"
                    );
                }
            }
            assert!(!base.path().join(&request.run_id).exists());
        }

        #[test]
        fn process_that_overruns_the_timeout_is_killed() {
            let begin = Instant::now();
            let (outcome, events) = fixture(
                "sleep",
                "oi",
                Limits {
                    timeout: Duration::from_secs(2),
                    ..Limits::default()
                },
            );
            assert_eq!(outcome.status, Status::TimedOut);
            assert_eq!(outcome.exit_code, None);
            assert_eq!(error_code(&events), Some(ErrorCode::Timeout));
            assert!(begin.elapsed() < Duration::from_secs(20));
            assert!(!alive(outcome.pid.unwrap()), "processo ficou órfão");
        }

        #[test]
        fn huge_output_is_capped_and_the_process_is_killed() {
            let max_output = 256 * 1024;
            let (outcome, events) = fixture(
                "flood",
                "oi",
                Limits {
                    max_output,
                    ..Limits::default()
                },
            );
            assert_eq!(outcome.status, Status::OutputLimit);
            assert!(outcome.truncated);
            assert!(outcome.output_bytes as usize <= max_output);
            assert!(text(&events).len() <= max_output);
            assert_eq!(error_code(&events), Some(ErrorCode::OutputLimit));
            assert!(!alive(outcome.pid.unwrap()), "processo ficou órfão");
        }

        #[test]
        fn cancel_kills_the_process() {
            let (_dir, base) = base();
            let request = request("fixture", "sleep", "oi");
            let cancel = AtomicBool::new(false);
            let mut events = Vec::new();
            let outcome = thread::scope(|scope| {
                scope.spawn(|| {
                    thread::sleep(Duration::from_millis(800));
                    cancel.store(true, Ordering::Relaxed);
                });
                run_spec(
                    &FIXTURE,
                    &base,
                    &request,
                    Limits::default(),
                    &cancel,
                    &mut |e| events.push(e),
                )
            });
            assert_eq!(outcome.status, Status::Cancelled);
            assert_eq!(error_code(&events), Some(ErrorCode::Cancelled));
            assert!(!alive(outcome.pid.unwrap()));
        }
    }
}
