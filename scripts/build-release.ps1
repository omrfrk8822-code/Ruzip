param(
    [switch]$Arm64,
    [switch]$SkipTauriBuild,
    [switch]$Help
)

if ($Help) {
    Write-Host @"
RuZip Release Build Script
==========================
Kullanım: .\scripts\build-release.ps1 [parametreler]

Parametreler:
  -Arm64         ARM64 binary'sini de build et (cross-compile gerektirir)
  -SkipTauriBuild Tauri build'i atla (sadece Inno Setup çalıştır)
  -Help          Bu yardım mesajını göster

Build sırası:
  1. Tauri production build (x64)
  2. Inno Setup ile setup.exe oluştur
  3. Çıktı: release\RuZip_Setup_0.1.0.exe

Ön koşullar:
  - Node.js ve npm yüklü
  - Rust toolchain yüklü
  - Inno Setup kurulu (iscc PATH'te olmalı)
"@
    exit
}

$rootDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $rootDir

if (-not $SkipTauriBuild) {
    Write-Host "=== 1/3: Tauri build (x64) ===" -ForegroundColor Cyan
    npm run tauri build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tauri build başarısız!" -ForegroundColor Red
        exit 1
    }

    if ($Arm64) {
        Write-Host "=== 2/3: Tauri build (ARM64) ===" -ForegroundColor Cyan
        npm run tauri build -- --target aarch64-pc-windows-msvc
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ARM64 build başarısız!" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "=== $((if($Arm64){'3'}else{'2'}) + '/3'): Inno Setup ===" -ForegroundColor Cyan
$iscc = Get-Command iscc -ErrorAction SilentlyContinue
if (-not $iscc) {
    Write-Host @"
iscc bulunamadı! Inno Setup kurulu değil veya PATH'te değil.
İndir: https://jrsoftware.org/isdl.php
"@ -ForegroundColor Yellow
    exit 1
}

Set-Location installer
& $iscc.Source ruzip_setup.iss
if ($LASTEXITCODE -ne 0) {
    Write-Host "Inno Setup build başarısız!" -ForegroundColor Red
    exit 1
}

Write-Host @"

=== Build tamamlandı! ===" -ForegroundColor Green
Write-Host "Kurulum dosyası: release\RuZip_Setup_0.1.0.exe" -ForegroundColor Green
Write-Host "MSI paketi: src-tauri\target\release\bundle\msi\" -ForegroundColor Green
