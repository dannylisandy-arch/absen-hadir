const { onDocumentCreated, onDocumentUpdated, onDocumentWrittenWithAuthContext } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getMessaging } = require("firebase-admin/messaging");
const { hariLibur } = require("./libur");

initializeApp();
// Harus sama dengan lokasi database Firestore kamu (asia-southeast2 = Jakarta).
setGlobalOptions({ region: "asia-southeast2" });
const db = getFirestore();

// GANTI dengan alamat aplikasi kamu di Cloudflare Pages (tanpa garis miring di akhir).
const APP_URL = "https://absencsm.pages.dev";

async function kirim(snap, payload) {
  const tokens = snap.docs.map(d => d.id);
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({ tokens, ...payload });
  // Hapus token HP yang sudah tidak aktif
  const mati = ["messaging/registration-token-not-registered", "messaging/invalid-registration-token", "messaging/invalid-argument"];
  await Promise.all(res.responses.map((r, i) =>
    r.error && mati.includes(r.error.code) ? db.collection("tokens").doc(tokens[i]).delete() : null));
}

// Karyawan absen di luar area -> notifikasi ke semua admin & supervisor
exports.notifIzinBaru = onDocumentCreated("companies/{cid}/absensi/{id}", async (event) => {
  const d = event.data?.data();
  if (!d || d.status !== "menunggu" || d.demo) return;
  const t = await db.collection("tokens").where("cid", "==", event.params.cid).where("role", "in", ["admin", "supervisor", "superadmin"]).get();
  await kirim(t, {
    notification: d.kios ? {
      title: "Absen lewat kios",
      body: `${d.nama} absen ${d.type} di kios ${d.lokasi || "kantor"}${d.oleh ? " (dibuka " + d.oleh + ")" : ""}. Perlu persetujuan.`,
    } : {
      title: d.dist > d.rad ? "Absen di luar area" : "Absen dengan GPS lemah",
      body: `${d.nama} absen ${d.type}, ${Number(d.dist).toLocaleString("id-ID")} m dari ${d.lokasi || "kantor"}${d.alamat ? " (" + d.alamat + ")" : ""}. Alasan: ${d.alasan || "-"}`,
    },
    webpush: { fcmOptions: { link: APP_URL + "/admin.html" } },
  });
});

