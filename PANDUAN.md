# Panduan Pemasangan Absensi Hadir (Firebase)

## Isi folder
| File | Fungsi |
|---|---|
| `index.html` | Aplikasi karyawan (absen wajah, sidik jari, GPS) |
| `admin.html` | Dashboard admin & supervisor (persetujuan, rekap hari ini, lokasi kantor) |
| `firebase-config.js` | **Wajib diisi** dengan konfigurasi project Firebase kamu |
| `payroll.js` | Rumus perhitungan gaji |
| `common.js`, `style.css`, `firebase-messaging-sw.js`, `manifest.json`, `offline.html`, `icon.svg`, `icons/` | Pendukung (tampilan, notifikasi, offline, ikon aplikasi) |
| `.well-known/assetlinks.json` | Verifikasi domain untuk APK (diisi saat membuat APK) |
| `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `functions/` | Di-deploy ke Firebase lewat CLI |

## 1. Buat project Firebase
1. Buka https://console.firebase.google.com, lalu **Add project**.
2. **Build > Authentication > Get started**, aktifkan **Email/Password**.
3. Masih di Authentication, buka **Settings > Authorized domains**, lalu tambahkan domain Cloudflare Pages kamu (misalnya `absensi.pages.dev`).
4. **Build > Firestore Database > Create database**, pilih lokasi **asia-southeast2 (Jakarta)**, mode *production*.
5. **Build > Storage > Get started**, pilih lokasi yang sama. Storage dipakai untuk lampiran izin/sakit dan butuh paket **Blaze** (kuota gratis 5 GB tetap berlaku).

## 2. Isi `firebase-config.js`
1. **Project settings > General > Your apps**, tambahkan **Web app** (ikon `</>`), lalu salin `firebaseConfig`.
2. **Project settings > Cloud Messaging > Web Push certificates > Generate key pair**, lalu salin key-nya ke `VAPID_KEY`.

## 3. Deploy rules, index, dan Cloud Functions
Cloud Functions butuh paket **Blaze** (bayar sesuai pemakaian; kuota gratisnya jauh di atas kebutuhan absensi kantor kecil). Pasang batas anggaran di Google Cloud Billing supaya aman.

```bash
npm install -g firebase-tools
firebase login
cd folder-absensi
# project "absencsm" sudah diatur di .firebaserc, APP_URL sudah diisi
cd functions && npm install && cd ..
firebase deploy --only firestore,functions,storage
```
Setiap kali `firestore.rules`, `firestore.indexes.json`, atau `storage.rules` berubah, jalankan lagi `firebase deploy --only firestore,storage`.

Saat pertama kali deploy `storage.rules`, Firebase akan meminta izin agar Storage boleh membaca Firestore (untuk memeriksa role admin). Pilih **Yes**.

## 4. Upload ke Cloudflare Pages
Upload semua file (termasuk `index.js`, `admin.js`, folder `icons/` dan `.well-known/`), **kecuali** folder `alat/`, `rilis/`, file `.bat`, folder `functions/`, `firebase.json`, `storage.rules`, dan file `firestore.*`. Semua file harus berada di folder yang sama, dan aplikasinya wajib diakses lewat HTTPS.

## 5. Jadikan akun admin & supervisor
1. Daftar akun biasa lewat `index.html` (tab **Daftar**: nama, username, password).
2. Di Firebase Console, buka **Firestore > users > (dokumen akun itu)** dan ubah field `role` dari `karyawan` menjadi `admin` atau `supervisor`.
3. Buka `admin.html`, masuk, atur **Lokasi kantor**, lalu tekan **Aktifkan notifikasi**.

## 6. Karyawan
Daftar di `index.html` dengan **username dan password**, lalu di tab Pengaturan daftarkan wajah, sidik jari, dan aktifkan notifikasi.

## 7. Payroll (tab Gaji, khusus admin)
1. Buka **Gaji > Aturan gaji**, isi jam masuk/pulang, toleransi telat, hari kerja, tanggal libur, uang makan, transport, potongan, lembur, dan BPJS, lalu tekan **Simpan aturan**.
2. Buka sub-tab **Karyawan**. Untuk tiap karyawan, isi **gaji pokok** (atau upah per hari), **tunjangan jabatan**, **tunjangan transportasi**, dan **tunjangan lainnya**, lalu centang program **BPJS** yang diikuti (Kesehatan, JHT, JP). Semua ini berlaku setiap bulan. **Bonus** diisi per periode: pilih *Periode bonus* di atas, isi nominalnya, lalu tekan **Simpan gaji**.
3. Di sub-tab **Hitung**, pilih periode lalu tekan **Hitung gaji**. Per karyawan tersedia **Rincian**, **Cetak**, dan **Simpan**. Untuk semua karyawan sekaligus ada **Cetak semua slip** (satu slip per halaman, bisa disimpan sebagai PDF), **Simpan semua ke karyawan**, dan **Unduh CSV**.
4. **Simpan** membekukan hasil hitungan sebagai slip resmi di akun karyawan. Perubahan aturan atau gaji setelahnya tidak mengubah slip yang sudah tersimpan, kecuali kamu menekan **Simpan ulang**.
5. Sub-tab **Riwayat** menampilkan slip tersimpan 12 bulan terakhir per karyawan, lengkap dengan total dan rata-ratanya. Slip bisa dicetak satu per satu atau sekaligus.

Cara hitungnya:
- **Hadir** dihitung dari absen yang *Sah* atau *Diterima*. Absen *Ditolak* diabaikan, dan absen yang masih *Menunggu* belum dihitung.
- **Telat** dihitung kalau jam masuk melewati jam masuk + toleransi. Menit telat dihitung dari jam masuk resmi.
- **Dasar gaji pokok** dipilih di Aturan:
  - **Berdasarkan hari kerja** (bawaan): gaji pokok ÷ pembagi × hari masuk.
  - **Upah harian**: upah per hari × hari masuk. Isi upah per hari di sub-tab Karyawan.
  - **Bulanan tetap**: gaji pokok penuh, dipotong gaji pokok ÷ pembagi per hari tidak hadir.
- **Hari masuk** = hadir di hari kerja + sakit + izin. Izin tidak dihitung kalau opsi *izin tidak dibayar* dinyalakan.
- **Pembagi** bisa mengikuti jumlah hari kerja di kalender bulan itu, atau angka tetap (20/21/22/25/26 hari). Dengan pembagi tetap, gaji pokok tidak melebihi 100% walaupun hari masuk lebih banyak dari pembagi.
- **Tunjangan jabatan, transportasi, lainnya, dan bonus** selalu dibayar penuh di semua cara hitung. Dasar lembur (1/173) = gaji pokok + tunjangan jabatan + tunjangan lainnya.
- **Lembur** dihitung dari jam absen pulang yang melewati jam pulang, dibulatkan ke bawah per jam. Mode "aturan pemerintah" mengikuti PP 35/2021: upah sejam = 1/173 × (gaji pokok + tunjangan tetap; untuk upah harian, upah sebulan disetarakan 21 atau 25 hari), jam pertama 1,5×, jam berikutnya 2×, dan tarif khusus untuk hari libur.
- **BPJS** yang dipotong hanya bagian karyawan, dan hanya untuk program yang diikuti karyawan itu. Dasar hitungnya gaji pokok + tunjangan jabatan + tunjangan lainnya; tunjangan transportasi dan bonus tidak termasuk. Bawaannya Kesehatan 1%, JHT 2%, dan JP 1%, dan persentasenya bisa diubah di Aturan.
- **Sakit & izin** yang sudah disetujui tidak dihitung sebagai tidak hadir. Sakit tidak memotong gaji. Izin bisa dipotong kalau opsi *Potong gaji pokok per hari izin* dinyalakan di Aturan.
- **PPh 21** (opsional): tarif rata dengan persen yang bisa diubah di Aturan, dihitung dari penghasilan bruto atau bruto dikurangi iuran JHT & JP. Hanya dipotong dari karyawan yang dicentang *Kena PPh 21*. Catatan: sejak 2024 PPh 21 bulanan resmi memakai tarif efektif rata-rata (TER) sesuai status PTKP, dengan perhitungan ulang di bulan Desember. Tarif rata di sini adalah penyederhanaan, jadi cocokkan persennya dengan TER atau konsultan pajak.
- **Belum termasuk:** cuti tahunan dan kasbon. Hasilnya tetap perlu dicek ulang sebelum dibayarkan.

Di aplikasi karyawan, tab **Gaji** punya dua bagian. **Slip saya** berisi slip resmi 12 bulan terakhir yang bisa dicetak satu per satu atau sekaligus. **Perkiraan** berisi hitungan sementara bulan berjalan. Gaji karyawan lain tidak bisa dilihat, karena dilindungi oleh security rules.

## 8. Izin, sakit & laporan absensi
- Karyawan menekan **Ajukan izin / sakit** di tab Absen, lalu memilih jenis, rentang tanggal, menulis keterangan, dan bisa melampirkan sampai 3 foto atau dokumen (PDF/Word, maks. 5 MB per file), misalnya surat dokter. Foto otomatis dikecilkan sebelum diunggah. Admin dan supervisor langsung mendapat notifikasi, lalu menyetujui atau menolak di tab **Persetujuan**. Selama belum diputuskan, karyawan masih bisa membatalkan pengajuannya dari tab Riwayat.
- **Laporan > Rekap absensi** (untuk admin dan supervisor): pilih periode untuk melihat tingkat kehadiran dan tabel per karyawan berisi **Hadir, Telat, Sakit, Izin, Alpa** beserta totalnya. Laporan bisa dicetak atau diunduh sebagai CSV.
- **Alpa** = hari kerja yang sudah lewat tanpa absen dan tanpa izin/sakit yang disetujui.

## Login username & password
- Karyawan dan admin masuk dengan **username** dan **password**. Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah. Username harus unik.
- Di balik layar, Firebase Auth menyimpan username sebagai `username@absensi.local` (diatur oleh `USERNAME_DOMAIN` di `firebase-config.js`). Tidak ada email yang dikirim. **Jangan ubah** `USERNAME_DOMAIN` setelah ada pengguna yang mendaftar.
- Akun lama yang terdaftar dengan email tetap bisa masuk dengan mengetik email-nya di kolom username.
- **Ingat saya** menjaga login tetap aktif setelah browser ditutup. Kalau tidak dicentang, pengguna otomatis keluar saat tab ditutup (cocok untuk HP bersama).
- **Lupa password:** karena akun username tidak punya email asli, reset harus lewat admin. Di Firebase Console > Authentication, admin bisa menghapus akun tersebut lalu karyawan mendaftar ulang dengan username yang sama. Data absensi lama tetap ada, tetapi tersimpan dengan ID akun lama.

## Catatan iPhone
Notifikasi push di iPhone hanya jalan di iOS 16.4 ke atas, **dan** aplikasi harus dipasang dulu: buka di Safari, tekan **Bagikan > Tambahkan ke Layar Utama**, lalu buka dari ikon tersebut.

## Tanpa paket Blaze?
Semua tetap jalan kecuali notifikasi saat aplikasi tertutup. Dashboard admin tetap menampilkan permintaan baru secara realtime selama halamannya terbuka.

## 9. Menjadikan APK Android

Aplikasi ini sudah memenuhi syarat untuk dibungkus jadi APK dengan **TWA (Trusted Web Activity)**: manifest lengkap, ikon PNG & *maskable*, service worker, dan halaman offline. APK memakai mesin Chrome di HP, jadi sidik jari (passkey), kamera, GPS, dan notifikasi tetap jalan. Setiap kali file di Cloudflare diperbarui, aplikasi di HP ikut terbarui tanpa perlu instal ulang APK.

**Syarat:** aplikasi sudah online di Cloudflare Pages (HTTPS) dan `firebase-config.js` sudah diisi.

1. Pastikan `https://NAMA.pages.dev/index.html` bisa dibuka dan login berjalan.
2. Buka **https://www.pwabuilder.com**, masukkan alamat `https://NAMA.pages.dev/index.html`, lalu tekan **Start**.
3. Pilih **Package for stores > Android > Generate Package**, lalu isi:
   - **Package ID**, misalnya `com.namaperusahaan.absensi`. Ini tidak bisa diganti nanti.
   - **App name**: Absensi Hadir. **Launcher name**: Absensi.
   - **Signing key**: pilih *Create new*.
