@echo off
title Deploy Aturan Firebase Absensi
cd /d "%~dp0"

echo ===== Cek alat Firebase di komputer ini =====
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js belum terpasang di komputer ini.
  echo 1. Buka https://nodejs.org lalu unduh versi LTS dan pasang ^(Next sampai selesai^).
  echo 2. Tutup jendela ini, lalu klik dua kali file .bat ini lagi.
  start https://nodejs.org
  goto akhir
)
where firebase >nul 2>&1
if errorlevel 1 (
  echo Alat Firebase belum terpasang. Memasang sekarang ^(1-3 menit^)...
  call npm install -g firebase-tools --no-audit --no-fund
  where firebase >nul 2>&1
  if errorlevel 1 (
    echo Pemasangan selesai tapi belum terbaca. Tutup jendela ini lalu klik dua kali file .bat ini lagi.
    goto akhir
  )
)
call firebase projects:list >nul 2>&1
if errorlevel 1 (
  echo Belum login Firebase. Browser akan terbuka: pilih akun Google pemilik Firebase lalu Allow.
  call firebase login
)
rem akun Google yang dipakai harus punya akses ke project absencsm; kalau salah akun -> ganti akun
call firebase projects:list 2>nul | findstr /i "absencsm" >nul
if errorlevel 1 (
  echo.
  echo Akun Google yang sedang login TIDAK punya akses ke Firebase absencsm.
  echo Browser akan terbuka: pilih akun Google PEMILIK Firebase absencsm lalu Allow.
  call firebase logout >nul 2>&1
  call firebase login
  call firebase projects:list 2>nul | findstr /i "absencsm" >nul
  if errorlevel 1 (
    echo Akun yang dipilih masih belum punya akses ke absencsm. Coba lagi dengan akun pemilik Firebase.
    goto akhir
  )
)
call firebase use absencsm >nul 2>&1
echo.
echo ===== Deploy aturan database + storage =====
call firebase deploy --only firestore,storage --force
echo.
echo ===== SELESAI - screenshot jendela ini lalu kirim =====
:akhir
pause