// Pemeriksaan server untuk absen dari HP karyawan: jarak dihitung ulang dari koordinat GPS ke lokasi kerja.
// Kalau ternyata di luar area / jarak tidak cocok dengan yang dikirim HP / GPS terlalu lemah -> status jadi "menunggu" (perlu persetujuan).
const jarakM = (a, b, c, d) => { const R = 6371000, r = x => x * Math.PI / 180, dLa = r(c - a), dLo = r(d - b);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
exports.periksaAbsen = onDocumentCreated("companies/{cid}/absensi/{id}", async (event) => {
  const d = event.data?.data(), cid = event.params.cid;
  if (!d || d.demo || d.manual || d.kios || d.import || d.status !== "otomatis") return;
  try{
    const [lokS, kanS, uS] = await Promise.all([
      db.doc(`companies/${cid}/settings/lokasi`).get(), db.doc(`companies/${cid}/settings/kantor`).get(), db.collection("users").doc(d.uid).get()]);
    const u = uS.data() || {}, tambah = Math.max(0, +u.radiusTambah || 0);
    let daftar = (lokS.data() || {}).daftar || [], akurasi = +(lokS.data() || {}).akurasi || 0;
    if (!daftar.length && kanS.exists){ const k = kanS.data(); daftar = [{ id: "kantor", nama: "Kantor", lat: k.lat, lng: k.lng, rad: k.rad }]; akurasi = akurasi || +k.akurasi || 0; }
    akurasi = akurasi || 100;
    const boleh = (u.lokasiKerja || []).length ? daftar.filter(L => u.lokasiKerja.includes(L.id)) : daftar;
    if (!boleh.length) return;                                  // perusahaan belum mengatur lokasi
    const alasan = [];
    if (typeof d.la !== "number" || typeof d.lo !== "number") alasan.push("tanpa koordinat GPS");
    else {
      const t = boleh.map(L => ({ L, m: jarakM(d.la, d.lo, +L.lat, +L.lng) })).sort((x, y) => x.m - y.m)[0];
      const rad = (+t.L.rad || 0) + tambah, m = Math.round(t.m);
      if (m > rad) alasan.push(`di luar area: ${m} m dari ${t.L.nama || "lokasi"} (batas ${rad} m)`);
      if (Math.abs(m - (+d.dist || 0)) > 50) alasan.push(`jarak dari HP (${+d.dist || 0} m) tidak cocok dengan koordinat (${m} m)`);
    }
    if (+d.acc > akurasi + tambah) alasan.push(`GPS lemah ±${Math.round(+d.acc)} m`);
    if (u.deviceId && d.device !== u.deviceId) alasan.push("perangkat tidak sesuai");
    if (!alasan.length) return;
    await event.data.ref.update({ status: "menunggu", dicekServer: true, curiga: alasan,
      alasan: "Ditandai server: " + alasan.join("; ") });
    const t = await db.collection("tokens").where("cid", "==", cid).where("role", "in", ["admin", "supervisor", "superadmin"]).get();
    await kirim(t, { notification: { title: "Absen perlu dicek", body: `${d.nama} absen ${d.type}: ${alasan.join("; ")}.` },
      webpush: { fcmOptions: { link: APP_URL + "/admin.html" } } });
  }catch(e){ console.error("periksaAbsen", e); }
});

// Admin/supervisor memutuskan -> notifikasi ke karyawan
exports.notifKeputusan = onDocumentUpdated("companies/{cid}/absensi/{id}", async (event) => {
  const before = event.data.before.data(), after = event.data.after.data();
  if (before.status !== "menunggu" || !["terima", "tolak"].includes(after.status)) return;
  const t = await db.collection("tokens").where("uid", "==", after.uid).get();
  const kata = after.status === "terima" ? "diterima" : "ditolak";
  await kirim(t, {
    notification: {
      title: `Absen ${kata}`,
      body: `Absen ${after.type} kamu ${kata} oleh ${after.by}.${after.note ? " Catatan: " + after.note : ""}`,
    },
    webpush: { fcmOptions: { link: APP_URL + "/index.html" } },
  });
});

// Pengajuan izin/sakit baru -> admin & supervisor
const jenisLabel = j => ({ sakit: "Sakit", cuti: "Cuti", lupaMasuk: "Tidak bisa absen masuk", lupaPulang: "Lupa absen pulang" })[j] || "Izin";
// tanggal tampil Medium Date: "06 Okt 26"
const BLN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const tglMed = (y, m, d) => String(d).padStart(2, "0") + " " + BLN[m - 1] + " " + String(y).slice(2);
const tgl = s => { const [y, m, d] = String(s).split("-").map(Number); return tglMed(y, m, d); };
const rentang = z => (z.mulai === z.selesai ? tgl(z.mulai) : tgl(z.mulai) + " – " + tgl(z.selesai)) + (z.jam ? " jam " + z.jam : "");

exports.notifIzinSakitBaru = onDocumentCreated("companies/{cid}/izin/{id}", async (event) => {
  const z = event.data?.data();
  if (!z || z.status !== "menunggu" || z.demo) return;
  const t = await db.collection("tokens").where("cid", "==", event.params.cid).where("role", "in", ["admin", "supervisor", "superadmin"]).get();
  await kirim(t, {
    notification: { title: `Pengajuan ${jenisLabel(z.jenis).toLowerCase()}`, body: `${z.nama}, ${rentang(z)}. Alasan: ${z.alasan || "-"}${z.lampiran?.length ? ` (📎 ${z.lampiran.length} lampiran)` : ""}` },
    webpush: { fcmOptions: { link: APP_URL + "/admin.html" } },
  });
});

exports.notifIzinSakitKeputusan = onDocumentUpdated("companies/{cid}/izin/{id}", async (event) => {
  const before = event.data.before.data(), after = event.data.after.data();
  if (before.status !== "menunggu" || !["terima", "tolak"].includes(after.status)) return;
  const t = await db.collection("tokens").where("uid", "==", after.uid).get();
  const kata = after.status === "terima" ? "disetujui" : "ditolak";
  await kirim(t, {
    notification: { title: `${jenisLabel(after.jenis)} ${kata}`,
      body: `Pengajuan ${jenisLabel(after.jenis).toLowerCase()} ${rentang(after)} ${kata} oleh ${after.by}.${after.note ? " Catatan: " + after.note : ""}` },
    webpush: { fcmOptions: { link: APP_URL + "/index.html" } },
  });
});

/* =====================================================================
   DATA DEMO: 10 karyawan + gaji + absensi ±1 bulan + izin (khusus admin)
   ===================================================================== */
const USERNAME_DOMAIN = "absensi.local";
// Ubah menjadi true SETELAH App Check aktif di aplikasi (APPCHECK_SITE_KEY terisi) dan metriknya sudah hijau.
const WAJIB_APPCHECK = false;   // harus sama dengan USERNAME_DOMAIN di firebase-config.js
const PASSWORD_DEMO = "demo1234";
const NAMA_DEMO = [
  ["Budi Santoso", "Staf Gudang", "Operasional"], ["Siti Rahmawati", "Admin Keuangan", "Keuangan"],
  ["Agus Pratama", "Sales", "Penjualan"], ["Dewi Lestari", "Kasir", "Operasional"],
  ["Rizky Maulana", "Teknisi", "Teknik"], ["Nur Aisyah", "Staf HRD", "SDM"],
  ["Fajar Nugroho", "Supervisor Gudang", "Operasional"], ["Putri Ayu", "Customer Service", "Penjualan"],
  ["Hendra Wijaya", "Driver", "Logistik"], ["Maya Sari", "Staf Admin", "Umum"]
];
const acak = (a, b) => a + Math.random() * (b - a);
const pad = n => String(n).padStart(2, "0");
const kunciTgl = d => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
// Jam WIB (UTC+7) -> Timestamp
const wib = (y, m, d, jam, menit) => Timestamp.fromDate(new Date(Date.UTC(y, m, d, jam - 7, menit)));

async function cekAdmin(req){
  if (!req.auth) throw new HttpsError("unauthenticated", "Harus login.");
  const me = (await db.collection("users").doc(req.auth.uid).get()).data() || {};
  const cid = String(req.data?.cid || "");
  if (!cid) throw new HttpsError("invalid-argument", "Perusahaan belum dipilih.");
  const boleh = me.role === "superadmin" || (me.role === "admin" && me.cid === cid && me.aktif !== false);
  if (!boleh) throw new HttpsError("permission-denied", "Hanya admin perusahaan ini yang bisa.");
  const co = await db.collection("companies").doc(cid).get();
  if (!co.exists) throw new HttpsError("not-found", "Perusahaan tidak ditemukan.");
  return { cid, co: co.data(), oleh: me.nama || "Admin", superadmin: me.role === "superadmin" };
}
async function tulisBanyak(ops){
  for (let i = 0; i < ops.length; i += 450){
    const b = db.batch();
    ops.slice(i, i + 450).forEach(([ref, data]) => data === null ? b.delete(ref) : b.set(ref, data));
    await b.commit();
  }
}

exports.buatDataDemo = onCall({ timeoutSeconds: 300, memory: "512MiB", enforceAppCheck: WAJIB_APPCHECK }, async (req) => {
  const { cid, co, oleh } = await cekAdmin(req);
  // Jumlah bisa diatur: karyawan 1–10 (bawaan 10); absen 0 = otomatis sebulan penuh, atau 1–500 absen acak
  const nKaryawan = Math.min(10, Math.max(1, parseInt(req.data?.jumlahKaryawan, 10) || 10));
  const nAbsen = Math.min(500, Math.max(0, parseInt(req.data?.jumlahAbsen, 10) || 0));
  const ada = await db.collection("users").where("cid", "==", cid).where("demo", "==", true).limit(1).get();
  if (!ada.empty) throw new HttpsError("already-exists", "Data demo sudah ada. Hapus dulu kalau mau membuat ulang.");

  const coRef = db.collection("companies").doc(cid);
  const kantor = (await coRef.collection("settings").doc("kantor").get()).data() || { lat: -6.175392, lng: 106.827153, rad: 100, alamat: "" };
  const aturan = (await coRef.collection("settings").doc("payroll").get()).data() || {};
  const hariKerja = aturan.hariKerja || [1, 2, 3, 4, 5];
  const libur = new Set(aturan.libur || []);
  const [jm, mm] = String(aturan.jamMasuk || "08:00").split(":").map(Number);
  const [jp, mp] = String(aturan.jamPulang || "17:00").split(":").map(Number);

  // "Hari ini" menurut WIB
  const sekarang = new Date(Date.now() + 7 * 3600e3);
  const Y = sekarang.getUTCFullYear(), M = sekarang.getUTCMonth(), D = sekarang.getUTCDate();
  const awal = new Date(Date.UTC(Y, M - 1, 1));
  const hariIniKey = kunciTgl(new Date(Date.UTC(Y, M, D)));

  const ops = [], akun = [];
  let jumlahAbsen = 0;
  const dibuat = [];                                     // { uid, nama } untuk absen acak
  for (const [i, [nama, jabatan, divisi]] of NAMA_DEMO.slice(0, nKaryawan).entries()){
    // Username unik: "budi.demo", "budi.demo2", ...
    const depan = nama.split(" ")[0].toLowerCase();
    let username = depan + ".demo", n = 1;
    while ((await db.collection("usernames").doc(username).get()).exists) username = depan + ".demo" + (++n);
    const u = await getAuth().createUser({ email: username + "@" + USERNAME_DOMAIN, password: PASSWORD_DEMO, displayName: nama });
    const uid = u.uid, role = i === 6 ? "supervisor" : "karyawan";
    akun.push({ nama, username, role });

    ops.push([db.collection("users").doc(uid), {
      nama, username, role, cid, kode: co.kode, jabatan, divisi, aktif: true, demo: true,
      hp: "08" + Math.floor(acak(1e9, 9e9)), masuk: (Y - 1 - (i % 3)) + "-" + pad(1 + (i % 12)) + "-" + pad(1 + (i * 3) % 27),
      alamat: "Alamat contoh " + (i + 1), dibuat: FieldValue.serverTimestamp(), dibuatOleh: oleh + " (data demo)"
    }]);
    ops.push([db.collection("usernames").doc(username), { uid, cid, demo: true }]);
    const gp = Math.round(acak(4.2e6, 7.5e6) / 1e5) * 1e5;
    ops.push([coRef.collection("payroll").doc(uid), {
      gajiPokok: gp, tjJabatan: role === "supervisor" ? 750000 : (i % 3 === 0 ? 250000 : 0),
      tjTransport: 300000, tunjangan: 150000, bonus: {}, ikutKes: true, ikutJht: true, ikutJp: i % 4 !== 3, kenaPph: gp > 5.5e6, demo: true
    }]);

    dibuat.push({ uid, nama });
    if (nAbsen) continue;                               // mode absen acak: dibuat setelah semua akun siap

    // Pola tiap karyawan
    const pTelat = [0.05, 0.1, 0.3, 0.08, 0.15, 0.05, 0.03, 0.2, 0.25, 0.1][i];
    const pAlpa = [0.02, 0, 0.06, 0.03, 0.04, 0, 0, 0.05, 0.08, 0.02][i];
    const pLembur = [0.3, 0.1, 0.15, 0.1, 0.35, 0.05, 0.25, 0.1, 0.2, 0.05][i];

    // Sakit 2 hari bulan lalu untuk karyawan ke-4 (disetujui)
    const sakit = new Set();
    if (i === 3){
      const s1 = new Date(Date.UTC(Y, M - 1, 10)), s2 = new Date(Date.UTC(Y, M - 1, 11));
      sakit.add(kunciTgl(s1)); sakit.add(kunciTgl(s2));
      ops.push([coRef.collection("izin").doc(), { uid, nama, jenis: "sakit", mulai: kunciTgl(s1), selesai: kunciTgl(s2),
        alasan: "Demam (data demo)", status: "terima", by: oleh, note: "", demo: true,
        ts: wib(Y, M - 1, 10, 6, 30), decidedAt: wib(Y, M - 1, 10, 8, 5) }]);
    }
    // Izin menunggu untuk karyawan ke-6 (2 hari ke depan)
    if (i === 5){
      const z1 = new Date(Date.UTC(Y, M, D + 2)), z2 = new Date(Date.UTC(Y, M, D + 3));
      ops.push([coRef.collection("izin").doc(), { uid, nama, jenis: "izin", mulai: kunciTgl(z1), selesai: kunciTgl(z2),
        alasan: "Acara keluarga (data demo)", status: "menunggu", demo: true, ts: Timestamp.now() }]);
    }

    for (let d = new Date(awal); kunciTgl(d) <= hariIniKey; d.setUTCDate(d.getUTCDate() + 1)){
      const k = kunciTgl(d), y = d.getUTCFullYear(), m = d.getUTCMonth(), t = d.getUTCDate();
      if (!hariKerja.includes(d.getUTCDay()) || libur.has(k) || sakit.has(k)) continue;
      const hariIni = k === hariIniKey;
      if (!hariIni && Math.random() < pAlpa) continue;
      if (hariIni && i === 9) continue;                                   // satu orang belum datang hari ini
      const telat = Math.random() < pTelat ? Math.round(acak(16, 55)) : -Math.round(acak(0, 20));
      const luar = hariIni && (i === 2 || i === 8);                       // 2 absen di luar area menunggu persetujuan
      const dist = luar ? Math.round(acak(600, 1500)) : Math.round(acak(5, 60));
      const geser = dist / 111000;
      const dasar = { uid, nama, rad: kantor.rad || 100, acc: Math.round(acak(6, 28)), la: +(kantor.lat + geser * 0.7).toFixed(6),
        lo: +(kantor.lng + geser * 0.7).toFixed(6), alamat: luar ? "Lokasi klien (data demo)" : (kantor.alamat || ""),
        face: +acak(0.84, 0.95).toFixed(3), finger: true, live: true, device: "demo", foto: null, demo: true, dist };
      ops.push([coRef.collection("absensi").doc(), { ...dasar, type: "masuk", ts: wib(y, m, t, jm, mm + telat),
        status: luar ? "menunggu" : "otomatis", ...(luar ? { alasan: i === 2 ? "Kunjungan klien (data demo)" : "Antar barang ke cabang (data demo)" } : {}) }]);
      jumlahAbsen++;
      if (!hariIni){
        const lembur = Math.random() < pLembur ? Math.round(acak(60, 180)) : Math.round(acak(0, 20));
        ops.push([coRef.collection("absensi").doc(), { ...dasar, type: "pulang", ts: wib(y, m, t, jp, mp + lembur), status: "otomatis" }]);
        jumlahAbsen++;
      }
    }
  }
  // ---- Mode absen acak: tepat nAbsen catatan (pasangan masuk & pulang) dalam 3 minggu terakhir
  if (nAbsen){
    const hariKerjaList = [];
    for (let k = 21; k >= 0; k--){
      const d = new Date(Date.UTC(Y, M, D - k));
      if (hariKerja.includes(d.getUTCDay()) && !libur.has(kunciTgl(d))) hariKerjaList.push(d);
    }
    const dipakai = new Set(), acakDari = a => a[Math.floor(Math.random() * a.length)];
    let sisa = nAbsen, cobaan = 0, luarDibuat = false;
    while (sisa > 0 && cobaan++ < 5000){
      const e = acakDari(dibuat), d = acakDari(hariKerjaList), k = e.uid + "|" + kunciTgl(d);
      if (dipakai.has(k)) continue; dipakai.add(k);
      const y = d.getUTCFullYear(), m = d.getUTCMonth(), t = d.getUTCDate(), hariIni = kunciTgl(d) === hariIniKey;
      const telat = Math.random() < 0.25 ? Math.round(acak(16, 50)) : -Math.round(acak(0, 25));
      const luar = !luarDibuat && nAbsen >= 10 && Math.random() < 0.15;   // satu contoh absen di luar area
      if (luar) luarDibuat = true;
      const dist = luar ? Math.round(acak(600, 1500)) : Math.round(acak(5, 60)), geser = dist / 111000;
      const dasar = { uid: e.uid, nama: e.nama, rad: kantor.rad || 100, acc: Math.round(acak(6, 28)),
        la: +(kantor.lat + geser * 0.7).toFixed(6), lo: +(kantor.lng + geser * 0.7).toFixed(6),
        alamat: luar ? "Lokasi klien (data demo)" : (kantor.alamat || ""), face: +acak(0.84, 0.95).toFixed(3),
        finger: true, live: true, device: "demo", foto: null, demo: true, dist, lokasi: "Kantor" };
      ops.push([coRef.collection("absensi").doc(), { ...dasar, type: "masuk", ts: wib(y, m, t, jm, mm + telat),
        status: luar ? "menunggu" : "otomatis", ...(luar ? { alasan: "Kunjungan klien (data demo)" } : {}) }]);
      sisa--; jumlahAbsen++;
      if (sisa > 0 && !hariIni){
        const lembur = Math.random() < 0.25 ? Math.round(acak(60, 150)) : Math.round(acak(0, 20));
        ops.push([coRef.collection("absensi").doc(), { ...dasar, type: "pulang", ts: wib(y, m, t, jp, mp + lembur), status: "otomatis" }]);
        sisa--; jumlahAbsen++;
      }
    }
  }
  await tulisBanyak(ops);
  await catatLog(cid, { uid: req.auth.uid, nama: oleh, role: "" }, "demo", `Mengisi data demo: ${akun.length} karyawan, ${jumlahAbsen} absen`);
  return { ok: true, akun, password: PASSWORD_DEMO, jumlahAbsen };
});

exports.hapusDataDemo = onCall({ timeoutSeconds: 300, memory: "512MiB", enforceAppCheck: WAJIB_APPCHECK }, async (req) => {
  const { cid, co, superadmin } = await cekAdmin(req);
  if (co.modeDemo && !superadmin) throw new HttpsError("permission-denied", "Perusahaan demo publik: data demo hanya bisa dihapus superadmin.");
  const coRef = db.collection("companies").doc(cid);
  const us = await db.collection("users").where("cid", "==", cid).where("demo", "==", true).get();
  const ops = [];
  for (const u of us.docs){
    const uid = u.id, d = u.data();
    try{ await getAuth().deleteUser(uid); }catch(e){}
    ops.push([u.ref, null]);
    if (d.username) ops.push([db.collection("usernames").doc(d.username), null]);
    ops.push([coRef.collection("payroll").doc(uid), null]);
    for (const kol of ["absensi", "izin", "slips"]){
      const q = await coRef.collection(kol).where("uid", "==", uid).get();
      q.docs.forEach(x => ops.push([x.ref, null]));
    }
  }
  await tulisBanyak(ops);
  await catatLog(cid, { uid: req.auth.uid, nama: "Admin", role: "" }, "demo", `Menghapus data demo: ${us.size} karyawan, ${ops.length} data`);
  return { ok: true, karyawan: us.size, dokumen: ops.length };
});

/* =====================================================================
   UBAH PASSWORD PENGGUNA (khusus admin perusahaan itu / superadmin)
   ===================================================================== */
exports.ubahPassword = onCall({ enforceAppCheck: WAJIB_APPCHECK }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Harus login.");
  const uid = String(req.data?.uid || ""), pw = String(req.data?.password || "");
  if (!uid) throw new HttpsError("invalid-argument", "Pengguna belum dipilih.");
  if (pw.length < 8) throw new HttpsError("invalid-argument", "Password minimal 8 karakter.");
  const [meSnap, tSnap] = await Promise.all([db.collection("users").doc(req.auth.uid).get(), db.collection("users").doc(uid).get()]);
  const me = meSnap.data() || {}, t = tSnap.data();
  if (!t) throw new HttpsError("not-found", "Pengguna tidak ditemukan.");
  const superadmin = me.role === "superadmin";
  const adminSama = me.role === "admin" && me.aktif !== false && me.cid && me.cid === t.cid;
  if (!superadmin && !adminSama) throw new HttpsError("permission-denied", "Hanya admin perusahaan ini yang bisa mengubah password.");
  if (t.role === "superadmin" && !superadmin) throw new HttpsError("permission-denied", "Password superadmin tidak bisa diubah oleh admin.");
  if (t.akunDemo && !superadmin) throw new HttpsError("permission-denied", "Password akun demo publik dikunci. Hanya superadmin yang bisa mengubahnya.");
  await getAuth().updateUser(uid, { password: pw });
  await getAuth().revokeRefreshTokens(uid);                 // keluarkan sesi lama di perangkat lain
  await tSnap.ref.update({ passwordDiubah: FieldValue.serverTimestamp(), passwordDiubahOleh: me.nama || "Admin" });
  await catatLog(t.cid, { uid: req.auth.uid, nama: me.nama, role: me.role }, "akun", "Mengubah password " + t.nama, { target: t.nama });
  return { ok: true };
});

