; RuZip Inno Setup Kurulum Scripti
; Derlemek için: iscc ruzip_setup.iss
; Multi-arch: x64 ve ARM64 desteği

#define AppName "RuZip"
#define AppVersion "0.1.0"
#define AppPublisher "RuZip"
#define AppURL "https://github.com/omrfrk8822-code/Ruzip"
#define AppExeName "RuZip.exe"
#define AppDescription "Türkiye'nin ZIP Arşiv Programı"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}
AppUpdatesURL={#AppURL}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
AllowNoIcons=yes
OutputDir=..\release
OutputBaseFilename=RuZip_Setup_{#AppVersion}
SetupIconFile=..\src-tauri\icons\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
WizardResizable=no
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=no
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
VersionInfoVersion={#AppVersion}
VersionInfoDescription={#AppDescription}
VersionInfoProductName={#AppName}
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon";      Description: "Masaüstüne kısayol oluştur";           GroupDescription: "Ek görevler:"; Flags: unchecked
Name: "fileassoc_zip";    Description: ".zip dosyalarını RuZip ile ilişkilendir"; GroupDescription: "Dosya ilişkilendirme:"; Flags: checkedonce
Name: "shellmenu";         Description: "Sağ tık menüsüne RuZip seçenekleri ekle"; GroupDescription: "Kabuk entegrasyonu:"; Flags: checkedonce
Name: "shellmenu\open";    Description: "RuZip ile Aç";                          GroupDescription: "Kabuk entegrasyonu:"; Flags: checkedonce
Name: "shellmenu\extract"; Description: "Buraya çıkar / Klasöre çıkar";          GroupDescription: "Kabuk entegrasyonu:"; Flags: checkedonce
Name: "shellmenu\add";     Description: "ZIP arşivine ekle / Klasörü zipple";   GroupDescription: "Kabuk entegrasyonu:"; Flags: checkedonce

[Files]
; x64 binary
Source: "..\src-tauri\target\release\{#AppExeName}"; DestDir: "{app}"; Flags: ignoreversion; Check: Is64BitInstallMode and not IsARM64
Source: "..\src-tauri\target\release\*.dll";         DestDir: "{app}"; Flags: ignoreversion recursesubdirs skipifsourcedoesntexist; Check: Is64BitInstallMode and not IsARM64
Source: "..\src-tauri\target\release\resources\*";   DestDir: "{app}\resources"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist; Check: Is64BitInstallMode and not IsARM64

[Icons]
Name: "{group}\{#AppName}";          Filename: "{app}\{#AppExeName}"; Comment: "{#AppDescription}"
Name: "{group}\{#AppName}'ı Kaldır"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#AppName}";    Filename: "{app}\{#AppExeName}"; Tasks: desktopicon; Comment: "{#AppDescription}"

[Registry]
; ── Dosya tipi tanımı ──────────────────────────────────────────────────────
Root: HKCR; Subkey: ".zip";                    ValueType: string; ValueName: ""; ValueData: "RuZip.Archive";          Flags: uninsdeletevalue;  Tasks: fileassoc_zip
Root: HKCR; Subkey: "RuZip.Archive";           ValueType: string; ValueName: ""; ValueData: "ZIP Arşivi";             Flags: uninsdeletekey;    Tasks: fileassoc_zip
Root: HKCR; Subkey: "RuZip.Archive";           ValueType: string; ValueName: "FriendlyTypeName"; ValueData: "ZIP Arşivi (RuZip)"; Tasks: fileassoc_zip
Root: HKCR; Subkey: "RuZip.Archive\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\{#AppExeName},0"; Tasks: fileassoc_zip
Root: HKCR; Subkey: "RuZip.Archive\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#AppExeName}"" ""%1"""; Tasks: fileassoc_zip

; ── Sağ tık: ZIP dosyaları üzerinde ──────────────────────────────────────
; "RuZip ile Aç"
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_open";         ValueType: string; ValueName: "";     ValueData: "RuZip ile Aç";              Flags: uninsdeletekey; Tasks: shellmenu\open
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_open";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\open
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_open\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" ""%1"""; Tasks: shellmenu\open

; "Buraya çıkar"
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_extract";         ValueType: string; ValueName: "";     ValueData: "Buraya çıkar";              Flags: uninsdeletekey; Tasks: shellmenu\extract
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_extract";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\extract
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_extract\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" --extract-here ""%1"""; Tasks: shellmenu\extract

; "Klasöre çıkar..."
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_extractto";         ValueType: string; ValueName: "";     ValueData: "Klasöre çıkar...";          Flags: uninsdeletekey; Tasks: shellmenu\extract
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_extractto";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\extract
Root: HKCR; Subkey: "RuZip.Archive\shell\ruzip_extractto\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" --extract-to ""%1"""; Tasks: shellmenu\extract

; ── Sağ tık: Herhangi bir dosya üzerinde ────────────────────────────────
; "RuZip ile Aç" — tüm dosyalar
Root: HKCR; Subkey: "*\shell\ruzip_open";         ValueType: string; ValueName: "";     ValueData: "RuZip ile Aç";              Flags: uninsdeletekey; Tasks: shellmenu\open
Root: HKCR; Subkey: "*\shell\ruzip_open";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\open
Root: HKCR; Subkey: "*\shell\ruzip_open\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" ""%1"""; Tasks: shellmenu\open

; "ZIP arşivine ekle" — dosyalar
Root: HKCR; Subkey: "*\shell\ruzip_add";         ValueType: string; ValueName: "";     ValueData: "ZIP arşivine ekle (RuZip)"; Flags: uninsdeletekey; Tasks: shellmenu\add
Root: HKCR; Subkey: "*\shell\ruzip_add";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\add
Root: HKCR; Subkey: "*\shell\ruzip_add\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" --add ""%1"""; Tasks: shellmenu\add

; ── Sağ tık: Klasörler üzerinde ─────────────────────────────────────────
; "RuZip ile Aç" — klasörler
Root: HKCR; Subkey: "Directory\shell\ruzip_open";         ValueType: string; ValueName: "";     ValueData: "RuZip ile Aç";              Flags: uninsdeletekey; Tasks: shellmenu\open
Root: HKCR; Subkey: "Directory\shell\ruzip_open";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\open
Root: HKCR; Subkey: "Directory\shell\ruzip_open\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" ""%1"""; Tasks: shellmenu\open

; "ZIP arşivine ekle" — klasörler
Root: HKCR; Subkey: "Directory\shell\ruzip_add";         ValueType: string; ValueName: "";     ValueData: "ZIP arşivine ekle (RuZip)"; Flags: uninsdeletekey; Tasks: shellmenu\add
Root: HKCR; Subkey: "Directory\shell\ruzip_add";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\add
Root: HKCR; Subkey: "Directory\shell\ruzip_add\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" --add ""%1"""; Tasks: shellmenu\add

; "Klasörü zipple"
Root: HKCR; Subkey: "Directory\shell\ruzip_zip";         ValueType: string; ValueName: "";     ValueData: "RuZip ile Zipple";          Flags: uninsdeletekey; Tasks: shellmenu\add
Root: HKCR; Subkey: "Directory\shell\ruzip_zip";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\add
Root: HKCR; Subkey: "Directory\shell\ruzip_zip\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" --zip-folder ""%1"""; Tasks: shellmenu\add

; "Klasör içeriğini zipple" — boş alan sağ tık
Root: HKCR; Subkey: "Directory\Background\shell\ruzip_zip";         ValueType: string; ValueName: "";     ValueData: "RuZip ile Zipple";          Flags: uninsdeletekey; Tasks: shellmenu\add
Root: HKCR; Subkey: "Directory\Background\shell\ruzip_zip";         ValueType: string; ValueName: "Icon"; ValueData: "{app}\{#AppExeName},0";     Tasks: shellmenu\add
Root: HKCR; Subkey: "Directory\Background\shell\ruzip_zip\command"; ValueType: string; ValueName: "";     ValueData: """{app}\{#AppExeName}"" --zip-folder %V"; Tasks: shellmenu\add

; ── Uygulama kaydı ────────────────────────────────────────────────────────
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKLM; Subkey: "Software\{#AppName}"; ValueType: string; ValueName: "Version";     ValueData: "{#AppVersion}"

[Run]
Filename: "{app}\{#AppExeName}"; Description: "{#AppName}'ı başlat"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  ResultCode: Integer;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then begin
    if WizardIsTaskSelected('fileassoc_zip') then begin
      Exec('cmd.exe', '/c assoc .zip=RuZip.Archive', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec('cmd.exe', '/c ftype RuZip.Archive="{app}\{#AppExeName}" "%1"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
  end;
end;
