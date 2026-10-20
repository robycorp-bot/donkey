use crate::{
    domain::{AppResult, FileDocument, FileEntry, Workspace},
    infrastructure::filesystem::{display_path, WorkspaceRoot},
};
use std::{path::Path, sync::Mutex};

#[derive(Default)]
pub struct WorkspaceService {
    selected: Mutex<Option<WorkspaceRoot>>,
}

impl WorkspaceService {
    pub fn current(&self) -> AppResult<Option<Workspace>> {
        let guard = self
            .selected
            .lock()
            .map_err(|_| "Não foi possível acessar o projeto.")?;
        guard
            .as_ref()
            .map(|root| {
                let path = display_path(root.path());
                let entries = root.list(&path)?;
                let name = root
                    .path()
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned();
                Ok(Workspace {
                    name,
                    path,
                    entries,
                })
            })
            .transpose()
    }
    pub fn open(&self, path: &Path) -> AppResult<Workspace> {
        let root = WorkspaceRoot::select(path)?;
        let path = display_path(root.path());
        let entries = root.list(&path)?;
        let name = root
            .path()
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        let mut selected = self
            .selected
            .lock()
            .map_err(|_| "Não foi possível acessar o projeto aberto.")?;
        *selected = Some(root);
        Ok(Workspace {
            name,
            path,
            entries,
        })
    }

    pub fn list(&self, path: &str) -> AppResult<Vec<FileEntry>> {
        self.with_root(|root| root.list(path))
    }

    pub fn read(&self, path: &str) -> AppResult<FileDocument> {
        self.with_root(|root| root.read(path))
    }

    pub fn save(&self, path: &str, content: &str, original: &str) -> AppResult<()> {
        self.with_root(|root| root.save(path, content, original))
    }

    pub fn with_root<T>(
        &self,
        operation: impl FnOnce(&WorkspaceRoot) -> AppResult<T>,
    ) -> AppResult<T> {
        let selected = self
            .selected
            .lock()
            .map_err(|_| "Não foi possível acessar o projeto aberto.")?;
        operation(
            selected
                .as_ref()
                .ok_or("Abra uma pasta de projeto primeiro.")?,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn operations_require_an_explicitly_opened_workspace() {
        let service = WorkspaceService::default();
        assert!(service.list(".").is_err());
        assert!(service.read("file.txt").is_err());
        assert!(service.save("file.txt", "value", "").is_err());
    }
}
