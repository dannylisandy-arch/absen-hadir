import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signOut, inMemoryPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp, collection, addDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, deleteToken, onMessage, isSupported } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { getStorage, ref as sRef, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig, VAPID_KEY, USERNAME_DOMAIN, GOOGLE_MAPS_KEY, APPCHECK_SITE_KEY } from "./firebase-config.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js";
import { tglMedium, tglMediumHari, tglJamMedium, jamHM, BULAN_PENDEK, BULAN_ID } from "./payroll.js";
export { tglMedium, tglMediumHari, tglJamMedium, jamHM };

export const app = initializeApp(firebaseConfig);
// App Check: hanya aplikasi asli (domain ini) yang dilayani server Firebase
if (APPCHECK_SITE_KEY){
  try{ initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true }); }
  catch(e){ console.warn("App Check gagal dimulai", e); }
}
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Service worker (offline + notifikasi) dipasang sejak halaman dibuka: syarat agar bisa diinstal / dijadikan APK
export const SW_URL = "./firebase-messaging-sw.js?c=" + encodeURIComponent(JSON.stringify(firebaseConfig));
export const swSiap = ("serviceWorker" in navigator)
  ? navigator.serviceWorker.register(SW_URL, { scope: "./", updateViaCache: "none" })
      .then(r => { r?.update?.().catch(() => {}); return r; }).catch(() => null) : Promise.resolve(null);
// Muat ulang aplikasi: hapus salinan file lama (data login, wajah & sidik jari TIDAK dihapus)
export async function muatUlangAplikasi(){
  try{ for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister(); }catch(e){}
  try{ for (const k of await caches.keys()) await caches.delete(k); }catch(e){}
  location.replace(location.pathname + "?v=" + Date.now());
}

// Pembaruan otomatis: setiap aplikasi dibuka (dan saat kembali dibuka dari latar belakang) cek versi di server;
// kalau ada versi baru -> muat ulang sendiri. Tidak dijalankan saat pengguna sedang sibuk (mis. sedang absen).
export function pantauVersiBaru(sibuk = () => false, { saatKembali = true, setiap = 5 * 60 * 1000 } = {}){
  let jalan = false;
  const cek = async () => {
    if (jalan || !navigator.onLine) return; jalan = true;
    try{
      const t = await (await fetch("/common.js?cek=" + Date.now(), { cache: "no-store" })).text();
      const baru = (t.match(/export const VERSI_APP = "(\d{4}\.[\d.]+[a-z]?)"/) || [])[1];
      if (baru && baru !== VERSI_APP){
        let sudah = false; try{ sudah = sessionStorage.getItem("absen:autoUpdate") === baru; sessionStorage.setItem("absen:autoUpdate", baru); }catch(e){}
        if (sudah){ jalan = false; return; }                 // sudah dicoba untuk versi ini: jangan berputar terus
        if (sibuk()){ try{ sessionStorage.removeItem("absen:autoUpdate"); }catch(e){} setTimeout(() => { jalan = false; cek(); }, 60000); return; }
        try{ toast("🔄 Memperbarui aplikasi ke versi " + baru + "…"); }catch(e){}
        setTimeout(muatUlangAplikasi, 800); return;
      }
    }catch(e){}
    jalan = false;
  };
  setTimeout(cek, 2500);
  // cek ulang berkala (halaman yang dibiarkan terbuka berjam-jam ikut terbarui) dan saat tab dibuka lagi
  if (setiap) setInterval(() => { if (!document.hidden){ jalan = false; cek(); } }, setiap);
  if (saatKembali) document.addEventListener("visibilitychange", () => { if (!document.hidden){ jalan = false; cek(); } });
}

/* ---------- Masa aktif perusahaan (uji coba / langganan) ----------
   companies/{cid}: aktifSampai "YYYY-MM-DD" (kosong = tanpa batas), aktifSampaiTs (akhir hari WIB, dipakai firestore.rules),
   paket "coba" | "langganan". Lewat tanggal: admin & karyawan tidak bisa login/absen, data tetap tersimpan. */
export const WA_PENJUAL = "0812-6161-8402", WA_PENJUAL_LINK = "https://wa.me/6281261618402";
const hariLokal = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export function masaAktif(pt){
  const s = pt?.aktifSampai || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ada: false, habis: false, coba: false };
  const sisa = Math.round((new Date(s + "T12:00") - new Date(hariLokal() + "T12:00")) / 864e5);
  return { ada: true, sampai: s, sisa, habis: sisa < 0, coba: pt.paket === "coba" };
}
export const teksHabis = pt => { const m = masaAktif(pt);
  return `Masa ${m.coba ? "coba gratis" : "aktif"} ${pt?.nama || "perusahaan ini"} sudah berakhir pada ${tglMedium(m.sampai)}. Data tetap tersimpan aman. Untuk melanjutkan, hubungi WhatsApp ${WA_PENJUAL}.`; };
export const tsAkhirHari = s => new Date(s + "T23:59:59+07:00");
export const tambahHari = (iso, n) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return hariLokal(d); };
export const tambahBulan = (iso, n) => { const d = new Date(iso + "T12:00"), t = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(t, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); return hariLokal(d); };
export const hariIniIso = () => hariLokal();

export const $ = s => document.querySelector(s);
// Pesan status: pesan berhasil ("ok") hilang sendiri setelah 5 detik; pesan gagal tetap tampil sampai diganti
export function msg(el, text, kind){
  if (!el) return;
  el.textContent = text; el.className = "msg " + (kind || "");
  clearTimeout(el._hilang);
  if (text && kind === "ok") el._hilang = setTimeout(() => { if (el.textContent === text){ el.textContent = ""; el.className = "msg"; } }, 5000);
}
export function toast(text){ const t = $("#toast"); t.textContent = text; clearTimeout(toast.h); toast.h = setTimeout(() => t.textContent = "", 5000); }
export const jenis = t => t === "masuk" ? "Masuk" : "Pulang";
export const tsOf = d => d.ts?.toDate ? d.ts.toDate() : new Date();
export const fmtWaktu = d => tglMediumHari(d) + " " + jamHM(d);
export const fmtJam = d => d.toLocaleTimeString("id-ID", {hour:"2-digit", minute:"2-digit"});
export const STATUS = { otomatis:["in","Sah"], menunggu:["wait","Menunggu"], terima:["in","Diterima"], tolak:["no","Ditolak"] };

