# RuZip — Modern ZIP Arşivleyici

WinRAR tarzı, Tauri v2 + React + TypeScript + Rust ile geliştirilmiş masaüstü ZIP arşivleyici.  
Catppuccin Mocha dark tema, Türkçe arayüz.

---

## Proje Yapısı

```
ruzip/
├── src/                          # React/TypeScript frontend
│   ├── App.tsx                   # Ana uygulama — tüm state ve handler'lar
│   ├── components/
│   │   ├── FileList.tsx          # Dosya listesi tablosu (sıralama, checkbox, drag-drop)
│   │   ├── Toolbar.tsx           # Üst toolbar butonları
│   │   ├── Dialog.tsx            # Custom modal dialog bileşeni
│   │   └── StatusBar.tsx         # Alt durum çubuğu
│   └── styles/
│       └── global.css            # Catppuccin tema, tüm CSS
├── src-tauri/
│   ├── src/
│   │   ├── lib.rs                # Tauri builder, plugin kayıtları, invoke handler listesi
│   │   └── commands.rs           # Tüm Rust backend komutları
│   ├── capabilities/
│   │   └── default.json          # Tauri v2 izin sistemi (dialog, fs, opener)
│   ├── Cargo.toml                # Rust bağımlılıkları
│   └── tauri.conf.json           # Uygulama config (pencere boyutu, productName vs.)
└── installer/
    └── ruzip_setup.iss           # Inno Setup installer scripti
```

---

## Teknoloji Stack

| Katman | Teknoloji |
|--------|-----------|
| Desktop framework | Tauri v2 |
| Backend | Rust |
| Frontend | React 18 + TypeScript |
| Build tool | Vite |
| ZIP işlemleri | `zip` crate v2 (deflate + aes-crypto features) |
| Dosya gezinme | `walkdir` crate |
| Async | `tokio` (rt-multi-thread + macros) |
| Tema | Catppuccin Mocha dark |

---

## Rust Komutları (`commands.rs`)

Her komut `#[tauri::command]` ile işaretli, `lib.rs`'deki `generate_handler![]` listesine kayıtlı olmalı.

### Kayıtlı Komutlar (`lib.rs`)
```rust
list_zip, create_zip, add_to_zip, extract_zip, extract_selected,
delete_from_zip, create_folder_in_zip, rename_in_zip,
move_in_zip, copy_in_zip, zip_folder,
get_temp_dir, open_file, cancel_operation
```

### Komut Detayları

#### `list_zip(path: String) -> Result<ZipInfo, String>`
- ZIP içeriğini listeler, şifreli entry'leri `by_index_raw` ile okur (şifre gerekmez)
- `ZipEntry` struct: `name, path, size, compressed_size, is_dir, modified, ratio, encrypted, child_count`
- `ratio` hesabı: `saturating_div` kullanır (overflow önlemi — compressed > size durumu)
- `child_count`: klasör için direkt çocuk sayısı

#### `create_zip(output, paths, password?) -> Result<(), String>`
- Verilen dosya/klasör listesinden ZIP oluşturur
- `password` varsa AES-256 şifreleme (`zip::AesMode::Aes256`)
- İptal desteği: `CancelFlag` ile

#### `zip_folder(folder_path, output, password?) -> Result<(), String>`
- Tek klasörü ZIP'ler, `create_zip` ile aynı mantık

#### `add_to_zip(zip_path, paths, password?) -> Result<(), String>`
- Mevcut ZIP'e dosya/klasör ekler
- Mevcut entry'leri `raw_copy_file` ile kopyalar (şifreli olanlar korunur)
- Yeni dosyalar `password` ile şifrelenir

#### `extract_zip(zip_path, output_dir, password?) -> Result<(), String>`
- Tüm arşivi çıkarır
- Şifreli entry'ler için `by_index_decrypt` kullanır

#### `extract_selected(zip_path, entries, output_dir, password?) -> Result<(), String>`
- Seçili entry'leri çıkarır (klasör seçilince alt dosyaları da dahil eder — `starts_with` ile)

#### `delete_from_zip(zip_path, entries_to_delete) -> Result<(), String>`
- Seçili entry'leri siler (tmp dosya → rename pattern)
- **BİLİNEN SORUN**: Şifreli arşivde çalışmaz — `archive_password` parametresi eklenmeli

#### `rename_in_zip(zip_path, old_path, new_name) -> Result<(), String>`
- Entry'yi yeniden adlandırır, klasör ise tüm alt entry'leri de günceller
- Borrow fix: önce `by_index_raw` ile name al (scope biter), sonra `by_index` ile oku
- **BİLİNEN SORUN**: Şifreli entry'lerde çalışmaz — `archive_password` parametresi eklenmeli

#### `move_in_zip(zip_path, src_path, dest_folder) -> Result<(), String>`
- ZIP içinde dosya/klasörü taşır
- `dest_folder` boş string → kök dizine taşır
- Borrow fix uygulandı (rename ile aynı pattern)
- **BİLİNEN SORUN**: Şifreli entry'lerde çalışmaz