/* =====================================================================
   HAPUS KARYAWAN (khusus admin perusahaan itu / superadmin)
   ===================================================================== */
exports.hapusKaryawan = onCall({ timeoutSeconds: 300, memory: "512MiB", enforceAppCheck: WAJIB_APPCHECK }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Harus login.");
  const uid = String(req.data?.uid || ""), hapusData = !!req.data?.hapusData;
  if (!uid) throw new HttpsError("invalid-argument", "Karyawan belum dipilih.");
  if (uid === req.auth.uid) throw new HttpsError("failed-precondition", "Tidak bisa menghapus akun sendiri.");
  const [meSnap, tSnap] = await Promise.all([db.collection("users").doc(req.auth.uid).get(), db.collection("users").doc(uid).get()]);
  const me = meSnap.data() || {}, t = tSnap.data();
  if (!t) throw new HttpsError("not-found", "Karyawan tidak ditemukan.");
  const superadmin = me.role === "superadmin";
  const adminSama = me.role === "admin" && me.aktif !== false && me.cid && me.cid === t.cid;
  if (!superadmin && !adminSama) throw new HttpsError("permission-denied", "Hanya admin perusahaan ini yang bisa menghapus karyawan.");
  if (t.role === "superadmin") throw new HttpsError("permission-denied", "Akun superadmin tidak bisa dihapus dari sini.");
  if (!superadmin && t.akunDemo) throw new HttpsError("permission-denied", "Akun demo publik hanya bisa dihapus superadmin.");
  if (!superadmin && t.cid && (await db.collection("companies").doc(t.cid).get()).data()?.modeDemo)
    throw new HttpsError("permission-denied", "Perusahaan demo publik: karyawan hanya bisa dihapus superadmin.");

  try{ await getAuth().deleteUser(uid); }catch(e){ if (e.code !== "auth/user-not-found") throw e; }
  const ops = [[tSnap.ref, null]];
  if (t.username) ops.push([db.collection("usernames").doc(t.username), null]);
  if (t.deviceId) ops.push([db.collection("devices").doc(t.deviceId), null]);
  (await db.collection("tokens").where("uid", "==", uid).get()).docs.forEach(x => ops.push([x.ref, null]));
  let jumlahData = 0;
  if (t.cid){
    const coRef = db.collection("companies").doc(t.cid);
    ops.push([coRef.collection("payroll").doc(uid), null]);
    if (hapusData){
      for (const kol of ["absensi", "izin", "slips"]){
        const q = await coRef.collection(kol).where("uid", "==", uid).get();
        q.docs.forEach(x => ops.push([x.ref, null])); jumlahData += q.size;
      }
    }
  }
  await tulisBanyak(ops);
  if (hapusData){
    const bucket = getStorage().bucket();
    for (const prefix of [`absen/${uid}/`, `izin/${uid}/`]){ try{ await bucket.deleteFiles({ prefix }); }catch(e){} }
  }
  await catatLog(t.cid, { uid: req.auth.uid, nama: me.nama, role: me.role }, "akun",
    `Menghapus akun ${t.nama} (@${t.username})${hapusData ? " beserta " + jumlahData + " data riwayat" : ""}`, { target: t.nama });
  return { ok: true, nama: t.nama, jumlahData };
});

