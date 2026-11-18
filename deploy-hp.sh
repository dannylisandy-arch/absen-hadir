#!/bin/bash
# Deploy Firebase dari HP lewat Google Cloud Shell (shell.cloud.google.com)
# Pemakaian:  bash deploy-hp.sh functions   -> sama dengan deploy-functions.bat
#             bash deploy-hp.sh rules       -> sama dengan deploy-rules.bat
#             bash deploy-hp.sh semua       -> aturan + functions
cd "$(dirname "$0")"
PILIH="${1:-functions}"
PROJEK="absencsm"

gagal(){ echo; echo "===== GAGAL - screenshot layar ini lalu kirim ====="; rm -f functions/functions.yaml; exit 1; }

echo "===== Cek login Firebase ====="
if ! firebase projects:list >/dev/null 2>&1; then
  echo "Belum login. Ikuti petunjuk: buka link yang muncul, pilih akun Google pemilik Firebase, salin kodenya ke sini."
  firebase login --no-localhost || gagal
fi
firebase use "$PROJEK" >/dev/null 2>&1

if [ "$PILIH" = "rules" ] || [ "$PILIH" = "semua" ]; then
  echo; echo "===== Deploy aturan database + storage ====="
  firebase deploy --only firestore,storage --force || gagal
fi

if [ "$PILIH" = "functions" ] || [ "$PILIH" = "semua" ]; then
  echo; echo "===== 1. Versi Node ====="; node -v
  echo; echo "===== 2. Memasang paket (1-2 menit) ====="
  cd functions
  npm install --save firebase-functions@latest firebase-admin@latest --no-audit --no-fund || gagal
  echo; echo "===== 3. Cek kode ====="
  node -e "require('./index.js'); console.log('KODE OK')" || gagal
  echo; echo "===== 4. Analisis daftar fungsi (maks. 60 detik) ====="
  rm -f functions.yaml
  PORT=8099 FUNCTIONS_CONTROL_API=true GCLOUD_PROJECT=$PROJEK node node_modules/firebase-functions/lib/bin/firebase-functions.js . > ../analisis-log.txt 2>&1 &
  for i in $(seq 1 20); do
    sleep 3
    curl -s -f -m 10 http://127.0.0.1:8099/__/functions.yaml -o functions.yaml && break
  done
  curl -s -m 5 http://127.0.0.1:8099/__/quitquitquit >/dev/null 2>&1
  if [ ! -s functions.yaml ]; then echo "Analisis tidak selesai. Isi log:"; cat ../analisis-log.txt; cd ..; gagal; fi
  echo "Daftar fungsi siap."
  cd ..
  echo; echo "===== 5. Deploy ke Firebase (3-5 menit) ====="
  firebase deploy --only functions --force || gagal
  rm -f functions/functions.yaml
fi
echo; echo "===== SELESAI - screenshot layar ini lalu kirim ====="