/* ---------- login username ---------- */
// Username -> email internal Firebase: "budi@absensi.local". Username unik di semua perusahaan.
// Input yang mengandung "@" dianggap email (akun lama).
export const validUsername = u => /^[a-z0-9._]{3,20}$/.test(u);
export const validKode = k => /^[A-Z0-9]{3,10}$/.test(k);
export const keEmail = u => { u = String(u || "").trim(); return u.includes("@") ? u : u.toLowerCase() + "@" + USERNAME_DOMAIN; };
export async function masukUsername(signIn, _kode, user, pass){ return signIn(keEmail(user), pass); }
export const kodeTerakhir = {
  get(){ try{ return localStorage.getItem("absen:kode") || ""; }catch(e){ return ""; } },
  set(k){ try{ localStorage.setItem("absen:kode", k); }catch(e){} }
};

export function authError(e){
  const c = e?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found") || c.includes("invalid-login"))
    return "Username atau password salah.";
  if (c.includes("email-already-in-use")) return "Username sudah dipakai. Pilih username lain.";
  if (c.includes("weak-password")) return "Password minimal 6 karakter.";
  if (c.includes("invalid-email")) return "Username tidak valid.";
  if (c.includes("too-many-requests")) return "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.";
  if (c.includes("user-disabled")) return "Akun ini dinonaktifkan di server login. Hubungi superadmin.";
  if (c.includes("network")) return "Tidak bisa terhubung ke server login (" + c + "). Coba muat ulang (Ctrl+Shift+R), jendela InPrivate, atau jaringan lain.";
  return "Terjadi kesalahan: " + (e?.message || c) + (c && !(e?.message || "").includes(c) ? " (" + c + ")" : "");
}
// Tombol lihat/sembunyikan password
const IKON_MATA = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const IKON_MATA_TUTUP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.1 6.1C3.4 7.9 2 12 2 12s3.6 7 10 7c1.9 0 3.5-.6 4.9-1.4M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
export function pasangMata(btn, input){
  btn.innerHTML = IKON_MATA; btn.title = "Tampilkan password";
  btn.onclick = () => {
    const lihat = input.type === "password";
    input.type = lihat ? "text" : "password";
    btn.innerHTML = lihat ? IKON_MATA_TUTUP : IKON_MATA;
    btn.title = lihat ? "Sembunyikan password" : "Tampilkan password";
    btn.setAttribute("aria-label", btn.title);
    btn.setAttribute("aria-pressed", String(lihat));
  };
}

// Daftarkan HP ini untuk menerima notifikasi push.
// Suara "Notif dari Absen" (diputar saat aplikasi terbuka; browser bisa menolak sebelum ada sentuhan pertama)
export function bunyiNotif(){ try{ const a = new Audio("notif-absen.mp3"); a.play().catch(() => {}); }catch(e){} }
export async function enableNotif(uid, role, cid = ""){
  if (!VAPID_KEY || VAPID_KEY.startsWith("ISI_"))
    throw new Error("Notifikasi belum disiapkan admin (VAPID key belum diisi).");
  if (!(await isSupported()) || !("serviceWorker" in navigator))
    throw new Error("Browser ini belum mendukung notifikasi. Di iPhone, tambahkan aplikasi ke Layar Utama lalu buka dari sana.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.");
  const reg = (await swSiap) || await navigator.serviceWorker.register(SW_URL, { scope: "./" });
  await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  await setDoc(doc(db, "tokens", token), { uid, role, cid, at: serverTimestamp() });
  try{ localStorage.setItem("absen:notifToken", token); localStorage.removeItem("absen:notifMati"); }catch(e){}
  // Saat aplikasi sedang terbuka, tampilkan notifikasi juga.
  onMessage(messaging, p => {
    bunyiNotif();
    // pengingat absen pulang saat aplikasi terbuka -> langsung tampilkan pilihan di aplikasi
    if (p.data?.jenis === "pengingatPulang"){ window.dispatchEvent(new CustomEvent("pengingat-pulang", { detail: { pengingat: "tanya", masukId: p.data.masukId, cid: p.data.cid } })); return; }
    const n = p.notification || {};
    reg.showNotification(n.title || "Absensi", { body: n.body || "" });
    toast((n.title ? n.title + ": " : "") + (n.body || ""));
  });
  return true;
}
// Notifikasi AKTIF secara bawaan: saat login/membuka aplikasi langsung didaftarkan,
// kecuali pengguna sendiri pernah menekan "Nonaktifkan notifikasi" atau memblokir izin di browser.
// Kalau browser hanya mau meminta izin setelah layar disentuh, permintaan diulang pada sentuhan pertama.
export async function refreshNotif(uid, role, cid = "", sesudah){
  let mati = false; try{ mati = localStorage.getItem("absen:notifMati") === "1"; }catch(e){}
  if (mati || !("Notification" in window) || Notification.permission === "denied") return;
  try{ await enableNotif(uid, role, cid); return; }catch(e){}
  if (Notification.permission !== "default" || refreshNotif.menunggu) return;
  refreshNotif.menunggu = true;
  const coba = async () => {
    ["pointerdown", "keydown"].forEach(ev => document.removeEventListener(ev, coba, true));
    refreshNotif.menunggu = false;
    try{ localStorage.getItem("absen:notifMati") !== "1" && await enableNotif(uid, role, cid); }catch(e){}
    try{ sesudah?.(); }catch(e){}
  };
  ["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, coba, true));
}
// Aktif = izin browser diberikan DAN pengguna tidak mematikannya di aplikasi
export function notifAktif(){
  let mati = false; try{ mati = localStorage.getItem("absen:notifMati") === "1"; }catch(e){}
  return "Notification" in window && Notification.permission === "granted" && !mati;
}
// Matikan notifikasi untuk HP ini: hapus token di server & di Firebase Messaging
export async function disableNotif(){
  let token = ""; try{ token = localStorage.getItem("absen:notifToken") || ""; }catch(e){}
  try{ if (token) await deleteDoc(doc(db, "tokens", token)); }catch(e){}
  try{ if (await isSupported()) await deleteToken(getMessaging(app)); }catch(e){}
  try{ localStorage.setItem("absen:notifMati", "1"); localStorage.removeItem("absen:notifToken"); }catch(e){}
}

/* ---------- format angka Indonesia ---------- */
export const fmtNum = (n, dec = 0) => (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: dec });
// Terima "1.234,5" (format Indonesia) maupun "1234.5" (misalnya salinan dari Google Maps)
export function parseDec(s){
  s = String(s ?? "").trim();
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s.replace(/[^\d.\-]/g, ""));
}
export const parseInt0 = s => parseInt(String(s ?? "").replace(/\D/g, ""), 10) || 0;
function formatIntInput(el){
  const pos = el.selectionStart ?? el.value.length;
  const before = el.value.slice(0, pos).replace(/\D/g, "").length;
  const digits = el.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  el.value = digits ? Number(digits).toLocaleString("id-ID") : "";
  let i = 0, c = 0;
  while (i < el.value.length && c < before){ if (/\d/.test(el.value[i])) c++; i++; }
  try{ el.setSelectionRange(i, i); }catch(e){}
}
// Kolom data-num="int" diberi titik ribuan saat diketik; data-num="dec" dirapikan saat selesai diisi.
document.addEventListener("input", e => { if (e.target.matches?.('[data-num="int"]')) formatIntInput(e.target); });
document.addEventListener("change", e => {
  if (e.target.matches?.('[data-num="dec"]') && e.target.value.trim()){
    const v = parseDec(e.target.value);
    if (isFinite(v)) e.target.value = fmtNum(v, Number(e.target.dataset.dec || 6));
  }
});