/* =====================================================================
   LOG AKTIVITAS (ditulis server, tidak bisa diubah/dihapus pengguna)
   ===================================================================== */
async function pelaku(ev){
  const id = ev.authId, tipe = ev.authType;
  if (!id || tipe !== "app_user") return { uid: "", nama: "Sistem", role: "" };
  const d = (await db.collection("users").doc(id).get()).data() || {};
  return { uid: id, nama: d.nama || "?", role: d.role || "" };
}
async function catatLog(cid, p, aksi, ket, extra = {}){
  if (!cid) return;
  await db.collection("companies").doc(cid).collection("log").add({
    ts: FieldValue.serverTimestamp(), uid: p.uid || "", nama: p.nama || "Sistem", role: p.role || "", aksi, ket, sumber: "server", ...extra });
}
const sebelumSesudah = ev => ({ b: ev.data?.before?.exists ? ev.data.before.data() : null, a: ev.data?.after?.exists ? ev.data.after.data() : null });
const STATUS_TXT = { otomatis: "sah", menunggu: "menunggu persetujuan", terima: "diterima", tolak: "ditolak" };
const fmtTglLog = s => tgl(s);

exports.logAbsensi = onDocumentWrittenWithAuthContext("companies/{cid}/absensi/{id}", async ev => {
  const { b, a } = sebelumSesudah(ev), d = a || b; if (!d || d.demo) return;
  if (!b && a && a.import) return;                 // hasil import Excel: dicatat sekali sebagai ringkasan oleh aplikasi
  const p = await pelaku(ev), cid = ev.params.cid;
  // Posisi GPS saat absen (dari HP karyawan, atau lokasi kios) ikut tercatat di log
  const gps = x => x && x.la != null && x.lo != null ? { la: x.la, lo: x.lo, acc: x.acc || 0, ...(x.alamat ? { alamat: x.alamat } : {}) } : {};
  if (!b && a && a.dariPengingat) return catatLog(cid, { uid: a.uid, nama: a.nama || "?", role: "karyawan" }, "absen",
    (a.tutupOtomatis ? "Tidak menjawab pengingat, absen pulang ditutup otomatis " : "Lupa absen pulang (jawab pengingat): pulang dicatat ") + `${a.ts?.toDate ? jamWib(a.ts.toDate()) : ""}, lembur tidak dihitung`, { target: a.nama });
  if (!b && a && a.manual) return catatLog(cid, p, "absen", `Mencatat absen manual ${a.type} ${a.nama} (${a.ts?.toDate ? (j => tglMed(+j.slice(0, 4), +j.slice(5, 7), +j.slice(8, 10)) + " " + j.slice(11, 16))(new Date(a.ts.toDate().getTime() + 7 * 3600e3).toISOString()) : ""})${a.alasan ? " · " + a.alasan : ""}`, { target: a.nama });
  if (!b && a && a.kios) return catatLog(cid, p, "absen", `Absen ${a.type} ${a.nama} via kios ${a.lokasi || ""} (${STATUS_TXT[a.status] || a.status})`, { target: a.nama, perangkat: a.perangkat || "", ...gps(a) });
  if (!b && a) return catatLog(cid, p, "absen", `Absen ${a.type} (${STATUS_TXT[a.status] || a.status}) · ${a.dist} m dari ${a.lokasi || "kantor"}${a.gpsLemah ? " · GPS lemah" : ""}`, { target: a.nama, perangkat: a.perangkat || "", ...gps(a) });
  if (b && a && a.status === "menunggu" && a.dicekServer && !b.dicekServer)
    return catatLog(cid, { uid: "sistem", nama: "Sistem", role: "sistem" }, "absen", `Absen ${a.type} ${a.nama} ditandai perlu dicek: ${(a.curiga || []).join("; ")}`, { target: a.nama, ...gps(a) });
  if (b && a && b.status !== a.status)
    return catatLog(cid, p, a.status === "terima" ? "setujui" : "tolak", `${a.status === "terima" ? "Menyetujui" : "Menolak"} absen ${a.type} ${a.nama}${a.note ? " · " + a.note : ""}`, { target: a.nama });
  if (b && !a) return catatLog(cid, p, "hapus", `Menghapus absen ${b.type} ${b.nama}`, { target: b.nama });
});