#### `copy_in_zip(zip_path, src_path, dest_folder) -> Result<(), String>`
- ZIP içinde kopyalar, orijinal kalır
- Aynı dizine kopyalanırsa `_kopya` suffix'i eklenir
- **BİLİNEN SORUN**: Şifreli entry'lerde çalışmaz

#### `create_folder_in_zip(zip_path, folder_name) -> Result<(), String>`
- ZIP içinde klasör oluşturur (trailing `/` ekler)

#### `get_temp_dir() -> String`
- OS temp dizinini döner (dosya açma için geçici çıkarma)

#### `open_file(path: String) -> Result<(), String>`
- `tauri-plugin-opener` ile dosyayı varsayılan uygulamada açar

#### `cancel_operation()`
- `CancelFlag(Arc<AtomicBool>)` state'ini `true` yapar
- Tüm uzun işlemler her iterasyonda bu flag'i kontrol eder

### Önemli Rust Notları
- **Async pattern**: Tüm dosya işlemleri `tokio::task::spawn_blocking` içinde — UI freeze olmaz
- **tmp pattern**: Değişiklik yapan komutlar `zip_path + ".tmp"` oluşturur, işlem bitince `fs::rename` ile değiştirir
- **Borrow checker fix**: `by_index_raw` ile name al → scope biter → `by_index` ile içerik oku (aynı archive'den iki kez borrow yapılamaz)
- **CancelFlag**: `Arc<AtomicBool>` Tauri state olarak yönetilir, `Ordering::Relaxed` yeterli

---

## Frontend Bileşenleri

### `App.tsx`
Ana state yönetimi ve tüm handler'lar burada.

**State:**
```typescript
archivePath: string          // Açık ZIP dosyasının tam yolu
allEntries: ZipEntry[]       // ZIP'teki tüm entry'ler (filtrelenmemiş)
currentFolder: string        // Mevcut gezinilen klasör yolu (kök = "")
selected: Set<string>        // Seçili entry path'leri
checkMode: boolean           // Checkbox seçim modu açık/kapalı
clipboard: { paths, mode }   // Kes/kopyala clipboard'u ('cut' | 'copy')
modal: ModalState | null     // Aktif modal (password/progress/test/newfolder/rename/confirm/error)
modalInput: string           // Modal input alanı değeri
progress: ProgressEvt        // İlerleme bilgisi (Rust'tan event ile gelir)
```

**visibleEntries filtresi:**
- `currentFolder === ""` → kök: path'te `/` içermeyen entry'ler
- `currentFolder !== ""` → prefix ile başlayan, bir seviye derinliğindeki entry'ler

**Modal sistemi:**
- `askPassword(title)` → Promise, modal kapanınca resolve
- `showConfirm(title, msg)` → Promise, "Evet" → resolve(input), "İptal" → resolve(null)
- `showError(msg)` → Promise, sadece Tamam butonu
- `askRename(current)` → Promise, input ile resolve
- `confirmModal()` → `modal.resolve(modalInput)` çağırır
- `cancelModal()` → `modal.resolve(null)` çağırır

**Dosya açma (çift tıklama):**
1. `get_temp_dir` ile temp dizini al
2. `extract_selected` ile temp'e çıkar (ZIP içindeki tam path korunur)
3. `open_file` ile `tmpDir + entry.path` (slash → backslash) aç
- **Kritik fix**: `entry.name` değil `entry.path` kullanılır (klasör içindeki dosyalar için)

**Navigasyon:**
- Klasöre çift tıkla → `setCurrentFolder(entry.path)`
- `↑ ..` butonu → `currentFolder`'dan son segment çıkar
- `↑ ..` butona drag-drop → bir üst dizine taşı (TODO: `dragOverUp` state + `onDragOver/onDrop` eklenmeli)

### `FileList.tsx`
**Props:**
```typescript
entries, selected, checkMode, cutPaths: Set<string>
onSelect, onCheckToggle, onCheckAll
onContextMenu, onEmptyContextMenu
onDoubleClick
onDrop(srcPath, destFolder)   // ZIP içi drag-drop
currentFolder
```

**Drag-drop (ZIP içi):**
- `draggable={!checkMode}` — checkMode'da drag kapalı
- `onDragStart` → `dragSrc.current = entry.path` + `dataTransfer.setData('text/plain', entry.path)`
- `onDragOver` → sadece klasör satırlarında `preventDefault` + `setDragOverPath`
- `onDrop` → `onDrop(dragSrc.current, entry.path)` çağırır
- `drag-target` CSS class → mavi highlight

**Checkbox modu:**
- `col-check` sütunu eklenir (thead'de de checkbox — tümünü seç)
- `cut-item` class → `opacity: 0.45` (kes yapılan öğeler)

**Boş alan sağ tık:**
- `filelist-container`'a `onContextMenu` → `tr` içinde değilse `onEmptyContextMenu` çağırır

### `Dialog.tsx`
**Kind'lar:** `confirm | warning | error | info | input | rename | password`

Her kind için emoji + renk teması:
- `confirm` → ❓ mavi
- `warning` → ⚠️ sarı  
- `error` → ❌ kırmızı
- `info` → ℹ️ cyan
- `input/rename` → ✏️ mor
- `password` → 🔒 sarı

Input alanı: `kind === 'password'` → `type="password"`, diğerleri `type="text"`

### `Toolbar.tsx`
Butonlar: Yeni, Aç, Klasör Zip | Dosya Ekle, Klasör Ekle, Yeni Klasör | Tümünü Çıkar, Çıkar | Yeniden Adlandır, Sil, Test | **Seç** (checkMode toggle)

`active` prop → `toolbar-btn.active` class → mavi highlight (checkMode açıkken)

### `StatusBar.tsx`
Dosya sayısı, seçili sayı, toplam boyut, sıkıştırılmış boyut, oran, arşiv yolu, durum mesajı.

---

## CSS Tema (`global.css`)

Catppuccin Mocha renk değişkenleri:
```css
--bg: #1e1e2e      /* Ana arka plan */
--bg2: #181825     /* Toolbar, statusbar */
--bg3: #313244     /* Input, hover */
--border: #45475a
--text: #cdd6f4
--text2: #a6adc8
--accent: #89b4fa  /* Mavi vurgu */
--green: #a6e3a1
--red: #f38ba8
--yellow: #f9e2af
```

Özel class'lar:
- `.drag-target` → sürükleme hedefi highlight
- `.cut-item` → kes yapılan öğe (opacity 0.45)
- `.toolbar-btn.active` → aktif toggle butonu
- `.disabled-item` → context menu'de pasif öğe

---

## Tauri v2 Önemli Notlar

### Capabilities (`capabilities/default.json`)
Her plugin için explicit izin gerekir, yoksa invoke sessizce başarısız olur:
```json
"dialog:default", "dialog:allow-open", "dialog:allow-save",
"fs:default", "fs:allow-read-file", "fs:allow-write-file",
"opener:default"
```

### Drag-drop (dışarıdan ZIP sürükleme)
`getCurrentWebview().onDragDropEvent()` kullanılır — HTML5 drag events çalışmaz.  
`tauri.conf.json`'da `"dragDropEnabled": true` gerekli.

### Progress Events
Rust → Frontend: `app.emit("progress", Progress { current, total, file, cancelled })`  
Frontend: `listen<ProgressEvt>('progress', ...)` ile dinlenir.  
`total === 0` → işlem bitti (modal kapat).

---

## Bilinen Sorunlar / TODO

### Kritik
- [ ] **Şifreli arşivde değişiklik** — `delete_from_zip`, `rename_in_zip`, `move_in_zip`, `copy_in_zip` komutlarına `archive_password: Option<String>` parametresi eklenmeli. Şifreli entry'leri `by_index` yerine `by_index_decrypt(i, pw.as_bytes())` ile okuyup, yeni entry'leri de aynı şifreyle yazmalı.
- [ ] **Şifreli arşive dosya ekleme** — `add_to_zip` mevcut şifreli entry'leri raw copy ediyor (doğru), yeni dosyaları da aynı şifreyle eklemeli (zaten `password` parametresi var, frontend'den arşiv şifresi geçilmeli).

### Orta
- [ ] **`↑ ..` butonuna drag-drop** — `App.tsx`'te `dragOverUp: boolean` state ekle, addressbar butonuna `onDragOver/onDragLeave/onDrop` handler'ları ekle. Drop'ta: `currentFolder`'dan son segment çıkar → `handleMoveInZip(srcPath, parentFolder)`. `FileList.tsx`'te `onDragStart`'a `e.dataTransfer.setData('text/plain', entry.path)` ekle.
- [ ] **Şifreli arşiv açma** — `list_zip` şifreli entry'leri listeler ama içerik okumaz (doğru). Kullanıcı şifreli dosyaya çift tıklayınca şifre sorulur, `extract_selected` ile açılır.

### Küçük
- [ ] Progress modal'da dosya boyutu gösterimi (placeholder var, `formatBytes(0)` yazıyor)
- [ ] Sürükle-bırak ile dışarıdan dosya ekleme (şu an sadece ZIP açılıyor)

---

## Geliştirme

```bash
# Bağımlılıkları yükle
npm install

# Dev modda çalıştır
npm run tauri dev

# Production build
npm run tauri build
```

### Rust Derleme Kontrolü
```bash
cd src-tauri
cargo check
```

---

## Installer (`installer/ruzip_setup.iss`)
Inno Setup scripti:
- Türkçe + İngilizce dil desteği
- `.zip` dosya ilişkilendirmesi
- Shell context menu: "RuZip ile Aç", "Buraya çıkar", "Klasöre çıkar", "ZIP arşivine ekle", "Klasörü zipple"
- WebView2 runtime kontrolü

---

## Mimari Özet

```
Kullanıcı Eylemi
      ↓
React Handler (App.tsx)
      ↓
invoke('komut_adi', { params })   ← Tauri IPC köprüsü
      ↓
Rust Command (commands.rs)
      ↓ spawn_blocking
ZIP işlemi (zip crate)
      ↓ app.emit('progress', ...)
React Progress Listener
      ↓
UI Güncelleme
```
