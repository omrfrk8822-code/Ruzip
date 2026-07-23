import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export const APP_VERSION = '0.1.5';
export const APP_BUILD = '20260723';
export const GITHUB_URL = 'https://github.com/omrfrk8822-code/Ruzip';
export const DEVELOPER_URL = 'https://github.com/oemerfarukozturk';

export interface ChangelogEntry {
  version: string;
  date: string;
  type: 'major' | 'minor' | 'patch';
  added?: string[];
  changed?: string[];
  fixed?: string[];
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '0.1.5',
    date: '23 Temmuz 2026',
    type: 'patch',
    changed: [
      'Güncelleme kontrolü artık Hakkında penceresinden de yapılabiliyor',
      'Geçmiş sürüm notları GitHub API üzerinden canlı olarak gösteriliyor',
    ],
  },
  {
    version: '0.1.4',
    date: '23 Temmuz 2026',
    type: 'patch',
    added: [
      'Otomatik güncelleme kontrolü: yeni sürüm varsa bildirim gösterilir',
    ],
    fixed: [
      '"RuZip ile Aç" ile ZIP dosyası açılamıyordu (.zip dosyasına tıklayınca boş ekran geliyordu)',
      'Kes/Yapıştır farklı klasörler arasında çalışmıyordu (isim çakışması hatası düzeltildi)',
    ],
  },
  {
    version: '0.1.3',
    date: '19 Temmuz 2026',
    type: 'patch',
    fixed: [
      'Release CI yeniden yazıldı: build işleri paralel, tek release job\'u asset\'leri topluca yükler',
      'Tekrarlanan workflow çalıştırmalarında temiz yeniden yükleme (önceki release silinir)',
      'Tag koruması nedeniyle sürüm artık workflow_dispatch ile oluşturuluyor',
    ],
  },
  {
    version: '0.1.2',
    date: '19 Temmuz 2026',
    type: 'patch',
    fixed: [
      'CI asset upload adımı stabilize edildi',
    ],
  },
  {
    version: '0.1.1',
    date: '19 Temmuz 2026',
    type: 'patch',
    fixed: [
      'Inno Setup kurulumunda RegCreateKeyEx Access Denied hatası giderildi (HKCU kullanıldı)',
    ],
  },
  {
    version: '0.1.0',
    date: '19 Temmuz 2026',
    type: 'minor',
    added: [
      'ZIP oluşturma, açma ve çıkarma',
      'ZIP içi taşıma, kopyalama, yeniden adlandırma',
      'Sürükle-bırak ile ZIP açma ve içi taşıma',
      'Çoklu seçim modu (checkbox)',
      'Kes / Kopyala / Yapıştır desteği',
      'Klasör navigasyonu ve adres çubuğu',
      'Sağ tık context menü',
      'İşlem iptali (progress modal)',
      'Arşiv test aracı',
    ],
  },
];

const BADGE_COLORS: Record<ChangelogEntry['type'], string> = {
  major: '#f38ba8',
  minor: '#89b4fa',
  patch: '#a6e3a1',
};
const BADGE_LABELS: Record<ChangelogEntry['type'], string> = {
  major: 'MAJOR',
  minor: 'MINOR',
  patch: 'PATCH',
};

const LICENSE_TEXT = `MIT Lisansı

Telif Hakkı © 2026 RuZip Katkıda Bulunanlar

Bu yazılımın ve ilgili dokümantasyon dosyalarının ("Yazılım") bir kopyasını
edinen herkese, aşağıdaki koşullara tabi olmak kaydıyla, Yazılım üzerinde
ücret ödemeksizin işlem yapma izni verilmektedir. Bu izin; Yazılımı
kısıtlama olmaksızın kullanma, kopyalama, değiştirme, birleştirme, yayımlama,
dağıtma, alt lisans verme ve/veya satma haklarını kapsamaktadır.

Yazılımın tüm kopyalarına veya önemli bölümlerine yukarıdaki telif hakkı
bildirimi ve bu izin bildirimi dahil edilmelidir.

YAZILIM, HERHANGİ BİR GARANTİ OLMAKSIZIN "OLDUĞU GİBİ" SUNULMAKTADIR.
TİCARİ ELVERİŞLİLİK, BELİRLİ BİR AMACA UYGUNLUK VE İHLAL ETMEME
GARANTİLERİ DAHİL ANCAK BUNLARLA SINIRLI OLMAMAK ÜZERE HİÇBİR AÇIK VEYA
ZIMNİ GARANTİ VERİLMEMEKTEDİR. HİÇBİR DURUMDA YAZARLAR VEYA TELİF HAKKI
SAHİPLERİ; SÖZLEŞME, HAKSIZ FİİL VEYA BAŞKA BİR HUKUKI TEORI KAPSAMINDA
ORTAYA ÇIKAN ZARAR, KAYIP VEYA DİĞER YÜKÜMLÜLÜKLERDEN SORUMLU TUTULAMAZ.`;

type Tab = 'about' | 'info' | 'changelog' | 'license';

