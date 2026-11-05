use std::{
    fs::{self, File, Metadata},
    io::{Read, Write},
    path::{Component, Path, PathBuf},
};

use crate::domain::{AppResult, FileDocument, FileEntry, MAX_FILE_BYTES};

/// The selected root is established by a native folder picker, never by IPC input.
#[derive(Debug)]
pub struct WorkspaceRoot(PathBuf);

impl WorkspaceRoot {
    pub fn select(path: &Path) -> AppResult<Self> {
        reject_links(path)?;
        let root = fs::canonicalize(path).map_err(|_| "Não foi possível abrir esta pasta.")?;
        if !root.is_dir() {
            return Err("Selecione uma pasta para abrir o projeto.".into());
        }
        Ok(Self(root))
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    /// Resolve and inspect both the supplied path and its canonical target.
    pub fn resolve(&self, supplied: &str) -> AppResult<PathBuf> {
        if supplied.is_empty() || supplied.len() > 32_768 {
            return Err("Caminho de arquivo inválido.".into());
        }
        let supplied = Path::new(supplied);
        for component in supplied.components() {
            match component {
                Component::ParentDir => return Err("O caminho não pode sair do projeto.".into()),
                Component::Normal(name) => {
                    if name.to_string_lossy().contains(':') {
                        return Err("Caminho de arquivo inválido.".into());
                    }
                }
                _ => {}
            }
        }
        let candidate = if supplied.is_absolute() {
            supplied.to_owned()
        } else {
            self.0.join(supplied)
        };
        reject_links(&candidate)?;
        let canonical = fs::canonicalize(&candidate)
            .map_err(|_| "Arquivo ou pasta não encontrado no projeto.")?;
        if !canonical.starts_with(&self.0) {
            return Err("Acesso negado: o caminho está fora do projeto aberto.".into());
        }
        Ok(canonical)
    }

    pub fn list(&self, supplied: &str) -> AppResult<Vec<FileEntry>> {
        let directory = self.resolve(supplied)?;
        if !directory.is_dir() {
            return Err("O caminho informado não é uma pasta.".into());
        }
        let reader = fs::read_dir(&directory).map_err(|_| "Não foi possível ler esta pasta.")?;
        let mut entries = Vec::new();
        for (index, entry) in reader.enumerate() {
            let entry = entry.map_err(|_| "Não foi possível ler uma entrada da pasta.")?;
            if index >= 10_000 {
                return Err("Esta pasta tem mais de 10 mil entradas. Abra uma pasta menor.".into());
            }
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|_| "Não foi possível verificar uma entrada da pasta.")?;
            if is_link(&metadata) || !(metadata.is_dir() || metadata.is_file()) {
                continue;
            }
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            entries.push(FileEntry {
                name,
                path: display_path(&entry.path()),
                is_directory: metadata.is_dir(),
            });
        }
        entries.sort_by(|a, b| {
            b.is_directory
                .cmp(&a.is_directory)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then_with(|| a.name.cmp(&b.name))
        });
        Ok(entries)
    }

    pub fn read(&self, supplied: &str) -> AppResult<FileDocument> {
        let path = self.resolve(supplied)?;
        let content = read_text(&path)?;
        Ok(FileDocument {
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            language: language_for(&path).into(),
            path: display_path(&path),
            content,
        })
    }

