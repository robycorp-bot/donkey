use crate::{
    application::{assistant::AssistantService, workspace::WorkspaceService},
    domain::{
        AppResult, ChatMessage, FileDocument, FileEntry, Provider, ProviderStatus, Workspace,
    },
};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub workspace: Arc<WorkspaceService>,
    pub assistant: Arc<AssistantService>,
    pub projects: Arc<crate::infrastructure::project::Projects>,
}
#[tauri::command]
pub async fn get_workspace(state: State<'_, AppState>) -> AppResult<Option<Workspace>> {
    let service = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || service.current())
        .await
        .map_err(|_| "Não foi possível restaurar o projeto.")?
}

#[tauri::command]
pub async fn open_workspace(app: AppHandle, state: State<'_, AppState>) -> AppResult<Workspace> {
    let service = state.workspace.clone();
    let projects = state.projects.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut dialog = app.dialog().file().set_title("Abra a pasta do seu projeto");
        if let Some(window) = app.get_webview_window("main") {
            dialog = dialog.set_parent(&window);
        }
        let selected = dialog
            .blocking_pick_folder()
            .ok_or("Seleção de pasta cancelada.")?;
        let path = selected
            .into_path()
            .map_err(|_| "A pasta selecionada não é um caminho local válido.")?;
        let workspace = service.open(&path)?;
        projects.stop()?;
        Ok(workspace)
    })
    .await
    .map_err(|_| "Não foi possível abrir o seletor de pastas.")?
}

#[tauri::command]
pub async fn list_directory(path: String, state: State<'_, AppState>) -> AppResult<Vec<FileEntry>> {
    let service = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || service.list(&path))
        .await
        .map_err(|_| "Não foi possível listar a pasta.")?
}

#[tauri::command]
pub async fn read_file(path: String, state: State<'_, AppState>) -> AppResult<FileDocument> {
    let service = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || service.read(&path))
        .await
        .map_err(|_| "Não foi possível abrir o arquivo.")?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn save_file(
    path: String,
    content: String,
    original_content: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let service = state.workspace.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || service.save(&path, &content, &original_content))
            .await
            .map_err(|_| "Não foi possível salvar o arquivo.")?;
    if result.is_ok() {
        crate::infrastructure::project::bump_live();
    }
    result
}

#[tauri::command]
pub async fn get_provider_statuses(state: State<'_, AppState>) -> AppResult<Vec<ProviderStatus>> {
    let service = state.assistant.clone();
    tauri::async_runtime::spawn_blocking(move || service.statuses())
        .await
        .map_err(|_| "Não foi possível verificar as configurações de IA.")?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn configure_provider(
    provider: Provider,
    api_key: String,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let service = state.assistant.clone();
    tauri::async_runtime::spawn_blocking(move || service.configure(provider, api_key))
        .await
        .map_err(|_| "Não foi possível configurar o provedor.")?
}

#[tauri::command]
pub async fn remove_provider(provider: Provider, state: State<'_, AppState>) -> AppResult<()> {
    let service = state.assistant.clone();
    tauri::async_runtime::spawn_blocking(move || service.remove(provider))
        .await
        .map_err(|_| "Não foi possível remover a configuração do provedor.")?
}

#[tauri::command]
pub async fn chat(
    provider: Provider,
    model: String,
    messages: Vec<ChatMessage>,
    state: State<'_, AppState>,
) -> AppResult<crate::infrastructure::providers::ChatReply> {
    state.assistant.chat(provider, model, messages).await
}

#[tauri::command]
pub async fn git_status(
    state: State<'_, AppState>,
) -> AppResult<crate::infrastructure::git::GitState> {
    let workspace = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace.with_root(crate::infrastructure::git::status)
    })
    .await
    .map_err(|_| "Não foi possível consultar o Git.")?
}
#[tauri::command]
pub async fn git_action(
    action: String,
    path: Option<String>,
    message: Option<String>,
    branch: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<()> {
    let workspace = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace.with_root(|root| {
            crate::infrastructure::git::action(
                root,
                &action,
                path.as_deref(),
                message.as_deref(),
                branch.as_deref(),
            )
        })
    })
    .await
    .map_err(|_| "A operação Git foi interrompida.")?
}
#[tauri::command]
pub async fn project_scripts(
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::infrastructure::project::Script>> {
    let workspace = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace.with_root(crate::infrastructure::project::scripts)
    })
    .await
    .map_err(|_| "Não foi possível ler os scripts.")?
}
#[tauri::command]
pub async fn project_start(
    kind: String,
    script: Option<String>,
    state: State<'_, AppState>,
) -> AppResult<crate::infrastructure::project::ProjectState> {
    let workspace = state.workspace.clone();
    let projects = state.projects.clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace.with_root(|root| projects.start(root, &kind, script.as_deref()))
    })
    .await
    .map_err(|_| "Não foi possível iniciar o projeto.")?
}
#[tauri::command]
pub async fn project_state(
    state: State<'_, AppState>,
) -> AppResult<crate::infrastructure::project::ProjectState> {
    state.projects.state()
}
#[tauri::command]
pub async fn project_stop(state: State<'_, AppState>) -> AppResult<()> {
    let projects = state.projects.clone();
    tauri::async_runtime::spawn_blocking(move || projects.stop())
        .await
        .map_err(|_| "Não foi possível parar o projeto.")?
}
/// Lets the UI ask open Live Server pages to reload (after git pull, terminal, etc.).
#[tauri::command]
pub fn live_reload() {
    crate::infrastructure::project::bump_live();
}
#[tauri::command]
pub async fn open_preview_browser(url: String) -> AppResult<()> {
    crate::infrastructure::project::open_browser(&url)
}

#[tauri::command]
pub async fn git_diff(
    path: String,
    staged: bool,
    state: State<'_, AppState>,
) -> AppResult<String> {
    let workspace = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || {
        workspace.with_root(|root| crate::infrastructure::git::diff(root, &path, staged))
    })
    .await
    .map_err(|_| "Não foi possível ler as diferenças.")?
}

#[tauri::command]
pub async fn run_terminal(
    command: String,
    state: State<'_, AppState>,
) -> AppResult<crate::infrastructure::terminal::TerminalResult> {
    let workspace = state.workspace.clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Copy the root so a long command does not lock file operations.
        let root = workspace.with_root(|root| {
            crate::infrastructure::filesystem::WorkspaceRoot::select(root.path())
        })?;
        crate::infrastructure::terminal::run(&root, &command)
    })
    .await
    .map_err(|_| "O comando foi interrompido.")?
}

#[tauri::command]
pub async fn model_catalog(
    state: State<'_, AppState>,
) -> AppResult<Vec<crate::infrastructure::providers::CatalogModel>> {
    state.assistant.catalog().await
}