4. Unduh hasilnya (file .zip). Isinya:
   - `*.apk`: untuk dipasang langsung di HP.
   - `*.aab`: untuk diunggah ke Google Play Store.
   - `assetlinks.json`: file verifikasi domain.
   - `signing.keystore` + `signing-key-info.txt`: **SIMPAN BAIK-BAIK.** Tanpa file ini kamu tidak bisa merilis pembaruan APK dengan nama paket yang sama.
5. Salin isi `assetlinks.json` dari PWABuilder ke file **`.well-known/assetlinks.json`** di folder aplikasi, lalu upload ulang ke Cloudflare Pages. Cek bahwa `https://NAMA.pages.dev/.well-known/assetlinks.json` bisa dibuka. Tanpa file ini, APK tetap jalan tetapi menampilkan bilah alamat browser di atas.
6. **Pasang di HP karyawan:** kirim file `.apk` (misalnya lewat WhatsApp atau Google Drive), buka di HP, lalu izinkan *Instal aplikasi tidak dikenal* saat diminta.
7. **Play Store (opsional):** daftar akun Google Play Developer (biaya sekali bayar), lalu unggah file `.aab`. Kalau memakai *Play App Signing*, tambahkan juga SHA-256 dari Play Console (*Setup > App integrity*) ke `assetlinks.json`.

**Dashboard admin di APK:** tekan lama ikon aplikasi, lalu pilih pintasan **Dashboard admin**. Admin juga tetap bisa memakai browser di PC.

**Tanpa APK:** karyawan juga bisa membuka aplikasi di Chrome lalu memilih **Tambahkan ke layar utama / Instal aplikasi**. Hasilnya hampir sama, tanpa perlu membuat APK.

**Setelah update besar:** naikkan `VERSI` di `firebase-messaging-sw.js` (misalnya `absensi-v2`) supaya salinan offline lama dibersihkan.

## 10. Banyak perusahaan (multi-perusahaan)

Satu aplikasi dipakai banyak perusahaan. Data setiap perusahaan (absen, izin, gaji, slip, lokasi kantor, aturan) terpisah total.

**Peran:**
- **Superadmin** (pemilik aplikasi): menambah perusahaan, berpindah antar-perusahaan, dan mengelola semuanya.
- **Admin** perusahaan: mengelola perusahaannya sendiri, termasuk mengatur peran karyawan.
- **Supervisor**: menyetujui izin dan melihat laporan perusahaannya.
- **Karyawan**: absen.

**Login:** cukup **Username + Password**. Username harus unik di semua perusahaan; kalau sudah dipakai, tambahkan angka atau singkatan (misalnya `budi2`, `budi.csm`). Kode perusahaan hanya dipakai sistem untuk memisahkan data.

**Pemasangan pertama:**
1. Deploy ulang: `firebase deploy --only firestore,storage,functions`
2. Upload `absensi-cloudflare.zip` terbaru ke Cloudflare (Create deployment).
3. Jadikan akunmu superadmin: Firestore > `users` > akunmu > ubah `role` menjadi `superadmin`.
4. Buka `admin.html`, login, lalu buka menu **Perusahaan** > **Tambah perusahaan** (nama + kode, misalnya `CSM`).
5. Masih di menu Perusahaan: klik **Hubungkan ke perusahaan aktif** untuk memindahkan akun lama ke perusahaan tersebut.
6. Isi ulang **Lokasi kantor** dan **Aturan gaji** untuk perusahaan itu. Data uji coba lama tidak ikut dipindahkan.
7. Tambahkan karyawan lewat **Pengaturan > Tambah karyawan** (lihat bagian 11).

