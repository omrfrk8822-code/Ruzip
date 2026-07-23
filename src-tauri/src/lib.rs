mod commands;

use commands::*;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::Emitter;

struct PendingFile(Arc<Mutex<Option<String>>>);

#[tauri::command]
fn take_pending_file(state: tauri::State<'_, PendingFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let pending = Arc::new(Mutex::new(std::env::args().skip(1).find(|a| a.to_lowercase().ends_with(".zip"))));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv {
                if arg.to_lowercase().ends_with(".zip") {
                    let _ = app.emit("open-file", arg.clone());
                }
            }
        }))
        .manage(PendingFile(pending))
        .manage(CancelFlag(Arc::new(AtomicBool::new(false))))
        .invoke_handler(tauri::generate_handler![
            list_zip,
            create_zip,
            add_to_zip,
            extract_zip,
            extract_selected,
            delete_from_zip,
            create_folder_in_zip,
            rename_in_zip,
            move_in_zip,
            copy_in_zip,
            zip_folder,
            get_temp_dir,
            open_file,
            open_url,
            cancel_operation,
            take_pending_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ruzip");
}
