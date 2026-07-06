interface ToolbarProps {
  hasArchive: boolean;
  hasSelection: boolean;
  checkMode: boolean;
  onOpen: () => void;
  onNew: () => void;
  onExtractAll: () => void;
  onExtractSelected: () => void;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onZipFolder: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onTest: () => void;
  onToggleCheckMode: () => void;
  onRename: () => void;
}

function Btn({ label, title, disabled, active, onClick, children }: {
  label: string; title: string; disabled?: boolean; active?: boolean;
  onClick?: () => void; children: React.ReactNode;
}) {
  return (
    <button
      className={`toolbar-btn${disabled ? ' disabled' : ''}${active ? ' active' : ''}`}
      onClick={disabled ? undefined : onClick}
      title={title}
    >
      {children}{label}
    </button>
  );
}

export default function Toolbar({
  hasArchive, hasSelection, checkMode,
  onOpen, onNew, onExtractAll, onExtractSelected,
  onAddFiles, onAddFolder, onZipFolder, onNewFolder,
  onDelete, onTest, onToggleCheckMode, onRename
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <Btn label="Yeni" title="Yeni ZIP arşivi oluştur" onClick={onNew}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 4v16m8-8H4" strokeLinecap="round"/>
        </svg>
      </Btn>

      <Btn label="Aç" title="ZIP arşivi aç" onClick={onOpen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
        </svg>
      </Btn>

      <Btn label="Klasör Zip" title="Klasör seç ve zipple" onClick={onZipFolder}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          <path d="M12 11v4m-2-2h4" strokeLinecap="round"/>
        </svg>
      </Btn>

      <div className="toolbar-sep" />

      <Btn label="Dosya Ekle" title="Arşive dosya ekle" disabled={!hasArchive} onClick={onAddFiles}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <path d="M14 2v6h6M12 11v6m-3-3h6" strokeLinecap="round"/>
        </svg>
      </Btn>

      <Btn label="Klasör Ekle" title="Arşive klasör ekle" disabled={!hasArchive} onClick={onAddFolder}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          <path d="M12 11v4m-2-2h4" strokeLinecap="round"/>
        </svg>
      </Btn>

      <Btn label="Yeni Klasör" title="Arşiv içinde klasör oluştur" disabled={!hasArchive} onClick={onNewFolder}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/>
          <path d="M9 13h6M12 10v6" strokeLinecap="round"/>
        </svg>
      </Btn>

      <div className="toolbar-sep" />

      <Btn label="Tümünü Çıkar" title="Tümünü çıkar" disabled={!hasArchive} onClick={onExtractAll}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M12 3v13m-5-5l5 5 5-5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 19h18" strokeLinecap="round"/>
        </svg>
      </Btn>

      <Btn label="Çıkar" title="Seçilenleri çıkar" disabled={!hasSelection} onClick={onExtractSelected}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M8 3v13m-3-5l3 5 3-5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M14 8h6M14 12h4M14 16h2" strokeLinecap="round"/>
        </svg>
      </Btn>

      <div className="toolbar-sep" />

      <Btn label="Yeniden Adlandır" title="Seçili öğeyi yeniden adlandır" disabled={!hasSelection} onClick={onRename}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" strokeLinecap="round"/>
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" strokeLinecap="round"/>
        </svg>
      </Btn>

      <Btn label="Sil" title="Seçilenleri sil" disabled={!hasSelection} onClick={onDelete}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Btn>

      <Btn label="Test" title="Arşivi test et" disabled={!hasArchive} onClick={onTest}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="12" r="9"/>
        </svg>
      </Btn>

      <div className="toolbar-sep" />

      <Btn label="Seç" title="Çoklu seçim modunu aç/kapat" active={checkMode} onClick={onToggleCheckMode}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <path d="M7 7l1.5 1.5L11 6" strokeLinecap="round" strokeLinejoin="round"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
      </Btn>
    </div>
  );
}