exports.logIzin = onDocumentWrittenWithAuthContext("companies/{cid}/izin/{id}", async ev => {
  const { b, a } = sebelumSesudah(ev), d = a || b; if (!d || d.demo) return;
  const p = await pelaku(ev), cid = ev.params.cid, rent = z => fmtTglLog(z.mulai) + (z.selesai !== z.mulai ? "–" + fmtTglLog(z.selesai) : "") + (z.jam ? " jam " + z.jam : ""), jn = j => jenisLabel(j).toLowerCase();
  if (!b && a) return catatLog(cid, p, "izin", `Mengajukan ${jn(a.jenis)} ${rent(a)}${a.lampiran?.length ? " · " + a.lampiran.length + " lampiran" : ""}`, { target: a.nama });
  if (b && a && b.status !== a.status)
    return catatLog(cid, p, a.status === "terima" ? "setujui" : "tolak", `${a.status === "terima" ? "Menyetujui" : "Menolak"} ${jn(a.jenis)} ${a.nama} ${rent(a)}`, { target: a.nama });
  if (b && !a) return catatLog(cid, p, "izin", `Membatalkan pengajuan ${jn(b.jenis)} ${rent(b)}`, { target: b.nama });
});

const NAMA_SETTING = { lokasi: "lokasi absen", payroll: "aturan gaji", verifikasi: "metode verifikasi" };
exports.logPengaturan = onDocumentWrittenWithAuthContext("companies/{cid}/settings/{sid}", async ev => {
  const nama = NAMA_SETTING[ev.params.sid]; if (!nama) return;           // "kantor" ikut tersimpan bersama lokasi
  const { a } = sebelumSesudah(ev), p = await pelaku(ev);
  let ket = "Mengubah " + nama;
  if (ev.params.sid === "lokasi" && a?.daftar) ket += ": " + a.daftar.map(L => L.nama + " (" + L.rad + " m)").join(", ");
  if (ev.params.sid === "verifikasi" && a?.metode) ket += ": " + ({ salah: "wajah atau sidik jari", wajah: "wajah saja", jari: "sidik jari saja", keduanya: "wajah dan sidik jari" }[a.metode] || a.metode);
  return catatLog(ev.params.cid, p, "pengaturan", ket);
});

exports.logGaji = onDocumentWrittenWithAuthContext("companies/{cid}/payroll/{uid}", async ev => {
  const { b, a } = sebelumSesudah(ev); if ((a || b)?.demo) return;
  const p = await pelaku(ev);
  // RIWAYAT (server): setiap kali data gaji berubah, versi SEBELUMNYA disalin -> selalu bisa dikembalikan,
  // dari aplikasi versi mana pun / perangkat mana pun
  if (b && JSON.stringify(b) !== JSON.stringify(a)){
    await db.collection("companies").doc(ev.params.cid).collection("payroll").doc(ev.params.uid).collection("riwayat").add({
      data: b, ts: FieldValue.serverTimestamp(), oleh: p.nama || "Sistem", olehUid: p.uid || "", role: p.role || "",
      sumber: a ? "diubah" : "dihapus", appVer: a?.appVer || "versi lama" }).catch(() => {});
  }
  if (!a && b) return;
  if (!p.uid) return;
  const t = (await db.collection("users").doc(ev.params.uid).get()).data() || {};
  return catatLog(ev.params.cid, p, "gaji", "Mengubah data gaji " + (t.nama || "karyawan"), { target: t.nama || "" });
});

// Riwayat kehadiran manual (server): versi sebelumnya disalin setiap kali berubah
exports.riwayatManual = onDocumentWrittenWithAuthContext("companies/{cid}/kehadiranManual/{ym}", async ev => {
  const { b, a } = sebelumSesudah(ev); if (!b || JSON.stringify(b.data || {}) === JSON.stringify(a?.data || {})) return;
  const p = await pelaku(ev);
  await db.collection("companies").doc(ev.params.cid).collection("kehadiranManual").doc(ev.params.ym).collection("riwayat").add({
    ...b, dicadangkan: FieldValue.serverTimestamp(), olehCadang: p.nama || "Sistem", sumber: a ? "diubah" : "dihapus" }).catch(() => {});
});

exports.logSlip = onDocumentWrittenWithAuthContext("companies/{cid}/slips/{id}", async ev => {
  const { a } = sebelumSesudah(ev); if (!a) return;
  const p = await pelaku(ev); if (!p.uid) return;
  return catatLog(ev.params.cid, p, "gaji", `Menyimpan slip gaji ${a.nama} ${a.label}`, { target: a.nama });
});

exports.logPengguna = onDocumentWrittenWithAuthContext("users/{uid}", async ev => {
  const { b, a } = sebelumSesudah(ev), d = a || b; if (!d || d.demo || !d.cid) return;
  const p = await pelaku(ev);
  if (!b) return catatLog(d.cid, p, "akun", `Menambah akun ${a.nama} (@${a.username}, ${a.role})`, { target: a.nama });
  if (!a){ if (!p.uid) return; return catatLog(d.cid, p, "akun", `Menghapus akun ${b.nama} (@${b.username})`, { target: b.nama }); }
  const ubah = [];
  if (b.role !== a.role) ubah.push(`peran ${b.role} → ${a.role}`);
  if ((b.aktif !== false) !== (a.aktif !== false)) ubah.push(a.aktif === false ? "dinonaktifkan" : "diaktifkan kembali");
  if (b.deviceId && !a.deviceId) ubah.push("reset HP (kunci perangkat dibuka)");
  if (b.daftarWajah && !a.daftarWajah) ubah.push("reset wajah");
  if (b.daftarJari && !a.daftarJari) ubah.push("reset sidik jari");
  if (!b.deviceId && a.deviceId) ubah.push("terkunci ke HP");
  if (!b.daftarWajah && a.daftarWajah) ubah.push("mendaftarkan wajah");
  if (!b.daftarJari && a.daftarJari) ubah.push("mendaftarkan sidik jari");
  if (!b.berhenti && a.berhenti) ubah.push(`dicatat berhenti (${a.berhenti.jenis}, ${a.berhenti.tanggal})${a.berhenti.lampiran?.length ? " + " + a.berhenti.lampiran.length + " surat" : ""}`);
  if (b.berhenti && !a.berhenti) ubah.push("status berhenti dibatalkan");
  const kolom = ["nama", "nik", "jabatan", "divisi", "hp", "masuk", "alamat", "lokasiKerja"].filter(k => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null));
  if (kolom.length) ubah.push("data diubah: " + kolom.join(", "));
  if (!ubah.length) return;
  return catatLog(d.cid, p, "akun", `${a.nama}: ${ubah.join(" · ")}`, { target: a.nama });
});

exports.logPerusahaan = onDocumentWrittenWithAuthContext("companies/{cid}", async ev => {
  const { b, a } = sebelumSesudah(ev); if (!a) return;
  const p = await pelaku(ev);
  if (!b) return catatLog(ev.params.cid, p, "perusahaan", `Perusahaan ${a.nama} (${a.kode}) dibuat`);
  const kolom = ["nama", "kode", "alamat", "telp", "logo"].filter(k => (b[k] || "") !== (a[k] || ""));
  if (!kolom.length) return;
  return catatLog(ev.params.cid, p, "perusahaan", "Mengubah data perusahaan: " + kolom.join(", "));
});

/* =====================================================================
   AKUN DEMO PUBLIK: pulihkan password & status setiap 30 menit
   (menutup celah ganti password langsung lewat Firebase dari browser)
   ===================================================================== */
exports.pulihkanAkunDemo = onSchedule({ schedule: "every 30 minutes", timeZone: "Asia/Jakarta" }, async () => {
  const q = await db.collection("users").where("akunDemo", "==", true).get();
  for (const d of q.docs){
    const u = d.data();
    try{ await getAuth().updateUser(d.id, { password: u.passwordDemo || "Demo01", disabled: false }); }
    catch(e){ console.warn("Gagal memulihkan akun demo", d.id, e.message); }
    if (u.aktif === false) await d.ref.update({ aktif: true });
  }
});


/* =====================================================================
   PENGINGAT ABSEN PULANG
   Karyawan yang absen masuk tapi belum absen pulang mendapat notifikasi 2 jam dan 4 jam
   setelah jam pulang kerjanya (maks. 2 kali), dengan pilihan:
   - "Masih lembur"      -> tidak ada yang berubah, lembur dihitung dari absen pulang nanti
   - "Lupa absen pulang" -> absen pulang dicatat di JAM PULANG KERJA, lembur tidak dihitung, langsung sah
   ===================================================================== */
