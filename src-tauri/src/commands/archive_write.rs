use std::fs::{self, File};
use std::sync::atomic::Ordering;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use tauri::{AppHandle, Emitter, State};
use tokio::task;
use crate::commands::types::{CancelFlag, Progress};
use crate::commands::utils::{collect_files, write_files_to_zip};

#[tauri::command]
pub async fn create_zip(
    app: AppHandle,
    flag: State<'_, CancelFlag>,
    output: String,
    paths: Vec<String>,
    password: Option<String>,
) -> Result<(), String> {
    flag.0.store(false, Ordering::Relaxed);
    let flag_clone = flag.0.clone();
    task::spawn_blocking(move || {
        let files = collect_files(&paths);
        let total = files.len();
        let file = File::create(&output).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        let result = write_files_to_zip(&mut zip, &files, &password, &app, &flag_clone, 0, total);
        if result.is_err() { let _ = fs::remove_file(&output); return result; }
        zip.finish().map_err(|e| e.to_string())?;
        let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: false });
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn zip_folder(
    app: AppHandle,
    flag: State<'_, CancelFlag>,
    folder_path: String,
    output: String,
    password: Option<String>,
) -> Result<(), String> {
    flag.0.store(false, Ordering::Relaxed);
    let flag_clone = flag.0.clone();
    task::spawn_blocking(move || {
        let files = collect_files(&[folder_path]);
        let total = files.len();
        let file = File::create(&output).map_err(|e| e.to_string())?;
        let mut zip = ZipWriter::new(file);
        let result = write_files_to_zip(&mut zip, &files, &password, &app, &flag_clone, 0, total);
        if result.is_err() { let _ = fs::remove_file(&output); return result; }
        zip.finish().map_err(|e| e.to_string())?;
        let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: false });
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn add_to_zip(
    app: AppHandle,
    flag: State<'_, CancelFlag>,
    zip_path: String,
    paths: Vec<String>,
    password: Option<String>,
) -> Result<(), String> {
    flag.0.store(false, Ordering::Relaxed);
    let flag_clone = flag.0.clone();
    task::spawn_blocking(move || {
        let new_files = collect_files(&paths);
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;
            let existing = src_archive.len();
            let total = existing + new_files.len();
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);
            for i in 0..existing {
                if flag_clone.load(Ordering::Relaxed) {
                    let _ = fs::remove_file(&tmp_path);
                    let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: true });
                    return Err("İptal edildi".to_string());
                }
                let entry = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                let name = entry.name().to_string();
                let _ = app.emit("progress", Progress { current: i + 1, total, file: name, cancelled: false });
                dst_zip.raw_copy_file(entry).map_err(|e| e.to_string())?;
            }
            let result = write_files_to_zip(&mut dst_zip, &new_files, &password, &app, &flag_clone, existing, total);
            if result.is_err() { let _ = fs::remove_file(&tmp_path); return result; }
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: false });
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_from_zip(
    app: AppHandle,
    flag: State<'_, CancelFlag>,
    zip_path: String,
    entries_to_delete: Vec<String>,
) -> Result<(), String> {
    flag.0.store(false, Ordering::Relaxed);
    let flag_clone = flag.0.clone();
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;
            let total = src_archive.len();
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);
            for i in 0..total {
                if flag_clone.load(Ordering::Relaxed) {
                    let _ = fs::remove_file(&tmp_path);
                    let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: true });
                    return Err("İptal edildi".to_string());
                }
                let name = src_archive.by_index_raw(i).map_err(|e| e.to_string())?.name().to_string();
                let _ = app.emit("progress", Progress { current: i + 1, total, file: name.clone(), cancelled: false });
                if entries_to_delete.iter().any(|d| name.starts_with(d.as_str())) { continue; }
                let entry = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                dst_zip.raw_copy_file(entry).map_err(|e| e.to_string())?;
            }
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: false });
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn create_folder_in_zip(zip_path: String, folder_name: String) -> Result<(), String> {
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;
            let normalized = if folder_name.ends_with('/') { folder_name.clone() } else { folder_name.clone() + "/" };
            // Çakışma kontrolü
            for i in 0..src_archive.len() {
                let name = src_archive.by_index_raw(i).map_err(|e| e.to_string())?.name().to_string();
                if name == normalized || name == folder_name {
                    return Err(format!("CONFLICT:{}", folder_name));
                }
            }
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);
            for i in 0..src_archive.len() {
                dst_zip.raw_copy_file(src_archive.by_index_raw(i).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            }
            dst_zip.add_directory(&normalized, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