**Menambah perusahaan berikutnya:** menu **Perusahaan > Tambah perusahaan**. Lalu daftar satu akun dengan kode baru itu, dan jadikan admin lewat **Pengaturan > Pengguna & peran** (saat perusahaan itu aktif).

## 11. Menambah karyawan (hanya admin / supervisor)

Karyawan **tidak bisa mendaftar sendiri**. Akun dibuat di `admin.html` > menu **Karyawan > + Tambah karyawan**:
1. Isi nama lengkap, username, password awal (min. 6 karakter), dan peran.
2. Klik **Tambah karyawan**. Muncul data login yang perlu diberikan ke karyawan: **username dan password**.
- Supervisor hanya bisa menambah peran **Karyawan**. Admin bisa menambah Karyawan, Supervisor, atau Admin.
- Karyawan baru langsung muncul di **Gaji > Karyawan** untuk diisi gajinya.

## 12. Daftar & edit karyawan

Menu **Karyawan** di `admin.html`:
- **Cari** berdasarkan nama, username, jabatan, atau nomor induk. **Saring** karyawan aktif, nonaktif, atau semua.
- **Edit** (khusus admin): nama, nomor induk, jabatan, divisi, no. HP, tanggal masuk, alamat, peran, dan status.
- **Nonaktif:** karyawan yang keluar tidak bisa login dan tidak masuk hitungan gaji, tetapi riwayatnya tetap tersimpan. Bisa diaktifkan kembali kapan saja.
- **Username tidak bisa diubah**, karena dipakai untuk login.
- Supervisor bisa melihat daftar dan menambah karyawan, tetapi tidak bisa mengedit.

## 13. Anti titip absen

**Kunci perangkat**
- Saat karyawan pertama kali mendaftarkan wajah/sidik jari atau absen, akunnya **terkunci ke HP itu**.
- Absen dari HP lain **ditolak oleh server**. Satu HP juga **tidak bisa** dipakai untuk akun lain.
- Karyawan ganti HP: admin buka menu **Karyawan > Reset perangkat**, lalu karyawan mendaftar ulang di HP baru.
- Menghapus data browser atau uninstall aplikasi juga dianggap HP baru, jadi perlu reset oleh admin.

**Uji wajah hidup + foto selfie**
- Setiap absen, kamera meminta gerakan acak: **berkedip**, atau **menoleh lalu kembali ke depan**. Foto diam dan dua wajah sekaligus ditolak.
- Foto selfie disimpan dan bisa dilihat admin di **Persetujuan** dan **Laporan > Hari ini** (ketuk foto untuk memperbesar).
- Model pendeteksi wajah (sekitar 4 MB) diunduh sekali saat absen pertama, setelah itu tersimpan di HP.
- Kalau model tidak bisa diunduh (internet sangat lemah), absen tetap jalan dengan pemeriksaan biasa, dan admin melihat tanda **⚠ tanpa uji wajah hidup**.

## 14. Akurasi GPS

- Setiap absen, aplikasi membaca GPS sampai 8 detik dan memakai hasil yang paling akurat. Angka akurasinya (±… m) tampil di riwayat, Persetujuan, dan Laporan Hari ini.
- **Batas akurasi GPS** diatur di Pengaturan > Lokasi kantor (bawaan 100 m). Absen dengan akurasi lebih buruk dari batas itu ditandai **⚠ GPS lemah** dan harus disetujui admin/supervisor, sama seperti absen di luar area.
- Akurasi umum: luar ruangan 3–10 m, dalam gedung 10–50 m, basement atau gedung tinggi bisa 50–100 m. Sesuaikan radius dan batas akurasi dengan kondisi kantor.

## 15. Pendaftaran wajah & sidik jari dikunci

- Wajah dan sidik jari masing-masing **hanya bisa didaftarkan satu kali** dari HP karyawan, lalu tombolnya terkunci (🔒). Penguncian dicatat di server, jadi tidak bisa dibuka dengan menghapus data aplikasi.
- Untuk daftar ulang atau ganti HP: admin buka menu **Karyawan > Reset perangkat & biometrik**. Data lama di HP otomatis dihapus saat karyawan login berikutnya, lalu karyawan mendaftar ulang satu kali.
- Status setiap karyawan terlihat di menu Karyawan: 📱 HP, Wajah 🔒/–, Sidik jari 🔒/–.

## 16. Username unik & saran akun baru

Saat **Tambah karyawan**:
- Username dicek langsung saat diketik (✓ tersedia / ✗ sudah dipakai, di semua perusahaan).
- Muncul **saran username yang masih tersedia** dari nama karyawan (misalnya `budi`, `budi.santoso`, `budis`, `budi.csm`, `budi2`). Ketuk untuk memakainya.
- Kalau ada karyawan dengan **nama mirip** di perusahaan yang sama, muncul peringatan, dan admin diminta konfirmasi bahwa itu memang orang berbeda. Untuk orang yang sama, pakai **Reset perangkat & biometrik** atau aktifkan kembali akun lamanya.

## 17. Data demo

`admin.html` > **Pengaturan > Data demo** (khusus admin):
- **Isi 10 data demo**: membuat 10 karyawan contoh (username `nama.demo`, password `demo1234`), data gaji, absensi bulan lalu sampai hari ini (ada telat, lembur, dan alpa), 1 sakit yang disetujui, 1 izin yang menunggu, dan 2 absen di luar area yang menunggu persetujuan.
- **Hapus data demo**: menghapus semua akun dan data demo sekaligus. Data karyawan asli tidak tersentuh.
- Butuh fungsi server: `firebase deploy --only functions`.
- Lokasi absen demo memakai lokasi kantor perusahaan, jadi isi **Lokasi kantor** dulu.

## 18. Banyak lokasi absen (kantor, gudang, cabang)

- `admin.html` > **Pengaturan > Lokasi absen**: klik **Tambah lokasi**, isi nama (misalnya *Gudang*), titik GPS (atau **Pakai lokasi saya**), dan radius. Lalu klik **Simpan semua lokasi**.
- Saat absen, karyawan otomatis dicocokkan ke **lokasi terdekat**, dan nama lokasinya tercatat ("25 m dari Gudang").
- **Lokasi kerja per karyawan** (opsional): menu **Karyawan > Edit > Lokasi kerja**. Centang hanya lokasi yang boleh dipakai. Kalau semua dicentang, karyawan boleh absen di lokasi mana pun.
- Batas akurasi GPS berlaku untuk semua lokasi.

## 19. Admin mengubah password karyawan

Menu **Karyawan > Ubah password** (khusus admin perusahaan itu dan superadmin). Isi password baru dua kali, lalu klik **Simpan password**, dan berikan password baru itu ke karyawan.
- Sesi lama karyawan di perangkat lain otomatis keluar (paling lambat sekitar 1 jam).
- Password superadmin tidak bisa diubah oleh admin biasa.
- Butuh fungsi server: klik dua kali `deploy-functions.bat`.

## 20. Metode verifikasi per perusahaan

`admin.html` > **Pengaturan > Verifikasi absen**, pilih salah satu:
- **Wajah atau sidik jari** (bawaan): cukup salah satu yang terdaftar.
- **Wajah saja** / **Sidik jari saja**: aplikasi karyawan hanya menampilkan pendaftaran yang dipakai.
- **Wajah dan sidik jari**: keduanya wajib terdaftar dan lolos saat absen.

Uji wajah hidup dan foto selfie tetap berjalan di semua pilihan.

