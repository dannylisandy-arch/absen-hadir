@echo off
title Deploy Functions Absensi
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
echo ===== 1. Versi Node =====
node -v
echo.
echo ===== 2. Memasang paket (1-2 menit) =====
cd functions
call npm install --save firebase-functions@latest firebase-admin@latest --no-audit --no-fund
echo.
echo ===== 3. Cek kode =====
node -e "require('./index.js'); console.log('KODE OK')"
if errorlevel 1 goto gagal
echo.
echo ===== 4. Analisis daftar fungsi (maks. 60 detik) =====
if exist functions.yaml del /q functions.yaml
set PORT=8099
set FUNCTIONS_CONTROL_API=true
set GCLOUD_PROJECT=absencsm
start "analisis" /b cmd /c "node node_modules\firebase-functions\lib\bin\firebase-functions.js . > ..\analisis-log.txt 2>&1"
set /a coba=0
:tunggu
timeout /t 3 /nobreak >nul
curl -s -f -m 10 http://127.0.0.1:8099/__/functions.yaml -o functions.yaml
if not errorlevel 1 goto dapat
set /a coba+=1
if %coba% lss 20 goto tunggu
echo Analisis tidak selesai dalam 60 detik. Isi log:
type ..\analisis-log.txt
curl -s -m 5 http://127.0.0.1:8099/__/quitquitquit >nul 2>&1
goto gagal
:dapat
curl -s -m 5 http://127.0.0.1:8099/__/quitquitquit >nul 2>&1
echo Daftar fungsi siap.
set PORT=
set FUNCTIONS_CONTROL_API=
set GCLOUD_PROJECT=
cd ..
echo.
echo ===== 5. Deploy ke Firebase (3-5 menit) =====
call firebase deploy --only functions --force
set HASIL=%errorlevel%
del /q functions\functions.yaml >nul 2>&1
echo.
if not "%HASIL%"=="0" goto gagal2
echo ===== SELESAI - screenshot jendela ini lalu kirim =====
pause
exit /b
:gagal
cd /d "%~dp0"
del /q functions\functions.yaml >nul 2>&1
:gagal2
echo.
echo ===== GAGAL - screenshot jendela ini lalu kirim (dan file firebase-debug.log) =====
:akhir
pause