const TABS: { key: Tab; label: string }[] = [
  { key: 'info',      label: 'Uygulama'       },
  { key: 'about',     label: 'Hakkında'       },
  { key: 'changelog', label: 'Değişiklikler'  },
  { key: 'license',   label: 'Lisans'         },
];

interface Props { onClose: () => void; }

export default function AboutModal({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('info');
  const [upd, setUpd] = useState<{ checking: boolean; data: { tag: string; url: string; body: string } | null; err: boolean }>({ checking: false, data: null, err: false });
  const [releases, setReleases] = useState<{ tag: string; name: string; body: string }[] | null>(null);
  const [loadingReleases, setLoadingReleases] = useState(false);

  const openLink = async (url: string) => {
    await invoke('open_url', { url });
  };

  const checkUpdate = async () => {
    setUpd({ checking: true, data: null, err: false });
    try {
      const res = await fetch('https://api.github.com/repos/omrfrk8822-code/Ruzip/releases/latest');
      const json = await res.json();
      setUpd({ checking: false, data: { tag: (json.tag_name || '').replace(/^v/, ''), url: json.html_url || '', body: json.body || '' }, err: false });
    } catch {
      setUpd({ checking: false, data: null, err: true });
    }
  };

  const fetchReleases = async () => {
    if (releases !== null || loadingReleases) return;
    setLoadingReleases(true);
    try {
      const res = await fetch('https://api.github.com/repos/omrfrk8822-code/Ruzip/releases?per_page=20');
      const json = await res.json();
      if (Array.isArray(json)) {
        setReleases(json.map((r: any) => ({
          tag: (r.tag_name || '').replace(/^v/, ''),
          name: r.name || r.tag_name || '',
          body: r.body || '',
        })));
      }
    } catch { /* ignore */ }
    setLoadingReleases(false);
  };

  const updateBtnLabel = upd.checking ? 'Kontrol ediliyor...' : upd.data ? 'Tekrar Kontrol Et' : 'Güncellemeleri Kontrol Et';

  // changelog sekmesi açılınca API'den release'leri çek
  useEffect(() => {
    if (tab === 'changelog') fetchReleases();
  }, [tab]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="abt-modal" onClick={e => e.stopPropagation()}>

        {/* Kapat butonu — sağ üst köşe */}
        <button className="abt-close" onClick={onClose} title="Kapat">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        {/* Header */}
        <div className="abt-header">
          <div className="abt-header-glow" />
          <div className="abt-icon-wrap">
            <img src="/ruzip_icon.png" alt="RuZip" style={{ width: 44, height: 44, borderRadius: 10 }} />
          </div>
          <div className="abt-header-text">
            <div className="abt-name">RuZip</div>
            <div className="abt-desc">Türkiye'nin ZIP Arşiv Programı</div>
            <div className="abt-ver-row">
              <span className="abt-ver-badge">v{APP_VERSION}</span>
              <span className="abt-build">© 2026</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="abt-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`abt-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="abt-body">

          {/* ── HAKKINDA ── */}
          {tab === 'about' && (
            <div className="abt-about-wrap">
              <div className="abt-about-hero">
                <div className="abt-about-icon">
                  <img src="/ruzip_icon.png" alt="RuZip" style={{ width: 48, height: 48, borderRadius: 10 }} />
                </div>
                <p className="abt-about-desc">
                  RuZip, Türkiye'de geliştirilen açık kaynaklı bir ZIP arşiv programıdır.
                  Dosyalarınızı sıkıştırıp arşivleyebilir, mevcut ZIP dosyalarını açabilir
                  ve içeriklerini yönetebilirsiniz — hepsi sade ve hızlı bir arayüzle.
                </p>
              </div>

              <div className="abt-feature-grid">
                {[
                  { icon: '📦', title: 'Arşiv Oluştur', desc: 'Dosya ve klasörlerinizden ZIP arşivi oluşturun' },
                  { icon: '📂', title: 'Arşiv Aç', desc: 'ZIP dosyalarını açın, içeriğini görüntüleyin' },
                  { icon: '⬇️', title: 'Çıkar', desc: 'Arşiv içindeki dosyaları dışarı çıkarın' },
                  { icon: '✂️', title: 'Düzenle', desc: 'Arşiv içinde taşı, kopyala, yeniden adlandır' },
                  { icon: '🖱️', title: 'Sürükle & Bırak', desc: 'Dosyaları sürükleyerek arşive ekleyin' },
                  { icon: '⚡', title: 'Hızlı & Hafif', desc: 'Rust ile yazılmış, düşük kaynak kullanımı' },
                ].map(f => (
                  <div key={f.title} className="abt-feature-card">
                    <span className="abt-feature-icon">{f.icon}</span>
                    <div>
                      <div className="abt-feature-title">{f.title}</div>
                      <div className="abt-feature-desc">{f.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── UYGULAMA ── */}
          {tab === 'info' && (
            <>
              <div className="abt-info-grid">
                <div className="abt-info-cell">
                  <div className="abt-info-label">Sürüm</div>
                  <div className="abt-info-val accent">{APP_VERSION}</div>
                </div>
                <div className="abt-info-cell">
                  <div className="abt-info-label">Lisans</div>
                  <div className="abt-info-val">MIT</div>
                </div>
                <div className="abt-info-cell">
                  <div className="abt-info-label">Yayın Tarihi</div>
                  <div className="abt-info-val">23 Temmuz 2026</div>
                </div>
                <div className="abt-info-cell">
                  <div className="abt-info-label">Geliştirici</div>
                  <div className="abt-info-val">
                    <a
                      className="abt-link-inline"
                      href={DEVELOPER_URL}
                      target="_blank"
                      rel="noreferrer"
                      onClick={e => {
                        e.preventDefault();
                        openLink(DEVELOPER_URL);
                      }}
                    >
                      omrfrk8822-code
                    </a>
                  </div>
                </div>
              </div>

              <div className="abt-section-title">Bağlantılar</div>
              <div className="abt-links">
                <a
                  className="abt-link-btn"
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={e => {
                    e.preventDefault();
                    openLink(GITHUB_URL);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836a9.59 9.59 0 012.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                  </svg>
                  GitHub'da İncele
                </a>
              </div>

              <div className="abt-section-title">Güncellemeler</div>
              <div className="abt-update">
                <button className="btn btn-secondary" onClick={checkUpdate} disabled={upd.checking}>
                  {upd.checking && <span className="abt-spinner" />}
                  {updateBtnLabel}
                </button>
                {upd.data && (() => {
                  const d = upd.data;
                  return (
                    <div className={`abt-upd-result ${d.tag > APP_VERSION ? 'outdated' : 'latest'}`}>
                      {d.tag > APP_VERSION ? (
                        <>
                          <strong>Yeni sürüm v{d.tag} mevcut!</strong>
                          <a className="abt-upd-link" href={d.url} target="_blank" rel="noreferrer"
                            onClick={e => { e.preventDefault(); openLink(d.url); }}>
                            İndir
                          </a>
                        </>
                      ) : (
                        <strong>En son sürümü kullanıyorsunuz.</strong>
                      )}
                    </div>
                  );
                })()}
                {upd.err && <div className="abt-upd-result error">Kontrol başarısız. İnternet bağlantınızı kontrol edin.</div>}
              </div>
            </>
          )}

          {/* ── DEĞİŞİKLİKLER ── */}
          {tab === 'changelog' && (
            <div className="abt-changelog">
              {loadingReleases && <div className="abt-cl-loading">Yükleniyor...</div>}
              {releases && releases.map(r => (
                <div key={r.tag} className="abt-cl-entry">
                  <div className="abt-cl-head">
                    <span className="abt-cl-ver">v{r.tag}</span>
                    <span className="abt-cl-type" style={{ color: '#89b4fa', borderColor: '#89b4fa55', background: '#89b4fa18' }}>API</span>
                  </div>
                  <div className="abt-cl-api-body" dangerouslySetInnerHTML={{ __html: r.body.replace(/\n/g, '<br>') }} />
                </div>
              ))}
              {releases && <div className="abt-cl-sep">Geçmiş Sürümler</div>}
              {CHANGELOG.map(entry => (
                <div key={entry.version} className="abt-cl-entry">
                  <div className="abt-cl-head">
                    <span className="abt-cl-ver">v{entry.version}</span>
                    <span className="abt-cl-type" style={{ color: BADGE_COLORS[entry.type], borderColor: BADGE_COLORS[entry.type] + '55', background: BADGE_COLORS[entry.type] + '18' }}>
                      {BADGE_LABELS[entry.type]}
                    </span>
                    <span className="abt-cl-date">{entry.date}</span>
                  </div>
                  {entry.added && (
                    <div className="abt-cl-group">
                      <div className="abt-cl-group-label added">Eklendi</div>
                      <ul className="abt-cl-list">{entry.added.map((n, i) => <li key={i}>{n}</li>)}</ul>
                    </div>
                  )}
                  {entry.changed && (
                    <div className="abt-cl-group">
                      <div className="abt-cl-group-label changed">Değişti</div>
                      <ul className="abt-cl-list">{entry.changed.map((n, i) => <li key={i}>{n}</li>)}</ul>
                    </div>
                  )}
                  {entry.fixed && (
                    <div className="abt-cl-group">
                      <div className="abt-cl-group-label fixed">Düzeltildi</div>
                      <ul className="abt-cl-list">{entry.fixed.map((n, i) => <li key={i}>{n}</li>)}</ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── LİSANS ── */}
          {tab === 'license' && (
            <div className="abt-license">
              <div className="abt-license-header">
                <span className="abt-license-badge">MIT</span>
                <span className="abt-license-year">© 2026 RuZip Katkıda Bulunanlar</span>
              </div>
              <pre className="abt-license-text">{LICENSE_TEXT}</pre>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="abt-footer">
          <span>RuZip v{APP_VERSION}</span>
          <span className="abt-footer-dot" />
          <span>Tauri v2 + Rust + React</span>
          <span className="abt-footer-dot" />
          <span>MIT Lisansı</span>
        </div>

      </div>
    </div>
  );
}