/* ---------- lampiran izin / sakit ---------- */
export const LAMPIRAN_MAX = 3, UKURAN_MAX = 5 * 1024 * 1024;
export const TIPE_DOK = ["application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export const ACCEPT = "image/*,.pdf,.doc,.docx";
export const ukuran = b => b < 1024 * 1024 ? fmtNum(Math.max(1, Math.round(b / 1024))) + " KB" : fmtNum(b / 1048576, 1) + " MB";
export const isGambar = t => /^image\//.test(t || "");

// Perkecil foto (sisi terpanjang 1600 px, JPEG) supaya hemat kuota & cepat diunggah
export async function kompres(file){
  if (!isGambar(file.type) || file.type === "image/gif") return file;
  try{
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  }catch(e){ return file; }
}
// Periksa file sebelum diunggah; kembalikan pesan kesalahan atau ""
export function cekFile(file){
  if (!isGambar(file.type) && !TIPE_DOK.includes(file.type)) return file.name + ": hanya foto, PDF, atau Word.";
  if (file.size > UKURAN_MAX) return file.name + ": lebih dari 5 MB.";
  return "";
}
const urlCache = {};
export async function urlLampiran(path){ return urlCache[path] ||= await getDownloadURL(sRef(storage, path)); }

// Penampil foto layar penuh
export function lihatGambar(url, nama){
  const o = document.createElement("div"); o.className = "lightbox"; o.setAttribute("role", "dialog"); o.setAttribute("aria-label", nama || "Lampiran");
  o.innerHTML = `<button class="lb-close" aria-label="Tutup">✕</button><img alt=""><p></p>`;
  o.querySelector("img").src = url; o.querySelector("p").textContent = nama || "";
  const tutup = () => { o.remove(); document.removeEventListener("keydown", esc); };
  const esc = e => { if (e.key === "Escape") tutup(); };
  o.onclick = e => { if (e.target === o || e.target.classList.contains("lb-close")) tutup(); };
  document.addEventListener("keydown", esc);
  document.body.append(o); o.querySelector(".lb-close").focus();
}

// Daftar lampiran tersimpan (foto jadi thumbnail, dokumen jadi chip)
export function daftarLampiran(list){
  const box = document.createElement("div"); box.className = "lampiran";
  (list || []).forEach(l => {
    const b = document.createElement("button"); b.type = "button";
    if (isGambar(l.tipe)){
      b.className = "thumb"; b.setAttribute("aria-label", "Lihat " + l.nama);
      urlLampiran(l.path).then(u => { b.style.backgroundImage = `url("${u}")`; }).catch(() => { b.textContent = "!"; });
      b.onclick = async () => { try{ lihatGambar(await urlLampiran(l.path), l.nama); }catch(e){ toast("Lampiran tidak bisa dibuka."); } };
    } else {
      b.className = "chipdoc"; b.innerHTML = `<span aria-hidden="true">📄</span><span class="nm"></span><small>${ukuran(l.ukuran || 0)}</small>`;
      b.querySelector(".nm").textContent = l.nama;
      b.onclick = async () => {
        const w = window.open("", "_blank");
        try{ const u = await urlLampiran(l.path); if (w) w.location = u; else location.href = u; }
        catch(e){ w?.close(); toast("Lampiran tidak bisa dibuka."); }
      };
    }
    box.append(b);
  });
  return box;
}

// Buat akun login baru dari dashboard tanpa mengeluarkan admin yang sedang login
// (memakai instance Firebase kedua yang sementara).
export async function buatAkun(email, pass, simpan){
  const app2 = initializeApp(firebaseConfig, "buat-akun-" + Date.now());
  try{
    const a2 = getAuth(app2);
    await setPersistence(a2, inMemoryPersistence);
    const c = await createUserWithEmailAndPassword(a2, email, pass);
    // Simpan data karyawan; kalau gagal, hapus lagi akun login yang baru dibuat supaya username tidak "nyangkut"
    if (simpan){
      try{ await simpan(c.user.uid); }
      catch(e){ try{ await c.user.delete(); }catch(x){} throw e; }
    }
    await signOut(a2);
    return c.user.uid;
  } finally { await deleteApp(app2); }
}

/* ---------- alamat dari koordinat GPS ---------- */
// OpenStreetMap (Nominatim) untuk alamat sampai nama jalan; cadangan BigDataCloud (kelurahan/kota).
const alamatCache = {};
// --- Google Maps (kalau API key diisi): dimuat sekali, hanya saat dibutuhkan ---
let gmaps = null;
function muatGoogle(){
  if (gmaps) return gmaps;
  gmaps = new Promise((ok, no) => {
    const cb = "__gmapsSiap";
    window[cb] = () => ok(window.google.maps);
    window.gm_authFailure = () => { gmaps = null; no(new Error("Google Maps: API key ditolak")); };
    const sc = document.createElement("script");
    sc.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(GOOGLE_MAPS_KEY) +
             "&loading=async&language=id&region=ID&callback=" + cb;
    sc.async = true; sc.onerror = () => { gmaps = null; no(new Error("Google Maps gagal dimuat")); };
    document.head.append(sc);
  });
  return gmaps;
}
const batasWaktu = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
async function alamatGoogle(lat, lng, ms){
  const maps = await batasWaktu(muatGoogle(), ms);
  const { Geocoder } = await maps.importLibrary("geocoding");
  const r = await batasWaktu(new Geocoder().geocode({ location: { lat: +lat, lng: +lng } }), ms);
  const hasil = (r.results || []).find(x => !x.types.includes("plus_code")) || (r.results || [])[0];
  return hasil?.formatted_address || "";
}
export async function alamatDari(lat, lng, ms = 5000){
  const key = (+lat).toFixed(5) + "," + (+lng).toFixed(5);
  if (alamatCache[key]) return alamatCache[key];
  // 1. Google Maps (kalau ada API key); gagal/kuota habis -> lanjut ke OpenStreetMap
  if (GOOGLE_MAPS_KEY){
    try{ const g = await alamatGoogle(lat, lng, ms); if (g) return alamatCache[key] = g; }catch(e){}
  }
  const ambil = async url => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
    try{ const r = await fetch(url, { signal: c.signal }); if (!r.ok) throw new Error(r.status); return await r.json(); }
    finally{ clearTimeout(t); }
  };
  const unik = arr => [...new Set(arr.filter(Boolean))].join(", ");
  try{
    const j = await ambil(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=id`);
    const a = j.address || {};
    const out = unik([[a.road, a.house_number].filter(Boolean).join(" ") || a.amenity || a.building,
      a.neighbourhood || a.hamlet, a.village || a.suburb || a.quarter, a.city_district,
      a.city || a.town || a.municipality || a.county, a.state]) || j.display_name;
    if (out) return alamatCache[key] = out;
  }catch(e){}
  try{
    const j = await ambil(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=id`);
    const out = unik([j.locality, j.city, j.principalSubdivision]);
    if (out) return alamatCache[key] = out;
  }catch(e){}
  return "";
}
/* ---------- ikon otomatis untuk tombol & judul ---------- */
const IKON = {
  in: "M15 4h4v16h-4M10 8l4 4-4 4M14 12H3", out: "M9 4H5v16h4M14 8l4 4-4 4M18 12H8",
  logout: "M9 4H5v16h4M14 8l4 4-4 4M18 12H8", login: "M15 4h4v16h-4M10 8l4 4-4 4M14 12H3",
  plus: "M12 5v14M5 12h14", save: "M5 3h11l3 3v15H5zM8 3v6h8M8 21v-7h8v7", trash: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15",
  printer: "M6 9V3h12v6M6 18H4v-7h16v7h-2M8 14h8v7H8z", download: "M12 3v12M7 10l5 5 5-5M4 21h16",
  edit: "M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4", refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
  check: "M5 12.5l4.5 4.5L19 7", x: "M6 6l12 12M18 6L6 18", list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0",
  pin: "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12zM12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  crosshair: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 1v4M12 19v4M1 12h4M19 12h4",
  face: "M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3M9 10h.01M15 10h.01M9 15c1.7 1.3 4.3 1.3 6 0",
  finger: "M12 11v3c0 3-1 5-2 7M8 9.5a4 4 0 0 1 8 0V14c0 2-.4 4-1 5.5M5 12V9.5a7 7 0 0 1 12-4.9M19 9.5V13",
  send: "M22 2L11 13M22 2l-7 20-4-9-9-4z", arrow: "M5 12h14M13 6l6 6-6 6",
  calc: "M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  userplus: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c.8-4 3.6-6 7-6s6.2 2 7 6M19 8v6M16 11h6",
  users: "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.7.8 2.7 2.5 3 5.2",
  building: "M3 21h18M5 21V7l7-4 7 4v14M9 9h1M14 9h1M9 13h1M14 13h1M10 21v-4h4v4",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", percent: "M19 5L5 19M7 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  wallet: "M3 6h18v13H3zM3 10h18M16 15h2", money: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4",
  calendar: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4", minus: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8",
  flask: "M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3", lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  key: "M15.5 3a5.5 5.5 0 1 1-4.9 8L4 17.6V21h3.4v-2h2v-2h2l1.6-1.6A5.5 5.5 0 0 1 15.5 3zM16.5 7.5h.01", chart: "M4 20V11M10 20V5M16 20v-6M2 20h20"
};
const IKON_TOMBOL = [["minta persetujuan", "send"], ["absen masuk", "in"], ["absen pulang", "out"], ["keluar", "logout"],
  ["simpan", "save"], ["hapus", "trash"], ["cetak", "printer"], ["unduh", "download"], ["edit", "edit"], ["reset", "refresh"],
  ["hubungkan", "refresh"], ["setujui", "check"], ["terima", "check"], ["tolak", "x"], ["batal", "x"], ["tutup", "x"],
  ["rincian", "list"], ["notifikasi", "bell"], ["lokasi saya", "crosshair"], ["terkunci", "lock"], ["wajah", "face"],
  ["sidik jari", "finger"], ["kirim", "send"], ["kelola", "arrow"], ["hitung", "calc"], ["tampilkan", "eye"], ["ajukan", "calendar"],
  ["isi 10", "flask"], ["tambah", "plus"], ["daftar", "plus"], ["password", "key"], ["masuk", "login"]];