    /// Replace an existing text file only if the version the editor opened is current.
    pub fn save(&self, supplied: &str, content: &str, original: &str) -> AppResult<()> {
        validate_text(content.as_bytes())?;
        if original.len() as u64 > MAX_FILE_BYTES {
            return Err("A versão original excede o limite de 2 MiB.".into());
        }
        let path = self.resolve(supplied)?;
        let current = read_text(&path)?;
        if current != original {
            return Err("Conflito: este arquivo mudou no disco. Reabra o arquivo antes de salvar para preservar a outra versão.".into());
        }
        let permissions = fs::metadata(&path)
            .map_err(|_| "Não foi possível verificar o arquivo antes de salvar.")?
            .permissions();
        if permissions.readonly() {
            return Err(
                "Este arquivo está somente para leitura. Ajuste suas permissões antes de salvar."
                    .into(),
            );
        }
        let parent = path.parent().ok_or("Pasta de destino inválida.")?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent)
            .map_err(|_| "Não foi possível criar o arquivo temporário para salvar.")?;
        temporary
            .write_all(content.as_bytes())
            .and_then(|_| temporary.as_file().sync_all())
            .map_err(|_| "Não foi possível gravar o arquivo temporário.")?;
        temporary
            .as_file()
            .set_permissions(permissions)
            .map_err(|_| "Não foi possível preservar as permissões do arquivo.")?;
        // Re-check immediately before the atomic replacement, including sandbox scope.
        let rechecked = self.resolve(supplied)?;
        if rechecked != path || read_text(&path)? != original {
            return Err(
                "Conflito: o arquivo mudou durante o salvamento. Reabra antes de salvar.".into(),
            );
        }
        temporary
            .persist(&path)
            .map_err(|_| "Não foi possível substituir o arquivo. Verifique suas permissões.")?;
        Ok(())
    }
}

pub fn display_path(path: &Path) -> String {
    let value = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(unc) = value.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{unc}");
        }
        if let Some(local) = value.strip_prefix(r"\\?\") {
            return local.to_owned();
        }
    }
    value.into_owned()
}

fn read_text(path: &Path) -> AppResult<String> {
    let file = File::open(path).map_err(|_| "Não foi possível ler este arquivo.")?;
    let metadata = file
        .metadata()
        .map_err(|_| "Não foi possível verificar este arquivo.")?;
    if !metadata.is_file() {
        return Err("Abra um arquivo de texto, não uma pasta ou dispositivo.".into());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("Este arquivo ultrapassa o limite de edição de 2 MiB.".into());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "Não foi possível concluir a leitura deste arquivo.")?;
    validate_text(&bytes)?;
    String::from_utf8(bytes).map_err(|_| "Este arquivo não é texto UTF-8. Arquivos binários e outras codificações ainda não são editáveis.".into())
}

fn validate_text(bytes: &[u8]) -> AppResult<()> {
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("Este arquivo ultrapassa o limite de edição de 2 MiB.".into());
    }
    if bytes
        .iter()
        .any(|byte| *byte == 0 || (*byte < 0x20 && !matches!(*byte, b'\n' | b'\r' | b'\t' | 0x0c)))
    {
        return Err("Arquivos binários não podem ser editados nesta versão.".into());
    }
    Ok(())
}

fn reject_links(path: &Path) -> AppResult<()> {
    for ancestor in path.ancestors() {
        let metadata = fs::symlink_metadata(ancestor)
            .map_err(|_| "Não foi possível verificar o caminho solicitado.")?;
        if is_link(&metadata) {
            return Err("Links simbólicos e junções não são abertos por segurança.".into());
        }
    }
    Ok(())
}

