use std::sync::{Arc, atomic::AtomicBool};
use serde::{Deserialize, Serialize};

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
    pub child_count: usize,
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