## 21. Hapus karyawan

Menu **Karyawan > Edit > Hapus karyawan** (khusus admin dan superadmin). Ketik username sebagai konfirmasi, lalu pilih apakah semua riwayat (absen, izin, gaji, slip, foto) ikut dihapus.
- Untuk karyawan yang keluar kerja, lebih baik ubah **Status** menjadi **Nonaktif** supaya riwayat dan laporan tetap ada.
- Hapus permanen tidak bisa dibatalkan. Akun sendiri dan akun superadmin tidak bisa dihapus.
- Butuh fungsi server: klik dua kali `deploy-functions.bat`.

## 22. Log aktivitas

`admin.html` > **Laporan > Log aktivitas** (khusus admin dan superadmin): pilih tanggal, cari, saring jenis, atau unduh CSV.
- Yang tercatat: login, buka aplikasi, logout (dengan jenis perangkat), absen, persetujuan, izin/sakit, perubahan akun karyawan (tambah, hapus, peran, status, password, reset perangkat, pendaftaran wajah/sidik jari, data), pengaturan, data perusahaan, data gaji, slip, serta cetak dan unduh.
- Sebagian besar log ditulis **server**, sehingga tidak bisa dipalsukan atau dihapus pengguna.
- Pemasangan: jalankan `deploy-rules.bat`, lalu `deploy-functions.bat`.

## 23. Periode absensi & gaji (tutup buku)

`admin.html` > **Gaji > Aturan > Periode absensi & gaji > Tanggal mulai periode** (1–28).
- **1**: periode 1 sampai akhir bulan (bawaan).
- Contoh **26**: periode *September* = **26 Agu – 25 Sep**.
- Berlaku untuk hitungan gaji, slip, Laporan > Rekap absensi, serta Perkiraan gaji dan Riwayat di aplikasi karyawan. Label periode (misalnya "26 Agu – 25 Sep 2026") ikut tampil di slip dan laporan.
- Slip yang sudah tersimpan tidak berubah. Klik **Simpan ulang** kalau ingin menghitung ulang dengan periode baru.

## 24. Shift, cara hitung per karyawan & komponen khusus

- **Shift kerja:** buka **Gaji > Aturan > Shift kerja > Tambah shift** (nama, jam masuk, jam pulang). Pilih shift tiap karyawan di **Karyawan > Edit > Shift kerja**. Telat dan lembur dihitung sesuai jam shift. Shift yang melewati tengah malam (misalnya 22:00–06:00) otomatis menggabungkan absen pulang besok pagi ke hari kerja sebelumnya.
- **Cara hitung per karyawan:** **Gaji > Karyawan > Cara hitung gaji**. Pilih *Ikut aturan perusahaan*, *Berdasarkan hari kerja*, *Upah harian*, atau *Bulanan tetap*. Contohnya, staf bulanan dan buruh harian bisa ada di satu perusahaan.
- **Komponen khusus:** **Gaji > Karyawan > Komponen khusus**:
  - **Setiap bulan:** misalnya cicilan kasbon atau tunjangan anak.
  - **Periode ini saja:** misalnya insentif target atau potongan kerusakan.
  Setiap komponen bisa berupa *Tambahan* atau *Potongan*. Semuanya tampil di slip dan CSV.

## 25. Melindungi kode & server

**A. Kode diringkas & disamarkan (esbuild)**
- Klik dua kali **`buat-rilis.bat`**. Pertama kali akan memasang alat (1–2 menit), lalu meringkas semua kode JavaScript ke folder `rilis/` (nama variabel diganti huruf acak, spasi dan komentar dibuang) dan membuat **`absensi-cloudflare-rilis.zip`**.
- Upload **zip rilis itu** ke Cloudflare, bukan zip biasa. Kode asli yang rapi tetap ada di folder utama untuk diedit.
- Setiap kali ada perubahan, jalankan lagi `buat-rilis.bat` sebelum upload.

**B. Firebase App Check (server hanya melayani aplikasi asli)**
1. Google Cloud Console (project absencsm) > **Security > reCAPTCHA** > **Create key**: tipe *Website*, domain `absencsm.pages.dev`, **jangan** centang *checkbox challenge*. Salin **site key**-nya.
2. Firebase Console > **App Check > Apps** > web app > **reCAPTCHA Enterprise** > tempel site key. Isi **Token TTL: 7 hari** (supaya hemat kuota), lalu **Save**.
3. Isi `APPCHECK_SITE_KEY` di `firebase-config.js` (atau kirim key-nya ke pengembang), lalu upload ulang.
4. Pantau **App Check > Metrics** selama 1–2 hari. Kalau hampir semua permintaan sudah *Verified*, klik **Enforce** untuk **Cloud Firestore**, **Cloud Storage**, dan **Authentication**.
5. Ubah `WAJIB_APPCHECK = true` di `functions/index.js`, lalu jalankan `deploy-functions.bat`.

Jangan klik *Enforce* sebelum langkah 3 terpasang, karena aplikasi akan ditolak server.

## 26. Mode kios (webcam kantor) & absen manual

**Mode kios**: untuk karyawan yang HP-nya rusak, hilang, atau tidak punya HP.
1. Di PC/tablet kantor yang punya webcam, buka `absencsm.pages.dev/kios.html` (atau **Pengaturan > Verifikasi absen > Buka mode kios**), lalu login sebagai **admin/supervisor**.
2. Pilih **Lokasi kios** di bagian bawah layar.
3. Karyawan mengetik **username + password miliknya**, menekan **Absen Masuk/Pulang**, lalu mengikuti uji wajah hidup (kedip/menoleh). Foto selfie tersimpan sebagai bukti.
4. **Tutup kios** memerlukan password admin/supervisor yang membukanya.
- **Pengaturan > Verifikasi absen > "Absen lewat mode kios langsung sah"**: kalau dimatikan, absen kios masuk ke Persetujuan.
- Absen kios ditandai **🖥️ via kios** di Persetujuan, Laporan, Riwayat karyawan, dan Log aktivitas.

**Absen manual** (khusus admin): **Karyawan > Absen manual**. Isi tanggal, jam (24 jam), jenis, dan alasan; waktu tidak boleh di masa depan. Absen langsung sah, ditandai **✍️ manual oleh [nama admin]**, dan tercatat di Log aktivitas.

## 27. Backup data

**Di aplikasi (khusus superadmin):** Pengaturan > **Backup data** (untuk perusahaan yang sedang aktif).
- **Unduh backup Excel**: satu file .xlsx dengan sheet Perusahaan, Karyawan, Absensi, Izin & sakit, Data gaji, Slip gaji, Pengaturan, Log aktivitas.
- **Unduh backup JSON**: salinan lengkap seluruh data perusahaan (untuk pemulihan teknis).
- Setiap unduhan tercatat di Log aktivitas. Disarankan unduh setiap akhir bulan dan simpan di tempat aman.

**Di Google Cloud (pemilik aplikasi, sekali atur):**
- Firestore > **Disaster recovery**: buat **backup terjadwal harian** (simpan 7–14 hari) dan aktifkan **Point-in-time recovery**.
- Cloud Storage > bucket > **Protection**: pastikan **soft delete** aktif untuk foto & lampiran.
- Sesekali: `firebase auth:export akun.json` untuk cadangan akun login.

## 28. Nama perangkat di log aktivitas

