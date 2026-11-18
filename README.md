# Absensi Hadir

Credit to Danny Lisandy

- `web/` : aplikasi web → otomatis ke Cloudflare Pages **absencsm** (absencsm.pages.dev)
- `firestore.rules`, `storage.rules`, `functions/` → otomatis ke Firebase **absencsm**

Setiap perubahan yang masuk ke branch `main` langsung di-deploy oleh GitHub Actions (tab **Actions**).
Cara manual (.bat / Cloud Shell) tetap bisa dipakai sebagai cadangan: lihat PANDUAN.md.

Secrets yang dibutuhkan (Settings › Secrets and variables › Actions):
- `CLOUDFLARE_API_TOKEN` : token Cloudflare dengan izin *Cloudflare Pages: Edit*
- `CLOUDFLARE_ACCOUNT_ID` : Account ID Cloudflare
- `FIREBASE_SERVICE_ACCOUNT` : isi file JSON kunci service account project absencsm
