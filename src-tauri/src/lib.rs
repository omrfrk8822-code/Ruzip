mod commands;

use commands::*;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running ruzip");
}