- Setiap perangkat bisa diberi nama di **Pengaturan > Tampilan > Nama perangkat ini** (misalnya *PC Kasir*, *Laptop HRD*, *HP Rina*). Nama tersimpan di perangkat itu.
- Log aktivitas mencatat: **nama perangkat · model/OS · browser · kode unik**, misalnya *PC Kasir · Windows 11 · Chrome · #20E3*.
- Model HP otomatis terbaca di Android (Chrome), misalnya *SM-A525F*. Nama PC (hostname) dan model iPhone tidak bisa dibaca browser, jadi gunakan nama perangkat buatan sendiri.
- Kode unik (#XXXX) membedakan perangkat dengan model yang sama.
- Supaya log absen dari server ikut mencatat perangkat, jalankan `deploy-functions.bat`.

## 29. Karyawan berhenti

Menu **Karyawan > 🚪 Proses berhenti** (khusus admin): isi tanggal, jenis (mengundurkan diri, habis kontrak, PHK, pensiun, meninggal dunia, lainnya), keterangan, dan lampirkan surat (PDF/JPG/PNG, maks. 5 MB per file). Akun otomatis dinonaktifkan (bisa dibatalkan centangnya).
- Kartu menampilkan "🚪 Berhenti [tanggal] · [jenis]"; tombol **📄 Data berhenti** untuk melihat detail & membuka surat, atau **Batalkan status berhenti**.
- Filter status **Berhenti** menampilkan semua karyawan yang sudah keluar.
- Surat hanya bisa dibuka admin, superadmin, dan karyawan yang bersangkutan.
- Pemasangan: `deploy-rules.bat` (aturan Storage baru) dan `deploy-functions.bat` (teks log).

## 30. Cek lembur / lupa absen pulang

- **Gaji > Aturan > Lembur > "Lembur perlu disetujui"**: kalau aktif, lembur baru dihitung setelah disetujui. Kalau mati, lembur dihitung otomatis kecuali ditandai lupa absen pulang.
- **Laporan > Cek lembur**: daftar per periode untuk absen pulang yang melewati jam kerja (atau di hari libur) dan hari tanpa absen pulang.
  - **✓ Lembur**: setujui, jam bisa disesuaikan (juga untuk hari tanpa absen pulang).
  - **Lupa absen pulang**: lembur dibatalkan.
  - **↺**: kembalikan ke "belum dicek".
- Keputusan dipakai di hitung gaji, slip, rekap laporan, dan riwayat karyawan; tercatat di log aktivitas.
- Pemasangan: `deploy-rules.bat` (koleksi baru `lembur`).

## 31. Libur nasional & cuti bersama

**Gaji > Aturan > Jam kerja:**
- **Libur nasional otomatis** (aktif bawaan): tanggal merah resmi SKB 3 Menteri 2026 (17 hari) dan 2027 (18 hari) tidak dihitung hari kerja; kerja di hari itu dihitung lembur hari libur.
- **Cuti bersama juga libur** (mati bawaan): 8 hari cuti bersama per tahun. Untuk swasta bersifat pilihan dan memotong cuti tahunan.
- **📅 Lihat daftar libur**: semua tanggal, keterangan, dan apakah berlaku.
- **Libur khusus perusahaan**: satu per baris, format `2026-10-20 Ulang tahun perusahaan`.
- Nama hari libur tampil di riwayat karyawan dan rincian absensi.
- Sumber: setneg.go.id — SKB No. 1497/2/5 Tahun 2025 (libur 2026) dan No. 1205/3/2 Tahun 2026 (libur 2027). Data tahun berikutnya perlu ditambahkan setelah SKB baru terbit.

## 32. Pengenal wajah baru (face-api)

- Pencocokan wajah memakai model AI pengenal wajah (deteksi wajah + 68 titik wajah + 128 ciri wajah), bukan perbandingan piksel. Tidak terpengaruh posisi, jarak, dan latar belakang; lebih tahan terhadap perbedaan cahaya.
- Model diunduh sekali (±6 MB) dari cdn.jsdelivr.net, lalu tersimpan di browser.
- Pendaftaran mengambil 5 foto (lurus, miring kiri, miring kanan). Data wajah tetap hanya di HP karyawan.
- **Karyawan lama**: saat absen akan muncul "Data wajah perlu diperbarui sekali". Buka **Pengaturan > Perbarui data wajah** (tanpa reset admin, tetap terkunci ke HP yang sama).
- Ambang kecocokan: jarak ciri wajah maksimal 0,5 (konstanta `JARAK_MAKS` di index.js). Kalau terlalu sering gagal, naikkan ke 0,55; kalau ingin lebih ketat, turunkan ke 0,45.

## 33. Cuti

- Karyawan: **Ajukan izin / sakit / cuti** > Jenis **Cuti**. Muncul **sisa cuti tahun ini** (jatah − cuti disetujui), dengan peringatan bila melebihi.
- Admin: kartu **🏖️ Cuti** di Persetujuan menampilkan sisa cuti karyawan.
- **Gaji > Aturan > Potongan > Jatah cuti tahunan** (bawaan 12 hari kerja).
- Cuti yang disetujui **dibayar** (tidak dipotong, tidak dihitung tidak hadir) dan tampil di rekap, laporan, slip, CSV.
- Pemasangan: `deploy-rules.bat` (jenis cuti) dan `deploy-functions.bat` (judul notifikasi "Cuti").

## 34. Rincian absen per karyawan
- **Laporan > Rekap absensi**: klik **nama karyawan** untuk membuka rincian per hari (masuk, pulang, telat, lembur, keterangan, lokasi & cara absen). Ada tombol **Cetak**.

## 35. Ubah / hapus absen (khusus superadmin)
- Hanya **superadmin** yang bisa mengubah atau menghapus absen. Admin dan supervisor tidak melihat tombolnya, dan server (firestore.rules) juga menolaknya.
- Tempatnya: tombol ✏️ / 🗑️ di **Laporan > Hari ini**, dan bagian **Ubah / hapus catatan absen** di jendela Rincian absen.
- Ubah: tanggal (dd/mm/yy), jam, jenis masuk/pulang, dan **alasan wajib diisi**. Waktu asli tetap disimpan, absen diberi tanda **Diubah**, dan perubahan masuk log aktivitas.
- Hapus: ada konfirmasi; tidak bisa dikembalikan. Tercatat di log aktivitas.
- Pemasangan: `deploy-rules.bat`.

## 36. Posisi GPS di log aktivitas
- Setiap aktivitas di **Laporan > Log aktivitas** sekarang menampilkan **📍 alamat + koordinat GPS (± akurasi)** orang yang melakukannya. Klik untuk membuka Google Maps.
- Absen: posisi diambil dari GPS saat absen (absen kios memakai titik lokasi kios). Aktivitas lain (login, buka aplikasi, setujui, ubah data, cetak, dll.): posisi dibaca dari HP/komputer yang dipakai, dan dipakai ulang selama 10 menit.
- Kalau izin lokasi di browser ditolak atau GPS tidak terbaca dalam 6 detik, aktivitas tetap tercatat tanpa posisi. Di komputer, browser akan meminta izin lokasi sekali; pilih **Izinkan**.
- Unduh CSV log kini berisi kolom Latitude, Longitude, Akurasi, Alamat, dan link Peta.
- Pemasangan: `deploy-functions.bat` (posisi untuk log absen) dan upload Cloudflare.

## 37. Notifikasi aktif secara bawaan
- Saat login atau membuka aplikasi/dashboard, notifikasi **langsung diaktifkan** (browser akan menanyakan izin sekali; pilih **Izinkan**). Kalau browser baru mau bertanya setelah layar disentuh, permintaan muncul pada sentuhan pertama.
- **Hanya admin (dan superadmin)** yang bisa mematikan notifikasi di perangkatnya lewat Pengaturan > **Nonaktifkan notifikasi**. Karyawan dan supervisor tidak melihat tombol itu; notifikasi mereka selalu diaktifkan kembali saat aplikasi dibuka.
- Kalau izin notifikasi sudah diblokir di browser, aktifkan lewat pengaturan situs di browser.

## 38. Kelola daftar libur nasional & cuti bersama
- **Gaji > Aturan > 📅 Kelola daftar libur.** Isi bawaan: SKB 3 Menteri 2026 & 2027.
- Pilih **Tahun**, lalu: ✏️ ubah tanggal/keterangan/jenis, 🗑️ hapus (tanggal jadi hari kerja), ↺ kembalikan ke isi bawaan SKB.
- **Tambah tanggal libur**: tanggal dd/mm/yy, jenis (Libur nasional / Cuti bersama), keterangan. Dipakai untuk tahun 2028 dst. atau bila pemerintah mengubah tanggal.
- Perubahan langsung tersimpan (tidak perlu tekan Simpan aturan) dan berlaku untuk gaji, rekap absensi, dan hitungan cuti karyawan.
- Mulai September, muncul peringatan bila daftar tahun depan belum diisi. SKB biasanya terbit sekitar September–Oktober tahun sebelumnya.
- **Rentang tanggal**: isi **Mulai tanggal** dan **Sampai tanggal** untuk libur beberapa hari sekaligus (mis. cuti bersama Idulfitri), maksimal 31 hari. Kosongkan Sampai tanggal bila liburnya 1 hari. Setiap tanggal dalam rentang tetap bisa diubah/dihapus satu per satu.

## 39. Reset HP / wajah / sidik jari (pilihan)
- Tombol **Reset HP** di kartu karyawan sekarang membuka pilihan sesuai **metode verifikasi** perusahaan:
  - Wajah atau sidik jari / keduanya: pilihan **Wajah**, **Sidik jari**, **Ganti HP**.
  - Wajah saja: **Wajah** dan **Ganti HP**. Sidik jari saja: **Sidik jari** dan **Ganti HP**.
- Reset wajah atau sidik jari saja: HP tetap terkunci ke karyawan, karyawan cukup mendaftar ulang yang direset.
- **Ganti HP**: kunci HP lama dibuka dan wajah & sidik jari otomatis ikut direset (datanya tersimpan di HP lama).
- Yang belum terdaftar tampil redup dan tidak bisa dipilih. Reset tercatat di log aktivitas (mis. "reset wajah").

## 40. Deploy Firebase dari HP (tanpa komputer)
File `.bat` hanya jalan di Windows. Dari HP Android pakai **Google Cloud Shell** (terminal Linux gratis dari Google di browser):
1. Buka Chrome di HP → **shell.cloud.google.com** → login dengan akun Google **pemilik project Firebase absencsm** → tunggu terminal siap. (Lebih nyaman dengan Chrome ⋮ > **Situs desktop**.)
2. Menu **⋮ (More) > Upload** → pilih `absensi-firebase.zip` dari HP.
3. Ketik perintah ini (sekali tempel), lalu Enter:
   `rm -rf absensi && unzip -oq absensi-firebase.zip && bash absensi/deploy-hp.sh functions`
   - Ganti `functions` dengan `rules` untuk aturan database, atau `semua` untuk keduanya.
4. Pertama kali akan diminta login Firebase: buka link yang muncul, pilih akun, salin kode ke terminal.
5. Tunggu sampai muncul **SELESAI**.

## 41. Pinjaman / kasbon karyawan
- **Gaji > Pinjaman** (khusus admin). Ringkasan: jumlah pinjaman berjalan, total sisa, dan total yang dipotong di periode gaji yang dipilih.
- **Tambah pinjaman**: pilih karyawan, jumlah, lama cicilan (bulan), angsuran per bulan (kosong = otomatis, dibulatkan ke ribuan), **mulai potong gaji** (periode), tanggal pinjam, keterangan. Angsuran terakhir menyesuaikan sisa supaya totalnya pas.
- Setiap kartu menampilkan pinjaman, angsuran × bulan, sisa, progres terbayar, dan potongan periode ini/berikutnya. Tombol: **Jadwal**, **Pelunasan**, **Edit**, **Hapus**.
- **Pelunasan**: pilih periode, lalu *Potong gaji* (seluruh sisa dipotong di gaji periode itu) atau *Dibayar tunai* (tidak dipotong lagi). Bisa dibatalkan.
- **Di gaji**: saat **Hitung gaji**, angsuran otomatis masuk potongan dengan nama "Angsuran pinjaman 2/6 · keterangan", tampil di rincian, slip, dan kolom CSV "Angsuran pinjaman". Angsuran tidak memengaruhi PPh 21.
- **Karyawan** melihat **Pinjaman saya** (sisa, progres, jadwal angsuran) di menu Gaji aplikasinya.
- Slip yang sudah disimpan sebelumnya tidak berubah; hitung & simpan ulang bila perlu.
- Pemasangan: `deploy-rules.bat` (atau `bash absensi/deploy-hp.sh rules` dari HP) lalu upload Cloudflare.

## 42. Kehadiran manual dari Excel (operator, supir, dll.)
Untuk karyawan yang **tidak absen di aplikasi**; hari kerja & lembur dihitung sendiri di Excel.
- **Tandai dulu karyawannya**: Karyawan > **Edit** > **Perhitungan kehadiran: Manual (upload Excel)** (juga ada di form Tambah karyawan). Kartunya bertanda 📄 *Kehadiran manual (Excel)*. Karyawan bertanda ini **selalu** dihitung dari Excel; bila data periode itu belum di-upload, dihitung 0 hari dengan peringatan ⚠ di Hitung gaji.
1. **Gaji > Hitung**, pilih **Periode**, tekan **📄 Kehadiran manual (Excel)**.
2. Template otomatis berisi **karyawan bertanda Kehadiran manual** (centang di bagian atas). Atau hilangkan centang itu lalu pilih **Peran** yang dihitung manual (mis. Operator, Supir; boleh lebih dari satu, kosong = semua) dan pilih lokasi bila perlu, lalu **Unduh template Excel**. Kolom: Username, Nama, **Peran, Jabatan, Lokasi kerja**, Hari kerja, Lembur (jam), Uang lembur, Keterangan. Baris judul sudah diberi filter, jadi di Excel bisa menyaring per peran. Peran dibuat di Karyawan > Peran & akses dan dipasang di Edit karyawan.
3. Isi **Hari kerja** dan **Lembur (jam)** (boleh desimal, mis. 5,5). **Uang lembur** boleh dikosongkan → dihitung jam × tarif lembur di Aturan (aturan Depnaker: jam × 1,5 × upah sejam). Isi kolom ini bila uang lembur sudah dihitung sendiri.
4. **Upload file Excel / CSV** (.xlsx atau .csv; file .xls lama: Save As .xlsx dulu). Muncul pratinjau: ✓ cocok, ✗ dilewati (nama/username tidak ditemukan, hari > 31, dll.).
5. **Simpan**. Pilihan *Ganti semua data manual periode ini* menghapus data lama yang tidak ada di file.
- Karyawan dicocokkan lewat **Username**, atau **Nama** bila username kosong (huruf besar/kecil & spasi diabaikan). Baris judul tambahan di atas tabel boleh ada.
- Saat **Hitung gaji**, karyawan tersebut memakai data Excel (bukan absen): kartu bertanda **📄 Input manual**, slip berisi "Rekap kehadiran (input manual)". Gaji pokok mengikuti cara hitung (harian = upah × hari; hari kerja = prorata; bulanan = tetap), uang makan × hari.
- Data per periode; tombol ✕ mengembalikan satu karyawan ke absen aplikasi.
- Pemasangan: `deploy-rules.bat` lalu upload Cloudflare.

## 43. BPJS & PPh 21 manual + kolom gaji tambahan (per perusahaan)
Semua pengaturan ini tersimpan per perusahaan (tidak memengaruhi PT lain).
- **Gaji > Aturan > Cara hitung BPJS & PPh 21**: centang **BPJS & PPh 21 diisi manual per karyawan**. Hitungan BPJS/PPh otomatis dimatikan, pengaturan persen BPJS/PPh disembunyikan, dan kolom *Ikut BPJS* / *Kena PPh 21* hilang dari Gaji > Karyawan dan form Tambah karyawan.
- **Gaji > Aturan > Kolom gaji tambahan** → **Tambah kolom**: isi nama (mis. BPJS, PPh 21, Uang JS, Pinjaman, U Ker), jenis (**Potongan** / **Tambahan**), dan nilai (**Tetap tiap bulan** atau **Diisi tiap periode**). Tekan **Simpan aturan**.
- Kolom muncul di setiap kartu **Gaji > Karyawan** (label merah = potongan, hijau = tambahan; kolom per periode diberi nama bulan, mengikuti *Periode bonus*). Isi angkanya lalu **Simpan gaji**.
- Saat **Hitung gaji**, nilai kolom masuk rincian & slip dengan nama kolomnya, dan CSV gaji mendapat kolom tambahan dengan nama yang sama.
- **Sembunyikan "Komponen khusus"** (di bawah Kolom gaji tambahan): bagian Komponen khusus hilang dari kartu Gaji > Karyawan dan isinya tidak dihitung. Data lama tidak dihapus; hilangkan centang untuk memakainya lagi.
- Catatan: kolom bernama "Pinjaman" terpisah dari menu **Gaji > Pinjaman**. Pakai salah satu saja agar tidak terpotong dua kali.

## 44. Cara hitung "Operator" (harian + jam siang + lembur)
**Rumus:** Gaji = Hari Kerja × Upah per hari + J Siang × U Siang + Lembur (jam) × U Lembur + Uang Ker − Pinjaman − Pinjaman SIO.
1. **Cara hitung**: untuk seluruh perusahaan di Gaji > Aturan > *Dasar gaji pokok* pilih **Operator (harian + jam siang + lembur)**, atau per karyawan di kartu Gaji > Karyawan > *Cara hitung gaji*.
2. **Tarif per karyawan** (Gaji > Karyawan): **Upah per hari**, **U Siang / jam**, **U Lembur / jam** → Simpan gaji.
3. **Angka bulanan dari Excel** (Gaji > Hitung > Kehadiran manual): kolom **Hari Kerja, J Siang, Lembur, Uang Ker, Pinjaman, Pinjaman SIO** (format seperti Excel operator: `username | Nama | Hari Kerja | J Siang | Lembur | …`, urutan kolom bebas). Template dari aplikasi sudah memuat kolom-kolom ini.
4. **Hitung gaji**: rincian & slip menampilkan Upah harian (hari × upah), Lembur (jam × U Lembur), Jam siang (jam × U Siang), Uang Ker, Pinjaman, Pinjaman SIO.
- Di mode Operator, BPJS/PPh otomatis serta uang makan & transport perusahaan tidak dipakai (sesuai rumus). Uang makan per karyawan, tunjangan, bonus, dan kolom gaji tambahan tetap ikut bila diisi.
- Kolom U Siang / U Lembur juga boleh ada di Excel; bila diisi, nilai Excel dipakai untuk periode itu.

## 45. Pinjaman dicatat di menu, dipotong manual lewat Excel
- **Gaji > Pinjaman > Tambah pinjaman**: pilih **Jenis pinjaman** (Pinjaman Karyawan / Pinjaman SIO) dan **Cara potong** (Otomatis / Manual dari Excel). Manual mengambil potongan dari kolom Excel sesuai jenisnya ("Pinjaman" atau "Pinjaman SIO"). Daftar bisa disaring per Jenis.
  - *Otomatis* — angsuran tetap tiap periode (seperti sebelumnya).
  - *Manual: dari kolom "Pinjaman" di Excel* atau *Manual: dari kolom "Pinjaman SIO" di Excel* — tidak dipotong otomatis; cukup isi jumlah pinjaman & mulai.
- Setiap upload Excel kehadiran manual, angka di kolom Pinjaman / Pinjaman SIO karyawan itu **otomatis dicatat sebagai pembayaran** pinjamannya (pinjaman terlama dulu), sehingga **Sisa** berkurang. Riwayatnya ada di tombol **Jadwal**. Upload ulang periode yang sama mengganti catatan periode itu (tidak dobel).
- Gaji hanya dipotong sekali (dari kolom Excel). Bila potongan Excel lebih besar dari sisa pinjaman, muncul peringatan.
- Pelunasan tunai tetap bisa dicatat lewat tombol **Pelunasan**.

## 46. Cara potong pinjaman: Otomatis / Manual (ketik) / Manual dari Excel
Di **Gaji > Pinjaman > Tambah pinjaman > Cara potong**:
- **Otomatis (angsuran tetap)** — dipotong sesuai lama cicilan & angsuran yang diisi di pinjaman.
- **Manual (ketik di Gaji > Karyawan)** — cukup isi jumlah pinjaman & mulai. Di **Gaji > Karyawan** (sesuai *Periode bonus*) kartu karyawan itu menampilkan bagian **Bayar pinjaman [bulan]**; ketik jumlah yang dipotong bulan itu (placeholder menunjukkan sisa), lalu **Simpan gaji**. Potongan masuk ke Hitung gaji & slip sebagai "Bayar pinjaman", dan sisa pinjaman berkurang. Kolom muncul selama pinjaman belum lunas.
- **Manual dari Excel** — potongan dari kolom Pinjaman / Pinjaman SIO di upload Excel (bagian 45).

## 47. Group CV karyawan
- **Karyawan > Group CV** (khusus admin): **Tambah Group CV**, isi nama (mis. CV Maju Jaya), **Simpan Group CV**. Bisa diganti nama atau dihapus; tertulis berapa orang yang memakai. Daftar ini per perusahaan.
- Pilih **Group CV** di form **Tambah karyawan** dan **Edit karyawan**. Pilihan terakhir **＋ Tambah Group CV baru…** langsung membuat CV baru dan memilihnya.
- Kartu karyawan menampilkan 🏢 nama CV; daftar karyawan bisa disaring per Group CV (atau "Tanpa Group CV") dan dicari dengan nama CV.
- Kolom **Group CV** ikut di CSV laporan absensi, CSV gaji, dan template Excel kehadiran manual.

## 48. Import absensi dari Excel (khusus superadmin)
- Pilih perusahaan (mis. PT CSM) di pilihan **Perusahaan** atas, buka **Laporan > Rekap absensi** → **📥 Import absensi dari Excel**.
- Format: **Username | Full Name | Group CV | Join Date | Date | Check In | Check Out** — satu baris per karyawan per tanggal. Urutan kolom bebas; tanggal boleh teks (2026-09-01, 01/09/2026) atau sel tanggal Excel; jam boleh teks (07:13) atau sel jam Excel.
- **Judul kolom salah ketik tidak masalah** selama susunannya benar (A Username, B Full Name, C Group CV, D Join Date, E Date, F Check In, G Check Out): judul yang tidak dikenali dibaca menurut posisi dan muncul peringatan ⚠ di pratinjau. Bila kolom E ternyata bukan tanggal, import ditolak dengan pesan.
- Karyawan dicocokkan lewat Username, atau Full Name bila username tidak cocok. Baris tanpa Check In & Check Out (libur) dilewati. Check Out lebih kecil dari Check In dianggap pulang lewat tengah malam.
- Pratinjau per karyawan: jumlah hari, absen baru, dan yang **dilewati** (absen tanggal itu sudah ada — import ulang tidak membuat data dobel — atau tanggal yang belum lewat).
- Centang **Perbarui Group CV & Tanggal masuk** untuk mengisi Group CV (dibuat otomatis bila belum ada) dan tanggal masuk karyawan dari file.
- Absen hasil import langsung sah (bertanda *import*), ikut rekap & gaji, dan dicatat sekali di log aktivitas.
- Pemasangan: `deploy-functions.bat` (supaya log tidak mencatat setiap baris) + upload Cloudflare.

## 49. Lebih HK (masuk di tanggal merah / hari libur)
- Karyawan yang **bukan operator/supir** dan absen masuk di tanggal merah, libur perusahaan, atau hari off (mis. Minggu) dihitung ke kolom **Lebih HK**.
- Tampil di: Laporan > Rekap absensi (tabel, total, CSV), rincian absen per karyawan (ditandai "Lebih HK · …"), ringkasan Gaji > Hitung, CSV gaji, dan rekap di slip.
- Operator/supir (kehadiran "Manual (Excel)", cara hitung Operator, atau peran bernama Operator/Supir/Sopir/Driver) tidak dihitung Lebih HK.
- **Uang Lebih HK** diatur per perusahaan di **Gaji > Aturan > Lebih HK**:
  - *Tidak dibayar*: hanya dicatat jumlah harinya.
  - *Dibayar per hari*: jumlah hari × tarif. Tarif kosong = otomatis upah sehari (upah harian, atau gaji pokok + tunjangan tetap ÷ hari kerja).
  - *Dibayar per jam*: jam kerja di hari libur (masuk s/d pulang, dibulatkan ke bawah) × tarif. Tarif kosong = otomatis gaji ÷ 173.
- **Per karyawan bisa beda**: di Gaji > Karyawan, pilihan **Lebih HK (masuk hari libur)** = Ikut aturan / Tidak dibayar / Dibayar per hari / Dibayar per jam, dan kolom **U Lebih HK** untuk tarifnya (kosong = ikut tarif perusahaan, atau otomatis). Tekan Simpan gaji.
- Kalau Lebih HK dibayar, jam kerja di hari libur **tidak dihitung lembur lagi** supaya tidak dobel.
- Uang Lebih HK tampil di slip ("Lebih HK (x hari/jam × Rp)") dan di CSV gaji (kolom Uang Lebih HK).

## 50. Pengajuan lupa absen masuk / pulang
- Karyawan: **Ajukan izin / sakit / cuti / lupa absen** → Jenis **Lupa absen masuk** atau **Lupa absen pulang** → isi tanggal, jam (otomatis terisi jam kerja/shift, bisa diubah), keterangan → Kirim. Tanggal & jam tidak boleh di masa depan.
- Admin/supervisor: muncul di **Persetujuan** dengan label 🕘 Lupa absen masuk / 🕔 Lupa absen pulang. **Setujui** = jam tersebut langsung tercatat sebagai absen (sah, ditandai manual) dan ikut dihitung di laporan & gaji. **Tolak** = tidak ada absen yang dicatat.
- Pengajuan lupa absen tidak dihitung sebagai izin dan tidak mengurangi jatah cuti.
- Perlu deploy aturan database (deploy-rules.bat) dan functions (untuk teks notifikasi & log).

## 51. Cek kesiapan HP
- Karyawan: **Pengaturan > Cek kesiapan HP > 🩺 Cek HP sekarang** (atau link "Absen gagal? Cek kesiapan HP" di halaman Absen).
- Yang dicek: internet & jam HP, lokasi/GPS (izin + akurasi + jarak ke kantor), kamera, sensor sidik jari, data wajah/sidik jari di HP ini, kunci HP, notifikasi, dibuka dari aplikasi atau browser, penyimpanan permanen, versi aplikasi.
- Tiap masalah diberi petunjuk cara memperbaiki (langkah Setelan HP Xiaomi/Android), beberapa bisa langsung diperbaiki dengan tombol.
- Rincian hasil disimpan terpisah (koleksi `cekHP`) dan **hanya admin** yang bisa membacanya (supervisor & karyawan lain tidak bisa).
- Admin: **Laporan > Cek HP** = daftar semua karyawan + hasil cek terakhir (filter: bermasalah / belum pernah cek). Klik nama untuk rincian per item & riwayat cek. Ringkasannya juga tampil di kartu **Karyawan > Karyawan** (bisa diklik) dan tercatat di Log aktivitas.
- Yang tidak bisa dicek otomatis: pengaturan hemat baterai & aplikasi Cleaner (ditampilkan sebagai saran).

## 52. Pemulihan HP otomatis (data aplikasi terhapus / pasang ulang / ganti HP)
- Aktifkan di **Pengaturan > Verifikasi absen > Pulihkan HP otomatis dengan verifikasi wajah** lalu **Simpan metode**.
- Saat karyawan mendaftarkan wajah (atau membuka aplikasi kalau wajah sudah terdaftar), ciri wajahnya (angka, bukan foto) dicadangkan di server.
- Kalau data aplikasi di HP terhapus atau karyawan ganti HP: cukup tekan **Absen Masuk/Pulang**. Aplikasi mengambil cadangan wajah, meminta verifikasi wajah hidup, dan kalau cocok akun otomatis pindah ke HP itu — tanpa admin Reset.
- Setiap pemulihan tercatat di **Log aktivitas** ("HP dipulihkan otomatis dengan verifikasi wajah").
- Sidik jari tidak bisa dipulihkan (terikat ke HP lama): setelah pemulihan, karyawan mendaftarkan sidik jari ulang di Pengaturan.
- Admin **Reset > Wajah** juga menghapus cadangan wajah; karyawan mendaftar wajah ulang.
- Perlu deploy aturan database (deploy-rules.bat).
- Penyebab umum data terhapus: APK dihapus lalu dipasang ulang (untuk update cukup upload Cloudflare, tidak perlu pasang ulang APK), iPhone membuka bergantian dari Safari & ikon Layar Utama, aplikasi pembersih (Phone Master/Cleaner).

## 53. Keterangan cara verifikasi absen (wajah / sidik jari)
- **Laporan > Hari ini**: tiap absen diberi label 🙂 Wajah (dengan % kecocokan), 👆 Sidik jari, 🙂 Wajah + 👆 Sidik jari, 🖥️ Kios, ✍️ Manual admin, 📋 Lupa absen, atau 📥 Import Excel.
- **Laporan > Rekap absensi**: kolom **Verifikasi** = jumlah absen per cara (🙂 wajah · 👆 sidik jari · 🙂👆 keduanya · ✍️ manual/lainnya). Klik nama untuk melihat cara verifikasi setiap jam masuk/pulang.
- **CSV rekap**: kolom Absen wajah, Absen sidik jari, Absen wajah+jari, Absen manual/lainnya.
- **Persetujuan**: kartu absen di luar area menampilkan baris Verifikasi.

## 54. Riwayat persetujuan
- **Persetujuan > Riwayat**: semua pengajuan yang pernah masuk (absen di luar area / GPS lemah / kios, izin, sakit, cuti, lupa absen) beserta status Disetujui / Ditolak / Menunggu.
- Saring per tanggal (dari–sampai, dd/mm/yy), jenis, status, dan cari nama/alasan/catatan/penyetuju.
- Tiap kartu lengkap: detail pengajuan (jarak, alamat, verifikasi wajah/jari, alasan, lama hari, lampiran, selfie, peta), siapa yang memutuskan, kapan, dan catatannya.
- **Unduh CSV** untuk arsip.

## 55. Laporan absensi hari ini
- **Laporan > Hari ini**: tabel per karyawan — jam masuk & jam pulang, kolom **GPS** (koordinat masuk & pulang + akurasi + alamat, klik untuk buka Google Maps), cara verifikasi (🙂 wajah / 👆 sidik jari / keduanya / kios / manual), status persetujuan (Sah otomatis, Disetujui <nama>, Manual oleh <nama>, Lupa absen disetujui <nama>, ⏳ Menunggu), dan lokasi + jarak.
- Karyawan aktif yang belum absen ikut tampil (kecuali admin & karyawan kehadiran manual Excel). Saring: Semua / Yang sudah absen / Yang belum absen, dan cari nama.
- **Cetak** (A4 mendatar) dan **Unduh CSV**. Catatan absen lengkap per waktu ada di bagian "Semua catatan absen hari ini".
