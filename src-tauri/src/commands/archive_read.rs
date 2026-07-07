use std::fs::{self, File};
use std::io;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use zip::ZipArchive;
use tauri::{AppHandle, Emitter, State};
use tokio::task;
use crate::commands::types::{CancelFlag, Progress, ZipEntry, ZipInfo};

#[tauri::command]
pub async fn list_zip(path: String) -> Result<ZipInfo, String> {
    task::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        let mut total_size = 0u64;
        let mut total_compressed = 0u64;

        let mut all_names: Vec<String> = Vec::new();
        for i in 0..archive.len() {
            if let Ok(e) = archive.by_index_raw(i) {
                all_names.push(e.name().to_string());
            }
        }

        for i in 0..archive.len() {
            let entry = archive.by_index_raw(i).map_err(|e| e.to_string())?;
            let size = entry.size();
            let compressed = entry.compressed_size();
            let ratio = if size > 0 {
                let pct = (compressed * 100).saturating_div(size);
                if pct >= 100 { 0u8 } else { (100 - pct) as u8 }
            } else { 0 };
            let modified = entry.last_modified()
                .map(|t| format!("{:04}-{:02}-{:02} {:02}:{:02}", t.year(), t.month(), t.day(), t.hour(), t.minute()))
                .unwrap_or_else(|| "-".to_string());
            let entry_name = entry.name().to_string();
            let is_dir = entry.is_dir();
            let child_count = if is_dir {
                let prefix = if entry_name.ends_with('/') { entry_name.clone() } else { entry_name.clone() + "/" };
                all_names.iter().filter(|n| {
                    n.starts_with(&prefix) && n.len() > prefix.len() && {
                        let rest = &n[prefix.len()..];
                        !rest.trim_end_matches('/').contains('/')
                    }
                }).count()
            } else { 0 };

            total_size += size;
            total_compressed += compressed;
            entries.push(ZipEntry {
                name: entry_name.split('/').filter(|s| !s.is_empty()).last().unwrap_or(&entry_name).to_string(),
                path: entry_name,
                size,
                compressed_size: compressed,
                is_dir,
                modified,
                ratio,
                encrypted: entry.encrypted(),
                child_count,
            });
        }
        Ok(ZipInfo { entries, total_size, total_compressed })
    }).await.map_err(|e| e.to_string())?
}

fn extract_entry_inner(archive: &mut ZipArchive<File>, i: usize, output_dir: &str, password: Option<&str>) -> Result<(), String> {
    let out_path = {
        let entry = archive.by_index_raw(i).map_err(|e| e.to_string())?;
        PathBuf::from(output_dir).join(entry.mangled_name())
    };
    if let Some(pw) = password {
        let mut entry = archive.by_index_decrypt(i, pw.as_bytes()).map_err(|e| e.to_string())?;
        if entry.is_dir() { fs::create_dir_all(&out_path).map_err(|e| e.to_string())?; }
        else {
            if let Some(p) = out_path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
            let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    } else {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if entry.is_dir() { fs::create_dir_all(&out_path).map_err(|e| e.to_string())?; }
        else {
            if let Some(p) = out_path.parent() { fs::create_dir_all(p).map_err(|e| e.to_string())?; }
            let mut out = File::create(&out_path).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn extract_zip(
    app: AppHandle,
    flag: State<'_, CancelFlag>,
    zip_path: String,
    output_dir: String,
    password: Option<String>,
) -> Result<(), String> {
    flag.0.store(false, Ordering::Relaxed);
    let flag_clone = flag.0.clone();
    task::spawn_blocking(move || {
        let file = File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let total = archive.len();
        for i in 0..total {
            if flag_clone.load(Ordering::Relaxed) {
                let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: true });
                return Err("İptal edildi".to_string());
            }
            let name = archive.by_index_raw(i).map_err(|e| e.to_string())?.name().to_string();
            let _ = app.emit("progress", Progress { current: i + 1, total, file: name, cancelled: false });
            extract_entry_inner(&mut archive, i, &output_dir, password.as_deref())?;
        }
        let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: false });
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn extract_selected(
    app: AppHandle,
    flag: State<'_, CancelFlag>,
    zip_path: String,
    entries: Vec<String>,
    output_dir: String,
    password: Option<String>,
) -> Result<(), String> {
    flag.0.store(false, Ordering::Relaxed);
    let flag_clone = flag.0.clone();
    task::spawn_blocking(move || {
        let file = File::open(&zip_path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let indices: Vec<usize> = (0..archive.len()).filter(|&i| {
            archive.by_index_raw(i).ok()
                .map(|e| entries.iter().any(|sel| e.name().starts_with(sel.as_str())))
                .unwrap_or(false)
        }).collect();
        let total = indices.len();
        for (i, &idx) in indices.iter().enumerate() {
            if flag_clone.load(Ordering::Relaxed) {
                let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: true });
                return Err("İptal edildi".to_string());
            }
            let name = archive.by_index_raw(idx).map_err(|e| e.to_string())?.name().to_string();
            let _ = app.emit("progress", Progress { current: i + 1, total, file: name, cancelled: false });
            extract_entry_inner(&mut archive, idx, &output_dir, password.as_deref())?;
        }
        let _ = app.emit("progress", Progress { current: 0, total: 0, file: String::new(), cancelled: false });
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
