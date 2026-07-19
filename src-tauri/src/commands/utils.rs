use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipWriter, CompressionMethod};
use tauri::{AppHandle, Emitter, State};
use crate::commands::types::{CancelFlag, Progress};

pub fn collect_files(paths: &[String]) -> Vec<(PathBuf, String)> {
    let mut files = Vec::new();
    for src_path in paths {
        let base = Path::new(src_path).parent().unwrap_or(Path::new(""));
        for entry in WalkDir::new(src_path).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path().to_path_buf();
            let name = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if !name.is_empty() { files.push((path, name)); }
        }
    }
    files
}

pub fn write_files_to_zip(
    zip: &mut ZipWriter<File>,
    files: &[(PathBuf, String)],
    password: &Option<String>,
    app: &AppHandle,
    flag: &Arc<AtomicBool>,
    offset: usize,
    total: usize,
) -> Result<(), String> {
    for (i, (path, name)) in files.iter().enumerate() {
        if flag.load(Ordering::Relaxed) {
            let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: true });
            return Err("İptal edildi".to_string());
        }
        let _ = app.emit("progress", Progress { current: offset + i + 1, total, file: name.clone(), cancelled: false });
        if path.is_dir() {
            zip.add_directory(name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
        } else {
            let options = if let Some(ref pw) = password {
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated).with_aes_encryption(zip::AesMode::Aes256, pw)
            } else {
                SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)
            };
            zip.start_file(name, options).map_err(|e| e.to_string())?;
            let mut f = File::open(path).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn cancel_operation(flag: State<CancelFlag>) {
    flag.0.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub fn get_temp_dir() -> String {
    std::env::temp_dir().to_string_lossy().to_string()
}

#[tauri::command]
pub fn open_file(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(&path, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
}