fn is_link(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        metadata.file_type().is_symlink() || metadata.file_attributes() & 0x400 != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn language_for(path: &Path) -> &'static str {
    if path.file_name().is_some_and(|name| name == "Dockerfile") {
        return "dockerfile";
    }
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "ts" | "tsx" => "typescript",
        "js" | "jsx" | "mjs" | "cjs" => "javascript",
        "json" | "jsonc" => "json",
        "rs" => "rust",
        "html" | "htm" | "svelte" | "vue" => "html",
        "css" => "css",
        "scss" => "scss",
        "md" | "mdx" => "markdown",
        "toml" => "toml",
        "yml" | "yaml" => "yaml",
        "py" => "python",
        "sh" | "bash" | "zsh" => "shell",
        "ps1" => "powershell",
        "xml" | "svg" => "xml",
        "sql" => "sql",
        "go" => "go",
        "java" => "java",
        "c" | "h" => "cpp",
        "cpp" | "hpp" | "cc" => "cpp",
        "cs" => "csharp",
        _ => "plaintext",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sandbox_rejects_outside_and_parent_paths() {
        let root = tempfile::tempdir().unwrap();
        let outside = tempfile::NamedTempFile::new().unwrap();
        let workspace = WorkspaceRoot::select(root.path()).unwrap();
        assert!(workspace.resolve(&display_path(outside.path())).is_err());
        assert!(workspace.resolve("../outside.txt").is_err());
        assert!(workspace.resolve("missing.txt").is_err());
    }

    #[test]
    fn file_save_is_atomic_and_detects_external_changes() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("file.rs");
        fs::write(&path, "\u{feff}original\r\n").unwrap();
        let workspace = WorkspaceRoot::select(directory.path()).unwrap();
        let opened = workspace.read("file.rs").unwrap();
        assert_eq!(opened.language, "rust");
        workspace
            .save("file.rs", "\u{feff}editado\r\n", &opened.content)
            .unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "\u{feff}editado\r\n");
        fs::write(&path, "outro editor").unwrap();
        let error = workspace
            .save("file.rs", "minha edição", "\u{feff}editado\r\n")
            .unwrap_err();
        assert!(error.starts_with("Conflito:"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "outro editor");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn binary_and_large_files_are_rejected() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("binary"), [0, 1, 2]).unwrap();
        fs::write(directory.path().join("encoding"), [0xff, 0xfe]).unwrap();
        fs::write(
            directory.path().join("large"),
            vec![b'a'; MAX_FILE_BYTES as usize + 1],
        )
        .unwrap();
        let workspace = WorkspaceRoot::select(directory.path()).unwrap();
        assert!(workspace.read("binary").is_err());
        assert!(workspace.read("encoding").is_err());
        assert!(workspace.read("large").is_err());
        assert!(workspace.save("binary", "text", "").is_err());
    }

    #[test]
    fn readonly_files_are_preserved_without_leaving_temporary_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("readonly.txt");
        fs::write(&path, "original").unwrap();
        let original_permissions = fs::metadata(&path).unwrap().permissions();
        let mut readonly = original_permissions.clone();
        readonly.set_readonly(true);
        fs::set_permissions(&path, readonly).unwrap();
        let workspace = WorkspaceRoot::select(directory.path()).unwrap();
        let result = workspace.save("readonly.txt", "editado", "original");
        fs::set_permissions(&path, original_permissions).unwrap();
        assert!(result.is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
    }

    #[test]
    fn directory_listing_is_shallow_and_directories_come_first() {
        let directory = tempfile::tempdir().unwrap();
        fs::create_dir(directory.path().join("z-folder")).unwrap();
        fs::write(directory.path().join("z-folder/deep.txt"), "inside").unwrap();
        fs::write(directory.path().join("a.txt"), "file").unwrap();
        let workspace = WorkspaceRoot::select(directory.path()).unwrap();
        let entries = workspace.list(&display_path(workspace.path())).unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "z-folder");
        assert!(entries[0].is_directory);
        assert_eq!(workspace.list("z-folder").unwrap().len(), 1);
    }

    #[cfg(unix)]
    #[test]
    fn sandbox_rejects_symlinks_even_when_they_point_inside() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("real.txt"), "inside").unwrap();
        std::os::unix::fs::symlink(
            directory.path().join("real.txt"),
            directory.path().join("link.txt"),
        )
        .unwrap();
        let workspace = WorkspaceRoot::select(directory.path()).unwrap();
        assert!(workspace.read("link.txt").is_err());
        assert_eq!(
            workspace
                .list(&display_path(workspace.path()))
                .unwrap()
                .len(),
            1
        );
    }

    #[cfg(windows)]
    #[test]
    fn sandbox_rejects_directory_junctions() {
        let directory = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        fs::write(outside.path().join("secret.txt"), "outside").unwrap();
        let junction = directory.path().join("junction");
        // A Windows junction does not require Developer Mode or elevated symlink privileges.
        let status = std::process::Command::new("cmd")
            .args(["/C", "mklink", "/J"])
            .arg(&junction)
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(status.status.success(), "could not create test junction");
        let workspace = WorkspaceRoot::select(directory.path()).unwrap();
        assert!(workspace
            .read(&display_path(&junction.join("secret.txt")))
            .is_err());
        assert_eq!(
            workspace
                .list(&display_path(workspace.path()))
                .unwrap()
                .len(),
            0
        );
        fs::remove_dir(junction).unwrap();
    }
}