const WIB = 7 * 3600e3;
const jamWib = d => { const j = new Date(d.getTime() + WIB); return String(j.getUTCHours()).padStart(2, "0") + "." + String(j.getUTCMinutes()).padStart(2, "0"); };
// Jadwal pulang = tanggal absen masuk (WIB) pada jam pulang kerja; kalau tidak lebih dari jam masuk (shift malam) -> besoknya
async function jadwalPulang(cid, uid, tsMasuk, cache = {}){
  const u = cache["u:" + uid] ||= (await db.collection("users").doc(uid).get()).data() || null;
  if (!u || u.aktif === false || u.kehadiran === "manual") return null;
  const A = cache.payroll ||= (await db.collection("companies").doc(cid).collection("settings").doc("payroll").get()).data() || {};
  const S = (A.shifts || []).find(x => x.id === u.shift);
  const [ph, pm] = String(S?.pulang || A.jamPulang || "17:00").split(":").map(Number);
  if (isNaN(ph)) return null;
  cache["jk:" + uid] = String(S?.masuk || A.jamMasuk || "08:00").replace(":", ".") + " - " + String(S?.pulang || A.jamPulang || "17:00").replace(":", ".");
  const w = new Date(tsMasuk.getTime() + WIB);
  // Masuk di hari libur / tanggal merah: jam kerja tidak berlaku (jam bebas, dihitung Lebih HK) -> tanpa pengingat & tanpa tutup otomatis
  if (hariLibur(A, w.toISOString().slice(0, 10), w.getUTCDay())) return null;
  let j = new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), ph, pm || 0) - WIB);
  while (j <= tsMasuk) j = new Date(j.getTime() + 24 * 3600e3);
  return j;
}
exports.pengingatPulang = onSchedule({ schedule: "every 15 minutes", timeZone: "Asia/Jakarta" }, async () => {
  const now = new Date(), dari = Timestamp.fromDate(new Date(now.getTime() - 30 * 3600e3));
  const cos = await db.collection("companies").get();
  for (const co of cos.docs){
    if (co.data().modeDemo) continue;
    const cid = co.id, cache = {};
    const snap = await co.ref.collection("absensi").where("ts", ">=", dari).get();
    const per = {};
    snap.docs.forEach(d => { const x = d.data(); if (x.status === "tolak" || x.demo || !x.ts?.toMillis) return; (per[x.uid] ||= []).push({ id: d.id, ...x }); });
    for (const [uid, list] of Object.entries(per)){
      list.sort((a, b) => a.ts.toMillis() - b.ts.toMillis());
      const akhir = list[list.length - 1];
      if (akhir.type !== "masuk") continue;
      try{
        const jadwal = await jadwalPulang(cid, uid, akhir.ts.toDate(), cache); if (!jadwal) continue;
        const lewat = now - jadwal, ke = lewat >= 4 * 3600e3 ? 2 : lewat >= 2 * 3600e3 ? 1 : 0;
        if (!ke) continue;
        // lembur tanggal itu sudah diisi & disetujui admin -> tidak perlu pengingat / tutup otomatis
        const tglW = new Date(akhir.ts.toMillis() + WIB).toISOString().slice(0, 10);
        if (((await co.ref.collection("lembur").doc(uid + "_" + tglW).get()).data() || {}).status === "lembur") continue;
        const pRef = co.ref.collection("pengingat").doc(akhir.id), p = (await pRef.get()).data() || {};
        if (p.jawab === "lupa") continue;
        // 2 jam setelah pengingat terakhir tanpa jawaban -> otomatis dianggap lupa absen pulang (jam pulang kerja, tanpa lembur)
        if (lewat >= 6 * 3600e3){
          if (p.jawab === "lembur") continue;
          await co.ref.collection("absensi").add({ uid, nama: akhir.nama || "", type: "pulang", status: "terima", ts: Timestamp.fromDate(jadwal),
            manual: true, dariPengingat: true, tutupOtomatis: true, by: "sistem", byUid: "sistem",
            alasan: "Tidak menjawab pengingat absen pulang, dianggap lupa absen pulang (lembur tidak dihitung)", decidedAt: FieldValue.serverTimestamp(),
            dist: 0, rad: 0, acc: 0, lokasi: "manual", device: "pengingat", live: false, foto: null, face: null, finger: false });
          await pRef.set({ uid, nama: akhir.nama || "", jawab: "otomatis", dijawab: FieldValue.serverTimestamp() }, { merge: true });
          continue;
        }
        if (p.jawab === "lembur") continue;                 // sudah menjawab Lembur: tidak diingatkan lagi
        if ((p.n || 0) >= ke) continue;
        const t = await db.collection("tokens").where("uid", "==", uid).get();
        await kirim(t, {
          data: { jenis: "pengingatPulang", masukId: akhir.id, cid, ke: String(ke), url: APP_URL + "/index.html",
                  judul: "Kamu belum absen Pulang", isi: `Jam kerja anda ${cache["jk:" + uid]}. Anda Lembur atau Lupa Absen Pulang?` },
          webpush: { headers: { Urgency: "high", TTL: "7200" } },
        });
        await pRef.set({ uid, nama: akhir.nama || "", n: ke, terakhir: FieldValue.serverTimestamp(), jadwal: Timestamp.fromDate(jadwal) }, { merge: true });
      }catch(e){ console.warn("pengingatPulang", cid, uid, e.message); }
    }
  }
});
// Jawaban karyawan dari notifikasi / aplikasi
exports.jawabPengingat = onCall({ enforceAppCheck: WAJIB_APPCHECK }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Login dulu.");
  const { cid, masukId, jawab } = req.data || {};
  if (!cid || !masukId || !["lupa", "lembur"].includes(jawab)) throw new HttpsError("invalid-argument", "Data tidak lengkap.");
  const co = db.collection("companies").doc(String(cid)), ref = co.collection("absensi");
  const m = await ref.doc(String(masukId)).get();
  if (!m.exists) throw new HttpsError("not-found", "Absen masuk tidak ditemukan.");
  const x = m.data();
  if (x.uid !== uid || x.type !== "masuk" || x.status === "tolak") throw new HttpsError("permission-denied", "Bukan absen masuk milikmu.");
  const pRef = co.collection("pengingat").doc(String(masukId));
  if (jawab === "lembur"){ await pRef.set({ uid, jawab: "lembur", dijawab: FieldValue.serverTimestamp() }, { merge: true }); return { ok: true }; }
  // sudah ditutup (sudah absen pulang / sudah dijawab)?
  const lanjut = await ref.where("uid", "==", uid).where("ts", ">", x.ts).orderBy("ts", "desc").get();
  if (lanjut.docs.some(d => d.data().status !== "tolak")) return { ok: true, sudah: true };
  const jadwal = await jadwalPulang(cid, uid, x.ts.toDate());
  if (!jadwal) throw new HttpsError("failed-precondition", "Jam kerja belum diatur.");
  if (Date.now() < jadwal.getTime()) throw new HttpsError("failed-precondition", `Jam pulang kerja (${jamWib(jadwal)}) belum lewat. Absen pulang biasa saja.`);
  await ref.add({ uid, nama: x.nama || "", type: "pulang", status: "terima", ts: Timestamp.fromDate(jadwal), manual: true, dariPengingat: true,
    by: "pengingat", byUid: uid, alasan: "Lupa absen pulang (dijawab dari pengingat), lembur tidak dihitung", decidedAt: FieldValue.serverTimestamp(),
    dist: 0, rad: 0, acc: 0, lokasi: "manual", device: "pengingat", live: false, foto: null, face: null, finger: false });
  await pRef.set({ uid, jawab: "lupa", dijawab: FieldValue.serverTimestamp() }, { merge: true });
  return { ok: true, jam: jamWib(jadwal) };
});

/* =====================================================================
   BACKUP & RESTORE (superadmin)
   - Auto BackUp: setiap hari 23:00 WIB, semua perusahaan, disimpan di Firebase Storage backup/{cid}/ (maksimal 30 backup terbaru)
   - BackUp sekarang / Unduh / Restore dari daftar atau dari file .json.gz
   ===================================================================== */
