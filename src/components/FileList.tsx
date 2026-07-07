import { useState, useRef } from 'react';

export interface ZipEntry {
  name: string;
  path: string;
  size: number;
  compressed_size: number;
  is_dir: boolean;
  modified: string;
  ratio: number;
  encrypted: boolean;
  child_count: number;
}

interface FileListProps {
  entries: ZipEntry[];
  selected: Set<string>;
  checkMode: boolean;
  cutPaths: Set<string>;
  onSelect: (path: string, multi: boolean) => void;
  onCheckToggle: (path: string) => void;
  onCheckAll: (all: boolean) => void;
  onContextMenu: (e: React.MouseEvent, path: string) => void;
  onEmptyContextMenu: (e: React.MouseEvent) => void;
  onDoubleClick: (entry: ZipEntry) => void;
  onDrop: (srcPath: string, destFolder: string) => void;
  currentFolder: string;
}

type SortKey = 'name' | 'size' | 'compressed_size' | 'ratio' | 'modified';

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase() : 'Dosya';
}

function ratioColor(ratio: number): string {
  if (ratio >= 70) return '#a6e3a1';
  if (ratio >= 40) return '#89b4fa';
  if (ratio >= 20) return '#f9e2af';
  return '#f38ba8';
}

function RatioBar({ ratio }: { ratio: number }) {
  const color = ratioColor(ratio);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative', width: 52, height: 10, background: 'var(--bg3)', borderRadius: 5, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${ratio}%`, background: color, borderRadius: 5, boxShadow: `0 0 6px ${color}88` }} />
      </div>
      <span style={{ color, fontWeight: 600, fontSize: 12, minWidth: 32 }}>{ratio}%</span>
    </div>
  );
}

function FileIcon({ isDir, name }: { isDir: boolean; name: string }) {
  if (isDir) return (
    <svg className="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="#f9e2af" stroke="none">
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
    </svg>
  );
  const ext = name.split('.').pop()?.toLowerCase();
  const color = ext === 'zip' ? '#89b4fa' : ext === 'exe' ? '#f38ba8' : ext === 'pdf' ? '#fab387' : ext === 'jpg' || ext === 'png' || ext === 'gif' ? '#a6e3a1' : ext === 'mp3' || ext === 'mp4' ? '#cba6f7' : '#a6adc8';
  return (
    <svg className="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export default function FileList({
  entries, selected, checkMode, cutPaths,
  onSelect, onCheckToggle, onCheckAll,
  onContextMenu, onEmptyContextMenu, onDoubleClick, onDrop, currentFolder
}: FileListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const dragSrc = useRef<string | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(a => !a);
    else { setSortKey(key); setSortAsc(true); }
  };

  const sorted = [...entries].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'size') cmp = a.size - b.size;
    else if (sortKey === 'compressed_size') cmp = a.compressed_size - b.compressed_size;
    else if (sortKey === 'ratio') cmp = a.ratio - b.ratio;
    else if (sortKey === 'modified') cmp = a.modified.localeCompare(b.modified);
    return sortAsc ? cmp : -cmp;
  });

  const arrow = (key: SortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';
  const allChecked = entries.length > 0 && entries.every(e => selected.has(e.path));

  return (
    <div
      className="filelist-container"
      onContextMenu={e => {
        if ((e.target as HTMLElement).closest('tr')) return;
        onEmptyContextMenu(e);
      }}
    >
      <table className="filelist-table">
        <thead>
          <tr>
            {checkMode && (
              <th className="col-check">
                <input type="checkbox" checked={allChecked} onChange={e => onCheckAll(e.target.checked)} />
              </th>
            )}
            <th className="col-name" onClick={() => handleSort('name')}>Ad{arrow('name')}</th>
            <th className="col-size" onClick={() => handleSort('size')}>Boyut{arrow('size')}</th>
            <th className="col-compressed" onClick={() => handleSort('compressed_size')}>Sıkıştırılmış{arrow('compressed_size')}</th>
            <th className="col-ratio" onClick={() => handleSort('ratio')}>Oran{arrow('ratio')}</th>
            <th className="col-modified" onClick={() => handleSort('modified')}>Değiştirilme{arrow('modified')}</th>
            <th className="col-type">Tür / Detay</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(entry => (
            <tr
              key={entry.path}
              className={[
                selected.has(entry.path) ? 'selected' : '',
                dragOverPath === entry.path && entry.is_dir ? 'drag-target' : '',
                cutPaths.has(entry.path) ? 'cut-item' : '',
              ].filter(Boolean).join(' ')}
              onClick={e => {
                if (checkMode) onCheckToggle(entry.path);
                else onSelect(entry.path, e.ctrlKey || e.metaKey);
              }}
              onDoubleClick={() => !checkMode && onDoubleClick(entry)}
              onContextMenu={e => onContextMenu(e, entry.path)}
              draggable={!checkMode}
              onDragStart={e => {
                dragSrc.current = entry.path;
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', entry.path);
              }}
              onDragOver={e => {
                if (entry.is_dir && dragSrc.current !== entry.path) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setDragOverPath(entry.path);
                }
              }}
              onDragLeave={() => setDragOverPath(null)}
              onDrop={e => {
                e.preventDefault();
                setDragOverPath(null);
                if (dragSrc.current && entry.is_dir && dragSrc.current !== entry.path) {
                  onDrop(dragSrc.current, entry.path);
                  dragSrc.current = null;
                }
              }}
              onDragEnd={() => { dragSrc.current = null; setDragOverPath(null); }}
            >
              {checkMode && (
                <td className="col-check" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(entry.path)} onChange={() => onCheckToggle(entry.path)} />
                </td>
              )}
              <td>
                <FileIcon isDir={entry.is_dir} name={entry.name} />
                {entry.name}
                {entry.encrypted && (
                  <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px', background: 'rgba(243,139,168,0.15)', color: '#f38ba8', border: '1px solid rgba(243,139,168,0.4)', borderRadius: 3, verticalAlign: 'middle', fontWeight: 600 }}>🔒 ŞİFRELİ</span>
                )}
                {entry.is_dir && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)', opacity: 0.7 }}>→</span>
                )}
              </td>
              <td className="col-size" style={{ textAlign: 'right' }}>
                {entry.is_dir ? '' : formatSize(entry.size)}
              </td>
              <td className="col-compressed" style={{ textAlign: 'right' }}>
                {entry.is_dir ? '' : formatSize(entry.compressed_size)}
              </td>
              <td className="col-ratio">
                {!entry.is_dir && entry.size > 0 && <RatioBar ratio={entry.ratio} />}
              </td>
              <td>{entry.modified}</td>
              <td style={{ color: 'var(--text2)', fontSize: 11 }}>
                {entry.is_dir
                  ? <span style={{ color: '#f9e2af' }}>📁 {entry.child_count > 0 ? `${entry.child_count} öğe` : 'Klasör'}</span>
                  : getExt(entry.name)
                }
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr onContextMenu={onEmptyContextMenu}>
              <td colSpan={checkMode ? 7 : 6} style={{ textAlign: 'center', padding: '32px', color: 'var(--text2)', fontSize: 13, cursor: 'default' }}>
                {currentFolder ? 'Bu klasör boş' : 'Arşiv boş'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