const IKON_JUDUL = [["lebih hk", "calendar"], ["selfie", "face"], ["notifikasi", "bell"], ["lokasi", "pin"], ["perusahaan", "building"], ["wajah", "face"], ["sidik", "finger"],
  ["bpjs", "shield"], ["pph", "percent"], ["lembur", "clock"], ["potongan", "minus"], ["jam kerja", "clock"], ["tunjangan", "wallet"],
  ["dasar gaji", "money"], ["data demo", "flask"], ["tambah", "userplus"], ["pengguna", "users"], ["akun lama", "users"],
  ["izin", "calendar"], ["absen", "clock"], ["slip", "receipt"], ["rekap", "chart"]];
const LEWATI = "nav button, .pm-tombol button, .demo-catatan, .keluar-hp, .eye, .linkbtn, .chip, .thumb, .chipdoc, .x, .lb-close, .mhead, .subtabs button, .authmode button, .demo button, .seg button, .absen-aksi button, .l-nama, .libur-tbl button";
function ikonSvg(nama){
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ik"); s.setAttribute("aria-hidden", "true");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", IKON[nama]); s.append(p);
  return s;
}
function cariIkon(teks, daftar){ teks = teks.toLowerCase(); return (daftar.find(([k]) => teks.includes(k)) || [])[1]; }
function pasangIkon(){
  document.querySelectorAll("button, h2, .chk > b").forEach(el => {
    if (el.firstElementChild?.classList?.contains("ik") || el.querySelector(":scope > svg")) return;
    if (el.tagName === "BUTTON" && el.matches(LEWATI)) return;
    const teks = el.textContent.trim(); if (!teks) return;
    const nama = cariIkon(teks, el.tagName === "BUTTON" ? IKON_TOMBOL : IKON_JUDUL);
    if (nama) el.prepend(ikonSvg(nama));
  });
}
let tIkon = 0;
new MutationObserver(() => { cancelAnimationFrame(tIkon); tIkon = requestAnimationFrame(pasangIkon); })
  .observe(document.documentElement, { childList: true, subtree: true });
