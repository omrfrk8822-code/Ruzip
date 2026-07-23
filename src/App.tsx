import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import './styles/global.css';
import Toolbar from './components/Toolbar';
import FileList, { ZipEntry } from './components/FileList';
import StatusBar from './components/StatusBar';
import Dialog from './components/Dialog';
import AboutModal, { APP_VERSION } from './components/AboutModal';

interface ZipInfo { entries: ZipEntry[]; total_size: number; total_compressed: number; }
interface ContextMenuState { x: number; y: number; }
interface ProgressEvt { current: number; total: number; file: string; cancelled: boolean; }
interface TestResult { ok: boolean; message: string; details: string[]; }

type ModalType = 'progress' | 'test' | 'newfolder' | 'rename' | 'confirm' | 'error';
interface ModalBaseState {
  type: ModalType;
  title?: string;
  message?: string;
}
type ModalState =
  | (ModalBaseState & { type: 'progress' | 'test' | 'newfolder' })
  | (ModalBaseState & { type: 'confirm'; resolve: (val: boolean) => void })
  | (ModalBaseState & { type: 'error'; resolve: (val: null) => void })
  | (ModalBaseState & { type: 'rename'; resolve: (val: string | null) => void });

export default function App() {
  const [archivePath, setArchivePath] = useState('');
  const [allEntries, setAllEntries] = useState<ZipEntry[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [totalCompressed, setTotalCompressed] = useState(0);
  const [currentFolder, setCurrentFolder] = useState(''); // mevcut klasör yolu
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [checkMode, setCheckMode] = useState(false);
  const [clipboard, setClipboard] = useState<{ paths: string[]; mode: 'cut' | 'copy' } | null>(null);
  const [status, setStatus] = useState('');
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragOverUp, setDragOverUp] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [progress, setProgress] = useState<ProgressEvt | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ latest: string; url: string } | null>(null);

  const showStatus = (msg: string) => { setStatus(msg); setTimeout(() => setStatus(''), 3000); };

  const showConfirm = (title: string, msg: string): Promise<boolean> =>
    new Promise(resolve => { setModal({ type: 'confirm', title, message: msg, resolve }); });

  const showError = (msg: string) =>
    new Promise<null>(resolve => { setModal({ type: 'error', title: 'Hata', message: msg, resolve }); });

  const askRename = (current: string): Promise<string | null> =>
    new Promise(resolve => { setModalInput(current); setModal({ type: 'rename', title: 'Yeniden Adlandır', resolve }); });

  // Mevcut klasördeki entry'leri filtrele
  const visibleEntries = allEntries.filter(e => {
    const path = e.path;
    if (!currentFolder) {
      // Kök: sadece ilk seviye (içinde / olmayan veya sadece sonda / olan)
      const withoutTrail = path.endsWith('/') ? path.slice(0, -1) : path;
      return !withoutTrail.includes('/');
    } else {
      const prefix = currentFolder.endsWith('/') ? currentFolder : currentFolder + '/';
      if (!path.startsWith(prefix)) return false;
      const rest = path.slice(prefix.length);
      const withoutTrail = rest.endsWith('/') ? rest.slice(0, -1) : rest;
      return withoutTrail.length > 0 && !withoutTrail.includes('/');
    }
  });

  const loadArchive = useCallback(async (path: string) => {
    try {
      setStatus('Yükleniyor...');
      setAllEntries([]);
      const info: ZipInfo = await invoke('list_zip', { path });
      setArchivePath(path);
      setAllEntries(info.entries);
      setTotalSize(info.total_size);
      setTotalCompressed(info.total_compressed);
      setCurrentFolder('');
      setSelected(new Set());
      setStatus('');
    } catch (e: any) {
      setStatus('');
      setModal({ type: 'error', title: 'Hata', message: String(e), resolve: () => setModal(null) });
    }
  }, []);

  useEffect(() => {
    const unlisten = listen<ProgressEvt>('progress', e => {
      const p = e.payload;
      if (p.total === 0) {
        setProgress(null);
        setModal(m => m?.type === 'progress' ? null : m);
      } else {
        setProgress(p);
        setModal(m => m?.type === 'progress' ? m : { type: 'progress' });
      }
    });
    return () => { unlisten.then(fn => fn()); };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview().onDragDropEvent(ev => {
      if (ev.payload.type === 'over') setDragOver(true);
      else if (ev.payload.type === 'leave') setDragOver(false);
      else if (ev.payload.type === 'drop') {
        setDragOver(false);
        const zip = ev.payload.paths.find(p => p.toLowerCase().endsWith('.zip'));
        if (zip) loadArchive(zip);
      }
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [loadArchive]);

  // "open-file" event — file association (RuZip ile Aç)
  useEffect(() => {
    const unlisten = listen<string>('open-file', e => {
      loadArchive(e.payload);
    });
    return () => { unlisten.then(fn => fn()); };
  }, [loadArchive]);

  // Otomatik güncelleme kontrolü
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch('https://api.github.com/repos/omrfrk8822-code/Ruzip/releases/latest');
        const data = await res.json();
        if (cancelled) return;
        const latestTag = (data.tag_name || '').replace(/^v/, '');
        if (latestTag && latestTag > APP_VERSION) {
          setUpdateInfo({ latest: latestTag, url: data.html_url || `https://github.com/omrfrk8822-code/Ruzip/releases/tag/v${latestTag}` });
        }
      } catch { /* ignore */ }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const blockKeys = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const blocked = (
        e.key === 'F5' ||
        e.key === 'F12' ||
        (e.ctrlKey && key === 'r') ||
        (e.ctrlKey && e.shiftKey && ['i', 'j', 'c', 'r'].includes(key))
      );
      if (blocked) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const closeCtx = () => setContextMenu(null);
    window.addEventListener('keydown', blockKeys, true);
    window.addEventListener('click', closeCtx);
    return () => {
      window.removeEventListener('keydown', blockKeys, true);
      window.removeEventListener('click', closeCtx);
    };
  }, []);

  const handleOpen = async () => {
    const path = await open({ multiple: false, filters: [{ name: 'ZIP Arşivi', extensions: ['zip'] }] });
    if (typeof path === 'string') loadArchive(path);
  };

  const handleNew = async () => {
    const savePath = await save({ filters: [{ name: 'ZIP Arşivi', extensions: ['zip'] }], defaultPath: 'arsiv.zip' });
    if (!savePath) return;
    const files = await open({ multiple: true, directory: false });
    if (!files || (Array.isArray(files) && files.length === 0)) return;
    try {
      await invoke('create_zip', { output: savePath, paths: Array.isArray(files) ? files : [files], password: null });
      await loadArchive(savePath);
      showStatus('Arşiv oluşturuldu.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleZipFolder = async () => {
    const folder = await open({ directory: true, multiple: false });
    if (typeof folder !== 'string') return;
    const folderName = folder.replace(/.*[/\\]/, '');
    const savePath = await save({ filters: [{ name: 'ZIP Arşivi', extensions: ['zip'] }], defaultPath: folderName + '.zip' });
    if (!savePath) return;
    try {
      await invoke('zip_folder', { folderPath: folder, output: savePath, password: null });
      await loadArchive(savePath);
      showStatus('Klasör ziplendi.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleAddFiles = async () => {
    if (!archivePath) return;
    const files = await open({ multiple: true, directory: false });
    if (!files || (Array.isArray(files) && files.length === 0)) return;
    try {
      await invoke('add_to_zip', { zipPath: archivePath, paths: Array.isArray(files) ? files : [files], password: null });
      await loadArchive(archivePath);
      showStatus('Dosyalar eklendi.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleAddFolder = async () => {
    if (!archivePath) return;
    const folder = await open({ directory: true, multiple: false });
    if (typeof folder !== 'string') return;
    try {
      await invoke('add_to_zip', { zipPath: archivePath, paths: [folder], password: null });
      await loadArchive(archivePath);
      showStatus('Klasör eklendi.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleNewFolder = () => {
    if (!archivePath) return;
    setModalInput('');
    setModal({ type: 'newfolder' });
  };

  const confirmNewFolder = async () => {
    const name = modalInput.trim();
    setModal(null);
    if (!name) return;
    const fullPath = currentFolder ? `${currentFolder}/${name}` : name;
    try {
      await invoke('create_folder_in_zip', { zipPath: archivePath, folderName: fullPath });
      await loadArchive(archivePath);
      showStatus(`"${name}" klasörü oluşturuldu.`);
    } catch (e: any) { await showError(String(e)); }
  };

  const handleExtractAll = async () => {
    if (!archivePath) return;
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== 'string') return;
    try {
      await invoke('extract_zip', { zipPath: archivePath, outputDir: dir, password: null });
      showStatus('Tümü çıkarıldı.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleExtractSelected = async () => {
    if (!archivePath || selected.size === 0) return;
    const dir = await open({ directory: true, multiple: false });
    if (typeof dir !== 'string') return;
    try {
      await invoke('extract_selected', { zipPath: archivePath, entries: Array.from(selected), outputDir: dir, password: null });
      showStatus('Seçilenler çıkarıldı.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleDelete = async () => {
    if (!archivePath || selected.size === 0) return;
    const yes = await showConfirm('Sil', `${selected.size} öğe kalıcı olarak silinsin mi?`);
    if (!yes) return;
    try {
      await invoke('delete_from_zip', { zipPath: archivePath, entriesToDelete: Array.from(selected) });
      setSelected(new Set());
      setCheckMode(false);
      await loadArchive(archivePath);
      showStatus('Silindi.');
    } catch (e: any) { if (String(e) !== 'İptal edildi') await showError(String(e)); }
  };

  const handleTest = async () => {
    if (!archivePath) return;
    setModal({ type: 'test' });
    setTestResult(null);
    try {
      const info: ZipInfo = await invoke('list_zip', { path: archivePath });
      const ratio = info.total_size > 0 ? Math.round(100 - (info.total_compressed * 100 / info.total_size)) : 0;
      setTestResult({
        ok: true, message: 'Arşiv sağlıklı, tüm dosyalar erişilebilir.',
        details: [
          `Toplam dosya: ${info.entries.filter(e => !e.is_dir).length}`,
          `Toplam klasör: ${info.entries.filter(e => e.is_dir).length}`,
          `Şifreli dosya: ${info.entries.filter(e => e.encrypted).length}`,
          `Toplam boyut: ${formatBytes(info.total_size)}`,
          `Sıkıştırılmış: ${formatBytes(info.total_compressed)}`,
          `Genel oran: %${ratio}`,
        ],
      });
    } catch (e: any) {
      setTestResult({ ok: false, message: 'Arşiv bozuk veya okunamıyor.', details: [String(e)] });
    }
  };

  // Çift tıkla: klasöre gir veya dosyayı aç
  const handleDoubleClick = async (entry: ZipEntry) => {
    if (entry.is_dir) {
      const newPath = entry.path.endsWith('/') ? entry.path.slice(0, -1) : entry.path;
      setCurrentFolder(newPath);
      setSelected(new Set());
      return;
    }
    try {
      const tmpDir = await invoke<string>('get_temp_dir');
      await invoke('extract_selected', { zipPath: archivePath, entries: [entry.path], outputDir: tmpDir, password: null });
      const base = tmpDir.replace(/[/\\]$/, '');
      const entryPath = entry.path.replace(/\//g, '\\');
      await invoke('open_file', { path: base + '\\' + entryPath });
    } catch (e: any) { await showError(String(e)); }
  };

  // Üst klasöre çık
  const handleGoUp = () => {
    if (!currentFolder) return;
    const parts = currentFolder.split('/');
    parts.pop();
    setCurrentFolder(parts.join('/'));
    setSelected(new Set());
  };

  const handleRename = async () => {
    if (!archivePath || selected.size !== 1) return;
    const entry = allEntries.find(e => selected.has(e.path));
    if (!entry) return;
    const newName = await askRename(entry.name);
    if (!newName || newName === entry.name) return;
    try {
      await invoke('rename_in_zip', { zipPath: archivePath, oldPath: entry.path, newName });
      await loadArchive(archivePath);
      showStatus(`"${entry.name}" → "${newName}" olarak yeniden adlandırıldı.`);
    } catch (e: any) { await showError(String(e)); }
  };

  const handleMoveInZip = async (srcPath: string, destFolder: string) => {
    if (!archivePath) return;
    try {
      await invoke('move_in_zip', { zipPath: archivePath, srcPath, destFolder });
      await loadArchive(archivePath);
      showStatus('Taşındı.');
    } catch (e: any) { await showError(String(e)); }
  };

  const handleCut = () => {
    if (selected.size === 0) return;
    setClipboard({ paths: Array.from(selected), mode: 'cut' });
    showStatus(`${selected.size} öğe kesildi.`);
  };

  const handleCopy = () => {
    if (selected.size === 0) return;
    setClipboard({ paths: Array.from(selected), mode: 'copy' });
    showStatus(`${selected.size} öğe kopyalandı.`);
  };

  const handlePaste = async () => {
    if (!archivePath || !clipboard) return;
    try {
      for (const srcPath of clipboard.paths) {
        if (clipboard.mode === 'cut') {
          await invoke('move_in_zip', { zipPath: archivePath, srcPath, destFolder: currentFolder });
        } else {
          await invoke('copy_in_zip', { zipPath: archivePath, srcPath, destFolder: currentFolder });
        }
      }
      if (clipboard.mode === 'cut') setClipboard(null);
      await loadArchive(archivePath);
      showStatus('Yapıştırıldı.');
    } catch (e: any) { await showError(String(e)); }
  };

  const handleSelect = (path: string, multi: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (multi) { if (next.has(path)) next.delete(path); else next.add(path); }
      else { if (next.size === 1 && next.has(path)) next.clear(); else { next.clear(); next.add(path); } }
      return next;
    });
  };

  const handleCheckToggle = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  const handleCheckAll = (all: boolean) => {
    setSelected(all ? new Set(visibleEntries.map(e => e.path)) : new Set());
  };

  const handleToggleCheckMode = () => {
    setCheckMode(m => !m);
    setSelected(new Set());
  };

  const handleContextMenu = (e: React.MouseEvent, path: string) => {
    e.preventDefault(); e.stopPropagation();
    if (!selected.has(path)) setSelected(new Set([path]));
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleEmptyContextMenu = (e: React.MouseEvent) => {
    if (!archivePath) return;
    e.preventDefault(); e.stopPropagation();
    setSelected(new Set());
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCancel = async () => {
    await invoke('cancel_operation');
  };

  const confirmModal = () => {
    if (!modal) return;
    if (modal.type === 'confirm') modal.resolve(true);
    else if (modal.type === 'error') modal.resolve(null);
    else if (modal.type === 'rename') modal.resolve(modalInput);
    setModal(null);
  };
  const cancelModal = () => {
    if (!modal) return;
    if (modal.type === 'confirm') modal.resolve(false);
    else if (modal.type === 'error') modal.resolve(null);
    else if (modal.type === 'rename') modal.resolve(null);
    setModal(null);
  };

  const progressPct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // Adres çubuğu yolu
  const breadcrumb = currentFolder
    ? archivePath.split(/[/\\]/).pop() + ' / ' + currentFolder.replace(/\//g, ' / ')
    : archivePath.split(/[/\\]/).pop() || 'Arşiv açılmadı';

  return (
    <>
      <Toolbar
        hasArchive={!!archivePath} hasSelection={selected.size > 0} hasEntries={visibleEntries.length > 0} checkMode={checkMode}
        onOpen={handleOpen} onNew={handleNew} onZipFolder={handleZipFolder}
        onExtractAll={handleExtractAll} onExtractSelected={handleExtractSelected}
        onAddFiles={handleAddFiles} onAddFolder={handleAddFolder} onNewFolder={handleNewFolder}
        onDelete={handleDelete} onTest={handleTest}
        onToggleCheckMode={handleToggleCheckMode} onRename={handleRename}
        onAbout={() => setShowAbout(true)}
      />

      {/* Adres çubuğu + navigasyon */}
      <div className="addressbar">
        <button
          onClick={handleGoUp}
          disabled={!currentFolder}
          onDragOver={e => {
            if (!currentFolder) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setDragOverUp(true);
          }}
          onDragLeave={() => setDragOverUp(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOverUp(false);
            const src = e.dataTransfer.getData('text/plain');
            if (!src || !currentFolder) return;
            const parts = currentFolder.split('/').filter(Boolean);
            parts.pop();
            handleMoveInZip(src, parts.join('/'));
          }}
          style={{
            background: dragOverUp ? 'rgba(137,180,250,0.2)' : 'none',
            border: `1px solid ${dragOverUp ? 'var(--accent)' : currentFolder ? 'var(--border)' : 'transparent'}`,
            borderRadius: 3,
            color: dragOverUp ? 'var(--accent)' : currentFolder ? 'var(--text)' : 'var(--border)',
            cursor: currentFolder ? 'pointer' : 'default',
            padding: '2px 8px', fontSize: 13, marginRight: 4, flexShrink: 0,
            transition: 'all 0.1s'
          }}
          title="Üst klasöre çık (veya sürükle bırak)"
        >↑ ..</button>
        <span className="addressbar-label">Konum:</span>
        <div className="addressbar-path">{archivePath ? breadcrumb : 'Arşiv açılmadı'}</div>
      </div>

      {updateInfo && (
        <div className="update-banner">
          <span>Yeni sürüm v{updateInfo.latest} mevcut</span>
          <a className="update-banner-link" href={updateInfo.url} target="_blank" rel="noreferrer"
            onClick={e => { e.preventDefault(); invoke('open_url', { url: updateInfo.url }); }}>
            İndir
          </a>
          <button className="update-banner-close" onClick={() => setUpdateInfo(null)}>✕</button>
        </div>
      )}

      {archivePath ? (
        <FileList
          entries={visibleEntries} selected={selected} checkMode={checkMode}
          cutPaths={new Set(clipboard?.mode === 'cut' ? clipboard.paths : [])}
          onSelect={handleSelect} onCheckToggle={handleCheckToggle} onCheckAll={handleCheckAll}
          onContextMenu={handleContextMenu} onEmptyContextMenu={handleEmptyContextMenu}
          onDoubleClick={handleDoubleClick}
          onDrop={handleMoveInZip} currentFolder={currentFolder}
        />
      ) : (
        <div className={`dropzone ${dragOver ? 'drag-over' : ''}`}>
          <img src="/ruzip_icon.png" alt="RuZip" className="dropzone-logo" />
          <h2>ZIP arşivi aç veya sürükle bırak</h2>
          <p>.zip dosyasını buraya sürükle</p>
          <button className="btn btn-primary" onClick={handleOpen} style={{ marginTop: 8 }}>Dosya Seç</button>
        </div>
      )}

      <StatusBar
        total={visibleEntries.length} selected={selected.size}
        totalSize={totalSize} totalCompressed={totalCompressed}
        archivePath={archivePath} status={status}
      />

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          {selected.size > 0 && (<>
            <div className="context-item" onClick={() => { setContextMenu(null); handleExtractSelected(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v13m-5-5l5 5 5-5" strokeLinecap="round" /></svg>
              Çıkar
            </div>
            <div className="context-item" onClick={() => {
              setContextMenu(null);
              const entry = allEntries.find(e => selected.has(e.path));
              if (entry && !entry.is_dir) handleDoubleClick(entry);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></svg>
              Aç
            </div>
            <div className="context-sep" />
            <div className="context-item" onClick={() => { setContextMenu(null); handleCut(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="6" cy="20" r="2"/><circle cx="6" cy="4" r="2"/><path d="M6 6v10M20 4L8.12 15.88M14.47 14.48L20 20" strokeLinecap="round"/></svg>
              Kes
            </div>
            <div className="context-item" onClick={() => { setContextMenu(null); handleCopy(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" strokeLinecap="round"/></svg>
              Kopyala
            </div>
          </>)}
          <div className={`context-item${!clipboard ? ' disabled-item' : ''}`} onClick={() => { if (!clipboard) return; setContextMenu(null); handlePaste(); }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
            Yapıştır {clipboard ? `(${clipboard.paths.length})` : ''}
          </div>
          {selected.size > 0 && (<>
            <div className="context-sep" />
            <div className="context-item" onClick={() => { setContextMenu(null); handleRename(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round"/></svg>
              Yeniden Adlandır
            </div>
            <div className="context-sep" />
            <div className="context-item danger" onClick={() => { setContextMenu(null); handleDelete(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" /></svg>
              Sil
            </div>
          </>)}
        </div>
      )}

      {/* Dialog Modalleri */}
      {modal?.type === 'confirm' && (
        <Dialog kind="warning" title={modal.title || 'Onayla'}
          message={modal.message || 'Emin misiniz?'}
          confirmLabel="Evet, Sil" cancelLabel="İptal"
          onConfirm={confirmModal} onCancel={cancelModal} />
      )}
      {modal?.type === 'error' && (
        <Dialog kind="error" title="Hata"
          message={modal.message || 'Bir hata oluştu.'}
          confirmLabel="Tamam"
          onConfirm={confirmModal} />
      )}
      {modal?.type === 'rename' && (
        <Dialog kind="rename" title="Yeniden Adlandır"
          message="Yeni adı girin:"
          inputValue={modalInput} onInputChange={setModalInput}
          confirmLabel="Yeniden Adlandır" cancelLabel="İptal"
          onConfirm={confirmModal} onCancel={cancelModal} />
      )}
      {modal?.type === 'newfolder' && (
        <Dialog kind="input" title="Yeni Klasör Oluştur"
          message={currentFolder ? `Konum: ${currentFolder}` : 'Kök dizinde oluşturulacak'}
          inputValue={modalInput} onInputChange={setModalInput}
          confirmLabel="Oluştur" cancelLabel="İptal"
          onConfirm={confirmNewFolder} onCancel={() => setModal(null)} />
      )}

      {/* Progress Modal */}
      {modal?.type === 'progress' && progress && (
        <div className="modal-overlay">
          <div className="modal" style={{ minWidth: 440 }}>
            <h3>İşlem devam ediyor...</h3>
            <div style={{ margin: '16px 0 8px', fontSize: 12, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>{progress.file}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{progressPct}%</span>
            </div>
            <div style={{ width: '100%', height: 12, background: 'var(--bg3)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'linear-gradient(90deg, #89b4fa, #74c7ec)', borderRadius: 6, transition: 'width 0.15s', boxShadow: '0 0 8px #89b4fa66' }} />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{progress.current} / {progress.total} dosya</span>
              <span />
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-secondary" onClick={handleCancel} style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>
                ✕ İptal Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Modal */}
      {modal?.type === 'test' && (
        <div className="modal-overlay" onClick={() => testResult && setModal(null)}>
          <div className="modal" style={{ minWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3>Arşiv Test Sonucu</h3>
            {!testResult ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text2)' }}>
                <div style={{ marginBottom: 12 }}>Test ediliyor...</div>
                <div style={{ width: '100%', height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: '60%', background: 'var(--accent)', borderRadius: 3 }} />
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: testResult.ok ? 'rgba(166,227,161,0.1)' : 'rgba(243,139,168,0.1)', border: `1px solid ${testResult.ok ? 'rgba(166,227,161,0.3)' : 'rgba(243,139,168,0.3)'}`, borderRadius: 6, marginBottom: 14 }}>
                  <span style={{ fontSize: 20 }}>{testResult.ok ? '✅' : '❌'}</span>
                  <span style={{ color: testResult.ok ? '#a6e3a1' : '#f38ba8', fontWeight: 600 }}>{testResult.message}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {testResult.details.map((d, i) => (
                    <div key={i} style={{ fontSize: 12, color: 'var(--text2)', padding: '5px 10px', background: 'var(--bg3)', borderRadius: 4 }}>{d}</div>
                  ))}
                </div>
                <div className="modal-actions">
                  <button className="btn btn-primary" onClick={() => setModal(null)}>Tamam</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}

    </>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
