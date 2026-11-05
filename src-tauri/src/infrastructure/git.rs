use crate::{
    domain::AppResult,
    infrastructure::{filesystem::WorkspaceRoot, process::capture},
};
use serde::Serialize;
use std::{
    path::{Component, Path},
    process::Command,
    time::Duration,
};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub previous_path: Option<String>,
    pub index: String,
    pub worktree: String,
}
#[derive(Serialize)]
pub struct Commit {
    pub hash: String,
    pub subject: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitState {
    pub available: bool,
    pub repository: bool,
    pub branch: String,
    pub branches: Vec<String>,
    pub changes: Vec<Change>,
    pub commits: Vec<Commit>,
    pub remote: bool,
    pub remote_url: String,
    pub ahead: u32,
    pub behind: u32,
}

fn run(root: &Path, args: &[&str]) -> AppResult<Vec<u8>> {
    let mut command = Command::new("git");
    command
        .arg("--literal-pathspecs")
        .arg("-C")
        .arg(root)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_PAGER", "cat");
    capture(command, Duration::from_secs(90))
}
fn text(root: &Path, args: &[&str]) -> AppResult<String> {
    Ok(String::from_utf8_lossy(&run(root, args)?).trim().to_owned())
}
fn require_repo(root: &WorkspaceRoot) -> AppResult<()> {
    let top = text(root.path(), &["rev-parse", "--show-toplevel"])?;
    let canonical =
        std::fs::canonicalize(top).map_err(|_| "Não foi possível identificar a raiz Git.")?;
    if canonical != root.path() {
        return Err("Abra a pasta raiz do repositório para usar o Git neste editor.".into());
    }
    Ok(())
}
pub fn status(root: &WorkspaceRoot) -> AppResult<GitState> {
    let empty = |available| GitState {
        available,
        repository: false,
        branch: String::new(),
        branches: vec![],
        changes: vec![],
        commits: vec![],
        remote: false,
        remote_url: String::new(),
        ahead: 0,
        behind: 0,
    };
    if text(root.path(), &["--version"]).is_err() {
        return Ok(empty(false));
    }
    if text(root.path(), &["rev-parse", "--is-inside-work-tree"]).is_err() {
        return Ok(empty(true));
    }
    require_repo(root)?;
    let branch = text(root.path(), &["symbolic-ref", "--short", "HEAD"])
        .or_else(|_| text(root.path(), &["rev-parse", "--short", "HEAD"]))?;
    let branches = text(root.path(), &["branch", "--format=%(refname:short)"])?
        .lines()
        .map(str::to_owned)
        .collect();
    let changes = parse_status(&run(
        root.path(),
        &["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    )?);
    let commits = text(root.path(), &["log", "-8", "--format=%h%x1f%s"])
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            line.split_once('\x1f').map(|(hash, subject)| Commit {
                hash: hash.into(),
                subject: subject.into(),
            })
        })
        .collect();
    let remote = text(root.path(), &["remote"])?
        .lines()
        .any(|line| line == "origin");
    let remote_url = if remote {
        redact_url(&text(root.path(), &["remote", "get-url", "origin"]).unwrap_or_default())
    } else {
        String::new()
    };
    let (ahead, behind) = text(
        root.path(),
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .ok()
    .and_then(|counts| {
        let mut parts = counts.split_whitespace().map(|n| n.parse::<u32>().ok());
        Some((parts.next()??, parts.next()??))
    })
    .unwrap_or((0, 0));
    Ok(GitState {
        available: true,
        repository: true,
        branch,
        branches,
        changes,
        commits,
        remote,
        remote_url,
        ahead,
        behind,
    })
}

/// Never show tokens embedded in a remote URL (https://user:token@host/...).
fn redact_url(url: &str) -> String {
    match (url.find("://"), url.find('@')) {
        (Some(scheme), Some(at)) if at > scheme => {
            format!("{}{}", &url[..scheme + 3], &url[at + 1..])
        }
        _ => url.to_owned(),
    }
}

/// Unified diff of one file, staged or working tree. Untracked files show as new.
pub fn diff(root: &WorkspaceRoot, path: &str, staged: bool) -> AppResult<String> {
    require_repo(root)?;
    check_path(path)?;
    let output = if staged {
        text(root.path(), &["diff", "--no-color", "--cached", "--", path])?
    } else {
        text(root.path(), &["diff", "--no-color", "--", path])?
    };
    if !output.is_empty() || staged {
        return Ok(output);
    }
    let file = root.path().join(path);
    match std::fs::read(&file) {
        Ok(bytes) if bytes.len() <= 512 * 1024 => {
            let content = String::from_utf8_lossy(&bytes);
            let body: Vec<String> = content.lines().map(|l| format!("+{l}")).collect();
            Ok(format!(
                "--- /dev/null\n+++ b/{path}\n@@ arquivo novo @@\n{}",
                body.join("\n")
            ))
        }
        Ok(_) => Ok("Arquivo novo grande demais para exibir.".into()),
        Err(_) => Ok(String::new()),
    }
}
pub fn parse_status(bytes: &[u8]) -> Vec<Change> {
    let mut records = bytes.split(|c| *c == 0);
    let mut result = vec![];
    while let Some(record) = records.next() {
        if record.len() < 4 {
            continue;
        }
        let index = record[0] as char;
        let worktree = record[1] as char;
        let path = String::from_utf8_lossy(&record[3..]).into_owned();
        let previous_path = if matches!(index, 'R' | 'C') || matches!(worktree, 'R' | 'C') {
            records
                .next()
                .map(|p| String::from_utf8_lossy(p).into_owned())
        } else {
            None
        };
        result.push(Change {
            path,
            previous_path,
            index: index.to_string(),
            worktree: worktree.to_string(),
        });
    }
    result
}
fn check_path(path: &str) -> AppResult<()> {
    if path.is_empty()
        || path.contains('\0')
        || path.contains(':')
        || Path::new(path).is_absolute()
        || Path::new(path)
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err("Caminho Git inválido.".into());
    }
    Ok(())
}
pub fn action(
    root: &WorkspaceRoot,
    action: &str,
    path: Option<&str>,
    message: Option<&str>,
    branch: Option<&str>,
) -> AppResult<()> {
    if action == "init" {
        if text(root.path(), &["rev-parse", "--is-inside-work-tree"]).is_ok() {
            require_repo(root)?;
            return Ok(());
        }
        run(root.path(), &["init"])?;
        return Ok(());
    }
    require_repo(root)?;
    match action {
        "stage" | "unstage" => {
            let path = path.ok_or("Escolha um arquivo.")?;
            check_path(path)?;
            let current = status(root)?;
            let change = current
                .changes
                .iter()
                .find(|item| item.path == path)
                .ok_or("O arquivo não está na lista atual de alterações.")?;
            let previous = change.previous_path.as_deref();
            if let Some(previous) = previous {
                check_path(previous)?;
            }
            if action == "stage" {
                let mut args = vec!["add", "--", path];
                if let Some(previous) = previous {
                    args.push(previous);
                }
                run(root.path(), &args)?;
            } else if text(root.path(), &["rev-parse", "--verify", "HEAD"]).is_ok() {
                let mut args = vec!["restore", "--staged", "--", path];
                if let Some(previous) = previous {
                    args.push(previous);
                }
                run(root.path(), &args)?;
            } else {
                run(root.path(), &["rm", "--cached", "--", path])?;
            }
        }
        "stage_all" => {
            run(root.path(), &["add", "--all"])?;
        }
        "remote" => {
            let url = message.unwrap_or("").trim();
            let valid = (url.starts_with("https://") || url.starts_with("git@"))
                && url.len() <= 500
                && !url.chars().any(|c| c.is_whitespace() || c.is_control());
            if !valid {
                return Err(
                    "Informe a URL do repositório (https://github.com/usuario/repo.git).".into(),
                );
            }
            let exists = text(root.path(), &["remote"])?
                .lines()
                .any(|line| line == "origin");
            if exists {
                run(root.path(), &["remote", "set-url", "origin", url])?;
            } else {
                run(root.path(), &["remote", "add", "origin", url])?;
            }
        }
        "sync" => {
            run(root.path(), &["pull", "--ff-only"])?;
            let branch = text(root.path(), &["symbolic-ref", "--short", "HEAD"])?;
            run(root.path(), &["push", "--set-upstream", "origin", &branch])?;
        }
        "commit" => {
            let message = message.unwrap_or("").trim();
            if message.is_empty() || message.len() > 8000 {
                return Err("Escreva uma mensagem de commit de até 8 mil caracteres.".into());
            }
            run(root.path(), &["commit", "-m", message])?;
        }
        "branch" | "switch" => {
            let branch = branch.unwrap_or("");
            if branch.is_empty() || branch.len() > 200 {
                return Err("Informe o nome da branch.".into());
            }
            run(root.path(), &["check-ref-format", "--branch", branch])?;
            if action == "branch" {
                run(root.path(), &["switch", "--create", branch])?;
            } else {
                run(root.path(), &["switch", "--", branch])?;
            }
        }
        "push" => {
            let branch = text(root.path(), &["symbolic-ref", "--short", "HEAD"])?;
            run(root.path(), &["push", "--set-upstream", "origin", &branch])?;
        }
        "pull" => {
            run(root.path(), &["pull", "--ff-only"])?;
        }
        "fetch" => {
            run(root.path(), &["fetch", "origin"])?;
        }
        _ => return Err("Operação Git desconhecida.".into()),
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_renames_spaces_and_unicode() {
        let changes = parse_status(
            " M pasta/ação com espaço.ts\0R  novo.ts\0antigo.ts\0?? novo arquivo\0".as_bytes(),
        );
        assert_eq!(changes.len(), 3);
        assert_eq!(changes[0].path, "pasta/ação com espaço.ts");
        assert_eq!(changes[1].previous_path.as_deref(), Some("antigo.ts"));
    }
    #[test]
    fn git_workflow_preserves_unstaged_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        action(&root, "init", None, None, None).unwrap();
        run(root.path(), &["config", "user.name", "Teste local"]).unwrap();
        run(
            root.path(),
            &["config", "user.email", "teste@example.invalid"],
        )
        .unwrap();
        std::fs::write(dir.path().join("um.txt"), "um").unwrap();
        std::fs::write(dir.path().join("dois.txt"), "dois").unwrap();
        action(&root, "stage", Some("um.txt"), None, None).unwrap();
        action(&root, "unstage", Some("um.txt"), None, None).unwrap();
        assert!(dir.path().join("um.txt").exists());
        action(&root, "stage", Some("um.txt"), None, None).unwrap();
        action(&root, "commit", None, Some("Primeiro commit"), None).unwrap();
        let original_branch = status(&root).unwrap().branch;
        assert_eq!(status(&root).unwrap().changes.len(), 1);
        action(&root, "branch", None, None, Some("teste-pessoal")).unwrap();
        assert_eq!(status(&root).unwrap().branch, "teste-pessoal");
        action(&root, "switch", None, None, Some(&original_branch)).unwrap();
        let remote = tempfile::tempdir().unwrap();
        run(remote.path(), &["init", "--bare"]).unwrap();
        run(
            root.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        )
        .unwrap();
        action(&root, "push", None, None, None).unwrap();
        action(&root, "fetch", None, None, None).unwrap();
        action(&root, "pull", None, None, None).unwrap();
        assert!(check_path("../fora").is_err());
    }

    fn repo() -> (tempfile::TempDir, WorkspaceRoot) {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        action(&root, "init", None, None, None).unwrap();
        run(root.path(), &["config", "user.name", "Teste"]).unwrap();
        run(root.path(), &["config", "user.email", "t@example.invalid"]).unwrap();
        (dir, root)
    }

    #[test]
    fn redact_url_hides_embedded_credentials_only() {
        assert_eq!(
            redact_url("https://user:ghp_secret@github.com/a/b.git"),
            "https://github.com/a/b.git"
        );
        assert_eq!(
            redact_url("git@github.com:a/b.git"),
            "git@github.com:a/b.git"
        );
        assert_eq!(redact_url(""), "");
    }

    #[test]
    fn stage_all_then_commit_clears_changes() {
        let (dir, root) = repo();
        std::fs::write(dir.path().join("a.txt"), "a").unwrap();
        std::fs::create_dir(dir.path().join("pasta")).unwrap();
        std::fs::write(dir.path().join("pasta/b.txt"), "b").unwrap();
        action(&root, "stage_all", None, None, None).unwrap();
        let state = status(&root).unwrap();
        assert_eq!(state.changes.len(), 2);
        assert!(state.changes.iter().all(|c| c.index == "A"));
        action(&root, "commit", None, Some("tudo"), None).unwrap();
        let state = status(&root).unwrap();
        assert!(state.changes.is_empty());
        assert_eq!(state.commits[0].subject, "tudo");
    }

    #[test]
    fn commit_message_is_required_and_limited() {
        let (_dir, root) = repo();
        assert!(action(&root, "commit", None, Some("   "), None).is_err());
        let huge = "x".repeat(8001);
        assert!(action(&root, "commit", None, Some(&huge), None).is_err());
    }

    #[test]
    fn diff_shows_working_tree_staged_and_new_files() {
        let (dir, root) = repo();
        std::fs::write(dir.path().join("a.txt"), "linha 1\n").unwrap();
        action(&root, "stage_all", None, None, None).unwrap();
        action(&root, "commit", None, Some("base"), None).unwrap();
        std::fs::write(dir.path().join("a.txt"), "linha 1\nlinha 2\n").unwrap();
        let working = diff(&root, "a.txt", false).unwrap();
        assert!(working.contains("+linha 2"));
        assert_eq!(diff(&root, "a.txt", true).unwrap(), "");
        action(&root, "stage", Some("a.txt"), None, None).unwrap();
        assert!(diff(&root, "a.txt", true).unwrap().contains("+linha 2"));
        std::fs::write(dir.path().join("novo.txt"), "oi").unwrap();
        let new_file = diff(&root, "novo.txt", false).unwrap();
        assert!(new_file.contains("arquivo novo") && new_file.contains("+oi"));
        assert!(diff(&root, "../fora.txt", false).is_err());
    }

    #[test]
    fn remote_is_validated_added_and_replaced_without_leaking_tokens() {
        let (_dir, root) = repo();
        for bad in [
            "",
            "ftp://x/y.git",
            "https://github.com/a b.git",
            "file:///c:/repo",
        ] {
            assert!(
                action(&root, "remote", None, Some(bad), None).is_err(),
                "{bad}"
            );
        }
        action(
            &root,
            "remote",
            None,
            Some("https://github.com/eu/um.git"),
            None,
        )
        .unwrap();
        let state = status(&root).unwrap();
        assert!(state.remote);
        assert_eq!(state.remote_url, "https://github.com/eu/um.git");
        action(
            &root,
            "remote",
            None,
            Some("https://eu:token123@github.com/eu/dois.git"),
            None,
        )
        .unwrap();
        let state = status(&root).unwrap();
        assert_eq!(state.remote_url, "https://github.com/eu/dois.git");
    }

    #[test]
    fn ahead_and_behind_follow_the_upstream() {
        let (dir, root) = repo();
        let remote = tempfile::tempdir().unwrap();
        run(remote.path(), &["init", "--bare"]).unwrap();
        run(
            root.path(),
            &["remote", "add", "origin", remote.path().to_str().unwrap()],
        )
        .unwrap();
        std::fs::write(dir.path().join("a.txt"), "1").unwrap();
        action(&root, "stage_all", None, None, None).unwrap();
        action(&root, "commit", None, Some("um"), None).unwrap();
        action(&root, "push", None, None, None).unwrap();
        assert_eq!(
            (status(&root).unwrap().ahead, status(&root).unwrap().behind),
            (0, 0)
        );
        std::fs::write(dir.path().join("a.txt"), "2").unwrap();
        action(&root, "stage_all", None, None, None).unwrap();
        action(&root, "commit", None, Some("dois"), None).unwrap();
        assert_eq!(status(&root).unwrap().ahead, 1);
        action(&root, "sync", None, None, None).unwrap();
        assert_eq!(status(&root).unwrap().ahead, 0);
    }

    #[test]
    fn unknown_actions_and_invalid_branches_are_rejected() {
        let (_dir, root) = repo();
        assert!(action(&root, "reset-hard", None, None, None).is_err());
        assert!(action(&root, "branch", None, None, Some("nome com espaço")).is_err());
        assert!(action(&root, "branch", None, None, Some("")).is_err());
    }

    #[test]
    fn folders_without_git_report_not_a_repository() {
        let dir = tempfile::tempdir().unwrap();
        let root = WorkspaceRoot::select(dir.path()).unwrap();
        let state = status(&root).unwrap();
        assert!(state.available && !state.repository);
        assert!(diff(&root, "a.txt", false).is_err());
    }
}
