use std::fs::{self, File};
use std::io;
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter, CompressionMethod};
use tokio::task;

fn collect_names(src_archive: &mut ZipArchive<File>) -> Result<Vec<String>, String> {
    (0..src_archive.len())
        .map(|i| Ok(src_archive.by_index_raw(i).map_err(|e| e.to_string())?.name().to_string()))
        .collect()
}

#[tauri::command]
pub async fn rename_in_zip(zip_path: String, old_path: String, new_name: String) -> Result<(), String> {
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;

            let old_base = old_path.trim_end_matches('/');
            let parent = old_base.rfind('/').map(|i| &old_base[..=i]).unwrap_or("");
            let new_base = format!("{}{}", parent, new_name);

            // Çakışma kontrolü
            let names = collect_names(&mut src_archive)?;
            for name in &names {
                let check = name.trim_end_matches('/');
                if check == new_base.trim_end_matches('/') && check != old_base {
                    return Err(format!("CONFLICT:{}", new_name));
                }
            }

            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);

            for (i, name) in names.iter().enumerate() {
                let new_entry_name = if name.trim_end_matches('/') == old_base {
                    if name.ends_with('/') { format!("{}/", new_base) } else { new_base.clone() }
                } else if name.starts_with(&format!("{}/", old_base)) {
                    let rest = &name[old_base.len()..];
                    format!("{}{}", new_base, rest)
                } else {
                    let raw = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    dst_zip.raw_copy_file(raw).map_err(|e| e.to_string())?;
                    continue;
                };

                let mut entry = src_archive.by_index(i).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    dst_zip.add_directory(&new_entry_name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
                } else {
                    dst_zip.start_file(&new_entry_name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    io::copy(&mut entry, &mut buf).map_err(|e| e.to_string())?;
                    use std::io::Write;
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

            let src_base = src_path.replace('\\', "/").trim_end_matches('/').to_string();
            let dest_folder = dest_folder.replace('\\', "/").trim_end_matches('/').to_string();
            let file_name = src_base.rsplit('/').next().unwrap_or(&src_base).to_string();
            let target_base = if dest_folder.is_empty() {
                file_name.clone()
            } else {
                format!("{}/{}", dest_folder, file_name)
            };

            // Çakışma kontrolü — otomatik çözüm
            let names = collect_names(&mut src_archive)?;
            let mut final_base = target_base.clone();
            let mut counter = 1;
            loop {
                let conflicted = names.iter().any(|n| {
                    let check = n.trim_end_matches('/');
                    check == final_base.trim_end_matches('/') && check != src_base
                });
                if !conflicted { break; }
                let stem = target_base.trim_end_matches('/');
                let ext = file_name.rsplit('.').next().unwrap_or("");
                if ext == file_name {
                    final_base = format!("{}_{}", stem, counter);
                } else {
                    let base = &file_name[..file_name.len() - ext.len() - 1];
                    let parent = stem.strip_suffix(&file_name).unwrap_or("");
                    final_base = format!("{}{}_{}.{}", parent, base, counter, ext);
                }
                counter += 1;
            }

            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);

            for (i, name) in names.iter().enumerate() {
                let new_name = if name.trim_end_matches('/') == src_base {
                    if name.ends_with('/') { format!("{}/", final_base) } else { final_base.clone() }
                } else if name.starts_with(&format!("{}/", src_base)) {
                    let rest = &name[src_base.len()..];
                    format!("{}{}", final_base, rest)
                } else {
                    let raw = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                    dst_zip.raw_copy_file(raw).map_err(|e| e.to_string())?;
                    continue;
                };

                let mut entry = src_archive.by_index(i).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    dst_zip.add_directory(&new_name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
                } else {
                    dst_zip.start_file(&new_name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    io::copy(&mut entry, &mut buf).map_err(|e| e.to_string())?;
                    use std::io::Write;
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
pub async fn copy_in_zip(zip_path: String, src_path: String, dest_folder: String) -> Result<(), String> {
    task::spawn_blocking(move || {
        let tmp_path = zip_path.clone() + ".tmp";
        {
            let src = File::open(&zip_path).map_err(|e| e.to_string())?;
            let mut src_archive = ZipArchive::new(src).map_err(|e| e.to_string())?;

            let src_base = src_path.replace('\\', "/").trim_end_matches('/').to_string();
            let dest_folder = dest_folder.replace('\\', "/").trim_end_matches('/').to_string();
            let file_name = src_base.rsplit('/').next().unwrap_or(&src_base).to_string();
            let same_folder = src_base == dest_folder
                || src_base == format!("{}/{}", dest_folder, src_base.rsplit('/').next().unwrap_or(""));

            let target_base = if same_folder {
                format!("{}_kopya", file_name)
            } else if dest_folder.is_empty() {
                file_name.clone()
            } else {
                format!("{}/{}", dest_folder, file_name)
            };

            // Çakışma kontrolü — otomatik çözüm
            let names = collect_names(&mut src_archive)?;
            let mut final_base = target_base.clone();
            let mut counter = 1;
            loop {
                let conflicted = names.iter().any(|n| {
                    let check = n.trim_end_matches('/');
                    check == final_base.trim_end_matches('/')
                });
                if !conflicted { break; }
                let stem = target_base.trim_end_matches('/');
                let ext = file_name.rsplit('.').next().unwrap_or("");
                if ext == file_name {
                    final_base = format!("{}_{}", stem, counter);
                } else {
                    let base = &file_name[..file_name.len() - ext.len() - 1];
                    let parent = stem.strip_suffix(&file_name).unwrap_or("");
                    final_base = format!("{}{}_{}.{}", parent, base, counter, ext);
                }
                counter += 1;
            }

            let dst = File::create(&tmp_path).map_err(|e| e.to_string())?;
            let mut dst_zip = ZipWriter::new(dst);

            // Önce tüm mevcut entry'leri kopyala
            for i in 0..src_archive.len() {
                let raw = src_archive.by_index_raw(i).map_err(|e| e.to_string())?;
                dst_zip.raw_copy_file(raw).map_err(|e| e.to_string())?;
            }

            // Sonra seçili entry'leri yeni isimle ekle
            for i in 0..src_archive.len() {
                let name = src_archive.by_index_raw(i).map_err(|e| e.to_string())?.name().to_string();

                let new_name = if name.trim_end_matches('/') == src_base {
                    if name.ends_with('/') { format!("{}/", final_base) } else { final_base.clone() }
                } else if name.starts_with(&format!("{}/", src_base)) {
                    let rest = &name[src_base.len()..];
                    format!("{}{}", final_base, rest)
                } else {
                    continue;
                };

                let mut entry = src_archive.by_index(i).map_err(|e| e.to_string())?;
                if entry.is_dir() {
                    dst_zip.add_directory(&new_name, SimpleFileOptions::default()).map_err(|e| e.to_string())?;
                } else {
                    dst_zip.start_file(&new_name, SimpleFileOptions::default().compression_method(CompressionMethod::Deflated)).map_err(|e| e.to_string())?;
                    let mut buf = Vec::new();
                    io::copy(&mut entry, &mut buf).map_err(|e| e.to_string())?;
                    use std::io::Write;
                    dst_zip.write_all(&buf).map_err(|e| e.to_string())?;
                }
            }
            dst_zip.finish().map_err(|e| e.to_string())?;
        }
        fs::rename(&tmp_path, &zip_path).map_err(|e| e.to_string())?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}
