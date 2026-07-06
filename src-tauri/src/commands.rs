use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};
use zip::CompressionMethod;
use tauri::{AppHandle, Emitter, State};
use tokio::task;

// Global iptal bayrağı
pub struct CancelFlag(pub Arc<AtomicBool>);

#[derive(Serialize, Deserialize, Clone)]
pub struct ZipEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub compressed_size: u64,
    pub is_dir: bool,
    pub modified: String,
    pub ratio: u8,
    pub encrypted: bool,
    pub child_count: usize,  // klasör içindeki dosya sayısı
}

#[derive(Serialize, Deserialize)]
pub struct ZipInfo {
    pub entries: Vec<ZipEntry>,
    pub total_size: u64,
    pub total_compressed: u64,
}

#[derive(Serialize, Clone)]
pub struct Progress {
    pub current: usize,
    pub total: usize,
    pub file: String,
    pub cancelled: bool,
}

#[tauri::command]
pub fn cancel_operation(flag: State<CancelFlag>) {
    flag.0.store(true, Ordering::Relaxed);
}

#[tauri::command]
pub async fn list_zip(path: String) -> Result<ZipInfo, String> {
    task::spawn_blocking(move || {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        let mut total_size = 0u64;
        let mut total_compressed = 0u64;

        // Önce tüm entry isimlerini topla, klasör içerik sayısı için
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

            // Klasör ise içindeki direkt çocuk sayısını hesapla
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

fn collect_files(paths: &[String]) -> Vec<(PathBuf, String)> {
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

fn write_files_to_zip(
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
                dst_zip.raw_copy_file(src_archive.by_index_raw(i).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
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
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);
            for i in 0..src_archive.len() {
                dst_zip.raw_copy_file(src_archive.by_index_raw(i).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
            }
            let name = if folder_name.ends_with('/') { folder_name.clone() } else { folder_name.clone() + "/" };
            dst_zip.add_directory(&name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn rename_in_zip(zip_path: String, old_path: String, new_name: String) -> Result<(), String> {
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);

            let old_base = old_path.trim_end_matches('/');
            let parent = old_base.rfind('/').map(|i| &old_base[..=i]).unwrap_or("");
            let new_base = format!("{}{}", parent, new_name);

            for i in 0..src_archive.len() {
                let name = {
                    let e = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    e.name().to_string()
                };

                // Bu entry yeniden adlandırılacak mı?
                let new_entry_name = if name == old_base || name == format!("{}/", old_base) {
                    if name.ends_with('/') { format!("{}/", new_base) } else { new_base.clone() }
                } else if name.starts_with(&format!("{}/", old_base)) {
                    let rest = &name[old_base.len()..];
                    format!("{}{}", new_base, rest)
                } else {
                    // Değişmeyecek — raw copy
                    let raw = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    dst_zip.raw_copy_file(raw).map_err(|e| e.to_string())?;
                    continue;
                };

                // Yeniden adlandırılacak entry'yi oku ve yaz
                let mut entry = src_archive.by_index(i).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    dst_zip.add_directory(&new_entry_name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
                } else {
                    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
                    dst_zip.start_file(&new_entry_name, opts).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    io::copy(&mut entry, &mut buf).map_err(|e| e.to_string())?;
                    dst_zip.write_all(&buf).map_err(|e| e.to_string())?;
                }
            }
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn move_in_zip(zip_path: String, src_path: String, dest_folder: String) -> Result<(), String> {
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);

            let src_base = src_path.trim_end_matches('/');
            let file_name = src_base.rsplit('/').next().unwrap_or(src_base);
            let new_base = if dest_folder.is_empty() {
                file_name.to_string()
            } else {
                format!("{}/{}", dest_folder.trim_end_matches('/'), file_name)
            };

            for i in 0..src_archive.len() {
                let name = {
                    let e = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    e.name().to_string()
                };

                let new_name = if name == src_base || name == format!("{}/", src_base) {
                    if name.ends_with('/') { format!("{}/", new_base) } else { new_base.clone() }
                } else if name.starts_with(&format!("{}/", src_base)) {
                    let rest = &name[src_base.len()..];
                    format!("{}{}", new_base, rest)
                } else {
                    let raw = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    dst_zip.raw_copy_file(raw).map_err(|e| e.to_string())?;
                    continue;
                };

                let mut real = src_archive.by_index(i).map_err(|e| e.to_string())?;
                if real.is_dir() {
                    dst_zip.add_directory(&new_name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
                } else {
                    dst_zip.start_file(&new_name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    io::copy(&mut real, &mut buf).map_err(|e| e.to_string())?;
                    dst_zip.write_all(&buf).map_err(|e| e.to_string())?;
                }
            }
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

// Kopyala: src_path'i dest_folder'a kopyalar (orijinal kalır)
#[tauri::command]
pub async fn copy_in_zip(zip_path: String, src_path: String, dest_folder: String) -> Result<(), String> {
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;
            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);

            let src_base = src_path.trim_end_matches('/');
            let file_name = src_base.rsplit('/').next().unwrap_or(src_base);
            let new_base = if dest_folder.is_empty() {
                format!("{}_kopya", file_name)
            } else {
                format!("{}/{}", dest_folder.trim_end_matches('/'), file_name)
            };

            // Önce tüm mevcut entry'leri raw copy et
            for i in 0..src_archive.len() {
                let raw = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                dst_zip.raw_copy_file(raw).map_err(|e| e.to_string())?;
            }

            // Sonra kopyalanacak entry'leri yeni isimle ekle
            for i in 0..src_archive.len() {
                let name = {
                    let e = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    e.name().to_string()
                };

                let new_name = if name == src_base || name == format!("{}/", src_base) {
                    if name.ends_with('/') { format!("{}/", new_base) } else { new_base.clone() }
                } else if name.starts_with(&format!("{}/", src_base)) {
                    let rest = &name[src_base.len()..];
                    format!("{}{}", new_base, rest)
                } else {
                    continue;
                };

                let mut real = src_archive.by_index(i).map_err(|e| e.to_string())?;
                if real.is_dir() {
                    dst_zip.add_directory(&new_name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
                } else {
                    dst_zip.start_file(&new_name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    io::copy(&mut real, &mut buf).map_err(|e| e.to_string())?;
                    dst_zip.write_all(&buf).map_err(|e| e.to_string())?;
                }
            }
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
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
