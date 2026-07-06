interface StatusBarProps {
  total: number;
  selected: number;
  totalSize: number;
  totalCompressed: number;
  archivePath: string;
  status: string;
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function StatusBar({ total, selected, totalSize, totalCompressed, archivePath, status }: StatusBarProps) {
  const ratio = totalSize > 0 ? Math.round(100 - (totalCompressed * 100 / totalSize)) : 0;
  return (
    <div className="statusbar">
      <span>{total} dosya</span>
      {selected > 0 && <><div className="statusbar-sep" /><span style={{ color: 'var(--accent)' }}>{selected} seçili</span></>}
      <div className="statusbar-sep" />
      <span>Toplam: {fmt(totalSize)}</span>
      <div className="statusbar-sep" />
      <span>Sıkıştırılmış: {fmt(totalCompressed)}</span>
      {totalSize > 0 && <><div className="statusbar-sep" /><span style={{ color: 'var(--green)' }}>Oran: %{ratio}</span></>}
      {archivePath && <><div className="statusbar-sep" /><span style={{ color: 'var(--text2)', fontFamily: 'Consolas', fontSize: '11px' }}>{archivePath}</span></>}
      {status && <><div className="statusbar-sep" /><span style={{ color: 'var(--yellow)' }}>{status}</span></>}
    </div>
  );
}
