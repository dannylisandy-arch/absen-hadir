import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  setPersistence, browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { doc, getDoc, getDocs, setDoc, addDoc, deleteDoc, collection, query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sRef, uploadBytesResumable, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { storage, kompres, cekFile, daftarLampiran, LAMPIRAN_MAX, isGambar, ukuran } from "./common.js";
import { keEmail, validUsername, validKode, masukUsername, kodeTerakhir, pasangMata, alamatDari } from "./common.js";
import { notifAktif, disableNotif, catatLog, tandaiLogin, jenisMasuk, tanya, perangkatInfo, setPosisiLog } from "./common.js";
import { auth, db, $, msg, toast, jenis, tsOf, fmtWaktu, fmtJam, STATUS, authError, enableNotif, refreshNotif, fmtNum, tglMedium, tglMediumHari } from "./common.js";
import { gajiPeriode, angsuranPeriode, statusPinjaman, ymLabel } from "./payroll.js";
import { rentangPeriode, LUPA_ABSEN, namaJenisIzin } from "./payroll.js";
import { jamValid, VERSI_APP, app, bunyiNotif, pantauVersiBaru } from "./common.js";
import { masaAktif, teksHabis } from "./common.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { ATURAN_DEFAULT, petaLibur } from "./payroll.js";
import { hitungGaji, rincianHTML, cetakSlip, cetakSlips, rp, esc, namaBulan, ym12, hariKerjaAntara, rentang, dayKey, cutiTerpakai } from "./payroll.js";

// Versi HTML & JS harus sama; kalau beda (cache campur, mis. HTML lama + JS baru) -> hapus cache & muat ulang sekali
{ const vH = document.querySelector('meta[name="versi-app"]')?.content;
  if (vH !== VERSI_APP){
    let sudah = true; try{ sudah = sessionStorage.getItem("__perbaiki") === "1"; if (!sudah) sessionStorage.setItem("__perbaiki", "1"); }catch(e){}
    if (!sudah){ const ulang = () => location.reload(); (window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve()).then(ulang, ulang); }
  } }

// versi baru otomatis dipasang setiap aplikasi dibuka (tidak saat sedang absen / mengisi pengajuan)
pantauVersiBaru(() => sedangAbsen || !$("#cuti")?.hidden || !$("#izin")?.hidden);

const FACE_MIN = 0.80;
const store = {
  get(k){ try{ return JSON.parse(localStorage.getItem("absen:" + k)); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem("absen:" + k, JSON.stringify(v)); }catch(e){} }
};
let CID = "";                                                   // id perusahaan pengguna yang login
const C = (...p) => collection(db, "companies", CID, ...p);    // koleksi milik perusahaan
const D = (...p) => doc(db, "companies", CID, ...p);           // dokumen milik perusahaan
let sedangDaftar = false;
let lokasiList = [], akurasiGlobal = 100;
// Metode verifikasi dari perusahaan: "salah" (wajah ATAU sidik jari), "wajah", "jari", "keduanya"
let metodeVerif = "salah", pulihOtomatis = false;   // pulihOtomatis: HP yang datanya terhapus dipulihkan dengan verifikasi wajah
const METODE_INFO = {
  salah:    "Daftarkan <b>wajah, sidik jari, atau keduanya</b>. Cukup salah satu untuk bisa absen.",
  wajah:    "Perusahaan memakai <b>verifikasi wajah</b>. Daftarkan wajah untuk bisa absen.",
  jari:     "Perusahaan memakai <b>verifikasi sidik jari</b>. Daftarkan sidik jari untuk bisa absen.",
  keduanya: "Perusahaan mewajibkan <b>wajah dan sidik jari</b>. Daftarkan keduanya untuk bisa absen."
};
function terapkanMetode(){
  $("#metode-info").innerHTML = METODE_INFO[metodeVerif] || METODE_INFO.salah;
  $("#sec-wajah").hidden = metodeVerif === "jari";
  $("#sec-jari").hidden = metodeVerif === "wajah";
  aturCek();
}
// Pilihan metode (mode "wajah atau sidik jari"), diingat di HP ini
const metodePilihan = () => store.get("metodePilih") === "jari" ? "jari" : "wajah";
function tampilPilihMetode(){
  const box = $("#pilih-metode"); if (!box || !profile) return;
  box.hidden = metodeVerif !== "salah";
  const v = metodePilihan();
  box.querySelectorAll("button").forEach(b => { const on = b.dataset.m === v; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
}
document.querySelectorAll("#pilih-metode button").forEach(b => b.onclick = () => { store.set("metodePilih", b.dataset.m); aturCek(); });
// Layar absen: tampilkan hanya pemeriksaan yang dipakai
function aturCek(){
  if (!profile) return;
  tampilPilihMetode();
  const wajahTerdaftar = !!(profile.daftarWajah && dataWajah());
  const jariTerdaftar  = !!(profile.daftarJari && store.get("finger:" + me.uid));
  const pilihJari = metodeVerif === "salah" && metodePilihan() === "jari";
  const cocokWajah = metodeVerif === "wajah" || metodeVerif === "keduanya" || (metodeVerif === "salah" && !pilihJari && wajahTerdaftar);
  const tampilJari = metodeVerif === "jari" || metodeVerif === "keduanya" || (metodeVerif === "salah" && (pilihJari || jariTerdaftar));
  // Kamera selalu dipakai (uji wajah hidup + selfie); tanpa pencocokan wajah namanya "Selfie"
  const lbl = $("#c-face b"), teks = cocokWajah ? "Wajah" : "Selfie";
  if (lbl.textContent.trim() !== teks) lbl.textContent = teks;
  // unduh model pengenal wajah di latar belakang agar absen tidak menunggu
  if (cocokWajah && (dataWajah() || perluPerbaruiWajah()) && !muatPengenal) setTimeout(() => siapkanPengenal().catch(() => {}), 4000);
  $("#c-finger").hidden = !tampilJari;
  $("#arc-finger").style.display = tampilJari ? "" : "none";
  const n = tampilJari ? 3 : 2;
  $(".checks").style.gridTemplateColumns = "repeat(" + n + ",1fr)";
  // Bagi lingkaran kamera rata sesuai jumlah pemeriksaan
  const busur = Math.round(300 / n) - 8, langkah = 300 / n;
  ["arc-face", ...(tampilJari ? ["arc-finger"] : []), "arc-gps"].forEach((id, i) => {
    $("#" + id).setAttribute("stroke-dasharray", busur + " " + (300 - busur));
    $("#" + id).setAttribute("stroke-dashoffset", String(-i * langkah));
  });
}
// Lokasi yang boleh dipakai karyawan ini (kosong di profil = semua lokasi)
const lokasiSaya = () => profile?.lokasiKerja?.length ? lokasiList.filter(L => profile.lokasiKerja.includes(L.id)) : lokasiList;
function renderLokasiInfo(){
  const box = $("#kantor-info"), list = lokasiSaya();
  if (!list.length){ box.textContent = "Belum diatur. Minta admin mengisinya di dashboard."; return; }
  const tb = Math.max(0, +profile?.radiusTambah || 0);
  box.innerHTML = list.map(L => `<b>${esc(L.nama)}</b> · radius ${fmtNum((L.rad || 0) + tb)} m${tb ? ` <span class="meta">(termasuk tambahan ${fmtNum(tb)} m)</span>` : ""}${L.alamat ? "<br><span class=\"meta\">📍 " + esc(L.alamat) + "</span>" : ""}`).join("<hr class=\"tipis\">") +
    `<div class="meta" style="margin-top:8px">Diatur oleh admin. Absen dicocokkan ke lokasi terdekat.</div>`;
}
let unsubMetode = null, ptSaya = null, unsubHariIni = null;
/* Absen masuk & pulang bergantian, dilihat dari absen terakhir:
   - terakhir MASUK  -> Masuk terkunci, Pulang aktif
   - terakhir PULANG / belum ada -> Masuk aktif, Pulang terkunci
   Pengingat jam pulang +2 dan +4 jam. Tanpa jawaban sampai jam pulang +6 jam, server mencatat absen pulang
   di jam pulang kerja (tanpa lembur) sehingga Absen Masuk terbuka lagi. "Masih lembur" -> tidak ditutup otomatis. */
let jawabLembur = false, unsubJawab = null, jawabUntuk = "";
let absenTerakhir = null, sedangAbsen = false, semuaPengajuan = [];
// absen masuk yang belum ditutup absen pulang (berapa pun lamanya) -> Absen Masuk terkunci
// Lupa absen pulang yang sudah DIAJUKAN (menunggu/disetujui) untuk tanggal absen masuk itu dianggap menutupnya,
// supaya karyawan bisa absen masuk lagi walau admin belum sempat menyetujui (mis. di luar jam kantor)
const lupaPulangDiajukan = r => !!r && semuaPengajuan.some(z =>
  z.jenis === "lupaPulang" && z.status !== "tolak" && z.mulai === dayKey(tsOf(r)) && (!z.ts?.toDate || z.ts.toDate() >= tsOf(r)));
// Hari libur / tanggal merah / hari off: jam kerja tidak berlaku (jam bebas, masuk hitungan Lebih HK)
const hariLiburSaya = d => { const A = { ...ATURAN_DEFAULT, ...(aturanGaji || {}) }; return !A.hariKerja.includes(d.getDay()) || !!petaLibur(A)[dayKey(d)]; };
const masukHariLibur = r => !!r && r.type === "masuk" && hariLiburSaya(tsOf(r));
// Masuk hari libur yang lupa ditutup: sudah ganti hari & lewat 16 jam -> tidak mengunci lagi (absen pulangnya dicatat admin lewat Absen manual)
const liburTertinggal = () => masukHariLibur(absenTerakhir) && dayKey(new Date()) !== dayKey(tsOf(absenTerakhir)) && Date.now() - tsOf(absenTerakhir) >= 16 * 3600e3;   // 16 jam: shift malam di hari libur tetap bisa absen pulang paginya
// tanggal yang lemburnya sudah diisi & disetujui admin (tanpa absen pulang) -> absen masuk tanggal itu dianggap selesai
let lemburSaya = new Set();
const masukTerbuka = () => absenTerakhir?.type === "masuk" && !lupaPulangDiajukan(absenTerakhir) && !liburTertinggal()
  && !lemburSaya.has(dayKey(tsOf(absenTerakhir))) ? absenTerakhir : null;
// tidak ada lagi batas yang mengunci: tanpa jawaban, server menutup absen pulang otomatis 2 jam setelah pengingat terakhir
const masukKedaluwarsa = () => false;
const sedangMasuk = () => !!masukTerbuka() && !masukKedaluwarsa();
const bolehPulang = () => sedangMasuk();
const bolehMasuk = () => !masukTerbuka();
function aturTombolAbsen(){
  const terbuka = !!masukTerbuka(), lewat = masukKedaluwarsa();
  if (!sedangAbsen){ $("#btn-in").disabled = terbuka; $("#btn-out").disabled = !terbuka || lewat; }
  $("#btn-in").title = terbuka ? "Absen pulang dulu" : ""; $("#btn-out").title = !terbuka ? "Absen masuk dulu" : lewat ? "Pilih Lupa absen pulang" : "";
  const h = $("#pulang-hint"); if (!h) return;
  h.textContent = lewat ? "Absen masuk " + tglMedium(tsOf(absenTerakhir)) + " " + fmtJam(tsOf(absenTerakhir)) + " belum ditutup. Ketuk di sini untuk memilih Lupa absen pulang."
    : terbuka ? "Sudah absen masuk " + fmtJam(tsOf(absenTerakhir)) + (masukHariLibur(absenTerakhir) ? " (hari libur, jam bebas)" : "") + ". Absen Masuk aktif lagi setelah absen pulang."
    : liburTertinggal() ? "Absen pulang hari libur " + tglMedium(tsOf(absenTerakhir)) + " belum ada. Minta admin mencatatnya lewat Absen manual."
    : "Absen Pulang aktif setelah absen masuk.";
  h.classList.toggle("peringatan", lewat || (!terbuka && liburTertinggal())); h.onclick = lewat ? () => tanganiPengingat("tanya") : null; h.style.cursor = lewat ? "pointer" : "";
}
setInterval(aturTombolAbsen, 60000);

/* Menu Absen muat dalam 1 layar HP: lingkaran kamera mengecil/membesar mengikuti sisa tinggi layar */
function pasLayarAbsen(){
  const akar = document.documentElement, tab = $("#tab-absen"), nav = document.querySelector("nav");
  if (innerWidth >= 1000){ akar.style.removeProperty("--vf-ukuran"); akar.style.removeProperty("--pb-absen"); return; }
  if (sedangAbsen || !tab?.classList.contains("on") || $("#app-view")?.hidden || !$("#cuti")?.hidden) return;
  const maks = Math.min(300, Math.round(innerWidth * 0.78)), akhir = tab.querySelector(".aksi-bawah");
  if (!akhir) return;
  akar.style.setProperty("--vf-ukuran", maks + "px");
  const bawah = akhir.getBoundingClientRect().bottom + scrollY, batas = innerHeight - (nav?.offsetHeight || 0) - 10;
  const ukuran = Math.max(100, Math.min(maks, Math.floor(maks - (bawah - batas))));
  akar.style.setProperty("--vf-ukuran", ukuran + "px");
  akar.style.setProperty("--pb-absen", ((nav?.offsetHeight || 0) + 10) + "px");   // tidak ada ruang kosong untuk di-scroll
}
let tPas = 0; const pasNanti = () => { clearTimeout(tPas); tPas = setTimeout(pasLayarAbsen, 60); };
addEventListener("resize", pasNanti);
document.querySelectorAll("nav button[data-tab]").forEach(b => b.addEventListener("click", pasNanti));
{ const t = $("#tab-absen"); if (t) new MutationObserver(pasNanti).observe(t, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["hidden", "class"] }); }
{ const av = $("#app-view"); if (av) new MutationObserver(pasNanti).observe(av, { attributes: true, attributeFilter: ["hidden"] }); }
let unsubTerakhir = null;
// jawaban "Masih lembur" untuk absen masuk yang sedang terbuka (disimpan server di pengingat/{idAbsenMasuk})
function pantauJawab(){
  const id = absenTerakhir?.type === "masuk" ? absenTerakhir._id : "";
  if (id === jawabUntuk) return;
  unsubJawab?.(); unsubJawab = null; jawabUntuk = id; jawabLembur = false;
  if (!id) return;
  unsubJawab = onSnapshot(doc(db, "companies", CID, "pengingat", id), s => {
    let tertunda = false; try{ tertunda = JSON.parse(localStorage.getItem("absen:lemburTertunda") || "null")?.masukId === id; }catch(e){}
    jawabLembur = (s.exists() && s.data().jawab === "lembur") || tertunda; aturTombolAbsen(); }, () => {});
}
let unsubLemburSaya = null;
function pantauLemburSaya(){
  unsubLemburSaya?.();
  unsubLemburSaya = onSnapshot(query(C("lembur"), where("uid", "==", me.uid), where("status", "==", "lembur")), snap => {
    lemburSaya = new Set(snap.docs.map(x => x.data().tanggal).filter(Boolean)); aturTombolAbsen();
  }, () => {});
}
function pantauTerakhir(){
  unsubTerakhir?.(); pantauLemburSaya();
  const q = query(C("absensi"), where("uid", "==", me.uid), orderBy("ts", "desc"), limit(10));
  unsubTerakhir = onSnapshot(q, snap => {
    const semua = snap.docs.map(x => ({ ...x.data({ serverTimestamps: "estimate" }), _id: x.id })).filter(x => x.status !== "tolak");
    absenTerakhir = semua.sort((a, b) => tsOf(b) - tsOf(a))[0] || null; pantauJawab(); aturTombolAbsen(); cekTanyaPengingat();
  }, () => {});
}
function pantauHariIni(){
  unsubHariIni?.(); pantauTerakhir();
  const awal = new Date(); awal.setHours(0, 0, 0, 0);
  // ambil juga 30 jam terakhir: shift malam masuk kemarin, pulang hari ini
  const dari = new Date(Math.min(awal.getTime(), Date.now() - 30 * 3600e3));
  const q = query(C("absensi"), where("uid", "==", me.uid), where("ts", ">=", Timestamp.fromDate(dari)), orderBy("ts", "desc"));
  unsubHariIni = onSnapshot(q, snap => {
    const semua = snap.docs.map(x => x.data({ serverTimestamps: "estimate" })).filter(x => x.status !== "tolak");
    const r = semua.filter(x => tsOf(x) >= awal).reverse();
    const masuk = r.find(x => x.type === "masuk"), pulang = [...r].reverse().find(x => x.type === "pulang");
    const tunggu = r.some(x => x.status === "menunggu");
    $("#status-hari").textContent = !masuk && !pulang ? "⏳ Belum absen"
      : masuk && pulang ? "✅ Selesai " + fmtJam(tsOf(masuk)) + "–" + fmtJam(tsOf(pulang))
      : masuk ? "🟢 Sudah masuk " + fmtJam(tsOf(masuk)) + (tunggu ? " · menunggu" : "")
      : "🔵 Pulang " + fmtJam(tsOf(pulang));
  }, () => { $("#status-hari").textContent = ""; });
}
let unsubProfil = null;
let me = null, profile = null, kantor = null, unsubLog = null, unsubKantor = null, unsubIzin = null, aturanGaji = {};

/* ---------- login ---------- */
let daftar = false;
function setMode(d){
  daftar = d;
  document.querySelectorAll(".authmode button").forEach(b => b.setAttribute("aria-selected", (b.dataset.m === "daftar") === d));
  $("#f-nama-wrap").hidden = $("#f-pass2-wrap").hidden = $("#user-hint").hidden = !d;
  $("#lupa").hidden = d;
  $("#f-go").textContent = d ? "Daftar" : "Masuk";
  $("#f-pass").autocomplete = d ? "new-password" : "current-password";
  $("#auth-sub").textContent = d ? "Buat akun karyawan baru." : "Masuk dengan akun karyawan.";
  msg($("#auth-msg"), "");
}
document.querySelectorAll(".authmode button").forEach(b => b.onclick = () => setMode(b.dataset.m === "daftar"));
pasangMata($("#f-eye"), $("#f-pass"));
$("#auth-form").onsubmit = async e => {
  e.preventDefault();
  const m = $("#auth-msg"), user = $("#f-user").value.trim(), pass = $("#f-pass").value, nama = $("#f-nama").value.trim();
  const kode = "";
  if (!user){ msg(m, "Isi username.", "bad"); $("#f-user").focus(); return; }
  if (!pass){ msg(m, "Isi password.", "bad"); $("#f-pass").focus(); return; }
  const username = user.toLowerCase();
  if (daftar){
    if (!nama){ msg(m, "Isi nama lengkap.", "bad"); return; }
    if (!validUsername(username)){ msg(m, "Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.", "bad"); return; }
    if (pass.length < 6){ msg(m, "Password minimal 6 karakter.", "bad"); return; }
    if (pass !== $("#f-pass2").value){ msg(m, "Ulangi password tidak sama.", "bad"); return; }
  }
  $("#f-go").disabled = true; msg(m, "Memproses…");
  try{
    await setPersistence(auth, $("#f-ingat").checked ? browserLocalPersistence : browserSessionPersistence);
    if (daftar){
      const k = await getDoc(doc(db, "kodes", kode));
      if (!k.exists()){ msg(m, "Kode perusahaan tidak ditemukan. Tanyakan ke admin.", "bad"); $("#f-go").disabled = false; return; }
      sedangDaftar = true;
      const c = await createUserWithEmailAndPassword(auth, keEmail(username, kode), pass);
      await setDoc(doc(db, "users", c.user.uid), { nama, username, role: "karyawan", cid: k.data().cid, kode, dibuat: serverTimestamp() });
      sedangDaftar = false;
      await mulai(c.user);
    } else {
      tandaiLogin();
      await masukUsername((e, p) => signInWithEmailAndPassword(auth, e, p), kode, user, pass);
    }

    msg(m, ""); $("#f-pass").value = $("#f-pass2").value = "";
  }catch(err){ sedangDaftar = false; msg(m, authError(err), "bad"); }
  $("#f-go").disabled = false;
};
$("#logout-hero").onclick = async () => { if (await tanya("Keluar dari aplikasi?", { ya: "Keluar" })) $("#logout").click(); };
$("#logout").onclick = async () => { await catatLog(CID, me?.uid, profile, "logout", "Logout dari aplikasi karyawan"); try{ sessionStorage.removeItem("absen:dicatat"); }catch(e){} signOut(auth); };

onAuthStateChanged(auth, user => { if (!sedangDaftar) mulai(user).catch(gagalMuat).finally(() => $("#memuat")?.remove()); });
// Kalau pemuatan gagal, jangan biarkan layar kosong: tampilkan login + pesan yang jelas.
function gagalMuat(e){
  console.error(e);
  const kode = e?.code || e?.message || String(e);
  const saran = String(kode).includes("permission-denied")
    ? "Akses ditolak database. Pastikan aturan terbaru sudah di-deploy (firebase deploy --only firestore) dan peran akun ini benar."
    : String(kode).includes("unavailable") || String(kode).includes("network")
      ? "Tidak bisa terhubung ke server. Periksa internet lalu muat ulang."
      : "Terjadi kesalahan saat memuat.";
  $("#memuat")?.remove();
  $("#app-view").hidden = true; $("#auth-view").hidden = false;
  msg($("#auth-msg"), saran + " (" + kode + ")", "bad");
  signOut(auth).catch(() => {});
}

async function mulai(user){
  unsubLog?.(); unsubKantor?.(); unsubIzin?.(); unsubHariIni?.(); unsubTerakhir?.(); unsubProfil?.(); unsubProfil = null;
  me = user;
  if (!user){ $("#app-view").hidden = true; $("#auth-view").hidden = false; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  profile = snap.exists() ? snap.data() : null;
  if (profile?.aktif === false){
    await signOut(auth); msg($("#auth-msg"), "Akun ini dinonaktifkan. Hubungi admin.", "bad"); return;
  }
  if (!profile?.cid){
    await signOut(auth);
    msg($("#auth-msg"), profile?.role === "superadmin"
      ? "Akun superadmin dipakai di halaman admin.html."
      : "Akun ini belum terhubung ke perusahaan. Hubungi admin.", "bad");
    return;
  }
  CID = profile.cid;
  // masa coba / langganan perusahaan habis -> tidak bisa masuk (data tetap tersimpan)
  try{ const co0 = await getDoc(doc(db, "companies", CID)); if (co0.exists()) ptSaya = co0.data(); }catch(e){}
  if (masaAktif(ptSaya).habis){ await signOut(auth); msg($("#auth-msg"), teksHabis(ptSaya), "bad"); return; }
  const jm = jenisMasuk();
  if (jm) catatLog(CID, user.uid, profile, jm, jm === "login" ? "Login ke aplikasi karyawan" : "Membuka aplikasi karyawan");
  await sinkronBiometrik(user.uid);
  let namaPT = profile.kode || "";
  if (ptSaya?.nama) namaPT = ptSaya.nama;
  $("#who").textContent = namaPT || profile.nama;        // hanya nama perusahaan (nama karyawan sudah ada di sapaan)
  if (ptSaya?.logo){ $("#pt-logo").src = ptSaya.logo; $("#pt-logo").hidden = false; } else $("#pt-logo").hidden = true;
  $("#auth-view").hidden = true; $("#app-view").hidden = false;
  if ($("#tab-absen")?.classList.contains("on")) panaskanGPS();
  cekPrivasi();
  cekHPOtomatis();
  // Lokasi absen (banyak lokasi); data lama "settings/kantor" dipakai kalau daftar lokasi belum ada
  unsubKantor = onSnapshot(D("settings", "lokasi"), async s => {
    if (s.exists()){ lokasiList = s.data().daftar || []; akurasiGlobal = s.data().akurasi || 100; }
    else {
      const k = await getDoc(D("settings", "kantor")).catch(() => null);
      const kd = k?.exists() ? k.data() : null;
      lokasiList = kd ? [{ id: "kantor", nama: "Kantor", ...kd }] : []; akurasiGlobal = kd?.akurasi || 100;
    }
    kantor = lokasiList[0] || null;
    renderLokasiInfo();
  });
  // Lokasi kerja karyawan bisa diubah admin kapan saja: ikuti langsung tanpa perlu buka ulang aplikasi
  unsubProfil = onSnapshot(doc(db, "users", user.uid), s => {
    if (!s.exists() || !profile) return;
    profile.lokasiKerja = s.data().lokasiKerja || []; profile.radiusTambah = s.data().radiusTambah || 0;
    renderLokasiInfo();
  }, () => {});
  unsubMetode?.();
  unsubMetode = onSnapshot(D("settings", "verifikasi"), x => { metodeVerif = x.exists() ? (x.data().metode || "salah") : "salah"; pulihOtomatis = x.exists() && x.data().pulihOtomatis === true; terapkanMetode(); }, () => {});
  listenLog(); listenIzin(); pantauHariIni(); tick();
  getDoc(D("settings", "payroll")).then(x => { aturanGaji = x.exists() ? x.data() : {}; if ((aturanGaji.awalPeriode || 1) !== 1) listenLog(); }).catch(() => {});
  renderSetup();
  // Karyawan tidak boleh mematikan notifikasi: tanda "dimatikan" lama dibuang supaya aktif lagi
  if (!bolehMatikanNotif()) try{ localStorage.removeItem("absen:notifMati"); }catch(e){}
  refreshNotif(user.uid, profile.role, CID, renderSetup).then(renderSetup);
  if (!hpLain()) setTimeout(cadangkanWajah, 3000);     // cadangan wajah untuk pemulihan HP
}

/* ---------- jam & tab ---------- */
function tick(){
  const d = new Date(), j = d.getHours();
  const salam = j < 4 || j >= 18 ? "Selamat malam" : j < 11 ? "Selamat pagi" : j < 15 ? "Selamat siang" : "Selamat sore";
  $("#sapa").textContent = salam + (profile?.nama ? ", " + profile.nama.split(" ")[0] : "") + " 👋";
  $("#clock").textContent = fmtJam(d);
  $("#date").textContent = tglMediumHari(d, "panjang");
}
tick(); setInterval(tick, 15000);
document.querySelectorAll("nav button[data-tab]").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav button[data-tab]").forEach(x => x.removeAttribute("aria-current"));
  b.setAttribute("aria-current", "page");
  document.querySelectorAll("section").forEach(s => s.classList.remove("on"));
  $("#tab-" + b.dataset.tab).classList.add("on");
  if (b.dataset.tab !== "absen") stopCam();
  if (b.dataset.tab === "absen") panaskanGPS(); else dinginkanGPS();
  if (b.dataset.tab === "gaji") loadSlips();
});

/* ---------- kamera & wajah ---------- */
let stream = null;
async function startCam(){
  if (stream) return document.querySelector("#lens video");
  stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:"user", width:480, height:480}, audio:false});
  const v = document.createElement("video");
  v.playsInline = true; v.muted = true; v.srcObject = stream;
  $("#lens").replaceChildren(v);
  await v.play();
  await new Promise(r => setTimeout(r, 900));
  return v;
}
function stopCam(){
  if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  $("#lens").innerHTML = '<div class="ph">📷<br>Kamera menyala saat absen</div>';
}
function faceVector(v){
  const c = document.createElement("canvas"); c.width = c.height = 32;
  const g = c.getContext("2d", {willReadFrequently:true});
  const s = Math.min(v.videoWidth, v.videoHeight) * 0.6;
  g.drawImage(v, (v.videoWidth - s)/2, (v.videoHeight - s)/2, s, s, 0, 0, 32, 32);
  const px = g.getImageData(0, 0, 32, 32).data, a = [];
  for (let i = 0; i < px.length; i += 4) a.push(0.299*px[i] + 0.587*px[i+1] + 0.114*px[i+2]);
  const m = a.reduce((x,y) => x+y, 0) / a.length;
  const sd = Math.sqrt(a.reduce((x,y) => x + (y-m)**2, 0) / a.length) || 1;
  return a.map(x => +((x-m)/sd).toFixed(3));
}
const similarity = (a,b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]*b[i]; return s / a.length; };