pasangIkon();

/* ---------- log aktivitas dari aplikasi (login, logout, ekspor) ---------- */
export function perangkatSingkat(){
  const u = navigator.userAgent;
  const os = /Android/i.test(u) ? "Android" : /iPhone|iPad|iPod/i.test(u) ? "iPhone/iPad" : /Windows/i.test(u) ? "Windows" : /Mac OS/i.test(u) ? "Mac" : /Linux/i.test(u) ? "Linux" : "Lainnya";
  const br = /; wv\)/.test(u) ? "WebView" : /Edg\//.test(u) ? "Edge" : /SamsungBrowser/.test(u) ? "Samsung Internet" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Browser";
  const app = matchMedia("(display-mode: standalone)").matches ? " (aplikasi)" : "";
  return os + " · " + br + app;
}
/* Identitas perangkat untuk log: nama buatan sendiri + model (Android) / versi Windows + browser + kode unik */
export function kodePerangkat(){
  let k = ""; try{ k = localStorage.getItem("absen:perangkatId") || ""; }catch(e){}
  if (!k){ k = Array.from(crypto.getRandomValues(new Uint8Array(2)), x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
    try{ localStorage.setItem("absen:perangkatId", k); }catch(e){} }
  return k;
}
export const namaPerangkat = () => { try{ return localStorage.getItem("absen:namaPerangkat") || ""; }catch(e){ return ""; } };
export function simpanNamaPerangkat(n){ try{ n ? localStorage.setItem("absen:namaPerangkat", n) : localStorage.removeItem("absen:namaPerangkat"); }catch(e){} }
let infoPerangkatCache = null;
export async function perangkatInfo(){
  if (!infoPerangkatCache){
    let os = perangkatSingkat();
    try{
      const d = await navigator.userAgentData?.getHighEntropyValues?.(["model", "platform", "platformVersion"]);
      if (d){
        if (d.platform === "Android" && d.model) os = os.replace("Android", "Android " + d.model);
        if (d.platform === "Windows" && d.platformVersion) os = os.replace("Windows", parseInt(d.platformVersion, 10) >= 13 ? "Windows 11" : "Windows 10");
      }
    }catch(e){}
    infoPerangkatCache = os;
  }
  const nama = namaPerangkat();
  return (nama ? nama + " · " : "") + infoPerangkatCache + " · #" + kodePerangkat();
}
// Posisi GPS untuk log aktivitas: pakai GPS satelit (akurat). Posisi akurat dipakai ulang 10 menit,
// posisi kasar (dari BTS/wifi, ±ratusan–ribuan meter) hanya 1 menit supaya cepat diganti yang akurat.
let posLog = null, posLogJalan = null;
const masihBaru = s => s && Date.now() - s.t < ((s.acc || 0) > 300 ? 60000 : 600000);
export function posisiLog(batas = 6000){
  if (masihBaru(posLog)) return Promise.resolve(posLog);
  try{ const s = JSON.parse(sessionStorage.getItem("absen:posLog") || "null"); if (masihBaru(s)) return Promise.resolve(posLog = s); }catch(e){}
  if (!navigator.geolocation) return Promise.resolve(null);
  const ambil = akurat => new Promise(ok => navigator.geolocation.getCurrentPosition(ok, () => ok(null),
    { enableHighAccuracy: akurat, maximumAge: akurat ? 60000 : 600000, timeout: akurat ? 7000 : 4000 }));
  posLogJalan ||= (async () => {
    let p = await ambil(true);             // GPS satelit dulu
    if (!p) p = await ambil(false);        // GPS mati / di dalam gedung: perkiraan dari jaringan
    if (!p) return null;
    const pos = { la: +p.coords.latitude.toFixed(6), lo: +p.coords.longitude.toFixed(6), acc: Math.round(p.coords.accuracy || 0), t: Date.now() };
    try{ pos.alamat = await alamatDari(pos.la, pos.lo, 4000) || ""; }catch(e){ pos.alamat = ""; }
    posLog = pos; try{ sessionStorage.setItem("absen:posLog", JSON.stringify(pos)); }catch(e){}
    return pos;
  })().finally(() => { posLogJalan = null; });
  return Promise.race([posLogJalan, new Promise(ok => setTimeout(() => ok(posLog), batas))]);
}
// Simpan posisi dari absen yang baru saja dilakukan (lebih akurat) supaya log berikutnya memakai posisi itu
export function setPosisiLog(la, lo, acc, alamat = ""){
  if (la == null || lo == null) return;
  posLog = { la: +(+la).toFixed(6), lo: +(+lo).toFixed(6), acc: Math.round(acc || 0), alamat, t: Date.now() };
  try{ sessionStorage.setItem("absen:posLog", JSON.stringify(posLog)); }catch(e){}
}
export async function catatLog(cid, uid, profil, aksi, ket){
  if (!cid || !uid) return;
  if (profil?.role === "superadmin") return;   // aktivitas superadmin (pengelola aplikasi) tidak dicatat di log perusahaan
  try{
    const [perangkat, pos] = await Promise.all([perangkatInfo(), posisiLog().catch(() => null)]);
    const gps = pos ? { la: pos.la, lo: pos.lo, acc: pos.acc, ...(pos.alamat ? { alamat: pos.alamat } : {}) } : {};
    await addDoc(collection(db, "companies", cid, "log"), { ts: serverTimestamp(), uid, nama: profil?.nama || "", role: profil?.role || "",
      aksi, ket, perangkat, sumber: "aplikasi", ...gps });
  }catch(e){ /* log tidak boleh mengganggu aplikasi */ }
}
// "Login" saat form login dipakai; "Membuka aplikasi" saat sesi lama dipakai lagi (sekali per tab)
export function tandaiLogin(){ try{ sessionStorage.setItem("absen:baruLogin", "1"); }catch(e){} }
export function jenisMasuk(){
  try{
    if (sessionStorage.getItem("absen:baruLogin")){ sessionStorage.removeItem("absen:baruLogin"); sessionStorage.setItem("absen:dicatat", "1"); return "login"; }
    if (sessionStorage.getItem("absen:dicatat")) return "";
    sessionStorage.setItem("absen:dicatat", "1"); return "buka";
  }catch(e){ return ""; }
}

/* ---------- kolom jam 24 jam (tanpa AM/PM, sama di semua perangkat) ---------- */
export const jamValid = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || ""));
function rapikanJam(v){
  const d = String(v).replace(/\D/g, "");
  if (!d) return "";
  let h, m;
  if (d.length <= 2){ h = +d; m = 0; }                    // "7" -> 07:00, "16" -> 16:00
  else if (d.length === 3){ h = +d[0]; m = +d.slice(1); }  // "730" -> 07:30
  else { h = +d.slice(0, 2); m = +d.slice(2, 4); }         // "1600" -> 16:00
  if (h > 23 || m > 59) return v;                          // biarkan, nanti ditandai salah
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
document.addEventListener("input", e => {
  const el = e.target; if (!el.classList?.contains("jam24")) return;
  const d = el.value.replace(/\D/g, "").slice(0, 4);
  el.value = d.length > 2 ? d.slice(0, 2) + ":" + d.slice(2) : d;   // titik dua otomatis
  el.classList.remove("jam-salah");
});
document.addEventListener("change", e => {
  const el = e.target; if (!el.classList?.contains("jam24")) return;
  el.value = rapikanJam(el.value);
  el.classList.toggle("jam-salah", !!el.value && !jamValid(el.value));
});

/* ---------- tema tampilan: terang (bawaan) / gelap / ikuti perangkat ---------- */
export function terapkanTema(t){
  try{ localStorage.setItem("absen:tema", t); }catch(e){}
  if (t === "auto") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", t === "gelap" ? "dark" : "light");
}
{
  const sel = document.getElementById("tema-pilih");
  if (sel){
    let t = "terang"; try{ t = localStorage.getItem("absen:tema") || "terang"; }catch(e){}
    sel.value = t; sel.onchange = () => terapkanTema(sel.value);
  }
}

/* ---------- dialog konfirmasi (pengganti confirm() bawaan browser) ---------- */
// Pemakaian: if (!(await tanya("Hapus data ini?", { ya: "Hapus", bahaya: true }))) return;
export function tanya(pesan, opsi = {}){
  return new Promise(selesai => {
    const bahaya = opsi.bahaya ?? /hapus|reset|ganti kode|permanen/i.test(pesan);
    const latar = document.createElement("div"); latar.className = "dialog-latar";
    latar.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-teks">
        <p id="dlg-teks" class="dialog-teks"></p>
        <div class="dialog-aksi"><button type="button" class="dialog-tidak">${opsi.tidak || "Batal"}</button>
          <button type="button" class="dialog-ya${bahaya ? " bahaya" : ""}">${opsi.ya || "Ya"}</button></div></div>`;
    latar.querySelector(".dialog-teks").textContent = pesan;
    const sebelum = document.activeElement;
    const tutup = hasil => { document.removeEventListener("keydown", tombol); latar.classList.add("tutup");
      setTimeout(() => latar.remove(), 150); sebelum?.focus?.(); selesai(hasil); };
    const tombol = e => { if (e.key === "Escape") tutup(false); };
    latar.querySelector(".dialog-tidak").onclick = () => tutup(false);
    latar.querySelector(".dialog-ya").onclick = () => tutup(true);
    latar.onclick = e => { if (e.target === latar) tutup(false); };
    document.addEventListener("keydown", tombol);
    document.body.append(latar);
    latar.querySelector(".dialog-ya").focus();
  });
}

{
  const el = document.getElementById("nama-perangkat");
  if (el){
    el.value = namaPerangkat();
    const info = document.getElementById("nama-perangkat-info");
    const tampil = async () => { if (info) info.textContent = "Tercatat di log sebagai: " + await perangkatInfo(); };
    el.addEventListener("change", () => { simpanNamaPerangkat(el.value.trim().slice(0, 40)); tampil(); });
    tampil();
  }
}

/* versi aplikasi: tampil di Pengaturan untuk memastikan HP memakai versi terbaru */
export const VERSI_APP = "2026.11.18f";
document.querySelectorAll(".versi-app").forEach(async el => {
  const wv = /; wv\)/.test(navigator.userAgent);
  let jari = false;
  try{ jari = !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }catch(e){}
  el.innerHTML = "Versi aplikasi " + VERSI_APP + " · Mesin: <b>" + (wv ? "WebView" : "Chrome/Safari") + "</b> · Sidik jari: <b>" +
    (jari ? "didukung" : "tidak didukung") + "</b>" + (wv || !jari ? '<br><span style="color:var(--bad)">Sidik jari tidak bisa dipakai di sini. Buka absencsm.pages.dev di Chrome lalu pilih "Instal aplikasi".</span>' : "");
});

// Tombol Perbarui: ikon berputar, cek versi di server, lalu muat ulang. Setelah terbuka lagi tampil keterangan hasilnya.
document.querySelectorAll(".muat-ulang-app").forEach(b => b.onclick = async () => {
  if (b.classList.contains("berputar")) return;
  b.classList.add("berputar"); b.disabled = true;
  let baru = "";
  try{ baru = ((await (await fetch("/common.js?cek=" + Date.now(), { cache: "no-store" })).text()).match(/export const VERSI_APP = "(\d{4}\.[\d.]+[a-z]?)"/) || [])[1] || ""; }catch(e){}
  try{ toast(baru && baru !== VERSI_APP ? "🔄 Memperbarui ke versi " + baru + "…" : "🔄 Memuat ulang aplikasi…"); }catch(e){}
  try{ sessionStorage.setItem("absen:perbarui", VERSI_APP); }catch(e){}
  setTimeout(muatUlangAplikasi, 600);
});
(() => {
  let lama = null; try{ lama = sessionStorage.getItem("absen:perbarui"); sessionStorage.removeItem("absen:perbarui"); }catch(e){}
  if (lama === null) return;
  setTimeout(() => { try{ toast(lama === VERSI_APP ? "✅ Aplikasi sudah versi terbaru (" + VERSI_APP + ")" : "✅ Diperbarui ke versi " + VERSI_APP); }catch(e){} }, 900);
})();

/* ---------- semua kolom tanggal: diketik dd/mm/yy, ditampilkan Medium Date "06 Okt 26" ----------
   <input type="date"> bawaan browser tampil berbeda di tiap HP (kadang mm/dd/yyyy).
   Setiap input tanggal disembunyikan dan diganti kotak teks. Saat diklik isinya jadi dd/mm/yy untuk diketik,
   saat ditinggal tampil "06 Okt 26". Nilai aslinya tetap YYYY-MM-DD, jadi kode lain yang membaca/mengisi .value tidak berubah. */
const ISO_KE_DMY = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v.slice(8) + "/" + v.slice(5, 7) + "/" + v.slice(2, 4) : "";
const ISO_KE_MED = v => /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? tglMedium(v) : "";
// terima "05/10/26", "5/10/2026", juga "05 Oct 26" / "05 Okt 2026" -> "2026-10-05" ("" kalau tidak valid)
export function dmyKeIso(t){
  t = String(t || "").trim();
  let tg, bl, th;
  const mt = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (mt){ tg = +mt[1]; bl = +mt[2]; th = +mt[3]; }
  else {
    const mm = t.match(/^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-]+(\d{2}|\d{4})$/); if (!mm) return "";
    const b3 = mm[2].toLowerCase(), cari = L => L.findIndex(b => b.toLowerCase() === b3), i = cari(BULAN_PENDEK) >= 0 ? cari(BULAN_PENDEK) : cari(BULAN_ID); if (i < 0) return "";
    tg = +mm[1]; bl = i + 1; th = +mm[3];
  }
  if (th < 100) th += 2000;
  const d = new Date(th, bl - 1, tg);
  if (d.getDate() !== tg || d.getMonth() !== bl - 1) return "";
  return th + "-" + String(bl).padStart(2, "0") + "-" + String(tg).padStart(2, "0");
}
// Ketik angka saja: "051026" -> "05/10/26"
export function pasangKetikTanggal(el){
  el.addEventListener("input", () => {
    const d = el.value.replace(/\D/g, "").slice(0, 6);
    el.value = d.length > 4 ? d.slice(0, 2) + "/" + d.slice(2, 4) + "/" + d.slice(4) : d.length > 2 ? d.slice(0, 2) + "/" + d.slice(2) : d;
    el.classList.remove("salah");
  });
}
// Kotak teks tanggal biasa: diketik dd/mm/yy, saat ditinggal tampil "06 Okt 26". Baca nilainya dengan dmyKeIso().
export function pasangTanggalMedium(el){
  if (el.dataset.medium) return; el.dataset.medium = "1";
  el.maxLength = 11; if (!el.placeholder) el.placeholder = "dd/mm/yy";
  pasangKetikTanggal(el);
  const keMed = () => { const iso = dmyKeIso(el.value); if (iso) el.value = tglMedium(iso); };
  el.addEventListener("focus", () => { const iso = dmyKeIso(el.value); if (iso){ el.value = ISO_KE_DMY(iso); el.select?.(); } });
  el.addEventListener("blur", keMed);
  keMed();
}
function jadikanDMY(asli){
  if (asli.dataset.dmy) return; asli.dataset.dmy = "1";
  const teks = document.createElement("input");
  teks.type = "text"; teks.inputMode = "numeric"; teks.maxLength = 11; teks.placeholder = "dd/mm/yy"; teks.autocomplete = "off";
  teks.className = (asli.className ? asli.className + " " : "") + "tgl-dmy";
  if (asli.getAttribute("aria-label")) teks.setAttribute("aria-label", asli.getAttribute("aria-label"));
  if (asli.disabled) teks.disabled = true;
  asli.type = "text"; asli.hidden = true; asli.tabIndex = -1;
  // label "for" diarahkan ke kotak teks yang terlihat
  if (asli.id){ teks.id = asli.id + "-dmy"; document.querySelectorAll(`label[for="${asli.id}"]`).forEach(l => l.htmlFor = teks.id); }
  const desk = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(asli, "value", {
    configurable: true,
    get(){ return desk.get.call(this); },
    set(v){ desk.set.call(this, v || ""); if (document.activeElement !== teks || !v) teks.value = ISO_KE_MED(v); }
  });
  teks.value = ISO_KE_MED(desk.get.call(asli));
  pasangKetikTanggal(teks);
  const kirim = () => {
    const iso = teks.value ? dmyKeIso(teks.value) : "";
    if (teks.value && !iso){ teks.classList.add("salah"); return false; }
    const min = asli.getAttribute("min"), max = asli.getAttribute("max");
    if (iso && ((min && iso < min) || (max && iso > max))){ teks.classList.add("salah"); toast("Tanggal di luar batas yang diizinkan."); return false; }
    if (iso === desk.get.call(asli)) return true;
    desk.set.call(asli, iso);
    asli.dispatchEvent(new Event("input", { bubbles: true })); asli.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };
  // klik -> tampil dd/mm/yy untuk diketik; tinggalkan -> tampil "06 Okt 26"
  teks.addEventListener("focus", () => { const v = desk.get.call(asli); if (v && dmyKeIso(teks.value) === v){ teks.value = ISO_KE_DMY(v); teks.select(); } });
  teks.addEventListener("input", () => { if (teks.value.length === 8 || !teks.value) kirim(); });
  teks.addEventListener("change", kirim);
  teks.addEventListener("blur", () => { if (kirim()) teks.value = ISO_KE_MED(desk.get.call(asli)); });
  asli.after(teks);
}
document.querySelectorAll('input[type="date"]').forEach(jadikanDMY);
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes){
  if (n.nodeType !== 1) continue;
  if (n.matches?.('input[type="date"]')) jadikanDMY(n);
  n.querySelectorAll?.('input[type="date"]').forEach(jadikanDMY);
} }).observe(document.documentElement, { childList: true, subtree: true });

// Tampilkan versi aplikasi (di bawah logo / nama aplikasi)
document.querySelectorAll(".versi-tampil").forEach(e => { e.textContent = "Versi " + VERSI_APP; });

// Browser/pengelola sandi kadang mengisi kotak Cari dengan username login (mis. "admin.csm"),
// sehingga daftar seolah hanya berisi 1 orang. Isian yang tidak diketik sendiri dikosongkan.
(() => {
  const SEL = 'input[type="search"]';
  let ketikTerakhir = 0;
  const tandai = e => { if (e.target?.matches?.(SEL)) ketikTerakhir = Date.now(); };
  ["keydown", "paste", "cut", "drop"].forEach(t => document.addEventListener(t, tandai, true));
  const kosongkan = i => { i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); };
  // isian otomatis memicu event input tanpa ketikan sebelumnya
  document.addEventListener("input", e => {
    const i = e.target; if (!i?.matches?.(SEL) || !i.value) return;
    if (Date.now() - ketikTerakhir > 1500) setTimeout(() => { if (Date.now() - ketikTerakhir > 1500 && i.value) kosongkan(i); }, 0);
  }, true);
  // isian otomatis yang tidak memicu event: periksa berkala
  const cek = () => document.querySelectorAll(SEL).forEach(i => { if (i.value && Date.now() - ketikTerakhir > 1500 && i !== document.activeElement && !i.dataset.diketik) kosongkan(i); });
  document.addEventListener("keyup", e => { if (e.target?.matches?.(SEL) && e.target.value) e.target.dataset.diketik = "1"; else if (e.target?.matches?.(SEL)) delete e.target.dataset.diketik; }, true);
  [300, 1500, 4000].forEach(t => setTimeout(cek, t));
  setInterval(cek, 3000);
})();

/* Pilihan bulan untuk browser yang tidak punya kalender bulan (Firefox, Safari desktop):
   input type="month" diganti 2 pilihan (Bulan & Tahun); nilai input asli tetap "YYYY-MM" dan event change tetap jalan */
export function pasangPilihBulan(root = document){
  const uji = document.createElement("input"); uji.setAttribute("type", "month");
  if (uji.type === "month" && !/firefox/i.test(navigator.userAgent)) return;   // browser sudah punya kalender bulan
  const NAMA = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const desk = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  root.querySelectorAll('input[type="month"]:not([data-pb])').forEach(inp => {
    inp.dataset.pb = "1";
    const wadah = document.createElement("div"); wadah.className = "pilih-bulan";
    const sb = document.createElement("select"), st = document.createElement("select");
    sb.setAttribute("aria-label", "Bulan"); st.setAttribute("aria-label", "Tahun");
    sb.innerHTML = NAMA.map((n, i) => `<option value="${String(i + 1).padStart(2, "0")}">${n}</option>`).join("");
    const isiTahun = y => { const now = new Date().getFullYear(), a = Math.min(now - 5, y || now), b = Math.max(now + 1, y || now);
      st.innerHTML = Array.from({ length: b - a + 1 }, (_, i) => `<option>${b - i}</option>`).join(""); };
    const sinkron = v => { const m = /^(\d{4})-(\d{2})$/.exec(v || ""); if (!m) return;
      if (![...st.options].some(o => o.value === m[1])) isiTahun(+m[1]); st.value = m[1]; sb.value = m[2]; };
    isiTahun();
    inp.type = "text"; inp.hidden = true; inp.setAttribute("inputmode", "none");
    inp.after(wadah); wadah.append(sb, st);
    if (inp.id){ sb.id = inp.id + "-bln"; const lbl = document.querySelector(`label[for="${inp.id}"]`); if (lbl) lbl.htmlFor = sb.id; }
    // nilai yang diisi lewat kode ikut menggeser pilihan
    Object.defineProperty(inp, "value", { configurable: true,
      get(){ return desk.get.call(this); },
      set(v){ desk.set.call(this, v); sinkron(v); } });
    const ubah = () => { desk.set.call(inp, st.value + "-" + sb.value);
      inp.dispatchEvent(new Event("input", { bubbles: true })); inp.dispatchEvent(new Event("change", { bubbles: true })); };
    sb.onchange = ubah; st.onchange = ubah;
    if (inp.disabled){ sb.disabled = st.disabled = true; }
    const v0 = desk.get.call(inp); if (v0) sinkron(v0);
    else { const d = new Date(); st.value = String(d.getFullYear()); sb.value = String(d.getMonth() + 1).padStart(2, "0"); desk.set.call(inp, st.value + "-" + sb.value); }
  });
}
pasangPilihBulan();
