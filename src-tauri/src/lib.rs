mod application;
mod domain;
mod infrastructure;
mod presentation;

use application::{assistant::AssistantService, workspace::WorkspaceService};
use presentation::{commands, commands::AppState};
use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;
            let assistant = AssistantService::new().map_err(std::io::Error::other)?;
            let workspace = WorkspaceService::default();
            if let Some(path) = std::env::args_os()
                .nth(1)
                .filter(|value| !value.to_string_lossy().starts_with('-'))
            {
                workspace
                    .open(std::path::Path::new(&path))
                    .map_err(std::io::Error::other)?;
            }
            app.manage(AppState {
                workspace: Arc::new(workspace),
                assistant: Arc::new(assistant),
                projects: Arc::new(infrastructure::project::Projects::default()),
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                let state = window.state::<AppState>();
                let _ = state.projects.stop();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_workspace,
            commands::get_workspace,
            commands::list_directory,
            commands::read_file,
            commands::save_file,
            commands::get_provider_statuses,
            commands::configure_provider,
            commands::remove_provider,
            commands::chat,
            commands::git_status,
            commands::git_action,
            commands::project_scripts,
            commands::project_start,
            commands::project_state,
            commands::project_stop,
            commands::open_preview_browser,
            commands::git_diff,
            commands::run_terminal,
            commands::model_catalog,
            commands::live_reload,
        ])
        .run(tauri::generate_context!())
        .expect("Não foi possível iniciar o Coder mega-brain");
}