const zlib = require("zlib");
const crypto = require("crypto");
const MAKS_BACKUP = 30;
// hanya simpan 30 backup terbaru per perusahaan (manual + otomatis + sebelum-restore); yang lebih lama dihapus
async function rapikanBackup(cid){
  try{
    const [files] = await getStorage().bucket().getFiles({ prefix: `backup/${cid}/` });
    const urut = files.filter(f => f.name.endsWith(".json.gz")).sort((a, b) => String(b.metadata.timeCreated).localeCompare(String(a.metadata.timeCreated)));
    for (const f of urut.slice(MAKS_BACKUP)) await f.delete().catch(() => {});
  }catch(e){ console.error("rapikanBackup", cid, e.message); }
}
const keJson = v => {
  if (v instanceof Timestamp) return { __ts: [v.seconds, v.nanoseconds] };
  if (v && typeof v === "object" && v.constructor?.name === "GeoPoint") return { __geo: [v.latitude, v.longitude] };
  if (v && typeof v === "object" && v.constructor?.name === "DocumentReference") return { __ref: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return null;
  if (Array.isArray(v)) return v.map(keJson);
  if (v && typeof v === "object"){ const o = {}; for (const [k, x] of Object.entries(v)) o[k] = keJson(x); return o; }
  return v;
};
const dariJson = v => {
  if (Array.isArray(v)) return v.map(dariJson);
  if (v && typeof v === "object"){
    if (Array.isArray(v.__ts) && Object.keys(v).length === 1) return new Timestamp(v.__ts[0], v.__ts[1]);
    if (typeof v.__ref === "string" && Object.keys(v).length === 1) return db.doc(v.__ref);
    if (Array.isArray(v.__geo) && Object.keys(v).length === 1){ const { GeoPoint } = require("firebase-admin/firestore"); return new GeoPoint(v.__geo[0], v.__geo[1]); }
    const o = {}; for (const [k, x] of Object.entries(v)) o[k] = dariJson(x); return o;
  }
  return v;
};
const capWaktu = () => { const d = new Date(Date.now() + 7 * 3600e3); const p = n => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}`; };

async function buatBackupCid(cid, jenis, oleh){
  const coRef = db.collection("companies").doc(cid), co = await coRef.get(); if (!co.exists) return null;
  const isi = { app: "absensi-hadir", versi: 2, cid, dibuat: new Date().toISOString(), jenis, oleh: oleh || "Sistem",
    perusahaan: keJson(co.data()), koleksi: {}, sub: {} };
  for (const kol of await coRef.listCollections()){
    const snap = await kol.get();
    isi.koleksi[kol.id] = snap.docs.map(d => ({ id: d.id, data: keJson(d.data()) }));
    // riwayat gaji / kehadiran manual ikut dicadangkan
    if (kol.id === "payroll" || kol.id === "kehadiranManual"){
      for (const d of snap.docs){ const r = await d.ref.collection("riwayat").get();
        if (!r.empty) isi.sub[kol.id + "/" + d.id + "/riwayat"] = r.docs.map(x => ({ id: x.id, data: keJson(x.data()) })); }
    }
  }
  const users = await db.collection("users").where("cid", "==", cid).get();
  isi.users = users.docs.map(d => ({ id: d.id, data: keJson(d.data()) }));
  const un = await db.collection("usernames").where("cid", "==", cid).get();
  isi.usernames = un.docs.map(d => ({ id: d.id, data: keJson(d.data()) }));
  const jml = Object.fromEntries(Object.entries(isi.koleksi).map(([k, v]) => [k, v.length])); jml.users = isi.users.length;
  const nama = `backup/${cid}/${capWaktu()}_${jenis}.json.gz`, token = crypto.randomUUID();
  await getStorage().bucket().file(nama).save(zlib.gzipSync(Buffer.from(JSON.stringify(isi))), {
    contentType: "application/gzip", resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token, jenis, oleh: oleh || "Sistem", jumlah: JSON.stringify(jml) } } });
  await rapikanBackup(cid);
  return { nama, jumlah: jml };
}

exports.backupHarian = onSchedule({ schedule: "every day 23:00", timeZone: "Asia/Jakarta", timeoutSeconds: 540, memory: "1GiB" }, async () => {
  const cos = await db.collection("companies").get();
  for (const co of cos.docs){
    if (co.data()?.demo) continue;
    try{ await buatBackupCid(co.id, "otomatis", "Auto BackUp"); }catch(e){ console.error("backup", co.id, e.message); }
  }
});

exports.backupAksi = onCall({ timeoutSeconds: 540, memory: "1GiB", enforceAppCheck: WAJIB_APPCHECK }, async (req) => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Harus login.");
  const me = (await db.collection("users").doc(req.auth.uid).get()).data() || {};
  const { aksi, cid, file, bagian } = req.data || {};
  // BackUp manual (aksi "buat") boleh untuk admin & supervisor perusahaannya sendiri; aksi lain (daftar, unduh, restore, pulihkan) khusus superadmin
  const bolehBuat = aksi === "buat" && ["admin", "supervisor"].includes(me.role) && me.aktif !== false && me.cid === cid;
  if (me.role !== "superadmin" && !bolehBuat) throw new HttpsError("permission-denied", "Backup & Restore khusus superadmin.");
  if (!cid || !(await db.collection("companies").doc(cid).get()).exists) throw new HttpsError("invalid-argument", "Perusahaan tidak ditemukan.");
  const bucket = getStorage().bucket(), p = { uid: req.auth.uid, nama: me.nama, role: me.role };
  const cekFile = () => { if (typeof file !== "string" || !file.startsWith(`backup/${cid}/`) || file.includes("..")) throw new HttpsError("invalid-argument", "File backup tidak valid."); };

  if (aksi === "daftar"){
    await rapikanBackup(cid);
    const [files] = await bucket.getFiles({ prefix: `backup/${cid}/` });
    return { files: files.filter(f => f.name.endsWith(".json.gz")).map(f => ({ nama: f.name, ukuran: +f.metadata.size || 0, waktu: f.metadata.timeCreated,
      jenis: f.metadata.metadata?.jenis || (f.name.match(/_([a-z-]+)\.json\.gz$/) || [])[1] || "", oleh: f.metadata.metadata?.oleh || "",
      jumlah: (() => { try{ return JSON.parse(f.metadata.metadata?.jumlah || "{}"); }catch(e){ return {}; } })() }))
      .sort((a, b) => String(b.waktu).localeCompare(String(a.waktu))) };
  }
  if (aksi === "buat"){
    const r = await buatBackupCid(cid, "manual", me.nama);
    await catatLog(cid, p, "sistem", "BackUp data ke server (" + Object.entries(r.jumlah).map(([k, v]) => k + " " + v).join(", ") + ")");
    return r;
  }
  if (aksi === "unduh"){
    cekFile(); const f = bucket.file(file), [meta] = await f.getMetadata();
    let token = meta.metadata?.firebaseStorageDownloadTokens;
    if (!token){ token = crypto.randomUUID(); await f.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } }); }
    return { url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file)}?alt=media&token=${token.split(",")[0]}` };
  }
  // ---- karyawan yang terhapus: cari di backup & pulihkan (akun login dibuat ulang dengan UID yang sama) ----
  const bacaBackup = async nama => { const [buf] = await bucket.file(nama).download();
    const isi = JSON.parse((buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString("utf8"));
    if (isi.app !== "absensi-hadir" || isi.cid !== cid) throw new HttpsError("invalid-argument", "File backup tidak cocok."); return isi; };
  if (aksi === "terhapus"){
    const [files] = await bucket.getFiles({ prefix: `backup/${cid}/` });
    const urut = files.filter(f => f.name.endsWith(".json.gz")).sort((a, b) => String(b.metadata.timeCreated).localeCompare(String(a.metadata.timeCreated))).slice(0, 30);
    const ada = new Set((await db.collection("users").where("cid", "==", cid).get()).docs.map(d => d.id)), hasil = {};
    for (const f of urut){
      let isi; try{ isi = await bacaBackup(f.name); }catch(e){ continue; }
      for (const u of isi.users || []){
        if (ada.has(u.id) || hasil[u.id] || u.data?.role === "superadmin") continue;
        const absen = (isi.koleksi.absensi || []).filter(x => x.data?.uid === u.id).length;
        hasil[u.id] = { uid: u.id, nama: u.data?.nama || "", username: u.data?.username || "", role: u.data?.role || "", file: f.name, waktu: f.metadata.timeCreated, absen };
      }
    }
    for (const h of Object.values(hasil)) h.absenSekarang = (await db.collection("companies").doc(cid).collection("absensi").where("uid", "==", h.uid).count().get()).data().count;
    return { akun: Object.values(hasil).sort((a, b) => a.nama.localeCompare(b.nama)) };
  }
  if (aksi === "pulihkanAkun"){
    cekFile();
    const uid = String(req.data?.uid || ""), pass = String(req.data?.password || "");
    if (pass.length < 6) throw new HttpsError("invalid-argument", "Password minimal 6 karakter.");
    if ((await db.collection("users").doc(uid).get()).exists) throw new HttpsError("already-exists", "Akun ini masih ada, tidak perlu dipulihkan.");
    const isi = await bacaBackup(file), u = (isi.users || []).find(x => x.id === uid);
    if (!u) throw new HttpsError("not-found", "Akun tidak ada di backup ini.");
    const data = dariJson(u.data), username = String(data.username || "").toLowerCase();
    if (!username) throw new HttpsError("failed-precondition", "Username akun di backup kosong.");
    const un = await db.collection("usernames").doc(username).get();
    if (un.exists && un.data()?.uid !== uid) throw new HttpsError("already-exists", "Username @" + username + " sudah dipakai akun lain. Ganti dulu username akun itu.");
    try{ await getAuth().createUser({ uid, email: username + "@" + USERNAME_DOMAIN, password: pass, displayName: data.nama || username }); }
    catch(e){
      if (e.code === "auth/uid-already-exists") await getAuth().updateUser(uid, { email: username + "@" + USERNAME_DOMAIN, password: pass, disabled: false });
      else if (e.code === "auth/email-already-exists") throw new HttpsError("already-exists", "Login @" + username + " sudah dipakai akun lain.");
      else throw e;
    }
    const coRef = db.collection("companies").doc(cid), ops = [], jml = { absensi: 0, izin: 0, slips: 0, lembur: 0 };
    ops.push([db.collection("users").doc(uid), data]);
    const unB = (isi.usernames || []).find(x => x.id === username);
    ops.push([db.collection("usernames").doc(username), unB ? dariJson(unB.data) : { uid, cid }]);
    if (data.deviceId){ const dv = await db.collection("devices").doc(data.deviceId).get();
      if (!dv.exists) ops.push([db.collection("devices").doc(data.deviceId), { uid, cid, nama: data.nama || "", at: Timestamp.now() }]); }
    const pay = (isi.koleksi.payroll || []).find(x => x.id === uid);
    if (pay && !(await coRef.collection("payroll").doc(uid).get()).exists) ops.push([coRef.collection("payroll").doc(uid), dariJson(pay.data)]);
    for (const r of isi.sub?.["payroll/" + uid + "/riwayat"] || []) ops.push([coRef.collection("payroll").doc(uid).collection("riwayat").doc(r.id), dariJson(r.data)]);
    // data absen / izin / slip / lembur: hanya yang hilang yang dikembalikan (yang masih ada tidak ditimpa)
    for (const kol of Object.keys(jml)){
      const list = (isi.koleksi[kol] || []).filter(x => x.data?.uid === uid); if (!list.length) continue;
      const sekarang = new Set((await coRef.collection(kol).where("uid", "==", uid).get()).docs.map(d => d.id));
      for (const d of list) if (!sekarang.has(d.id)){ ops.push([coRef.collection(kol).doc(d.id), dariJson(d.data)]); jml[kol]++; }
    }
    for (let i = 0; i < ops.length; i += 400){ const bt = db.batch(); ops.slice(i, i + 400).forEach(([r, d]) => bt.set(r, d)); await bt.commit(); }
    await catatLog(cid, p, "akun", "Memulihkan akun terhapus " + (data.nama || "") + " (@" + username + ") dari " + file.split("/").pop() +
      " · dikembalikan: " + Object.entries(jml).map(([k, v]) => k + " " + v).join(", "), { target: data.nama || "" });
    return { ok: true, nama: data.nama, username, jumlah: jml };
  }
  // ---- pindahkan data absen akun terhapus ke akun yang masih ada ----
  if (aksi === "pindahData"){
    cekFile();
    const uid = String(req.data?.uid || ""), keUid = String(req.data?.keUid || "");
    if (!uid || !keUid || uid === keUid) throw new HttpsError("invalid-argument", "Pilih akun tujuan.");
    const tSnap = await db.collection("users").doc(keUid).get(), t = tSnap.data();
    if (!t || t.cid !== cid) throw new HttpsError("not-found", "Akun tujuan tidak ditemukan di perusahaan ini.");
    const isi = await bacaBackup(file), asal = (isi.users || []).find(x => x.id === uid)?.data || {};
    const coRef = db.collection("companies").doc(cid), ops = [], jml = { absensi: 0, izin: 0, lembur: 0 };
    const ganti = d => { const x = { ...d, uid: keUid }; if ("nama" in x) x.nama = t.nama || x.nama; if ("username" in x) x.username = t.username || x.username; return x; };
    for (const kol of Object.keys(jml)){
      // yang masih ada di database (tidak ikut terhapus): cukup diganti pemiliknya
      const masih = await coRef.collection(kol).where("uid", "==", uid).get(), sudah = new Set();
      masih.docs.forEach(d => { ops.push([d.ref, ganti(d.data())]); sudah.add(d.id); jml[kol]++; });
      // yang ikut terhapus: diambil dari backup (kalau belum ada)
      for (const d of (isi.koleksi[kol] || []).filter(x => x.data?.uid === uid)){
        if (sudah.has(d.id)) continue;
        if ((await coRef.collection(kol).doc(d.id).get()).exists) continue;
        ops.push([coRef.collection(kol).doc(d.id), ganti(dariJson(d.data))]); jml[kol]++;
      }
    }
    for (let i = 0; i < ops.length; i += 400){ const bt = db.batch(); ops.slice(i, i + 400).forEach(([r, d]) => bt.set(r, d)); await bt.commit(); }
    await catatLog(cid, p, "akun", "Memindahkan data absen akun terhapus " + (asal.nama || uid) + " (@" + (asal.username || "") + ") ke " + (t.nama || "") + " (@" + (t.username || "") + ")"
      + " dari " + file.split("/").pop() + ": " + Object.entries(jml).map(([k, v]) => k + " " + v).join(", "), { target: t.nama || "" });
    return { ok: true, nama: t.nama, username: t.username, jumlah: jml };
  }
  if (aksi === "restore"){
    cekFile();
    const izin = ["payroll", "settings", "kehadiranManual", "pinjaman", "slips", "absensi", "izin", "lembur", "pajak", "users"];
    const pilih = (Array.isArray(bagian) ? bagian : []).filter(b => izin.includes(b));
    if (!pilih.length) throw new HttpsError("invalid-argument", "Pilih data yang mau di-restore.");
    const [buf] = await bucket.file(file).download();
    let isi; try{ isi = JSON.parse((buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf).toString("utf8")); }
    catch(e){ throw new HttpsError("invalid-argument", "File backup rusak / bukan backup Absensi Hadir."); }
    if (isi.app !== "absensi-hadir" || !isi.koleksi) throw new HttpsError("invalid-argument", "Ini bukan file backup Absensi Hadir (versi baru).");
    if (isi.cid !== cid) throw new HttpsError("failed-precondition", "File backup ini milik perusahaan lain (" + isi.cid + ").");
    // cadangan pengaman dulu: kondisi sekarang disimpan sebelum ditimpa
    const aman = await buatBackupCid(cid, "sebelum-restore", me.nama);
    const coRef = db.collection("companies").doc(cid), ops = [], jml = {};
    for (const b of pilih){
      if (b === "users"){
        for (const d of isi.users || []) ops.push([db.collection("users").doc(d.id), dariJson(d.data)]);
        for (const d of isi.usernames || []) ops.push([db.collection("usernames").doc(d.id), dariJson(d.data)]);
        jml.users = (isi.users || []).length; continue;
      }
      const list = isi.koleksi[b] || [];
      for (const d of list) ops.push([coRef.collection(b).doc(d.id), dariJson(d.data)]);
      jml[b] = list.length;
    }
    for (let i = 0; i < ops.length; i += 400){ const bt = db.batch(); ops.slice(i, i + 400).forEach(([r, d]) => bt.set(r, d)); await bt.commit(); }
    await catatLog(cid, p, "sistem", "Restore data dari " + file.split("/").pop() + ": " + Object.entries(jml).map(([k, v]) => k + " " + v).join(", ") + " (cadangan sebelum restore: " + aman.nama.split("/").pop() + ")");
    return { ok: true, jumlah: jml, aman: aman.nama };
  }
  throw new HttpsError("invalid-argument", "Aksi tidak dikenal.");
});
