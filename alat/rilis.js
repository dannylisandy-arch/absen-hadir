// Membuat folder "rilis" berisi salinan aplikasi dengan kode JavaScript yang diringkas & disamarkan
// (nama variabel diganti huruf acak, spasi & komentar dibuang). Kode asli di folder utama TIDAK diubah.
// Memakai esbuild: andal untuk ES module, hasilnya diuji agar tidak merusak aplikasi.
const fs = require("fs"), path = require("path");
let esbuild;
try{ esbuild = require("esbuild"); }
catch(e){ console.error("esbuild belum terpasang. Jalankan buat-rilis.bat (otomatis menjalankan npm install)."); process.exit(1); }

const AKAR = path.resolve(__dirname, ".."), KELUAR = path.join(AKAR, "rilis");
const FILE = ["_headers", "index.html", "admin.html", "kios.html", "offline.html", "privasi.html", "style.css", "manifest.json", "manifest-admin.json", "manifest-kios.json", "icon.svg", "notif-absen.mp3",
  "common.js", "payroll.js", "excel.js", "pajak.js", "index.js", "admin.js", "kios.js", "firebase-config.js", "firebase-messaging-sw.js"];
const FOLDER = ["icons", ".well-known"];
const TIDAK_DIRINGKAS = ["firebase-config.js"];          // konfigurasi memang publik, biarkan terbaca
const HAK_CIPTA = "/* (c) Absensi Hadir. Hak cipta dilindungi. Dilarang menyalin atau memakai tanpa izin. */\n";

fs.rmSync(KELUAR, { recursive: true, force: true });
fs.mkdirSync(KELUAR, { recursive: true });

for (const f of FILE){
  const asal = path.join(AKAR, f);
  if (!fs.existsSync(asal)){ console.error("File tidak ditemukan: " + f); process.exit(1); }
  let isi = fs.readFileSync(asal, "utf8");
  if (f.endsWith(".js") && !TIDAK_DIRINGKAS.includes(f)){
    const sw = f === "firebase-messaging-sw.js";
    try{
      isi = HAK_CIPTA + esbuild.transformSync(isi, {
        loader: "js", format: sw ? undefined : "esm", target: "es2020",
        minify: true, legalComments: "none", charset: "utf8"
      }).code;
    }catch(e){ console.error("Gagal meringkas " + f + ": " + e.message); process.exit(1); }
    console.log("  diringkas " + f);
  } else if (f.endsWith(".css")){
    try{ isi = esbuild.transformSync(isi, { loader: "css", minify: true }).code; }
    catch(e){ isi = isi.replace(/\/\*[\s\S]*?\*\//g, ""); }
    console.log("  diringkas " + f);
  } else if (f.endsWith(".html")){
    isi = isi.replace(/<!--[\s\S]*?-->/g, "");
    console.log("  disalin   " + f);
  } else console.log("  disalin   " + f);
  fs.writeFileSync(path.join(KELUAR, f), isi);
}
for (const d of FOLDER){
  fs.cpSync(path.join(AKAR, d), path.join(KELUAR, d), { recursive: true });
  console.log("  disalin   " + d + "/");
}
console.log("\nSelesai: folder 'rilis' siap.");
