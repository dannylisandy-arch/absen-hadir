@echo off
title Ganti Akun Firebase
cd /d "%~dp0"
echo ===== Ganti akun Google untuk Firebase =====
echo Browser akan terbuka: pilih akun Google PEMILIK Firebase absencsm lalu Allow.
call firebase logout
call firebase login
echo.
echo Project yang bisa diakses akun ini:
call firebase projects:list
echo.
echo Kalau absencsm ada di daftar di atas, lanjutkan dengan klik dua kali deploy-rules.bat
pause
