import { useEffect, useRef } from 'react';

export type DialogKind = 'confirm' | 'warning' | 'error' | 'info' | 'input' | 'rename' | 'password';

interface DialogProps {
  kind: DialogKind;
  title: string;
  message: string;
  inputValue?: string;
  onInputChange?: (v: string) => void;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

const styles: Record<DialogKind, { emoji: string; color: string; bg: string; border: string }> = {
  confirm:  { emoji: '❓', color: '#89b4fa', bg: 'rgba(137,180,250,0.08)',  border: 'rgba(137,180,250,0.3)' },
  warning:  { emoji: '⚠️', color: '#f9e2af', bg: 'rgba(249,226,175,0.08)',  border: 'rgba(249,226,175,0.3)' },
  error:    { emoji: '❌', color: '#f38ba8', bg: 'rgba(243,139,168,0.08)',  border: 'rgba(243,139,168,0.3)' },
  info:     { emoji: 'ℹ️', color: '#74c7ec', bg: 'rgba(116,199,236,0.08)',  border: 'rgba(116,199,236,0.3)' },
  input:    { emoji: '✏️', color: '#cba6f7', bg: 'rgba(203,166,247,0.08)',  border: 'rgba(203,166,247,0.3)' },
  rename:   { emoji: '✏️', color: '#cba6f7', bg: 'rgba(203,166,247,0.08)',  border: 'rgba(203,166,247,0.3)' },
  password: { emoji: '🔒', color: '#f9e2af', bg: 'rgba(249,226,175,0.08)',  border: 'rgba(249,226,175,0.3)' },
};

export default function Dialog({
  kind, title, message, inputValue, onInputChange,
  confirmLabel, cancelLabel, onConfirm, onCancel
}: DialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const s = styles[kind];
  const hasInput = kind === 'input' || kind === 'rename' || kind === 'password';

  useEffect(() => {
    if (hasInput && inputRef.current) {
      inputRef.current.focus();
      if (kind !== 'password') inputRef.current.select();
    }
  }, [kind, hasInput]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal dialog-modal"
        onClick={e => e.stopPropagation()}
        style={{ minWidth: 380, maxWidth: 480, borderColor: s.border }}
        onKeyDown={e => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape' && onCancel) onCancel();
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14,
          padding: '10px 14px', background: s.bg, borderRadius: 6, border: `1px solid ${s.border}` }}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>{s.emoji}</span>
          <h3 style={{ color: s.color, margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h3>
        </div>

        {/* Mesaj */}
        <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: hasInput ? 14 : 20 }}>
          {message}
        </p>

        {/* Input */}
        {hasInput && (
          <div className="modal-field" style={{ marginBottom: 20 }}>
            <input
              ref={inputRef}
              type={kind === 'password' ? 'password' : 'text'}
              placeholder={kind === 'password' ? 'Şifresiz bırakmak için boş bırak' : ''}
              value={inputValue || ''}
              onChange={e => onInputChange?.(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') onConfirm();
                if (e.key === 'Escape' && onCancel) onCancel();
              }}
              style={{ borderColor: s.border }}
            />
          </div>
        )}

        {/* Butonlar */}
        <div className="modal-actions">
          {onCancel && (
            <button className="btn btn-secondary" onClick={onCancel}>
              {cancelLabel || 'İptal'}
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            style={
              kind === 'warning' || kind === 'error'
                ? { background: s.color, borderColor: s.color, color: 'var(--bg)' }
                : undefined
            }
          >
            {confirmLabel || 'Tamam'}
          </button>
        </div>
      </div>
    </div>
  );
}