/* ---------- pengenal wajah (face-api: deteksi + 68 titik wajah + 128 ciri wajah) ----------
   Data wajah (128 angka per foto) hanya disimpan di HP ini, tidak dikirim ke server. */
const FACEAPI_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/dist/face-api.esm.js";
const FACEAPI_MODEL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1/model/";
const JARAK_MAKS = 0.5;                    // makin kecil makin ketat (0.6 = bawaan face-api)
const kunciWajah = () => "face2:" + me.uid;
const dataWajah = () => { const d = store.get(kunciWajah()); return Array.isArray(d) && d.length ? d : null; };
const perluPerbaruiWajah = () => !!(profile?.daftarWajah && !dataWajah() && store.get("face:" + me.uid));
let faceapi = null, muatPengenal = null;
function siapkanPengenal(){
  if (!muatPengenal) muatPengenal = (async () => {
    const f = await import(FACEAPI_URL);
    await Promise.all([f.nets.tinyFaceDetector.loadFromUri(FACEAPI_MODEL), f.nets.faceLandmark68Net.loadFromUri(FACEAPI_MODEL),
      f.nets.faceRecognitionNet.loadFromUri(FACEAPI_MODEL)]);
    faceapi = f; return f;
  })().catch(e => { muatPengenal = null; throw e; });
  return muatPengenal;
}
// Ambil ciri wajah dari kamera (mencoba beberapa kali sampai wajah terdeteksi jelas)
async function ciriWajah(v, coba = 8){
  const f = await siapkanPengenal();
  for (let i = 0; i < coba; i++){
    const det = await f.detectSingleFace(v, new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks().withFaceDescriptor();
    if (det?.descriptor) return Array.from(det.descriptor, x => +x.toFixed(5));
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}
// Deteksi lengkap untuk pendaftaran: ciri wajah + potongan foto wajah + skor deteksi
async function rekamWajah(v, coba = 6){
  const f = await siapkanPengenal();
  for (let i = 0; i < coba; i++){
    const det = await f.detectSingleFace(v, new f.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks().withFaceDescriptor();
    if (det?.descriptor){
      const b = det.detection?.box || { x: v.videoWidth * 0.2, y: v.videoHeight * 0.15, width: v.videoWidth * 0.6, height: v.videoHeight * 0.7 };
      const pad = 0.25, x = Math.max(0, b.x - b.width * pad), y = Math.max(0, b.y - b.height * pad);
      const w = Math.min(v.videoWidth - x, b.width * (1 + pad * 2)), h = Math.min(v.videoHeight - y, b.height * (1 + pad * 2));
      const c = document.createElement("canvas"); c.width = c.height = 160;
      const g = c.getContext("2d"); g.translate(160, 0); g.scale(-1, 1); g.drawImage(v, x, y, w, h, 0, 0, 160, 160);
      return { desc: Array.from(det.descriptor, x => +x.toFixed(5)), foto: c.toDataURL("image/jpeg", 0.8), skor: det.detection?.score ?? 1 };
    }
    await new Promise(r => setTimeout(r, 250));
  }
  return null;
}
// Kualitas pendaftaran = konsistensi ciri wajah antar foto
function kualitasWajah(daftar){
  let t = 0, n = 0;
  for (let i = 0; i < daftar.length; i++) for (let j = i + 1; j < daftar.length; j++){ t += jarak(daftar[i], daftar[j]); n++; }
  const rata = n ? t / n : 1, persen = Math.round(Math.max(0, Math.min(1, 1 - rata)) * 100);
  return { rata, persen, label: rata < 0.35 ? "Sangat baik" : rata < 0.45 ? "Baik" : "Kurang", ok: rata < 0.45 };
}
// Jendela preview: tampilkan foto & kualitas, lalu tunggu Simpan / Ulangi
function previewWajah(hasil, q){
  return new Promise(selesai => {
    const latar = document.createElement("div"); latar.className = "modal-latar";
    latar.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Preview wajah">
      <div class="modal-kepala"><b>Preview wajah</b></div>
      <div class="modal-isi">
        <p class="meta" style="margin:10px 0">Pastikan semua foto adalah wajahmu, terlihat jelas, dan tidak tertutup.</p>
        <div class="pv-foto">${hasil.map((h, i) => `<figure><img src="${h.foto}" alt="Foto wajah ${i + 1}"><figcaption>${i + 1}</figcaption></figure>`).join("")}</div>
        <div class="pv-kualitas ${q.ok ? "baik" : "kurang"}"><span>Kualitas pendaftaran</span><b>${q.label} · ${q.persen}%</b></div>
        <p class="meta" style="margin:6px 0 0">${q.ok ? "Wajah siap disimpan." : "Ciri wajah antar foto kurang konsisten. Disarankan ulangi di tempat terang tanpa masker/kacamata gelap."}</p>
        <div class="btns" style="margin-top:14px"><button class="small pv-simpan">Simpan wajah</button><button class="small alt pv-ulang">Ulangi</button></div>
      </div></div>`;
    document.body.append(latar);
    latar.querySelector(".pv-simpan").onclick = () => { latar.remove(); selesai(true); };
    latar.querySelector(".pv-ulang").onclick = () => { latar.remove(); selesai(false); };
  });
}
const jarak = (a, b) => Math.sqrt(a.reduce((t, x, i) => t + (x - b[i]) ** 2, 0));
const jarakTerdekat = (desc, daftar) => Math.min(...daftar.map(d => jarak(desc, d)));
async function hasFace(v){
  if (!("FaceDetector" in window)) return true;
  try{ return (await new FaceDetector().detect(v)).length > 0; }catch(e){ return true; }
}

/* ---------- sidik jari (passkey) ---------- */
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
async function registerFinger(){
  const cred = await navigator.credentials.create({publicKey:{
    challenge: rnd(32), rp: {name:"Absensi Hadir"},
    user: {id: new TextEncoder().encode(me.uid).slice(0,64), name: me.email, displayName: profile.nama},
    pubKeyCredParams: [{type:"public-key", alg:-7}, {type:"public-key", alg:-257}],
    // residentKey "discouraged": cukup kunci di sensor HP, tidak perlu disimpan ke Google Password Manager
    authenticatorSelection: {authenticatorAttachment:"platform", userVerification:"required", residentKey:"discouraged", requireResidentKey:false},
    timeout: 45000
  }});
  store.set("finger:" + me.uid, b64(cred.rawId));
}
async function verifyFinger(){
  return !!(await navigator.credentials.get({publicKey:{
    challenge: rnd(32),
    allowCredentials: [{type:"public-key", id: unb64(store.get("finger:" + me.uid))}],
    userVerification: "required", timeout: 60000
  }}));
}

/* ---------- GPS ---------- */
// GPS "dipanaskan" sejak menu Absen terbuka: satelit butuh 10–30 detik (terutama HP Xiaomi/HyperOS),
// jadi saat verifikasi wajah selesai lokasi sudah akurat, bukan perkiraan BTS ±700 m.
let gpsHangat = null, gpsWatch = null;
let gpsBerhenti = null;
async function panaskanGPS(){
  if (gpsWatch !== null || !navigator.geolocation || document.hidden) return;
  // hanya kalau izin lokasi sudah diberikan (tidak memunculkan pertanyaan izin saat aplikasi dibuka)
  try{ const st = await navigator.permissions?.query({ name: "geolocation" }); if (st && st.state !== "granted") return; }catch(e){}
  if (gpsWatch !== null) return;
  clearTimeout(gpsBerhenti); gpsBerhenti = setTimeout(dinginkanGPS, 5 * 60e3);   // hemat baterai: berhenti sendiri setelah 5 menit
  try{
    gpsWatch = navigator.geolocation.watchPosition(p => {
      const lama = gpsHangat && Date.now() - gpsHangat.t > 20000;
      if (!gpsHangat || lama || p.coords.accuracy <= gpsHangat.c.accuracy) gpsHangat = { c: p.coords, t: Date.now() };
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 });
  }catch(e){}
}
function dinginkanGPS(){ if (gpsWatch !== null){ navigator.geolocation.clearWatch(gpsWatch); gpsWatch = null; } }
document.addEventListener("visibilitychange", () => { if (document.hidden) dinginkanGPS(); else if ($("#tab-absen")?.classList.contains("on") && me) panaskanGPS(); });
// Baca GPS dan ambil hasil paling akurat. Berhenti begitu akurasinya cukup; kalau belum cukup, tunggu sampai ms (maks. ~25 detik).
function getPosTerbaik(batas = 100, ms = 25000){
  return new Promise((ok, no) => {
    // hasil pemanasan yang masih baru (≤ 30 detik) dan sudah cukup akurat langsung dipakai
    if (gpsHangat && Date.now() - gpsHangat.t <= 30000 && gpsHangat.c.accuracy <= batas){ ok(gpsHangat.c); return; }
    let terbaik = gpsHangat && Date.now() - gpsHangat.t <= 30000 ? gpsHangat.c : null, selesai = false;
    const mulai = Date.now();
    const akhiri = () => { if (selesai) return; selesai = true; navigator.geolocation.clearWatch(id); clearTimeout(tm); terbaik ? ok(terbaik) : no(new Error("gps")); };
    const id = navigator.geolocation.watchPosition(p => {
      if (!terbaik || p.coords.accuracy < terbaik.accuracy) terbaik = p.coords;
      const dtk = Math.round((Date.now() - mulai) / 1000);
      setChk("gps", "run", "±" + fmtNum(Math.round(terbaik.accuracy)) + " m" + (terbaik.accuracy > batas ? " · menunggu satelit " + dtk + " dtk" : ""));
      if (p.coords.accuracy <= Math.min(batas, 30) || (terbaik.accuracy <= batas && Date.now() - mulai > 4000)) akhiri();
    }, e => { if (!terbaik && e.code === 1){ selesai = true; navigator.geolocation.clearWatch(id); clearTimeout(tm); no(e); } },
    { enableHighAccuracy: true, maximumAge: 0, timeout: ms });
    const tm = setTimeout(akhiri, ms);
  });
}
const getPos = () => new Promise((ok, no) => navigator.geolocation.getCurrentPosition(
  p => ok(p.coords), no, {enableHighAccuracy:true, timeout:15000, maximumAge:0}));
function meters(a,b,c,d){
  const R = 6371000, r = x => x*Math.PI/180, dLat = r(c-a), dLng = r(d-b);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a))*Math.cos(r(c))*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}

/* ---------- riwayat (realtime) ---------- */
/* ---------- pilih bulan riwayat ---------- */
const ymNow = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
$("#r-bulan").value = ymNow();
function geserBulan(n){
  const [y, m] = ($("#r-bulan").value || ymNow()).split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1), v = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  if (v > ymNow()) return;
  $("#r-bulan").value = v; listenLog();
}
$("#r-prev").onclick = () => geserBulan(-1);
$("#r-next").onclick = () => geserBulan(1);
$("#r-bulan").onchange = () => { if (!$("#r-bulan").value || $("#r-bulan").value > ymNow()) $("#r-bulan").value = ymNow(); listenLog(); };

let cutiDisetujui = [], cutiBulan = "", keputusanLembur = {};
async function ambilCuti(){
  try{
    const z = await getDocs(query(C("izin"), where("uid", "==", me.uid), where("status", "==", "terima")));
    cutiDisetujui = z.docs.map(d => d.data());
  }catch(e){ cutiDisetujui = []; }
  // keputusan cek lembur milik sendiri (lembur disetujui / lupa absen pulang)
  try{
    const k = await getDocs(query(C("lembur"), where("uid", "==", me.uid)));
    keputusanLembur = Object.fromEntries(k.docs.map(d => [d.data().tanggal, d.data()]));
  }catch(e){ keputusanLembur = {}; }
}
function listenLog(){
  unsubLog?.();
  const bulan = $("#r-bulan").value || ymNow();
  const [y, mo] = bulan.split("-").map(Number);
  $("#r-next").disabled = bulan >= ymNow();
  const P = rentangPeriode(y, mo - 1, aturanGaji.awalPeriode);
  const q = query(C("absensi"), where("uid", "==", me.uid),
    where("ts", ">=", Timestamp.fromDate(P.mulai)), where("ts", "<", Timestamp.fromDate(P.akhir)),
    orderBy("ts", "desc"));
  const siapCuti = cutiBulan === bulan ? Promise.resolve() : ambilCuti().then(() => { cutiBulan = bulan; });
  unsubLog = onSnapshot(q, async snap => {
    snap.docChanges().forEach(ch => {
      const d = ch.doc.data();
      if (ch.type === "modified" && (d.status === "terima" || d.status === "tolak"))
        toast("Absen " + jenis(d.type).toLowerCase() + " " + (d.status === "terima" ? "diterima" : "ditolak") + " oleh " + d.by);
    });
    await siapCuti;
    renderRekap(snap.docs.map(x => x.data({ serverTimestamps: "estimate" })), y, mo - 1);
  }, e => { $("#log").innerHTML = '<li class="empty">Riwayat gagal dimuat: ' + e.code + '</li>'; });
}

/* Persetujuan kebijakan privasi (UU PDP): diminta sekali per versi kebijakan, sebelum aplikasi dipakai */
const PRIVASI_VERSI = 1;
function cekPrivasi(){
  if (!me || !profile || (+profile.setujuPrivasi || 0) >= PRIVASI_VERSI || document.querySelector(".privasi-latar")) return;
  const latar = document.createElement("div"); latar.className = "dialog-latar privasi-latar";
  latar.innerHTML = `<div class="dialog privasi-dialog" role="dialog" aria-modal="true" aria-labelledby="pv-judul">
    <h2 id="pv-judul" style="margin:0 0 8px;font-size:1.15rem">Persetujuan data pribadi</h2>
    <p class="dialog-teks" style="margin:0 0 8px">Untuk mencatat absensi, aplikasi ini memakai:</p>
    <ul class="pv-list">
      <li>📍 <b>Lokasi GPS</b>, hanya saat absen</li>
      <li>🙂 <b>Foto selfie & ciri wajah</b> (angka, bukan foto) untuk verifikasi</li>
      <li>👆 <b>Sidik jari</b> diperiksa oleh HP, tidak dikirim ke server</li>
      <li>📱 <b>Data HP</b> untuk mengunci 1 akun ke 1 HP</li>
    </ul>
    <p class="meta" style="margin:6px 0 10px">Data hanya dilihat oleh Anda dan admin/supervisor perusahaan Anda, dan tidak dijual. <a href="privasi.html" target="_blank" rel="noopener">Baca kebijakan privasi lengkap</a></p>
    <label class="check" style="margin:0 0 12px"><input type="checkbox" class="pv-cek"> <span>Saya sudah membaca dan <b>menyetujui</b> pemakaian data di atas.</span></label>
    <div class="dialog-aksi"><button type="button" class="dialog-tidak pv-keluar">Keluar</button><button type="button" class="dialog-ya pv-setuju" disabled>Saya setuju</button></div>
    <p class="msg pv-msg" role="status"></p></div>`;
  document.body.append(latar);
  const cek = latar.querySelector(".pv-cek"), ok = latar.querySelector(".pv-setuju");
  cek.onchange = () => { ok.disabled = !cek.checked; };
  latar.querySelector(".pv-keluar").onclick = () => { latar.remove(); signOut(auth); };
  ok.onclick = async () => {
    ok.disabled = true;
    try{
      await updateDoc(doc(db, "users", me.uid), { setujuPrivasi: PRIVASI_VERSI, setujuPrivasiPada: serverTimestamp() });
      profile.setujuPrivasi = PRIVASI_VERSI; latar.remove();
      catatLog(CID, me.uid, profile, "akun", "Menyetujui kebijakan privasi versi " + PRIVASI_VERSI);
    }catch(e){ msg(latar.querySelector(".pv-msg"), e.code === "permission-denied" ? "Belum bisa disimpan. Minta admin menjalankan deploy-rules.bat terbaru." : "Gagal: " + (e.code || e.message), "bad"); ok.disabled = false; }
  };
}

/* Rekap bulan dulu, lalu daftar per hari yang bisa diketuk untuk rincian */
let liburJadiSaya, polaKerjaSaya = "";   // pilihan "hari libur dihitung Lebih HK / lembur" per periode dari admin
function renderRekap(records, y, m){
  if (liburJadiSaya === undefined){ liburJadiSaya = null;
    getDoc(D("payroll", me.uid)).then(x => { liburJadiSaya = x.exists() ? x.data().liburJadi || null : null; polaKerjaSaya = x.exists() ? x.data().polaKerja || "" : "";
      if (liburJadiSaya || polaKerjaSaya) renderRekap(records, y, m); }).catch(() => {}); }
  const r = hitungGaji(records, aturanGaji, { shift: profile.shift || "", grupCV: profile.grupCV || "-", tanpaLebihHK: profile.kehadiran === "manual", liburJadi: liburJadiSaya, polaKerja: polaKerjaSaya }, y, m, new Date(), cutiDisetujui, keputusanLembur);
  const menunggu = records.filter(x => x.status === "menunggu").length;
  const stat = (n, l, cls = "") => `<div class="${cls}"><b>${n}</b><span>${l}</span></div>`;
  $("#r-info").innerHTML = `<div class="card rekap-bln">
      <div class="meta">${esc(r.periodeLabel || namaBulan(y, m))}</div>
      <div class="big">${fmtNum(r.hadirKerja)}<span class="dari"> / ${fmtNum(r.hariKerja)} hari hadir</span></div>
      <div class="stat5">
        ${stat(fmtNum(r.kaliTelat), "Telat" + (r.menitTelat ? " (" + fmtNum(r.menitTelat) + "m)" : ""), r.kaliTelat ? "warn" : "")}
        ${stat(fmtNum(r.sakit), "Sakit")}${stat(fmtNum(r.izin), "Izin")}${stat(fmtNum(r.cuti || 0), "Cuti")}
        ${stat(fmtNum(r.alpha), "Tidak hadir", r.alpha ? "bad" : "")}${stat(fmtNum(r.jamLembur) + "j", "Lembur")}
      </div>
      ${menunggu ? `<p class="meta" style="margin:10px 0 0;color:var(--warn)">${fmtNum(menunggu)} absen masih menunggu persetujuan.</p>` : ""}
    </div><p class="meta" style="margin:0 0 8px">Ketuk tanggal untuk melihat rincian.</p>`;

  // Kelompokkan absen per tanggal, gabung dengan baris rekap (termasuk hari sakit/izin/tidak hadir)
  const perHari = {};
  records.forEach(x => { (perHari[dayKey(tsOf(x))] ||= []).push(x); });
  const info = Object.fromEntries(r.rows.map(x => [x.tanggal, x]));
  const kunci = [...new Set([...Object.keys(perHari), ...Object.keys(info)])].sort().reverse();
  const ul = $("#log");
  if (!kunci.length){ ul.innerHTML = '<li class="empty">Tidak ada absen di bulan ini.</li>'; return; }
  ul.replaceChildren(...kunci.map(k => {
    const list = (perHari[k] || []).sort((a, b) => tsOf(a) - tsOf(b)), row = info[k] || {};
    const sah = list.filter(x => x.status !== "tolak");
    const masuk = sah.find(x => x.type === "masuk"), pulang = [...sah].reverse().find(x => x.type === "pulang");
    const [yy, mm, dd] = k.split("-").map(Number), tgl = new Date(yy, mm - 1, dd);
    const tags = [];
    if (row.telat) tags.push(`<span class="tag wait">Telat ${fmtNum(row.telat)}m</span>`);
    if (row.lembur) tags.push(`<span class="tag in">Lembur ${fmtNum(row.lembur)}j</span>`);
    if (row.cek === "lupa") tags.push('<span class="tag wait">Lupa absen pulang</span>');
    if (row.ket) tags.push(`<span class="tag ${row.alpha ? "no" : row.ket === "Hari libur" ? "out" : "wait"}">${esc(row.ket)}</span>`);
    if (list.some(x => x.status === "menunggu")) tags.push('<span class="tag wait">Menunggu</span>');
    if (list.some(x => x.status === "tolak")) tags.push('<span class="tag no">Ditolak</span>');
    const li = document.createElement("li"); li.className = "hari-row";
    li.innerHTML = `<button class="hari-head" ${list.length ? "" : "disabled"} aria-expanded="false">
        <span class="hari-tgl"><b>${tglMediumHari(tgl)}</b>
          ${list.length ? (row.tanggal && (row.masuk !== "-" || row.pulang !== "-")
            ? `<small>${row.masuk !== "-" ? row.masuk.replace(":", ".") : "–"} → ${row.pulang !== "-" ? row.pulang.replace(":", ".") : "–"}${row.pulangTgl ? ` <span class="tgl-lain">(${tglMedium(row.pulangTgl)})</span>` : ""}</small>`
            : `<small>${masuk ? fmtJam(tsOf(masuk)) : "–"} → ${pulang ? fmtJam(tsOf(pulang)) : "–"}</small>`) : ""}</span>
        <span class="tags hari-tags">${tags.join("")}</span>
        ${list.length ? '<span class="chev" aria-hidden="true">›</span>' : "<span></span>"}</button>
      <div class="hari-body" hidden></div>`;
    const head = li.querySelector(".hari-head"), body = li.querySelector(".hari-body");
    head.onclick = () => {
      const buka = body.hidden;
      ul.querySelectorAll(".hari-row.open").forEach(o => { o.classList.remove("open"); o.querySelector(".hari-body").hidden = true; o.querySelector(".hari-head").setAttribute("aria-expanded", "false"); });
      if (!buka) return;
      body.innerHTML = list.map(x => {
        const [cls, txt] = STATUS[x.status] || ["wait", x.status];
        return `<div class="rinci-absen">
          <div class="ra-head"><b>${jenis(x.type)} · ${fmtJam(tsOf(x))}</b><span class="tag ${cls}">${txt}</span></div>
          <div class="meta">${x.manual ? "✍️ Dicatat manual oleh " + esc(x.by || "admin") : x.kios ? "🖥️ Via kios · " + esc(x.lokasi || "") :
            fmtNum(x.dist) + " m dari " + esc(x.lokasi || "kantor") + (x.acc ? " · GPS ±" + fmtNum(x.acc) + " m" : "") + (x.gpsLemah ? " ⚠" : "")}</div>
          ${x.alamat ? `<div class="meta">📍 ${esc(x.alamat)}</div>` : ""}
          ${x.alasan ? `<div class="meta">Alasan: ${esc(x.alasan)}</div>` : ""}
          ${x.by ? `<div class="meta">Diputuskan oleh ${esc(x.by)}${x.note ? " · " + esc(x.note) : ""}</div>` : ""}</div>`;
      }).join("");
      body.hidden = false; li.classList.add("open"); head.setAttribute("aria-expanded", "true");
    };
    return li;
  }));
}

/* ---------- alur absen ---------- */
function setChk(k, state, text){
  $("#c-" + k).className = "chk " + state;
  $("#c-" + k + " span").textContent = text;
  $("#arc-" + k).setAttribute("class", "arc " + state);
}
let pending = null;

/* ---------- kunci pendaftaran wajah & sidik jari ---------- */
// Status di server: true = sudah daftar (terkunci), false = direset admin, tidak ada = akun lama.
async function sinkronBiometrik(uid){
  const pasang = {};
  for (const [kunci, flag] of [["face", "daftarWajah"], ["finger", "daftarJari"]]){
    const lokal = store.get(kunci + ":" + uid);
    if (profile[flag] === false && lokal) store.set(kunci + ":" + uid, null);   // direset admin: hapus data lama di HP
    if (kunci === "face" && profile[flag] === false && store.get("face2:" + uid)) store.set("face2:" + uid, null);
    if (profile[flag] === undefined && lokal) pasang[flag] = true;               // akun lama yang sudah daftar: kunci sekarang
  }
  if (Object.keys(pasang).length){
    try{ await updateDoc(doc(db, "users", uid), pasang); Object.assign(profile, pasang); }catch(e){}
  }
}
async function kunciBiometrik(flag){
  await updateDoc(doc(db, "users", me.uid), { [flag]: true });
  profile[flag] = true;
}

/* ---------- cek kesiapan HP: izin & pengaturan yang dibutuhkan aplikasi ---------- */
const CEK_IKON = { ok: "✅", warn: "⚠️", bad: "❌", run: "⏳" };
const IZIN_XIAOMI = "Setelan > Aplikasi > Kelola aplikasi > Absensi Hadir (atau Chrome) > Izin aplikasi";
async function statusIzin(nama){ try{ return (await navigator.permissions.query({ name: nama })).state; }catch(e){ return ""; } }
let cekHPJalan = false;
// diam = true: dijalankan otomatis di latar belakang setelah login (tidak memunculkan pertanyaan izin apa pun)
async function cekHP(opsi = {}){
  const diam = opsi.diam === true;
  if (cekHPJalan) return; cekHPJalan = true;
  try{ await cekHPIsi(diam); } finally { cekHPJalan = false; }
}
async function cekHPIsi(diam){
  const box = $("#cekhp-hasil"), btn = $("#cekhp-go"); btn.disabled = true; btn.textContent = diam ? "Memeriksa otomatis…" : "Memeriksa…";
  const item = [];
  const tampil = () => {
    const bad = item.filter(x => x.st === "bad").length, warn = item.filter(x => x.st === "warn").length, jalan = item.some(x => x.st === "run");
    box.innerHTML = (jalan ? "" : `<div class="cekhp-ringkas ${bad ? "bad" : warn ? "warn" : "ok"}">${bad ? `❌ ${bad} hal harus diperbaiki` : warn ? `⚠️ HP bisa dipakai, ${warn} hal sebaiknya diperbaiki` : "✅ HP siap dipakai absen"}</div>`) +
      `<ul class="cekhp-list">${item.map((x, i) => `<li class="${x.st}"><span class="ci">${CEK_IKON[x.st]}</span><div><b>${esc(x.judul)}</b>
        <div class="meta">${x.ket}</div>${x.saran && x.st !== "ok" ? `<div class="cekhp-saran">${x.saran}</div>` : ""}
        ${x.aksi && x.st !== "ok" ? `<button type="button" class="small alt cekhp-aksi" data-i="${i}">${esc(x.aksi[0])}</button>` : ""}</div></li>`).join("")}</ul>`;
    box.querySelectorAll(".cekhp-aksi").forEach(b => b.onclick = async () => { b.disabled = true; try{ await item[+b.dataset.i].aksi[1](); }catch(e){} cekHP(); });
  };
  const tambah = (judul, st, ket, saran, aksi) => { const x = { judul, st, ket, saran, aksi }; item.push(x); tampil(); return x; };
  const isi = (x, st, ket, saran, aksi) => { Object.assign(x, { st, ket, saran, aksi }); tampil(); };
  const pakaiWajah = metodeVerif !== "jari", pakaiJari = metodeVerif !== "wajah";

  // 1. Internet & jam HP (dibandingkan dengan jam server)
  const net = tambah("Koneksi internet & jam HP", "run", "Memeriksa…");
  try{
    const t0 = Date.now(), r = await fetch("/manifest.json?cek=" + t0, { cache: "no-store" }), t1 = Date.now();
    const srv = Date.parse(r.headers.get("date") || ""), selisih = isNaN(srv) ? 0 : Math.round(((t0 + t1) / 2 - srv) / 1000);
    if (Math.abs(selisih) > 180) isi(net, "bad", `Internet OK, tapi jam HP ${selisih > 0 ? "lebih cepat" : "lebih lambat"} ${fmtNum(Math.round(Math.abs(selisih) / 60))} menit dari jam sebenarnya.`,
      "Setelan > Setelan tambahan > Tanggal & waktu > nyalakan <b>Gunakan waktu yang disediakan jaringan</b> dan <b>zona waktu otomatis</b>.");
    else isi(net, "ok", `Internet tersambung (${fmtNum(t1 - t0)} ms). Jam HP sesuai.`);
  }catch(e){ isi(net, "bad", "Tidak ada internet.", "Nyalakan data seluler atau Wi-Fi, lalu cek lagi."); }

  // 2. Lokasi (GPS)
  const gps = tambah("Lokasi (GPS)", "run", "Mencari sinyal GPS (maks. 35 detik)…");
  const izinLok = await statusIzin("geolocation");
  if (!navigator.geolocation) isi(gps, "bad", "HP/browser ini tidak mendukung lokasi.");
  else if (diam && izinLok !== "granted" && izinLok !== "")
    isi(gps, "warn", "Izin lokasi belum diberikan (akan ditanya saat absen).", `Tekan <b>Cek ulang</b> di sini lalu pilih <b>Izinkan</b>, atau buka ${IZIN_XIAOMI} > <b>Lokasi</b> > <b>Izinkan hanya saat aplikasi digunakan</b> + <b>Gunakan lokasi akurat</b>.`);
  else if (izinLok === "denied") isi(gps, "bad", "Izin lokasi <b>ditolak</b> untuk aplikasi ini.", `Buka ${IZIN_XIAOMI} > <b>Lokasi</b> > pilih <b>Izinkan hanya saat aplikasi digunakan</b>, lalu nyalakan <b>Gunakan lokasi akurat</b>.`);
  else {
    const baca = o => new Promise(ok => navigator.geolocation.getCurrentPosition(x => ok(x), e => ok(e), o));
    let p = await baca({ enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }), kasar = false;
    const e1 = p.coords ? null : p;
    // GPS satelit gagal -> coba lokasi jaringan (Wi-Fi/BTS) supaya ketahuan penyebabnya
    if (!p.coords && p.code !== 1){ const p2 = await baca({ enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }); if (p2.coords){ p = p2; kasar = true; } }
    const kodeTeks = e => e ? ` <small>(kode ${e.code}${e.message ? ": " + esc(e.message) : ""}; izin: ${izinLok || "?"})</small>` : "";
    if (!p.coords){
      if (p.code === 1) isi(gps, "bad", "Izin lokasi ditolak." + kodeTeks(p), `Buka ${IZIN_XIAOMI} > <b>Lokasi</b> > pilih <b>Izinkan hanya saat aplikasi digunakan</b> dan nyalakan <b>Gunakan lokasi akurat</b>.`);
      else if (p.code === 2) isi(gps, "bad", "Layanan lokasi HP tidak aktif / tidak tersedia." + kodeTeks(p),
        `1. Tarik panel atas layar, pastikan ikon <b>Lokasi</b> menyala (bukan hanya Akurasi Lokasi).<br>2. ${IZIN_XIAOMI} > <b>Lokasi</b> > <b>Izinkan hanya saat aplikasi digunakan</b> + <b>Gunakan lokasi akurat</b>.<br>3. Nyalakan Wi-Fi (tidak perlu tersambung) lalu cek lagi.`);
      else isi(gps, "bad", "GPS tidak menemukan lokasi dalam 35 detik (sinyal lemah)." + kodeTeks(p),
        "Pindah ke dekat jendela / luar ruangan, nyalakan Wi-Fi (tidak perlu tersambung), lalu cek lagi. Kalau tetap gagal, matikan lalu nyalakan lagi Lokasi di panel atas.");
    } else if (kasar){
      const acc = Math.round(p.coords.accuracy);
      isi(gps, "warn", `GPS satelit tidak dapat sinyal, lokasi hanya dari jaringan (±${fmtNum(acc)} m).` + kodeTeks(e1),
        "Absen tetap bisa kalau akurasinya cukup. Supaya lebih tepat: absen di dekat jendela / luar ruangan, pastikan izin <b>Gunakan lokasi akurat</b> menyala.");
    } else {
      const acc = Math.round(p.coords.accuracy), L = lokasiSaya().map(L => ({ L, d: meters(p.coords.latitude, p.coords.longitude, L.lat, L.lng) })).sort((a, b) => a.d - b.d)[0];
      const jauh = L ? ` · ${fmtNum(Math.round(L.d))} m dari ${esc(L.L.nama || "kantor")}${L.d <= (L.L.rad || 0) + (+profile?.radiusTambah || 0) ? " (di dalam area)" : ""}` : "";
      if (acc > Math.max(akurasiGlobal + (+profile?.radiusTambah || 0), 100)) isi(gps, "warn", `Lokasi terbaca tapi kurang akurat (±${fmtNum(acc)} m)${jauh}.`,
        "Setelan > Lokasi > nyalakan <b>Akurasi lokasi Google</b> (Wi-Fi & Bluetooth scanning). Absen di tempat terbuka / dekat jendela.");
      else isi(gps, "ok", `Akurat ±${fmtNum(acc)} m${jauh}.`);
    }
  }

  // 3. Kamera (untuk verifikasi wajah)
  if (pakaiWajah){
    const kam = tambah("Kamera (verifikasi wajah)", "run", "Memeriksa…");
    const izinKam = await statusIzin("camera");
    if (!navigator.mediaDevices?.getUserMedia) isi(kam, "bad", "Kamera tidak bisa dipakai di aplikasi ini.", "Perbarui Google Chrome dan Android System WebView di Play Store.");
    else if (izinKam === "denied") isi(kam, "bad", "Izin kamera <b>ditolak</b>.", `Buka ${IZIN_XIAOMI} > <b>Kamera</b> > pilih <b>Izinkan</b>.`);
    else if (izinKam === "granted") isi(kam, "ok", "Izin kamera sudah diberikan.");
    else isi(kam, "warn", "Izin kamera belum diberikan (akan ditanya saat absen).", "Tekan tombol di bawah lalu pilih <b>Izinkan</b>.",
      ["Izinkan kamera", async () => { const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } }); s.getTracks().forEach(t => t.stop()); }]);
  }

  // 4. Sidik jari (sensor HP)
  if (pakaiJari){
    const jr = tambah("Sensor sidik jari", "run", "Memeriksa…");
    let ada = false; try{ ada = !!(await window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.()); }catch(e){}
    if (ada) isi(jr, "ok", "Sensor sidik jari / kunci layar HP siap dipakai.");
    else isi(jr, metodeVerif === "jari" || metodeVerif === "keduanya" ? "bad" : "warn", "HP belum punya sidik jari atau kunci layar yang terdaftar, atau tidak didukung.",
      "Setelan > <b>Sidik jari, data wajah & kunci layar</b> > buat kunci layar (PIN/pola) lalu tambahkan sidik jari.");
  }

  // 5. Pendaftaran wajah / sidik jari di HP ini
  const daftar = tambah("Data wajah & sidik jari di HP ini", "run", "");
  const wajahAda = !!dataWajah(), jariAda = !!store.get("finger:" + me.uid), msl = [], kurang = [];
  if (pakaiWajah){ if (profile.daftarWajah && !wajahAda) msl.push("wajah"); else if (!profile.daftarWajah) kurang.push("wajah"); }
  if (pakaiJari){ if (profile.daftarJari && !jariAda) msl.push("sidik jari"); else if (!profile.daftarJari) kurang.push("sidik jari"); }
  const perlu = metodeVerif === "keduanya" ? kurang.length : metodeVerif === "salah" ? (kurang.length === 2 ? 1 : 0) : kurang.length;
  if (msl.length && pulihOtomatis && profile.daftarWajah && !wajahAda)
    isi(daftar, "warn", `Data ${msl.join(" & ")} tidak ada di HP ini (data aplikasi terhapus atau ganti HP).`, "Data wajah dipulihkan otomatis dari server saat <b>Absen</b> dengan verifikasi wajah. Sidik jari perlu didaftarkan ulang setelahnya.");
  else if (msl.length && !(metodeVerif === "salah" && (pakaiWajah && wajahAda || pakaiJari && jariAda)))
    isi(daftar, "bad", `Data ${msl.join(" & ")} sudah terdaftar tapi tidak ada di HP ini (data aplikasi terhapus atau ganti HP).`, "Minta admin: menu Karyawan > <b>Reset</b> > pilih yang perlu didaftar ulang.");
  else if (perlu) isi(daftar, "bad", `Belum mendaftarkan ${kurang.join(" / ")}.`, "Daftarkan di bagian Wajah / Sidik jari di bawah.");
  else isi(daftar, "ok", [pakaiWajah ? "Wajah " + (wajahAda ? "terdaftar" : "–") : "", pakaiJari ? "Sidik jari " + (jariAda ? "terdaftar" : "–") : ""].filter(Boolean).join(" · ") + ".");

  // 6. Kunci HP (1 akun = 1 HP)
  if (!profile.deviceId) tambah("Kunci HP", "ok", "Belum terkunci; otomatis terkunci ke HP ini saat absen pertama.");
  else if (profile.deviceId === DEVICE) tambah("Kunci HP", "ok", "Akun ini terkunci ke HP ini.");
  else if (pulihOtomatis && profile.daftarWajah) tambah("Kunci HP", "warn", "Akun terkunci ke HP lain (atau data aplikasi pernah terhapus).", "Bisa dipulihkan sendiri: tekan <b>Absen Masuk/Pulang</b> dengan verifikasi wajah. Akun otomatis pindah ke HP ini.");
  else tambah("Kunci HP", "bad", "Akun ini terkunci ke HP lain (atau data aplikasi pernah terhapus).", "Minta admin: menu Karyawan > <b>Reset</b> > <b>Ganti HP</b>.");

  // 7. Notifikasi
  const notif = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
  if (notif === "granted") tambah("Notifikasi", "ok", "Aktif.");
  else tambah("Notifikasi", "warn", notif === "denied" ? "Diblokir." : notif === "unsupported" ? "Tidak didukung di HP/browser ini." : "Belum diizinkan.",
    notif === "denied" ? `Buka ${IZIN_XIAOMI} > <b>Notifikasi</b> > nyalakan. Kalau sudah menyala tapi masih diblokir: aplikasi <b>Chrome > ⋮ > Setelan > Setelan situs > Notifikasi</b> > absencsm.pages.dev > <b>Izinkan</b>. Matikan juga <b>Jeda aktivitas aplikasi jika tidak digunakan</b>.` : "Supaya dapat kabar persetujuan absen & izin.",
    notif === "default" ? ["Izinkan notifikasi", () => Notification.requestPermission()] : null);

  // 8. Dipasang sebagai aplikasi & data tidak terhapus otomatis
  const app = matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || document.referrer.startsWith("android-app://");
  tambah("Aplikasi terpasang", app ? "ok" : "warn", app ? "Dibuka dari aplikasi Absensi Hadir." : "Dibuka dari browser biasa.",
    "Selalu buka dari ikon aplikasi <b>Absensi Hadir</b> (APK), jangan bergantian dengan Chrome, supaya data wajah & kunci HP tidak berbeda.");
  let tetap = false; try{ tetap = await navigator.storage?.persisted?.(); }catch(e){}
  tambah("Penyimpanan data aplikasi", tetap ? "ok" : "warn", tetap ? "Data aplikasi disimpan permanen." : "Data aplikasi bisa terhapus otomatis oleh HP.",
    "Jangan bersihkan data aplikasi. Di aplikasi <b>Keamanan/Cleaner</b> Xiaomi, kecualikan Absensi Hadir & Chrome. Setelan > Aplikasi > Absensi Hadir > <b>Penghemat baterai: Tanpa batasan</b>.",
    ["Simpan permanen", () => navigator.storage.persist()]);

  // 9. Versi aplikasi
  const ver = tambah("Versi aplikasi", "run", "Memeriksa…");
  try{
    const t = await (await fetch("/common.js?cek=" + Date.now(), { cache: "no-store" })).text(), baru = (t.match(/export const VERSI_APP = "(\d{4}\.[\d.]+[a-z]?)"/) || [])[1];
    if (baru && baru !== VERSI_APP) isi(ver, "warn", `Versi di HP ${VERSI_APP}, versi terbaru ${baru}.`, "Tekan tombol di bawah untuk memuat versi terbaru.", ["Muat ulang aplikasi", () => { document.querySelector(".muat-ulang-app")?.click(); return new Promise(() => {}); }]);
    else isi(ver, "ok", "Terbaru (" + VERSI_APP + ").");
  }catch(e){ isi(ver, "warn", "Tidak bisa memeriksa (offline). Versi " + VERSI_APP + "."); }

  btn.disabled = false; btn.textContent = "🩺 Cek ulang";
  // Simpan ringkasan supaya admin bisa melihat HP karyawan yang bermasalah
  const masalah = item.filter(x => x.st === "bad").map(x => x.judul), saranList = item.filter(x => x.st === "warn").map(x => x.judul);
  // Rincian hasil disimpan terpisah (companies/{cid}/cekHP), hanya admin yang bisa membaca
  const teks = h => String(h || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
  let terkirim = "";
  try{ store.set("cekhpTerakhir:" + me.uid, { t: Date.now(), versi: VERSI_APP }); }catch(e){}
  try{ await addDoc(C("cekHP"), { uid: me.uid, nama: profile.nama || "", ts: serverTimestamp(), masalah, saran: saranList, versi: VERSI_APP, ...(diam ? { otomatis: true } : {}),
    perangkat: await perangkatInfo(), item: item.map(x => ({ judul: x.judul, st: x.st, ket: teks(x.ket), saran: x.st === "ok" ? "" : teks(x.saran) })) }); terkirim = "ok"; }catch(e){ terkirim = e.code || e.message || "gagal"; }
  box.insertAdjacentHTML("beforeend", terkirim === "ok" ? '<p class="meta" style="margin-top:8px">📤 Hasil cek sudah terkirim ke admin.</p>'
    : `<p class="meta" style="margin-top:8px;color:var(--bad)">⚠️ Hasil cek belum terkirim ke admin (${esc(terkirim)}).${terkirim === "permission-denied" ? " Minta admin men-deploy aturan database terbaru." : " Periksa internet lalu tekan Cek ulang."}</p>`);
  if (diam && masalah.length) toast("⚠️ HP ini ada " + masalah.length + " hal yang perlu diperbaiki (" + masalah.join(", ") + "). Lihat Pengaturan > Cek kesiapan HP.");
  catatLog(CID, me.uid, profile, "buka", (diam ? "Cek kesiapan HP otomatis: " : "Cek kesiapan HP: ") + (masalah.length ? masalah.length + " masalah (" + masalah.join(", ") + ")" : "siap") + (saranList.length ? " · saran: " + saranList.join(", ") : ""));
}
$("#cekhp-go").onclick = () => cekHP();
// Setelah login: kalau HP ini belum pernah Cek HP (atau terakhir > 7 hari / versi aplikasi berganti), jalankan otomatis di latar belakang
function cekHPOtomatis(){
  if (!me || !profile || profile.role === "superadmin") return;
  let t = null; try{ t = store.get("cekhpTerakhir:" + me.uid); }catch(e){}
  if (t && t.versi === VERSI_APP && Date.now() - t.t < 7 * 864e5) return;
  setTimeout(() => { if (me && !sedangAbsen && !document.hidden) cekHP({ diam: true }).catch(() => {}); }, 8000);
}
$("#cekhp-pintas").onclick = () => {
  document.querySelector('nav button[data-tab="atur"]').click();
  setTimeout(() => { $("#cekhp-go").scrollIntoView({ block: "start", behavior: "smooth" }); cekHP(); }, 150);
};

/* ---------- cadangan wajah di server & pemulihan HP otomatis ---------- */
// Firestore tidak menerima array di dalam array, jadi disimpan sebagai map {"0": [...], "1": [...]}
const keMap = arr => Object.fromEntries(arr.map((d, i) => [String(i), d]));
const dariMap = m => Object.keys(m || {}).sort((a, b) => a - b).map(k => m[k]).filter(a => Array.isArray(a) && a.length);
async function cadangkanWajah(){
  const d = dataWajah(); if (!d || !profile?.daftarWajah) return;
  try{ const x = await getDoc(D("wajah", me.uid)); if (!x.exists()) await setDoc(D("wajah", me.uid), { desc: keMap(d), nama: profile.nama || "", ts: serverTimestamp() }); }catch(e){}
}
const hpLain = () => !!(profile?.deviceId && profile.deviceId !== DEVICE);
// Siapkan pemulihan: ambil cadangan wajah dari server ke HP ini. Kunci HP baru dipindah setelah wajah cocok.
async function siapkanPulih(){
  if (!pulihOtomatis || !profile.daftarWajah) throw new Error("Akun ini terkunci ke HP lain. Minta admin menekan Reset di menu Karyawan, lalu pilih Ganti HP.");
  const x = await getDoc(D("wajah", me.uid)).catch(() => null);
  const d = x?.exists() ? dariMap(x.data().desc) : [];
  if (!d.length) throw new Error("Akun ini terkunci ke HP lain dan cadangan wajah belum ada. Minta admin menekan Reset di menu Karyawan, lalu pilih Ganti HP.");
  store.set(kunciWajah(), d);
  return true;
}
// Wajah sudah cocok dengan cadangan: pindahkan kunci HP ke HP ini (sidik jari lama otomatis dilepas)
async function selesaikanPulih(skor){
  const lama = profile.deviceId, dref = doc(db, "devices", DEVICE), ds = await getDoc(dref);
  if (ds.exists() && ds.data().uid !== me.uid) throw new Error("HP ini sudah dipakai akun lain (" + (ds.data().nama || "karyawan lain") + "). Satu HP hanya untuk satu karyawan.");
  const bt = writeBatch(db);
  if (!ds.exists()) bt.set(dref, { uid: me.uid, cid: CID, nama: profile.nama, at: serverTimestamp() });
  bt.update(doc(db, "users", me.uid), { deviceId: DEVICE, daftarJari: false, pulihPada: serverTimestamp(), pulihDari: lama || "" });
  await bt.commit();
  if (lama) deleteDoc(doc(db, "devices", lama)).catch(() => {});
  try{ localStorage.removeItem("absen:finger:" + me.uid); }catch(e){}
  profile.deviceId = DEVICE; profile.daftarJari = false;
  catatLog(CID, me.uid, profile, "akun", "HP dipulihkan otomatis dengan verifikasi wajah (" + Math.round((skor || 0) * 100) + "%) — data aplikasi terhapus / ganti HP");
}

/* ---------- kunci perangkat: 1 akun = 1 HP, 1 HP = 1 akun ---------- */
// Minta browser menyimpan data aplikasi secara permanen (tidak dihapus otomatis saat memori HP penuh),
// supaya kode HP, data wajah & sidik jari tidak hilang dan akun tidak dianggap pindah HP.
try{ navigator.storage?.persist?.().catch(() => {}); }catch(e){}
const DEVICE = (() => {
  let d = store.get("device");
  if (!d){ d = (crypto.randomUUID ? crypto.randomUUID() : Array.from(rnd(16), x => x.toString(16).padStart(2, "0")).join("")); store.set("device", d); }
  return d;
})();
async function ikatPerangkat(pulih = false){
  if (profile.deviceId === DEVICE || pulih) return;
  if (profile.deviceId) throw new Error(pulihOtomatis && profile.daftarWajah
    ? "Akun ini terkunci ke HP lain (atau data aplikasi terhapus). Tekan Absen Masuk/Pulang dengan verifikasi wajah untuk memulihkan akun di HP ini."
    : "Akun ini terkunci ke HP lain. Minta admin menekan Reset perangkat di menu Karyawan.");
  const dref = doc(db, "devices", DEVICE), ds = await getDoc(dref);
  if (ds.exists() && ds.data().uid !== me.uid) throw new Error("HP ini sudah dipakai akun lain (" + (ds.data().nama || "karyawan lain") + "). Satu HP hanya untuk satu karyawan.");
  const bt = writeBatch(db);
  if (!ds.exists()) bt.set(dref, { uid: me.uid, cid: CID, nama: profile.nama, at: serverTimestamp() });
  bt.update(doc(db, "users", me.uid), { deviceId: DEVICE });
  await bt.commit();
  profile.deviceId = DEVICE;
}

/* ---------- uji wajah hidup (MediaPipe) ---------- */
const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
let landmarker = null;
async function siapkanLiveness(){
  if (landmarker) return landmarker;
  const v = await import(MP + "/vision_bundle.mjs");
  const files = await v.FilesetResolver.forVisionTasks(MP + "/wasm");
  const opsi = d => ({ baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: d },
    runningMode: "VIDEO", numFaces: 2, outputFaceBlendshapes: true });
  try{ landmarker = await v.FaceLandmarker.createFromOptions(files, opsi("GPU")); }
  catch(e){ landmarker = await v.FaceLandmarker.createFromOptions(files, opsi("CPU")); }
  return landmarker;
}
function caption(t){ const c = $("#lens-cap"); c.textContent = t || ""; c.hidden = !t; }
// Tantangan acak: berkedip, atau menoleh lalu kembali menghadap kamera.
function ujiHidup(video, lm, batasMs = 9000){
  const tantangan = Math.random() < 0.5 ? "kedip" : "toleh";
  caption(tantangan === "kedip" ? "👁 Kedipkan mata" : "↔ Tolehkan kepala ke samping, lalu kembali ke depan");
  const mulai = performance.now(); let tahap = 0, terakhir = -1;
  return new Promise((ok, no) => {
    const loop = () => {
      const t = performance.now();
      if (t - mulai > batasMs) return no(["face", "Gerakan tidak terdeteksi. Ulangi dan ikuti petunjuk di layar kamera."]);
      if (video.currentTime !== terakhir){
        terakhir = video.currentTime;
        const r = lm.detectForVideo(video, t), n = r.faceLandmarks?.length || 0;
        if (n > 1) return no(["face", "Terlihat lebih dari satu wajah. Absen harus sendiri."]);
        if (n === 1){
          if (tantangan === "kedip"){
            const g = nm => r.faceBlendshapes?.[0]?.categories.find(c => c.categoryName === nm)?.score || 0;
            const tutup = (g("eyeBlinkLeft") + g("eyeBlinkRight")) / 2;
            if (tahap === 0 && tutup < 0.25) tahap = 1;
            else if (tahap === 1 && tutup > 0.5) tahap = 2;
            else if (tahap === 2 && tutup < 0.25) return ok(tantangan);
          } else {
            const L = r.faceLandmarks[0], kiri = L[234].x, kanan = L[454].x, hidung = L[1].x;
            const rasio = (hidung - kiri) / ((kanan - kiri) || 1);
            const depan = rasio > 0.4 && rasio < 0.6;
            if (tahap === 0 && depan) tahap = 1;
            else if (tahap === 1 && (rasio < 0.3 || rasio > 0.7)) tahap = 2;
            else if (tahap === 2 && depan) return ok(tantangan);
          }
        }
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
}
// Foto selfie kecil (maks. 480 px, JPEG) dari kamera
function ambilSelfie(v){
  const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas"); c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  const g = c.getContext("2d"); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(v, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, "image/jpeg", 0.75));
}
let pendingRef = null;

async function absen(type){
  panaskanGPS();
  const m = $("#msg");
  if (type === "masuk" && !bolehMasuk()){ msg(m, masukKedaluwarsa()
      ? "Absen masuk " + tglMedium(tsOf(absenTerakhir)) + " " + fmtJam(tsOf(absenTerakhir)) + " belum ditutup absen pulang. Pilih Lupa absen pulang dulu."
      : "Kamu sudah absen masuk " + fmtJam(tsOf(absenTerakhir)) + ". Absen pulang dulu sebelum absen masuk lagi.", "bad"); aturTombolAbsen();
      if (masukKedaluwarsa()) tanganiPengingat("tanya"); return; }
  if (type === "pulang" && masukKedaluwarsa()){ msg(m, "Batas absen pulang untuk masuk " + tglMedium(tsOf(absenTerakhir)) + " sudah lewat (jam pulang + 4 jam). Pilih Lupa absen pulang.", "bad"); tanganiPengingat("tanya"); aturTombolAbsen(); return; }
  if (type === "pulang" && !bolehPulang()){ msg(m, "Belum ada absen masuk. Absen masuk dulu.", "bad"); aturTombolAbsen(); return; }
  // HP lain / data aplikasi terhapus: pulihkan dengan verifikasi wajah (kalau diaktifkan admin)
  let pulih = false;
  if (hpLain()){
    try{ pulih = await siapkanPulih(); }catch(e){ msg(m, e.message, "bad"); return; }
    msg(m, "📱 HP baru / data aplikasi terhapus terdeteksi. Verifikasi wajah untuk memulihkan akun di HP ini…");
  }
  // Metode verifikasi mengikuti pengaturan perusahaan (pemulihan selalu memakai wajah)
  const pakaiWajah = pulih || metodeVerif !== "jari", pakaiJari = !pulih && metodeVerif !== "wajah";
  if (pakaiWajah && perluPerbaruiWajah()){ msg(m, "Data wajah perlu diperbarui sekali (sistem pengenal wajah baru). Buka tab Pengaturan > Perbarui data wajah.", "bad"); return; }
  const face = pakaiWajah && profile.daftarWajah ? dataWajah() : null;
  if (face) siapkanPengenal().catch(() => {});      // mulai unduh model sambil uji wajah hidup
  const finger = pakaiJari && profile.daftarJari ? store.get("finger:" + me.uid) : null;
  const kurang = pulih ? (!face && "wajah") : metodeVerif === "wajah" ? (!face && "wajah")
    : metodeVerif === "jari" ? (!finger && "sidik jari")
    : metodeVerif === "keduanya" ? ((!face && !finger) ? "wajah dan sidik jari" : !face ? "wajah" : !finger ? "sidik jari" : "")
    : (!face && !finger && "wajah atau sidik jari");
  if (kurang){ msg(m, "Daftarkan " + kurang + " dulu di tab Pengaturan.", "bad"); return; }
  // Mode "salah satu": karyawan memilih metodenya; wajah yang gagal otomatis beralih ke sidik jari
  const salahSatu = !pulih && metodeVerif === "salah";
  const pilih = salahSatu ? metodePilihan() : "";
  if (salahSatu && pilih === "jari" && !finger){ msg(m, "Sidik jari belum terdaftar di HP ini. Daftarkan di tab Pengaturan, atau pilih 🙂 Wajah.", "bad"); return; }
  if (salahSatu && pilih === "wajah" && !face){ msg(m, "Wajah belum terdaftar di HP ini. Daftarkan di tab Pengaturan, atau pilih 👆 Sidik jari.", "bad"); return; }
  let faceAktif = salahSatu && pilih === "jari" ? null : face;
  let fingerAktif = salahSatu ? (pilih === "jari" ? finger : null) : finger;
  const bisaCadangan = salahSatu && pilih === "wajah" && !!finger;
  if (!lokasiSaya().length){ msg(m, "Lokasi absen belum diatur admin.", "bad"); return; }
  sedangAbsen = true; $("#btn-in").disabled = $("#btn-out").disabled = true;
  ["face","finger","gps"].forEach(k => setChk(k, "", "Menunggu"));
  msg(m, ""); $("#izin").hidden = true; pending = null; pendingRef = null;
  let score = null, live = false, selfie = null;
  try{
    // 1. Perangkat harus milik akun ini
    try{ await ikatPerangkat(pulih); }catch(e){ throw ["face", e.message]; }

    // 2. Kamera: uji wajah hidup + foto selfie (+ cocokkan wajah kalau terdaftar)
    setChk("face", "run", "Menyiapkan");
    const v = await startCam();
    // Pilih sidik jari (mode "salah satu"): cukup foto selfie, tanpa uji kedip/menoleh
    const cukupSelfie = salahSatu && pilih === "jari";
    let lm = null;
    if (!cukupSelfie){ try{ lm = await siapkanLiveness(); }catch(e){ lm = null; } }
    // dipakai saat wajah gagal tapi sidik jari tersedia
    const alihKeJari = async alasan => {
      caption(""); try{ selfie = selfie || await ambilSelfie(v); }catch(e){}
      stopCam(); faceAktif = null; score = null; fingerAktif = finger;
      setChk("face", "bad", "Gagal · pakai sidik jari");
      msg(m, alasan + " Lanjut dengan sidik jari…");
    };
    let beralih = false;
    try{
      if (cukupSelfie){
        setChk("face", "run", "Mengambil foto");
        caption("Lihat ke kamera");
        await new Promise(r => setTimeout(r, 700));
      } else if (lm){
        setChk("face", "run", "Ikuti petunjuk");
        await ujiHidup(v, lm);
        live = true;
      } else if (!(await hasFace(v))) throw ["face", "Wajah tidak terdeteksi. Hadapkan wajah ke kamera."];
    }catch(e){
      if (!(bisaCadangan || (salahSatu && fingerAktif))) throw e;
      if (bisaCadangan){ await alihKeJari(Array.isArray(e) ? e[1] : "Wajah gagal."); beralih = true; }
    }
    caption("");
    if (!selfie && stream) selfie = await ambilSelfie(v);
    if (faceAktif && !beralih){
      setChk("face", "run", "Mencocokkan");
      caption("Lihat lurus ke kamera");
      let desc;
      let gagalWajah = "";
      try{ desc = await ciriWajah(v); }
      catch(e){ gagalWajah = "Pengenal wajah gagal dimuat. Periksa koneksi internet, lalu coba lagi."; }
      caption("");
      if (!gagalWajah && !desc) gagalWajah = "Wajah tidak terlihat jelas. Lihat lurus ke kamera di tempat yang cukup terang.";
      if (!gagalWajah){
        const d = jarakTerdekat(desc, faceAktif);
        score = Math.max(0, Math.min(1, 1 - d));
        if (d > JARAK_MAKS) gagalWajah = "Wajah tidak dikenali. Lepas masker/helm/kacamata gelap, lihat lurus ke kamera, lalu coba lagi.";
      }
      if (gagalWajah){
        if (!bisaCadangan){ stopCam(); throw ["face", gagalWajah]; }
        await alihKeJari(gagalWajah); beralih = true;
      }
    }
    stopCam();
    if (!beralih) setChk("face", "ok", (live ? "Hidup ✓" : "Foto ✓") + (score !== null ? " · " + Math.round(score*100) + "%" : ""));
    // Pemulihan: wajah cocok dengan cadangan -> kunci HP dipindah ke HP ini sebelum absen disimpan
    if (pulih){
      if (beralih || score === null) throw ["face", "Pemulihan HP butuh verifikasi wajah yang berhasil. Coba lagi di tempat terang."];
      try{ await selesaikanPulih(score); }catch(e){ throw ["face", e.message || "Gagal memulihkan HP."]; }
      toast("✅ Akun dipulihkan di HP ini. Sidik jari perlu didaftarkan ulang di Pengaturan.");
    }

    if (fingerAktif){
      setChk("finger", "run", "Sentuh sensor");
      try{ await verifyFinger(); }catch(e){ throw ["finger", "Sidik jari dibatalkan atau tidak cocok."]; }
      setChk("finger", "ok", "Cocok");
    } else setChk("finger", "", "Tidak dipakai");

    setChk("gps", "run", "Mencari");
    let p;
    // radius tambahan khusus karyawan ini (diatur admin) untuk radius lokasi & batas akurasi GPS
    const tambah = Math.max(0, +profile.radiusTambah || 0);
    const batasAkurasi = akurasiGlobal + tambah;
    try{ p = await getPosTerbaik(batasAkurasi); }catch(e){ throw ["gps", "Lokasi tidak bisa dibaca. Izinkan akses lokasi lalu coba lagi."]; }
    // Cocokkan ke lokasi terdekat yang boleh dipakai karyawan ini
    const terdekat = lokasiSaya().map(L => ({ L, d: meters(p.latitude, p.longitude, L.lat, L.lng) })).sort((a, b) => a.d - b.d)[0];
    const lok = { ...terdekat.L, rad: (terdekat.L.rad || 0) + tambah }, dist = Math.round(terdekat.d);
    const rec = { uid: me.uid, nama: profile.nama, type, face: score === null ? null : +score.toFixed(3), finger: !!fingerAktif, live, device: DEVICE, dist, rad: lok.rad, ...(tambah ? { radTambah: tambah } : {}),
                  lokasi: lok.nama, lokasiId: lok.id, perangkat: await perangkatInfo(),
                  acc: Math.round(p.accuracy), la: +p.latitude.toFixed(6), lo: +p.longitude.toFixed(6) };
    setChk("gps", "run", "Membaca alamat");
    rec.alamat = await alamatDari(p.latitude, p.longitude);       // kosong kalau layanan peta tidak menjawab
    setPosisiLog(rec.la, rec.lo, rec.acc, rec.alamat);

    // 3. Unggah foto selfie
    const ref = doc(C("absensi"));
    if (selfie){
      setChk("gps", "run", "Mengunggah foto");
      try{
        const path = `absen/${me.uid}/${ref.id}.jpg`;
        await uploadBytesResumable(sRef(storage, path), selfie, { contentType: "image/jpeg" });
        rec.foto = path;
      }catch(e){ rec.foto = null; }
    }

    rec.gpsLemah = rec.acc > batasAkurasi;
    if (dist > lok.rad || rec.gpsLemah){
      setChk("gps", "bad", dist > lok.rad ? "Di luar area" : "GPS lemah");
      pending = rec; pendingRef = ref;
      $("#izin").hidden = false; $("#alasan").value = "";
      $("#izin b").textContent = dist > lok.rad ? "Di luar area " + lok.nama : "Sinyal GPS lemah";
      $("#izin-info").textContent = (dist > lok.rad
          ? "Kamu " + fmtNum(dist) + " m dari " + lok.nama + " (lokasi terdekat), batasnya " + fmtNum(lok.rad) + " m."
          : "Akurasi GPS ±" + fmtNum(rec.acc) + " m, batasnya ±" + fmtNum(batasAkurasi) + " m. Coba dekat jendela atau di luar ruangan, lalu absen ulang. Atau kirim ke admin untuk disetujui.") +
        (rec.alamat ? " Lokasimu: " + rec.alamat + "." : "") + " Tulis alasan, lalu admin dan supervisor akan langsung dapat notifikasi.";
      $("#alasan").focus();
      return;
    }
    setChk("gps", "ok", lok.nama + " · " + fmtNum(dist) + " m");
    await setDoc(ref, { ...rec, status: "otomatis", ts: serverTimestamp() });
    msg(m, "Absen " + type + " tercatat pukul " + fmtJam(new Date()) + "." + (rec.alamat ? " Lokasi: " + rec.alamat : ""), "ok");
  }catch(e){
    stopCam(); caption("");
    if (Array.isArray(e)){ setChk(e[0], "bad", "Gagal"); msg(m, e[1], "bad"); }
    else if (e?.code) msg(m, "Gagal menyimpan: " + e.code, "bad");
    else msg(m, "Kamera tidak bisa dibuka. Izinkan akses kamera lalu coba lagi.", "bad");
  }finally{
    sedangAbsen = false; aturTombolAbsen();
  }
}
$("#btn-in").onclick = () => absen("masuk");
$("#btn-out").onclick = () => absen("pulang");

$("#izin-send").onclick = async () => {
  const alasan = $("#alasan").value.trim(), m = $("#msg");
  if (!alasan){ msg(m, "Tulis alasan dulu.", "bad"); return; }
  $("#izin-send").disabled = true;
  try{
    await setDoc(pendingRef || doc(C("absensi")), { ...pending, alasan, status: "menunggu", ts: serverTimestamp() });
    $("#izin").hidden = true; pending = null; pendingRef = null;
    msg(m, "Permintaan terkirim. Status bisa dipantau di tab Riwayat.", "ok");
  }catch(e){ msg(m, "Gagal mengirim: " + (e.code || e.message), "bad"); }
  $("#izin-send").disabled = false;
};
$("#izin-cancel").onclick = () => {
  if (pending?.foto) deleteObject(sRef(storage, pending.foto)).catch(() => {});
  $("#izin").hidden = true; pending = null; pendingRef = null; msg($("#msg"), "");
};

/* ---------- pengaturan ---------- */
function renderSetup(){
  aturCek();
  if (!me) return;
  const st = (el, ok, yes, no) => { el.textContent = ok ? yes : no; el.className = "state " + (ok ? "ok" : "no"); };
  const wajah = profile?.daftarWajah && dataWajah(), jari = profile?.daftarJari && store.get("finger:" + me.uid), upgrade = perluPerbaruiWajah();
  st($("#s-face"), wajah, "Terdaftar · terkunci 🔒", upgrade ? "Perlu diperbarui sekali (pengenal wajah baru)" : profile?.daftarWajah ? "Terkunci, data tidak ada di HP ini. Minta admin reset." : "Belum terdaftar");
  st($("#s-finger"), jari, "Terdaftar · terkunci 🔒", profile?.daftarJari ? "Terkunci, data tidak ada di HP ini. Minta admin reset." : "Belum terdaftar");
  $("#reg-face").disabled = !!profile?.daftarWajah && !upgrade;
  $("#reg-face").textContent = upgrade ? "Perbarui data wajah" : profile?.daftarWajah ? "Terkunci" : "Daftarkan wajah";
  $("#reg-finger").disabled = !!profile?.daftarJari;  $("#reg-finger").textContent = profile?.daftarJari ? "Terkunci" : "Daftarkan sidik jari";
  // Hanya admin yang boleh mematikan notifikasi; karyawan hanya bisa mengaktifkan
  const bolehMati = bolehMatikanNotif(), aktif = notifAktif();
  st($("#s-notif"), aktif, "Aktif", "Tidak aktif");
  $("#notif-on").hidden = aktif && !bolehMati;
  $("#notif-on").textContent = aktif ? "Nonaktifkan notifikasi" : "Aktifkan notifikasi";
  $("#notif-on").className = "small" + (aktif ? " alt" : "");
  // Penyebab kalau tidak aktif, supaya jelas apa yang harus dilakukan
  const izinN = "Notification" in window ? Notification.permission : "tidak didukung";
  let matiN = false; try{ matiN = localStorage.getItem("absen:notifMati") === "1"; }catch(e){}
  $("#notif-ket").innerHTML = aktif ? (bolehMati ? "" : "Notifikasi wajib aktif. Hanya admin yang bisa menonaktifkannya.")
    : izinN === "denied" ? "Penyebab: izin notifikasi untuk situs absencsm.pages.dev <b>diblokir</b>. Buka aplikasi <b>Chrome > ⋮ > Setelan > Setelan situs > Notifikasi</b> > cari absencsm.pages.dev > <b>Izinkan</b>. Lalu tekan Muat ulang aplikasi."
    : izinN === "tidak didukung" ? "Penyebab: HP/browser ini tidak mendukung notifikasi web."
    : matiN ? "Penyebab: notifikasi pernah dimatikan di HP ini. Tekan <b>Aktifkan notifikasi</b>."
    : "Penyebab: izin belum diberikan. Tekan <b>Aktifkan notifikasi</b> lalu pilih <b>Izinkan</b>.";
  // Pengingat di halaman Absen: notifikasi wajib aktif untuk karyawan (default aktif)
  const ada = "Notification" in window, ditolak = ada && Notification.permission === "denied";
  $("#notif-banner").hidden = aktif || !ada || bolehMati;
  $("#notif-banner-on").hidden = ditolak;
  $("#notif-banner-ket").innerHTML = ditolak
    ? "Notifikasi diblokir. Buka aplikasi <b>Chrome > ⋮ > Setelan > Setelan situs > Notifikasi</b> > absencsm.pages.dev > <b>Izinkan</b>, lalu buka ulang aplikasi."
    : "Aktifkan supaya dapat kabar saat absen & pengajuan disetujui atau ditolak.";
}
$("#reg-face").onclick = async () => {
  document.querySelector('nav button[data-tab="absen"]').click();
  const upgrade = perluPerbaruiWajah();
  if (profile.daftarWajah && !upgrade){ msg($("#msg"), "Wajah sudah terdaftar dan terkunci. Minta admin reset untuk daftar ulang.", "bad"); return; }
  try{ await ikatPerangkat(); }catch(e){ msg($("#msg"), e.message, "bad"); return; }
  msg($("#msg"), "Menyiapkan pengenal wajah… (pertama kali mengunduh ±6 MB)");
  try{
    const [v] = await Promise.all([startCam(), siapkanPengenal()]);
    msg($("#msg"), "");
    // 5 foto dari sudut sedikit berbeda agar pencocokan stabil
    const arahan = ["Lihat lurus ke kamera", "Lihat lurus ke kamera", "Miringkan wajah sedikit ke kiri", "Miringkan wajah sedikit ke kanan", "Lihat lurus lagi"];
    const hasil = [];
    for (const [i, t] of arahan.entries()){
      caption(t + " (" + (i + 1) + "/5)");
      await new Promise(r => setTimeout(r, 900));
      const h = await rekamWajah(v, 6);
      if (h) hasil.push(h);
    }
    caption(""); stopCam();
    if (hasil.length < 3) throw new Error("kurang");
    const daftar = hasil.map(h => h.desc);
    // preview: simpan hanya kalau karyawan menekan "Simpan wajah"
    if (!(await previewWajah(hasil, kualitasWajah(daftar)))){ msg($("#msg"), "Pendaftaran dibatalkan. Tekan tombol daftar lagi untuk mengulang."); renderSetup(); $("#reg-face").click(); return; }
    store.set(kunciWajah(), daftar);
    store.del?.("face:" + me.uid);
    try{ localStorage.removeItem("absen:face:" + me.uid); }catch(e){}
    stopCam();
    if (!profile.daftarWajah) await kunciBiometrik("daftarWajah");
    cadangkanWajah();
    msg($("#msg"), upgrade ? "Data wajah berhasil diperbarui. Silakan absen seperti biasa." : "Wajah terdaftar dan sekarang terkunci. Untuk daftar ulang, minta admin reset.", "ok");
  }catch(e){
    stopCam(); caption("");
    msg($("#msg"), e?.message === "kurang" ? "Wajah kurang jelas terekam. Cari tempat terang, lepas masker/kacamata gelap, lalu coba lagi."
      : String(e?.message || "").includes("import") || String(e?.message || "").includes("fetch") ? "Pengenal wajah gagal dimuat. Periksa koneksi internet, lalu coba lagi."
      : "Wajah tidak bisa direkam. Izinkan kamera dan pastikan wajah terlihat jelas.", "bad");
  }
  renderSetup();
};
// Pesan kegagalan sidik jari yang bisa dipahami karyawan
function pesanJari(e){
  const n = e?.name || e?.message || "";
  if (n === "timeout") return "Sensor sidik jari tidak merespon. Pastikan kunci layar & sidik jari sudah aktif di Pengaturan HP, lalu buka aplikasi lewat Chrome dan coba lagi.";
  if (n === "NotAllowedError") return "Pendaftaran dibatalkan atau waktu habis. Tekan Daftarkan sidik jari lagi, lalu sentuh sensor saat diminta.";
  if (n === "InvalidStateError") return "Sidik jari HP ini sudah pernah didaftarkan. Minta admin Reset HP, lalu daftar ulang.";
  if (n === "SecurityError") return "Alamat aplikasi tidak diizinkan untuk sidik jari. Buka lewat https://absencsm.pages.dev di Chrome.";
  if (n === "NotSupportedError") return "HP/browser ini tidak mendukung sidik jari untuk aplikasi web. Buka lewat Chrome versi terbaru.";
  return "Pendaftaran sidik jari gagal (" + n + ").";
}
$("#reg-finger").onclick = async () => {
  const m = $("#msg2"), btn = $("#reg-finger");
  if (!window.PublicKeyCredential || !navigator.credentials?.create){
    msg(m, "Browser ini tidak mendukung sidik jari. Buka aplikasi lewat Chrome (Android) atau Safari (iPhone).", "bad"); return; }
  if (profile.daftarJari){ msg(m, "Sidik jari sudah terdaftar dan terkunci. Minta admin reset untuk daftar ulang.", "bad"); return; }
  btn.disabled = true; msg(m, "Memeriksa sensor sidik jari…");
  try{
    // pastikan HP punya sensor & kunci layar aktif
    const ada = await Promise.race([PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.() ?? Promise.resolve(true),
      new Promise(r => setTimeout(() => r(true), 3000))]);
    if (!ada){ msg(m, "Sensor sidik jari/kunci layar belum aktif di HP ini. Aktifkan di Pengaturan HP > Keamanan > Sidik jari, lalu coba lagi.", "bad"); return; }
    try{ await ikatPerangkat(); }catch(e){ msg(m, e.message, "bad"); return; }
    msg(m, "Sentuh sensor sidik jari (atau Face ID) saat diminta…");
    await Promise.race([registerFinger(), new Promise((_, no) => setTimeout(() => no(new Error("timeout")), 50000))]);
    await kunciBiometrik("daftarJari");
    msg(m, "Sidik jari terdaftar dan sekarang terkunci. Untuk daftar ulang, minta admin reset.", "ok");
  }catch(e){ console.warn("daftar sidik jari:", e); msg(m, pesanJari(e), "bad"); }
  finally{ btn.disabled = false; renderSetup(); }
};
const bolehMatikanNotif = () => ["admin", "superadmin"].includes(profile?.role);
$("#notif-banner-on").onclick = async () => {
  const b = $("#notif-banner-on"); b.disabled = true;
  try{ localStorage.removeItem("absen:notifMati"); }catch(e){}
  try{ await enableNotif(me.uid, profile.role, CID); toast("Notifikasi aktif."); }
  catch(e){ toast(Notification.permission === "denied" ? "Notifikasi diblokir. Ikuti petunjuk untuk menyalakannya di Setelan HP." : "Gagal mengaktifkan notifikasi: " + (e.code || e.message)); }
  b.disabled = false; renderSetup();
};
$("#notif-on").onclick = async () => {
  const m = $("#msg2"), b = $("#notif-on"); b.disabled = true;
  try{
    if (notifAktif()){
      if (!bolehMatikanNotif()){ msg(m, "Hanya admin yang bisa menonaktifkan notifikasi.", "bad"); b.disabled = false; renderSetup(); return; }
      await disableNotif(); msg(m, "Notifikasi dimatikan di HP ini.", "ok"); }
    else { await enableNotif(me.uid, profile.role, CID); msg(m, "Notifikasi aktif.", "ok"); toast("Notifikasi aktif."); }
  }catch(e){
    const t = (e.message || e.code || "gagal") + " [izin: " + ("Notification" in window ? Notification.permission : "-") + "]";
    msg(m, t, "bad"); toast("Gagal mengaktifkan notifikasi: " + t);
    catatLog(CID, me.uid, profile, "buka", "Gagal mengaktifkan notifikasi: " + t);
  }
  b.disabled = false; renderSetup();
};

/* ---------- gaji saya ---------- */
{ const n = new Date(); $("#g-bulan").value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"); }
async function lihatGaji(){
  const out = $("#g-out"); out.dataset.done = "1";
  const [y, mo] = $("#g-bulan").value.split("-").map(Number); const m = mo - 1;
  out.innerHTML = '<p class="meta">Menghitung…</p>';
  try{
    const [gSnap, aSnap, rSnap, zSnap, pSnap] = await Promise.all([
      getDoc(D("payroll", me.uid)),
      getDoc(D("settings", "payroll")),
      getDocs(query(C("absensi"), where("uid", "==", me.uid),
        where("ts", ">=", Timestamp.fromDate(rentangPeriode(y, m, aturanGaji.awalPeriode).mulai)),
        where("ts", "<", Timestamp.fromDate(rentangPeriode(y, m, aturanGaji.awalPeriode).akhir)), orderBy("ts", "desc"))),
      getDocs(query(C("izin"), where("uid", "==", me.uid), where("status", "==", "terima"))),
      getDocs(query(C("pinjaman"), where("uid", "==", me.uid))).catch(() => ({ docs: [] }))
    ]);
    if (!gSnap.exists()){ out.innerHTML = '<p class="meta">Gaji kamu belum diatur oleh admin.</p>'; return; }
    const ym = $("#g-bulan").value, pinjaman = pSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.status !== "batal");
    const r = hitungGaji(rSnap.docs.map(d => d.data()), aSnap.exists() ? aSnap.data() : {}, { ...gajiPeriode(gSnap.data(), ym, (aSnap.exists() ? aSnap.data() : {}).kolomGaji, (aSnap.exists() ? aSnap.data() : {}).tanpaKomponen), shift: profile.shift || "", grupCV: profile.grupCV || "-", tanpaLebihHK: profile.kehadiran === "manual",
      pinjamanList: angsuranPeriode(pinjaman, ym) }, y, m, new Date(), zSnap.docs.map(d => d.data()));
    const periode = rentangPeriode(y, m, (aSnap.exists() ? aSnap.data() : {}).awalPeriode).label, now = new Date();
    const berjalan = y === now.getFullYear() && m === now.getMonth();
    out.innerHTML = `<div class="card"><div class="meta">${berjalan ? "Perkiraan gaji bersih sampai hari ini" : "Gaji bersih " + periode}</div>
      <div class="big">${rp(r.bersih)}</div>
      <div class="meta">Hadir ${fmtNum(r.hadirKerja)}/${fmtNum(r.hariKerja)} · Telat ${fmtNum(r.kaliTelat)}x · Sakit ${fmtNum(r.sakit)} · Izin ${fmtNum(r.izin)} · Cuti ${fmtNum(r.cuti || 0)} · Tidak hadir ${fmtNum(r.alpha)} · Lembur ${fmtNum(r.jamLembur)} jam</div>
      ${r.menunggu ? `<p class="meta" style="color:var(--warn)">${fmtNum(r.menunggu)} absen masih menunggu persetujuan.</p>` : ""}
      ${rincianHTML(r, false)}
      <button class="small alt" id="g-slip">Cetak slip</button></div>
      ${pinjamanHTML(pinjaman, ym)}`;
    $("#g-slip").onclick = () => { if (!cetakSlip(r, profile.nama, periode, ptSaya)) toast("Izinkan pop-up untuk mencetak slip."); };
  }catch(e){ out.innerHTML = '<p class="meta">Gagal memuat: ' + (e.code || e.message) + '</p>'; }
}
$("#g-hitung").onclick = lihatGaji;
// Daftar pinjaman karyawan sendiri (sisa & jadwal angsuran)
const blnPendek = ym => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "short", year: "2-digit" }); };
function pinjamanHTML(list, ym){
  if (!list.length) return "";
  return `<div class="card pj-saya"><h3 style="margin:0 0 8px">Pinjaman saya</h3>${list.map(p => {
    const st = statusPinjaman(p, ym), pct = Math.round(st.terbayar / (+p.jumlah || 1) * 100);
    return `<details class="pj-item"><summary><b>${rp(p.jumlah)}</b> · ${p.jenis === "sio" || p.kolom === "pinjamanSio" ? "Pinjaman SIO" : "Pinjaman Karyawan"}${p.ket ? " · " + esc(p.ket) : ""}
        <span class="tag ${st.lunas ? "in" : "wait"}">${st.lunas ? "Lunas" : "Sisa " + rp(st.sisa)}</span></summary>
      <div class="pj-bar"><i style="width:${pct}%"></i></div>
      <p class="meta">Terbayar ${rp(st.terbayar)} (${fmtNum(pct)}%) · ${st.manual ? "dipotong dari gaji sesuai catatan admin" : `potong gaji ${esc(ymLabel(p.mulai))} – ${esc(ymLabel(st.akhir))}`}</p>
      <table class="pj-tbl"><tr><th>Ke</th><th>Periode</th><th class="num">Angsuran</th><th class="num">Sisa</th></tr>${st.jadwal.map(a =>
        `<tr${a.ym === ym ? ' class="ini"' : ""}><td class="ke">${a.pelunasan ? "Lunas" : a.ke}${a.ym <= ym ? " ✓" : ""}</td><td>${esc(blnPendek(a.ym))}</td><td class="num">${rp(a.jumlah)}</td><td class="num">${rp(a.sisa)}</td></tr>`).join("")}</table>
    </details>`; }).join("")}</div>`;
}

document.querySelectorAll(".subtabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".subtabs button").forEach(x => x.setAttribute("aria-selected", x === b));
  document.querySelectorAll("#tab-gaji .sub").forEach(x => x.classList.remove("on"));
  $("#" + b.dataset.s).classList.add("on");
  if (b.dataset.s === "sub-kira" && !$("#g-out").dataset.done) lihatGaji();
});

/* ---------- pengajuan izin / sakit ---------- */
const STATUS_IZIN = { menunggu:["wait","Menunggu"], terima:["in","Disetujui"], tolak:["no","Ditolak"] };
/* lampiran yang dipilih (belum diunggah) */
let fileDipilih = [];
function renderFiles(){
  const box = $("#c-files"); box.replaceChildren();
  fileDipilih.forEach((f, i) => {
    const w = document.createElement("div"); w.className = "lamp-pick";
    let el;
    if (isGambar(f.type)){
      el = document.createElement("div"); el.className = "thumb";
      el.style.backgroundImage = `url("${f._url ||= URL.createObjectURL(f)}")`;
    } else {
      el = document.createElement("div"); el.className = "chipdoc";
      el.innerHTML = `<span aria-hidden="true">📄</span><span class="nm"></span><small>${ukuran(f.size)}</small>`;
      el.querySelector(".nm").textContent = f.name;
    }
    const x = document.createElement("button"); x.type = "button"; x.className = "x"; x.textContent = "✕"; x.setAttribute("aria-label", "Hapus " + f.name);
    x.onclick = () => { if (f._url) URL.revokeObjectURL(f._url); fileDipilih.splice(i, 1); renderFiles(); };
    w.append(el, x); box.append(w);
  });
  $("#c-add").hidden = fileDipilih.length >= LAMPIRAN_MAX;
}
$("#c-file").onchange = async e => {
  const files = [...e.target.files]; e.target.value = "";
  for (const f of files){
    if (fileDipilih.length >= LAMPIRAN_MAX){ toast("Maksimal " + LAMPIRAN_MAX + " lampiran."); break; }
    const err = cekFile(f); if (err){ toast(err); continue; }
    fileDipilih.push(await kompres(f));
  }
  renderFiles();
};
function resetFiles(){ fileDipilih.forEach(f => f._url && URL.revokeObjectURL(f._url)); fileDipilih = []; renderFiles(); }
const namaAman = n => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-60);

// Jam kerja karyawan (shift sendiri atau jam utama perusahaan) untuk isian lupa absen
const jamKerjaSaya = () => { const S = (aturanGaji.shifts || []).find(x => x.id === profile?.shift);
  const masuk = S?.masuk || aturanGaji.jamMasuk || "08:00", pulang = S?.pulang || aturanGaji.jamPulang || "17:00";
  return { masuk, pulang, shift: S?.nama || "", lintas: pulang <= masuk }; };
// Waktu lupa absen = tanggal kerja + jam kerja; shift malam: jam pulang jatuh keesokan harinya
const waktuLupa = (tgl, lupa, jk) => { const [y, mo, d] = tgl.split("-").map(Number), [h, mi] = jk[lupa].split(":").map(Number);
  return new Date(y, mo - 1, d + (lupa === "pulang" && jk.lintas ? 1 : 0), h, mi); };
// Tanggal lupa absen dikunci: hari ini. Shift malam lupa pulang = tanggal kerja kemarin (pulangnya pagi ini).
const tglLupa = (lupa, jk) => {
  if (lupa === "pulang" && masukTerbuka()) return dayKey(tsOf(masukTerbuka()));      // tutup absen masuk yang masih terbuka
  const t = new Date(); if (lupa === "pulang" && jk.lintas) t.setDate(t.getDate() - 1); return dayKey(t); };
function kunciTanggal(kunci){
  const t = $("#c-mulai-dmy"); if (!t) return;
  t.readOnly = kunci; t.tabIndex = kunci ? -1 : 0; t.classList.toggle("jam-kunci", kunci);
}
let jenisSebelum = "";
const jamSekarang = () => { const n = new Date(); return String(n.getHours()).padStart(2, "0") + ":" + String(n.getMinutes()).padStart(2, "0"); };
// jam di form "tidak bisa absen masuk" ikut berjalan selama form terbuka
setInterval(() => { if (!$("#cuti")?.hidden && LUPA_ABSEN[$("#c-jenis")?.value] === "masuk") $("#c-jam").value = jamSekarang(); }, 20000);
function aturFormIzin(){
  const j = $("#c-jenis").value, lupa = LUPA_ABSEN[j];
  $("#c-selesai-wrap").hidden = !!lupa; $("#c-jam-wrap").hidden = !lupa;
  $("#c-mulai-label").textContent = lupa ? "Tanggal" : "Dari tanggal";
  if (lupa){
    const jk = jamKerjaSaya();
    $("#c-jam-label").textContent = lupa === "masuk" ? "Jam masuk" : "Jam pulang";
    // tidak bisa absen masuk: jam = saat pengajuan dikirim; lupa pulang: jam kerja. Keduanya tidak bisa diubah
    $("#c-jam").value = lupa === "masuk" ? jamSekarang() : jk[lupa];
    if ($("#c-mulai").value !== tglLupa(lupa, jk)) $("#c-mulai").value = tglLupa(lupa, jk);   // tanggal juga dikunci
    kunciTanggal(true);
    $("#c-jam-ket").textContent = (lupa === "masuk" ? "Jam saat pengajuan dikirim, tidak bisa diubah."
        : "Sesuai jam kerja" + (jk.shift ? " (shift " + jk.shift + ")" : "") + ", tidak bisa diubah.") +
      (lupa === "pulang" && jk.lintas ? " Shift malam: tanggal kerja kemarin, pulang tercatat pagi ini." : "") +
      (lupa === "pulang" && masukTerbuka() ? " Tanggal = tanggal absen masuk yang belum ditutup (" + tglMedium(tsOf(masukTerbuka())) + ")."
        : " Tanggal dikunci hari ini.");
    $("#c-alasan").placeholder = lupa === "masuk" ? "Contoh: HP rusak / tertinggal, aplikasi error" : "Contoh: lupa absen pulang, baterai HP habis";
  } else { $("#c-alasan").placeholder = "Contoh: demam, sudah ke dokter"; kunciTanggal(false); }
  jenisSebelum = j;
}
$("#cuti-open").onclick = () => {
  const t = dayKey(new Date());
  $("#c-mulai").value = $("#c-selesai").value = t; $("#c-alasan").value = ""; resetFiles(); jenisSebelum = ""; aturFormIzin();
  $("#cuti").hidden = false; $("#cuti-open").hidden = true; infoCuti();
  $("#cuti").scrollIntoView({ block: "nearest", behavior: "smooth" });
};
$("#c-cancel").onclick = () => { $("#cuti").hidden = true; $("#cuti-open").hidden = false; resetFiles(); };
function infoCuti(){
  aturFormIzin();
  const a = $("#c-mulai").value, b = $("#c-selesai").value;
  if (LUPA_ABSEN[$("#c-jenis").value]){
    $("#c-info").textContent = "Setelah disetujui admin/supervisor, jam ini otomatis tercatat sebagai absen " + LUPA_ABSEN[$("#c-jenis").value] + "." +
      (LUPA_ABSEN[$("#c-jenis").value] === "masuk" ? " Lampiran foto wajib, dan harus menunjukkan tanggal dan jam saat pengajuan." : "");
    $("#c-sisa").hidden = true; return;
  }
  if (a && b && b < a) $("#c-selesai").value = a;
  const lama = a ? hariKerjaAntara(a, $("#c-selesai").value || a, aturanGaji) : 0;
  $("#c-info").textContent = a ? fmtNum(lama) + " hari kerja" : "";
  // sisa cuti tahunan
  const el = $("#c-sisa"), cuti = $("#c-jenis").value === "cuti";
  el.hidden = !cuti; if (!cuti) return;
  const tahun = (a || dayKey(new Date())).slice(0, 4), jatah = +(aturanGaji.jatahCuti ?? 12);
  const sisa = jatah - cutiTerpakai(semuaPengajuan, tahun, aturanGaji);
  el.innerHTML = `Sisa cuti ${tahun}: <b>${fmtNum(sisa)} dari ${fmtNum(jatah)} hari</b>` +
    (lama > sisa ? ' · <span style="color:var(--bad)">melebihi sisa cuti, keputusan ada di admin</span>' : "");
}
$("#c-mulai").onchange = infoCuti; $("#c-selesai").onchange = infoCuti; $("#c-jenis").onchange = infoCuti;
$("#c-send").onclick = async () => {
  const m = $("#msg"), mulai = $("#c-mulai").value, selesai = $("#c-selesai").value || mulai, alasan = $("#c-alasan").value.trim();
  if (!mulai){ msg(m, "Pilih tanggal dulu.", "bad"); return; }
  if (!alasan){ msg(m, "Tulis keterangan dulu.", "bad"); return; }
  const jenisZ = $("#c-jenis").value, lupa = LUPA_ABSEN[jenisZ], jkZ = jamKerjaSaya(), jamZ = lupa === "masuk" ? jamSekarang() : lupa ? jkZ[lupa] : "";
  if (lupa && mulai !== tglLupa(lupa, jkZ)){ $("#c-mulai").value = tglLupa(lupa, jkZ); msg(m, "Tanggal lupa absen sudah dikunci otomatis. Periksa lalu kirim lagi.", "bad"); return; }
  if (lupa === "masuk"){
    if (absenTerakhir?.type === "masuk"){ msg(m, "Kamu sudah absen masuk " + fmtJam(tsOf(absenTerakhir)) + ". Pengajuan Absen Masuk hanya untuk yang tidak bisa absen masuk lewat tombol.", "bad"); return; }
    if (!fileDipilih.some(f => isGambar(f.type))){ msg(m, "Lampiran foto wajib: foto yang menunjukkan tanggal dan jam saat pengajuan.", "bad"); return; }
    if (semuaPengajuan.some(z => z.jenis === "lupaMasuk" && z.mulai === mulai && z.status !== "tolak")){ msg(m, "Pengajuan Absen Masuk untuk hari ini sudah dikirim.", "bad"); return; }
  }
  if (lupa){
    if (!jamValid(jamZ)){ msg(m, "Jam kerja belum diatur admin. Hubungi admin.", "bad"); return; }
    if (lupa !== "masuk" && waktuLupa(mulai, lupa, jkZ) > new Date()){ msg(m, "Jam " + lupa + " kerja (" + jamZ + ") pada tanggal itu belum lewat. Ajukan setelah jam " + jamZ + ".", "bad"); return; }
  }
  const btn = $("#c-send"); btn.disabled = $("#c-cancel").disabled = true;
  const docRef = doc(C("izin")), lampiran = [], terunggah = [];
  try{
    // 1. Unggah lampiran satu per satu, dengan progres
    const total = fileDipilih.reduce((s, f) => s + f.size, 0) || 1; let selesaiByte = 0;
    for (const [i, f] of fileDipilih.entries()){
      const path = `izin/${me.uid}/${docRef.id}/${i + 1}-${namaAman(f.name)}`;
      const task = uploadBytesResumable(sRef(storage, path), f, { contentType: f.type });
      await new Promise((ok, no) => task.on("state_changed",
        st => btn.textContent = "Mengunggah " + Math.round((selesaiByte + st.bytesTransferred) / total * 100) + "%…", no, ok));
      selesaiByte += f.size; terunggah.push(path);
      lampiran.push({ nama: f.name, path, tipe: f.type, ukuran: f.size });
    }
    btn.textContent = "Mengirim…";
    // 2. Simpan pengajuan
    await setDoc(docRef, { uid: me.uid, nama: profile.nama, jenis: jenisZ, mulai, selesai: lupa ? mulai : selesai, alasan,
      ...(lupa ? { jam: jamZ } : {}), lampiran, status: "menunggu", ts: serverTimestamp() });
    $("#cuti").hidden = true; $("#cuti-open").hidden = false; resetFiles();
    msg(m, "Pengajuan terkirim. Admin dan supervisor sudah mendapat notifikasi.", "ok");
  }catch(e){
    terunggah.forEach(pth => deleteObject(sRef(storage, pth)).catch(() => {}));   // bersihkan unggahan yang gagal dipakai
    msg(m, "Gagal mengirim: " + (e.code || e.message), "bad");
  }
  btn.textContent = "Kirim pengajuan"; btn.disabled = $("#c-cancel").disabled = false;
};
function listenIzin(){
  const q = query(C("izin"), where("uid", "==", me.uid), orderBy("ts", "desc"), limit(20));
  unsubIzin = onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      const z = ch.doc.data();
      if (ch.type === "modified" && z.status !== "menunggu")
        { toast("Pengajuan " + namaJenisIzin(z.jenis).toLowerCase() + " " + (z.status === "terima" ? "disetujui" : "ditolak") + " oleh " + z.by); cutiBulan = ""; listenLog(); }
    });
    semuaPengajuan = snap.docs.map(d => d.data({ serverTimestamps: "estimate" })); aturTombolAbsen();
    const ul = $("#log-izin");
    if (snap.empty){ ul.innerHTML = '<li class="empty">Belum ada pengajuan.</li>'; return; }
    ul.replaceChildren(...snap.docs.map(x => {
      const z = x.data(), li = document.createElement("li");
      const [cls, txt] = STATUS_IZIN[z.status] || ["wait", z.status];
      li.innerHTML = `<div><div class="t">${namaJenisIzin(z.jenis)}</div>
        <small>${esc(rentang(z))} · ${esc(z.alasan || "")}${z.note ? " · Catatan: " + esc(z.note) : ""}</small>
        ${z.lampiran?.length ? `<div class="clip">📎 ${fmtNum(z.lampiran.length)} lampiran</div>` : ""}</div>
        <div class="tags"><span class="tag ${cls}">${txt}</span>${z.by ? `<small>oleh ${esc(z.by)}</small>` : ""}
        ${z.status === "menunggu" ? '<button class="linkbtn" style="padding:0;font-size:.8rem">Batalkan</button>' : ""}</div>`;
      if (z.lampiran?.length) li.firstElementChild.append(daftarLampiran(z.lampiran));
      const b = li.querySelector(".tags button");
      if (b) b.onclick = async () => {
        if (!await tanya("Batalkan pengajuan ini?")) return;
        try{
          await deleteDoc(D("izin", x.id));
          (z.lampiran || []).forEach(l => deleteObject(sRef(storage, l.path)).catch(() => {}));
          toast("Pengajuan dibatalkan.");
        }catch(e){ toast("Gagal: " + e.code); }
      };
      return li;
    }));
  }, e => { $("#log-izin").innerHTML = '<li class="empty">Gagal memuat: ' + e.code + '</li>'; });
}

/* ---------- slip tersimpan 12 bulan ---------- */
// Rekap + daftar bulan (akordeon) untuk slip karyawan
function renderSlipKaryawan(list, box, rekapEl, printAll){
  rekapEl.hidden = printAll.hidden = !list.length;
  if (!list.length){ box.innerHTML = '<p class="meta">Belum ada slip gaji yang disimpan admin.</p>'; return; }
  const sum = k => list.reduce((s, x) => s + (x.hasil[k] || 0), 0);
  const tot = list.reduce((s, x) => s + x.bersih, 0), maks = Math.max(...list.map(x => x.bersih), 1);
  const awal = list[list.length - 1].label, akhir = list[0].label;
  rekapEl.innerHTML = `<div class="meta">Rekap ${fmtNum(list.length)} bulan · ${esc(awal)}${list.length > 1 ? " – " + esc(akhir) : ""}</div>
    <div class="meta" style="margin-top:6px">Total gaji bersih</div><div class="big">${rp(tot)}</div>
    <div class="grid4">
      <div><span class="meta">Total pendapatan</span><b>${rp(sum("bruto"))}</b></div>
      <div><span class="meta">Total potongan</span><b>${rp(sum("potongan"))}</b></div>
      <div><span class="meta">Rata-rata / bulan</span><b>${rp(tot / list.length)}</b></div>
      <div><span class="meta">Total lembur</span><b>${fmtNum(sum("jamLembur"))} jam</b></div>
    </div>`;
  printAll.onclick = () => {
    if (!cetakSlips(list.map(x => ({ r: x.hasil, nama: x.nama, periode: x.label })), "Slip Gaji " + list[0].nama + " " + list.length + " bulan", ptSaya))
      toast("Izinkan pop-up untuk mencetak slip.");
  };
  box.replaceChildren(...list.map((x, i) => {
    const row = document.createElement("div"); row.className = "mrow";
    const id = "mb-" + x.periode;
    row.innerHTML = `<button class="mhead" aria-expanded="false" aria-controls="${id}">
        <span>${esc(x.label)}</span><span class="amt">${rp(x.bersih)}</span><span class="chev" aria-hidden="true">›</span>
        <span class="bar"><i style="width:${Math.round(x.bersih / maks * 100)}%"></i></span></button>
      <div class="mbody" id="${id}" hidden></div>`;
    const head = row.querySelector(".mhead"), body = row.querySelector(".mbody");
    head.onclick = () => {
      const buka = body.hidden;
      box.querySelectorAll(".mrow.open").forEach(o => {          // hanya satu bulan terbuka
        o.classList.remove("open"); o.querySelector(".mbody").hidden = true; o.querySelector(".mhead").setAttribute("aria-expanded", "false");
      });
      if (!buka) return;
      if (!body.innerHTML){
        body.innerHTML = `<div class="meta">Hadir ${fmtNum(x.hasil.hadirKerja)}/${fmtNum(x.hasil.hariKerja)} hari · Telat ${fmtNum(x.hasil.kaliTelat)}x · Lembur ${fmtNum(x.hasil.jamLembur)} jam</div>
          ${rincianHTML(x.hasil, false)}
          <div class="btns"><button class="small alt b-tutup">Tutup</button><button class="small b-cetak">Cetak slip</button></div>`;
        body.querySelector(".b-cetak").onclick = () => { if (!cetakSlip(x.hasil, x.nama, x.label, ptSaya)) toast("Izinkan pop-up untuk mencetak slip."); };
        body.querySelector(".b-tutup").onclick = () => {
          body.hidden = true; row.classList.remove("open"); head.setAttribute("aria-expanded", "false");
          head.scrollIntoView({ block: "nearest", behavior: "smooth" }); head.focus({ preventScroll: true });
        };
      }
      body.hidden = false; row.classList.add("open"); head.setAttribute("aria-expanded", "true");
      head.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    return row;
  }));
}

// Pinjaman saya: ditampilkan di bawah daftar slip
async function loadPinjamanSaya(){
  const el = $("#pj-saya"); if (!el) return;
  try{
    const snap = await getDocs(query(C("pinjaman"), where("uid", "==", me.uid)));
    const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.status !== "batal");
    const n = new Date(), ym = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0");
    el.innerHTML = pinjamanHTML(list, ym);
  }catch(e){ el.innerHTML = ""; }
}
async function loadSlips(){
  loadPinjamanSaya();
  const box = $("#s-list");
  try{
    const snap = await getDocs(query(C("slips"), where("uid", "==", me.uid),
      where("periode", ">=", ym12()), orderBy("periode", "desc")));
    renderSlipKaryawan(snap.docs.map(d => d.data()), box, $("#s-total"), $("#s-print-all"));
  }catch(e){ box.innerHTML = '<p class="meta">Gagal memuat slip: ' + (e.code || e.message) + '</p>'; }
}

/* ---------- Pengingat absen pulang: "Masih lembur" / "Lupa absen pulang" ----------
   Datang dari tombol notifikasi (URL ?pengingat=), notifikasi saat aplikasi terbuka, atau otomatis
   saat aplikasi dibuka lewat 2 jam setelah jam pulang kerja dan absen masuk belum ditutup. */
const fnJawab = httpsCallable(getFunctions(app, "asia-southeast2"), "jawabPengingat");
// jadwal pulang = tanggal absen masuk pada jam pulang kerja (shift malam -> besoknya)
function jadwalPulangSaya(r){
  const t = tsOf(r), [h, m] = String(jamKerjaSaya().pulang || "17:00").split(":").map(Number), j = new Date(t);
  j.setHours(h, m || 0, 0, 0); while (j <= t) j.setDate(j.getDate() + 1);
  return j;
}
let pengingatTertunda = null, sedangMenjawab = false;
// dialog dengan beberapa pilihan; ketuk di luar / Esc = tidak memilih (null)
function pilihDialog(pesan, pilihan){
  return new Promise(selesai => {
    const latar = document.createElement("div"); latar.className = "dialog-latar";
    latar.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true"><p class="dialog-teks"></p><div class="dialog-aksi"></div></div>`;
    latar.querySelector(".dialog-teks").textContent = pesan;
    const tutup = h => { document.removeEventListener("keydown", esc); latar.classList.add("tutup"); setTimeout(() => latar.remove(), 150); selesai(h); };
    const esc = e => { if (e.key === "Escape") tutup(null); };
    pilihan.forEach(([k, label], i) => { const b = document.createElement("button"); b.type = "button";
      b.className = i === pilihan.length - 1 ? "dialog-ya" : "dialog-tidak"; b.dataset.k = k; b.textContent = label; b.onclick = () => tutup(k);
      latar.querySelector(".dialog-aksi").append(b); });
    latar.onclick = e => { if (e.target === latar) tutup(null); };
    document.addEventListener("keydown", esc); document.body.append(latar); latar.querySelector(".dialog-ya").focus();
  });
}
async function tanganiPengingat(jawab, masukId){
  if (!me || !profile || !absenTerakhir){ pengingatTertunda = { jawab, masukId }; return; }
  pengingatTertunda = null;
  const r = masukTerbuka();
  if (!r || (masukId && r._id !== masukId)){ if (masukId) msg($("#msg"), "Absen ini sudah ditutup. Tidak ada yang perlu dilakukan.", "ok"); return; }
  if (sedangMenjawab) return;
  const jadwal = jadwalPulangSaya(r), jamP = fmtJam(jadwal);
  try{ sessionStorage.setItem("absen:tanya:" + r._id, "1"); }catch(e){}
  const jk = jamKerjaSaya(), jamKerja = String(jk.masuk).replace(":", ".") + " - " + String(jk.pulang).replace(":", ".");
  // pilih dulu (kalau belum), lalu konfirmasi "Anda memilih ..." OK / Batal; Batal -> kembali ke pilihan
  for (;;){
    if (jawab !== "lembur" && jawab !== "lupa"){
      bunyiNotif();
      jawab = await pilihDialog(`Kamu belum absen Pulang (Jam kerja anda ${jamKerja}). Anda Lembur atau Lupa Absen Pulang?`,
        [["lembur", "Lembur"], ["lupa", "Absen Pulang"]]);
      if (!jawab) return;                                    // ditutup tanpa memilih
    }
    if (jawab === "lembur") break;                           // Lembur langsung disimpan (dari tombol notifikasi pun), tanpa konfirmasi lagi
    const ok = await pilihDialog("Anda memilih Absen Pulang.", [["batal", "Batal"], ["ok", "OK"]]);
    if (ok === "ok") break;
    jawab = "tanya";                                         // Batal -> tampilkan pilihan lagi
  }
  sedangMenjawab = true;
  try{
    if (jawab === "lembur"){
      jawabLembur = true; aturTombolAbsen();
      msg($("#msg"), "Menyimpan jawaban Lembur…");
      // jawaban HARUS tersimpan di server; kalau gagal (sinyal), disimpan di HP dan dikirim ulang otomatis
      simpanLemburTertunda(CID, r._id);
      if (await kirimLembur(CID, r._id)){
        msg($("#msg"), "Lembur tersimpan. Lembur dihitung dari jam absen pulangmu nanti, jangan lupa absen pulang.", "ok");
        catatLog(CID, me.uid, profile, "pengingat", "Menjawab pengingat absen pulang: Lembur");
      } else msg($("#msg"), "Jawaban Lembur BELUM terkirim (periksa internet). Aplikasi akan mengirim ulang otomatis; biarkan aplikasi terbuka sebentar saat ada sinyal.", "bad");
    } else if (jawab === "lupa"){
      msg($("#msg"), "Mencatat absen pulang…");
      const h = await fnJawab({ cid: CID, masukId: r._id, jawab: "lupa" });
      msg($("#msg"), h.data?.sudah ? "Absen ini sudah ditutup." : "Absen pulang dicatat jam " + (h.data?.jam || jamP) + " (jam pulang kerja). Lembur tidak dihitung. Absen Masuk sudah bisa dipakai lagi.", "ok");
    }
  }catch(e){ msg($("#msg"), "Gagal: " + (e.message || e.code) + " Coba lagi sebentar lagi.", "bad"); }
  finally{ sedangMenjawab = false; }
}
// Jawaban "Lembur" yang belum sampai ke server: disimpan di HP, dikirim ulang (maks. 3x per percobaan)
const KUNCI_LEMBUR = "absen:lemburTertunda";
function simpanLemburTertunda(cid, masukId){ try{ localStorage.setItem(KUNCI_LEMBUR, JSON.stringify({ cid, masukId, t: Date.now() })); }catch(e){} }
async function kirimLembur(cid, masukId){
  for (let i = 0; i < 3; i++){
    try{ await fnJawab({ cid, masukId, jawab: "lembur" }); try{ localStorage.removeItem(KUNCI_LEMBUR); }catch(e){} return true; }
    catch(e){ if (["functions/not-found", "functions/permission-denied", "functions/invalid-argument"].includes(e.code)){ try{ localStorage.removeItem(KUNCI_LEMBUR); }catch(x){} return false; }
      await new Promise(ok => setTimeout(ok, 2000 * (i + 1))); }
  }
  return false;
}
async function kirimUlangLembur(){
  let p = null; try{ p = JSON.parse(localStorage.getItem(KUNCI_LEMBUR) || "null"); }catch(e){}
  if (!p || !me || !navigator.onLine) return;
  if (Date.now() - p.t > 2 * 864e5){ try{ localStorage.removeItem(KUNCI_LEMBUR); }catch(e){} return; }
  if (await kirimLembur(p.cid, p.masukId)) msg($("#msg"), "Jawaban Lembur sudah terkirim ke server.", "ok");
}
addEventListener("online", kirimUlangLembur);
// tanya otomatis sekali per absen masuk kalau sudah lewat 2 jam dari jam pulang kerja
function cekTanyaPengingat(){
  kirimUlangLembur();
  if (pengingatTertunda){ const p = pengingatTertunda; tanganiPengingat(p.jawab, p.masukId); return; }
  const r = masukTerbuka(); if (!r || !aturanGaji || sedangMenjawab || masukHariLibur(r)) return;
  let sudah = false; try{ sudah = sessionStorage.getItem("absen:tanya:" + r._id) === "1"; }catch(e){}
  if (!sudah && Date.now() >= jadwalPulangSaya(r).getTime() + 2 * 3600e3) tanganiPengingat("tanya", r._id);
}
setInterval(cekTanyaPengingat, 5 * 60e3);
{ // dari URL (tombol notifikasi saat aplikasi tertutup)
  const u = new URL(location.href), j = u.searchParams.get("pengingat");
  if (j){ pengingatTertunda = { jawab: ["lupa", "lembur"].includes(j) ? j : "tanya", masukId: u.searchParams.get("m") || "" };
    ["pengingat", "m", "c"].forEach(k => u.searchParams.delete(k)); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); }
}
navigator.serviceWorker?.addEventListener("message", e => { if (e.data?.pengingat) tanganiPengingat(e.data.pengingat, e.data.masukId); });
window.addEventListener("pengingat-pulang", e => tanganiPengingat(e.detail?.pengingat || "tanya", e.detail?.masukId));

// Aplikasi selesai dimuat tanpa error
window.__appSiap = true; try{ sessionStorage.removeItem("__perbaiki"); }catch(e){}
