import { onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider,
  setPersistence, browserLocalPersistence, browserSessionPersistence }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref as sRefB, uploadBytesResumable as unggahB, deleteObject as hapusB } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { storage as storageB } from "./common.js";
import { VERSI_APP, pantauVersiBaru, pasangPilihBulan } from "./common.js";
import { pasangPajak } from "./pajak.js";
import { masaAktif, teksHabis, tsAkhirHari, tambahHari, tambahBulan, hariIniIso, WA_PENJUAL, WA_PENJUAL_LINK } from "./common.js";
// update paksa: dicek saat dibuka, tiap 5 menit, dan saat tab dibuka lagi; ditunda bila ada jendela terbuka / isian gaji belum disimpan
pantauVersiBaru(() => !!document.querySelector(".modal, .dialog-latar, #g-users .emp-card[data-ubah=\"1\"]"), { saatKembali: true });
import { deleteDoc, limit } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { doc, getDoc, getDocs, setDoc, updateDoc, writeBatch, collection, query, where, orderBy, onSnapshot, serverTimestamp, Timestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { notifAktif, disableNotif, catatLog, tandaiLogin, jenisMasuk, tanya } from "./common.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import { app } from "./common.js";
import { kompres, LAMPIRAN_MAX } from "./common.js";
import { daftarLampiran, keEmail, pasangMata, masukUsername, validKode, kodeTerakhir, validUsername, buatAkun, alamatDari } from "./common.js";
import { jamValid, dmyKeIso, pasangKetikTanggal, pasangTanggalMedium, tglMedium, tglMediumHari } from "./common.js";
import { bacaTabel, buatXlsx, buatXlsxGaya } from "./excel.js";
import { auth, db, $, msg, toast, jenis, tsOf, fmtWaktu, fmtJam, STATUS, authError, enableNotif, refreshNotif, fmtNum, parseDec, parseInt0 } from "./common.js";
import { gajiPeriode, nilaiKolom, nilaiWarisan, LUPA_ABSEN, PTKP, kategoriTER } from "./payroll.js";
import { kopHTML, KOP_CSS, rentangPeriode, dayKey, daftarLibur, tahunLibur, jadwalPinjaman, angsuranPeriode, statusPinjaman, ymTambah, ymLabel, KOLOM_PINJAMAN } from "./payroll.js";
import { ATURAN_DEFAULT, hitungGaji, rincianHTML, cetakSlip, cetakSlips, kopCV, rp, esc, namaBulan, ym12, bersihkan, rentang, hariKerjaAntara, cutiTerpakai } from "./payroll.js";

// Versi HTML & JS harus sama; kalau beda (cache campur, mis. HTML lama + JS baru) -> hapus cache & muat ulang sekali
{ const vH = document.querySelector('meta[name="versi-app"]')?.content;
  if (vH !== VERSI_APP){
    let sudah = true; try{ sudah = sessionStorage.getItem("__perbaiki") === "1"; if (!sudah) sessionStorage.setItem("__perbaiki", "1"); }catch(e){}
    if (!sudah){ const ulang = () => location.reload(); (window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve()).then(ulang, ulang); }
  } }

let CID = "", perusahaan = null, daftarPT = [];               // perusahaan aktif
const C = (...p) => collection(db, "companies", CID, ...p);
const D = (...p) => doc(db, "companies", CID, ...p);
const isAdmin = () => ["admin", "superadmin"].includes(profile?.role);
const isSuper = () => profile?.role === "superadmin";
// ubah / hapus absen: superadmin, atau admin yang diberi izin oleh superadmin (Edit karyawan > "Boleh ubah & hapus absen")
const bisaEditAbsen = () => isSuper() || (profile?.role === "admin" && profile?.bolehEditAbsen === true);
// Akses menu Gaji per admin (diatur superadmin di Edit karyawan): kosong = semua. aksesGaji: hitung/riwayat/karyawan/pinjaman/aturan/pajak
const AKSES_GAJI = [["hitung", "Hitung gaji"], ["riwayat", "Riwayat slip"], ["karyawan", "Data gaji karyawan"], ["pinjaman", "Pinjaman"], ["aturan", "Aturan gaji"], ["pajak", "Pajak & BPJS"]];
const AKSES_MENU = [["izin","Persetujuan"],["hari","Laporan"],["kar","Karyawan"],["kios","Mode kios"]];
const bolehMenu = t => isSuper() || profile?.role !== "admin" || !Array.isArray(profile?.aksesMenu) || profile.aksesMenu.includes(t);
const bolehGaji = sub => isSuper() || !Array.isArray(profile?.aksesGaji) || profile.aksesGaji.includes(sub);
// Group CV yang boleh dilihat di Gaji & Pajak (kosong = semua; "-" = tanpa Group CV)
// admin yang dibatasi Group CV: tiap tulis gaji dicek server per karyawan (maks. ~20 cek per batch) → batch dibuat kecil
const BATCH_GAJI = () => !isSuper() && Array.isArray(profile?.aksesCV) ? 15 : 400;
const cvBoleh = u => isSuper() || !Array.isArray(profile?.aksesCV) || profile.aksesCV.includes(u?.grupCV || "-");
let me = null, profile = null, subs = [], firstLoad = true;
// Cek HP (dipakai saat login/logout, jadi dideklarasikan paling awal)
let cekHPData = [], cekHPTerakhir = {}, cekHPMuat = null, cekHPGagal = "";

pasangMata($("#f-eye"), $("#f-pass"));
$("#auth-form").onsubmit = async e => {
  e.preventDefault();
  const m = $("#auth-msg"), user = $("#f-user").value.trim(), pass = $("#f-pass").value;
  if (!user || !pass){ msg(m, "Isi username dan password.", "bad"); return; }
  $("#f-go").disabled = true; msg(m, "Memproses…");
  try{
    await setPersistence(auth, $("#f-ingat").checked ? browserLocalPersistence : browserSessionPersistence);
    tandaiLogin();
    await masukUsername((e, p) => signInWithEmailAndPassword(auth, e, p), "", user, pass);
    msg(m, ""); $("#f-pass").value = "";
  }catch(err){ console.error("Login gagal", err?.code, err); msg(m, authError(err), "bad"); }
  $("#f-go").disabled = false;
};
// Ganti password akun yang sedang login (semua peran, termasuk superadmin)
$("#ps-simpan").onclick = async e => {
  const m = $("#ps-msg"), lama = $("#ps-lama").value, baru = $("#ps-baru").value;
  if (!lama){ msg(m, "Isi password sekarang.", "bad"); return; }
  if (baru.length < 8){ msg(m, "Password baru minimal 8 karakter.", "bad"); return; }
  if (baru !== $("#ps-ulang").value){ msg(m, "Ulangi password baru tidak sama.", "bad"); return; }
  if (baru === lama){ msg(m, "Password baru harus berbeda dari yang sekarang.", "bad"); return; }
  e.target.disabled = true; msg(m, "Menyimpan…");
  try{
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, lama));
    await updatePassword(auth.currentUser, baru);
    ["#ps-lama", "#ps-baru", "#ps-ulang"].forEach(s => $(s).value = "");
    catatLog(CID, me.uid, profile, "akun", "Mengganti password akun sendiri");
    msg(m, "Password berhasil diganti. Pakai password baru saat login berikutnya.", "ok");
  }catch(err){
    const c = err.code || "";
    msg(m, c.includes("wrong-password") || c.includes("invalid-credential") ? "Password sekarang salah." : c.includes("too-many") ? "Terlalu banyak percobaan. Coba lagi nanti." : "Gagal: " + (c || err.message), "bad");
  }
  e.target.disabled = false;
};
$("#logout").onclick = async () => { await catatLog(CID, me?.uid, profile, "logout", "Logout dari dashboard admin"); try{ sessionStorage.removeItem("absen:dicatat"); }catch(e){} signOut(auth); };

onAuthStateChanged(auth, user => { masukAdmin(user).catch(gagalMuat).finally(() => $("#memuat")?.remove()); });
async function masukAdmin(user){
  subs.forEach(u => u()); subs = []; firstLoad = true; cekHPMuat = null;
  me = user;
  if (!user){ $("#app-view").hidden = true; $("#auth-view").hidden = false; return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  profile = snap.exists() ? snap.data() : null;
  if (!profile || !["admin", "supervisor", "superadmin"].includes(profile.role)){
    await signOut(auth);
    msg($("#auth-msg"), "Akun ini bukan admin atau supervisor.", "bad");
    return;
  }
  if (profile.aktif === false){
    await signOut(auth); msg($("#auth-msg"), "Akun ini dinonaktifkan. Hubungi admin.", "bad"); return;
  }
  if (!isSuper() && !profile.cid){
    await signOut(auth);
    msg($("#auth-msg"), "Akun ini belum terhubung ke perusahaan.", "bad");
    return;
  }
  // Perusahaan aktif: superadmin bisa memilih, yang lain sesuai akunnya
  if (isSuper()){
    const ps = await getDocs(collection(db, "companies"));
    daftarPT = ps.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    let pilih = ""; try{ pilih = localStorage.getItem("absen:cidAktif") || ""; }catch(e){}
    CID = daftarPT.find(x => x.id === pilih)?.id || daftarPT[0]?.id || "";
  } else CID = profile.cid;
  perusahaan = null;
  if (CID){ try{ const co = await getDoc(doc(db, "companies", CID)); if (co.exists()) perusahaan = { id: CID, ...co.data() }; }catch(e){} }
  // masa coba / langganan habis -> admin & supervisor tidak bisa masuk (superadmin tetap bisa)
  if (!isSuper() && masaAktif(perusahaan).habis){ await signOut(auth); msg($("#auth-msg"), teksHabis(perusahaan), "bad"); return; }
  tampilMasaAktif();
  $("#who").textContent = profile.nama + (perusahaan ? " · " + perusahaan.nama : "");
  tampilLogo();
  const jm = jenisMasuk();
  if (jm && CID) catatLog(CID, user.uid, profile, jm, jm === "login" ? "Login ke dashboard admin" : "Membuka dashboard admin");
  $("#role").textContent = { admin: "Admin", supervisor: "Supervisor", superadmin: "Superadmin" }[profile.role];
  $("#ps-akun").textContent = profile.nama + " (@" + (profile.username || (user.email || "").split("@")[0]) + ", " + ({ admin: "Admin", supervisor: "Supervisor", superadmin: "Superadmin" }[profile.role] || profile.role) + ")";
  $("#auth-view").hidden = true; $("#app-view").hidden = false;
  $("#nav-pt").hidden = !isSuper();
  $("#nav-gaji").hidden = !isAdmin() || !CID || !["hitung", "riwayat", "karyawan", "pinjaman", "aturan"].some(bolehGaji);
  $("#nav-pajak").hidden = !isAdmin() || !CID || !bolehGaji("pajak");
  // sub-tab Gaji yang tidak diizinkan disembunyikan
  [["hitung", "sub-hitung"], ["riwayat", "sub-riwayat"], ["karyawan", "sub-karyawan"], ["pinjaman", "sub-pinjaman"], ["aturan", "sub-aturan"]].forEach(([k, s]) => {
    const b = document.querySelector(`#tab-gaji [data-s="${s}"]`); if (b) b.hidden = !bolehGaji(k); });
  { const aktif = document.querySelector('#tab-gaji .subtabs button[aria-selected="true"]');
    if (aktif?.hidden) setTimeout(() => document.querySelector('#tab-gaji .subtabs button:not([hidden])')?.click(), 0); }
  $("#nav-kar").hidden = !CID || !bolehMenu("kar");
  document.querySelector('nav button[data-tab="izin"]').hidden = !bolehMenu("izin");
  document.querySelector('nav button[data-tab="hari"]').hidden = !bolehMenu("hari");
  { const akt = document.querySelector("nav button[data-tab][aria-current]");   // tab yang sedang terbuka tidak diizinkan -> buka tab pertama yang boleh
    if (!akt || akt.hidden) setTimeout(() => document.querySelector("nav button[data-tab]:not([hidden])")?.click(), 0); }
  renderPerusahaan();
  terapkanKios();
  $("#nav-bk").hidden = !CID;   // BackUp manual: semua admin & supervisor (restore / histori tetap khusus superadmin)
  if (!CID){ document.querySelector('nav button[data-tab="pt"]').click(); return; }   // superadmin tanpa perusahaan
  listen();
  renderNotif();
  if (isAdmin()) initGaji();
  try{
    const kembali = sessionStorage.getItem("absen:kembaliTab");
    if (kembali){ sessionStorage.removeItem("absen:kembaliTab"); document.querySelector(`nav button[data-tab="${kembali}"]`)?.click(); }
  }catch(e){}
  renderPengguna();
  $("#tab-log-btn").hidden = !isAdmin(); $("#tab-cekhp-btn").hidden = !isAdmin();
  if (isAdmin()) muatCekHPData().then(() => { if (pengguna.length) renderPengguna(); });
  $("#demo-wrap").hidden = !isAdmin();
  if (!isAdmin()) try{ localStorage.removeItem("absen:notifMati"); }catch(e){}
  refreshNotif(user.uid, profile.role, CID, renderNotif).then(renderNotif);
}
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


// Menu Pajak & BPJS (modul terpisah: pajak.js)
const ctxPajak = { CID: () => CID, me: () => me, profile: () => profile, popup: (...a) => popup(...a), cvBoleh: u => cvBoleh(u),
  unduh: (blob, nama) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1500); } };
// Pajak & BPJS -> Gaji: potongan sudah dikirim, hitung ulang gaji bulan itu lalu tawarkan simpan slip ke semua karyawan
ctxPajak.kirimSlip = async ym => {
  const pSnap = await getDocs(C("payroll")); gajiMap = Object.fromEntries(pSnap.docs.map(d => [d.id, d.data()]));
  document.querySelector('nav button[data-tab="gaji"]')?.click();
  document.querySelector('#tab-gaji [data-s="sub-hitung"]')?.click();
  $("#g-bulan").value = ym; $("#g-bulan").dispatchEvent(new Event("change"));
  $("#g-hitung").click();
  await new Promise(ok => { const t0 = Date.now(), cek = setInterval(() => { if (!$("#g-hitung").disabled || Date.now() - t0 > 30000){ clearInterval(cek); ok(); } }, 150); });
  if (hasil.length && curYM === ym) $("#g-save-all").click();
};
pasangPajak(ctxPajak);
$("#g-kepajak").onclick = async () => {
  if (!hasilT().length) return;
  const daftar = hasilT().map(({ u, r }) => ({ uid: u.uid, gaji: r.bruto }));
  document.querySelector('nav button[data-tab="pajak"]')?.click();
  await ctxPajak.saatBuka?.();
  await ctxPajak.terimaDariGaji(curYM, daftar);
  catatLog(CID, me.uid, profile, "ubah", "Mengirim gaji " + periode + " ke Pajak & BPJS (" + daftar.length + " karyawan)");
};
document.querySelector('nav button[data-tab="pajak"]')?.addEventListener("click", () => ctxPajak.saatBuka?.());
document.querySelectorAll("nav button[data-tab]").forEach(b => b.onclick = () => {
  document.querySelectorAll("nav button[data-tab]").forEach(x => x.removeAttribute("aria-current"));
  b.setAttribute("aria-current", "page");
  document.querySelectorAll("section").forEach(s => s.classList.remove("on"));
  $("#tab-" + b.dataset.tab).classList.add("on");
  if (b.dataset.tab === "atur") renderAksesAdmin();
});

/* ---------- Pengaturan > Akses admin: daftar admin + tombol Akses Menu per admin (khusus superadmin) ---------- */
const AKSES_CV = () => [...daftarCV.map(c => [c.id, c.nama]), ["-", "Tanpa CV"]];
function ringkasAkses(u){
  const tot = AKSES_MENU.length + AKSES_GAJI.length, n = (Array.isArray(u.aksesMenu) ? u.aksesMenu.length : AKSES_MENU.length) + (Array.isArray(u.aksesGaji) ? u.aksesGaji.length : AKSES_GAJI.length);
  const m = n === tot ? "semua menu" : n + "/" + tot + " menu";
  const c = Array.isArray(u.aksesCV) ? (u.aksesCV.length ? AKSES_CV().filter(([id]) => u.aksesCV.includes(id)).map(([, n]) => n).join(", ") : "tanpa CV") : "semua CV";
  return m + " · " + c;
}
function renderAksesAdmin(){
  const wrap = $("#akses-wrap"); if (!wrap) return;
  wrap.hidden = !isSuper() || !CID; if (wrap.hidden) return;
  const daftar = pengguna.filter(u => (u.role === "admin" || u.role === "superadmin") && u.aktif !== false);
  if (!daftar.some(u => u.id === me.uid)) daftar.push({ id: me.uid, nama: profile?.nama || "Saya", username: profile?.username || "", role: "superadmin" });
  daftar.sort((a, b) => (a.role === "superadmin") - (b.role === "superadmin") || (a.nama || "").localeCompare(b.nama || ""));
  $("#akses-tbl").innerHTML = `<table class="mf-tbl akses-tbl"><thead><tr><th>No</th><th>Nama</th><th>Peran</th><th>Akses</th><th class="r">Aksi</th></tr></thead><tbody>
    ${daftar.map((u, i) => { const sup = u.role === "superadmin";
      return `<tr><td>${i + 1}</td><td><b>${esc(u.nama || "")}</b>${u.id === me.uid ? ' <span class="ak-anda">(Anda)</span>' : ""}<small>@${esc(u.username || "")}</small></td>
      <td><span class="ak-badge ${sup ? "sup" : ""}">${sup ? "Superadmin" : "Admin"}</span></td>
      <td class="meta">${sup ? "selalu semua" : esc(ringkasAkses(u))}</td>
      <td class="r">${sup ? "" : `<button type="button" class="ak-btn" data-uid="${esc(u.id)}">☰ Akses Menu</button>`}</td></tr>`; }).join("")}
    </tbody></table>${daftar.some(u => u.role === "admin") ? "" : '<p class="meta">Belum ada akun admin. Ubah peran karyawan menjadi Admin di menu Karyawan.</p>'}`;
  $("#akses-tbl").querySelectorAll(".ak-btn").forEach(b => b.onclick = () => bukaAksesMenu(pengguna.find(u => u.id === b.dataset.uid), b));
}
function bukaAksesMenu(u, tombol){
  if (!u || !isSuper()) return;
  const cek = (arr, v) => !Array.isArray(arr) || arr.includes(v);
  const f = document.createElement("div"); f.className = "manual-form ak-form";
  f.innerHTML = `<p class="meta" style="margin:6px 0 10px">Centang yang boleh dibuka <b>${esc(u.nama)}</b>.</p>
    <b class="ak-judul">Menu utama</b><div class="ak-grid">${AKSES_MENU.map(([k, l]) => `<label><input type="checkbox" class="ak-u" value="${k}" ${cek(u.aksesMenu, k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
    <b class="ak-judul">Menu Gaji &amp; Pajak</b><div class="ak-grid">${AKSES_GAJI.map(([k, l]) => `<label><input type="checkbox" class="ak-m" value="${k}" ${cek(u.aksesGaji, k) ? "checked" : ""}> ${esc(l)}</label>`).join("")}</div>
    <b class="ak-judul">Group CV yang boleh dilihat</b><div class="ak-grid">${AKSES_CV().map(([id, n]) => `<label><input type="checkbox" class="ak-cv" value="${esc(id)}" ${cek(u.aksesCV, id) ? "checked" : ""}> ${esc(n)}</label>`).join("")}</div>
    <div class="btns" style="margin-top:14px"><button type="button" class="small ak-simpan">Simpan</button><button type="button" class="small alt ak-batal">Batal</button></div>
    <div class="msg" role="status"></div>`;
  document.body.append(f);
  f.querySelector(".ak-batal").onclick = () => { f.hidden = true; };
  f.querySelector(".ak-simpan").onclick = async () => {
    const m = f.querySelector(".msg");
    const ms = [...f.querySelectorAll(".ak-m")], cs = [...f.querySelectorAll(".ak-cv")], us = [...f.querySelectorAll(".ak-u")];
    const au = us.every(c => c.checked) ? null : us.filter(c => c.checked).map(c => c.value);
    const ag = ms.every(c => c.checked) ? null : ms.filter(c => c.checked).map(c => c.value);
    const ac = cs.every(c => c.checked) ? null : cs.filter(c => c.checked).map(c => c.value);
    msg(m, "Menyimpan…");
    try{
      await updateDoc(doc(db, "users", u.id), { aksesMenu: au, aksesGaji: ag, aksesCV: ac }); u.aksesMenu = au; u.aksesGaji = ag; u.aksesCV = ac;
      catatLog(CID, me.uid, profile, "akun", "Mengubah akses Gaji/Pajak admin " + u.nama + ": " + ringkasAkses(u));
      f.hidden = true; renderAksesAdmin(); msg($("#akses-msg"), "Akses " + u.nama + " tersimpan. Berlaku saat admin itu membuka / memuat ulang aplikasi.", "ok");
    }catch(e){ msg(m, "Gagal menyimpan: " + (e.code === "permission-denied" ? "jalankan deploy-rules.bat dulu." : e.code || e.message), "bad"); }
  };
  popup(f, "Akses Menu · " + u.nama, tombol);
}

function listen(){
  // Permintaan yang menunggu, realtime
  const qIzin = query(C("absensi"), where("status", "==", "menunggu"), orderBy("ts", "desc"));
  let pAbsen = [], pCuti = [], awal = { a: true, c: true };
  const renderPending = () => {
    const all = [...pAbsen.map(d => ({ d, t: tsOf(d.data({serverTimestamps:"estimate"})), f: renderCard })),
                 ...pCuti.map(d => ({ d, t: tsOf(d.data({serverTimestamps:"estimate"})), f: renderCutiCard }))].sort((a, b) => b.t - a.t);
    $("#izin-count").textContent = all.length ? fmtNum(all.length) + " permintaan menunggu keputusan." : "Tidak ada permintaan yang menunggu.";
    $("#izin-list").replaceChildren(...all.map(x => x.f(x.d)));
  };
  subs.push(onSnapshot(qIzin, snap => {
    if (!awal.a) snap.docChanges().forEach(ch => { if (ch.type === "added") toast("Permintaan absen dari " + ch.doc.data().nama); });
    awal.a = false; pAbsen = snap.docs; renderPending();
  }, e => msg($("#msg2"), "Gagal memuat: " + e.code, "bad")));
  const qCuti = query(C("izin"), where("status", "==", "menunggu"), orderBy("ts", "desc"));
  subs.push(onSnapshot(qCuti, snap => {
    if (!awal.c) snap.docChanges().forEach(ch => { if (ch.type === "added") toast("Pengajuan " + ch.doc.data().jenis + " dari " + ch.doc.data().nama); });
    awal.c = false; pCuti = snap.docs; renderPending();
  }, e => msg($("#msg2"), "Gagal memuat: " + e.code, "bad")));

  // Semua absen hari ini
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const qHari = query(C("absensi"), where("ts", ">=", Timestamp.fromDate(start)), orderBy("ts", "desc"));
  subs.push(onSnapshot(qHari, snap => { hariLive = snap.docs; if (hrHariIni()) tampilHari(hariLive); }));

  // Metode verifikasi
  subs.push(onSnapshot(D("settings", "verifikasi"), x => {
    $("#metode").value = x.exists() ? (x.data().metode || "salah") : "salah";
    $("#kios-sah").checked = x.exists() ? x.data().kiosSah !== false : true;
    $("#pulih-otomatis").checked = x.exists() && x.data().pulihOtomatis === true;
  }, () => {}));

  // Lokasi absen (banyak lokasi); kalau belum ada, ambil dari data lama "settings/kantor"
  subs.push(onSnapshot(D("settings", "lokasi"), async s => {
    if (s.exists()){ daftarLokasi = s.data().daftar || []; $("#akurasi").value = fmtNum(s.data().akurasi || 100); }
    else {
      const k = await getDoc(D("settings", "kantor")).catch(() => null);
      const kd = k?.exists() ? k.data() : null;
      daftarLokasi = kd ? [{ id: "kantor", nama: "Kantor", lat: kd.lat, lng: kd.lng, rad: kd.rad, alamat: kd.alamat || "" }] : [];
      if (kd) $("#akurasi").value = fmtNum(kd.akurasi || 100);
    }
    lokasiEdit = daftarLokasi.map(L => ({ ...L }));
    if (!$("#pengguna-wrap").hidden) renderLokasiTambah();
    if (!lokasiEdit.length) lokasiEdit.push({ id: lokId(), nama: "Kantor", lat: NaN, lng: NaN, rad: 100, alamat: "" });
    renderLokasi();
  }));
}

// Cara verifikasi sebuah absen: wajah / sidik jari / keduanya / kios / manual / import / lupa absen
function metodeAbsen(r, ikonSaja){
  if (r.import) return "📥 Import Excel";
  if (r.dariPengingat){
    // kapan kejadiannya: dijawab karyawan dari notifikasi, atau ditutup otomatis sistem (6 jam lewat jam pulang)
    const kp = r.decidedAt?.toDate ? r.decidedAt.toDate() : null;
    const jam = kp ? (tglMedium(kp) === tglMedium(tsOf(r)) ? fmtJam(kp) : tglMedium(kp) + " " + fmtJam(kp)) : "";
    if (r.tutupOtomatis) return "⏱️ Otomatis" + (jam ? " " + jam : "");
    return "🔔 Dijawab" + (jam ? " " + jam : "");
  }
  if (r.dariIzin) return "📋 Pengajuan · disetujui " + (r.by || "admin");
  if (r.manual) return "✍️ Manual admin";
  const w = r.face != null, j = !!r.finger;
  const teks = w && j ? "🙂 Wajah + 👆 Sidik jari" : w ? "🙂 Wajah" : j ? "👆 Sidik jari" : "📷 Selfie saja";
  return (r.kios ? "🖥️ Kios · " : "") + teks + (w && !ikonSaja ? " " + Math.round(r.face * 100) + "%" : "");
}
const jenisVerif = r => r.import || r.dariIzin || r.manual ? "lain" : r.face != null && r.finger ? "dua" : r.face != null ? "wajah" : r.finger ? "jari" : "lain";
function renderCard(x){
  const r = x.data({serverTimestamps:"estimate"});
  const card = document.createElement("div"); card.className = "card pending";
  const luar = r.dist > r.rad;
  card.insertAdjacentHTML("beforeend", r.kios ? `<div class="jenis-badge luar">🖥️ Absen via kios · ${esc(r.lokasi || "")}</div>`
    : `<div class="jenis-badge ${luar ? "luar" : "gps"}">${luar ? "📍 Absen di luar area" : "📶 GPS lemah"}</div>`);
  const dl = document.createElement("dl"); dl.className = "kv";
  [["Nama", r.nama], ["Jenis", jenis(r.type)], ["Waktu", fmtWaktu(tsOf(r))],
   ["Jarak", fmtNum(r.dist) + " m dari " + (r.lokasi || "kantor") + " (batas " + fmtNum(r.rad) + " m)"], ["Akurasi GPS", r.acc ? "±" + fmtNum(r.acc) + " m" + (r.gpsLemah ? " ⚠ lemah" : "") : "-"], ["Alamat", r.alamat || "-"], ["Verifikasi", metodeAbsen(r)], ["Alasan", r.alasan || "-"]].forEach(([k, v]) => {
    const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = k; dd.textContent = v; dl.append(dt, dd);
  });
  const dt = document.createElement("dt"), dd = document.createElement("dd"), a = document.createElement("a");
  dt.textContent = "Lokasi"; a.href = "https://maps.google.com/?q=" + r.la + "," + r.lo; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Buka di peta";
  dd.append(a); dl.append(dt, dd);
  tambahSelfie(dl, r);

  const lab = document.createElement("label"); lab.textContent = "Catatan (opsional)";
  const note = document.createElement("textarea"); note.rows = 2;
  const btns = document.createElement("div"); btns.className = "btns";
  const ok = document.createElement("button"); ok.textContent = "Terima"; ok.style.background = "var(--ok)"; ok.style.color = "#fff";
  const no = document.createElement("button"); no.textContent = "Tolak"; no.style.background = "var(--bad)"; no.style.color = "#fff";
  const decide = async status => {
    ok.disabled = no.disabled = true;
    try{
      await updateDoc(D("absensi", x.id), { status, by: profile.nama, byUid: me.uid, note: note.value.trim(), decidedAt: serverTimestamp() });
      toast("Absen " + r.nama + " " + (status === "terima" ? "diterima" : "ditolak") + ".");
    }catch(e){ toast("Gagal: " + (e.code === "permission-denied" ? "sudah diputuskan orang lain" : e.code)); ok.disabled = no.disabled = false; }
  };
  ok.onclick = () => decide("terima"); no.onclick = () => decide("tolak");
  btns.append(ok, no);
  card.append(dl, lab, note, btns);
  return card;
}

function renderNotif(){
  const on = notifAktif();
  $("#s-notif").textContent = on ? "Aktif" : "Tidak aktif";
  $("#s-notif").className = "state " + (on ? "ok" : "no");
  $("#notif-on").hidden = on && !isAdmin();             // supervisor: tidak bisa mematikan
  $("#notif-on").textContent = on ? "Nonaktifkan notifikasi" : "Aktifkan notifikasi";
  $("#notif-on").className = "small" + (on ? " alt" : "");
}
$("#notif-on").onclick = async () => {
  const b = $("#notif-on"); b.disabled = true;
  try{
    if (notifAktif()){
      if (!isAdmin()){ msg($("#msg2"), "Hanya admin yang bisa menonaktifkan notifikasi.", "bad"); b.disabled = false; return; }
      await disableNotif(); msg($("#msg2"), "Notifikasi dimatikan di perangkat ini.", "ok"); }
    else { await enableNotif(me.uid, profile.role, CID); msg($("#msg2"), "Notifikasi aktif di perangkat ini.", "ok"); }
  }catch(e){ msg($("#msg2"), e.message, "bad"); }
  b.disabled = false; renderNotif();
};

/* ---------- metode verifikasi ---------- */
$("#metode-simpan").onclick = async () => {
  const metode = $("#metode").value;
  try{ await setDoc(D("settings", "verifikasi"), { metode, kiosSah: $("#kios-sah").checked, pulihOtomatis: $("#pulih-otomatis").checked, diubah: serverTimestamp(), oleh: profile.nama });
       msg($("#msg2"), "Metode verifikasi disimpan: " + $("#metode").selectedOptions[0].textContent + ".", "ok"); }
  catch(e){ msg($("#msg2"), e.code === "permission-denied" ? "Hanya admin yang bisa mengubah metode verifikasi." : "Gagal: " + e.code, "bad"); }
};

/* ---------- lokasi absen (banyak lokasi) ---------- */
let daftarLokasi = [], lokasiEdit = [];
const lokId = () => Math.random().toString(36).slice(2, 8);
function bacaLokasi(){
  document.querySelectorAll("#lok-list .lok-card").forEach((el, i) => {
    const L = lokasiEdit[i]; if (!L) return;
    L.nama = el.querySelector('[data-f="nama"]').value.trim();
    L.lat = parseDec(el.querySelector('[data-f="lat"]').value);
    L.lng = parseDec(el.querySelector('[data-f="lng"]').value);
    L.rad = parseInt0(el.querySelector('[data-f="rad"]').value) || 100;
  });
}
function renderLokasi(){
  const box = $("#lok-list");
  box.replaceChildren(...lokasiEdit.map((L, i) => {
    const c = document.createElement("div"); c.className = "lok-card";
    c.innerHTML = `<div class="lok-head"><b>Lokasi ${i + 1}</b>
        ${lokasiEdit.length > 1 ? '<button type="button" class="small alt b-hapus">Hapus</button>' : ""}</div>
      <label>Nama lokasi</label><input data-f="nama" placeholder="contoh: Kantor Pusat, Gudang" value="${esc(L.nama || "")}">
      <div class="grid2">
        <div><label>Latitude</label><input data-f="lat" inputmode="decimal" data-num="dec" value="${isFinite(L.lat) ? fmtNum(L.lat, 6) : ""}"></div>
        <div><label>Longitude</label><input data-f="lng" inputmode="decimal" data-num="dec" value="${isFinite(L.lng) ? fmtNum(L.lng, 6) : ""}"></div>
      </div>
      <label>Radius absen (meter)</label><input data-f="rad" inputmode="numeric" data-num="int" value="${fmtNum(L.rad || 100)}">
      <p class="alamat-kantor" ${L.alamat ? "" : "hidden"}>📍 ${esc(L.alamat || "")}</p>
      <button type="button" class="small alt b-sini" style="margin-top:10px">Pakai lokasi saya</button>`;
    const alamatEl = c.querySelector(".alamat-kantor");
    const cariAlamat = async () => {
      bacaLokasi();
      if (!isFinite(L.lat) || !isFinite(L.lng)) return;
      alamatEl.hidden = false; alamatEl.textContent = "📍 Mencari alamat…";
      L.alamat = await alamatDari(L.lat, L.lng) || "";
      alamatEl.textContent = "📍 " + (L.alamat || "Alamat tidak ditemukan") + "  (belum disimpan)";
    };
    c.querySelector('[data-f="lat"]').addEventListener("change", cariAlamat);
    c.querySelector('[data-f="lng"]').addEventListener("change", cariAlamat);
    c.querySelector(".b-sini").onclick = () => {
      msg($("#msg2"), "Mencari lokasi…");
      navigator.geolocation.getCurrentPosition(p => {
        c.querySelector('[data-f="lat"]').value = fmtNum(p.coords.latitude, 6);
        c.querySelector('[data-f="lng"]').value = fmtNum(p.coords.longitude, 6);
        msg($("#msg2"), "Lokasi " + (L.nama || (i + 1)) + " terisi (akurasi ±" + fmtNum(p.coords.accuracy) + " m). Tekan Simpan semua lokasi.", "ok");
        cariAlamat();
      }, () => msg($("#msg2"), "Lokasi tidak bisa dibaca. Izinkan akses lokasi.", "bad"), { enableHighAccuracy: true, timeout: 15000 });
    };
    const hapus = c.querySelector(".b-hapus");
    if (hapus) hapus.onclick = async () => {
      bacaLokasi();
      if (!await tanya("Hapus lokasi " + (L.nama || (i + 1)) + "? Perubahan berlaku setelah Simpan semua lokasi.")) return;
      lokasiEdit.splice(i, 1); renderLokasi();
    };
    return c;
  }));
}
$("#lok-tambah").onclick = () => {
  bacaLokasi();
  lokasiEdit.push({ id: lokId(), nama: "", lat: NaN, lng: NaN, rad: 100, alamat: "" });
  renderLokasi();
  const kartu = document.querySelectorAll("#lok-list .lok-card"); kartu[kartu.length - 1].querySelector("input").focus();
};
$("#save-gps").onclick = async () => {
  bacaLokasi();
  const akurasi = parseInt0($("#akurasi").value) || 100;
  for (const [i, L] of lokasiEdit.entries()){
    if (!L.nama){ msg($("#msg2"), "Isi nama lokasi " + (i + 1) + ".", "bad"); return; }
    if (!isFinite(L.lat) || !isFinite(L.lng)){ msg($("#msg2"), "Isi latitude dan longitude untuk " + L.nama + ".", "bad"); return; }
  }
  const namaKembar = lokasiEdit.map(L => L.nama.toLowerCase()).find((n, i, a) => a.indexOf(n) !== i);
  if (namaKembar){ msg($("#msg2"), "Nama lokasi tidak boleh sama: " + namaKembar, "bad"); return; }
  $("#save-gps").disabled = true; msg($("#msg2"), "Menyimpan…");
  try{
    for (const L of lokasiEdit) if (!L.alamat) L.alamat = await alamatDari(L.lat, L.lng);
    const daftar = lokasiEdit.map(L => ({ id: L.id, nama: L.nama, lat: L.lat, lng: L.lng, rad: L.rad, alamat: L.alamat || "" }));
    await setDoc(D("settings", "lokasi"), { daftar, akurasi });
    // Salinan lokasi pertama untuk versi lama & fitur data demo
    await setDoc(D("settings", "kantor"), { lat: daftar[0].lat, lng: daftar[0].lng, rad: daftar[0].rad, akurasi, alamat: daftar[0].alamat });
    msg($("#msg2"), fmtNum(daftar.length) + " lokasi absen tersimpan.", "ok");
  }catch(e){ msg($("#msg2"), e.code === "permission-denied" ? "Hanya admin yang bisa mengubah lokasi absen." : "Gagal: " + e.code, "bad"); }
  $("#save-gps").disabled = false;
};
// Jam kerja karyawan (shift atau jam utama) diambil langsung dari server saat dibutuhkan
async function jamKerjaKaryawan(uid){
  const [u, a] = await Promise.all([getDoc(doc(db, "users", uid)), getDoc(D("settings", "payroll"))]);
  const A = { ...ATURAN_DEFAULT, ...(a.exists() ? a.data() : {}) }, S = (A.shifts || []).find(x => x.id === u.data()?.shift);
  const masuk = S?.masuk || A.jamMasuk || "08:00", pulang = S?.pulang || A.jamPulang || "17:00";
  return { masuk, pulang, shift: S?.nama || "", lintas: pulang <= masuk };
}
function renderCutiCard(x){
  const z = x.data();
  const card = document.createElement("div"); card.className = "card pending";
  const lama = hariKerjaAntara(z.mulai, z.selesai, aturan), lupa = LUPA_ABSEN[z.jenis];
  const JENIS = { sakit: ["sakit", "🤒 Sakit"], cuti: ["cuti", "🏖️ Cuti"], lupaMasuk: ["lupa", "🕘 Tidak bisa absen masuk"], lupaPulang: ["lupa", "🕔 Lupa absen pulang"] },
    [kls, lbl] = JENIS[z.jenis] || ["izin", "📝 Izin"];
  card.innerHTML = `<div class="jenis-badge ${kls}">${lbl}</div>
    <dl class="kv"><dt>Nama</dt><dd>${esc(z.nama)}</dd><dt>Tanggal</dt><dd>${esc(rentang({ ...z, jam: "" }))}</dd>
      ${lupa ? `<dt>Jam ${lupa}</dt><dd><b class="jam-lupa">${esc(z.jam || "-")}</b> <span class="meta jam-lupa-ket">(sesuai jam kerja · disetujui = tercatat sebagai absen ${lupa})</span></dd>`
        : `<dt>Lama</dt><dd>${fmtNum(lama)} hari kerja${lama ? "" : ' <span class="meta">(jatuh di hari libur)</span>'}</dd>`}
      ${z.jenis === "cuti" ? '<dt>Sisa cuti</dt><dd class="sisa-cuti">Menghitung…</dd>' : ""}<dt>Keterangan</dt><dd>${esc(z.alasan || "-")}</dd>
      <dt>Lampiran</dt><dd class="lamp-slot">${z.lampiran?.length ? "" : "Tidak ada"}</dd></dl>
    <label>Catatan (opsional)</label><textarea rows="2"></textarea>
    <div class="btns"><button style="background:var(--ok);color:#fff">Setujui</button><button style="background:var(--bad);color:#fff">Tolak</button></div>`;
  if (z.lampiran?.length) card.querySelector(".lamp-slot").append(daftarLampiran(z.lampiran));
  if (z.jenis === "cuti"){
    // sisa cuti tahunan karyawan ini (sebelum pengajuan ini disetujui)
    const tahun = z.mulai.slice(0, 4), jatah = +(aturan.jatahCuti ?? 12);
    getDocs(query(C("izin"), where("uid", "==", z.uid), where("status", "==", "terima"))).then(q => {
      const sisa = jatah - cutiTerpakai(q.docs.map(d => d.data()), tahun, aturan);
      card.querySelector(".sisa-cuti").innerHTML = `${fmtNum(sisa)} dari ${fmtNum(jatah)} hari (${tahun})` +
        (lama > sisa ? ' <span style="color:var(--bad);font-weight:700">· melebihi sisa cuti</span>' : "");
    }).catch(() => { card.querySelector(".sisa-cuti").textContent = "-"; });
  }
  // tidak bisa absen masuk: jam = saat pengajuan dikirim (jam server)
  const jamKirim = z.ts?.toDate ? fmtJam(z.ts.toDate()) : (z.jam || "-");
  if (lupa) jamKerjaKaryawan(z.uid).then(jk => {
    card.querySelector(".jam-lupa").textContent = lupa === "masuk" ? jamKirim : jk[lupa] + (lupa === "pulang" && jk.lintas ? " (keesokan harinya)" : "");
    card.querySelector(".jam-lupa-ket").textContent = lupa === "masuk" ? "(jam saat pengajuan dikirim · disetujui = tercatat sebagai absen masuk)"
      : "(sesuai jam kerja" + (jk.shift ? " shift " + jk.shift : "") + " · disetujui = tercatat sebagai absen " + lupa + ")";
    // lupa masuk: tanggal = hari pengajuan. Lupa pulang: boleh tanggal absen masuk sebelumnya yang belum ditutup (tidak boleh sesudah hari pengajuan)
    if (z.ts?.toDate){ const t = z.ts.toDate(); if (lupa === "pulang" && jk.lintas) t.setDate(t.getDate() - 1);
      if (lupa === "masuk" ? z.mulai !== dayKey(t) : z.mulai > dayKey(z.ts.toDate())) card.querySelector(".jam-lupa").insertAdjacentHTML("afterend",
        `<div class="lupa-peringatan">⚠️ Tanggal (${esc(tglMedium(z.mulai))}) tidak sama dengan hari pengajuan (${esc(tglMedium(t))}). Periksa sebelum menyetujui.</div>`); }
  }).catch(() => {});
  const [ok, no] = card.querySelectorAll(".btns button"), note = card.querySelector("textarea");
  const decide = async status => {
    ok.disabled = no.disabled = true;
    try{
      const keputusan = { status, by: profile.nama, byUid: me.uid, note: note.value.trim(), decidedAt: serverTimestamp() };
      if (lupa && status === "terima"){
        // Lupa absen disetujui: catat absen (status sah) di tanggal pengajuan pada JAM KERJA karyawan (bukan jam yang diketik)
        const jk = await jamKerjaKaryawan(z.uid), jamK = jk[lupa];
        const [y, mo, d] = z.mulai.split("-").map(Number), [h, mi] = String(jamK || "").split(":").map(Number);
        // tidak bisa absen masuk -> jam saat pengajuan dikirim (server); lupa pulang -> jam pulang kerja
        const waktu = lupa === "masuk" && z.ts?.toDate ? z.ts.toDate() : new Date(y, mo - 1, d + (lupa === "pulang" && jk.lintas ? 1 : 0), h, mi);
        if (!jamValid(jamK) || isNaN(waktu) || waktu > new Date()){ toast("Jam kerja " + (jamK || "-") + " pada tanggal itu belum lewat / tidak valid."); ok.disabled = no.disabled = false; return; }
        const bt = writeBatch(db);
        bt.update(D("izin", x.id), keputusan);
        bt.set(doc(C("absensi")), { uid: z.uid, nama: z.nama, type: lupa, status: "terima", ts: Timestamp.fromDate(waktu), manual: true, dariIzin: x.id,
          byUid: me.uid, by: profile.nama, alasan: "Lupa absen " + lupa + (z.alasan ? ": " + z.alasan : ""), decidedAt: serverTimestamp(),
          dist: 0, rad: 0, acc: 0, lokasi: "manual", device: "manual", live: false, foto: null, face: null, finger: false });
        await bt.commit();
      } else await updateDoc(D("izin", x.id), keputusan);
      toast("Pengajuan " + z.nama + " " + (status === "terima" ? "disetujui" : "ditolak") + ".");
    }catch(e){ toast("Gagal: " + (e.code === "permission-denied" ? "sudah diputuskan orang lain" : e.code)); ok.disabled = no.disabled = false; }
  };
  ok.onclick = () => decide("terima"); no.onclick = () => decide("tolak");
  return card;
}

// Daftar catatan absen (semua, urut waktu) untuk tanggal yang dipilih
function renderHariList(docs){
  $("#hari-list").replaceChildren(...docs.map(x => {
      const r = x.data({serverTimestamps:"estimate"});
      const li = document.createElement("li"), left = document.createElement("div");
      const t = document.createElement("div"); t.className = "t"; t.textContent = r.nama;
      const s = document.createElement("small");
      s.textContent = r.manual && !r.la ? fmtJam(tsOf(r)) + " · lokasi: " + (r.lokasi && r.lokasi !== "manual" ? r.lokasi : "-") + ", dicatat oleh " + (r.by || "admin") : fmtJam(tsOf(r)) + ", " + fmtNum(r.dist) + " m dari " + (r.lokasi || "kantor") + (r.acc ? " (GPS ±" + fmtNum(r.acc) + " m" + (r.gpsLemah ? " ⚠" : "") + ")" : "") + (r.alamat ? " · " + r.alamat : "") + (r.by ? ", oleh " + r.by : "")
        + (r.live === false && !r.manual && r.face != null ? " · ⚠ tanpa uji wajah hidup" : "") + (r.manual ? ", oleh " + (r.by || "admin") : "");
      const vf = document.createElement("span"); vf.className = "verif-chip v-" + jenisVerif(r); vf.textContent = metodeAbsen(r);
      left.append(t, s, vf);
      if (r.alasan && r.manual){ const al = document.createElement("small"); al.className = "meta"; al.textContent = "Alasan: " + r.alasan; left.append(al); }
      if (r.lampiran?.length) left.append(daftarLampiran(r.lampiran));
      const kiri = document.createElement("div"); kiri.className = "li-kiri";
      if (r.foto){ const f = daftarLampiran([{ nama: "Selfie " + r.nama + " " + fmtJam(tsOf(r)), path: r.foto, tipe: "image/jpeg" }]); f.classList.add("selfie-mini"); kiri.append(f); }
      kiri.append(left);
      const tags = document.createElement("div"); tags.className = "tags";
      const tg = document.createElement("span"); tg.className = "tag " + (r.type === "masuk" ? "in" : "out"); tg.textContent = jenis(r.type);
      const [cls, txt] = STATUS[r.status] || ["wait", r.status];
      const st = document.createElement("span"); st.className = "tag " + cls; st.textContent = txt;
      tags.append(tg, st);
      if (r.diedit){ const ed = document.createElement("span"); ed.className = "tag wait"; ed.textContent = "Diubah"; ed.title = "Diubah oleh " + (r.dieditOleh || "superadmin") + (r.alasanEdit ? ": " + r.alasanEdit : ""); tags.append(ed); }
      if (bisaEditAbsen()) tags.append(tombolUbahHapus(x.id, r));
      li.append(kiri, tags); return li;
    }));
}
function tampilHari(docs){
  hariDocs = docs;
  $("#hari-count").textContent = "Semua catatan absen " + (hrHariIni() ? "hari ini" : tglHrTeks()) + " (" + fmtNum(docs.length) + ")";
  renderHariTabel(); renderHariList(docs);
}

/* ---------- Laporan absensi hari ini: per karyawan (masuk, pulang, verifikasi, lokasi, disetujui oleh) ---------- */
let hariDocs = [], hariLive = [];
const isoHari = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const hrTgl = () => $("#hr-tgl")?.value || isoHari(new Date());
const hrHariIni = () => hrTgl() === isoHari(new Date());
const tglHrTeks = () => tglMediumHari(hrTgl(), "panjang");
async function gantiTanggalHari(){
  if (hrHariIni()){ tampilHari(hariLive); return; }
  const [y, m, d] = hrTgl().split("-").map(Number);
  $("#hr-info").textContent = "Memuat…"; $("#hari-tabel").innerHTML = ""; $("#hari-list").innerHTML = "";
  try{
    const q = await getDocs(query(C("absensi"), where("ts", ">=", Timestamp.fromDate(new Date(y, m - 1, d))),
      where("ts", "<", Timestamp.fromDate(new Date(y, m - 1, d + 1))), orderBy("ts", "desc")));
    tampilHari(q.docs);
  }catch(e){ $("#hr-info").textContent = "Gagal memuat: " + e.code; }
}
function statusAbsenTeks(r){
  if (r.status === "menunggu") return "⏳ Menunggu persetujuan";
  if (r.dariPengingat) return "tanpa lembur";
  if (r.dariIzin) return "disetujui oleh " + (r.by || "admin");
  if (r.manual) return "dicatat oleh " + (r.by || "admin");
  if (r.status === "terima") return "disetujui oleh " + (r.by || "admin");
  return r.kios ? "Sah (kios)" : "Sah otomatis";
}
function ringkasHari(){
  const per = {};
  for (const x of hariDocs){
    const r = { ...x.data({ serverTimestamps: "estimate" }), _id: x.id }; if (r.status === "tolak") continue;
    const p = per[r.uid] ||= { uid: r.uid, nama: r.nama, masuk: null, pulang: null };
    const d = tsOf(r); if (!d) continue;
    if (r.type === "masuk" && (!p.masuk || d < tsOf(p.masuk))) p.masuk = r;
    if (r.type === "pulang" && (!p.pulang || d > tsOf(p.pulang))) p.pulang = r;
  }
  // absen pulang sebelum absen masuk pertama hari itu (shift malam / lewat tengah malam) = milik absen masuk hari sebelumnya
  for (const p of Object.values(per)) if (p.pulang && (!p.masuk || tsOf(p.pulang) < tsOf(p.masuk))){
    const d = tsOf(p.pulang); p.pulangDari = isoHari(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); }
  const hasil = Object.values(per);
  // karyawan aktif yang belum absen (selain admin, superadmin & kehadiran manual Excel)
  for (const u of pengguna) if (u.aktif !== false && !["admin", "superadmin"].includes(u.role) && !["manual", "tidak"].includes(u.kehadiran) && !per[u.id])
    hasil.push({ uid: u.id, nama: u.nama, masuk: null, pulang: null, belum: true });
  return hasil.sort((a, b) => ((!!a.belum) - (!!b.belum)) || ((a.masuk ? tsOf(a.masuk) : 0) - (b.masuk ? tsOf(b.masuk) : 0)) || (a.nama || "").localeCompare(b.nama || ""));
}
function saringHari(){
  const cari = $("#hr-cari").value.trim().toLowerCase(), t = $("#hr-tampil").value;
  return ringkasHari().filter(p => (!cari || (p.nama || "").toLowerCase().includes(cari)) && (!t || (t === "belum" ? p.belum : !p.belum)));
}
const lokasiTeks = r => r ? (r.manual && !r.dariIzin ? (r.lokasi && r.lokasi !== "manual" ? r.lokasi : "-") : (r.lokasi || "-") + (r.dist != null && !r.manual ? " · " + fmtNum(r.dist) + " m" : "")) : "";
// versi ringkas untuk tabel Hari ini (teks lengkap tetap muncul sebagai tooltip)
const verifPendek = r => ({ wajah: "🙂 Wajah", jari: "👆 Sidik jari", dua: "🙂👆 Wajah + jari" })[jenisVerif(r)] || metodeAbsen(r);
const statusPendek = r => r.status === "menunggu" ? "⏳ Menunggu" : !r.dariIzin && !r.manual && r.status !== "terima" ? (r.kios ? "Sah (kios)" : "Sah") : statusAbsenTeks(r);
function selAbsen(r){
  if (!r) return '<span class="meta">—</span>';
  return `<b class="hr-jam">${esc(fmtJam(tsOf(r)))}</b><span class="verif-chip v-${jenisVerif(r)}" title="${esc(metodeAbsen(r))}">${esc(verifPendek(r))}</span>
    <small class="hr-st ${r.status === "menunggu" ? "wait" : ""}" title="${esc(statusAbsenTeks(r))}">${esc(statusPendek(r))}</small>${r.lampiran?.length ? `<small class="hr-st" title="Lihat lampiran di daftar catatan di bawah">📎 ${r.lampiran.length}</small>` : ""}${bisaEditAbsen() && r._id ? `<span class="hr-aksi"><button type="button" class="ikon-btn" data-ub="${esc(r._id)}" title="Ubah absen ini" aria-label="Ubah absen">✏️</button><button type="button" class="ikon-btn" data-hp="${esc(r._id)}" title="Hapus absen ini" aria-label="Hapus absen">🗑️</button></span>` : ""}`;
}
// Kolom GPS: koordinat (klik = buka Google Maps), akurasi, dan alamat
const gpsAda = r => r && typeof r.la === "number" && typeof r.lo === "number";
const gpsTeks = r => gpsAda(r) ? r.la.toFixed(5) + ", " + r.lo.toFixed(5) + (r.acc ? " (±" + fmtNum(r.acc) + " m)" : "") : "";
const gpsUrl = r => gpsAda(r) ? "https://www.google.com/maps?q=" + r.la + "," + r.lo : "";
// Kolom lokasi masuk / pulang: nama lokasi + jarak, lalu koordinat GPS (klik = Google Maps), akurasi, alamat
const namaLok = r => !r ? "" : (r.manual || r.dariIzin) && !gpsAda(r) ? (r.lokasi && r.lokasi !== "manual" ? r.lokasi + " (manual)" : "Tanpa GPS") : lokasiTeks(r) || "-";   // nama lokasi + jarak, mis. "Kantor Pusat · 45 m"
const koordinat = r => gpsAda(r) ? r.la.toFixed(5) + ", " + r.lo.toFixed(5) : "";
const koordinatPendek = r => gpsAda(r) ? r.la.toFixed(4) + ", " + r.lo.toFixed(4) : "";
function selLokasi(r){
  if (!r) return '<span class="meta">—</span>';
  if ((r.manual || r.dariIzin) && !gpsAda(r)) return r.lokasi && r.lokasi !== "manual" ? `<b class="hr-lok-nama">${esc(r.lokasi)}</b><span class="meta"> · manual</span>` : '<span class="meta">Tanpa GPS</span>';
  return `<b class="hr-lok-nama">${esc(namaLok(r))}</b>` + (gpsAda(r)
    ? `<a class="hr-koord" href="${gpsUrl(r)}" target="_blank" rel="noopener" title="Buka di Google Maps">📍 ${koordinatPendek(r)}</a>`
    : `<span class="meta">${r.manual ? "tanpa GPS (manual)" : "-"}</span>`);
}
function selGps(r, label){
  if (!r) return "";
  if (!gpsAda(r)) return `<div class="hr-gps meta">${label ? label + ": " : ""}${r.manual ? "tanpa GPS (manual)" : "-"}</div>`;
  return `<div class="hr-gps">${label ? `<span class="meta">${label}:</span> ` : ""}<a href="${gpsUrl(r)}" target="_blank" rel="noopener" title="Buka di Google Maps">📍 ${r.la.toFixed(5)}, ${r.lo.toFixed(5)}</a>${r.acc ? `<small>Akurasi ±${fmtNum(r.acc)} m</small>` : ""}${r.alamat ? `<small>${esc(r.alamat)}</small>` : ""}</div>`;
}
function renderHariTabel(){
  if (!$("#hari-tabel")) return;
  const semua = ringkasHari(), list = saringHari(), hadir = semua.filter(p => !p.belum).length;
  $("#hr-info").textContent = tglHrTeks() + (hrHariIni() ? " (hari ini)" : "") + " · " + fmtNum(hadir) + " sudah absen · " + fmtNum(semua.length - hadir) + " belum absen";
  $("#hari-tabel").innerHTML = list.length ? `<table class="rekap-tbl hr-tbl"><thead><tr><th>Nama</th><th>Masuk</th><th>Lokasi masuk</th><th>Pulang</th><th>Lokasi pulang</th></tr></thead><tbody>
    ${list.map((p, i) => `<tr class="${p.belum ? "belum" : ""}"><td><span class="hr-no">${i + 1}.</span> <b>${esc(p.nama || "")}</b></td>
      ${p.belum ? `<td colspan="4" class="meta">Belum absen${hrHariIni() ? " hari ini" : ""}</td>` : `<td class="hr-absen">${selAbsen(p.masuk)}</td><td class="hr-lok">${selLokasi(p.masuk)}</td>
      <td class="hr-absen">${selAbsen(p.pulang)}${p.pulangDari ? `<small class="tgl-lain" title="Absen pulang ini untuk absen masuk ${esc(tglMedium(p.pulangDari))}">↩ masuk ${esc(tglMedium(p.pulangDari))}</small>` : ""}</td><td class="hr-lok">${selLokasi(p.pulang)}</td>`}</tr>`).join("")}
    </tbody></table>` : '<p class="meta">Tidak ada data.</p>';
  // superadmin: ubah / hapus absen langsung dari tabel
  const peta = {}; list.forEach(p => { if (p.masuk?._id) peta[p.masuk._id] = p.masuk; if (p.pulang?._id) peta[p.pulang._id] = p.pulang; });
  const sesudah = () => { if (!hrHariIni()) gantiTanggalHari(); };
  $("#hari-tabel").querySelectorAll("[data-ub]").forEach(b => b.onclick = () => ubahAbsen(b.dataset.ub, peta[b.dataset.ub], b, sesudah));
  $("#hari-tabel").querySelectorAll("[data-hp]").forEach(b => b.onclick = () => hapusAbsen(b.dataset.hp, peta[b.dataset.hp], b, sesudah));
}
const barisCSVHari = p => [p.nama || "", p.belum ? "Belum absen" : "Hadir",
  p.masuk ? fmtJam(tsOf(p.masuk)) : "", p.masuk ? metodeAbsen(p.masuk) : "", p.masuk ? statusAbsenTeks(p.masuk) : "", namaLok(p.masuk), koordinat(p.masuk),
  p.pulang ? fmtJam(tsOf(p.pulang)) : "", p.pulang ? metodeAbsen(p.pulang) : "", p.pulang ? statusAbsenTeks(p.pulang) : "", namaLok(p.pulang), koordinat(p.pulang)];
$("#hr-cari").oninput = renderHariTabel; $("#hr-tampil").onchange = renderHariTabel;
$("#hr-tgl").value = isoHari(new Date()); $("#hr-tgl").addEventListener("change", gantiTanggalHari);
$("#hr-csv").onclick = () => {
  const iso = hrTgl();
  catatLog(CID, me.uid, profile, "ekspor", "Mengunduh CSV absensi " + tglHrTeks());
  unduhCSV([["Nama", "Status", "Jam masuk", "Verifikasi masuk", "Persetujuan masuk", "Lokasi masuk", "GPS masuk", "Jam pulang", "Verifikasi pulang", "Persetujuan pulang", "Lokasi pulang", "GPS pulang"],
    ...saringHari().map(barisCSVHari)], "absensi-" + iso + ".csv");
};
const lokCetak = r => !r ? "-" : (r.manual || r.dariIzin) && !gpsAda(r) ? "Tanpa GPS" : "<b>" + esc(namaLok(r)) + "</b>" + (gpsAda(r) ? " &nbsp;📍 " + esc(koordinatPendek(r)) : "");
const absenCetak = r => !r ? "-" : "<b>" + esc(fmtJam(tsOf(r))) + "</b> &nbsp;" + esc(verifPendek(r)) + " &nbsp;<i>" + esc(statusPendek(r)) + "</i>";
$("#hr-cetak").onclick = () => {
  catatLog(CID, me.uid, profile, "ekspor", "Mencetak laporan absensi " + tglHrTeks());
  const w = window.open("", "_blank"); if (!w){ toast("Izinkan pop-up untuk mencetak laporan."); return; }
  const rows = saringHari().map((p, i) => `<tr><td>${i + 1}</td><td>${esc(p.nama || "")}</td>${p.belum ? '<td colspan="4">Belum absen</td>'
    : `<td>${absenCetak(p.masuk)}</td>
       <td>${lokCetak(p.masuk)}</td>
       <td>${absenCetak(p.pulang)}</td>
       <td>${lokCetak(p.pulang)}</td>`}</tr>`).join("");
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Absensi ${esc(hrTgl())}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;color:#13213C}h1{font-size:1.3rem;margin:0}p{color:#5B6878;margin:4px 0 14px}
    table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{padding:6px 8px;border-bottom:1px solid #D5DDD9;text-align:left;vertical-align:top;white-space:nowrap}thead th{border-bottom:1.5px solid #13213C}
    i{color:#5B6878;font-style:normal;font-size:.8rem}${KOP_CSS}@page{size:A4 landscape;margin:12mm}</style></head>
    <body>${kopHTML(perusahaan)}<h1>Laporan Absensi Harian</h1><p>${esc($("#hr-info").textContent)}</p>
    <table><thead><tr><th>No</th><th>Nama</th><th>Masuk</th><th>Lokasi masuk</th><th>Pulang</th><th>Lokasi pulang</th></tr></thead><tbody>${rows}</tbody></table><script>print()<\/script></body></html>`);
  w.document.close();
};

/* ---------- Riwayat persetujuan (absen luar area / kios / GPS lemah, izin, sakit, cuti, lupa absen) ---------- */
let rwData = [];
function jenisRw(x){
  if (x._k === "absen") return x.kios ? ["absen", "🖥️ Absen via kios"] : x.dist > x.rad ? ["absen", "📍 Absen di luar area"] : ["absen", "📶 Absen GPS lemah"];
  if (x.jenis === "lupaMasuk") return ["lupa", "🕘 Tidak bisa absen masuk"];
  if (x.jenis === "lupaPulang") return ["lupa", "🕔 Lupa absen pulang"];
  return x.jenis === "sakit" ? ["sakit", "🤒 Sakit"] : x.jenis === "cuti" ? ["cuti", "🏖️ Cuti"] : ["izin", "📝 Izin"];
}
const tglJamRw = d => d ? tglJam(d) : "-";
async function muatRiwayatPersetujuan(){
  const dari = $("#rw-dari").value, sampai = $("#rw-sampai").value || dari;
  if (!dari){ $("#rw-ringkas").textContent = "Isi tanggal dulu."; return; }
  const [y1, m1, d1] = dari.split("-").map(Number), [y2, m2, d2] = sampai.split("-").map(Number);
  const a = Timestamp.fromDate(new Date(y1, m1 - 1, d1)), b = Timestamp.fromDate(new Date(y2, m2 - 1, d2 + 1));
  $("#rw-ringkas").textContent = "Memuat…"; $("#rw-list").innerHTML = ""; $("#rw-go").disabled = true;
  try{
    const [sa, si] = await Promise.all([
      getDocs(query(C("absensi"), where("ts", ">=", a), where("ts", "<", b), orderBy("ts", "desc"))),
      getDocs(query(C("izin"), where("ts", ">=", a), where("ts", "<", b), orderBy("ts", "desc")))]);
    const abs = sa.docs.map(d => ({ id: d.id, _k: "absen", ...d.data({ serverTimestamps: "estimate" }) }))
      // hanya absen yang melewati persetujuan (bukan absen otomatis sah, manual admin, import, atau hasil lupa absen)
      .filter(x => x.status === "menunggu" || ((x.status === "terima" || x.status === "tolak") && x.byUid && !x.manual && !x.import && !x.dariIzin));
    const izn = si.docs.map(d => ({ id: d.id, _k: "izin", ...d.data({ serverTimestamps: "estimate" }) }));
    rwData = [...abs, ...izn].sort((p, q) => (tsOf(q)?.getTime() || 0) - (tsOf(p)?.getTime() || 0));
    tampilRiwayatPersetujuan();
  }catch(e){ $("#rw-ringkas").textContent = "Gagal memuat: " + e.code; }
  $("#rw-go").disabled = false;
}
function saringRw(){
  const j = $("#rw-jenis").value, st = $("#rw-status").value, cari = $("#rw-cari").value.trim().toLowerCase();
  return rwData.filter(x => (!j || jenisRw(x)[0] === j) && (!st || x.status === st)
    && (!cari || [x.nama, x.alasan, x.note, x.by, x.alamat, x.lokasi].filter(Boolean).join(" ").toLowerCase().includes(cari)));
}
function tampilRiwayatPersetujuan(){
  const list = saringRw(), n = s => list.filter(x => x.status === s).length;
  $("#rw-ringkas").innerHTML = `<div class="stat5 rwy-stat">
      <div><b>${fmtNum(list.length)}</b><span>Total</span></div><div class="ok"><b>${fmtNum(n("terima"))}</b><span>Disetujui</span></div>
      <div class="bad"><b>${fmtNum(n("tolak"))}</b><span>Ditolak</span></div><div class="wait"><b>${fmtNum(n("menunggu"))}</b><span>Menunggu</span></div></div>`;
  $("#rw-csv").hidden = !list.length;
  if (!list.length){ $("#rw-list").innerHTML = '<p class="meta">Tidak ada riwayat persetujuan pada rentang & filter ini.</p>'; return; }
  $("#rw-list").replaceChildren(...list.map(x => {
    const [kls, lbl] = jenisRw(x), [cls, txt] = STATUS[x.status] || ["wait", x.status];
    const kv = [];
    if (x._k === "absen"){
      kv.push(["Jenis", jenis(x.type)], ["Waktu absen", tglJamRw(tsOf(x))],
        ["Jarak", fmtNum(x.dist) + " m dari " + (x.lokasi || "kantor") + (x.rad ? " (batas " + fmtNum(x.rad) + " m)" : "")],
        ["Akurasi GPS", x.acc ? "±" + fmtNum(x.acc) + " m" : "-"], ["Alamat", x.alamat || "-"], ["Verifikasi", metodeAbsen(x)], ["Alasan", x.alasan || "-"]);
    } else {
      kv.push(["Tanggal", rentang(x)], ...(LUPA_ABSEN[x.jenis] ? [] : [["Lama", fmtNum(hariKerjaAntara(x.mulai, x.selesai, aturan)) + " hari kerja"]]),
        ["Diajukan", tglJamRw(tsOf(x))], ["Keterangan", x.alasan || "-"]);
    }
    kv.push(["Keputusan", x.status === "menunggu" ? "Belum diputuskan" : (x.status === "terima" ? "Disetujui" : txt) + (x.by ? " oleh " + x.by : "") + (x.decidedAt?.toDate ? " · " + tglJamRw(x.decidedAt.toDate()) : "")]);
    if (x.note) kv.push(["Catatan", x.note]);
    const card = document.createElement("div"); card.className = "card rwy-card st-" + x.status;
    card.innerHTML = `<div class="rwy-head"><span class="jenis-badge ${kls}">${lbl}</span><b>${esc(x.nama || "")}</b><span class="tag ${cls}">${x.status === "terima" ? "Disetujui" : txt}</span></div>
      <dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join("")}</dl>`;
    const dl = card.querySelector("dl");
    if (x._k === "absen"){ if (x.la != null) { const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = "Lokasi"; dd.innerHTML = `<a href="https://www.google.com/maps?q=${x.la},${x.lo}" target="_blank" rel="noopener">Buka di peta</a>`; dl.append(dt, dd); } tambahSelfie(dl, x); }
    if (x.lampiran?.length){ const dt = document.createElement("dt"), dd = document.createElement("dd"); dt.textContent = "Lampiran"; dd.append(daftarLampiran(x.lampiran)); dl.append(dt, dd); }
    return card;
  }));
}
{ const n = new Date(), iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  $("#rw-dari").value = iso(new Date(n.getFullYear(), n.getMonth(), 1)); $("#rw-sampai").value = iso(n); }
$("#rw-go").onclick = muatRiwayatPersetujuan;
["#rw-jenis", "#rw-status"].forEach(s => $(s).onchange = () => rwData.length && tampilRiwayatPersetujuan());
$("#rw-cari").oninput = () => rwData.length && tampilRiwayatPersetujuan();
$("#rw-cari").addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); rwData.length ? tampilRiwayatPersetujuan() : muatRiwayatPersetujuan(); } });
$("#rw-csv").onclick = () => {
  const list = saringRw();
  catatLog(CID, me.uid, profile, "ekspor", "Mengunduh CSV riwayat persetujuan " + $("#rw-dari").value + " s/d " + $("#rw-sampai").value);
  unduhCSV([["Jenis", "Nama", "Diajukan / waktu absen", "Tanggal / jenis absen", "Detail", "Alasan / keterangan", "Status", "Diputuskan oleh", "Waktu keputusan", "Catatan"],
    ...list.map(x => [jenisRw(x)[1].replace(/^\S+\s/, ""), x.nama || "", tglJamRw(tsOf(x)),
      x._k === "absen" ? jenis(x.type) : rentang(x),
      x._k === "absen" ? fmtNum(x.dist) + " m dari " + (x.lokasi || "kantor") + (x.alamat ? " · " + x.alamat : "") + " · " + metodeAbsen(x) : (LUPA_ABSEN[x.jenis] ? "" : hariKerjaAntara(x.mulai, x.selesai, aturan) + " hari kerja") + (x.lampiran?.length ? " · " + x.lampiran.length + " lampiran" : ""),
      x.alasan || "", x.status === "terima" ? "Disetujui" : (STATUS[x.status] || [, x.status])[1], x.by || "", x.decidedAt?.toDate ? tglJamRw(x.decidedAt.toDate()) : "", x.note || ""])],
    "riwayat-persetujuan-" + $("#rw-dari").value + "-" + $("#rw-sampai").value + ".csv");
};

/* ---------- sub-tab (berlaku per kelompok) ---------- */
document.querySelectorAll(".subtabs").forEach(st => st.querySelectorAll("button").forEach(b => b.onclick = () => {
  st.querySelectorAll("button").forEach(x => x.setAttribute("aria-selected", x === b));
  st.parentElement.querySelectorAll(":scope > .sub").forEach(x => x.classList.remove("on"));
  $("#" + b.dataset.s).classList.add("on");
  msg($("#msg3"), "");
  if (b.dataset.s === "sub-riwayat") loadRiwayat();
  if (b.dataset.s === "sub-pinjaman") muatPinjaman();
  if (b.dataset.s === "sub-rekap"){ $("#imp-bar").hidden = !isSuper(); if (!$("#l-out").dataset.done) $("#l-go").click(); }
  if (b.dataset.s === "sub-log") muatLog();
  if (b.dataset.s === "sub-cekhp") muatCekHP();
  if (b.dataset.s === "sub-rwy" && !rwData.length) muatRiwayatPersetujuan();
  if (b.dataset.s === "sub-lembur"){ const baru = b.dataset.mode || "lembur", ganti = baru !== lbMode; lbMode = baru;
    if (ganti) $("#lb-filter").value = "belum";
    if (dataLembur.length && ganti) tampilLembur(); else muatLembur(); }
}));

/* ================= PERUSAHAAN (superadmin) ================= */
// Perusahaan demo publik: berlaku untuk semua selain superadmin
const modeDemo = () => !!perusahaan?.modeDemo && !isSuper();
const usernameAkhir = u => modeDemo() && u && !u.endsWith(".demo") ? u + ".demo" : u;
// Superadmin: pilih perusahaan langsung dari menu Laporan, Karyawan, dan Gaji
function isiPilihPT(){
  document.querySelectorAll(".pt-pilih").forEach(w => {
    w.hidden = !isSuper() || daftarPT.length < 1;
    if (w.hidden) return;
    const sel = w.querySelector("select");
    sel.innerHTML = daftarPT.map(p => `<option value="${esc(p.id)}" ${p.id === CID ? "selected" : ""}>${esc(p.nama)} (${esc(p.kode || "")})</option>`).join("");
    sel.onchange = () => {
      const tab = w.closest("section")?.id?.replace("tab-", "") || "";
      try{ localStorage.setItem("absen:cidAktif", sel.value); sessionStorage.setItem("absen:kembaliTab", tab); }catch(e){}
      location.reload();
    };
  });
}
// Pemberitahuan masa coba / langganan di atas dashboard (7 hari terakhir; superadmin selalu melihatnya)
function tampilMasaAktif(){
  const el = $("#masa-info"); if (!el) return;
  const m = masaAktif(perusahaan);
  if (!m.ada || (!isSuper() && m.sisa > 7)){ el.hidden = true; return; }
  const jenisM = m.coba ? "Masa coba gratis" : "Langganan";
  el.className = "masa-info" + (m.habis ? " habis" : m.sisa <= 3 ? " segera" : "");
  el.innerHTML = m.habis ? `<b>${jenisM} ${esc(perusahaan.nama)} sudah berakhir (${esc(tglMedium(m.sampai))}).</b> Admin &amp; karyawan perusahaan ini tidak bisa login.`
    : `<b>${jenisM} berakhir ${esc(tglMedium(m.sampai))}</b> · sisa ${m.sisa ? m.sisa + " hari" : "hari ini"}.` +
      (isSuper() ? "" : ` Untuk melanjutkan, hubungi <a href="${WA_PENJUAL_LINK}?text=${encodeURIComponent("Halo, saya mau melanjutkan langganan Absensi Hadir untuk " + (perusahaan.nama || ""))}" target="_blank" rel="noopener">WhatsApp ${WA_PENJUAL}</a>.`);
  el.hidden = false;
}
// Teks status masa aktif untuk daftar perusahaan (superadmin)
function labelMasa(p){
  const m = masaAktif(p);
  if (!m.ada) return '<span class="tag in">Tanpa batas</span>';
  const jenisM = m.coba ? "Coba" : "Langganan";
  if (m.habis) return `<span class="tag no">${jenisM} habis ${esc(tglMedium(m.sampai))}</span>`;
  return `<span class="tag ${m.sisa <= 3 ? "no" : m.sisa <= 7 ? "wait" : "in"}">${jenisM} s/d ${esc(tglMedium(m.sampai))} · sisa ${m.sisa ? m.sisa + " hari" : "hari ini"}</span>`;
}
async function aturMasa(p, sampai, paket, ketLog){
  const data = sampai ? { aktifSampai: sampai, aktifSampaiTs: Timestamp.fromDate(tsAkhirHari(sampai)), paket } : { aktifSampai: "", aktifSampaiTs: null, paket: "langganan" };
  await updateDoc(doc(db, "companies", p.id), data);
  Object.assign(p, data); if (perusahaan?.id === p.id) Object.assign(perusahaan, data);
  catatLog(p.id, me.uid, profile, "ubah", "Masa aktif " + (p.nama || "") + ": " + ketLog);
  toast("Tersimpan: " + (p.nama || "") + " · " + ketLog);
  renderPerusahaan(); tampilMasaAktif();
}
function renderPerusahaan(){
  isiPilihPT();
  // tombol hapus data demo tidak tersedia untuk pengunjung perusahaan demo
  $("#demo-hapus").hidden = modeDemo();
  // info perusahaan aktif di Pengaturan
  $("#pt-info").innerHTML = perusahaan
    ? `${perusahaan.logo ? `<dt>Logo</dt><dd><img class="logo-prev" src="${perusahaan.logo}" alt="Logo ${esc(perusahaan.nama)}"></dd>` : ""}<dt>Nama</dt><dd>${esc(perusahaan.nama)}</dd><dt>Kode</dt><dd><b style="font-size:1.1rem;letter-spacing:.05em">${esc(perusahaan.kode)}</b></dd>
       ${perusahaan.alamat ? `<dt>Alamat</dt><dd>${esc(perusahaan.alamat)}</dd>` : ""}${perusahaan.telp ? `<dt>Telepon</dt><dd>${esc(perusahaan.telp)}</dd>` : ""}`
    : `<dt>Status</dt><dd>Belum ada perusahaan.</dd>`;
  $("#pt-edit").hidden = !perusahaan || !isAdmin();
  if (!isSuper()) return;
  const box = $("#pt-list");
  box.innerHTML = daftarPT.length ? "" : '<p class="meta">Belum ada perusahaan. Tambahkan di bawah.</p>';
  daftarPT.forEach(p => {
    const c = document.createElement("div"); c.className = "card" + (p.id === CID ? " pending" : "");
    c.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <div class="pt-id">${p.logo ? `<img class="logo-mini" src="${p.logo}" alt="">` : ""}<div><b>${esc(p.nama)}</b><div class="meta">Kode: <b>${esc(p.kode)}</b></div></div></div>
      <div class="pt-aksi">${p.id === CID ? '<span class="tag in">Aktif</span>' : '<button class="small b-kelola">Kelola</button>'}
        <button class="small alt b-edit-pt">Edit</button></div></div>
      ${p.alamat ? `<div class="meta">${esc(p.alamat)}</div>` : ""}
      <div class="pt-masa"><div>${labelMasa(p)}</div>
        <div class="pt-masa-aksi">
          <button type="button" class="small alt m-coba" title="Tambah masa coba gratis 14 hari">+14 hari coba</button>
          <button type="button" class="small alt m-bulan" title="Sudah bayar 1 bulan">+1 bulan</button>
          <button type="button" class="small alt m-tahun" title="Sudah bayar 1 tahun">+1 tahun</button>
          <label class="m-tgl-wrap">Sampai <input type="date" class="m-tgl" value="${esc(p.aktifSampai || "")}" aria-label="Aktif sampai tanggal"></label>
          <button type="button" class="small alt m-bebas" title="Tidak ada batas waktu">Tanpa batas</button>
        </div></div>
      <div class="pt-form" hidden></div>`;
    c.querySelector(".b-edit-pt").onclick = () => bukaFormPT(c.querySelector(".pt-form"), p);
    // masa aktif: diperpanjang dari tanggal habis (atau dari hari ini kalau sudah lewat / belum ada)
    const dasar = () => { const m = masaAktif(p); return m.ada && !m.habis ? m.sampai : hariIniIso(); };
    const jalan = async (el, fn) => { el.disabled = true; try{ await fn(); }catch(e){ toast(e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal: " + (e.code || e.message)); el.disabled = false; } };
    c.querySelector(".m-coba").onclick = e => jalan(e.currentTarget, () => { const s = tambahHari(dasar(), 14); return aturMasa(p, s, "coba", "coba gratis s/d " + tglMedium(s)); });
    c.querySelector(".m-bulan").onclick = e => jalan(e.currentTarget, () => { const s = tambahBulan(dasar(), 1); return aturMasa(p, s, "langganan", "langganan +1 bulan s/d " + tglMedium(s)); });
    c.querySelector(".m-tahun").onclick = e => jalan(e.currentTarget, () => { const s = tambahBulan(dasar(), 12); return aturMasa(p, s, "langganan", "langganan +1 tahun s/d " + tglMedium(s)); });
    c.querySelector(".m-tgl").onchange = e => { const v = e.currentTarget.value; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) jalan(e.currentTarget, () => aturMasa(p, v, p.paket || "langganan", "aktif s/d " + tglMedium(v))); };
    c.querySelector(".m-bebas").onclick = async e => { if (!await tanya("Hapus batas waktu " + p.nama + "? Perusahaan ini aktif terus tanpa tanggal habis.", { ya: "Tanpa batas" })) return;
      jalan(e.currentTarget, () => aturMasa(p, "", "langganan", "tanpa batas")); };
    const b = c.querySelector(".b-kelola");
    if (b) b.onclick = () => { try{ localStorage.setItem("absen:cidAktif", p.id); }catch(e){} location.reload(); };
    box.append(c);
  });
  cekAkunLama();
}
/* ---------- edit perusahaan ---------- */
// Logo dikecilkan (maks. 300 px) dan disimpan sebagai gambar kecil di data perusahaan
async function kecilkanLogo(file){
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 300 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
  let url = c.toDataURL("image/png");
  if (url.length > 250000) url = c.toDataURL("image/webp", 0.9);
  if (url.length > 250000) throw new Error("terlalu besar");
  return url;
}
function tampilLogo(){
  const l = $("#pt-logo");
  if (perusahaan?.logo){ l.src = perusahaan.logo; l.hidden = false; } else l.hidden = true;
}
function bukaFormPT(box, p){
  if (!box.hidden){ box.hidden = true; return; }
  box.innerHTML = `<label>Nama perusahaan</label><input class="f-nama" value="${esc(p.nama || "")}">
    <label>Kode perusahaan</label><input class="f-kode" style="text-transform:uppercase" value="${esc(p.kode || "")}" ${isSuper() ? "" : "disabled"}>
    <p class="meta" style="margin:4px 0 0">${isSuper() ? "3–10 huruf/angka. Mengubah kode tidak memengaruhi login karyawan." : "Kode hanya bisa diubah superadmin."}</p>
    <label>Logo perusahaan</label>
    <div class="logo-edit"><img class="logo-prev f-logo-prev" alt="" ${p.logo ? `src="${p.logo}"` : "hidden"}>
      <label class="addfile"><input type="file" class="f-logo" accept="image/png,image/jpeg,image/webp">${p.logo ? "Ganti logo" : "Pilih logo"}</label>
      <button type="button" class="small alt f-logo-hapus" ${p.logo ? "" : "hidden"}>Hapus logo</button></div>
    <p class="meta" style="margin:4px 0 0">PNG/JPG/WebP. Otomatis dikecilkan. Tampil di kop slip, laporan, dan bagian atas aplikasi.</p>
    <label>Alamat</label><textarea class="f-alamat" rows="2">${esc(p.alamat || "")}</textarea>
    <label>Telepon</label><input class="f-telp" inputmode="tel" value="${esc(p.telp || "")}">
    ${isSuper() ? `<label class="check" style="margin-top:12px"><input type="checkbox" class="f-demo" ${p.modeDemo ? "checked" : ""}> Perusahaan demo publik</label>
      <p class="meta" style="margin:2px 0 0">Username baru otomatis berakhiran .demo; hapus karyawan & hapus data demo hanya bisa oleh superadmin.</p>` : ""}
    <div class="btns" style="margin-top:12px"><button class="small f-simpan">Simpan</button><button class="small alt f-batal">Batal</button></div>`;
  box.hidden = false; box.querySelector(".f-nama").focus();
  box.querySelector(".f-batal").onclick = () => { box.hidden = true; };
  let logoBaru;                                     // undefined = tidak diubah, "" = dihapus, data URL = logo baru
  const prev = box.querySelector(".f-logo-prev"), hapusLogo = box.querySelector(".f-logo-hapus");
  box.querySelector(".f-logo").onchange = async ev => {
    const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)){ toast("Logo harus PNG, JPG, atau WebP."); return; }
    try{ logoBaru = await kecilkanLogo(f); prev.src = logoBaru; prev.hidden = false; hapusLogo.hidden = false; }
    catch(e){ toast("Gambar tidak bisa dibaca."); }
  };
  hapusLogo.onclick = () => { logoBaru = ""; prev.hidden = true; prev.removeAttribute("src"); hapusLogo.hidden = true; };
  box.querySelector(".f-simpan").onclick = async e => {
    const nama = box.querySelector(".f-nama").value.trim(), kode = box.querySelector(".f-kode").value.trim().toUpperCase();
    const alamat = box.querySelector(".f-alamat").value.trim(), telp = box.querySelector(".f-telp").value.trim();
    if (!nama){ toast("Nama perusahaan tidak boleh kosong."); return; }
    const ubahKode = isSuper() && kode !== p.kode;
    const demoUbah = isSuper() && box.querySelector(".f-demo") ? { modeDemo: box.querySelector(".f-demo").checked } : {};
    if (ubahKode && !/^[A-Z0-9]{3,10}$/.test(kode)){ toast("Kode perusahaan 3–10 huruf/angka."); return; }
    e.target.disabled = true;
    try{
      if (ubahKode){
        if ((await getDoc(doc(db, "kodes", kode))).exists()){ toast("Kode " + kode + " sudah dipakai perusahaan lain."); e.target.disabled = false; return; }
        if (!await tanya("Ganti kode " + p.kode + " menjadi " + kode + "?")){ e.target.disabled = false; return; }
        const bt = writeBatch(db);
        bt.set(doc(db, "kodes", kode), { cid: p.id });
        if (p.kode) bt.delete(doc(db, "kodes", p.kode));
        bt.update(doc(db, "companies", p.id), { nama, kode, alamat, telp, ...(logoBaru !== undefined ? { logo: logoBaru } : {}), ...demoUbah });
        await bt.commit();
        // perbarui kode yang tercatat di akun karyawan perusahaan ini
        const us = await getDocs(query(collection(db, "users"), where("cid", "==", p.id)));
        for (let i = 0; i < us.docs.length; i += 400){
          const b2 = writeBatch(db); us.docs.slice(i, i + 400).forEach(d => b2.update(d.ref, { kode })); await b2.commit();
        }
      } else await updateDoc(doc(db, "companies", p.id), { nama, alamat, telp, ...(logoBaru !== undefined ? { logo: logoBaru } : {}), ...demoUbah });
      Object.assign(p, { nama, alamat, telp, ...(ubahKode ? { kode } : {}), ...(logoBaru !== undefined ? { logo: logoBaru } : {}), ...demoUbah });
      if (perusahaan && perusahaan.id === p.id){
        Object.assign(perusahaan, p);
        $("#who").textContent = profile.nama + " · " + perusahaan.nama; tampilLogo();
      }
      box.hidden = true; renderPerusahaan(); toast("Data perusahaan tersimpan.");
    }catch(err){
      toast(err.code === "permission-denied" ? "Tidak punya izin mengubah data perusahaan ini." : "Gagal: " + err.code);
      e.target.disabled = false;
    }
  };
}
$("#pt-edit").onclick = () => bukaFormPT($("#pt-form-aktif"), daftarPT.find(x => x.id === CID) || perusahaan);

$("#pt-add").onclick = async () => {
  const m = $("#msg-pt"), nama = $("#pt-nama").value.trim(), kode = $("#pt-kode").value.trim().toUpperCase();
  if (!nama){ msg(m, "Isi nama perusahaan.", "bad"); return; }
  if (!/^[A-Z0-9]{3,10}$/.test(kode)){ msg(m, "Kode perusahaan 3–10 huruf/angka.", "bad"); return; }
  $("#pt-add").disabled = true;
  try{
    if ((await getDoc(doc(db, "kodes", kode))).exists()){ msg(m, "Kode " + kode + " sudah dipakai perusahaan lain.", "bad"); $("#pt-add").disabled = false; return; }
    const ref = doc(collection(db, "companies"));
    const bt = writeBatch(db);
    const hariCoba = Math.max(1, Math.min(90, parseInt($("#pt-coba-hari").value, 10) || 14));
    const sampai = $("#pt-coba").checked ? tambahHari(hariIniIso(), hariCoba) : "";
    bt.set(ref, { nama, kode, dibuat: serverTimestamp(), oleh: me.uid,
      ...(sampai ? { aktifSampai: sampai, aktifSampaiTs: Timestamp.fromDate(tsAkhirHari(sampai)), paket: "coba" } : {}) });
    bt.set(doc(db, "kodes", kode), { cid: ref.id });
    await bt.commit();
    try{ localStorage.setItem("absen:cidAktif", ref.id); }catch(e){}
    msg(m, "Perusahaan " + nama + " ditambahkan dan langsung aktif.", "ok");
    setTimeout(() => location.reload(), 800);
  }catch(e){ msg(m, "Gagal: " + e.code, "bad"); $("#pt-add").disabled = false; }
};
// Akun yang dibuat sebelum ada fitur perusahaan
let akunLama = [];
async function cekAkunLama(){
  try{
    const us = await getDocs(collection(db, "users"));
    akunLama = us.docs.filter(d => !d.data().cid && d.data().role !== "superadmin");
    $("#lama-wrap").hidden = !akunLama.length || !CID;
    $("#lama-info").textContent = fmtNum(akunLama.length) + " akun dibuat sebelum ada fitur perusahaan: " +
      akunLama.map(d => d.data().nama).join(", ") + ". Hubungkan ke " + (perusahaan?.nama || "perusahaan aktif") + "?";
  }catch(e){}
}
$("#lama-go").onclick = async () => {
  if (!await tanya("Hubungkan " + akunLama.length + " akun ke " + perusahaan.nama + "?")) return;
  try{
    const bt = writeBatch(db);
    akunLama.forEach(d => bt.update(doc(db, "users", d.id), { cid: CID, kode: perusahaan.kode }));
    await bt.commit();
    msg($("#msg-pt"), "Akun lama sudah terhubung. Mereka tetap login dengan username lama.", "ok"); cekAkunLama();
  }catch(e){ msg($("#msg-pt"), "Gagal: " + e.code, "bad"); }
};

/* ---------- tambah karyawan (admin & supervisor) ---------- */
/* ---------- cek username & saran ---------- */
const sudahDipakai = async u => { try{ return (await getDoc(doc(db, "usernames", u))).exists(); }catch(e){ return false; } };
const normal = t => String(t || "").toLowerCase().normalize("NFKD").replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
function kandidat(nama, dasar){
  const k = normal(nama).split(" ").filter(Boolean);
  const a = k[0] || normal(dasar).replace(/\s/g, ""), b = k.length > 1 ? k[k.length - 1] : "";
  const kode = (perusahaan?.kode || "").toLowerCase();
  const c = [dasar, a, b && a + "." + b, b && a + b, b && a + b[0], b && a[0] + b, kode && a + "." + kode,
             ...[2, 3, 4, 5, 6, 7, 8, 9].map(n => a + n)];
  return [...new Set(c.filter(x => x && validUsername(x)))];
}
let cekNo = 0;
async function cekUsername(){
  const no = ++cekNo, u = usernameAkhir($("#u-user").value.trim().toLowerCase()), nama = $("#u-nama").value.trim();
  const out = $("#u-cek");
  if (modeDemo() && $("#u-user").value.trim()){ $("#u-demo-info").hidden = false; $("#u-demo-info").textContent = "Mode demo: disimpan sebagai " + u; }
  else $("#u-demo-info").hidden = true;
  if (u && !validUsername(u)){ out.textContent = "3–20 karakter: huruf kecil, angka, titik, atau garis bawah."; out.style.color = "var(--bad)"; }
  else if (u){
    out.textContent = "Memeriksa…"; out.style.color = "";
    const dipakai = await sudahDipakai(u); if (no !== cekNo) return;
    out.textContent = dipakai ? "✗ Sudah dipakai" : "✓ Tersedia"; out.style.color = dipakai ? "var(--bad)" : "var(--ok)";
    if (!dipakai){ $("#u-saran-wrap").hidden = true; return; }
  } else out.textContent = "";
  if (!nama && !u){ $("#u-saran-wrap").hidden = true; return; }
  // Cari maksimal 4 saran yang masih tersedia
  const saran = [];
  for (const k of kandidat(nama, u)){
    if (k === u) continue;
    if (!(await sudahDipakai(k))) saran.push(k);
    if (no !== cekNo) return;
    if (saran.length >= 4) break;
  }
  $("#u-saran").replaceChildren(...saran.map(k => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = k;
    b.onclick = () => { $("#u-user").value = k; cekUsername(); };
    return b;
  }));
  $("#u-saran-wrap").hidden = !saran.length;
}
// Nama mirip dengan karyawan yang sudah ada di perusahaan ini
function cariMirip(nama){
  const n = normal(nama); if (n.length < 3) return [];
  const kata = n.split(" ");
  return pengguna.filter(u => {
    const m = normal(u.nama); if (!m) return false;
    if (m === n || m.includes(n) || n.includes(m)) return true;
    const mk = m.split(" ");
    return kata.length > 1 && kata.filter(w => w.length > 2 && mk.includes(w)).length >= 2;
  });
}
function tampilMirip(){
  const mirip = cariMirip($("#u-nama").value), el = $("#u-mirip");
  el.hidden = !mirip.length;
  if (mirip.length) el.textContent = "Nama mirip dengan karyawan yang sudah ada: " +
    mirip.map(u => u.nama + " (@" + (u.username || "-") + (u.aktif === false ? ", nonaktif" : "") + ")").join(", ") +
    ". Kalau orangnya sama, jangan buat akun baru. Pakai Reset perangkat & biometrik atau aktifkan kembali akunnya.";
}
let tCek = null;
$("#u-user").oninput = () => { clearTimeout(tCek); tCek = setTimeout(cekUsername, 400); };
$("#u-nama").oninput = () => { tampilMirip(); clearTimeout(tCek); tCek = setTimeout(cekUsername, 600); };
// Akun lama belum tercatat di daftar username: catat saat admin membuka menu Karyawan
async function catatUsernameLama(){
  for (const u of pengguna){
    if (!u.username || u.username.includes("@")) continue;
    try{ if (!(await sudahDipakai(u.username))) await setDoc(doc(db, "usernames", u.username), { uid: u.id, cid: CID }); }catch(e){}
  }
}

$("#u-add").onclick = async () => {
  const m = $("#u-msg"), nama = $("#u-nama").value.trim(), username = usernameAkhir($("#u-user").value.trim().toLowerCase()),
        pass = $("#u-pass").value, { role, peran } = bacaPeran($("#u-role").value || "karyawan");
  if (!perusahaan){ msg(m, "Pilih perusahaan dulu.", "bad"); return; }
  if (!nama){ msg(m, "Isi nama lengkap.", "bad"); return; }
  if (!validUsername(username)){ msg(m, "Username 3–20 karakter: huruf kecil, angka, titik, atau garis bawah.", "bad"); return; }
  if (pass.length < 8){ msg(m, "Password awal minimal 8 karakter.", "bad"); return; }
  const rekBaru = $("#u-rek").value.replace(/\D/g, "");
  if (rekBaru && (rekBaru.length < 6 || rekBaru.length > 20)){ msg(m, "Nomor rekening 6–20 angka.", "bad"); return; }
  const centangLok = [...document.querySelectorAll("[data-lok-baru]")];
  const pilihLok = centangLok.filter(x => x.checked).map(x => x.dataset.lokBaru);
  if (centangLok.length && !pilihLok.length){ msg(m, "Pilih minimal satu lokasi kerja.", "bad"); return; }
  const lokasiKerja = pilihLok.length === centangLok.length ? [] : pilihLok;
  if (await sudahDipakai(username)){ msg(m, "Username " + username + " sudah dipakai. Pilih salah satu saran di atas.", "bad"); cekUsername(); return; }
  const mirip = cariMirip(nama);
  if (mirip.length && !await tanya("Sudah ada karyawan bernama mirip:\n" + mirip.map(u => "• " + u.nama + " (@" + u.username + ")").join("\n") +
      "\n\nYakin ini orang yang BERBEDA dan perlu akun baru?")) return;
  $("#u-add").disabled = true; msg(m, "Membuat akun…");
  try{
    const uidBaru = await buatAkun(keEmail(username), pass, async uid => {
      const bt = writeBatch(db);
      const v = id => $("#" + id).value.trim();
      bt.set(doc(db, "users", uid), { nama, username, role, peran, cid: CID, kode: perusahaan.kode, lokasiKerja,
        nik: v("u-nik"), jabatan: v("u-jabatan"), divisi: v("u-divisi"), hp: v("u-hp"), masuk: v("u-masuk"), alamat: v("u-alamat"),
        shift: (aturan.shifts || []).length ? $("#u-shift").value : "", kehadiran: $("#u-kehadiran").value, grupCV: $("#u-cv").value === OPSI_CV_BARU ? "" : $("#u-cv").value, proyek: $("#u-proy").value === OPSI_PJ_BARU ? "" : $("#u-proy").value, dibuat: serverTimestamp(), dibuatOleh: profile.nama });
      bt.set(doc(db, "usernames", username), { uid, cid: CID });
      await bt.commit();
    });
    // Data gaji (khusus admin): disimpan kalau ada yang diisi
    if (isAdmin()){
      const n = id => parseInt0($("#" + id).value);
      const gaji = { gajiPokok: n("u-gp"), uangMakan: n("u-um"), tjJabatan: n("u-tj"), tjTransport: n("u-tt"), tunjangan: n("u-tl"),
        modeGaji: $("#u-mode").value, ikutKes: $("#u-kes").checked, ikutJht: $("#u-jht").checked, ikutJp: $("#u-jp").checked, kenaPph: $("#u-pph").checked,
        bank: $("#u-bank").value.trim(), noRek: $("#u-rek").value.replace(/\D/g, ""), atasNama: $("#u-an").value.trim() || ($("#u-rek").value.trim() ? nama : "") };
      const adaIsi = gaji.gajiPokok || gaji.uangMakan || gaji.tjJabatan || gaji.tjTransport || gaji.tunjangan || gaji.modeGaji || gaji.noRek || gaji.bank
        || !gaji.ikutKes || !gaji.ikutJht || !gaji.ikutJp || !gaji.kenaPph;
      if (adaIsi){ try{ await setDoc(D("payroll", uidBaru), { ...gaji, appVer: VERSI_APP }, { merge: true }); gajiMap[uidBaru] = gaji; }catch(e){ toast("Akun dibuat, tapi data gaji gagal disimpan: " + e.code); } }
    }
    $("#pengguna-wrap").hidden = true;            // tutup pop-up
    const dataLogin = `Akun Absensi Hadir untuk ${nama}\nAlamat: ${location.origin}\nUsername: ${username}\nPassword: ${pass}`;
    if (!(await tanya(`Akun ${nama} sudah dibuat.\n\nUsername: ${username}\nPassword: ${pass}\n\nBerikan data login ini ke karyawan.`, { ya: "Selesai", tidak: "Salin data login", bahaya: false }))){
      try{ await navigator.clipboard.writeText(dataLogin); toast("Data login disalin. Tempel di WhatsApp untuk dikirim."); }
      catch(e){ prompt("Salin data login ini:", dataLogin.replace(/\n/g, " | ")); }
    }
    // tampilkan karyawan baru: kosongkan pencarian, saring "Aktif", sorot kartunya
    idBaru = uidBaru; $("#k-cari").value = ""; $("#k-filter").value = "aktif";
    if (!pengguna.some(x => x.id === uidBaru))
      pengguna = [...pengguna, { id: uidBaru, nama, username, role, peran, cid: CID, lokasiKerja, jabatan: $("#u-jabatan").value.trim(), divisi: $("#u-divisi").value.trim(), hp: $("#u-hp").value.trim() }].sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    tampilPengguna(); if (isAdmin()) initGaji();
  }catch(e){
    msg(m, String(e?.code).includes("permission-denied")
      ? "Ditolak database. Aturan Firebase belum versi terbaru: jalankan deploy-rules.bat, lalu coba lagi."
      : authError(e), "bad");
    if (String(e?.code).includes("email-already-in-use")) cekUsername();
  }
  $("#u-add").disabled = false;
};

/* ---------- data demo (Cloud Function) ---------- */
const fns = getFunctions(app, "asia-southeast2");
async function jalankanDemo(nama, pertanyaan, tombol){
  const m = $("#demo-msg");
  if (!(await tanya(pertanyaan, { ya: nama === "hapusDataDemo" ? "Hapus" : "Isi data", bahaya: nama === "hapusDataDemo" }))) return;
  tombol.disabled = true; msg(m, "Memproses… bisa sampai 1 menit, jangan tutup halaman ini.");
  try{
    const r = (await httpsCallable(fns, nama, { timeout: 300000 })({ cid: CID,
      jumlahKaryawan: parseInt($("#demo-nk").value, 10) || 10, jumlahAbsen: parseInt($("#demo-na").value, 10) || 0 })).data;
    if (nama === "buatDataDemo")
      msg(m, "Selesai: " + fmtNum(r.akun.length) + " karyawan dan " + fmtNum(r.jumlahAbsen) + " absen dibuat. Login demo: " +
        r.akun.map(a => a.username).join(", ") + " (password " + r.password + ").", "ok");
    else msg(m, "Data demo dihapus: " + fmtNum(r.karyawan) + " karyawan, " + fmtNum(r.dokumen) + " data.", "ok");
    renderPengguna(); initGaji();
  }catch(e){
    console.error(e);
    msg(m, e.code === "functions/not-found"
      ? "Fungsi data demo belum terpasang. Jalankan: firebase deploy --only functions"
      : "Gagal: " + (e.message || "") + " [" + (e.code || "?") + (e.details ? " · " + JSON.stringify(e.details) : "") + "]", "bad");
  }
  tombol.disabled = false;
}
$("#demo-isi").onclick = e => {
  const nk = Math.min(10, Math.max(1, parseInt($("#demo-nk").value, 10) || 10)), na = Math.max(0, parseInt($("#demo-na").value, 10) || 0);
  jalankanDemo("buatDataDemo", "Isi " + nk + " karyawan demo dengan " + (na ? na + " absen acak" : "absensi sebulan penuh") +
    " ke perusahaan " + (perusahaan?.nama || "") + "?", e.target);
};
$("#demo-hapus").onclick = e => jalankanDemo("hapusDataDemo", "Hapus SEMUA data demo (akun, absen, izin, gaji, slip) dari perusahaan " + (perusahaan?.nama || "") + "?", e.target);

/* ---------- foto selfie absen ---------- */
function tambahSelfie(dl, r){
  const dt = document.createElement("dt"), dd = document.createElement("dd");
  dt.textContent = "Selfie";
  if (r.foto) dd.append(daftarLampiran([{ nama: "Selfie " + r.nama, path: r.foto, tipe: "image/jpeg" }]));
  else dd.textContent = "Tidak ada foto";
  if (r.live === false){ const w = document.createElement("div"); w.className = "meta"; w.style.color = "var(--warn)"; w.textContent = "⚠ Uji wajah hidup tidak berjalan saat absen ini"; dd.append(w); }
  dl.append(dt, dd);
}

/* ---------- Reset HP / wajah / sidik jari: pilihan mengikuti metode verifikasi perusahaan ---------- */
function bukaReset(u, tombol){
  const metode = $("#metode")?.value || "salah";
  const pakaiWajah = metode !== "jari", pakaiJari = metode !== "wajah";
  const NAMA_METODE = { salah: "wajah atau sidik jari", wajah: "wajah saja", jari: "sidik jari saja", keduanya: "wajah dan sidik jari" };
  const opsi = (k, ikon, judul, ket, ada) => `<label class="check reset-opsi${ada ? "" : " kosong"}"><input type="checkbox" data-r="${k}" ${ada ? "" : "disabled"}>
    <span><b>${ikon} ${judul}</b><br><span class="meta">${ada ? ket : "Belum terdaftar, tidak perlu direset"}</span></span></label>`;
  const f = document.createElement("div"); f.className = "reset-form";
  f.innerHTML = `<p class="meta" style="margin-top:0">Metode verifikasi perusahaan: <b>${NAMA_METODE[metode] || metode}</b>. Pilih yang ingin direset:</p>
    ${pakaiWajah ? opsi("wajah", "🙂", "Wajah", "Karyawan mendaftarkan wajah ulang (mis. wajah sering tidak cocok).", !!u.daftarWajah) : ""}
    ${pakaiJari ? opsi("jari", "👆", "Sidik jari", "Karyawan mendaftarkan sidik jari ulang (mis. ganti jari / sensor bermasalah).", !!u.daftarJari) : ""}
    ${opsi("hp", "📱", "Ganti HP", "Buka kunci HP lama. Wajah & sidik jari ikut direset karena datanya tersimpan di HP lama.", !!u.deviceId)}
    <p class="msg reset-msg"></p>
    <div class="btns" style="margin-top:10px"><button type="button" class="small reset-go">Reset</button><button type="button" class="small alt reset-batal">Batal</button></div>`;
  const cb = k => f.querySelector(`[data-r="${k}"]`);
  const sinkron = () => {
    const hp = cb("hp")?.checked;
    // Ganti HP: data biometrik ada di HP lama, jadi wajib ikut direset
    for (const k of ["wajah", "jari"]){ const x = cb(k); if (!x) continue;
      const ada = k === "wajah" ? u.daftarWajah : u.daftarJari;
      if (hp && ada){ x.checked = true; x.disabled = true; } else if (ada) x.disabled = false; }
    const dipilih = ["wajah", "jari", "hp"].some(k => cb(k)?.checked);
    f.querySelector(".reset-go").disabled = !dipilih;
  };
  f.querySelectorAll("input[data-r]").forEach(x => x.onchange = sinkron); sinkron();
  document.body.append(f);
  const buang = new MutationObserver(() => { if (f.hidden){ buang.disconnect(); f.remove(); } });
  buang.observe(f, { attributes: true, attributeFilter: ["hidden"] });
  f.querySelector(".reset-batal").onclick = () => { f.hidden = true; };
  f.querySelector(".reset-go").onclick = async e => {
    const hp = !!cb("hp")?.checked, wajah = hp ? !!u.daftarWajah : !!cb("wajah")?.checked, jari = hp ? !!u.daftarJari : !!cb("jari")?.checked;
    const apa = [hp && "HP", wajah && "wajah", jari && "sidik jari"].filter(Boolean);
    if (!apa.length) return;
    if (!await tanya("Reset " + apa.join(", ") + " " + u.nama + "?\nKaryawan harus mendaftar ulang (satu kali) sebelum bisa absen.", { ya: "Reset" })) return;
    e.target.disabled = true;
    try{
      if (hp && u.deviceId) await deleteDoc(doc(db, "devices", u.deviceId)).catch(() => {});
      const ubah = { direset: serverTimestamp(), diresetOleh: profile.nama, diresetApa: apa.join(", ") };
      if (hp) ubah.deviceId = "";
      if (wajah) ubah.daftarWajah = false;
      if (jari) ubah.daftarJari = false;
      await updateDoc(doc(db, "users", u.id), ubah);
      if (wajah) await deleteDoc(D("wajah", u.id)).catch(() => {});     // cadangan wajah lama tidak dipakai lagi
      if (hp) u.deviceId = ""; if (wajah) u.daftarWajah = false; if (jari) u.daftarJari = false;
      f.hidden = true;
      toast("Reset " + apa.join(", ") + " " + u.nama + " berhasil. Minta karyawan membuka aplikasi lalu mendaftar ulang.");
      tampilPengguna();
    }catch(err){ msg(f.querySelector(".reset-msg"), "Gagal: " + (err.code || err.message), "bad"); e.target.disabled = false; }
  };
  popup(f, "Reset · " + u.nama, tombol);
}

/* ---------- pop-up untuk form di kartu karyawan ---------- */
// Memindahkan form ke jendela pop-up; tertutup lewat ✕, Esc, klik di luar, atau saat form disembunyikan (Batal/Simpan)
function popup(form, judul, tombolAsal){
  const latar = document.createElement("div"); latar.className = "modal-latar";
  latar.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(judul)}">
      <div class="modal-kepala"><b></b><button type="button" class="modal-x" aria-label="Tutup">✕</button></div>
      <div class="modal-isi"></div></div>`;
  latar.querySelector(".modal-kepala b").textContent = judul;
  const tempat = document.createComment("form");
  form.before(tempat);
  latar.querySelector(".modal-isi").append(form);
  document.body.append(latar); document.body.classList.add("ada-modal");
  const tutup = () => {
    if (!latar.isConnected) return;
    pengamat.disconnect(); document.removeEventListener("keydown", tombol);
    form.hidden = true;
    if (tempat.isConnected) tempat.replaceWith(form); else form.remove();
    latar.remove();
    if (!document.querySelector(".modal-latar")) document.body.classList.remove("ada-modal");
    tombolAsal?.focus?.();
  };
  const pengamat = new MutationObserver(() => { if (form.hidden) tutup(); });
  pengamat.observe(form, { attributes: true, attributeFilter: ["hidden"] });
  const tombol = e => { if (e.key === "Escape") tutup(); };
  document.addEventListener("keydown", tombol);
  latar.querySelector(".modal-x").onclick = tutup;
  latar.addEventListener("mousedown", e => { if (e.target === latar) tutup(); });
  setTimeout(() => form.querySelector("input:not([disabled]),select,textarea")?.focus(), 50);
}

/* ---------- karyawan berhenti ---------- */
const JENIS_BERHENTI = ["Mengundurkan diri", "Habis kontrak", "PHK", "Pensiun", "Meninggal dunia", "Lainnya"];
const tglPendek = t => t ? tglMedium(t) : "-";
function bukaBerhenti(u, f, tombol){
  const n = new Date(), hariIni = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  if (u.berhenti){
    // sudah berhenti: tampilkan data & surat
    const b = u.berhenti;
    f.innerHTML = `<dl class="kv"><dt>Tanggal</dt><dd>${esc(tglPendek(b.tanggal))}</dd><dt>Jenis</dt><dd>${esc(b.jenis || "-")}</dd>
        <dt>Keterangan</dt><dd>${esc(b.keterangan || "-")}</dd><dt>Dicatat oleh</dt><dd>${esc(b.oleh || "-")}</dd>
        <dt>Surat</dt><dd class="bh-surat">${(b.lampiran || []).length ? "" : "Tidak ada lampiran"}</dd></dl>
      <div class="btns" style="margin-top:14px"><button class="small alt bh-tutup">Tutup</button>
        <button class="small bh-batal-berhenti">Batalkan status berhenti</button></div>`;
    if ((b.lampiran || []).length) f.querySelector(".bh-surat").append(daftarLampiran(b.lampiran));
    f.hidden = false; popup(f, "Data berhenti · " + u.nama, tombol);
    f.querySelector(".bh-tutup").onclick = () => { f.hidden = true; };
    f.querySelector(".bh-batal-berhenti").onclick = async e => {
      if (!(await tanya(`Batalkan status berhenti ${u.nama} dan aktifkan kembali akunnya?`, { ya: "Aktifkan kembali", bahaya: false }))) return;
      e.target.disabled = true;
      try{
        await updateDoc(doc(db, "users", u.id), { berhenti: null, aktif: true, diubah: serverTimestamp(), diubahOleh: profile.nama });
        u.berhenti = null; u.aktif = true; f.hidden = true; toast(u.nama + " aktif kembali."); tampilPengguna(); if (isAdmin()) initGaji();
      }catch(err){ toast("Gagal: " + err.code); e.target.disabled = false; }
    };
    return;
  }
  f.innerHTML = `<label>Tanggal berhenti *</label><input class="bh-tgl" type="date" max="${hariIni}" value="${hariIni}">
    <label>Jenis *</label><select class="bh-jenis">${JENIS_BERHENTI.map(j => `<option>${j}</option>`).join("")}</select>
    <label>Keterangan</label><textarea class="bh-ket" rows="2" placeholder="mis. pindah kerja, alasan keluarga"></textarea>
    <label>Lampiran surat</label>
    <label class="addfile"><input type="file" class="bh-file" accept="application/pdf,image/*" multiple>📎 Pilih surat (PDF/JPG/PNG, maks. 5 MB per file)</label>
    <div class="bh-daftar meta"></div>
    <label class="check" style="margin-top:12px"><input type="checkbox" class="bh-nonaktif" checked> <span>Nonaktifkan akun (tidak bisa login & tidak masuk hitungan gaji)</span></label>
    <p class="meta" style="margin:6px 0 0">Riwayat absen, izin, gaji, dan slip tetap tersimpan.</p>
    <div class="btns" style="margin-top:14px"><button class="small bh-simpan">Simpan</button><button class="small alt bh-batal">Batal</button></div>
    <div class="msg bh-msg" role="status"></div>`;
  f.hidden = false; popup(f, "Berhenti · " + u.nama, tombol);
  let berkas = [];
  const tampilBerkas = () => { f.querySelector(".bh-daftar").innerHTML = berkas.map((b, i) =>
      `<div class="bh-item">📄 ${esc(b.name)} <span>(${(b.size / 1024 / 1024).toFixed(2)} MB)</span> <button type="button" class="small alt bh-x" data-i="${i}" aria-label="Hapus file">✕</button></div>`).join("");
    f.querySelectorAll(".bh-x").forEach(x => x.onclick = () => { berkas.splice(+x.dataset.i, 1); tampilBerkas(); }); };
  f.querySelector(".bh-file").onchange = ev => {
    for (const fl of ev.target.files){
      if (fl.size > 5 * 1024 * 1024){ toast(fl.name + " lebih dari 5 MB."); continue; }
      if (!/^(image\/|application\/pdf)/.test(fl.type)){ toast(fl.name + ": hanya PDF atau gambar."); continue; }
      berkas.push(fl);
    }
    ev.target.value = ""; tampilBerkas();
  };
  f.querySelector(".bh-batal").onclick = () => { f.hidden = true; };
  f.querySelector(".bh-simpan").onclick = async e => {
    const m = f.querySelector(".bh-msg"), tanggal = f.querySelector(".bh-tgl").value, jenis = f.querySelector(".bh-jenis").value;
    if (!tanggal || tanggal > hariIni){ msg(m, "Isi tanggal berhenti (tidak boleh melewati hari ini).", "bad"); return; }
    const nonaktif = f.querySelector(".bh-nonaktif").checked;
    if (!(await tanya(`Catat ${u.nama} berhenti (${jenis}) per ${tglPendek(tanggal)}?` + (nonaktif ? "\nAkunnya akan dinonaktifkan." : ""), { ya: "Simpan", bahaya: true }))) return;
    e.target.disabled = true;
    try{
      const lampiran = [];
      for (const [i, fl] of berkas.entries()){
        msg(m, `Mengunggah surat ${i + 1}/${berkas.length}…`);
        const path = `berhenti/${CID}/${u.id}/${Date.now()}-${fl.name.replace(/[^\w.\-]+/g, "_")}`;
        await unggahB(sRefB(storageB, path), fl, { contentType: fl.type });
        lampiran.push({ nama: fl.name, path, tipe: fl.type, ukuran: fl.size });
      }
      const berhenti = { tanggal, jenis, keterangan: f.querySelector(".bh-ket").value.trim(), lampiran, oleh: profile.nama, olehUid: me.uid, dicatat: new Date().toISOString() };
      await updateDoc(doc(db, "users", u.id), { berhenti, ...(nonaktif ? { aktif: false } : {}), diubah: serverTimestamp(), diubahOleh: profile.nama });
      Object.assign(u, { berhenti, ...(nonaktif ? { aktif: false } : {}) });
      f.hidden = true; toast(u.nama + " dicatat berhenti" + (lampiran.length ? " dengan " + lampiran.length + " surat." : "."));
      tampilPengguna(); if (isAdmin()) initGaji();
    }catch(err){ msg(m, err.code === "storage/unauthorized" || err.code === "permission-denied"
        ? "Ditolak server. Pastikan aturan terbaru sudah dipasang (deploy-rules.bat)." : "Gagal: " + (err.code || err.message), "bad"); e.target.disabled = false; }
  };
}

/* ---------- daftar & edit karyawan ---------- */
let pengguna = [];
const PERAN = { karyawan: "Karyawan", supervisor: "Supervisor", admin: "Admin", superadmin: "Superadmin" };
/* ---------- peran tambahan (admin dikunci) ---------- */
let daftarPeran = [], peranEdit = [], unsubPeran = null;
const AKSES_NAMA = { karyawan: "Setara Karyawan", supervisor: "Setara Supervisor" };
// Nama peran yang ditampilkan untuk seorang pengguna
// Lebih HK hanya untuk karyawan yang bukan operator / supir
const tanpaLebihHK = u => u.kehadiran === "manual" || /operator|supir|sopir|driver/i.test(labelPeran(u) || "");
const labelPeran = u => (u.peran && daftarPeran.find(x => x.id === u.peran)?.nama) || PERAN[u.role] || u.role;
// Pilihan peran untuk <select>: bawaan + tambahan. Supervisor hanya boleh memilih peran setara karyawan.
function opsiPeran(roleNow = "karyawan", peranNow = ""){
  const bolehSemua = isAdmin();
  // peran Admin hanya bisa diberikan superadmin (akun yang sudah admin tetap tampil supaya tidak tergeser)
  const bawaan = (bolehSemua ? ["karyawan", "supervisor", ...(isSuper() || roleNow === "admin" ? ["admin"] : [])] : ["karyawan"])
    .map(r => `<option value="${r}" ${!peranNow && roleNow === r ? "selected" : ""}>${PERAN[r]}</option>`);
  const tambahan = daftarPeran.filter(x => bolehSemua || x.akses === "karyawan")
    .map(x => `<option value="c:${esc(x.id)}" ${peranNow === x.id ? "selected" : ""}>${esc(x.nama)} (${AKSES_NAMA[x.akses]})</option>`);
  return bawaan.join("") + (tambahan.length ? `<optgroup label="Peran tambahan">${tambahan.join("")}</optgroup>` : "");
}
// Nilai <select> -> { role (akses sistem), peran (id peran tambahan) }
function bacaPeran(v){
  if (String(v).startsWith("c:")){ const x = daftarPeran.find(p => p.id === v.slice(2)); return { role: x?.akses || "karyawan", peran: x?.id || "" }; }
  return { role: v || "karyawan", peran: "" };
}
function pantauPeran(){
  if (unsubPeran || !CID) return;
  subs.push(onSnapshot(D("settings", "proyek"), x => {
    daftarPJ = (x.exists() ? x.data().daftar : []) || [];
    pjEdit = daftarPJ.map(c => ({ ...c })); renderPJKelola(); isiPilihPJ();
    if (pengguna.length) tampilPengguna();
  }, () => {}));
  subs.push(onSnapshot(D("settings", "grupcv"), x => {
    daftarCV = (x.exists() ? x.data().daftar : []) || [];
    cvEdit = daftarCV.map(c => ({ ...c })); renderCVKelola(); isiPilihCV(); isiAlphaCV();
    if (pengguna.length) tampilPengguna();
  }, () => {}));
  unsubPeran = onSnapshot(D("settings", "peran"), x => {
    daftarPeran = (x.exists() ? x.data().daftar : []) || [];
    peranEdit = daftarPeran.map(p => ({ ...p }));
    renderPeranKelola();
    $("#u-role").innerHTML = opsiPeran($("#u-role").value || "karyawan");
    if (pengguna.length) tampilPengguna();
    sinkronGajiKaryawan();
  }, () => {});
  subs.push(() => { unsubPeran?.(); unsubPeran = null; });
}
/* ---------- Group CV (per perusahaan) ---------- */
let daftarCV = [], cvEdit = [];
const namaCV = id => daftarCV.find(c => c.id === id)?.nama || "";
const cvId = () => "cv" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function renderCVKelola(){
  $("#cv-wrap").hidden = !isAdmin();
  $("#cv-ringkas").textContent = "· " + fmtNum(daftarCV.length) + " CV";
  $("#cv-list").innerHTML = cvEdit.length ? cvEdit.map((c, i) => { const n = pengguna.filter(u => u.grupCV === c.id).length;
    return `<div class="peran-row cv-row" data-i="${i}"><input class="cv-nama" placeholder="Nama CV, mis. CV Maju Jaya" maxlength="60" value="${esc(c.nama || "")}">
      <button type="button" class="small alt cv-hapus" aria-label="Hapus Group CV">✕</button>${n ? `<span class="meta pr-dipakai">Dipakai ${fmtNum(n)} orang</span>` : ""}</div>`; }).join("")
    : '<p class="meta" style="margin:0">Belum ada Group CV.</p>';
  $("#cv-list").querySelectorAll(".cv-hapus").forEach(b => b.onclick = async () => {
    bacaCVEdit(); const c = cvEdit[+b.parentElement.dataset.i], n = pengguna.filter(u => u.grupCV === c.id).length;
    if (n && !await tanya(`Group CV "${c.nama}" dipakai ${n} orang. Hapus? Karyawan tersebut menjadi tanpa Group CV.`, { ya: "Hapus" })) return;
    cvEdit.splice(+b.parentElement.dataset.i, 1); renderCVKelola();
  });
}
function bacaCVEdit(){ document.querySelectorAll("#cv-list .cv-row").forEach(r => { cvEdit[+r.dataset.i].nama = r.querySelector(".cv-nama").value.trim(); }); return cvEdit; }
async function simpanDaftarCV(daftar){
  await setDoc(D("settings", "grupcv"), { daftar, diubah: serverTimestamp(), oleh: profile.nama });
  daftarCV = daftar; cvEdit = daftar.map(c => ({ ...c })); renderCVKelola(); isiPilihCV();
  catatLog(CID, me.uid, profile, "pengaturan", "Mengubah daftar Group CV: " + (daftar.map(c => c.nama).join(", ") || "kosong"));
}
$("#cv-tambah").onclick = () => { bacaCVEdit(); cvEdit.push({ id: cvId(), nama: "" }); renderCVKelola(); [...document.querySelectorAll("#cv-list .cv-nama")].pop()?.focus(); };
$("#cv-simpan").onclick = async () => {
  const m = $("#cv-msg"), daftar = bacaCVEdit().map(c => ({ id: c.id, nama: c.nama }));
  if (daftar.some(c => !c.nama)){ msg(m, "Isi nama setiap Group CV (atau hapus yang kosong).", "bad"); return; }
  if (new Set(daftar.map(c => c.nama.toLowerCase())).size !== daftar.length){ msg(m, "Nama Group CV tidak boleh sama.", "bad"); return; }
  try{ await simpanDaftarCV(daftar); msg(m, "Group CV tersimpan.", "ok"); }
  catch(e){ msg(m, "Gagal menyimpan: " + (e.code || e.message), "bad"); }
};
// Isi semua pilihan Group CV (form Tambah karyawan, Edit karyawan, filter). Pilihan terakhir: tambah CV baru langsung.
const OPSI_CV_BARU = "__baru__";
function opsiCV(nilai = ""){
  return `<option value="">— Tanpa Group CV —</option>${daftarCV.map(c => `<option value="${esc(c.id)}" ${c.id === nilai ? "selected" : ""}>${esc(c.nama)}</option>`).join("")}` +
    (isAdmin() ? `<option value="${OPSI_CV_BARU}">＋ Tambah Group CV baru…</option>` : "");
}
function isiPilihCV(){
  document.querySelectorAll("select.pilih-cv").forEach(sel => { const v = sel.value; sel.innerHTML = opsiCV(v); sel.value = daftarCV.some(c => c.id === v) ? v : ""; });
  const f = $("#k-cv-f"); if (f){ const v = f.value;
    f.innerHTML = '<option value="">Semua Group CV</option><option value="-">Tanpa Group CV</option>' + daftarCV.map(c => `<option value="${esc(c.id)}">${esc(c.nama)}</option>`).join("");
    f.value = [...f.options].some(o => o.value === v) ? v : ""; f.hidden = !daftarCV.length; }
  // filter Group CV di Gaji › Karyawan (hanya CV yang boleh dilihat admin ini)
  const g = $("#k-cvg"); if (g){ const v = g.value;
    const ops = [...daftarCV.map(c => [c.id, c.nama]), ["-", "Tanpa Group CV"]].filter(([id]) => cvBoleh({ grupCV: id === "-" ? "" : id }));
    g.innerHTML = '<option value="">Semua Group CV</option>' + ops.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join("");
    g.value = [...g.options].some(o => o.value === v) ? v : ""; $("#k-cvg-wrap").hidden = !daftarCV.length; }
}
// Memilih "＋ Tambah Group CV baru…" di dropdown mana pun: minta nama, simpan, lalu langsung terpilih
document.addEventListener("change", async e => {
  const sel = e.target; if (!sel.matches?.("select.pilih-cv") || sel.value !== OPSI_CV_BARU) return;
  sel.value = "";
  const box = document.createElement("div");
  box.innerHTML = `<label>Nama Group CV baru</label><input class="cvb-nama" maxlength="60" placeholder="mis. CV Maju Jaya">
    <p class="msg cvb-msg"></p><div class="btns" style="margin-top:10px"><button type="button" class="small cvb-simpan">Tambah</button><button type="button" class="small alt cvb-batal">Batal</button></div>`;
  document.body.append(box);
  new MutationObserver((_, o) => { if (box.hidden){ o.disconnect(); box.remove(); } }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  box.querySelector(".cvb-batal").onclick = () => { box.hidden = true; };
  const simpan = async () => {
    const nama = box.querySelector(".cvb-nama").value.trim(), m = box.querySelector(".cvb-msg");
    if (!nama){ msg(m, "Isi nama Group CV.", "bad"); return; }
    const ada = daftarCV.find(c => c.nama.toLowerCase() === nama.toLowerCase());
    try{
      let id = ada?.id;
      if (!ada){ id = cvId(); await simpanDaftarCV([...daftarCV, { id, nama }]); }
      sel.value = id; sel.dispatchEvent(new Event("input", { bubbles: true })); box.hidden = true; toast(ada ? "Group CV sudah ada, dipilih." : "Group CV " + nama + " ditambahkan.");
    }catch(err){ msg(m, "Gagal: " + (err.code || err.message), "bad"); }
  };
  box.querySelector(".cvb-simpan").onclick = simpan;
  box.querySelector(".cvb-nama").addEventListener("keydown", ev => { if (ev.key === "Enter") simpan(); });
  popup(box, "Tambah Group CV", sel);
});

/* ---------- Proyek (per perusahaan) ---------- */
let daftarPJ = [], pjEdit = [];
const namaPJ = id => daftarPJ.find(c => c.id === id)?.nama || "";
const pjId = () => "pj" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function renderPJKelola(){
  $("#proy-wrap").hidden = !isAdmin();
  $("#proy-ringkas").textContent = "· " + fmtNum(daftarPJ.length) + " proyek";
  $("#proy-list").innerHTML = pjEdit.length ? pjEdit.map((c, i) => { const n = pengguna.filter(u => u.proyek === c.id).length;
    return `<div class="peran-row proy-row" data-i="${i}"><input class="proy-nama" placeholder="Nama proyek, mis. Proyek Landfill" maxlength="60" value="${esc(c.nama || "")}">
      <button type="button" class="small alt proy-hapus" aria-label="Hapus proyek">✕</button>${n ? `<span class="meta pr-dipakai">Dipakai ${fmtNum(n)} orang</span>` : ""}</div>`; }).join("")
    : '<p class="meta" style="margin:0">Belum ada proyek.</p>';
  $("#proy-list").querySelectorAll(".proy-hapus").forEach(b => b.onclick = async () => {
    bacaPJEdit(); const c = pjEdit[+b.parentElement.dataset.i], n = pengguna.filter(u => u.proyek === c.id).length;
    if (n && !await tanya(`Proyek "${c.nama}" dipakai ${n} orang. Hapus? Karyawan tersebut menjadi tanpa proyek.`, { ya: "Hapus" })) return;
    pjEdit.splice(+b.parentElement.dataset.i, 1); renderPJKelola();
  });
}
function bacaPJEdit(){ document.querySelectorAll("#proy-list .proy-row").forEach(r => { pjEdit[+r.dataset.i].nama = r.querySelector(".proy-nama").value.trim(); }); return pjEdit; }
async function simpanDaftarPJ(daftar){
  await setDoc(D("settings", "proyek"), { daftar, diubah: serverTimestamp(), oleh: profile.nama });
  daftarPJ = daftar; pjEdit = daftar.map(c => ({ ...c })); renderPJKelola(); isiPilihPJ();
  catatLog(CID, me.uid, profile, "pengaturan", "Mengubah daftar proyek: " + (daftar.map(c => c.nama).join(", ") || "kosong"));
}
$("#proy-tambah").onclick = () => { bacaPJEdit(); pjEdit.push({ id: pjId(), nama: "" }); renderPJKelola(); [...document.querySelectorAll("#proy-list .proy-nama")].pop()?.focus(); };
$("#proy-simpan").onclick = async () => {
  const m = $("#proy-msg"), daftar = bacaPJEdit().map(c => ({ id: c.id, nama: c.nama }));
  if (daftar.some(c => !c.nama)){ msg(m, "Isi nama setiap proyek (atau hapus yang kosong).", "bad"); return; }
  if (new Set(daftar.map(c => c.nama.toLowerCase())).size !== daftar.length){ msg(m, "Nama proyek tidak boleh sama.", "bad"); return; }
  try{ await simpanDaftarPJ(daftar); msg(m, "Proyek tersimpan.", "ok"); }
  catch(e){ msg(m, "Gagal menyimpan: " + (e.code || e.message), "bad"); }
};
// Isi semua pilihan proyek (form Tambah karyawan, Edit karyawan, filter). Pilihan terakhir: tambah CV baru langsung.
const OPSI_PJ_BARU = "__pjbaru__";
function opsiPJ(nilai = ""){
  return `<option value="">— Tanpa proyek —</option>${daftarPJ.map(c => `<option value="${esc(c.id)}" ${c.id === nilai ? "selected" : ""}>${esc(c.nama)}</option>`).join("")}` +
    (isAdmin() ? `<option value="${OPSI_PJ_BARU}">＋ Tambah proyek baru…</option>` : "");
}
function isiPilihPJ(){
  document.querySelectorAll("select.pilih-proy").forEach(sel => { const v = sel.value; sel.innerHTML = opsiPJ(v); sel.value = daftarPJ.some(c => c.id === v) ? v : ""; });
  const f = $("#k-proy-f"); if (f){ const v = f.value;
    f.innerHTML = '<option value="">Semua proyek</option><option value="-">Tanpa proyek</option>' + daftarPJ.map(c => `<option value="${esc(c.id)}">${esc(c.nama)}</option>`).join("");
    f.value = [...f.options].some(o => o.value === v) ? v : ""; }
}
// Memilih "＋ Tambah proyek baru…" di dropdown mana pun: minta nama, simpan, lalu langsung terpilih
document.addEventListener("change", async e => {
  const sel = e.target; if (!sel.matches?.("select.pilih-proy") || sel.value !== OPSI_PJ_BARU) return;
  sel.value = "";
  const box = document.createElement("div");
  box.innerHTML = `<label>Nama proyek baru</label><input class="proyb-nama" maxlength="60" placeholder="mis. Proyek Landfill">
    <p class="msg proyb-msg"></p><div class="btns" style="margin-top:10px"><button type="button" class="small proyb-simpan">Tambah</button><button type="button" class="small alt proyb-batal">Batal</button></div>`;
  document.body.append(box);
  new MutationObserver((_, o) => { if (box.hidden){ o.disconnect(); box.remove(); } }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  box.querySelector(".proyb-batal").onclick = () => { box.hidden = true; };
  const simpan = async () => {
    const nama = box.querySelector(".proyb-nama").value.trim(), m = box.querySelector(".proyb-msg");
    if (!nama){ msg(m, "Isi nama proyek.", "bad"); return; }
    const ada = daftarPJ.find(c => c.nama.toLowerCase() === nama.toLowerCase());
    try{
      let id = ada?.id;
      if (!ada){ id = pjId(); await simpanDaftarPJ([...daftarPJ, { id, nama }]); }
      sel.value = id; sel.dispatchEvent(new Event("input", { bubbles: true })); box.hidden = true; toast(ada ? "Proyek sudah ada, dipilih." : "Proyek " + nama + " ditambahkan.");
    }catch(err){ msg(m, "Gagal: " + (err.code || err.message), "bad"); }
  };
  box.querySelector(".proyb-simpan").onclick = simpan;
  box.querySelector(".proyb-nama").addEventListener("keydown", ev => { if (ev.key === "Enter") simpan(); });
  popup(box, "Tambah proyek", sel);
});

function renderPeranKelola(){
  $("#peran-wrap").hidden = !isSuper();        // pengaturan peran & akses khusus superadmin
  $("#peran-ringkas").textContent = "· " + fmtNum(3 + daftarPeran.length) + " peran";
  const kunci = ["admin", "supervisor", "karyawan"].map(r => `<div class="peran-row kunci"><span>🔒 <b>${PERAN[r]}</b></span>
      <span class="meta">${r === "admin" ? "Akses penuh" : r === "supervisor" ? "Setujui izin, laporan, tambah karyawan" : "Absen"}</span></div>`).join("");
  const tambahan = peranEdit.map((x, i) => `<div class="peran-row" data-i="${i}">
      <input class="pr-nama" placeholder="Nama peran, mis. Kepala Gudang" value="${esc(x.nama || "")}">
      <select class="pr-akses"><option value="karyawan" ${x.akses !== "supervisor" ? "selected" : ""}>Setara Karyawan</option>
        <option value="supervisor" ${x.akses === "supervisor" ? "selected" : ""}>Setara Supervisor</option></select>
      <button type="button" class="small alt pr-hapus" aria-label="Hapus peran">✕</button>
      ${pengguna.filter(u => u.peran === x.id).length ? `<span class="meta pr-dipakai">Dipakai ${fmtNum(pengguna.filter(u => u.peran === x.id).length)} orang</span>` : ""}</div>`).join("");
  $("#peran-list").innerHTML = kunci + tambahan;
  $("#peran-list").querySelectorAll(".pr-hapus").forEach(b => b.onclick = async () => {
    bacaPeranEdit();
    const x = peranEdit[+b.parentElement.dataset.i], n = pengguna.filter(u => u.peran === x.id).length;
    if (n && !(await tanya(`Peran "${x.nama}" dipakai ${n} orang. Hapus? Mereka kembali ke peran ${PERAN[x.akses]} (akses tidak berubah).`, { ya: "Hapus", bahaya: true }))) return;
    peranEdit.splice(+b.parentElement.dataset.i, 1); renderPeranKelola();
  });
}
function bacaPeranEdit(){
  document.querySelectorAll("#peran-list .peran-row:not(.kunci)").forEach(r => {
    const x = peranEdit[+r.dataset.i]; x.nama = r.querySelector(".pr-nama").value.trim(); x.akses = r.querySelector(".pr-akses").value;
  });
  return peranEdit;
}
$("#peran-tambah").onclick = () => {
  bacaPeranEdit(); peranEdit.push({ id: Math.random().toString(36).slice(2, 8), nama: "", akses: "karyawan" }); renderPeranKelola();
  [...document.querySelectorAll("#peran-list .pr-nama")].pop().focus();
};
$("#peran-simpan").onclick = async () => {
  if (!isSuper()){ toast("Peran & akses hanya bisa diatur superadmin."); return; }
  const m = $("#peran-msg"), daftar = bacaPeranEdit().map(x => ({ id: x.id, nama: x.nama, akses: x.akses === "supervisor" ? "supervisor" : "karyawan" }));
  if (daftar.some(x => !x.nama)){ msg(m, "Isi nama setiap peran.", "bad"); return; }
  const nama = daftar.map(x => x.nama.toLowerCase());
  if (nama.some((n, i) => nama.indexOf(n) !== i) || nama.some(n => ["admin", "supervisor", "karyawan", "superadmin"].includes(n))){
    msg(m, "Nama peran tidak boleh kembar atau sama dengan peran bawaan.", "bad"); return; }
  try{
    // Karyawan dengan peran yang dihapus/diubah aksesnya ikut disesuaikan
    const bt = writeBatch(db); let ubah = 0;
    pengguna.forEach(u => {
      if (!u.peran) return;
      const x = daftar.find(p => p.id === u.peran);
      if (!x){ bt.update(doc(db, "users", u.id), { peran: "" }); ubah++; }
      else if (x.akses !== u.role && u.role !== "admin" && u.role !== "superadmin"){ bt.update(doc(db, "users", u.id), { role: x.akses }); ubah++; }
    });
    bt.set(D("settings", "peran"), { daftar, diubah: serverTimestamp(), oleh: profile.nama });
    await bt.commit();
    msg(m, "Peran tersimpan." + (ubah ? " " + fmtNum(ubah) + " karyawan disesuaikan." : ""), "ok");
  }catch(e){ msg(m, e.code === "permission-denied" ? "Hanya admin yang bisa mengubah peran." : "Gagal: " + e.code, "bad"); }
};
const FIELD = [["nik", "Nomor induk"], ["jabatan", "Jabatan"], ["divisi", "Divisi"], ["hp", "No. HP", "tel"],
               ["masuk", "Tanggal masuk", "date"], ["alamat", "Alamat"]];
// Kosongkan form tambah karyawan & siapkan pilihan shift/gaji
function siapkanFormTambah(){
  ["u-nama","u-user","u-pass","u-nik","u-jabatan","u-divisi","u-hp","u-masuk","u-alamat","u-gp","u-um","u-tj","u-tt","u-tl","u-bank","u-rek","u-an","u-kehadiran","u-cv","u-proy"].forEach(id => $("#" + id).value = "");
  $("#u-mode").value = MODE_BAWAAN(); ["u-kes","u-jht","u-jp","u-pph"].forEach(id => $("#" + id).checked = true);
  $("#u-cek").textContent = ""; $("#u-saran-wrap").hidden = true; $("#u-mirip").hidden = true; msg($("#u-msg"), "");
  const sh = aturan.shifts || [];
  $("#u-shift").innerHTML = `<option value="">Jam kerja utama (${esc(aturan.jamMasuk || "08:00")}–${esc(aturan.jamPulang || "17:00")})</option>` +
    sh.map(x => `<option value="${esc(x.id)}">${esc(x.nama)} (${esc(x.masuk)}–${esc(x.pulang)})</option>`).join("");
  $("#u-shift-wrap").hidden = !sh.length;
  $("#u-gaji-wrap").hidden = !isAdmin();
  document.querySelectorAll("#u-gaji-wrap .ikut").forEach(x => x.hidden = !!aturan.potonganManual);
  $("#u-gp-label").textContent = PER_HARI(aturan.modeGaji) ? "Upah per hari" : "Gaji pokok";
  $("#u-mode").onchange = () => { $("#u-gp-label").textContent = PER_HARI($("#u-mode").value || aturan.modeGaji) ? "Upah per hari" : "Gaji pokok"; };
  renderLokasiTambah();
}
$("#k-tambah-btn").onclick = () => {
  siapkanFormTambah();
  $("#pengguna-wrap").hidden = false;
  popup($("#pengguna-wrap"), "Tambah karyawan", $("#k-tambah-btn"));
};
// Pilihan lokasi kerja di form Tambah karyawan (semua dicentang = boleh di semua lokasi)
function renderLokasiTambah(){
  const box = $("#u-lokasi");
  if (daftarLokasi.length > 1){
    box.innerHTML = `<label>Lokasi kerja</label><div class="lok-pilih">${daftarLokasi.map(L =>
      `<label class="check"><input type="checkbox" data-lok-baru="${esc(L.id)}" checked> ${esc(L.nama)}</label>`).join("")}</div>
      <p class="meta" style="margin:4px 0 0">Semua dicentang = boleh absen di lokasi mana pun.</p>`;
  } else {
    box.innerHTML = `<label>Lokasi kerja</label><p class="meta" style="margin:2px 0 0">${daftarLokasi.length ? "Semua karyawan absen di " + esc(daftarLokasi[0].nama) + "." : "Lokasi absen belum diatur."} Tambahkan lokasi lain (misalnya Gudang) di <b>Pengaturan > Lokasi absen</b> untuk memilih lokasi kerja per karyawan.</p>`;
  }
}
$("#u-batal").onclick = () => { $("#pengguna-wrap").hidden = true; msg($("#u-msg"), ""); };
$("#k-cari").oninput = $("#k-filter").onchange = () => tampilPengguna();
$("#k-peran-f").onchange = $("#k-lok-f").onchange = $("#k-cv-f").onchange = $("#k-proy-f").onchange = () => tampilPengguna();

// Daftar karyawan realtime: berubah otomatis saat ada yang menambah/mengedit/menghapus
let unsubPengguna = null, sudahCatatLama = false, idBaru = "";
function renderPengguna(){
  if (!CID) return;
  try{ renderHariTabel(); }catch(e){}
  pantauPeran();
  $("#u-role").innerHTML = opsiPeran($("#u-role").value || "karyawan");
  if (unsubPengguna){ tampilPengguna(); return; }
  unsubPengguna = onSnapshot(query(collection(db, "users"), where("cid", "==", CID)), snap => {
    pengguna = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    tampilPengguna(); sinkronGajiKaryawan();
    if (!sudahCatatLama){ sudahCatatLama = true; catatUsernameLama(); }
  }, e => { $("#pengguna-list").innerHTML = '<p class="meta">Gagal memuat: ' + e.code + '</p>'; });
  subs.push(() => { unsubPengguna?.(); unsubPengguna = null; sudahCatatLama = false; });
}
// Pilihan filter peran & lokasi (dipakai di menu Karyawan dan Gaji > Karyawan)
function isiFilterPeran(sel){
  const now = sel.value;
  sel.innerHTML = '<option value="">Semua peran</option>' + ["karyawan", "supervisor", "admin"].map(r => `<option value="${r}">${PERAN[r]}</option>`).join("") +
    (daftarPeran.length ? '<optgroup label="Peran tambahan">' + daftarPeran.map(x => `<option value="c:${esc(x.id)}">${esc(x.nama)}</option>`).join("") + "</optgroup>" : "");
  sel.value = [...sel.options].some(o => o.value === now) ? now : "";
}
function isiFilterLokasi(sel){
  const now = sel.value;
  sel.innerHTML = '<option value="">Semua lokasi</option>' + daftarLokasi.map(L => `<option value="${esc(L.id)}">${esc(L.nama)}</option>`).join("");
  sel.value = [...sel.options].some(o => o.value === now) ? now : "";
  sel.hidden = daftarLokasi.length < 2 && !now;
}
const cocokPeran = (u, v) => !v || (v.startsWith("c:") ? u.peran === v.slice(2) : (u.role === v && !u.peran));
// lokasi kerja kosong = boleh di semua lokasi, jadi ikut tampil di filter lokasi mana pun
const cocokLokasi = (u, v) => !v || !(u.lokasiKerja || []).length || u.lokasiKerja.includes(v);
const teksLokasi = u => (!(u.lokasiKerja || []).length ? "Semua lokasi" : (daftarLokasi.filter(L => u.lokasiKerja.includes(L.id)).map(L => L.nama).join(", ") || "-"))
  + (+u.radiusTambah ? " · radius +" + fmtNum(+u.radiusTambah) + " m" : "");
function tampilPengguna(){
  isiFilterPeran($("#k-peran-f")); isiFilterLokasi($("#k-lok-f"));
  const q = $("#k-cari").value.trim().toLowerCase(), f = $("#k-filter").value;
  const fp = $("#k-peran-f").value, fl = $("#k-lok-f").value, fc = $("#k-cv-f").value, fj = $("#k-proy-f").value;
  const list = pengguna.filter(u =>
    (f === "semua" || (f === "berhenti" ? !!u.berhenti : (f === "aktif") === (u.aktif !== false))) && cocokPeran(u, fp) && cocokLokasi(u, fl) &&
    (!fc || (fc === "-" ? !namaCV(u.grupCV) : u.grupCV === fc)) &&
    (!fj || (fj === "-" ? !namaPJ(u.proyek) : u.proyek === fj)) &&
    (!q || [u.nama, u.username, u.jabatan, u.divisi, u.nik, namaCV(u.grupCV), namaPJ(u.proyek)].some(x => String(x || "").toLowerCase().includes(q))));
  const aktif = pengguna.filter(u => u.aktif !== false).length;
  $("#k-info").textContent = fmtNum(aktif) + " aktif · " + fmtNum(pengguna.length - aktif) + " nonaktif" + (q || fp || fl || fc || fj ? " · " + fmtNum(list.length) + " cocok" : "");
  const box = $("#pengguna-list");
  if (!list.length){ box.innerHTML = '<p class="meta">Tidak ada karyawan yang cocok.</p>'; return; }
  box.replaceChildren(...list.map(kartuKaryawan));
  if (idBaru){
    const el = box.querySelector(`[data-uid="${idBaru}"]`);
    if (el){ el.classList.add("baru"); el.scrollIntoView({ block: "center", behavior: "smooth" }); idBaru = ""; }
  }
}
/* ---------- Cek kesiapan HP (hasil dari HP karyawan, hanya admin) ---------- */
// Dipantau langsung: begitu karyawan menekan Cek HP, hasilnya langsung muncul tanpa muat ulang
function muatCekHPData(){
  if (!isAdmin()) return Promise.resolve();
  if (cekHPMuat) return cekHPMuat;
  cekHPMuat = new Promise(siap => {
    subs.push(onSnapshot(query(C("cekHP"), orderBy("ts", "desc"), limit(500)), q => {
      cekHPGagal = "";
      cekHPData = q.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
      cekHPTerakhir = {}; for (const x of cekHPData) cekHPTerakhir[x.uid] ||= x;
      siap();
      if (pengguna.length) renderPengguna();
      if ($("#sub-cekhp").classList.contains("on")) renderCekHP();
    }, e => { cekHPGagal = e.code || "gagal"; siap(); if ($("#sub-cekhp").classList.contains("on")) renderCekHP(); }));
  });
  return cekHPMuat;
}
const CH_IKON = { ok: "✅", warn: "⚠️", bad: "❌" };
const tglJamCH = c => { const t = c.ts?.toDate ? c.ts.toDate() : null; return t ? tglMedium(t) + " " + fmtJam(t) : "-"; };
function rincianCekHPHTML(c){
  return `<p class="meta" style="margin:0 0 6px">${esc(tglJamCH(c))} · ${esc(c.perangkat || "")} · versi ${esc(c.versi || "-")}${c.otomatis ? " · otomatis saat login" : ""}</p>
    <ul class="cekhp-list">${(c.item || []).map(x => `<li class="${esc(x.st)}"><span class="ci">${CH_IKON[x.st] || "•"}</span><div><b>${esc(x.judul)}</b>
      <div class="meta">${esc(x.ket || "")}</div>${x.saran ? `<div class="cekhp-saran">${esc(x.saran)}</div>` : ""}</div></li>`).join("")}</ul>`;
}
function bukaRincianCekHP(uid, asal){
  const riwayat = cekHPData.filter(x => x.uid === uid); if (!riwayat.length) return;
  const f = document.createElement("div"); f.className = "cekhp-popup";
  f.innerHTML = `${riwayat.length > 1 ? `<label>Riwayat cek</label><select class="ch-pilih">${riwayat.map((c, i) => `<option value="${i}">${esc(tglJamCH(c))} · ${(c.masalah || []).length ? "❌ " + fmtNum(c.masalah.length) + " masalah" : "✅ siap"}</option>`).join("")}</select>` : ""}
    <div class="ch-isi">${rincianCekHPHTML(riwayat[0])}</div><div class="btns" style="margin-top:10px"><button type="button" class="small alt ch-tutup">Tutup</button></div>`;
  f.querySelector(".ch-pilih")?.addEventListener("change", e => f.querySelector(".ch-isi").innerHTML = rincianCekHPHTML(riwayat[+e.target.value]));
  f.querySelector(".ch-tutup").onclick = () => f.hidden = true;
  popup(f, "Cek HP · " + (riwayat[0].nama || ""), asal);
}
document.addEventListener("click", e => {
  const el = e.target.closest?.("[data-cekhp]"); if (el) bukaRincianCekHP(el.dataset.cekhp, el);
  if (e.target.closest?.("[data-cekhp-buka]")){   // belum pernah cek: buka daftar Laporan > Cek HP
    document.querySelector('nav button[data-tab="hari"]')?.click();
    document.querySelector('#tab-cekhp-btn')?.click();
  }
});
async function muatCekHP(){
  $("#ch-info").textContent = "Memuat…";
  await muatCekHPData(); renderCekHP();
}
function renderCekHP(){
  const cari = $("#ch-cari").value.trim().toLowerCase(), f = $("#ch-filter").value;
  const daftar = pengguna.filter(u => u.aktif !== false && u.role !== "superadmin" && (!cari || (u.nama || "").toLowerCase().includes(cari)))
    .map(u => ({ u, c: cekHPTerakhir[u.id] }))
    .filter(({ c }) => !f || (f === "bad" ? c && (c.masalah || []).length : !c))
    .sort((a, b) => ((b.c?.masalah?.length || 0) - (a.c?.masalah?.length || 0)) || (a.u.nama || "").localeCompare(b.u.nama || ""));
  const bad = pengguna.filter(u => (cekHPTerakhir[u.id]?.masalah || []).length).length;
  if (cekHPGagal){ $("#ch-info").textContent = "Gagal memuat hasil Cek HP (" + cekHPGagal + ")." + (cekHPGagal === "permission-denied" ? " Aturan database terbaru belum di-deploy: jalankan deploy-rules.bat." : ""); }
  else $("#ch-info").textContent = `${fmtNum(Object.keys(cekHPTerakhir).length)} karyawan pernah cek · ${fmtNum(bad)} bermasalah · hasil hanya bisa dilihat admin`;
  $("#ch-list").innerHTML = daftar.length ? `<div class="tablewrap"><table class="rekap-tbl ch-tbl"><thead><tr><th>Nama</th><th>Cek terakhir</th><th>Hasil</th></tr></thead><tbody>${daftar.map(({ u, c }) =>
    `<tr><td>${c ? `<button type="button" class="l-nama" data-cekhp="${esc(u.id)}">${esc(u.nama)}</button>` : esc(u.nama)}</td><td>${c ? esc(tglJamCH(c)) : '<span class="meta">belum pernah</span>'}</td>
      <td class="${c && (c.masalah || []).length ? "bad" : ""}">${!c ? "-" : (c.masalah || []).length ? "❌ " + esc(c.masalah.join(", ")) : "✅ siap"}${c?.saran?.length ? ` <span class="meta">· ⚠️ ${esc(c.saran.join(", "))}</span>` : ""}</td></tr>`).join("")}</tbody></table></div>
    <p class="meta">Klik nama untuk melihat rincian & riwayat. Hasil dikirim saat karyawan menekan <b>Cek HP</b> di menu Pengaturan aplikasinya.</p>` : '<p class="meta">Tidak ada data.</p>';
}
$("#ch-cari").oninput = renderCekHP; $("#ch-filter").onchange = renderCekHP;
// Ringkasan "Cek kesiapan HP" terakhir yang dijalankan karyawan
function cekHPInfo(u){
  if (!isAdmin() || u.role === "superadmin") return "";
  const c = cekHPTerakhir[u.id];
  if (!c) return `<div class="meta cekhp-admin belum" data-cekhp-buka role="button" tabindex="0" title="Karyawan belum pernah menekan Cek HP di aplikasinya (menu Pengaturan > Cek kesiapan HP)">🩺 Cek HP: belum pernah dicek</div>`;
  const t = c.ts?.toDate ? c.ts.toDate() : null, tg = t ? tglMedium(t) + " " + fmtJam(t) : "";
  const m = c.masalah || [];
  return `<div class="meta cekhp-admin ${m.length ? "bad" : "ok"}" data-cekhp="${esc(u.id)}" role="button" tabindex="0" title="Klik untuk rincian · ${esc((c.perangkat || "") + (c.saran?.length ? " · Saran: " + c.saran.join(", ") : ""))}">🩺 Cek HP ${esc(tg)}: ${m.length ? "❌ " + esc(m.join(", ")) : "✅ siap"}${c.saran?.length ? ` <span class="meta">(${fmtNum(c.saran.length)} saran)</span>` : ""}</div>`;
}
function kartuKaryawan(u){
  const c = document.createElement("div"); c.className = "card emp-row"; c.dataset.uid = u.id;
  const bisaEdit = isAdmin() && u.role !== "superadmin", self = u.id === me.uid;
  const kunciDemo = !isSuper() && (u.akunDemo || modeDemo());
  const info = [u.jabatan, u.divisi].filter(Boolean).join(" · ");
  c.innerHTML = `<div class="emp-head">
      <div><b>${esc(u.nama)}</b><div class="meta">@${esc(u.username || "-")}${info ? " · " + esc(info) : ""}</div>
        ${u.hp ? `<div class="meta">${esc(u.hp)}</div>` : ""}
        ${u.akunDemo ? '<div class="meta">🔒 Akun demo publik</div>' : ""}
        <div class="meta" title="Lokasi kerja: ${esc(teksLokasi(u))}">📍 ${esc(teksLokasi(u))}</div>
        ${u.berhenti ? `<div class="meta berhenti-info" title="Berhenti ${esc(tglPendek(u.berhenti?.tanggal))} · ${esc(u.berhenti?.jenis || "")}">🚪 Berhenti ${esc(tglPendek(u.berhenti.tanggal))} · ${esc(u.berhenti.jenis || "")}</div>` : ""}
        ${namaCV(u.grupCV) ? `<div class="meta">🏢 ${esc(namaCV(u.grupCV))}</div>` : ""}
        ${namaPJ(u.proyek) ? `<div class="meta">🏗️ ${esc(namaPJ(u.proyek))}</div>` : ""}
        ${u.role === "admin" && u.bolehEditAbsen ? '<div class="meta" title="Diizinkan superadmin mengubah &amp; menghapus absen karyawan">✏️ Boleh ubah &amp; hapus absen</div>' : ""}
        ${u.kehadiran === "tidak" ? '<div class="meta" title="Tidak masuk hitungan gaji, rekap absensi &amp; cek lembur">🚫 Tidak dihitung gaji &amp; rekap</div>' : ""}
        ${u.kehadiran === "manual" ? '<div class="meta" title="Hari kerja & lembur diambil dari upload Excel di Gaji > Hitung">📄 Kehadiran manual (Excel)</div>' : ""}
        ${u.shift && (aturan.shifts || []).find(x => x.id === u.shift) ? `<div class="meta">🕘 Shift ${esc(aturan.shifts.find(x => x.id === u.shift).nama)}</div>` : ""}
        <div class="meta" title="${u.deviceId ? "Terkunci ke 1 HP" : "Belum terkunci ke HP"} · Wajah ${u.daftarWajah ? "terdaftar" : "belum"} · Sidik jari ${u.daftarJari ? "terdaftar" : "belum"}">📱 HP: ${u.deviceId ? "terkunci" : "belum"} · Wajah ${u.daftarWajah ? "🔒" : "–"} · Jari ${u.daftarJari ? "🔒" : "–"}</div>${cekHPInfo(u)}</div>
      <div class="tags"><span class="tag ${u.role === "karyawan" ? "out" : "in"}">${esc(labelPeran(u))}</span>
        ${u.aktif === false ? '<span class="tag no">Nonaktif</span>' : ""}</div></div>
    ${bisaEdit ? `<div class="btns" style="margin-top:10px"><button class="small alt b-edit">Edit</button>
      ${isAdmin() ? '<button class="small alt b-manual" title="Catat absen untuk karyawan ini (misalnya HP rusak, kondisi khusus)">Absen manual</button>' : ""}
      <button class="small alt b-pw" ${u.akunDemo && !isSuper() ? 'disabled title="Password akun demo publik dikunci"' : 'title="Ganti password login karyawan ini"'}>Password</button>
      ${self ? "" : `<button class="small alt b-berhenti ${u.berhenti ? "sudah" : ""}" title="${u.berhenti ? "Lihat data berhenti & surat" : "Catat karyawan berhenti (resign, PHK, habis kontrak, dll.)"}">${u.berhenti ? "📄 Data berhenti" : "🚪 Berhenti"}</button>`}
      <button class="small alt b-reset" ${u.deviceId || u.daftarWajah || u.daftarJari
        ? 'title="Reset HP, wajah, atau sidik jari agar karyawan bisa mendaftar ulang"'
        : 'disabled title="Belum ada yang perlu direset: karyawan belum mendaftarkan wajah/sidik jari di HP"'}>Reset HP</button>
</div>` : ""}
    <div class="emp-form" hidden></div>
    <div class="pw-form" hidden></div>
    <div class="manual-form" hidden></div>
    <div class="berhenti-form" hidden></div>`;
  const bhb = c.querySelector(".b-berhenti");
  if (bhb) bhb.onclick = () => bukaBerhenti(u, c.querySelector(".berhenti-form"), bhb);
  const bman = c.querySelector(".b-manual");
  if (bman) bman.onclick = () => {
    const f = c.querySelector(".manual-form");
    if (!f.hidden){ f.hidden = true; return; }
    const n = new Date(), hariIni = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
    f.innerHTML = `<b>Absen manual ${esc(u.nama)}</b>
      <div class="grid2">
        <div><label>Tanggal (dd/mm/yy)</label><input class="mn-tgl" type="text" inputmode="numeric" placeholder="dd/mm/yy"
          value="${tglMedium(n)}"></div>
        <div><label>Jam</label><input class="mn-jam jam24" type="text" inputmode="numeric" maxlength="5" placeholder="08:00" value="${fmtJam(n).replace(".", ":")}"></div>
      </div>
      <div class="grid2">
      <div><label>Jenis</label><select class="mn-jenis"><option value="masuk">Masuk</option><option value="pulang">Pulang</option></select></div>
      <div><label>Lokasi</label><select class="mn-lokasi">${(() => {
        const kerja = u.lokasiKerja || [], urut = [...daftarLokasi].sort((a, b) => (kerja.includes(b.id) - kerja.includes(a.id)) || (a.nama || "").localeCompare(b.nama || ""));
        return urut.map(L => `<option value="${esc(L.id)}">${esc(L.nama)}${kerja.includes(L.id) && kerja.length < daftarLokasi.length ? " (lokasi kerja)" : ""}</option>`).join("") + '<option value="">Di luar lokasi / tidak ada</option>';
      })()}</select></div>
      </div>
      <label>Alasan</label><input class="mn-alasan" placeholder="mis. HP rusak, lupa absen">
      <label>Lampiran <span class="meta">(opsional, maks. ${LAMPIRAN_MAX} file)</span></label>
      <label class="addfile"><input type="file" class="mn-file" accept="application/pdf,image/*" multiple>📎 Pilih foto / PDF (maks. 5 MB per file)</label>
      <div class="mn-daftar meta"></div>
      <p class="meta" style="margin:4px 0 0">Absen manual langsung sah, tercatat atas nama kamu, dan masuk log aktivitas.</p>
      <div class="btns" style="margin-top:10px"><button class="small mn-simpan">Simpan absen</button><button class="small alt mn-batal">Batal</button></div>`;
    f.hidden = false; popup(f, "Absen manual · " + u.nama, bman);
    const tglEl = f.querySelector(".mn-tgl");
    pasangTanggalMedium(tglEl);
    f.querySelector(".mn-batal").onclick = () => { f.hidden = true; };
    let berkasMn = [];
    const tampilMn = () => { f.querySelector(".mn-daftar").innerHTML = berkasMn.map((b, i) =>
        `<div class="bh-item">📄 ${esc(b.name)} <span>(${(b.size / 1024 / 1024).toFixed(2)} MB)</span> <button type="button" class="small alt mn-x" data-i="${i}" aria-label="Hapus file">✕</button></div>`).join("");
      f.querySelectorAll(".mn-x").forEach(x => x.onclick = () => { berkasMn.splice(+x.dataset.i, 1); tampilMn(); }); };
    f.querySelector(".mn-file").onchange = async ev => {
      for (const fl0 of [...ev.target.files]){
        if (berkasMn.length >= LAMPIRAN_MAX){ toast("Maksimal " + LAMPIRAN_MAX + " lampiran."); break; }
        if (!/^(image\/|application\/pdf)/.test(fl0.type)){ toast(fl0.name + ": hanya foto atau PDF."); continue; }
        const fl = await kompres(fl0);
        if (fl.size > 5 * 1024 * 1024){ toast(fl0.name + " lebih dari 5 MB."); continue; }
        berkasMn.push(fl);
      }
      ev.target.value = ""; tampilMn();
    };
    f.querySelector(".mn-simpan").onclick = async e => {
      const tglTeks = f.querySelector(".mn-tgl").value.trim(), jam = f.querySelector(".mn-jam").value.trim(),
            type = f.querySelector(".mn-jenis").value, lokId = f.querySelector(".mn-lokasi").value, lokPilih = daftarLokasi.find(L => L.id === lokId), alasan = f.querySelector(".mn-alasan").value.trim();
      // dd/mm/yy -> tanggal; tolak tanggal yang tidak ada (mis. 31/02/26)
      const isoMn = dmyKeIso(tglTeks), mt = isoMn ? [isoMn, isoMn.slice(8), isoMn.slice(5, 7), isoMn.slice(2, 4)] : null;
      const tglObj = mt ? new Date(2000 + +mt[3], +mt[2] - 1, +mt[1]) : null;
      if (!mt){
        f.querySelector(".mn-tgl").classList.add("salah"); toast("Tanggal harus format dd/mm/yy dan valid, mis. 05/10/26."); return; }
      const tgl = tglObj.getFullYear() + "-" + mt[2] + "-" + mt[1];
      if (!jamValid(jam)){ toast("Isi jam format 24 jam, mis. 08:00."); return; }
      if (!alasan){ toast("Isi alasan absen manual."); return; }
      const [y, mo, d] = tgl.split("-").map(Number), [h, mi] = jam.split(":").map(Number), waktu = new Date(y, mo - 1, d, h, mi);
      e.target.disabled = true;
      try{
        const ref = doc(C("absensi")), lampiran = [];
        for (const [i, fl] of berkasMn.entries()){
          toast(`Mengunggah lampiran ${i + 1}/${berkasMn.length}…`);
          const path = `manual/${CID}/${u.id}/${ref.id}-${i + 1}-${fl.name.replace(/[^\w.\-]+/g, "_")}`;
          await unggahB(sRefB(storageB, path), fl, { contentType: fl.type });
          lampiran.push({ nama: fl.name, path, tipe: fl.type, ukuran: fl.size });
        }
        await setDoc(ref, { uid: u.id, nama: u.nama, type, status: "terima", ts: Timestamp.fromDate(waktu), manual: true,
          byUid: me.uid, by: profile.nama, alasan, decidedAt: serverTimestamp(), dist: 0, rad: 0, acc: 0, lokasi: lokPilih ? lokPilih.nama : "manual", ...(lokPilih ? { lokasiId: lokPilih.id } : {}),
          device: "manual", live: false, foto: null, face: null, finger: false, ...(lampiran.length ? { lampiran } : {}) });
        f.hidden = true; toast("Absen " + type + " " + u.nama + " (" + tglTeks + " " + jam + ") tersimpan.");
      }catch(err){ toast(err.code === "permission-denied" ? "Ditolak. Pastikan aturan terbaru sudah di-deploy (deploy-rules.bat)." : "Gagal: " + err.code); e.target.disabled = false; }
    };
  };
  const bpw = c.querySelector(".b-pw");
  if (bpw) bpw.onclick = () => {
    const f = c.querySelector(".pw-form");
    if (!f.hidden){ f.hidden = true; return; }
    f.innerHTML = `<b>Ubah password ${esc(u.nama)}</b>
      <div class="grid2">
        <div><label>Password baru</label><input class="pw1" type="text" autocomplete="new-password" placeholder="min. 8 karakter"></div>
        <div><label>Ulangi password</label><input class="pw2" type="text" autocomplete="new-password"></div>
      </div>
      <p class="meta" style="margin:4px 0 0">Setelah diubah, karyawan harus login dengan password baru. Sesi lama di perangkat lain akan keluar otomatis.</p>
      <div class="btns" style="margin-top:10px"><button class="small b-pw-simpan">Simpan password</button><button class="small alt b-pw-batal">Batal</button></div>`;
    f.hidden = false; popup(f, "Ubah password · " + u.nama, bpw); f.querySelector(".pw1").focus();
    f.querySelector(".b-pw-batal").onclick = () => { f.hidden = true; };
    f.querySelector(".b-pw-simpan").onclick = async e => {
      const p1 = f.querySelector(".pw1").value, p2 = f.querySelector(".pw2").value;
      if (p1.length < 8){ toast("Password minimal 8 karakter."); return; }
      if (p1 !== p2){ toast("Ulangi password tidak sama."); return; }
      e.target.disabled = true;
      try{
        await httpsCallable(fns, "ubahPassword")({ uid: u.id, password: p1 });
        f.hidden = true;
        toast("Password " + u.nama + " diubah. Berikan password baru: " + p1);
      }catch(err){
        toast(err.code === "functions/not-found" ? "Fungsi ubah password belum terpasang. Jalankan deploy-functions.bat."
          : (err.message || "Gagal: " + err.code));
        e.target.disabled = false;
      }
    };
  };
  const rst = c.querySelector(".b-reset");
  if (rst) rst.onclick = () => bukaReset(u, rst);
  const btn = c.querySelector(".b-edit"); if (!btn) return c;
  btn.onclick = () => {
    const form = c.querySelector(".emp-form");
    if (!form.hidden){ form.hidden = true; btn.textContent = "Edit"; return; }
    form.innerHTML = `<label>Nama lengkap</label><input data-f="nama" value="${esc(u.nama || "")}">
      <label>Username</label><input value="${esc(u.username || "")}" disabled>
      <p class="meta" style="margin:4px 0 0">Username tidak bisa diubah karena dipakai untuk login.</p>
      <div class="grid2">${FIELD.map(([k, l, t]) => k === "alamat" ? "" :
        `<div><label>${l}</label><input data-f="${k}" ${t ? `type="${t}"` : ""} value="${esc(u[k] || "")}"></div>`).join("")}</div>
      <label>Alamat</label><textarea data-f="alamat" rows="2">${esc(u.alamat || "")}</textarea>
      <div class="grid2">
        <div><label>Peran</label><select data-f="role" ${self ? "disabled" : ""}>${opsiPeran(u.role, u.peran || "")}</select></div>
        ${(aturan.shifts || []).length ? `<div class="kolom-shift"><label>Shift kerja</label><select data-f="shift">
          <option value="">Jam kerja utama (${esc(aturan.jamMasuk || "08:00")}–${esc(aturan.jamPulang || "17:00")})</option>
          ${aturan.shifts.map(sh => `<option value="${esc(sh.id)}" ${u.shift === sh.id ? "selected" : ""}>${esc(sh.nama)} (${esc(sh.masuk)}–${esc(sh.pulang)})</option>`).join("")}</select></div>`
          : `<div class="kolom-shift"><label>Shift kerja</label><p class="meta" style="margin:2px 0 0">Belum ada shift. Buat di <b>Gaji > Aturan > Shift kerja</b>, klik <b>Simpan aturan</b>, lalu buka Edit lagi.</p></div>`}
        <div><label>Status</label><select data-f="aktif" ${self ? "disabled" : ""}>
          <option value="1" ${u.aktif !== false ? "selected" : ""}>Aktif</option><option value="0" ${u.aktif === false ? "selected" : ""}>Nonaktif</option></select></div>
        <div><label>Perhitungan kehadiran</label><select data-f="kehadiran">
          <option value="" ${!["manual", "tidak"].includes(u.kehadiran) ? "selected" : ""}>Absen aplikasi</option>
          <option value="manual" ${u.kehadiran === "manual" ? "selected" : ""}>Manual (upload Excel)</option>
          <option value="tidak" ${u.kehadiran === "tidak" ? "selected" : ""}>Tidak dihitung (tidak masuk gaji &amp; rekap)</option></select></div>
        <div><label>Group CV</label><select data-f="grupCV" class="pilih-cv">${opsiCV(u.grupCV || "")}</select></div>
        <div><label>Proyek</label><select data-f="proyek" class="pilih-proy">${opsiPJ(u.proyek || "")}</select></div>
      </div>
      <p class="meta" style="margin:6px 0 0">Karyawan nonaktif tidak bisa login dan tidak masuk hitungan gaji.</p>
      ${isAdmin() ? `<h3 class="tb-judul">Rekening gaji</h3>
        <div class="grid2">
          <div><label>Bank</label><input data-rek="bank" list="daftar-bank" placeholder="mis. BCA" value="${esc((gajiMap[u.id] || {}).bank || "")}" autocomplete="off"></div>
          <div><label>No. rekening</label><input data-rek="noRek" inputmode="numeric" placeholder="angka saja" value="${esc((gajiMap[u.id] || {}).noRek || "")}" autocomplete="off"></div>
        </div>
        <label>Atas nama rekening</label><input data-rek="atasNama" placeholder="sama dengan nama lengkap" value="${esc((gajiMap[u.id] || {}).atasNama || "")}" autocomplete="off">` : ""}
      ${daftarLokasi.length > 1 ? `<label>Lokasi kerja</label><div class="lok-pilih">${daftarLokasi.map(L =>
        `<label class="check"><input type="checkbox" data-lok="${esc(L.id)}" ${!u.lokasiKerja?.length || u.lokasiKerja.includes(L.id) ? "checked" : ""}> ${esc(L.nama)}</label>`).join("")}</div>
        <p class="meta" style="margin:4px 0 0">Semua dicentang = boleh absen di lokasi mana pun.</p>`
        : `<label>Lokasi kerja</label><p class="meta" style="margin:2px 0 0">Baru ada ${daftarLokasi.length ? "1 lokasi (" + esc(daftarLokasi[0].nama) + ")" : "0 lokasi"}. Tambahkan lokasi lain (misalnya Gudang) di <b>Pengaturan > Lokasi absen</b> untuk mengatur lokasi kerja per karyawan.</p>`}
      <label>Radius tambahan GPS (meter)</label><input class="f-radtambah" inputmode="numeric" maxlength="4" placeholder="0" value="${+u.radiusTambah || ""}" autocomplete="off">
      <p class="meta" style="margin:4px 0 0">Khusus karyawan ini, untuk HP yang GPS-nya sering meleset. Ditambahkan ke radius lokasi <b>dan</b> batas akurasi GPS. Mis. isi 50: radius 100 m jadi 150 m. Kosong = 0.</p>
      ${isSuper() && u.role === "admin" ? `<label class="check" style="margin-top:12px"><input type="checkbox" class="f-editabsen" ${u.bolehEditAbsen ? "checked" : ""}> <span><b>Boleh ubah &amp; hapus absen</b> karyawan (izin khusus dari superadmin)</span></label>` : ""}
      <div class="btns" style="margin-top:12px"><button class="small b-simpan">Simpan</button><button class="small alt b-batal">Batal</button></div>
      ${isSuper() ? `<label class="check" style="margin-top:12px"><input type="checkbox" class="f-akundemo" ${u.akunDemo ? "checked" : ""}> Akun demo publik (password &amp; peran dikunci)</label>
        <label>Password demo (dipulihkan otomatis tiap 30 menit)</label><input class="f-pwdemo" value="${esc(u.passwordDemo || "Demo01")}" autocomplete="off">` : ""}
      ${self || kunciDemo ? (kunciDemo && !self ? '<p class="meta" style="margin-top:12px">🔒 Perusahaan/akun demo publik: karyawan hanya bisa dihapus superadmin.</p>' : "") : `<div class="zona-hapus">
        <button type="button" class="small b-hapus-k">Hapus karyawan</button>
        <div class="hapus-konf" hidden>
          <p class="meta" style="margin:0 0 6px">Untuk karyawan yang keluar kerja, sebaiknya ubah <b>Status</b> menjadi <b>Nonaktif</b> agar riwayat dan laporan tetap ada. Hapus permanen tidak bisa dibatalkan.</p>
          <label class="check"><input type="checkbox" class="hapus-data"> Hapus juga semua riwayat absen, izin, gaji, slip &amp; foto</label>
          <label>Ketik username <b>${esc(u.username || "")}</b> untuk konfirmasi</label>
          <input class="hapus-ketik" autocapitalize="none" autocomplete="off">
          <button type="button" class="small b-hapus-ya" style="margin-top:10px;width:100%" disabled>Hapus permanen</button>
        </div></div>`}`;
    form.hidden = false; popup(form, "Edit · " + u.nama, btn);
    form.querySelector(".b-batal").onclick = () => { form.hidden = true; btn.textContent = "Edit"; };
    const bh = form.querySelector(".b-hapus-k");
    if (bh){
      const konf = form.querySelector(".hapus-konf"), ketik = form.querySelector(".hapus-ketik"), ya = form.querySelector(".b-hapus-ya");
      bh.onclick = () => { konf.hidden = !konf.hidden; if (!konf.hidden) ketik.focus(); };
      ketik.oninput = () => { ya.disabled = ketik.value.trim().toLowerCase() !== String(u.username || "").toLowerCase(); };
      ya.onclick = async () => {
        const semua = form.querySelector(".hapus-data").checked;
        if (!await tanya("Hapus " + u.nama + " secara permanen" + (semua ? " BESERTA semua riwayatnya" : "") + "?")) return;
        ya.disabled = true; ya.textContent = "Menghapus…";
        try{
          const r = (await httpsCallable(fns, "hapusKaryawan", { timeout: 300000 })({ uid: u.id, hapusData: semua })).data;
          form.hidden = true; pengguna = pengguna.filter(x => x.id !== u.id); tampilPengguna(); if (isAdmin()) initGaji();
          toast(r.nama + " dihapus" + (semua ? " beserta " + fmtNum(r.jumlahData) + " data riwayat." : ". Riwayat absennya tetap tersimpan."));
        }catch(err){
          toast(err.code === "functions/not-found" ? "Fungsi hapus karyawan belum terpasang. Jalankan deploy-functions.bat." : (err.message || "Gagal: " + err.code));
          ya.disabled = false; ya.textContent = "Hapus permanen";
        }
      };
    }
    form.querySelector(".b-simpan").onclick = async e => {
      const data = {};
      form.querySelectorAll("[data-f]").forEach(i => { if (!i.disabled) data[i.dataset.f] = i.value.trim(); });
      if (!data.nama){ toast("Nama tidak boleh kosong."); return; }
      if ("aktif" in data) data.aktif = data.aktif === "1";
      if ("role" in data){ const r = bacaPeran(data.role); data.role = r.role; data.peran = r.peran; }
      if (u.akunDemo && !isSuper()){ delete data.role; delete data.peran; }
      const cekEdit = form.querySelector(".f-editabsen");
      if (cekEdit) data.bolehEditAbsen = cekEdit.checked;
      const cekDemo = form.querySelector(".f-akundemo");
      if (cekDemo){
        data.akunDemo = cekDemo.checked;
        data.passwordDemo = cekDemo.checked ? (form.querySelector(".f-pwdemo").value.trim() || "Demo01") : "";
        if (data.passwordDemo && data.passwordDemo.length < 6){ toast("Password demo minimal 6 karakter."); return; }
      }
      const rt = form.querySelector(".f-radtambah");
      if (rt){
        const n = parseInt(rt.value.replace(/\D/g, ""), 10) || 0;
        if (n > 1000){ toast("Radius tambahan maksimal 1.000 m."); rt.focus(); return; }
        data.radiusTambah = n;
      }
      const centang = [...form.querySelectorAll("[data-lok]")];
      if (centang.length){
        const pilih = centang.filter(x => x.checked).map(x => x.dataset.lok);
        if (!pilih.length){ toast("Pilih minimal satu lokasi kerja."); return; }
        data.lokasiKerja = pilih.length === centang.length ? [] : pilih;
      }
      e.target.disabled = true;
      try{
        await updateDoc(doc(db, "users", u.id), { ...data, diubah: serverTimestamp(), diubahOleh: profile.nama });
        if (isSuper() && data.passwordDemo){
          try{ await httpsCallable(fns, "ubahPassword")({ uid: u.id, password: data.passwordDemo }); }catch(err){ toast("Password demo belum terpasang: " + (err.message || err.code)); }
        }
        // rekening gaji disimpan di data gaji (hanya admin & karyawan itu yang bisa melihat)
        const rekEl = [...form.querySelectorAll("[data-rek]")];
        if (rekEl.length){
          const rek = Object.fromEntries(rekEl.map(i => [i.dataset.rek, i.value.trim()]));
          rek.noRek = rek.noRek.replace(/\D/g, ""); if (rek.noRek && !rek.atasNama) rek.atasNama = data.nama || u.nama;
          const lama = gajiMap[u.id] || {};
          if (rek.bank !== (lama.bank || "") || rek.noRek !== (lama.noRek || "") || rek.atasNama !== (lama.atasNama || "")){
            await setDoc(D("payroll", u.id), { ...rek, appVer: VERSI_APP }, { merge: true }); gajiMap[u.id] = { ...lama, ...rek };
          }
        }
        form.hidden = true; Object.assign(u, data); toast("Data " + u.nama + " tersimpan.");
        tampilPengguna(); if (isAdmin()) initGaji();
      }catch(err){ toast("Gagal menyimpan: " + err.code); e.target.disabled = false; }
    };
  };
  return c;
}

/* ================= LOG AKTIVITAS ================= */
{ const n = new Date(); $("#log-tgl").value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0"); }
let logData = [];
const IKON_LOG = { login: "🔑", buka: "📱", logout: "🚪", absen: "🕘", setujui: "✅", tolak: "⛔", izin: "📅", akun: "👤", pengaturan: "⚙️", perusahaan: "🏢", gaji: "💰", ekspor: "🖨️", hapus: "🗑️", demo: "🧪" };
async function muatLog(){
  if (!isAdmin() || !CID) return;
  const [y, m, d] = $("#log-tgl").value.split("-").map(Number); if (!y) return;
  $("#log-info").textContent = "Memuat…";
  try{
    const snap = await getDocs(query(C("log"), where("ts", ">=", Timestamp.fromDate(new Date(y, m - 1, d))),
      where("ts", "<", Timestamp.fromDate(new Date(y, m - 1, d + 1))), orderBy("ts", "desc"), limit(1000)));
    logData = snap.docs.map(x => x.data({ serverTimestamps: "estimate" })).filter(x => isSuper() || x.role !== "superadmin");   // catatan superadmin hanya terlihat oleh superadmin
    tampilLog();
  }catch(e){
    $("#log-info").textContent = e.code === "permission-denied" ? "Ditolak database. Jalankan deploy-rules.bat untuk memasang aturan log." : "Gagal memuat: " + e.code;
  }
}
// Posisi GPS di log: koordinat + alamat, klik untuk membuka Google Maps
const adaGps = x => typeof x.la === "number" && typeof x.lo === "number";
const petaUrl = x => "https://www.google.com/maps?q=" + x.la + "," + x.lo;
const gpsLog = x => adaGps(x)
  ? `<a class="log-gps" href="${petaUrl(x)}" target="_blank" rel="noopener" title="Buka di Google Maps">📍 ${x.alamat ? esc(x.alamat) + " · " : ""}${x.la.toFixed(5)}, ${x.lo.toFixed(5)}${x.acc ? " (±" + fmtNum(x.acc) + " m)" : ""}${x.acc > 300 ? ' <span class="log-kasar" title="GPS HP mati / sinyal satelit lemah, posisi hanya perkiraan dari jaringan seluler">⚠ perkiraan, GPS lemah</span>' : ""}</a>`
  : "";
function tampilLog(){
  const q = $("#log-cari").value.trim().toLowerCase(), j = $("#log-jenis").value;
  const list = logData.filter(x => (!j || j.split("|").includes(x.aksi)) &&
    (!q || [x.nama, x.ket, x.aksi, x.perangkat, x.target, x.alamat].some(v => String(v || "").toLowerCase().includes(q))));
  $("#log-info").textContent = fmtNum(list.length) + " aktivitas" + (list.length !== logData.length ? " (dari " + fmtNum(logData.length) + ")" : "") +
    " · " + tglMediumHari($("#log-tgl").value, "panjang");
  $("#log-csv").hidden = !list.length;
  const ul = $("#log-list");
  if (!list.length){ ul.innerHTML = '<li class="empty">Tidak ada aktivitas.</li>'; return; }
  ul.innerHTML = list.map(x => `<li class="log-item"><span class="log-ik" aria-hidden="true">${IKON_LOG[x.aksi] || "•"}</span>
    <div><div><b>${esc(x.nama || "Sistem")}</b>${x.role ? ` <span class="meta">${esc(x.role)}</span>` : ""}</div>
      <div>${esc(x.ket || x.aksi)}</div>${x.perangkat ? `<small>${esc(x.perangkat)}</small>` : ""}${gpsLog(x)}</div>
    <span class="log-jam">${fmtJam(tsOf(x))}</span></li>`).join("");
  $("#log-csv").onclick = () => unduhCSV([["Waktu", "Nama", "Peran", "Jenis", "Keterangan", "Perangkat", "Latitude", "Longitude", "Akurasi (m)", "Alamat", "Peta", "Sumber"],
    ...list.map(x => [tglMedium(tsOf(x)) + " " + tsOf(x).toLocaleTimeString("id-ID"), x.nama, x.role, x.aksi, x.ket, x.perangkat || "",
      x.la ?? "", x.lo ?? "", x.acc || "", x.alamat || "", adaGps(x) ? petaUrl(x) : "", x.sumber])], "log-aktivitas-" + $("#log-tgl").value + ".csv");
}
$("#log-tgl").onchange = muatLog;
$("#log-cari").oninput = tampilLog;
$("#log-jenis").onchange = tampilLog;

/* ================= CEK LEMBUR / LUPA ABSEN PULANG ================= */
{ const n = new Date(); $("#lb-bulan").value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"); }
let dataLembur = [], aturanLembur = {}, lbMode = "lembur";   // tab: "lembur" (ada jam pulang) | "lupa" (tidak absen pulang)
async function muatLembur(){
  if (!CID) return;
  const [y, mo] = ($("#lb-bulan").value || "").split("-").map(Number); if (!y) return;
  $("#lb-info").textContent = "Memuat…";
  try{
    const atS = await getDoc(D("settings", "payroll")); const at = atS.exists() ? atS.data() : {};
    const [uSnap, d] = await Promise.all([getDocs(query(collection(db, "users"), where("cid", "==", CID))), dataBulan(y, mo - 1, at.awalPeriode)]);
    const users = uSnap.docs.map(x => ({ uid: x.id, ...x.data() }));
    dataLembur = [];
    for (const u of users){
      if (!d.absen[u.uid] || u.kehadiran === "tidak") continue;      // ditandai "Tidak dihitung"
      const r = hitungGaji(d.absen[u.uid], at, { shift: u.shift || "", grupCV: u.grupCV || "-", tanpaLebihHK: tanpaLebihHK(u), liburJadi: (d.gaji || {})[u.uid]?.liburJadi, polaKerja: (d.gaji || {})[u.uid]?.polaKerja }, y, mo - 1, new Date(), d.cuti[u.uid] || [], d.kep[u.uid] || {});
      for (const row of r.rows){
        const ada = v => !!v && v !== "-";
        if (!ada(row.masuk) && !ada(row.pulang)) continue;
        // tidak absen pulang tapi lembur sudah diisi & disimpan -> pindah ke tab Cek lembur (tidak muncul lagi di Lupa absen)
        const kepIni = (d.kep[u.uid] || {})[row.tanggal];
        const tanpaPulang = ada(row.masuk) && !ada(row.pulang) && row.tanggal < dayKey(new Date()) && kepIni?.status !== "lembur";
        const lemburTanpaPulang = ada(row.masuk) && !ada(row.pulang) && kepIni?.status === "lembur";
        // pulang sebelum batas lembur: tidak ada lembur & tidak perlu dicek (superadmin tetap bisa melihat & mengubah lewat filter "Di bawah batas")
        if (!row.lemburTercatat && !tanpaPulang && !ada(row.pulang) && !lemburTanpaPulang) continue;   // belum absen pulang (hari ini)
        const bawah = !row.lemburTercatat && !tanpaPulang && !lemburTanpaPulang;
        if (bawah && !isSuper() && !(d.kep[u.uid] || {})[row.tanggal]?.superadmin) continue;
        dataLembur.push({ u, row, tanpaPulang, lemburTanpaPulang, bawah, kep: kepIni?.status === "koreksi" ? undefined : kepIni, lhkJam: kepIni?.lhkJam, shiftId: (at.shifts || []).some(x => x.id === u.shift) ? u.shift : "",
          shift: r.shiftNama || `Jam kerja utama (${at.jamMasuk || "08:00"}–${at.jamPulang || "17:00"})` });
      }
    }
    dataLembur.sort((a, b) => b.row.tanggal.localeCompare(a.row.tanggal) || (a.u.nama || "").localeCompare(b.u.nama || ""));
    aturanLembur = at;
    // pilihan saring shift (hanya bila perusahaan punya shift)
    const sel = $("#lb-shift"), v = sel.value;
    sel.innerHTML = `<option value="">Semua shift</option><option value="-">Jam kerja utama (${esc(at.jamMasuk || "08:00")}–${esc(at.jamPulang || "17:00")})</option>` +
      (at.shifts || []).map(x => `<option value="${esc(x.id)}">${esc(x.nama)} (${esc(x.masuk)}–${esc(x.pulang)})</option>`).join("");
    sel.value = [...sel.options].some(o => o.value === v) ? v : ""; $("#lb-shift-wrap").hidden = !(at.shifts || []).length;
    tampilLembur();
  }catch(e){ $("#lb-info").textContent = e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat untuk memasang aturan cek lembur." : "Gagal memuat: " + (e.code || e.message); }
}
function tampilLembur(){
  const at = aturanLembur;
  const q = $("#lb-cari").value.trim().toLowerCase(), f = $("#lb-filter").value, fs = $("#lb-shift").value;
  const diTab = x => lbMode === "lupa" ? x.tanpaPulang : !x.tanpaPulang;
  const list = dataLembur.filter(x => diTab(x) && (!q || (x.u.nama || "").toLowerCase().includes(q)) && (!fs || (fs === "-" ? !x.shiftId : x.shiftId === fs)) &&
    (f === "bawah" ? x.bawah : (!x.bawah || x.kep?.superadmin) && (f === "semua" || (f === "belum" ? !x.kep : x.kep?.status === f))));
  const tampak = x => !x.bawah || x.kep?.superadmin;
  const belum = dataLembur.filter(x => diTab(x) && !x.kep && !x.bawah).length;
  // jumlah belum dicek di judul tab
  for (const [m, f2] of [["lembur", x => !x.tanpaPulang], ["lupa", x => x.tanpaPulang]]){
    const n = dataLembur.filter(x => f2(x) && !x.kep && !x.bawah).length, el = document.querySelector(`.lb-hit[data-hit="${m}"]`);
    if (el) el.textContent = n ? " " + n : ""; }
  $("#lb-opsi-bawah").hidden = !isSuper() || lbMode === "lupa"; $("#lb-ulang-wrap").hidden = lbMode === "lupa";
  if (lbMode === "lupa" && $("#lb-filter").value === "bawah") $("#lb-filter").value = "belum";
  $("#lb-info").textContent = fmtNum(belum) + " belum dicek · " + fmtNum(dataLembur.filter(x => diTab(x) && tampak(x)).length) + " total" + (lbMode === "lupa"
    ? " · karyawan yang absen masuk tapi tidak absen pulang. Tandai Lupa absen pulang; kalau dia lembur, catat Absen manual › Pulang dengan jam sebenarnya."
    : at?.lemburSetuju ? " · lembur baru dihitung setelah disetujui" : " · lembur dihitung otomatis; untuk membatalkan, isi 0 lalu ✓ Lembur");
  const box = $("#lb-list");
  if (!list.length){ box.innerHTML = `<p class="meta">${lbMode === "lupa" ? "Tidak ada yang lupa absen pulang." : "Tidak ada yang perlu dicek."}</p>`; return; }
  box.replaceChildren(...list.map(x => {
    const c = document.createElement("div"); c.className = "card lb-kartu";
    const tgl = tglMediumHari(x.row.tanggal);
    const status = x.kep ? (x.kep.status === "lembur" ? `<span class="tag in">✓ Lembur ${fmtNum(x.kep.jam ?? x.row.lemburTercatat)} jam</span>` : '<span class="tag wait">⏰ Lupa absen pulang</span>') : '<span class="tag no">Belum dicek</span>';
    c.innerHTML = `<div class="lb-kepala"><div><b>${esc(x.u.nama)}</b><div class="meta">${esc(tgl)} · masuk ${esc(x.row.masuk || "–")} · pulang ${esc(x.row.pulang || "–")}</div>
        <div class="meta lb-shift">🕘 ${esc(x.shift)}</div></div>${status}</div>
      <div class="meta lb-ket">${x.lemburTanpaPulang ? "Tidak absen pulang · jam lembur diisi manual oleh admin." : x.bawah ? "Pulang sebelum batas lembur → 0 jam. " + (x.kep?.superadmin ? "Ditetapkan superadmin." : "Hanya superadmin yang bisa mengubah.") : x.tanpaPulang ? "Tidak absen pulang." : "Tercatat " + fmtNum(x.row.lemburTercatat) + " jam lembur" + (+at.lemburMulaiMenit ? " (dihitung mulai jam pulang + " + fmtNum(+at.lemburMulaiMenit) + " menit)" : " di luar jam kerja") + "."}${x.kep?.dihitungUlang && x.kep.jamSebelum != null && x.kep.jamSebelum !== x.kep.jam ? " Dihitung ulang dari " + fmtNum(x.kep.jamSebelum) + " jam." : ""}</div>
      <div class="lb-aksi${lbMode === "lupa" ? " lb-aksi-lupa" : ""}">
        ${lbMode === "lupa" ? "" : `<label class="lb-jam">Jam lembur <input type="number" min="0" max="24" step="1" value="${x.kep?.status === "lembur" ? (x.kep.jam ?? x.row.lemburTercatat) : (x.row.lemburTercatat || 0)}"></label>
        <button class="small b-ok">✓ Lembur</button>`}
        ${lbMode === "lupa" ? '<button class="small alt b-lupa">Lupa absen pulang</button>' : ""}
        ${x.kep ? '<button class="small alt b-reset-lb" title="Kembalikan ke belum dicek">↺</button>' : ""}
      </div>`;
    const simpan = async (status, el) => {
      el.disabled = true;
      const id = x.u.uid + "_" + x.row.tanggal, jam = Math.max(0, parseInt(c.querySelector(".lb-jam input")?.value, 10) || 0);
      try{
        if (x.bawah && !isSuper()){ toast("Di bawah batas lembur: hanya superadmin yang bisa mengubah."); el.disabled = false; return; }
        const data = { uid: x.u.uid, nama: x.u.nama, tanggal: x.row.tanggal, status, ...(status === "lembur" ? { jam } : {}),
          ...(isSuper() && (x.bawah || x.kep?.superadmin) ? { superadmin: true } : {}),
          ...(x.lhkJam != null ? { lhkJam: x.lhkJam } : {}),
          oleh: profile.nama, olehUid: me.uid, waktu: serverTimestamp() };
        await setDoc(D("lembur", id), data);
        catatLog(CID, me.uid, profile, status === "lembur" ? "setujui" : "tolak",
          (status === "lembur" ? "Menyetujui lembur " + jam + " jam " : "Menandai lupa absen pulang ") + x.u.nama + " " + x.row.tanggal);
        x.kep = { ...data, waktu: null }; tampilLembur(at); toast("Tersimpan: " + x.u.nama + " " + tgl);
      }catch(e){ toast(e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat." : "Gagal: " + e.code); el.disabled = false; }
    };
    if ((x.bawah || x.kep?.superadmin) && !isSuper()){
      c.querySelectorAll(".lb-aksi input, .lb-aksi button").forEach(el => { el.disabled = true; el.title = "Hanya superadmin yang bisa mengubah"; }); }
    // keputusan lembur memengaruhi gaji: hanya admin / superadmin (supervisor hanya melihat)
    if (!isAdmin()) c.querySelectorAll(".lb-aksi input, .lb-aksi button").forEach(el => { el.disabled = true; el.title = "Hanya admin yang bisa memutuskan lembur"; });
    const bok = c.querySelector(".b-ok"); if (bok) bok.onclick = e => simpan("lembur", e.currentTarget);
    const blp = c.querySelector(".b-lupa"); if (blp) blp.onclick = e => simpan("lupa", e.currentTarget);
    const rs = c.querySelector(".b-reset-lb");
    if (rs) rs.onclick = async () => { try{ const ref = D("lembur", x.u.uid + "_" + x.row.tanggal);
      if (x.lhkJam != null) await setDoc(ref, { uid: x.u.uid, nama: x.u.nama, tanggal: x.row.tanggal, status: "koreksi", lhkJam: x.lhkJam }); else await deleteDoc(ref);
      x.kep = null; tampilLembur(at); }catch(e){ toast("Gagal: " + e.code); } };
    return c;
  }));
}
$("#lb-bulan").onchange = muatLembur;
$("#lb-hitung-ulang").onclick = async () => {
  if (!await tanya("Hitung ulang jam lembur di semua Cek lembur yang sudah disetujui, memakai aturan lembur sekarang?\n(Jam yang dulu diketik manual juga ikut diganti.)", { ya: "Hitung ulang" })) return;
  hitungUlangCekLembur($("#lb-msg"));
};
$("#lb-cari").oninput = () => tampilLembur();
$("#lb-filter").onchange = () => tampilLembur();
$("#lb-shift").onchange = () => tampilLembur();

/* ================= LAPORAN ABSENSI ================= */
{ const n = new Date(); $("#l-bulan").value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"); }
let laporan = [], lapPeriode = "", lapAturan = {};
// Ambil absen & pengajuan izin/sakit yang disetujui dalam satu bulan, dikelompokkan per karyawan
async function dataBulan(y, m, awal = 1){
  const P = rentangPeriode(y, m, awal), akhirKey = P.akhirKey, awalKey = P.awalKey;
  const [aSnap, zSnap, kSnap, pSnapG] = await Promise.all([
    getDocs(query(C("absensi"), where("ts", ">=", Timestamp.fromDate(P.mulai)),
      where("ts", "<", Timestamp.fromDate(P.akhir)), orderBy("ts"))),
    getDocs(query(C("izin"), where("status", "==", "terima"), where("mulai", "<=", akhirKey))),
    getDocs(query(C("lembur"), where("tanggal", ">=", awalKey), where("tanggal", "<=", akhirKey))).catch(() => ({ docs: [] })),
    getDocs(C("payroll")).catch(() => ({ docs: [] }))   // pilihan "hari libur dihitung" per karyawan (hanya bisa dibaca admin)
  ]);
  const absen = {}, cuti = {}, kep = {}, gaji = {};
  pSnapG.docs.forEach(d => { gaji[d.id] = { liburJadi: d.data().liburJadi, polaKerja: d.data().polaKerja || "", gajiTetap: !!d.data().gajiTetap }; });
  kSnap.docs.forEach(d => { const x = d.data(); (kep[x.uid] ||= {})[x.tanggal] = x; });
  aSnap.docs.forEach(d => { const r = { ...d.data(), _id: d.id }; (absen[r.uid] ||= []).push(r); });
  zSnap.docs.forEach(d => { const z = d.data(); if (z.selesai >= awalKey) (cuti[z.uid] ||= []).push(z); });
  return { absen, cuti, kep, gaji };
}
$("#l-go").onclick = async () => {
  const [y, mo] = $("#l-bulan").value.split("-").map(Number); if (!y) return;
  const m = mo - 1;
  $("#l-go").disabled = true; $("#l-info").textContent = "Memuat…"; $("#l-out").dataset.done = "1";
  try{
    const aSnap = await getDoc(D("settings", "payroll"));
    const at = aSnap.exists() ? aSnap.data() : {};
    lapPeriode = rentangPeriode(y, m, at.awalPeriode).label; lapAturan = at;
    const [uSnap, d] = await Promise.all([getDocs(query(collection(db, "users"), where("cid", "==", CID))), dataBulan(y, m, at.awalPeriode)]);
    laporan = uSnap.docs.map(x => ({ uid: x.id, ...x.data() }))
      // yang tidak absen di aplikasi (kehadiran manual / gaji tetap penuh) tanpa satu pun absen tidak ditampilkan, supaya tidak terhitung alpa
      .filter(u => u.kehadiran !== "tidak" && ((u.role === "karyawan" && u.aktif !== false) || d.absen[u.uid])
        && !(!d.absen[u.uid] && (u.kehadiran === "manual" || (d.gaji || {})[u.uid]?.gajiTetap)))
      .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""))
      .map(u => ({ u, k: d.kep[u.uid] || {}, a: d.absen[u.uid] || [], r: hitungGaji(d.absen[u.uid] || [], at, { shift: u.shift || "", grupCV: u.grupCV || "-", tanpaLebihHK: tanpaLebihHK(u), liburJadi: (d.gaji || {})[u.uid]?.liburJadi, polaKerja: (d.gaji || {})[u.uid]?.polaKerja }, y, m, new Date(), d.cuti[u.uid] || [], d.kep[u.uid] || {}) }));
    renderLaporan();
  }catch(e){ $("#l-info").textContent = "Gagal memuat: " + e.code; }
  $("#l-go").disabled = false;
};
// Jumlah absen sah per cara verifikasi
function hitungVerif(a){
  const n = { wajah: 0, jari: 0, dua: 0, lain: 0 };
  for (const x of a || []) if (x.status !== "menunggu" && x.status !== "tolak") n[jenisVerif(x)]++;
  return n;
}
const teksVerif = n => [n.wajah && "🙂 " + fmtNum(n.wajah), n.jari && "👆 " + fmtNum(n.jari), n.dua && "🙂👆 " + fmtNum(n.dua), n.lain && "✍️ " + fmtNum(n.lain)].filter(Boolean).join(" · ") || "-";
function renderLaporan(){
  const T = k => laporan.reduce((s, x) => s + (x.r[k] || 0), 0);
  const hk = laporan[0]?.r.hariKerja || 0;
  $("#l-info").textContent = fmtNum(laporan.length) + " karyawan · " + lapPeriode + " · " + fmtNum(hk) + " hari kerja";
  if (!laporan.length){ $("#l-out").innerHTML = '<p class="meta">Belum ada karyawan.</p>'; return; }
  const dasar = T("hadirKerja") + T("sakit") + T("izin") + T("cuti") + T("alpha");
  const pctTot = dasar ? Math.round(T("hadirKerja") / dasar * 100) : 0;
  $("#l-out").innerHTML = `
    <div class="lap-ringkas">
    <div class="card lap-stat"><div class="lap-pct"><span class="meta">Tingkat kehadiran</span><b class="big">${fmtNum(pctTot)}%</b></div>
      <div class="stat5">
        <div><b>${fmtNum(T("hadirKerja"))}</b><span>Hadir</span></div>
        <div><b>${fmtNum(T("kaliTelat"))}</b><span>Telat</span></div>
        <div><b>${fmtNum(T("sakit"))}</b><span>Sakit</span></div>
        <div><b>${fmtNum(T("izin"))}</b><span>Izin</span></div>
        <div><b>${fmtNum(T("cuti"))}</b><span>Cuti</span></div>
        <div><b>${fmtNum(T("alpha"))}</b><span>Alpa</span></div>
        <div><b>${fmtNum(T("lebihHK"))}</b><span>Lebih HK${T("lebihHK") ? ` <small>(${fmtNum(T("jamLebihHK"))} jam)</small>` : ""}</span></div>
        <div><b>${fmtNum(T("jamLembur"))}</b><span>Jam lembur</span></div>
      </div></div>
    <div class="card lap-harian"><b>📅 Laporan format harian</b><span class="meta">IN · OUT · Lembur · LB HK · Lokasi per tanggal, 1 sheet per karyawan</span>
      <div class="btns"><button class="small" id="l-xh">Excel (semua)</button><button class="small alt" id="l-ch">Cetak (semua)</button></div></div>
    </div>
    <div class="tablewrap"><table class="rekap-tbl">
      <thead><tr><th>Nama</th><th>Hadir</th><th>Telat</th><th>Sakit</th><th>Izin</th><th>Cuti</th><th>Alpa</th><th>Lebih HK</th><th title="Jumlah jam lembur">Lembur (jam)</th><th title="Jumlah absen menurut cara verifikasi">Verifikasi</th><th>%</th></tr></thead>
      <tbody>${laporan.map(({ u, r }, i) => { const ds = r.hadirKerja + r.sakit + r.izin + (r.cuti || 0) + r.alpha;
        return `<tr><td><button type="button" class="l-nama" data-i="${i}" title="Lihat rincian absen">${esc(u.nama)}</button></td><td>${fmtNum(r.hadirKerja)}</td><td>${fmtNum(r.kaliTelat)}</td><td>${fmtNum(r.sakit)}</td>
          <td>${fmtNum(r.izin)}</td><td>${fmtNum(r.cuti || 0)}</td><td class="${r.alpha ? "bad" : ""}">${fmtNum(r.alpha)}</td><td class="${r.lebihHK ? "lebih" : ""}">${fmtNum(r.lebihHK || 0)}</td><td>${fmtNum(r.jamLembur || 0)}</td><td class="verif-sel">${teksVerif(hitungVerif(laporan[i].a))}</td><td>${ds ? fmtNum(Math.round(r.hadirKerja / ds * 100)) : 0}%</td></tr>`; }).join("")}</tbody>
      <tfoot><tr><td>Total</td><td>${fmtNum(T("hadirKerja"))}</td><td>${fmtNum(T("kaliTelat"))}</td><td>${fmtNum(T("sakit"))}</td>
        <td>${fmtNum(T("izin"))}</td><td>${fmtNum(T("cuti"))}</td><td>${fmtNum(T("alpha"))}</td><td>${fmtNum(T("lebihHK"))}</td><td>${fmtNum(T("jamLembur"))}</td><td class="verif-sel">${teksVerif(laporan.reduce((n, x) => { const h = hitungVerif(x.a); for (const k in h) n[k] += h[k]; return n; }, { wajah: 0, jari: 0, dua: 0, lain: 0 }))}</td><td>${fmtNum(pctTot)}%</td></tr></tfoot>
    </table></div>
    <p class="meta">Klik nama karyawan untuk melihat rincian absen per hari. Telat = jumlah kejadian (total ${fmtNum(T("menitTelat"))} menit). Alpa = hari kerja yang sudah lewat tanpa absen dan tanpa izin/sakit yang disetujui. Lebih HK = masuk di tanggal merah / hari libur (tidak dihitung untuk operator &amp; supir). Verifikasi = jumlah absen dengan 🙂 wajah, 👆 sidik jari, 🙂👆 keduanya, ✍️ manual/kios/lainnya.</p>
    <div class="btns" style="margin-top:10px"><button class="small" id="l-print">Cetak laporan</button><button class="small alt" id="l-csv">Unduh CSV</button></div>`;
  $("#l-out").querySelectorAll(".l-nama").forEach(b => b.onclick = () => rincianAbsen(laporan[+b.dataset.i], b));
  $("#l-print").onclick = cetakLaporan;
  $("#l-xh").onclick = () => unduhFormatHarian(laporan.filter(x => (x.r.rows || []).length));
  $("#l-ch").onclick = () => cetakFormatHarian(laporan.filter(x => (x.r.rows || []).length));
  $("#l-csv").onclick = () => {
    catatLog(CID, me.uid, profile, "ekspor", "Mengunduh CSV laporan absensi " + lapPeriode);
    const head = ["Nama","Group CV","Proyek","Hari kerja","Hadir","Telat (x)","Telat (menit)","Sakit","Izin","Cuti","Tanpa keterangan","Lebih HK","Lembur (jam)","Kehadiran (%)","Absen wajah","Absen sidik jari","Absen wajah+jari","Absen manual/lainnya"];
    const rows = laporan.map(({ u, a, r }) => { const ds = r.hadirKerja + r.sakit + r.izin + (r.cuti || 0) + r.alpha, v = hitungVerif(a);
      return [u.nama, namaCV(u.grupCV), namaPJ(u.proyek), r.hariKerja, r.hadirKerja, r.kaliTelat, r.menitTelat, r.sakit, r.izin, r.cuti || 0, r.alpha, r.lebihHK || 0, r.jamLembur, ds ? Math.round(r.hadirKerja / ds * 100) : 0, v.wajah, v.jari, v.dua, v.lain]; });
    rows.push(["TOTAL", "", "", "", T("hadirKerja"), T("kaliTelat"), T("menitTelat"), T("sakit"), T("izin"), T("cuti"), T("alpha"), T("lebihHK"), T("jamLembur"), pctTot, ...(() => { const n = { wajah: 0, jari: 0, dua: 0, lain: 0 }; laporan.forEach(x => { const h = hitungVerif(x.a); for (const k in h) n[k] += h[k]; }); return [n.wajah, n.jari, n.dua, n.lain]; })()]);
    unduhCSV([head, ...rows], "absensi-" + $("#l-bulan").value + ".csv");
  };
}
function cetakLaporan(){
  catatLog(CID, me.uid, profile, "ekspor", "Mencetak laporan absensi " + lapPeriode);
  const w = window.open("", "_blank"); if (!w){ toast("Izinkan pop-up untuk mencetak laporan."); return; }
  const salin = document.querySelector("#l-out .rekap-tbl").cloneNode(true);
  salin.querySelectorAll(".l-nama").forEach(b => b.replaceWith(b.textContent));
  const tbl = salin.outerHTML;
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Laporan Absensi ${esc(lapPeriode)}</title>
    <style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#13213C}h1{font-size:1.3rem;margin:0}
    p{color:#5B6878;margin:4px 0 16px}table{width:100%;border-collapse:collapse;font-size:.9rem}
    th,td{padding:7px 8px;border-bottom:1px solid #D5DDD9;text-align:right}th:first-child,td:first-child{text-align:left}
    ${KOP_CSS}thead th{border-bottom:1.5px solid #13213C}tfoot td{font-weight:800;border-top:2px solid #13213C;border-bottom:0}td.bad{color:#C2412D}</style></head>
    <body>${kopHTML(perusahaan)}<h1>Laporan Absensi</h1><p>${esc(lapPeriode)} · ${esc($("#l-info").textContent)}</p>${tbl}<script>print()<\/script></body></html>`);
  w.document.close();
}
// Rincian absen per hari untuk satu karyawan (dibuka dengan klik nama di rekap)
const HARI_PENDEK = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];
function rincianAbsen({ u, a, r, k: kepU = {} }, tombolAsal){
  const sah = a.filter(x => x.status !== "menunggu" && x.status !== "tolak").map(x => ({ x, d: tsOf(x) })).filter(o => o.d);
  const tunggu = a.filter(x => x.status === "menunggu").length;
  const asal = x => metodeAbsen(x);
  const info = (tgl, type, jamTxt) => {
    if (!jamTxt || jamTxt === "-") return "";
    const besok = dayKey(new Date(new Date(tgl + "T12:00").getTime() + 864e5));
    const cocok = sah.filter(o => o.x.type === type && (dayKey(o.d) === tgl || (type === "pulang" && dayKey(o.d) === besok)) && String(o.d.getHours()).padStart(2, "0") + ":" + String(o.d.getMinutes()).padStart(2, "0") === jamTxt);
    const o = cocok[0]; if (!o) return "";
    const bagian = [o.x.lokasi && o.x.lokasi !== "manual" ? o.x.lokasi : "", asal(o.x)].filter(Boolean);
    // superadmin / admin yang diizinkan: ubah jam absen langsung dari tabel
    const ubah = bisaEditAbsen() && o.x._id ? ` <button type="button" class="ikon-btn ra-ubah-absen" data-id="${esc(o.x._id)}" title="Ubah jam ${type} ini" aria-label="Ubah absen ${type}">✏️</button>` : "";
    return bagian.length || ubah ? `<small>${esc(bagian.join(" · "))}${ubah}</small>` : "";
  };
  // Lembur & Lebih HK per tanggal bisa diubah admin (disimpan sebagai keputusan di koleksi lembur)
  const bisaUbah = isAdmin(), kerjaTgl = Object.fromEntries((r.kalender || []).map(z => [z.tanggal, z.kerja]));
  const pakaiLHK = !tanpaLebihHK(u) && r.liburJadi !== "lembur";
  const fullKerja = r.gaji?.polaKerja === "7";       // "Hari kerja: Setiap hari": lembur & Lebih HK hanya kalau diisi admin
  // di Rincian absen admin selalu bisa mengisi lembur & Lebih HK (angka admin jadi patokan gaji)
  const kunciLembur = () => "";
  const selLembur = x => {
    const ada = x.masuk || x.pulang, teks = x.lembur ? fmtNum(x.lembur) + " jam" : "";
    // hari Lebih HK juga bisa diisi lembur: Lebih HK hari itu otomatis jadi 0 (diganti lembur)
    if (!bisaUbah || !ada) return teks;
    const kunci = kunciLembur(x);
    return `<input type="number" class="ra-edit" data-jenis="lembur" data-tgl="${x.tanggal}" min="0" max="24" step="1" value="${x.lembur || 0}"${kunci ? ` disabled title="${esc(kunci)}"` : x.lebihHK ? ' title="Isi jam lembur: Lebih HK hari ini otomatis jadi 0 (diganti lembur)"' : ' title="Ubah jam lembur (0 = tidak lembur)"'}>${kepU[x.tanggal]?.status === "lembur" ? '<small class="ra-ubah">✎ disetujui</small>' : ""}`;
  };
  const selLHK = x => {
    const ada = x.masuk || x.pulang, teks = x.lebihHK ? fmtNum(x.jamLHK || 0) + " jam" : "";
    // hari libur yang ada absennya: Lebih HK selalu bisa diisi admin (angka admin jadi patokan gaji)
    if (!bisaUbah || !ada) return teks;      // kolom selalu bisa diisi (hari kerja maupun hari libur)
    const kunci = "";
    return `<input type="number" class="ra-edit" data-jenis="lhk" data-tgl="${x.tanggal}" min="0" max="24" step="1" value="${x.lebihHK ? (x.jamLHK || 0) : 0}"${kunci ? ` disabled title="${esc(kunci)}"` : kerjaTgl[x.tanggal] !== false ? ' title="Isi jam Lebih HK untuk hari kerja ini (0 / kosong = tidak ada). Lembur hari ini jadi 0."' : ' title="Jam Lebih HK (0 = tidak dihitung Lebih HK, kosongkan = hitung otomatis)"'}>${x.lhkKoreksi ? '<small class="ra-ubah">✎ diubah admin</small>' : ""}`;
  };
  const baris = (r.rows || []).map(x => {
    const t = new Date(x.tanggal + "T12:00");
    const kelas = x.alpha ? "alpha" : x.ket === "Tidak absen pulang" ? "kurang" : (x.ket && !x.masuk) ? "izin" : "";
    return `<tr class="${kelas}"><td><b>${HARI_PENDEK[t.getDay()]}</b> ${tglMedium(x.tanggal)}</td>
      <td>${x.masuk || "-"}${info(x.tanggal, "masuk", x.masuk)}</td><td>${x.pulang || "-"}${x.pulangTgl ? ` <span class="tgl-lain" title="Absen pulang tanggal ${esc(tglMedium(x.pulangTgl))} untuk absen masuk ${esc(tglMedium(x.tanggal))}">${esc(tglMedium(x.pulangTgl))}</span>` : ""}${info(x.tanggal, "pulang", x.pulang)}</td>
      <td>${x.telat ? fmtNum(x.telat) + " mnt" : ""}</td><td>${selLembur(x)}</td><td>${selLHK(x)}</td><td>${esc(x.ket || "")}</td></tr>`;
  }).join("");
  const box = document.createElement("div"); box.className = "rincian-absen";
  const shiftTeks = r.shiftNama || `Jam kerja utama (${lapAturan.jamMasuk || "08:00"}–${lapAturan.jamPulang || "17:00"})`;
  box.innerHTML = `<p class="meta">${esc(lapPeriode)}${u.jabatan ? " · " + esc(u.jabatan) : ""}</p>
    <p class="meta ra-shift">🕘 ${esc(shiftTeks)}${r.gaji?.polaKerja === "7" ? " · <b>Hari kerja: setiap hari</b> (Minggu jam bebas; lembur & Lebih HK hanya yang diisi admin)" : r.gaji?.polaKerja === "7L" ? " · <b>Hari kerja: Setiap Hari (Full) + Lbr + Lebih HK</b> (semua hari yang diabsen = hari kerja, tidak hadir tanpa denda, lembur dihitung, masuk Minggu / tanggal merah ditambah Lebih HK)" : ""}</p>
    <div class="ra-stat">
      <div><b>${fmtNum(r.hadirKerja)}/${fmtNum(r.hariKerja)}</b><span>Hadir</span></div>
      <div><b>${fmtNum(r.kaliTelat)}×</b><span>Telat${r.menitTelat ? " · " + fmtNum(r.menitTelat) + " mnt" : ""}</span></div>
      <div><b>${fmtNum(r.sakit)}</b><span>Sakit</span></div><div><b>${fmtNum(r.izin)}</b><span>Izin</span></div>
      <div><b>${fmtNum(r.cuti || 0)}</b><span>Cuti</span></div><div class="${r.alpha ? "bad" : ""}"><b>${fmtNum(r.alpha)}</b><span>Tidak hadir</span></div>
      <div><b>${fmtNum(r.jamLembur)}</b><span>Jam lembur</span></div><div><b>${fmtNum(r.tanpaPulang || 0)}×</b><span>Tak absen pulang</span></div>
      <div class="${r.lebihHK ? "lebih" : ""}"><b>${fmtNum(r.lebihHK || 0)}${r.lebihHK ? ` <small class="ra-jam">(${fmtNum(r.jamLebihHK || 0)} jam)</small>` : ""}</b><span>Lebih HK (hari)</span></div>
    </div>
    ${tunggu ? `<p class="meta" style="color:var(--warn,#B7791F)">⏳ ${fmtNum(tunggu)} absen masih menunggu persetujuan dan belum dihitung.</p>` : ""}
    ${baris ? `<div class="tablewrap"><table class="ra-tbl"><thead><tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th><th>Telat</th><th>Lembur</th><th>Lebih HK</th><th>Keterangan</th></tr></thead>
      <tbody>${baris}</tbody></table></div>` : '<p class="meta">Belum ada catatan absen di periode ini.</p>'}
    ${bisaEditAbsen() && a.length ? `<details class="ra-catatan"><summary>Ubah / hapus catatan absen <span class="meta">(${fmtNum(a.length)} catatan)</span></summary>
      <ul class="ra-list"></ul></details>` : ""}
    <div class="btns" style="margin-top:12px"><button type="button" class="small ra-cetak">Cetak</button><button type="button" class="small alt ra-xh">Excel format harian</button><button type="button" class="small alt ra-ch">Cetak format harian</button><button type="button" class="small alt ra-tutup">Tutup</button></div>`;
  const ul = box.querySelector(".ra-list");
  if (ul){
    const segar = async () => { box.hidden = true; await muatUlangLaporan(); const baru = laporan.find(z => z.u.uid === u.uid); if (baru) rincianAbsen(baru, tombolAsal); };
    [...a].sort((p, q) => tsOf(p) - tsOf(q)).forEach(x => {
      const li = document.createElement("li"), d = tsOf(x);
      const [cls, txt] = STATUS[x.status] || ["wait", x.status];
      li.innerHTML = `<div><b>${HARI_PENDEK[d.getDay()]} ${tglMedium(d)} · ${jamTitik(d)}</b>
        <span class="tag ${x.type === "masuk" ? "in" : "out"}">${jenis(x.type)}</span> <span class="tag ${cls}">${esc(txt)}</span>
        ${x.diedit ? `<span class="tag wait" title="${esc("Diubah oleh " + (x.dieditOleh || "") + (x.alasanEdit ? ": " + x.alasanEdit : ""))}">Diubah</span>` : ""}
        <small>${esc([x.lokasi && x.lokasi !== "manual" ? x.lokasi : "", x.manual ? "Manual" : x.kios ? "Kios" : ""].filter(Boolean).join(" · "))}</small></div>`;
      li.append(tombolUbahHapus(x._id, x, segar));
      ul.append(li);
    });
  }
  document.body.append(box);
  box.querySelector(".ra-tutup").onclick = () => { box.hidden = true; };
  // setelah simpan: rincian dibuka ulang dengan data terbaru TANPA menutup; posisi gulir & kotak yang diedit dipertahankan
  const segarRincian = async (tgl, jenis) => {
    const isi = box.closest(".modal-isi"), sc = isi?.scrollTop || 0;
    await muatUlangLaporan(); const baru = laporan.find(z => z.u.uid === u.uid);
    if (!baru){ box.hidden = true; return; }
    const lama = box; rincianAbsen(baru, tombolAsal); lama.hidden = true;
    const balik = () => { const semua = document.querySelectorAll(".modal-isi"), m = semua[semua.length - 1]; if (!m) return; m.scrollTop = sc;
      const inp = m.querySelector(`.ra-edit[data-tgl="${tgl}"][data-jenis="${jenis}"]`); if (inp){ inp.focus({ preventScroll: true }); inp.select?.(); } };
    balik(); setTimeout(balik, 80);
  };
  box.querySelectorAll(".ra-ubah-absen").forEach(b => b.onclick = () => {
    const x = a.find(z => z._id === b.dataset.id); if (x) ubahAbsen(x._id, x, b, () => segarRincian(x.tanggal || "", ""));
  });
  box.querySelectorAll(".ra-edit").forEach(inp => inp.onchange = async () => {
    const tgl = inp.dataset.tgl, jenisUbah = inp.dataset.jenis, ref = D("lembur", u.uid + "_" + tgl), kp = kepU[tgl] || null;
    if (box.dataset.menyimpan) return; box.dataset.menyimpan = "1";      // cegah simpan dobel (change bisa terpicu 2×)
    const kosong = inp.value.trim() === "", v = Math.max(0, Math.min(24, parseInt(inp.value, 10) || 0));
    const dasar = { uid: u.uid, nama: u.nama || "", tanggal: tgl };
    const bersih = o => { const c = { ...o }; delete c.waktu; delete c.dihitungUlang; return c; };
    inp.disabled = true;
    try{
      if (jenisUbah === "lembur"){
        const row = (r.rows || []).find(z => z.tanggal === tgl) || {};
        const gantiLHK = row.lebihHK && v > 0;      // hari Lebih HK diganti lembur -> Lebih HK hari itu 0
        await setDoc(ref, { ...dasar, status: "lembur", jam: v, manual: true, ...(gantiLHK ? { lhkJam: 0 } : kp?.lhkJam != null ? { lhkJam: kp.lhkJam } : {}),
          oleh: profile.nama, olehUid: me.uid, waktu: serverTimestamp() });
        catatLog(CID, me.uid, profile, "ubah", `Mengubah lembur ${u.nama} ${tgl} menjadi ${v} jam (rincian absen)` + (gantiLHK ? ", Lebih HK hari itu dijadikan 0" : ""));
      } else if (kosong){
        // kembali dihitung otomatis
        if (!kp || kp.status === "koreksi") await deleteDoc(ref).catch(() => {});
        else { const c = bersih(kp); delete c.lhkJam; delete c.superadmin; await setDoc(ref, { ...c, waktu: serverTimestamp() }); }
        catatLog(CID, me.uid, profile, "ubah", `Lebih HK ${u.nama} ${tgl} dikembalikan ke hitungan otomatis`);
      } else {
        const { superadmin: _s, ...kpTanpaSA } = kp ? bersih(kp) : {};
        await setDoc(ref, kp && kp.status !== "koreksi" ? { ...kpTanpaSA, lhkJam: v, manual: true, waktu: serverTimestamp() }
          : { ...dasar, status: "koreksi", lhkJam: v, manual: true, oleh: profile.nama, olehUid: me.uid, waktu: serverTimestamp() });
        catatLog(CID, me.uid, profile, "ubah", `Mengubah Lebih HK ${u.nama} ${tgl} menjadi ${v} jam (rincian absen)`);
      }
      toast("Tersimpan: " + (jenisUbah === "lembur" ? "lembur " : "Lebih HK ") + tglMedium(tgl));
      segarRincian(tgl, jenisUbah);
    }catch(e){ inp.disabled = false; delete box.dataset.menyimpan; toast(e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal: " + (e.code || e.message)); }
  });
  box.querySelector(".ra-xh").onclick = () => unduhFormatHarian([{ u, a, r }]);
  box.querySelector(".ra-ch").onclick = () => cetakFormatHarian([{ u, a, r }]);
  box.querySelector(".ra-cetak").onclick = () => {
    const w = window.open("", "_blank"); if (!w){ toast("Izinkan pop-up untuk mencetak."); return; }
    const isi = box.cloneNode(true); isi.querySelector(".btns")?.remove();
    w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Rincian Absen ${esc(u.nama)} ${esc(lapPeriode)}</title>
      <style>body{font-family:system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#13213C}h1{font-size:1.3rem;margin:0}
      p{color:#5B6878;margin:4px 0 14px}.ra-stat{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:14px}
      .ra-stat div{border:1px solid #D5DDD9;border-radius:8px;padding:6px 8px}.ra-stat b{display:block}.ra-stat span{font-size:.75rem;color:#5B6878}
      table{width:100%;border-collapse:collapse;font-size:.85rem}th,td{padding:6px 8px;border-bottom:1px solid #D5DDD9;text-align:left;vertical-align:top}
      thead th{border-bottom:1.5px solid #13213C}small{display:block;color:#5B6878;font-size:.72rem}tr.alpha td,.bad{color:#C2412D}
      ${KOP_CSS}</style></head><body>${kopHTML(perusahaan)}<h1>Rincian Absen · ${esc(u.nama)}</h1>${isi.innerHTML}<script>print()<\/script></body></html>`);
    w.document.close();
  };
  popup(box, "Rincian absen · " + u.nama, tombolAsal);
  const pengamat = new MutationObserver(() => { if (!box.isConnected || box.hidden){ pengamat.disconnect(); box.remove(); } });
  pengamat.observe(box, { attributes: true, attributeFilter: ["hidden"] });
}

/* ---------- Laporan format harian (per karyawan): NO · DATE · IN · OUT · Lembur · LB HK · Lokasi ----------
   Baris hari libur diberi warna merah muda, hari tidak masuk ditandai kuning "Tidak Masuk". */
function hariFormat({ u, a, r }){
  const sah = (a || []).filter(x => x.status !== "menunggu" && x.status !== "tolak").sort((p, q) => tsOf(p) - tsOf(q));
  const lokasiTgl = {};
  for (const x of sah){ const k = dayKey(tsOf(x)), l = x.lokasi && x.lokasi !== "manual" ? x.lokasi : "";
    if (l && (!lokasiTgl[k] || (x.type === "masuk" && !lokasiTgl[k].masuk))) lokasiTgl[k] = { l, masuk: x.type === "masuk" }; }
  const peta = {}; (r.rows || []).forEach(x => { peta[x.tanggal] = x; });
  const kal = r.kalender?.length ? r.kalender : (r.rows || []).map(x => ({ tanggal: x.tanggal, kerja: true }));
  const hariIni = dayKey(new Date());
  return kal.map(k => {
    const x = peta[k.tanggal], libur = !k.kerja;
    if (x?.masuk || x?.pulang){
      return { tanggal: k.tanggal, libur, masuk: x.masuk || "-", pulang: (x.pulang || "-") + (x.pulangTgl ? " (" + tglMedium(x.pulangTgl).slice(0, 6) + ")" : ""),
        lembur: x.lembur > 0 ? x.lembur : null, lhk: x.jamLHK > 0 ? x.jamLHK : null, lokasi: lokasiTgl[k.tanggal]?.l || "-" };
    }
    const ket = x && !x.alpha ? x.ket : (k.tanggal < hariIni ? "Tidak Masuk" : "");
    return { tanggal: k.tanggal, libur, kosong: true, ket };
  });
}
function sheetFormatHarian(o){
  const { u, r } = o, data = hariFormat(o);
  const H = s => ({ v: s, s: "kepala" });
  const baris = [
    [{ v: "Laporan Absensi · " + lapPeriode + (perusahaan?.nama ? " · " + perusahaan.nama : ""), s: "judul" }],
    [H("NO"), H("DATE"), H((u.nama || "").toUpperCase() + (u.jabatan ? " (" + u.jabatan.toUpperCase() + ")" : "")), H(""), H(""), H(""), H("")],
    [H(""), H(""), H("IN"), H("OUT"), H("Lembur"), H("LB HK"), H("Lokasi")]
  ];
  let tL = 0, tH = 0, hadir = 0;
  data.forEach((d, i) => {
    const g = d.libur ? "libur" : "isi", gA = d.libur ? "liburAngka" : "isiAngka";
    if (d.kosong){
      baris.push([{ v: i + 1, s: g }, { v: tglMedium(d.tanggal), s: g }, { v: "", s: g }, { v: "", s: g }, { v: "", s: g }, { v: "", s: g },
        d.ket ? { v: d.ket, s: "tidakMasuk" } : { v: "", s: g }]);
      return;
    }
    hadir++; tL += d.lembur || 0; tH += d.lhk || 0;
    baris.push([{ v: i + 1, s: g }, { v: tglMedium(d.tanggal), s: g }, { v: d.masuk, s: g }, { v: d.pulang, s: g },
      d.lembur ? { v: d.lembur, s: gA } : { v: "-", s: g }, d.lhk ? { v: d.lhk, s: gA } : { v: d.libur ? "-" : "", s: g }, { v: d.lokasi, s: g }]);
  });
  baris.push([{ v: "TOTAL", s: "kepala" }, H(""), { v: hadir + " hari masuk", s: "kepala" }, H(""), { v: tL, s: "isiAngka" }, { v: tH, s: "isiAngka" }, H("")]);
  const n = baris.length;
  return { nama: u.nama || "Karyawan", baris, beku: 3, lebar: [6, 12, 10, 12, 10, 10, 20],
    gabung: ["A1:G1", "A2:A3", "B2:B3", "C2:G2", `A${n}:B${n}`, `C${n}:D${n}`], data, tL, tH, hadir };
}
function unduhFormatHarian(daftar){
  if (!daftar.length){ toast("Belum ada data."); return; }
  const blob = buatXlsxGaya(daftar.map(sheetFormatHarian));
  const nama = daftar.length === 1 ? (daftar[0].u.nama || "karyawan") : "semua";
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = ("absensi-harian-" + nama + "-" + $("#l-bulan").value).toLowerCase().replace(/[^a-z0-9-]+/g, "-") + ".xlsx"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  catatLog(CID, me.uid, profile, "ekspor", "Mengunduh Excel laporan absensi format harian " + lapPeriode + (daftar.length === 1 ? " · " + (daftar[0].u.nama || "") : " · " + daftar.length + " karyawan"));
}
function cetakFormatHarian(daftar){
  if (!daftar.length){ toast("Belum ada data."); return; }
  const w = window.open("", "_blank"); if (!w){ toast("Izinkan pop-up untuk mencetak."); return; }
  const halaman = daftar.map(o => {
    const s = sheetFormatHarian(o), u = o.u;
    const isi = s.data.map((d, i) => {
      const c = d.libur ? ' class="lb"' : "";
      if (d.kosong) return `<tr${c}><td>${i + 1}</td><td>${tglMedium(d.tanggal)}</td><td></td><td></td><td></td><td></td>${d.ket ? `<td class="tm">${esc(d.ket)}</td>` : "<td></td>"}</tr>`;
      return `<tr${c}><td>${i + 1}</td><td>${tglMedium(d.tanggal)}</td><td>${esc(d.masuk)}</td><td>${esc(d.pulang)}</td><td class="n">${d.lembur ? d.lembur.toFixed(2) : "-"}</td><td class="n">${d.lhk ? d.lhk.toFixed(2) : d.libur ? "-" : ""}</td><td>${esc(d.lokasi)}</td></tr>`;
    }).join("");
    return `<section>${kopHTML(perusahaan)}<p class="per">Laporan Absensi · ${esc(lapPeriode)}</p><table><thead>
      <tr><th rowspan="2">NO</th><th rowspan="2">DATE</th><th colspan="5">${esc((u.nama || "").toUpperCase())}${u.jabatan ? " (" + esc(u.jabatan.toUpperCase()) + ")" : ""}</th></tr>
      <tr><th>IN</th><th>OUT</th><th>Lembur</th><th>LB HK</th><th>Lokasi</th></tr></thead><tbody>${isi}</tbody>
      <tfoot><tr><td colspan="2">TOTAL</td><td colspan="2">${s.hadir} hari masuk</td><td class="n">${s.tL.toFixed(2)}</td><td class="n">${s.tH.toFixed(2)}</td><td></td></tr></tfoot></table></section>`;
  }).join("");
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>Laporan Absensi Harian ${esc(lapPeriode)}</title>
    <style>body{font-family:Calibri,system-ui,sans-serif;margin:16px;color:#000}section{max-width:560px;margin:0 auto 24px;page-break-after:always}section:last-child{page-break-after:auto}
    .per{margin:4px 0 8px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #000;padding:2px 6px;text-align:center}
    th{background:#D9D9D9}td.n{text-align:right}tr.lb td{background:#F2DCDB;color:#f00}td.tm{background:#FF0 !important;color:#f00 !important;font-weight:700}
    tfoot td{font-weight:700;background:#D9D9D9}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}${KOP_CSS}</style></head>
    <body>${halaman}<script>print()<\/script></body></html>`);
  w.document.close();
  catatLog(CID, me.uid, profile, "ekspor", "Mencetak laporan absensi format harian " + lapPeriode);
}
// Jalankan ulang rekap absensi (dipakai setelah absen diubah/dihapus)
function muatUlangLaporan(){ return new Promise(ok => { const b = $("#l-go"); b.click();
  const tunggu = setInterval(() => { if (!b.disabled){ clearInterval(tunggu); ok(); } }, 100); setTimeout(() => { clearInterval(tunggu); ok(); }, 15000); }); }
const p2 = n => String(n).padStart(2, "0");
const jamTitik = d => p2(d.getHours()) + ":" + p2(d.getMinutes());
const tglJam = d => tglMedium(d) + " " + jamTitik(d);

/* ---------- Ubah / hapus absen: HANYA superadmin (dijaga juga oleh firestore.rules) ---------- */
function tombolUbahHapus(id, r, sesudah){
  const w = document.createElement("span"); w.className = "absen-aksi";
  if (!bisaEditAbsen() || !id) return w;
  w.innerHTML = `<button type="button" class="ikon-btn ab-ubah" title="Ubah absen" aria-label="Ubah absen">✏️</button>
    <button type="button" class="ikon-btn ab-hapus" title="Hapus absen" aria-label="Hapus absen">🗑️</button>`;
  w.querySelector(".ab-ubah").onclick = e => ubahAbsen(id, r, e.currentTarget, sesudah);
  w.querySelector(".ab-hapus").onclick = e => hapusAbsen(id, r, e.currentTarget, sesudah);
  return w;
}
function ubahAbsen(id, r, tombolAsal, sesudah){
  if (!bisaEditAbsen()) return;
  const t = tsOf(r);
  const f = document.createElement("div"); f.className = "ubah-absen";
  f.innerHTML = `<p class="meta" style="margin-top:0">${esc(r.nama)} · tercatat <b>${jenis(r.type)} ${tglJam(t)}</b>${r.tsAsli?.toDate ? " · aslinya " + jenis(r.typeAsli || r.type) + " " + tglJam(r.tsAsli.toDate()) : ""}</p>
    <div class="grid2">
      <div><label>Tanggal (dd/mm/yy)</label><input class="ua-tgl" type="text" inputmode="numeric" placeholder="dd/mm/yy" value="${tglMedium(t)}"></div>
      <div><label>Jam</label><input class="ua-jam jam24" type="text" inputmode="numeric" maxlength="5" placeholder="08:00" value="${jamTitik(t)}"></div>
    </div>
    <label>Jenis</label><select class="ua-jenis"><option value="masuk">Masuk</option><option value="pulang">Pulang</option></select>
    <label>Alasan perubahan</label><input class="ua-alasan" placeholder="mis. salah jam, salah tekan pulang">
    <p class="meta" style="margin:6px 0 0">Hanya superadmin yang bisa mengubah absen. Waktu asli tetap disimpan dan perubahan masuk log aktivitas.</p>
    <div class="btns" style="margin-top:10px"><button type="button" class="small ua-simpan">Simpan perubahan</button><button type="button" class="small alt ua-batal">Batal</button></div>`;
  f.querySelector(".ua-jenis").value = r.type;
  const tglEl = f.querySelector(".ua-tgl");
  pasangTanggalMedium(tglEl);
  document.body.append(f);
  const buang = new MutationObserver(() => { if (f.hidden){ buang.disconnect(); f.remove(); } });
  buang.observe(f, { attributes: true, attributeFilter: ["hidden"] });
  f.querySelector(".ua-batal").onclick = () => { f.hidden = true; };
  f.querySelector(".ua-simpan").onclick = async e => {
    const isoUa = dmyKeIso(tglEl.value), mt = isoUa ? [isoUa, isoUa.slice(8), isoUa.slice(5, 7), isoUa.slice(2, 4)] : null, jam = f.querySelector(".ua-jam").value.trim();
    const type = f.querySelector(".ua-jenis").value, alasan = f.querySelector(".ua-alasan").value.trim();
    const tg = mt ? new Date(2000 + +mt[3], +mt[2] - 1, +mt[1]) : null;
    if (!mt){ tglEl.classList.add("salah"); toast("Tanggal harus format dd/mm/yy dan valid, mis. 05/10/26."); return; }
    if (!jamValid(jam)){ toast("Isi jam format 24 jam, mis. 08:00."); return; }
    if (!alasan){ toast("Isi alasan perubahan."); return; }
    const [h, mi] = jam.split(":").map(Number), waktu = new Date(tg.getFullYear(), tg.getMonth(), tg.getDate(), h, mi);
    if (waktu > new Date()){ toast("Waktu absen tidak boleh di masa depan."); return; }
    if (+waktu === +t && type === r.type){ toast("Tidak ada yang diubah."); return; }
    e.target.disabled = true;
    try{
      const data = { ts: Timestamp.fromDate(waktu), type, diedit: true, dieditOleh: profile.nama, dieditUid: me.uid, dieditPada: serverTimestamp(), alasanEdit: alasan };
      if (!r.tsAsli && r.ts){ data.tsAsli = r.ts; data.typeAsli = r.type; }
      await updateDoc(D("absensi", id), data);
      catatLog(CID, me.uid, profile, "ubah", "Mengubah absen " + r.nama + ": " + jenis(r.type) + " " + tglJam(t) + " → " + jenis(type) + " " + tglJam(waktu) + " · " + alasan);
      f.hidden = true; toast("Absen " + r.nama + " diubah menjadi " + jenis(type) + " " + tglJam(waktu) + ".");
      sesudah?.();
    }catch(err){ toast(err.code === "permission-denied" ? "Ditolak server. Hanya superadmin yang bisa mengubah absen; pastikan deploy-rules.bat sudah dijalankan." : "Gagal: " + (err.code || err.message)); e.target.disabled = false; }
  };
  popup(f, "Ubah absen · " + r.nama, tombolAsal);
}
async function hapusAbsen(id, r, tombolAsal, sesudah){
  if (!bisaEditAbsen()) return;
  if (!await tanya("Hapus absen " + jenis(r.type).toLowerCase() + " " + r.nama + " " + tglJam(tsOf(r)) + "? Data yang dihapus tidak bisa dikembalikan.", { ya: "Hapus" })) return;
  tombolAsal.disabled = true;
  try{
    await deleteDoc(D("absensi", id));
    catatLog(CID, me.uid, profile, "hapus", "Menghapus absen " + jenis(r.type).toLowerCase() + " " + r.nama + " " + tglJam(tsOf(r)));
    toast("Absen " + r.nama + " " + tglJam(tsOf(r)) + " dihapus.");
    sesudah?.();
  }catch(err){ toast(err.code === "permission-denied" ? "Ditolak server. Hanya superadmin yang bisa menghapus absen; pastikan deploy-rules.bat sudah dijalankan." : "Gagal: " + (err.code || err.message)); tombolAsal.disabled = false; }
}
function unduhCSV(rows, nama){
  // teks diawali = + - @ (rumus) dinetralkan supaya tidak dijalankan Excel (CSV injection); angka biasa tetap
  const aman = v => { const t = String(v ?? ""); return typeof v !== "number" && /^[=+\-@\t\r]/.test(t) ? "'" + t : t; };
  const csv = rows.map(r => r.map(v => '"' + aman(v).replace(/"/g, '""') + '"').join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = nama; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ================= GAJI ================= */
let karyawan = [], gajiMap = {}, aturan = { ...ATURAN_DEFAULT }, hasil = [], periode = "", curYM = "", tersimpan = new Set();
const angka = el => parseInt0(el.value);
const NUM = ["jatahCuti","toleransi","uangMakan","transport","telatPerKejadian","telatPerMenit","lemburTarif","lemburMinMenit","lemburMulaiMenit","lebihHKTarif","capKes","capJp"];
const CHK = ["potonganManual","tanpaKomponen","potongAlpha","potongIzin","lemburAktif","lemburSetuju","liburNasional","cutiBersama","bpjsKes","bpjsJht","bpjsJp","pphAktif"];
const PCT = ["pctKes","pctJht","pctJp","pctPph","pctKesP","pctJhtP","pctJpP","pctJkk","pctJkm"];
const persen = el => parseDec(el.value);

async function initGaji(){
  const now = new Date();
  $("#g-bulan").value = $("#k-periode").value = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  try{
    const [uSnap, pSnap, aSnap] = await Promise.all([
      getDocs(query(collection(db, "users"), where("cid", "==", CID))), getDocs(C("payroll")), getDoc(D("settings", "payroll"))
    ]);
    karyawan = uSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.aktif !== false && cvBoleh(u)).sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    gajiMap = Object.fromEntries(pSnap.docs.map(d => [d.id, d.data()]));
    aturan = { ...ATURAN_DEFAULT, ...(aSnap.exists() ? aSnap.data() : {}) }; infoLibur();
  }catch(e){ msg($("#msg3"), "Gagal memuat data gaji: " + e.code, "bad"); return; }
  gajiSiap = true;
  // data gaji selalu mengikuti server (perubahan dari HP / admin lain langsung terlihat, tidak tertimpa data lama)
  if (window.__unsubPayroll) window.__unsubPayroll();
  window.__unsubPayroll = onSnapshot(C("payroll"), snap => {
    gajiMap = Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
    if (!gUsersDirty && !snap.metadata.hasPendingWrites && !gSibukSimpan()) renderUsers();
  }, () => {});
  await muatPinjaman(true);
  if (pengguna.length) sinkronGajiKaryawan(); else renderUsers();
  renderAturan();
  $("#r-user").innerHTML = karyawan.map(u => `<option value="${esc(u.uid)}">${esc(u.nama)}</option>`).join("");
}

// Pinjaman dengan cara potong "ketik": kolom isian jumlah bayar per periode di kartu Gaji > Karyawan
function pinjamanKetikHTML(uid, per){
  const list = pinjamanData.filter(p => p.uid === uid && p.potong === "ketik" && p.status !== "batal" && (p.mulai || "") <= per)
    .filter(p => { const st = statusPinjaman(p, ymTambah(per, -1)); return st.sisa > 0 || +(p.bayar || {})[per] > 0; });
  if (!list.length) return "";
  const bln = new Date(+per.slice(0, 4), +per.slice(5, 7) - 1, 1).toLocaleDateString("id-ID", { month: "short" });
  return `<div class="pj-ketik"><div class="meta"><b>Bayar pinjaman ${esc(bln)}</b></div><div class="grid2 gaji-isian">${list.map(p => {
    const sisa = statusPinjaman(p, ymTambah(per, -1)).sisa;
    return `<div class="kolom-gaji potong"><label title="${esc((p.jenis === "sio" ? "Pinjaman SIO" : "Pinjaman Karyawan") + (p.ket ? " · " + p.ket : ""))}">${p.jenis === "sio" ? "Pinj. SIO" : "Pinjaman"}${p.ket ? " · " + esc(p.ket) : ""}</label>
      <input data-pj="${esc(p.id)}" data-sisa="${sisa}" inputmode="numeric" data-num="int" value="${nilai((p.bayar || {})[per])}" placeholder="sisa ${fmtNum(sisa)}" title="Sisa sebelum ${esc(bln)}: ${rp(sisa)}"></div>`; }).join("")}</div></div>`;
}
// Data karyawan di menu Gaji mengikuti perubahan di menu Karyawan (peran, nama, status, dll.) secara langsung
let gajiSiap = false, gUsersDirty = false;
function sinkronGajiKaryawan(){
  if (!gajiSiap || !isAdmin()) return;
  karyawan = pengguna.filter(u => u.aktif !== false && cvBoleh(u)).map(u => ({ uid: u.id, ...u })).sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
  $("#r-user") && ($("#r-user").innerHTML = karyawan.map(u => `<option value="${esc(u.uid)}">${esc(u.nama)}</option>`).join(""));
  if (!gUsersDirty) { renderUsers(); return; }
  // sedang mengetik di Gaji > Karyawan: jangan gambar ulang, cukup perbarui nama & peran di judul kartu
  document.querySelectorAll("#g-users .emp-card").forEach(c => {
    const u = karyawan.find(x => x.uid === c.dataset.uid); if (!u) return;
    const b = c.querySelector(".emp-judul b"), m = c.querySelector(".emp-judul .meta");
    if (b) b.textContent = u.nama || "";
    if (m) m.textContent = (u.username ? "@" + u.username + " · " : "") + labelPeran(u);
  });
}
// Riwayat data gaji: salinan data LAMA disimpan sebelum setiap perubahan, supaya bisa dikembalikan
const riwayatRef = uid => doc(collection(db, "companies", CID, "payroll", uid, "riwayat"));
let riwayatAktif = null;    // aturan Firebase riwayat sudah di-deploy?
async function cekRiwayat(uid){ if (riwayatAktif != null) return riwayatAktif;
  try{ await getDocs(query(collection(db, "companies", CID, "payroll", uid, "riwayat"), orderBy("ts", "desc"))); riwayatAktif = true; }catch(e){ riwayatAktif = false; }
  return riwayatAktif; }
// salinan riwayat sekarang dibuat oleh SERVER (Cloud Function logGaji) untuk setiap perubahan, dari perangkat/versi mana pun;
// di aplikasi tidak perlu menyalin lagi (supaya tidak dobel)
const salinRiwayat = () => {};
async function bukaRiwayatGaji(u, tombol){
  const f = $("#upl-pilih"); f.innerHTML = '<p class="meta">Memuat riwayat…</p>'; f.hidden = false; popup(f, "Riwayat data gaji · " + u.nama, tombol);
  try{
    const snap = await getDocs(query(collection(db, "companies", CID, "payroll", u.uid, "riwayat"), orderBy("ts", "desc")));
    const list = snap.docs.slice(0, 30).map(d => ({ id: d.id, ...d.data() }));
    const ring = g => [["Gaji pokok", g.gajiPokok], ["U Makan", g.uangMakan], ["Tunj. lainnya", g.tunjangan], ["Transport", g.tjTransport], ["U Lembur", g.uLembur]]
      .filter(([, v]) => +v).map(([n, v]) => n + " " + fmtNum(v)).join(" · ") || "(kosong)";
    f.innerHTML = `<p class="meta" style="margin-top:0">Sekarang: <b>${esc(ring(gajiMap[u.uid] || {}))}</b></p>` + (list.length ? `<div class="tablewrap"><table class="mf-tbl"><tr><th>Waktu</th><th>Oleh</th><th>Data sebelum diubah</th><th></th></tr>${list.map(x =>
      `<tr><td>${esc(x.ts?.toDate ? x.ts.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "-")}</td><td>${esc(x.oleh || "-")}<small>${esc([x.sumber, x.appVer && "aplikasi " + x.appVer].filter(Boolean).join(" · "))}</small></td>
      <td>${esc(ring(x.data || {}))}</td><td><button type="button" class="small alt rw-balik" data-id="${esc(x.id)}">↩ Kembalikan</button></td></tr>`).join("")}</table></div>`
      : '<p class="meta">Belum ada riwayat (riwayat mulai tercatat setelah deploy-functions versi 2026.11.17d).</p>') + '<div class="btns" style="margin-top:10px"><button type="button" class="small alt rw-tutup">Tutup</button></div>';
    f.querySelector(".rw-tutup").onclick = () => { f.hidden = true; };
    f.querySelectorAll(".rw-balik").forEach(b => b.onclick = async () => {
      const x = list.find(z => z.id === b.dataset.id); if (!x) return;
      if (!await tanya(`Kembalikan data gaji ${u.nama} ke:\n${ring(x.data)}\n\nData sekarang (${ring(gajiMap[u.uid] || {})}) disimpan dulu di riwayat.`, { ya: "Kembalikan" })) return;
      try{
        const sk = await getDoc(D("payroll", u.uid)); const bt = writeBatch(db);
        salinRiwayat(bt, u.uid, sk.exists() ? sk.data() : {}, "sebelum dikembalikan");
        bt.set(D("payroll", u.uid), { ...x.data, appVer: VERSI_APP }); await bt.commit();
        gajiMap[u.uid] = x.data; catatLog(CID, me.uid, profile, "gaji", "Mengembalikan data gaji " + u.nama + " dari riwayat");
        toast("Data gaji " + u.nama + " dikembalikan."); f.hidden = true; renderUsers();
      }catch(err){ toast("Gagal: " + (err.code === "permission-denied" ? "jalankan deploy-rules.bat dulu (aturan riwayat belum aktif)." : err.code || err.message)); }
    });
  }catch(err){ f.innerHTML = `<p class="msg bad">Gagal memuat riwayat: ${esc(err.code === "permission-denied" ? "aturan Firebase belum diperbarui — jalankan deploy-rules.bat." : err.code || err.message)}</p>`; }
}
// tandai kartu yang diubah: hanya kartu ini yang disimpan (kartu lain tidak ditimpa)
const tandaiUbah = e => { const c = e.target.closest?.("#g-users .emp-card"); if (!c) return; gUsersDirty = true; c.dataset.ubah = "1"; c._v = (c._v || 0) + 1;
  jadwalSimpanGaji(e.type === "change" ? 700 : 2500); };
document.addEventListener("input", tandaiUbah); document.addEventListener("change", tandaiUbah);
// SIMPAN OTOMATIS Gaji › Karyawan: setiap perubahan disimpan sendiri (antre, satu per satu, hanya kartu yang diubah)
let gTimer = 0, gJalan = null, gLagi = false, gSimpanTs = 0, gAwal = {}, gPer = "";
function jadwalSimpanGaji(ms){ clearTimeout(gTimer); gTimer = setTimeout(() => simpanGaji({ otomatis: true }), ms); }
async function simpanGaji(opsi = {}){
  clearTimeout(gTimer);
  if (gJalan){ gLagi = true; return gJalan; }
  gJalan = (async () => { try{ await simpanGajiInti(opsi); } finally { gSimpanTs = Date.now(); } })();
  try{ await gJalan; } finally { gJalan = null; }
  if (gLagi){ gLagi = false; return simpanGaji(opsi); }
}
const gSibukSimpan = () => !!gJalan || Date.now() - gSimpanTs < 4000 || !!document.activeElement?.closest?.("#g-users");
document.addEventListener("visibilitychange", () => { if (document.hidden && document.querySelector('#g-users .emp-card[data-ubah="1"]')) simpanGaji({ otomatis: true }); });
window.addEventListener("beforeunload", e => { if (gJalan || document.querySelector('#g-users .emp-card[data-ubah="1"]')){ simpanGaji({ otomatis: true }); e.preventDefault(); e.returnValue = ""; } });
const KOLOM = [["gajiPokok", null], ["uangMakan", "U Makan"], ["tjJabatan", "Tunj. jabatan"], ["tjTransport", "Tunj. transport"], ["tunjangan", "Tunj. lainnya"],
  ["uSiang", "U Siang / jam", "op"], ["uLembur", "U Lembur / jam"], ["uTrip", "U Trip / trip"],   // "op" = hanya untuk cara hitung Operator; U Lembur berlaku untuk semua
  ["uLebihHK", "U Lebih HK", "lhk"]];                                                // "lhk" = hanya kalau Lebih HK dibayar (Aturan)
const PER_HARI = m => m === "harian" || m === "operator";
const nilai = v => v ? fmtNum(v) : "";
const MODE_NAMA = { harian: "Upah harian", prorata: "Bulanan prorata (berdasarkan hari kerja)", bulanan: "Bulanan tetap", operator: "Operator (harian + jam siang + lembur)" };
const MODE_BAWAAN = () => aturan.modeGaji || "harian";
const POLA_BAWAAN = () => aturan.hariKerja?.length === 7 ? "7" : aturan.hariKerja?.length === 5 ? "5" : "6";   // dulu "Ikut aturan" (saat ini Senin–Sabtu)      // karyawan tanpa pilihan (dulu "Ikut aturan") = harian
// Sekali jalan: karyawan yang dulu "Ikut aturan" dipindah ke cara hitung yang berlaku (Harian) secara permanen
let migrasiModeJalan = false;
async function migrasiModeIkutAturan(){
  if (migrasiModeJalan || !CID || !bolehGaji("karyawan")) return; migrasiModeJalan = true;
  const target = MODE_BAWAAN(), tPola = POLA_BAWAAN(), polaNama = ({ "5": "Senin–Jumat", "6": "Senin–Sabtu", "7": "Setiap hari" })[tPola];
  const list = karyawan.filter(u => u.kehadiran !== "tidak" && cvBoleh(u) && (!(gajiMap[u.uid] || {}).modeGaji || !(gajiMap[u.uid] || {}).polaKerja));
  if (!list.length) return;
  try{
    let nMode = 0, nPola = 0;
    const isi = list.map(u => { const g = gajiMap[u.uid] || {}, d = { appVer: VERSI_APP };
      if (!g.modeGaji){ d.modeGaji = target; nMode++; } if (!g.polaKerja){ d.polaKerja = tPola; nPola++; } return [u, d]; });
    const N = BATCH_GAJI();
    for (let i = 0; i < isi.length; i += N){ const bt = writeBatch(db);
      isi.slice(i, i + N).forEach(([u, d]) => bt.set(D("payroll", u.uid), d, { merge: true })); await bt.commit(); }
    isi.forEach(([u, d]) => { const { appVer, ...x } = d; gajiMap[u.uid] = { ...(gajiMap[u.uid] || {}), ...x }; gAwal[u.uid] = { ...(gAwal[u.uid] || {}), ...x }; });
    catatLog(CID, me.uid, profile, "gaji", `"Ikut aturan" dipindah permanen: cara hitung gaji pokok ${nMode} karyawan → ${MODE_NAMA[target] || target}, hari kerja ${nPola} karyawan → ${polaNama}`);
  }catch(e){ migrasiModeJalan = false; console.warn("migrasi mode gaji", e); }
}
// Daftar komponen (tambahan/potongan) yang bisa diedit
function komponenHTML(list, kelas){
  return `<div class="komp-list ${kelas}">${(list || []).map(k => `<div class="komp-row">
      <input class="kp-nama" placeholder="Nama, mis. Kasbon" value="${esc(k.nama || "")}">
      <input class="kp-jml" inputmode="numeric" data-num="int" placeholder="Rp" value="${k.jumlah ? fmtNum(k.jumlah) : ""}">
      <select class="kp-jenis"><option value="tambah" ${k.jenis !== "potong" ? "selected" : ""}>Tambahan</option><option value="potong" ${k.jenis === "potong" ? "selected" : ""}>Potongan</option></select>
      <button type="button" class="small alt kp-hapus" aria-label="Hapus komponen">✕</button></div>`).join("")}</div>
    <button type="button" class="small alt kp-tambah" data-untuk="${kelas}">Tambah komponen</button>`;
}
function bacaKomponen(el, kelas){
  return [...el.querySelectorAll(`.${kelas} .komp-row`)].map(r => ({ nama: r.querySelector(".kp-nama").value.trim(),
    jumlah: parseInt0(r.querySelector(".kp-jml").value), jenis: r.querySelector(".kp-jenis").value })).filter(k => k.nama && k.jumlah);
}
function pasangKomponen(card){
  card.querySelectorAll(".kp-hapus").forEach(b => b.onclick = () => { b.parentElement.remove(); card.dispatchEvent(new Event("change", { bubbles: true })); });
  card.querySelectorAll(".kp-tambah").forEach(b => b.onclick = () => {
    const list = card.querySelector("." + b.dataset.untuk);
    list.insertAdjacentHTML("beforeend", komponenHTML([{ nama: "", jumlah: 0, jenis: "tambah" }], "x").match(/<div class="komp-row">[\s\S]*?<\/div>/)[0]);
    pasangKomponen(card); list.lastElementChild.querySelector("input").focus();
  });
}
function renderUsers(){
  setTimeout(migrasiModeIkutAturan, 0);
  gUsersDirty = false; gAwal = JSON.parse(JSON.stringify(gajiMap)); gPer = $("#k-periode").value;
  const harian = aturan.modeGaji === "harian", per = $("#k-periode").value;
  $("#karyawan-info").textContent = aturan.modeGaji === "operator" ? "Operator: upah per hari, U Siang & U Lembur per jam. Hari kerja, jam siang & lembur dari upload Excel." : harian ? "Upah per hari, tunjangan per bulan." : "Gaji pokok dan tunjangan per bulan.";
  const box = $("#g-users");
  if (!karyawan.length){ box.innerHTML = '<p class="meta">Belum ada karyawan terdaftar.</p>'; return; }
  // Filter peran: bawaan (karyawan/supervisor/admin) atau peran tambahan ("c:<id>")
  const fSel = $("#k-peran"); isiFilterPeran(fSel); isiFilterLokasi($("#k-lok")); $("#k-lok").parentElement.hidden = $("#k-lok").hidden;
  const fLok = $("#k-lok").value;
  // Filter cara hitung: memakai cara hitung yang berlaku (khusus karyawan, atau aturan perusahaan)
  const fMode = $("#k-mode-filter").value, fCV = $("#k-cvg")?.value || "";
  const daftar = karyawan.filter(u => u.kehadiran !== "tidak" && cocokPeran(u, fSel.value) && cocokLokasi(u, fLok)
    && cvBoleh(u) && (!fCV || (u.grupCV || "-") === fCV)
    && (!fMode || ((gajiMap[u.uid] || {}).modeGaji || aturan.modeGaji || "bulanan") === fMode));
  if (!daftar.length){ box.innerHTML = '<p class="meta">Tidak ada karyawan yang cocok dengan filter ini.</p>'; return; }
  box.innerHTML = daftar.map(u => {
    const g = gajiMap[u.uid] || {}, bonus = (g.bonus && typeof g.bonus === "object") ? g.bonus[per] : 0;
    const ikut = k => g[k] !== false ? "checked" : "";
    return `<div class="card emp-card" data-uid="${esc(u.uid)}"><div class="emp-judul"><b title="${esc(u.nama)}">${esc(u.nama)}</b>
      <span class="meta" title="${u.username ? "@" + esc(u.username) : ""}">${u.username ? "@" + esc(u.username) + " · " : ""}${esc(labelPeran(u))}</span></div>
      <div class="grid2 gaji-isian">
        ${KOLOM.map(([k, l, op]) => { if (op === "lhk") l = "U Lebih HK / " + ((g.lebihHKMode && g.lebihHKMode !== "tidak" ? g.lebihHKMode : aturan.lebihHKMode) === "jam" ? "jam" : "hari");
          return `<div ${op === "op" ? 'class="op-only"' : op === "lhk" ? 'class="lhk-only"' : ""}><label title="${l || (harian ? "Upah per hari" : "Gaji pokok per bulan")}">${l || (harian ? "Upah per hari" : "Gaji pokok")}</label>
          <input data-k="${k}" inputmode="numeric" data-num="int" value="${nilai(g[k])}"
            ${k === "uangMakan" ? `placeholder="${aturan.uangMakan ? fmtNum(aturan.uangMakan) : "0"} /hari" title="Uang makan per hari hadir. Kosongkan untuk ikut aturan perusahaan"` : k === "uLebihHK" ? `placeholder="${aturan.lebihHKTarif ? fmtNum(aturan.lebihHKTarif) : "otomatis"}" title="Uang masuk di hari libur. Kosongkan untuk ikut tarif perusahaan"` : ""}></div>`; }).join("")}
        <div class="tetap-only"><label title="Gaji tetap penuh (tidak absen): total uang makan bulan ini, diinput manual">U Makan ${esc(new Date(+per.slice(0, 4), +per.slice(5, 7) - 1, 1).toLocaleDateString("id-ID", { month: "short" }))}</label>
          <input data-k="umBulan" inputmode="numeric" data-num="int" value="${nilai((g.umBulan && typeof g.umBulan === "object") ? g.umBulan[per] : 0)}" placeholder="total Rp"></div>
        <div><label title="Bonus ${esc(namaBulan(...per.split("-").map((x, i) => i ? x - 1 : +x)))}">Bonus ${esc(new Date(+per.slice(0, 4), +per.slice(5, 7) - 1, 1).toLocaleDateString("id-ID", { month: "short" }))}</label>
          <input data-k="bonus" inputmode="numeric" data-num="int" value="${nilai(bonus)}"></div>
        ${(aturan.kolomGaji || []).map(k => { const bln = new Date(+per.slice(0, 4), +per.slice(5, 7) - 1, 1).toLocaleDateString("id-ID", { month: "short" });
          const ket = (k.jenis === "tambah" ? "Tambahan" : "Potongan") + (k.periode ? " periode " + bln + " saja" : " setiap bulan");
          return `<div class="kolom-gaji ${k.jenis === "tambah" ? "tambah" : "potong"}"><label title="${esc(k.nama + " · " + ket)}">${esc(k.nama)}${k.periode ? " " + esc(bln) : ""}</label>
          <input data-kg="${esc(k.id)}" inputmode="numeric" data-num="int" value="${nilai(nilaiKolom(g, k, per))}" title="${esc(ket)}"></div>`; }).join("")}
      </div>
      <div class="k-baris-bawah"><button type="button" class="k-lain" hidden></button><button type="button" class="k-riwayat" title="Riwayat perubahan & kembalikan data">🕘 Riwayat</button></div>
      ${pinjamanKetikHTML(u.uid, per)}
      <details class="k-atur"><summary><span class="k-atur-ringkas">⚙️ Pengaturan</span></summary>
      <label class="check k-tetap-wrap" title="Gaji dibayar penuh setiap bulan: tanpa potongan absen/telat & transport harian, tidak perlu upload kehadiran. Uang makan diinput manual: total Rp per bulan (kotak Uang makan bulan)."><input type="checkbox" class="k-tetap" ${g.gajiTetap ? "checked" : ""}> <span><b>Gaji tetap penuh</b> <span class="meta">(tidak dari absen)</span></span></label>
      <label class="k-mode-lbl">Cara hitung gaji pokok</label>
      <select class="k-mode">${Object.entries(MODE_NAMA).map(([v, l]) => `<option value="${v}" ${(g.modeGaji || MODE_BAWAAN()) === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div class="pola-pilih"><label>Hari kerja</label>
      <select class="k-pola">
        <option value="5" ${(g.polaKerja || POLA_BAWAAN()) === "5" ? "selected" : ""}>Senin–Jumat</option>
        <option value="6" ${(g.polaKerja || POLA_BAWAAN()) === "6" ? "selected" : ""}>Senin–Sabtu</option>
        <option value="7" ${(g.polaKerja || POLA_BAWAAN()) === "7" ? "selected" : ""}>Setiap hari (full, Minggu juga kerja)</option>
        <option value="7L" ${(g.polaKerja === "7L" || g.polaKerja === "28") ? "selected" : ""}>Setiap Hari (Full) + Lbr + Lebih HK</option></select></div>
      <div class="lhk-pilih"><label>Lebih HK (masuk hari libur)</label>
      <select class="k-lhk"><option value="">Ikut aturan (${({ hari: "per hari", jam: "per jam" })[aturan.lebihHKMode] || "tidak dibayar"})</option>
        <option value="tidak" ${g.lebihHKMode === "tidak" ? "selected" : ""}>Tidak dibayar</option>
        <option value="hari" ${g.lebihHKMode === "hari" ? "selected" : ""}>Dibayar per hari</option>
        <option value="jam" ${g.lebihHKMode === "jam" ? "selected" : ""}>Dibayar per jam</option></select></div>
      <div class="libur-pilih"><label title="Kerja di hari libur / tanggal merah periode ini dihitung sebagai Lebih HK atau lembur (pilih salah satu)">Hari libur ${esc(new Date(+per.slice(0, 4), +per.slice(5, 7) - 1, 1).toLocaleDateString("id-ID", { month: "short" }))} dihitung</label>
      <select class="k-libur"><option value="">Ikut aturan (${aturan.liburLembur === "lembur" ? "lembur" : "Lebih HK"})</option>
        <option value="lhk" ${g.liburJadi?.[per] === "lhk" ? "selected" : ""}>Lebih HK</option>
        <option value="lembur" ${g.liburJadi?.[per] === "lembur" ? "selected" : ""}>Lembur</option></select></div>
      </details>
      <details class="komp" ${aturan.tanpaKomponen ? "hidden" : ""}><summary>Komponen khusus${(g.komponenTetap?.length || (g.komponen?.[per] || []).length) ? " · " + ((g.komponenTetap?.length || 0) + (g.komponen?.[per] || []).length) + " item" : ""}</summary>
        <p class="meta" style="margin:6px 0 4px"><b>Setiap bulan</b> (mis. cicilan kasbon, tunjangan anak)</p>
        ${komponenHTML(g.komponenTetap, "kp-tetap")}
        <p class="meta" style="margin:12px 0 4px"><b>Periode ${esc(namaBulan(...per.split("-").map((x, i) => i ? x - 1 : +x)))} saja</b> (mis. insentif target, potongan kerusakan)</p>
        ${komponenHTML((g.komponen && g.komponen[per]) || [], "kp-periode")}
      </details>
      <div class="ikut ikut-bpjs" ${aturan.potonganManual ? "hidden" : ""}><span class="meta">Ikut BPJS</span>
        <label class="check"><input type="checkbox" data-ikut="ikutKes" ${ikut("ikutKes")}> Kesehatan</label>
        <label class="check"><input type="checkbox" data-ikut="ikutJht" ${ikut("ikutJht")}> JHT</label>
        <label class="check"><input type="checkbox" data-ikut="ikutJp" ${ikut("ikutJp")}> JP</label>
      </div>
      <div class="ikut ikut-pajak" ${aturan.potonganManual ? "hidden" : ""}><span class="meta">Pajak</span>
        <label class="check"><input type="checkbox" data-ikut="kenaPph" ${ikut("kenaPph")}> Kena PPh 21</label>
        <label class="ptkp-wrap">Status PTKP <select class="k-ptkp" title="TK = tidak kawin, K = kawin, angka = jumlah tanggungan (maks. 3)">
          ${Object.keys(PTKP).map(x => `<option value="${x}" ${(g.ptkp || "TK/0") === x ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <label class="ptkp-wrap">NIK/NPWP <input class="k-npwp" inputmode="numeric" maxlength="16" placeholder="16 digit" value="${esc(g.npwp || "")}"></label>
        <label class="check"><input type="checkbox" class="k-tanpanpwp" ${g.tanpaNpwp ? "checked" : ""}> Belum punya NPWP (+20%)</label>
      </div></div>`;
  }).join("");
  box.querySelectorAll(".emp-card").forEach(card => {
    pasangKomponen(card);
    // kolom yang kosong dilipat supaya kartu tidak terlalu panjang (gaji pokok & uang makan selalu tampil)
    const lipat = () => {
      const kosong = [...card.querySelectorAll(".gaji-isian > div")].filter(dv => { const inp = dv.querySelector("input");
        const inti = ["gajiPokok", "uangMakan"].includes(inp?.dataset.k);
        const v = !inti && inp && !(inp.value || "").replace(/[^\d]/g, "").replace(/^0+$/, "");
        dv.classList.toggle("kol-kosong", !!v); return v && !dv.hidden; });
      const b = card.querySelector(".k-lain"); b.hidden = !kosong.length;
      b.textContent = card.classList.contains("buka-kolom") ? "▲ Sembunyikan kolom kosong" : `＋ ${kosong.length} kolom lain (kosong)`;
    };
    card.querySelector(".k-lain").onclick = () => { card.classList.toggle("buka-kolom"); lipat(); };
    card.querySelector(".k-riwayat").onclick = e => { const u = karyawan.find(x => x.uid === card.dataset.uid); if (u) bukaRiwayatGaji(u, e.currentTarget); };
    card.querySelectorAll(".gaji-isian input").forEach(i => i.addEventListener("change", () => { if (!card.classList.contains("buka-kolom")) return; lipat(); }));
    setTimeout(lipat, 0);
    // label gaji pokok mengikuti cara hitung yang dipilih
    const sel = card.querySelector(".k-mode"), lbl = card.querySelector('[data-k="gajiPokok"]').previousElementSibling;
    const ubahLabel = () => { const tetap = card.querySelector(".k-tetap")?.checked, m = tetap ? "bulanan" : (sel.value || aturan.modeGaji);
      lbl.textContent = tetap ? "Gaji pokok / bulan" : PER_HARI(m) ? "Upah per hari" : "Gaji pokok";
      sel.hidden = card.querySelector(".k-mode-lbl").hidden = !!tetap;
      card.querySelectorAll(".tetap-only").forEach(x => x.hidden = !tetap);
      card.querySelectorAll(".op-only").forEach(x => x.hidden = m !== "operator");
      const opSupir = m === "operator" || tanpaLebihHK(karyawan.find(u => u.uid === card.dataset.uid) || {});
      const lv = card.querySelector(".k-lhk").value, lm = lv === "tidak" ? "" : (lv || aturan.lebihHKMode || "");
      card.querySelector(".lhk-pilih").hidden = opSupir; card.querySelector(".libur-pilih").hidden = opSupir;
      const lj = card.querySelector(".k-libur").value || (aturan.liburLembur === "lembur" ? "lembur" : "lhk");
      card.querySelectorAll(".lhk-only").forEach(x => { x.hidden = !lm || opSupir;
        x.querySelector("label").textContent = "U Lebih HK / " + (lm === "jam" ? "jam" : "hari"); });
      card.querySelectorAll(".ikut-bpjs,.ikut-pajak").forEach(x => x.hidden = !!aturan.potonganManual || m === "operator");
      // ringkasan pengaturan (dilipat) : cara gaji · hari kerja · Lebih HK
      const pk = card.querySelector(".k-pola").value, ap = aturan.hariKerja?.length === 7 ? "7" : aturan.hariKerja?.length === 6 ? "6" : "5";
      card.querySelector(".k-atur-ringkas").textContent = "⚙️ " + [tetap ? "Gaji tetap penuh" : (MODE_NAMA[m] || m || "Bulanan"),
        ({ "5": "Senin–Jumat", "6": "Senin–Sabtu", "7": "Setiap hari", "7L": "Setiap hari + Lbr + LHK", "28": "Setiap hari + Lbr + LHK" })[pk || ap],
        opSupir || pk === "7" ? "" : "LHK " + (lm === "jam" ? "per jam" : lm === "hari" ? "per hari" : "tidak dibayar")].filter(Boolean).join(" · ");
      // hari libur dihitung lembur -> pengaturan Lebih HK tidak dipakai periode ini
      if (lj === "lembur"){ card.querySelector(".lhk-pilih").hidden = true; card.querySelectorAll(".lhk-only").forEach(x => x.hidden = true); }
      if (tetap){ card.querySelector(".lhk-pilih").hidden = card.querySelector(".libur-pilih").hidden = true; card.querySelectorAll(".lhk-only").forEach(x => x.hidden = true); } };
    card.querySelector(".k-tetap").onchange = ubahLabel;
    sel.onchange = ubahLabel; card.querySelector(".k-lhk").onchange = ubahLabel; card.querySelector(".k-libur").onchange = ubahLabel; card.querySelector(".k-pola").onchange = ubahLabel; ubahLabel();
  });
}
$("#k-periode").onchange = async () => { if (document.querySelector('#g-users .emp-card[data-ubah="1"]')) await simpanGaji({ otomatis: true }); renderUsers(); };
$("#k-peran").onchange = renderUsers;
$("#k-mode-filter").onchange = renderUsers;
$("#k-lok").onchange = renderUsers;
$("#k-cvg").onchange = renderUsers;
/* ---------- Import data gaji karyawan dari Excel (Gaji > Karyawan) ---------- */
const KIMP = [   // [field payroll, judul kolom template, regex pengenal judul, regex pengecualian]
  ["modeGaji", "Cara gaji", /cara ?gaji|jenis ?gaji|mode ?gaji/],
  ["gajiPokok", "Gaji pokok / upah harian", /gaji ?pokok|^gp$|upah ?harian/],
  ["uangMakan", "Uang makan / hari", /uang ?makan|^u\.? ?m(akan)?$|^um$/, /bulan|total|^t\.? ?um/],
  ["umBulan", "Uang makan bulan ini (Rp, gaji tetap)", /uang ?makan bulan|t\.? ?um|total ?uang ?makan/],
  ["tjJabatan", "Tunj. jabatan", /tunj\w*\.? ?jabatan/],
  ["tunjangan", "Tunjangan", /^tunj\w*\.?( ?lain\w*)?$/],
  ["tjTransport", "Transport / bulan", /transport/],
  ["lemburBulanan", "Lembur bulanan (tetap)", /lembur ?bulanan|lembur ?tetap/],
  ["uLembur", "U Lembur / jam", /^u\.? ?lembur|lembur ?\/ ?jam|tarif ?lembur|upah ?lembur/],
  ["uTrip", "U Trip / trip", /^u\.? ?trip|trip ?\/ ?trip|tarif ?trip|upah ?trip/],
  ["polaKerja", "Hari kerja (Senin-Sabtu / Setiap hari)", /^hari ?kerja|pola ?kerja/],
  ["lebihHKMode", "Lebih HK dibayar (per hari / per jam / tidak)", /lebih ?hk ?dibayar|cara ?lebih|lebih ?hk ?(per|mode|dihitung)/],
  ["uLebihHK", "U Lebih HK", /^u\.? ?lebih|lebih ?hk|tarif ?lebih/, /dibayar|cara|mode|dihitung|per hari \/|\/ per jam/],
  ["potBpjs", "Potongan BPJS / bulan", /bpjs/],
  ["pph21", "PPh 21 (periode ini)", /pph/],
  ["bank", "Bank", /^bank$/],
  ["noRek", "No rekening", /no\.? ?rek|rekening/, /atas/],
  ["atasNama", "Atas nama rekening", /atas ?nama/]
];
const MODE_KIMP = { bulanan: "bulanan", "bulanan tetap": "bulanan", tetap: "bulanan", harian: "harian", "upah harian": "harian", operator: "operator",
  prorata: "prorata", "hari kerja": "prorata", "berdasarkan hari kerja": "prorata" };
function bukaImportGaji(tombol){
  if (!karyawan.length){ toast("Data karyawan belum dimuat."); return; }
  const f = $("#kimp-form");
  f.innerHTML = `<p class="meta" style="margin-top:0">Bulan <b>${esc(ymLabel($("#k-periode").value))}</b> · perbarui data gaji banyak karyawan sekaligus (dicocokkan lewat Username atau Nama).</p>
    <div class="mf-utama"><button type="button" class="ki-pilih">📤 Pilih file Excel</button><input type="file" class="ki-file" accept=".xlsx,.csv" hidden>
      <span class="meta">File data gaji karyawan (Karya). Setelah dipilih, cek pratinjau lalu klik <b>Perbarui</b>.</span></div>
    <details class="mf-lipat"><summary>Belum punya file? Unduh template Excel</summary><div class="mf-lipat-isi">
      <button type="button" class="small alt ki-template">Unduh template Excel</button> <span class="meta">berisi semua karyawan & data gaji sekarang</span>
      <p class="meta" style="margin:6px 0 0"><b>Cara gaji</b>: Bulanan / Harian / Hari kerja / Operator. <b>Lembur bulanan</b> = uang lembur tetap tiap bulan.
        <b>U Lembur / jam</b> & <b>U Lebih HK</b> kosong = pakai tarif di Aturan. Kolom kosong tidak mengubah data lama; isi 0 untuk mengosongkan.</p></div></details>
    <div class="ki-preview"></div><p class="msg ki-msg"></p>
    <div class="btns" style="margin-top:12px"><button type="button" class="small alt ki-tutup">Tutup</button></div>`;
  const lembBul = g => (g.komponenTetap || []).filter(k => /^lembur bulanan$/i.test(k.nama || "") && k.jenis !== "potong").reduce((a, k) => a + (+k.jumlah || 0), 0);
  const perK = $("#k-periode").value;
  const potBpjsLama = g => (g.komponenTetap || []).filter(k => /^potongan bpjs$/i.test(k.nama || "") && k.jenis === "potong").reduce((a, k) => a + (+k.jumlah || 0), 0);
  const pphLama = g => ((g.komponen && typeof g.komponen === "object" ? g.komponen[perK] : null) || []).filter(k => /^pph 21$/i.test(k.nama || "") && k.jenis === "potong").reduce((a, k) => a + (+k.jumlah || 0), 0);
  // Lembur bulanan / BPJS / PPh 21 disimpan di Kolom gaji tambahan (Aturan) — dipakai yang sudah ada, atau dibuat saat import
  const KOL_IMP = { lemburBulanan: ["Lembur bulanan", "tambah", false, /lembur ?(bulanan|tetap)/i], potBpjs: ["BPJS", "potong", false, /bpjs/i], pph21: ["PPh 21", "potong", true, /pph/i] };
  const cariKol = key => { const [nama, jenis, , re] = KOL_IMP[key];
    const cocok = (aturan.kolomGaji || []).filter(k => re.test(k.nama || "") && (k.jenis === "tambah") === (jenis === "tambah"));
    return cocok.find(k => normKunci(k.nama) === normKunci(nama)) || (cocok.length === 1 ? cocok[0] : null); };
  const nilaiLama = (k, g) => { if (k === "umBulan") return (g.umBulan && typeof g.umBulan === "object") ? g.umBulan[perK] || 0 : 0;
    if (KOL_IMP[k]){ const kd = cariKol(k); const v = kd ? nilaiKolom(g, kd, perK) : 0;
      return v || (k === "lemburBulanan" ? lembBul(g) : k === "potBpjs" ? potBpjsLama(g) : pphLama(g)); }
    return g[k]; };
  f.querySelector(".ki-template").onclick = () => {
    const head = ["Username", "Nama", "Jabatan", ...KIMP.map(k => k[1])];
    const rows = karyawan.filter(u => u.kehadiran !== "tidak").map(u => { const g = gajiMap[u.uid] || {};
      return [u.username || "", u.nama || "", u.jabatan || "", ...KIMP.map(([k]) => k === "polaKerja" ? ({ "5": "Senin-Jumat", "6": "Senin-Sabtu", "7": "Setiap hari", "7L": "Setiap Hari Full + Lbr + Lebih HK" })[g.polaKerja] || "" : k === "lebihHKMode" ? ({ hari: "Per hari", jam: "Per jam", tidak: "Tidak" })[g.lebihHKMode] || "" : k === "modeGaji" ? ({ bulanan: "Bulanan", harian: "Harian", prorata: "Hari kerja", operator: "Operator" })[g.modeGaji] || ""
        : k === "lemburBulanan" || k === "potBpjs" || k === "pph21" || k === "umBulan" ? (nilaiLama(k, g) || "") : k === "bank" || k === "atasNama" ? g[k] || "" : k === "noRek" ? (g.noRek ? String(g.noRek) : "") : (g[k] || ""))]; });
    const blob = buatXlsx([head, ...rows], "Data gaji", [14, 26, 18, 11, 14, 12, 14, 12, 12, 14, 14, 13, 16, 11, 14, 13, 10, 18, 22]);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "data-gaji-karyawan.xlsx"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  f.querySelector(".ki-tutup").onclick = () => { f.hidden = true; };
  f.querySelector(".ki-pilih").onclick = () => f.querySelector(".ki-file").click();
  f.querySelector(".ki-file").onchange = async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    const box = f.querySelector(".ki-preview"), m = f.querySelector(".ki-msg"); msg(m, "");
    let tabel; try{ tabel = await bacaTabel(file); }catch(err){ msg(m, "File tidak bisa dibaca: " + err.message, "bad"); return; }
    const iH = tabel.findIndex(r => r.some(c => /nama|user/i.test(String(c))));
    if (iH < 0){ msg(m, "Kolom Nama / Username tidak ditemukan. Pakai template dari tombol Unduh template.", "bad"); return; }
    const H = tabel[iH].map(c => String(c ?? "").toLowerCase().replace(/\s+/g, " ").trim());
    const kol = (re, bukan) => H.findIndex(h => re.test(h) && !(bukan && bukan.test(h)));
    const cUser = kol(/user/), cNama = kol(/^nama\b|^name$|nama karyawan|nama lengkap/, /atas|user/), cJab = kol(/jabatan|posisi|position/);
    const cK = Object.fromEntries(KIMP.map(([k, , re, bukan]) => [k, kol(re, bukan)]));
    if (!KIMP.some(([k]) => cK[k] >= 0)){ msg(m, "Tidak ada kolom data gaji yang dikenali (mis. Gaji pokok, Uang makan, Tunjangan).", "bad"); return; }
    const byUser = Object.fromEntries(karyawan.filter(u => u.username).map(u => [normKunci(u.username), u]));
    const byNama = Object.fromEntries(karyawan.map(u => [normKunci(u.nama), u]));
    // nama di file bisa lebih pendek/panjang dari nama di aplikasi (mis. "KANITA ERLINDA" vs "Kanita Erlinda Putri")
    const cariNama = t => { const k = normKunci(t); if (!k) return null; if (byNama[k]) return byNama[k];
      const kand = karyawan.filter(u => { const n = normKunci(u.nama); return n && (n.startsWith(k) || k.startsWith(n)); });
      return kand.length === 1 ? kand[0] : null; };
    const baca = [];
    for (const r of tabel.slice(iH + 1)){
      if (!r || r.every(c => String(c ?? "").trim() === "")) continue;
      const user = cUser >= 0 ? String(r[cUser] ?? "").trim() : "", nama = cNama >= 0 ? String(r[cNama] ?? "").trim() : "";
      if (!user && !nama) continue;
      const u = byUser[normKunci(user.replace(/^@/, ""))] || cariNama(nama);
      const isi = {}; let salah = "";
      for (const [k] of KIMP){ const c = cK[k]; if (c < 0) continue; const v = r[c];
        if (v == null || String(v).trim() === "") continue;
        if (k === "modeGaji"){ const md = MODE_KIMP[String(v).trim().toLowerCase()]; if (md) isi.modeGaji = md; else salah = "Cara gaji \"" + v + "\" tidak dikenal"; }
        else if (k === "polaKerja"){ const t = String(v).trim().toLowerCase();
          const md = /ikut ?absen|minggu.*lembur|lembur.*minggu|lbr|lebih ?hk/.test(t) ? "7L" : /setiap|tiap|full|7|minggu/.test(t) ? "7" : /sabtu|6/.test(t) ? "6" : /jum|5/.test(t) ? "5" : /ikut|aturan/.test(t) ? "" : null;
          if (md != null) isi.polaKerja = md; else salah = "Hari kerja \"" + v + "\" tidak dikenal (isi: Senin-Sabtu / Senin-Jumat / Setiap hari)"; }
        else if (k === "lebihHKMode"){ const t = String(v).trim().toLowerCase();
          const md = /jam/.test(t) ? "jam" : /hari/.test(t) ? "hari" : /tidak|^-$|^0$/.test(t) ? "tidak" : /ikut|aturan/.test(t) ? "" : null;
          if (md != null) isi.lebihHKMode = md; else salah = "Lebih HK dibayar \"" + v + "\" tidak dikenal (isi: per hari / per jam / tidak)"; }
        else if (k === "bank" || k === "atasNama") isi[k] = String(v).trim().slice(0, 60);
        else if (k === "noRek"){ const d = String(v).replace(/\D/g, ""); if (d) isi.noRek = d; }
        else { let n = angkaSel(v); if (n == null) continue; if ((k === "potBpjs" || k === "pph21") && n < 0) n = -n;   // potongan boleh ditulis minus
          if (isNaN(n) || n < 0) salah = "Angka tidak valid: " + v; else isi[k] = Math.round(n); }
      }
      if (!u) salah = "Karyawan tidak ditemukan";
      baca.push({ u, label: u?.nama || nama || user, isi, salah, jabatan: cJab >= 0 ? String(r[cJab] ?? "").trim() : "" });
    }
    const ok = baca.filter(x => !x.salah && Object.keys(x.isi).length);
    const kolTampil = KIMP.filter(([k]) => cK[k] >= 0);
    const tampil = (k, v, g) => { const lama = nilaiLama(k, g);
      const t = v => k === "polaKerja" ? (({ "5": "Senin–Jumat", "6": "Senin–Sabtu", "7": "Setiap hari", "7L": "Setiap Hari (Full) + Lbr + Lebih HK" })[v] || "Ikut aturan") : k === "lebihHKMode" ? (({ hari: "Per hari", jam: "Per jam", tidak: "Tidak dibayar" })[v] || "Ikut aturan") : k === "modeGaji" ? (MODE_NAMA[v] || v || "-") : k === "bank" || k === "atasNama" || k === "noRek" ? (v || "-") : (v ? fmtNum(v) : "0");
      if (v === undefined) return '<span class="meta">' + esc(t(lama)) + "</span>";
      return String(lama ?? "") === String(v) || (!lama && !v) ? esc(t(v)) : `<b>${esc(t(v))}</b>${lama ? `<small>dulu ${esc(t(lama))}</small>` : ""}`; };
    box.innerHTML = `<h3 style="margin:12px 0 6px">Pratinjau: ${esc(file.name)}</h3>
      ${cK.potBpjs >= 0 ? `<p class="meta">Potongan BPJS masuk kolom <b>${esc(cariKol("potBpjs")?.nama || "BPJS")}</b>${cariKol("potBpjs")?.periode ? ` (per periode: <b>${esc(ymLabel(perK))}</b>)` : " (tetap setiap bulan)"}; BPJS hitungan otomatis untuk karyawan itu dimatikan supaya tidak dobel.</p>` : ""}
      ${cK.pph21 >= 0 ? `<p class="meta">PPh 21 dicatat sebagai potongan periode <b>${esc(ymLabel(perK))}</b> saja (ganti periode di kolom <b>Periode bonus</b> di atas bila perlu). PPh otomatis untuk karyawan itu dimatikan.</p>` : ""}
      <div class="tablewrap"><table class="mf-tbl"><tr><th>Nama</th>${kolTampil.map(([, l]) => `<th class="num">${esc(l)}</th>`).join("")}<th>Status</th></tr>
      ${baca.map(x => { const g = x.u ? gajiMap[x.u.uid] || {} : {};
        return `<tr class="${x.salah ? "salah" : ""}"><td>${esc(x.label)}${x.jabatan ? `<small>${esc(x.jabatan)}</small>` : ""}</td>
          ${kolTampil.map(([k]) => `<td class="num">${x.u ? tampil(k, x.isi[k], g) : "-"}</td>`).join("")}
          <td>${x.salah ? "✗ " + esc(x.salah) : Object.keys(x.isi).length ? "✓" : '<span class="meta">tidak ada isian</span>'}</td></tr>`; }).join("")}</table></div>
      <p class="meta">Angka <b>tebal</b> = berubah. ${fmtNum(ok.length)} karyawan akan diperbarui${baca.length - ok.length ? `, <b style="color:var(--bad)">${fmtNum(baca.length - ok.length)} baris dilewati</b>` : ""}.</p>
      <div class="btns"><button type="button" class="small ki-simpan" ${ok.length ? "" : "disabled"}>Perbarui ${fmtNum(ok.length)} karyawan</button></div>`;
    box.querySelector(".ki-simpan").onclick = async ev => {
      if (!await tanya("Perbarui data gaji " + ok.length + " karyawan dari " + file.name + "?", { ya: "Perbarui" })) return;
      ev.target.disabled = true;
      try{
        // kolom gaji tambahan untuk Lembur bulanan / BPJS / PPh 21: pakai yang sudah ada, kalau belum ada dibuat
        const kolDef = {}, kolBaru = [];
        for (const key of Object.keys(KOL_IMP)){
          if (!ok.some(x => x.isi[key] !== undefined)) continue;
          let kd = cariKol(key);
          if (!kd){ const [nama, jenis, periode] = KOL_IMP[key]; let n = nama, i = 2;
            while ((aturan.kolomGaji || []).some(k => normKunci(k.nama) === normKunci(n))) n = nama + " " + i++;
            kd = { id: kolomId(), nama: n, jenis, periode }; kolBaru.push(kd); }
          kolDef[key] = kd;
        }
        if (kolBaru.length){ const daftar = [...(aturan.kolomGaji || []), ...kolBaru];
          await setDoc(D("settings", "payroll"), { kolomGaji: daftar, appVer: VERSI_APP }, { merge: true }); aturan.kolomGaji = daftar; kolomEdit = daftar.map(k => ({ ...k })); }
        // cek aturan riwayat sudah aktif (deploy-rules) — kalau belum, upload tetap jalan tanpa riwayat
        const riwayatOk = await cekRiwayat(ok[0].u.uid);
        const NB = Math.min(200, BATCH_GAJI());
        for (let i = 0; i < ok.length; i += NB){
          const bt = writeBatch(db);
          ok.slice(i, i + NB).forEach(x => {
            const lama = gajiMap[x.u.uid] || {}, { lemburBulanan, potBpjs, pph21, umBulan, ...g } = x.isi;
            if (umBulan !== undefined && perK){ const hm = { ...((lama.umBulan && typeof lama.umBulan === "object") ? lama.umBulan : {}) };
              if (umBulan > 0) hm[perK] = umBulan; else delete hm[perK]; g.umBulan = hm; }
            const kt = { ...(lama.kolomTetap || {}) }, kp = JSON.parse(JSON.stringify(lama.kolomPer || {}));
            for (const [key, kd] of Object.entries(kolDef)){
              const v = x.isi[key]; if (v === undefined) continue;
              if (kd.periode){ if (!perK) continue; const t = { ...(kp[perK] || {}) };
                if (v === nilaiWarisan(lama, kd, perK)) delete t[kd.id]; else t[kd.id] = v;   // sama dengan bulan lalu -> ikut bulan lalu
                if (Object.keys(t).length) kp[perK] = t; else delete kp[perK]; }
              else { if (v > 0) kt[kd.id] = v; else delete kt[kd.id]; }
            }
            if (Object.keys(kolDef).length){ g.kolomTetap = kt; g.kolomPer = kp; }
            // bersihkan isian versi import sebelumnya (Komponen khusus) supaya tidak dobel
            const hapusNama = [lemburBulanan !== undefined && /^lembur bulanan$/i, potBpjs !== undefined && /^potongan bpjs$/i].filter(Boolean);
            if (hapusNama.length && (lama.komponenTetap || []).some(k => hapusNama.some(re => re.test(k.nama || ""))))
              g.komponenTetap = lama.komponenTetap.filter(k => !hapusNama.some(re => re.test(k.nama || "")));
            if (pph21 !== undefined && perK && (lama.komponen?.[perK] || []).some(k => /^pph 21$/i.test(k.nama || ""))){
              const km = JSON.parse(JSON.stringify(lama.komponen)); km[perK] = km[perK].filter(k => !/^pph 21$/i.test(k.nama || "")); if (!km[perK].length) delete km[perK]; g.komponen = km; }
            if (potBpjs !== undefined) g.ikutKes = g.ikutJht = g.ikutJp = false;      // BPJS dari file (0 = tidak dipotong): hitungan otomatis dimatikan
            if (pph21 !== undefined) g.kenaPph = false;
            if (g.noRek && !g.atasNama && !lama.atasNama) g.atasNama = x.u.nama;
            const baru = { ...lama, ...g, appVer: VERSI_APP }; bt.set(D("payroll", x.u.uid), baru); gajiMap[x.u.uid] = baru;
            if (riwayatOk) salinRiwayat(bt, x.u.uid, lama, "Upload Excel data gaji " + file.name);
          });
          await bt.commit();
        }
        catatLog(CID, me.uid, profile, "gaji", "Import data gaji " + ok.length + " karyawan dari " + file.name);
        msg(m, `Data gaji ${fmtNum(ok.length)} karyawan diperbarui.`, "ok"); toast("Data gaji " + ok.length + " karyawan diperbarui.");
        renderUsers(); if (hasil.length && curYM === perK) $("#g-hitung").click();
      }catch(err){ msg(m, "Gagal menyimpan: " + (err.code || err.message), "bad"); ev.target.disabled = false; }
    };
  };
  f.hidden = false; popup(f, "Import data gaji karyawan", tombol); f.closest(".modal")?.classList.add("modal-lebar");
}
$("#k-import").onclick = async e => { const t = e.currentTarget;
  if (gUsersDirty && !await tanya("Ada perubahan gaji yang belum disimpan. Lanjut import? Perubahan yang belum disimpan akan hilang.", { ya: "Lanjut" })) return;
  bukaImportGaji(t); };
$("#g-users-save").onclick = () => simpanGaji({ otomatis: false });
async function simpanGajiInti({ otomatis }){
  const m = $("#msg3"), per = gPer || $("#k-periode").value;
  let kartu = [...document.querySelectorAll('#g-users .emp-card[data-ubah="1"]')];
  if (!kartu.length){ if (!otomatis) msg(m, "Semua perubahan sudah tersimpan.", "ok"); return; }
  const diubahNama = [];
  // pengaman: gaji pokok / U Makan yang tadinya terisi lalu jadi kosong harus dikonfirmasi
  const nolKah = el => { const g = gAwal[el.dataset.uid] || gajiMap[el.dataset.uid] || {};
    return ["gajiPokok", "uangMakan"].some(k => +g[k] > 0 && !angka(el.querySelector(`[data-k="${k}"]`))); };
  const nolEl = kartu.filter(nolKah), jadiNol = nolEl.map(el => karyawan.find(u => u.uid === el.dataset.uid)?.nama || "?");
  if (jadiNol.length){
    if (otomatis){ kartu = kartu.filter(el => !nolEl.includes(el));   // simpan otomatis TIDAK mengosongkan gaji pokok / U Makan
      msg(m, "⚠ Gaji pokok / U Makan " + jadiNol.join(", ") + " kosong, belum disimpan. Isi angkanya, atau klik Simpan gaji untuk mengosongkan.", "bad"); }
    else if (!await tanya(`Gaji pokok / U Makan ${jadiNol.length} karyawan akan DIKOSONGKAN:\n${jadiNol.slice(0, 10).join(", ")}${jadiNol.length > 10 ? ", …" : ""}\n\nLanjut simpan?`, { ya: "Ya, kosongkan" })){ msg(m, "Dibatalkan.", ""); return; }
    if (!kartu.length) return;
  }
  if (!jadiNol.length || !otomatis) msg(m, "Menyimpan " + kartu.length + " karyawan…");
  try{
    await Promise.all(kartu.map(async el => {
      const vMulai = el._v || 0;
      // AMAN: baca data terbaru dari server dulu. Kolom yang TIDAK diubah di kartu ini memakai nilai server
      // (supaya halaman lama / admin lain tidak menimpa data yang sudah diisi orang lain)
      const awal = gAwal[el.dataset.uid] || gajiMap[el.dataset.uid] || {};
      let server = {}; try{ const x = await getDoc(D("payroll", el.dataset.uid)); server = x.exists() ? x.data() : {}; }catch(e){ server = awal; }
      const lama = server;
      const ambilBaru = (k, v) => (+(awal[k] || 0) === +(v || 0)) ? (server[k] ?? 0) : v;      // tidak diubah -> pakai server
      const bonusMap = { ...((lama.bonus && typeof lama.bonus === "object") ? lama.bonus : {}) };
      const humMap = { ...((lama.umBulan && typeof lama.umBulan === "object") ? lama.umBulan : {}) };
      const hum = angka(el.querySelector('[data-k="umBulan"]'));
      if (hum) humMap[per] = hum; else delete humMap[per];
      const b = angka(el.querySelector('[data-k="bonus"]'));
      if (b) bonusMap[per] = b; else delete bonusMap[per];
      const data = { bonus: bonusMap, umBulan: humMap };
      KOLOM.forEach(([k]) => data[k] = ambilBaru(k, angka(el.querySelector(`[data-k="${k}"]`))));
      el.querySelectorAll("[data-ikut]").forEach(c => data[c.dataset.ikut] = c.checked);
      data.ptkp = el.querySelector(".k-ptkp")?.value || "TK/0";
      data.npwp = (el.querySelector(".k-npwp")?.value || "").replace(/\D/g, "").slice(0, 16);
      data.tanpaNpwp = !!el.querySelector(".k-tanpanpwp")?.checked;
      data.modeGaji = el.querySelector(".k-mode").value;
      data.gajiTetap = !!el.querySelector(".k-tetap")?.checked;
      data.lebihHKMode = el.querySelector(".k-lhk").value;
      data.polaKerja = el.querySelector(".k-pola")?.value || "";
      const ljMap = { ...((lama.liburJadi && typeof lama.liburJadi === "object") ? lama.liburJadi : {}) }, lj = el.querySelector(".k-libur").value;
      if (lj) ljMap[per] = lj; else delete ljMap[per];
      data.liburJadi = ljMap;
      // kolom gaji tambahan: nilai tetap & nilai per periode
      const kTetap = { ...(lama.kolomTetap || {}) }, kPer = JSON.parse(JSON.stringify(lama.kolomPer || {})), kIni = { ...(kPer[per] || {}) };
      (aturan.kolomGaji || []).forEach(k => { const v = angka(el.querySelector(`[data-kg="${k.id}"]`));
        if (!k.periode){ if (v) kTetap[k.id] = v; else delete kTetap[k.id]; return; }
        // per periode: sama dengan bulan sebelumnya -> tidak disimpan (ikut bulan lalu); berubah -> disimpan (0 = berhenti)
        if (v === nilaiWarisan(lama, k, per)) delete kIni[k.id]; else kIni[k.id] = v || 0; });
      if (Object.keys(kIni).length) kPer[per] = kIni; else delete kPer[per];
      data.kolomTetap = kTetap; data.kolomPer = kPer;
      const kompMap = { ...((lama.komponen && typeof lama.komponen === "object") ? lama.komponen : {}) };
      if (aturan.tanpaKomponen){ data.komponenTetap = lama.komponenTetap || []; }   // disembunyikan: data lama tetap disimpan, tidak diubah
      else {
        data.komponenTetap = bacaKomponen(el, "kp-tetap");
        const kp = bacaKomponen(el, "kp-periode"); if (kp.length) kompMap[per] = kp; else delete kompMap[per];
      }
      data.komponen = kompMap;
      // pertahankan data lain yang tidak ada di kartu (rekening, dll.)
      for (const k of ["bank", "noRek", "atasNama", "hariUM"]) if (lama[k] != null) data[k] = lama[k];
      const baru = { ...server, ...data, appVer: VERSI_APP };
      gajiMap[el.dataset.uid] = baru; gAwal[el.dataset.uid] = JSON.parse(JSON.stringify(baru));
      const bt = writeBatch(db); if (await cekRiwayat(el.dataset.uid)) salinRiwayat(bt, el.dataset.uid, server, "Simpan gaji (Gaji › Karyawan)");
      bt.set(D("payroll", el.dataset.uid), baru);
      try{ await bt.commit(); }
      catch(err){ if (err.code !== "permission-denied") throw err; await setDoc(D("payroll", el.dataset.uid), baru); }   // aturan riwayat belum di-deploy: tetap simpan
      if ((el._v || 0) === vMulai) delete el.dataset.ubah;     // diketik lagi saat menyimpan -> tetap ditandai, disimpan berikutnya
      diubahNama.push(karyawan.find(u => u.uid === el.dataset.uid)?.nama || el.dataset.uid);
    }));
    catatLog(CID, me.uid, profile, "gaji", (otomatis ? "Simpan otomatis" : "Simpan") + " data gaji " + diubahNama.length + " karyawan (" + ymLabel(per) + "): " + diubahNama.slice(0, 15).join(", ") + (diubahNama.length > 15 ? ", …" : ""));
    // bayar pinjaman yang diketik
    const lebih = [], tulis = [];
    document.querySelectorAll("#g-users [data-pj]").forEach(i => {
      const pj = pinjamanData.find(x => x.id === i.dataset.pj); if (!pj) return;
      const v = angka(i), bayar = { ...(pj.bayar || {}) };
      if (v > 0) bayar[per] = v; else delete bayar[per];
      if (v > +i.dataset.sisa) lebih.push(pj.nama + " (" + rp(v) + " > sisa " + rp(+i.dataset.sisa) + ")");
      if (JSON.stringify(bayar) !== JSON.stringify(pj.bayar || {})) tulis.push(updateDoc(D("pinjaman", pj.id), { bayar }).then(() => { pj.bayar = bayar; }));
    });
    await Promise.all(tulis);
    const jam = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
    if (!(otomatis && jadiNol.length)) msg(m, (otomatis ? "✓ Tersimpan otomatis " : "✓ Tersimpan ") + jam + " · " + diubahNama.slice(0, 3).join(", ") + (diubahNama.length > 3 ? " +" + (diubahNama.length - 3) : "") + (tulis.length ? " · bayar pinjaman dicatat" : ""), "ok");
    gUsersDirty = !!document.querySelector('#g-users .emp-card[data-ubah="1"]');
    if (lebih.length) toast("⚠ Bayar melebihi sisa pinjaman: " + lebih.join(", "));
  }catch(e){ msg(m, "⚠ Gagal menyimpan" + (otomatis ? " otomatis" : "") + ": " + (e.code || e.message) + ". Periksa internet, lalu klik Simpan gaji.", "bad"); }
}

/* ---------- shift kerja ---------- */
let shiftEdit = [];
function renderShift(){
  const box = $("#shift-list");
  if (!shiftEdit.length){ box.innerHTML = '<p class="meta" style="margin:0 0 6px">Belum ada shift tambahan.</p>'; return; }
  box.innerHTML = shiftEdit.map((sh, i) => `<div class="shift-row" data-i="${i}">
    <input class="sh-nama" placeholder="Nama shift" value="${esc(sh.nama || "")}" aria-label="Nama shift">
    <input class="sh-masuk jam24" type="text" inputmode="numeric" maxlength="5" placeholder="07:00" value="${esc(sh.masuk || "")}" aria-label="Jam masuk">
    <input class="sh-pulang jam24" type="text" inputmode="numeric" maxlength="5" placeholder="16:00" value="${esc(sh.pulang || "")}" aria-label="Jam pulang">
    <button type="button" class="small alt sh-hapus" aria-label="Hapus shift">✕</button></div>`).join("");
  box.querySelectorAll(".sh-hapus").forEach(b => b.onclick = () => { bacaShift(); shiftEdit.splice(+b.parentElement.dataset.i, 1); renderShift(); });
}
function bacaShift(){
  document.querySelectorAll("#shift-list .shift-row").forEach(r => {
    const sh = shiftEdit[+r.dataset.i];
    sh.nama = r.querySelector(".sh-nama").value.trim(); sh.masuk = r.querySelector(".sh-masuk").value; sh.pulang = r.querySelector(".sh-pulang").value;
  });
  return shiftEdit;
}
$("#shift-tambah").onclick = () => { bacaShift(); shiftEdit.push({ id: Math.random().toString(36).slice(2, 8), nama: "", masuk: "", pulang: "" }); renderShift();
  [...document.querySelectorAll("#shift-list .sh-nama")].pop().focus(); };

function renderAturan(){
  shiftEdit = (aturan.shifts || []).map(x => ({ ...x })); renderShift();
  $("#a-jamMasuk").value = aturan.jamMasuk; $("#a-jamPulang").value = aturan.jamPulang;
  $("#a-hariKerja").value = aturan.hariKerja.length >= 6 ? "6" : "5";
  $("#a-libur").value = (aturan.libur || []).map(d => d.slice(8) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4) + ((aturan.liburKet || {})[d] ? " " + aturan.liburKet[d] : "")).join("\n");
  $("#a-lemburMode").value = aturan.lemburMode;
  lembaranMulaiInfo(); $("#a-lebihHKMode").value = aturan.lebihHKMode || ""; $("#a-liburLembur").value = aturan.liburLembur || ""; lebihHKUI();
  NUM.forEach(k => $("#a-" + k).value = fmtNum(aturan[k]));
  $("#a-telatPerMenit").value = "0";      // denda telat hanya per hari (jumlah hari telat × denda per hari)
  CHK.forEach(k => $("#a-" + k).checked = !!aturan[k]);
  isiAlphaCV();
  PCT.forEach(k => $("#a-" + k).value = fmtNum(aturan[k], 2));
  $("#a-modeGaji").value = aturan.modeGaji || "bulanan";
  $("#a-awalPeriode").value = String(aturan.awalPeriode || 1); infoPeriode();
  $("#a-dasarPph").value = aturan.dasarPph || "bruto";
  $("#a-pphMetode").value = aturan.pphMetode === "ter" ? "ter" : "tarif"; pphUI();
  $("#a-pembagi").value = String(aturan.pembagi || 0);
  kolomEdit = (aturan.kolomGaji || []).map(x => ({ ...x })); renderKolom();
  modeUI(); pajakUI();
}
// PPh 21: tarif rata hanya tampil kalau dipilih
function pphUI(){ const ter = $("#a-pphMetode").value === "ter"; $("#tarif-rata").hidden = ter; $("#ter-info").hidden = !ter; }
$("#a-pphMetode").addEventListener("change", pphUI);
// BPJS & PPh manual: sembunyikan pengaturan otomatis
function pajakUI(){ $("#otomatis-pajak").hidden = $("#a-potonganManual").checked; }
$("#a-potonganManual").addEventListener("change", pajakUI);
/* ---------- kolom gaji tambahan (per perusahaan) ---------- */
let kolomEdit = [];
const kolomId = () => "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
function renderKolom(){
  const box = $("#kolom-list");
  if (!kolomEdit.length){ box.innerHTML = '<p class="meta" style="margin:0 0 6px">Belum ada kolom tambahan.</p>'; return; }
  box.innerHTML = kolomEdit.map((k, i) => `<div class="kolom-row" data-i="${i}">
    <input class="kl-nama" placeholder="Nama kolom, mis. BPJS" maxlength="30" value="${esc(k.nama || "")}" aria-label="Nama kolom">
    <select class="kl-jenis" aria-label="Jenis"><option value="potong" ${k.jenis !== "tambah" ? "selected" : ""}>Potongan</option><option value="tambah" ${k.jenis === "tambah" ? "selected" : ""}>Tambahan</option></select>
    <select class="kl-periode" aria-label="Nilai"><option value="0" ${!k.periode ? "selected" : ""}>Tetap tiap bulan</option><option value="1" ${k.periode ? "selected" : ""}>Diisi tiap periode</option></select>
    <button type="button" class="small alt kl-hapus" aria-label="Hapus kolom">✕</button></div>`).join("");
  box.querySelectorAll(".kl-hapus").forEach(b => b.onclick = async () => {
    bacaKolom(); const k = kolomEdit[+b.parentElement.dataset.i];
    if (k.nama && !await tanya("Hapus kolom " + k.nama + "? Berlaku setelah Simpan aturan. Nilai yang sudah diisi tidak dipakai lagi.", { ya: "Hapus" })) return;
    kolomEdit.splice(+b.parentElement.dataset.i, 1); renderKolom();
  });
}
function bacaKolom(){
  document.querySelectorAll("#kolom-list .kolom-row").forEach(r => {
    const k = kolomEdit[+r.dataset.i];
    k.nama = r.querySelector(".kl-nama").value.trim(); k.jenis = r.querySelector(".kl-jenis").value; k.periode = r.querySelector(".kl-periode").value === "1";
  });
  return kolomEdit;
}
$("#kolom-tambah").onclick = () => { bacaKolom(); kolomEdit.push({ id: kolomId(), nama: "", jenis: "potong", periode: true }); renderKolom(); $("#kolom-list .kolom-row:last-child .kl-nama")?.focus(); };
// Group CV tanpa denda tidak hadir (default: PT Cipta Samudra Mandiri bila belum pernah diatur)
function isiAlphaCV(){
  const el = $("#alphaCV-list"); if (!el) return;
  const pilih = Array.isArray(aturan.tanpaDendaAlphaCV) ? aturan.tanpaDendaAlphaCV : daftarCV.filter(c => /cipta\s*samudra/i.test(c.nama || "")).map(c => c.id);
  el.innerHTML = [...daftarCV.map(c => [c.id, c.nama]), ["-", "Tanpa CV"]].map(([id, n]) =>
    `<label class="check-inline"><input type="checkbox" value="${esc(id)}" ${pilih.includes(id) ? "checked" : ""}> ${esc(n)}</label>`).join("");
  // Upah harian tetap dipotong saat tidak hadir (default: CV Jasa Karya Pratama bila belum pernah diatur)
  const el3 = $("#hrCV-list"); if (el3){
    const pilih3 = Array.isArray(aturan.harianPotongCV) ? aturan.harianPotongCV : daftarCV.filter(c => /jasa\s*karya/i.test(c.nama || "")).map(c => c.id);
    el3.innerHTML = [...daftarCV.map(c => [c.id, c.nama]), ["-", "Tanpa CV"]].map(([id, n]) =>
      `<label class="check-inline"><input type="checkbox" value="${esc(id)}" ${pilih3.includes(id) ? "checked" : ""}> ${esc(n)}</label>`).join(""); }
  // HK tampil sesuai absen (default: CV Jasa Karya Pratama bila belum pernah diatur)
  const el2 = $("#hkCV-list"); if (!el2) return;
  const pilih2 = Array.isArray(aturan.hkAbsenCV) ? aturan.hkAbsenCV : daftarCV.filter(c => /jasa\s*karya/i.test(c.nama || "")).map(c => c.id);
  el2.innerHTML = [...daftarCV.map(c => [c.id, c.nama]), ["-", "Tanpa CV"]].map(([id, n]) =>
    `<label class="check-inline"><input type="checkbox" value="${esc(id)}" ${pilih2.includes(id) ? "checked" : ""}> ${esc(n)}</label>`).join("");
}
// Tampilkan pilihan yang relevan untuk tiap cara hitung
function modeUI(){
  const m = $("#a-modeGaji").value;
  $("#pembagi-wrap").hidden = PER_HARI(m);
  $("#potongAlpha-wrap").hidden = m !== "bulanan";
  $("#alphaCV-wrap").hidden = $("#hkCV-wrap").hidden = $("#hrCV-wrap").hidden = m === "operator";
  $("#izin-label").textContent = m === "bulanan" ? "Potong gaji pokok per hari izin (sakit tidak dipotong)" : "Izin tidak dibayar (sakit tetap dibayar)";
  $("#mode-info").textContent = {
    prorata: "Gaji pokok ÷ hari kerja × hari masuk. Hari masuk = hadir di hari kerja + sakit + izin (kecuali izin tidak dibayar). Contoh: gaji pokok Rp 5.000.000, 22 hari kerja, masuk 20 hari → Rp 4.545.455. Tunjangan tetap dibayar penuh.",
    harian:  "Upah per hari × hari masuk. Isi upah per hari di sub-tab Karyawan. Hari masuk = hadir di hari kerja + sakit + izin (kecuali izin tidak dibayar). Tunjangan tetap dibayar penuh.",
    operator: "Gaji = Hari kerja × Upah per hari + Jam siang × U Siang + Lembur (jam) × U Lembur + Uang Ker − Pinjaman − Pinjaman SIO. Upah per hari, U Siang & U Lembur diisi per karyawan di sub-tab Karyawan; hari kerja, J Siang, Lembur, Uang Ker, Pinjaman & Pinjaman SIO dari upload Excel (Hitung > Kehadiran manual). Uang makan & transport perusahaan tidak dipakai.",
    bulanan: "Gaji pokok dibayar penuh, lalu dipotong gaji pokok ÷ pembagi untuk setiap hari tidak hadir."
  }[m];
}
$("#a-modeGaji").onchange = modeUI;
// Lebih HK: tampilkan tarif & penjelasan sesuai pilihan
function lebihHKUI(){
  const m = $("#a-lebihHKMode").value;
  $("#lebihHK-tarif-wrap").hidden = !m;
  $("#lebihHK-tarif-label").textContent = m === "jam" ? "Tarif per jam (Rp)" : "Tarif per hari (Rp)";
  $("#lebihHK-info").textContent = !m
    ? "Hari masuk di tanggal merah / hari libur hanya dicatat di kolom Lebih HK, tidak menambah gaji (kecuali karyawan yang diatur lain di Gaji > Karyawan). Operator & supir tidak dihitung."
    : (m === "jam" ? "Uang = jam kerja di hari libur (absen masuk sampai pulang, dibulatkan ke bawah) × tarif. Kosongkan tarif = otomatis upah sejam (gaji ÷ 173)."
                   : "Uang = jumlah hari masuk di hari libur × tarif. Kosongkan tarif = otomatis upah sehari (upah harian, atau gaji pokok + tunjangan tetap ÷ hari kerja).")
      + " Cara bayar & tarif bisa dibedakan per karyawan di Gaji > Karyawan (pilihan Lebih HK & kolom U Lebih HK). Operator & supir tidak dihitung.";
  $("#lebihHK-info").textContent += " Di hari libur jam kerja bebas (tanpa telat & tanpa pengingat pulang); yang dihitung lama kerjanya, sebagai Lebih HK ATAU lembur (tidak dicampur)."
    + " Pilihan ini bawaan; per karyawan per bulan bisa diganti di Gaji > Karyawan (kolom Hari libur)." + (!$("#a-lemburAktif")?.checked ? " ⚠ Lembur belum diaktifkan, jadi pilihan Lembur tidak menghasilkan apa-apa." : "");
}
$("#a-lebihHKMode").onchange = lebihHKUI; $("#a-liburLembur").onchange = lebihHKUI;
// Contoh periode sesuai tanggal mulai yang dipilih
function infoPeriode(){
  const a = parseInt($("#a-awalPeriode").value, 10) || 1, n = new Date();
  const P = rentangPeriode(n.getFullYear(), n.getMonth(), a);
  $("#periode-info").textContent = a === 1
    ? "Periode = 1 sampai akhir bulan. Contoh bulan ini: " + P.label + "."
    : "Periode bulan ini: " + P.label + " (dihitung sebagai gaji " + namaBulan(n.getFullYear(), n.getMonth()) + "). Berlaku untuk gaji, slip, dan rekap absensi.";
}
$("#a-awalPeriode").onchange = infoPeriode;
$("#g-aturan-save").onclick = async () => {
  const shBuruk = bacaShift().find(x => !x.nama || !x.masuk || !x.pulang);
  if (shBuruk){ msg($("#msg3"), "Lengkapi nama, jam masuk, dan jam pulang untuk setiap shift.", "bad"); return; }
  const jamSalah = [$("#a-jamMasuk").value, $("#a-jamPulang").value, ...shiftEdit.flatMap(x => [x.masuk, x.pulang])].find(v => !jamValid(v));
  if (jamSalah !== undefined){ msg($("#msg3"), "Format jam harus 24 jam, misalnya 07:00 atau 16:00 (salah: " + (jamSalah || "kosong") + ").", "bad"); return; }
  const m = $("#msg3");
  // satu baris = tanggal (YYYY-MM-DD) + keterangan opsional
  // satu baris = tanggal dd/mm/yy (format lama 2026-10-20 juga diterima) + keterangan
  const barisLibur = $("#a-libur").value.split("\n").map(s => s.trim()).filter(Boolean).map(b => {
    const [tg, ...ket] = b.split(/\s+/), iso = /^\d{4}-\d{2}-\d{2}$/.test(tg) ? tg : dmyKeIso(tg);
    return { iso, ket: ket.join(" ") };
  });
  if (barisLibur.some(b => !b.iso)){ msg(m, "Setiap baris libur diawali tanggal dd/mm/yy, misalnya 20/10/26 Ulang tahun perusahaan.", "bad"); return; }
  const libur = [...new Set(barisLibur.map(b => b.iso))].sort();
  const liburKet = Object.fromEntries(barisLibur.filter(b => b.ket).map(b => [b.iso, b.ket]));
  const a = {
    jamMasuk: $("#a-jamMasuk").value || "08:00", jamPulang: $("#a-jamPulang").value || "17:00",
    hariKerja: $("#a-hariKerja").value === "6" ? [1,2,3,4,5,6] : [1,2,3,4,5],
    libur, liburKet, lemburMode: $("#a-lemburMode").value, lebihHKMode: $("#a-lebihHKMode").value, liburLembur: $("#a-liburLembur").value,
    modeGaji: $("#a-modeGaji").value, pembagi: parseInt($("#a-pembagi").value, 10) || 0,
    awalPeriode: parseInt($("#a-awalPeriode").value, 10) || 1,
    shifts: bacaShift().map(x => ({ id: x.id, nama: x.nama, masuk: x.masuk, pulang: x.pulang })),
    dasarPph: $("#a-dasarPph").value,
    pphMetode: $("#a-pphMetode").value,
    liburEdit: aturan.liburEdit || {},            // daftar libur yang diubah admin (disimpan terpisah di Kelola daftar libur)
    kolomGaji: bacaKolom().map(k => ({ id: k.id, nama: k.nama, jenis: k.jenis === "tambah" ? "tambah" : "potong", periode: !!k.periode }))
  };
  if (a.kolomGaji.some(k => !k.nama)){ msg($("#msg3"), "Isi nama setiap kolom gaji tambahan (atau hapus yang kosong).", "bad"); return; }
  if (new Set(a.kolomGaji.map(k => k.nama.toLowerCase())).size !== a.kolomGaji.length){ msg($("#msg3"), "Nama kolom gaji tambahan tidak boleh sama.", "bad"); return; }
  NUM.forEach(k => a[k] = angka($("#a-" + k)));
  CHK.forEach(k => a[k] = $("#a-" + k).checked);
  a.tanpaDendaAlphaCV = [...document.querySelectorAll("#alphaCV-list input:checked")].map(c => c.value);
  a.hkAbsenCV = [...document.querySelectorAll("#hkCV-list input:checked")].map(c => c.value);
  a.harianPotongCV = [...document.querySelectorAll("#hrCV-list input:checked")].map(c => c.value);
  for (const k of PCT){
    const v = persen($("#a-" + k));
    if (!isFinite(v) || v < 0 || v > 100){ msg(m, "Persentase BPJS harus angka 0 sampai 100.", "bad"); return; }
    a[k] = v;
  }
  const lama = aturan;
  try{ await setDoc(D("settings", "payroll"), { ...a, appVer: VERSI_APP }); aturan = { ...ATURAN_DEFAULT, ...a }; renderUsers(); msg(m, "Aturan gaji tersimpan.", "ok"); }
  catch(e){ msg(m, "Gagal menyimpan: " + e.code, "bad"); return; }
  // aturan hitung lembur berubah -> tawarkan hitung ulang semua Cek lembur yang sudah disetujui
  const ubahLembur = ["lemburMulaiMenit", "lemburMinMenit", "jamPulang"].some(k => String(+lama[k] || lama[k] || 0) !== String(+aturan[k] || aturan[k] || 0))
    || JSON.stringify((lama.shifts || []).map(x => x.pulang)) !== JSON.stringify((aturan.shifts || []).map(x => x.pulang));
  if (ubahLembur && await tanya("Aturan jam lembur berubah. Hitung ulang jam lembur di semua Cek lembur yang sudah disetujui dengan aturan baru?\n(Jam lembur yang dulu diketik manual juga ikut diganti.)", { ya: "Hitung ulang" }))
    hitungUlangCekLembur(m);
};
function lembaranMulaiInfo(){
  const v = angka($("#a-lemburMulaiMenit")) || 0, jp = $("#a-jamPulang").value || "17:00", [h, mi] = jp.split(":").map(Number);
  const t = new Date(2000, 0, 1, h, (mi || 0) + v);
  const mn = angka($("#a-lemburMinMenit")) || 0, t2 = new Date(t.getTime() + mn * 60000), j2 = String(t2.getHours()).padStart(2, "0") + "." + String(t2.getMinutes()).padStart(2, "0");
  $("#lembur-mulai-info").textContent = "Contoh: jam pulang " + jp.replace(":", ".") + (v ? " + " + fmtNum(v) + " menit" : "") + " → lembur dihitung mulai " + String(t.getHours()).padStart(2, "0") + "." + String(t.getMinutes()).padStart(2, "0")
    + ". Absen pulang sebelum " + j2 + " (+ minimal " + fmtNum(mn) + " menit) = tidak ada lembur dan tidak muncul di Cek lembur.";
}
$("#a-lemburMulaiMenit").addEventListener("input", lembaranMulaiInfo); $("#a-lemburMinMenit").addEventListener("input", lembaranMulaiInfo); $("#a-jamPulang").addEventListener("input", lembaranMulaiInfo);
// Hitung ulang jam lembur Cek lembur (status "Lembur") memakai aturan yang sekarang
async function hitungUlangCekLembur(m){
  msg(m, "Menghitung ulang Cek lembur…");
  try{
    const at = (await getDoc(D("settings", "payroll"))).data() || {}, awal = Math.min(28, Math.max(1, parseInt(at.awalPeriode, 10) || 1));
    const [kSnap, uSnap] = await Promise.all([getDocs(query(C("lembur"), where("status", "==", "lembur"))), getDocs(query(collection(db, "users"), where("cid", "==", CID)))]);
    const users = Object.fromEntries(uSnap.docs.map(x => [x.id, { uid: x.id, ...x.data() }]));
    const grup = {};
    for (const k of kSnap.docs){ const x = k.data(); if (!x.tanggal) continue;
      let [y, mo, d] = x.tanggal.split("-").map(Number); mo -= 1;
      if (awal > 1 && d >= awal){ mo += 1; if (mo > 11){ mo = 0; y++; } }
      (grup[y + "-" + mo] ||= []).push({ ref: D("lembur", k.id), x }); }
    let ubah = 0, total = 0;
    for (const [kunci, list] of Object.entries(grup)){
      const [y, mo] = kunci.split("-").map(Number), d = await dataBulan(y, mo, awal);
      for (const { ref, x } of list){
        total++;
        const u = users[x.uid] || { uid: x.uid };
        const r = hitungGaji(d.absen[x.uid] || [], at, { shift: u.shift || "", grupCV: u.grupCV || "-", tanpaLebihHK: tanpaLebihHK(u), liburJadi: (d.gaji || {})[x.uid]?.liburJadi, polaKerja: (d.gaji || {})[x.uid]?.polaKerja }, y, mo, new Date(), d.cuti[x.uid] || [], {});
        const row = r.rows.find(z => z.tanggal === x.tanggal); if (!row || !row.pulang) continue;
        const baru = row.lemburTercatat || 0;
        if (x.superadmin) continue;                                      // ditetapkan superadmin: tidak diubah
        if (!baru){ if (x.lhkJam != null) await setDoc(ref, { uid: x.uid, nama: x.nama || "", tanggal: x.tanggal, status: "koreksi", lhkJam: x.lhkJam }); else await deleteDoc(ref); ubah++; continue; }   // tidak lagi lembur -> hapus dari Cek lembur (koreksi Lebih HK tetap disimpan)
        if (baru !== +x.jam){ await setDoc(ref, { jam: baru, jamSebelum: x.jam ?? null, dihitungUlang: serverTimestamp(), dihitungUlangOleh: profile.nama }, { merge: true }); ubah++; }
      }
    }
    catatLog(CID, me.uid, profile, "ubah", "Menghitung ulang Cek lembur dengan aturan baru: " + ubah + " dari " + total + " diubah");
    msg(m, "Cek lembur dihitung ulang: " + fmtNum(ubah) + " dari " + fmtNum(total) + " yang disetujui berubah (yang tidak lagi lembur dihapus dari Cek lembur).", "ok");
    if (!$("#sub-lembur")?.hidden) muatLembur();
  }catch(e){ msg(m, "Gagal menghitung ulang Cek lembur: " + (e.code || e.message), "bad"); }
}

$("#g-hitung").onclick = async () => {
  const [y, mo] = $("#g-bulan").value.split("-").map(Number);
  if (!y){ msg($("#msg3"), "Pilih periode dulu.", "bad"); return; }
  const m = mo - 1; periode = rentangPeriode(y, m, aturan.awalPeriode).label;
  $("#g-hitung").disabled = true; $("#g-info").textContent = "Menghitung…";
  try{
    const ym = $("#g-bulan").value;
    const [{ absen: per, cuti, kep }, , manual] = await Promise.all([dataBulan(y, m, aturan.awalPeriode), muatPinjaman(true), muatManual(ym)]);
    // PPh 21 TER: Desember atau bulan terakhir karyawan berhenti -> hitung setahun dari slip tersimpan Januari s/d bulan lalu
    const P = rentangPeriode(y, m, aturan.awalPeriode);
    const masaAkhir = u => m === 11 || (u.berhenti?.tanggal && u.berhenti.tanggal >= P.awalKey && u.berhenti.tanggal <= P.akhirKey);
    const setahun = {};
    if (aturan.pphAktif && aturan.pphMetode === "ter" && karyawan.some(masaAkhir)){
      const sSnap = await getDocs(query(C("slips"), where("periode", ">=", y + "-01"), where("periode", "<", ym)));
      sSnap.docs.forEach(d => { const x = d.data(), h = x.hasil || {}, t = (setahun[x.uid] ||= { bulan: 0, bruto: 0, pph: 0, iuran: 0 });
        t.bulan++; t.bruto += +(h.brutoPajak ?? h.bruto) || 0; t.pph += +h.pph || 0; t.iuran += +(h.iuranPensiunKaryawan ?? ((+h.bpjsJht || 0) + (+h.bpjsJp || 0))) || 0; });
    }
    const pjUid = {};
    pinjamanData.forEach(p => (pjUid[p.uid] ||= []).push(p));
    // karyawan yang punya absen aplikasi di periode ini -> patokan = Laporan › Rincian absen (lembur & Lebih HK yang bisa diubah admin);
    // data Kehadiran manual hanya dipakai untuk yang tidak absen di aplikasi (operator, supir)
    const adaAbsen = uid => (per[uid] || []).length > 0;
    const diabaikan = karyawan.filter(u => manual[u.uid] && adaAbsen(u.uid));
    hasil = karyawan
      .filter(u => u.kehadiran !== "tidak" && (gajiMap[u.uid]?.gajiPokok || per[u.uid] || manual[u.uid] || u.kehadiran === "manual"))
      .map(u => ({ u, r: hitungGaji(per[u.uid] || [], aturan, { ...(gajiPeriode(gajiMap[u.uid], ym, aturan.kolomGaji, aturan.tanpaKomponen) || {}), shift: u.shift || "", grupCV: u.grupCV || "-", tanpaLebihHK: tanpaLebihHK(u),
        pinjamanList: angsuranPeriode(pjUid[u.uid], ym),
        ...(masaAkhir(u) && aturan.pphMetode === "ter" ? { pphSetahun: setahun[u.uid] || { bulan: 0, bruto: 0, pph: 0, iuran: 0 } } : {}),
        // karyawan bertanda "Kehadiran manual" selalu memakai data Excel; belum di-upload = 0 hari (dengan peringatan)
        manual: adaAbsen(u.uid) ? null : manual[u.uid] || (u.kehadiran === "manual" ? { hari: 0, lembur: 0, kosong: true } : null) }, y, m, new Date(), cuti[u.uid] || [], kep[u.uid] || {}) }));
    if (aturan.pphAktif && aturan.pphMetode === "ter"){
      const kurang = hasil.filter(x => x.r.pphTahunan && x.r.pphTahunan.bulan < m + 1).length;
      if (kurang) toast("ℹ PPh 21 setahun: " + kurang + " karyawan slipnya belum lengkap Januari s/d bulan lalu. Dihitung dari slip yang tersimpan saja.");
    }
    if (diabaikan.length) toast("ℹ " + diabaikan.length + " karyawan punya absen aplikasi (" + diabaikan.slice(0, 4).map(u => u.nama).join(", ") + (diabaikan.length > 4 ? ", …" : "") + "): dihitung dari Rincian absen, data kehadiran manual mereka diabaikan.");
    const belum = hasil.filter(x => x.u.kehadiran === "manual" && !manual[x.u.uid] && !adaAbsen(x.u.uid) && !gajiMap[x.u.uid]?.gajiTetap).length;
    if (belum) toast("⚠ " + belum + " karyawan berstatus kehadiran manual belum ada data Excel periode ini (dihitung 0 hari).");
    curYM = $("#g-bulan").value;
    const sv = await getDocs(query(C("slips"), where("periode", "==", curYM)));
    tersimpan = new Set(sv.docs.map(d => d.data().uid));
    renderHasil();
  }catch(e){ msg($("#msg3"), "Gagal menghitung: " + e.code, "bad"); $("#g-info").textContent = ""; }
  $("#g-hitung").disabled = false;
};

// filter peran di Gaji > Hitung (Karyawan / Operator / Supir / …): berlaku untuk daftar, total, tabel, cetak, simpan & ekspor
const hasilT = () => { const v = $("#g-peran-f")?.value || "", c = $("#g-cv-f")?.value || "";
  return v || c ? hasil.filter(x => (!v || cocokPeran(x.u, v)) && (!c || (c === "-" ? !namaCV(x.u.grupCV) : x.u.grupCV === c))) : hasil; };
function renderHasil(){
  { const sel = $("#g-peran-f"); if (sel){ isiFilterPeran(sel); sel.parentElement.hidden = !hasil.length; } }
  { const sc = $("#g-cv-f"); if (sc){ const v = sc.value;
    sc.innerHTML = '<option value="">Semua Group CV</option>' + [...daftarCV.map(c => [c.id, c.nama]), ["-", "Tanpa Group CV"]].filter(([id]) => cvBoleh({ grupCV: id === "-" ? "" : id }))
      .map(([id, nm]) => `<option value="${esc(id)}">${esc(nm)}</option>`).join("");
    sc.value = [...sc.options].some(o => o.value === v) ? v : ""; sc.parentElement.hidden = !hasil.length || !daftarCV.length; } }
  const tot = hasilT().reduce((s, x) => s + x.r.bersih, 0);
  const pending = hasilT().reduce((s, x) => s + x.r.menunggu, 0);
  const tanpaGaji = hasilT().filter(x => !x.r.gaji.gajiPokok).length;
  $("#g-info").textContent = fmtNum(hasilT().length) + " karyawan · " + periode + ([$("#g-peran-f")?.value && "peran " + $("#g-peran-f").selectedOptions[0].textContent, $("#g-cv-f")?.value && $("#g-cv-f").selectedOptions[0].textContent].filter(Boolean).map(t => " · " + t).join("") + (hasilT().length !== hasil.length ? " (dari " + fmtNum(hasil.length) + ")" : ""));
  $("#g-total").hidden = $("#g-bulk").hidden = $("#g-csv").hidden = $("#g-pajak").hidden = !hasilT().length;
  $("#g-total").innerHTML = `<div class="meta">Total gaji bersih</div><div class="big">${rp(tot)}</div>
    <div class="meta">${fmtNum(hasilT().filter(x => tersimpan.has(x.u.uid)).length)} dari ${fmtNum(hasilT().length)} slip sudah disimpan ke karyawan</div>` +
    (pending ? `<p class="meta" style="color:var(--warn)">${fmtNum(pending)} absen masih menunggu persetujuan dan belum dihitung.</p>` : "") +
    (tanpaGaji ? `<p class="meta" style="color:var(--bad)">${fmtNum(tanpaGaji)} karyawan belum diisi ${aturan.modeGaji === "harian" ? "upah hariannya" : "gaji pokoknya"}.</p>` : "");
  $("#g-tabel-btn").textContent = "📊 " + (tabelRinciBuka ? "Sembunyikan" : "Tampilkan") + " tabel rincian";
  $("#g-tabel-btn").onclick = () => { tabelRinciBuka = !tabelRinciBuka; renderHasil(); };
  $("#g-xlsx-btn").onclick = eksporRinciXlsx;
  renderTabelRinci();
  $("#g-list").replaceChildren(...hasilT().map(({ u, r }) => {
    const c = document.createElement("div"); c.className = "card hg-kartu";
    const ada = tersimpan.has(u.uid);
    const ringkas = r.manual?.kosong ? "⚠ Kehadiran manual: data Excel periode ini belum di-upload (0 hari)" : r.manual ? `📄 Input manual: ${fmtNum(r.hadirKerja, 1)} hari kerja${r.manual.jSiang ? " · J Siang " + fmtNum(r.manual.jSiang, 1) + " jam" : ""}${r.manual.trip ? " · Trip " + fmtNum(r.manual.trip, 1) + "x" : ""} · Lembur ${fmtNum(r.jamLembur, 1)} jam${r.manual.ket ? " · " + r.manual.ket : ""}` : `Hadir ${fmtNum(r.hadirKerja)}/${fmtNum(r.hariKerja)} · Telat ${fmtNum(r.kaliTelat)}x · Sakit ${fmtNum(r.sakit)} · Izin ${fmtNum(r.izin)} · Cuti ${fmtNum(r.cuti || 0)} · Tidak hadir ${fmtNum(r.alpha)}${r.lebihHK ? " · Lebih HK " + fmtNum(r.lebihHK) : ""} · Lembur ${fmtNum(r.jamLembur)} jam${r.tanpaPulang ? " · " + fmtNum(r.tanpaPulang) + "x tidak absen pulang" : ""}`;
    c.innerHTML = `<div class="hg-kepala">
        <b title="${esc(u.nama)}">${esc(u.nama)}</b><span class="big">${rp(r.bersih)}</span></div>
      <div class="meta hg-ringkas" title="${esc(ringkas)}">${esc(ringkas)}</div>
      <div class="meta hg-status" style="color:${ada ? "var(--ok)" : "var(--muted)"}">${ada ? "✓ Tersimpan di akun karyawan" : "Belum disimpan ke karyawan"}</div>
      <div class="rinci" hidden>${rincianHTML(r, false)}</div>
      <div class="btns3 hg-aksi"><button class="small alt b-rinci">Rincian</button><button class="small alt b-slip">Cetak</button>
        <button class="small b-save">${ada ? "Simpan ulang" : "Simpan"}</button></div>`;
    c.querySelector(".b-rinci").onclick = e => {
      const el = c.querySelector(".rinci"); el.hidden = false; popup(el, "Rincian gaji · " + u.nama, e.currentTarget);
    };
    c.querySelector(".b-slip").onclick = () => { if (!cetakSlip(r, u.nama, periode, kopCV(perusahaan, daftarCV, u.grupCV))) toast("Izinkan pop-up untuk mencetak slip."); };
    c.querySelector(".b-save").onclick = async e => {
      if (ada && !await tanya("Slip " + u.nama + " " + periode + " sudah tersimpan. Ganti dengan hitungan terbaru?")) return;
      e.target.disabled = true;
      try{
        const bt = writeBatch(db); bt.set(D("slips", u.uid + "_" + curYM), slipDoc(u, r)); await bt.commit();
        tersimpan.add(u.uid); toast("Slip " + u.nama + " tersimpan."); renderHasil();
      }catch(err){ toast("Gagal menyimpan: " + err.code); e.target.disabled = false; }
    };
    return c;
  }));
}
/* Tabel rincian gaji semua karyawan (seperti kertas kerja Excel): komponen per kolom, kolom kosong disembunyikan */
let tabelRinciBuka = false;
const namaKomp = n => String(n || "").replace(/\s*\(.*$/, "").trim() || "Lainnya";
function dataTabelRinci(){
  const kTambah = [], kPotong = [];
  hasilT().forEach(({ r }) => (r.komponen || []).forEach(k => { const n = namaKomp(k.nama), L = k.jenis === "potong" ? kPotong : kTambah; if (!L.includes(n)) L.push(n); }));
  const sumK = (r, n, j) => (r.komponen || []).filter(k => k.jenis === j && namaKomp(k.nama) === n).reduce((a, k) => a + k.jumlah, 0);
  const kol = [
    ["HK", r => r.hadirKerja, "hari"], ["LHK", r => r.lebihHK || 0, "jam"],
    ["JS (jam)", r => r.manual?.jSiang || 0, "jam"], ["Trip (kali)", r => r.manual?.trip || 0, "jam"], ["Lbr (jam)", r => r.jamLembur || 0, "jam"],
    ["Gaji pokok", r => r.gajiPokok], ["Tunjangan", r => r.tjJabatan + r.tjTransport + r.tunjangan], ["Uang makan", r => r.uangMakan], ["Transport", r => r.transport],
    ["Uang lembur", r => r.lembur], ["Lebih HK", r => r.uangLebihHK], ["Bonus", r => r.bonus],
    ...kTambah.map(n => [({ "lembur bulanan": "Lbr Blnan" })[n.toLowerCase()] || n, r => sumK(r, n, "tambah")]),
    ["Bruto", r => r.bruto, "tebal"],
    ["Pot. telat/absen", r => r.potTelat + r.potAlpha + r.potIzin, "pot"], ["BPJS (otomatis)", r => r.bpjsKes + r.bpjsJht + r.bpjsJp, "pot"],
    ...kPotong.map(n => [n, r => sumK(r, n, "potong"), "pot"]),
    ["Pinjaman (menu)", r => r.potPinjaman, "pot"], ["PPh 21", r => r.pph - (r.pphLebih || 0), "pot"],
    ["Gaji bersih", r => r.bersih, "tebal"]
  ].filter(([n, f, t]) => t === "tebal" || n === "HK" || hasilT().some(({ r }) => +f(r)));
  return kol;
}
function renderTabelRinci(){
  let box = $("#g-tabel");
  if (!box){ box = document.createElement("div"); box.id = "g-tabel"; box.className = "card"; $("#g-list").before(box); }
  box.hidden = !tabelRinciBuka || !hasilT().length; if (box.hidden) return;
  const kol = dataTabelRinci(), tot = kol.map(([, f]) => hasilT().reduce((a, { r }) => a + (+f(r) || 0), 0));
  const sel = (v, t) => t === "hari" || t === "jam" ? (v ? fmtNum(v, 1) : "-") : v ? (t === "pot" ? "−" : "") + fmtNum(v) : "-";
  box.innerHTML = `<div class="g-tabel-kepala"><b>Rincian gaji · ${esc(periode)}</b>
      <button type="button" class="small alt" id="g-tabel-xlsx">📥 Excel</button></div>
    <div class="tablewrap g-tabel-wrap"><table class="g-tabel"><thead><tr><th>No</th><th>Nama</th>${kol.map(([n, , t]) => `<th class="num${t === "pot" ? " pot" : ""}">${esc(n)}</th>`).join("")}</tr></thead>
    <tbody>${hasilT().map(({ u, r }, i) => `<tr><td>${i + 1}</td><td>${esc(u.nama)}<small>${esc(u.jabatan || labelPeran(u) || "")}</small></td>${kol.map(([, f, t]) =>
      `<td class="num${t === "tebal" ? " tebal" : ""}${t === "pot" ? " pot" : ""}">${sel(+f(r) || 0, t)}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr><td></td><td>Total</td>${kol.map(([, , t], i) => `<td class="num tebal${t === "pot" ? " pot" : ""}">${t === "hari" ? "" : sel(tot[i], t)}</td>`).join("")}</tr></tfoot></table></div>`;
  box.querySelector("#g-tabel-xlsx").onclick = eksporRinciXlsx;
}
// Export ke Excel: semua gaji hasil hitung (sesuai filter) beserta rinciannya
function eksporRinciXlsx(){
  if (!hasilT().length){ toast("Belum ada hasil hitung. Klik Hitung dulu."); return; }
  const kol = dataTabelRinci(), tot = kol.map(([, f]) => hasilT().reduce((a, { r }) => a + (+f(r) || 0), 0));
  const namaCV = id => daftarCV.find(c => c.id === id)?.nama || "";
  const head = ["No", "Nama", "Jabatan", "Peran", "Group CV", "Cara hitung", ...kol.map(([n, , t]) => t === "pot" ? n + " (potong)" : n), "Bank", "No. rekening", "Atas nama"];
  const rows = hasilT().map(({ u, r }, i) => { const g = gajiMap[u.uid] || {};
    return [i + 1, u.nama || "", u.jabatan || "", labelPeran(u) || "", namaCV(u.grupCV), r.gajiTetap ? "Gaji tetap penuh" : (MODE_NAMA[r.mode || g.modeGaji || MODE_BAWAAN()] || ""),
      ...kol.map(([, f]) => +f(r) || 0), g.bank || "", g.noRek ? String(g.noRek) : "", g.atasNama || (g.noRek ? u.nama : "")]; });
  rows.push(["", "TOTAL", "", "", "", "", ...kol.map(([, , t], i) => t === "hari" || t === "jam" ? "" : tot[i]), "", "", ""]);
  const blob = buatXlsx([head, ...rows], "Gaji " + curYM, [5, 26, 16, 12, 22, 18, ...kol.map(() => 13), 10, 18, 22]);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gaji-" + curYM + ".xlsx"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  catatLog(CID, me.uid, profile, "ekspor", "Export Excel gaji " + periode + " (" + hasilT().length + " karyawan)");
}
const slipDoc = (u, r) => ({ uid: u.uid, nama: u.nama, periode: curYM, label: periode, bersih: r.bersih,
  hasil: bersihkan(r), oleh: profile.nama, dibuat: serverTimestamp() });

$("#g-peran-f").onchange = $("#g-cv-f").onchange = () => { renderHasil(); };
$("#g-print-all").onclick = () => {
  catatLog(CID, me.uid, profile, "ekspor", "Mencetak semua slip gaji " + periode);
  if (!cetakSlips(hasilT().map(({ u, r }) => ({ r, nama: u.nama, periode, pt: kopCV(perusahaan, daftarCV, u.grupCV) })), "Slip Gaji " + periode, perusahaan)) toast("Izinkan pop-up untuk mencetak slip.");
};
$("#g-save-all").onclick = async () => {
  const ganti = hasilT().filter(x => tersimpan.has(x.u.uid)).length;
  if (!await tanya("Simpan " + fmtNum(hasilT().length) + " slip " + periode + " ke akun masing-masing karyawan?" +
    (ganti ? "\n" + fmtNum(ganti) + " slip yang sudah ada akan diganti dengan hitungan terbaru." : ""))) return;
  $("#g-save-all").disabled = true;
  try{
    const NS = BATCH_GAJI();
    for (let i = 0; i < hasilT().length; i += NS){
      const bt = writeBatch(db);
      hasilT().slice(i, i + NS).forEach(({ u, r }) => bt.set(D("slips", u.uid + "_" + curYM), slipDoc(u, r)));
      await bt.commit();
    }
    hasilT().forEach(x => tersimpan.add(x.u.uid));
    toast(fmtNum(hasilT().length) + " slip tersimpan ke karyawan."); renderHasil();
  }catch(e){ toast("Gagal menyimpan: " + e.code); }
  $("#g-save-all").disabled = false;
};

/* ---------- riwayat slip 12 bulan ---------- */
let riwayat = [];
async function loadRiwayat(){
  const uid = $("#r-user").value; if (!uid) return;
  $("#r-list").innerHTML = '<p class="meta">Memuat…</p>';
  try{
    const snap = await getDocs(query(C("slips"), where("uid", "==", uid), where("periode", ">=", ym12()), orderBy("periode", "desc")));
    riwayat = snap.docs.map(d => d.data());
    renderSlipList(riwayat, $("#r-list"), $("#r-total"), $("#r-print-all"));
  }catch(e){ $("#r-list").innerHTML = '<p class="meta">Gagal memuat: ' + e.code + '</p>'; }
}
$("#r-user").onchange = loadRiwayat;
function renderSlipList(list, box, totalEl, printAll){
  totalEl.hidden = printAll.hidden = !list.length;
  if (!list.length){ box.innerHTML = '<p class="meta">Belum ada slip tersimpan dalam 12 bulan terakhir.</p>'; return; }
  const tot = list.reduce((s, x) => s + x.bersih, 0);
  totalEl.innerHTML = `<div class="meta">Total ${fmtNum(list.length)} bulan</div><div class="big">${rp(tot)}</div>
    <div class="meta">Rata-rata ${rp(tot / list.length)} per bulan</div>`;
  printAll.onclick = () => { if (!cetakSlips(list.map(x => ({ r: x.hasil, nama: x.nama, periode: x.label })), "Slip Gaji " + list[0].nama + " 12 bulan", kopCV(perusahaan, daftarCV, karyawan.find(k => k.uid === uid)?.grupCV))) toast("Izinkan pop-up untuk mencetak slip."); };
  box.replaceChildren(...list.map(x => {
    const c = document.createElement("div"); c.className = "card";
    c.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline">
        <b>${esc(x.label)}</b><span class="big" style="font-size:1.15rem">${rp(x.bersih)}</span></div>
      <div class="meta">Hadir ${fmtNum(x.hasil.hadirKerja)}/${fmtNum(x.hasil.hariKerja)} · Lembur ${fmtNum(x.hasil.jamLembur)} jam${x.oleh ? " · disimpan oleh " + esc(x.oleh) : ""}</div>
      <div class="rinci" hidden>${rincianHTML(x.hasil, false)}</div>
      <div class="btns" style="margin-top:10px"><button class="small alt b-rinci">Rincian</button><button class="small b-slip">Cetak</button></div>`;
    c.querySelector(".b-rinci").onclick = e => { const el = c.querySelector(".rinci"); el.hidden = !el.hidden; e.target.textContent = el.hidden ? "Rincian" : "Tutup"; };
    c.querySelector(".b-slip").onclick = () => { if (!cetakSlip(x.hasil, x.nama, x.label, kopCV(perusahaan, daftarCV, karyawan.find(k => k.uid === uid)?.grupCV))) toast("Izinkan pop-up untuk mencetak slip."); };
    return c;
  }));
}

// Rekap BPJS (karyawan & perusahaan) dan PPh 21 per karyawan, untuk lapor BPJS & e-Bupot / Coretax
$("#g-pajak").onclick = () => {
  catatLog(CID, me.uid, profile, "ekspor", "Mengunduh rekap BPJS & PPh 21 " + periode);
  const head = ["Nama", "NIK/NPWP", "Status PTKP", "Kategori TER", "Upah dasar BPJS", "BPJS Kes karyawan", "BPJS Kes perusahaan", "JHT karyawan", "JHT perusahaan",
    "JP karyawan", "JP perusahaan", "JKK perusahaan", "JKM perusahaan", "Total iuran perusahaan", "Penghasilan bruto PPh 21", "Tarif TER (%)", "PPh 21 dipotong", "Kelebihan PPh dikembalikan", "Keterangan PPh"];
  const rows = hasilT().map(({ u, r }) => { const i = r.iuranPerusahaan || {}, g = gajiMap[u.uid] || {};
    return [u.nama, g.npwp || "", r.ptkp || g.ptkp || "TK/0", r.pphTahunan || r.mode === "operator" ? "" : kategoriTER(r.ptkp || "TK/0"),
      r.upahBpjs ?? "",
      r.bpjsKes, i.kes || 0, r.bpjsJht, i.jht || 0, r.bpjsJp, i.jp || 0, i.jkk || 0, i.jkm || 0, r.totalIuranPerusahaan || 0,
      r.brutoPajak ?? r.bruto, r.terPersen ?? "", r.pph, r.pphLebih || 0,
      !aturan.pphAktif ? "PPh 21 tidak aktif" : r.mode === "operator" ? "Mode operator: tanpa PPh otomatis" : g.kenaPph === false ? "Tidak dipotong PPh"
        : r.pphTahunan ? "Hitung setahun (" + r.pphTahunan.bulan + " bulan)" : r.pphMetode === "tarif" ? "Tarif rata" : !r.pph ? "Di bawah batas TER (0%)" : ""]; });
  const T = i => rows.reduce((a, x) => a + (+x[i] || 0), 0);
  rows.push(["TOTAL", "", "", "", T(4), T(5), T(6), T(7), T(8), T(9), T(10), T(11), T(12), T(13), T(14), "", T(16), T(17), ""]);
  const blob = buatXlsx([head, ...rows], "BPJS PPh21 " + curYM, [26, 18, 11, 11, 15, 13, 14, 12, 13, 12, 13, 13, 13, 15, 17, 11, 14, 14, 26]);
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "rekap-bpjs-pph21-" + curYM + ".xlsx"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};
$("#g-csv").onclick = () => {
  catatLog(CID, me.uid, profile, "ekspor", "Mengunduh CSV gaji " + periode);
  const head = ["Nama","Group CV","Proyek","Hari kerja","Hadir","Telat (x)","Telat (menit)","Sakit","Izin","Cuti","Tidak hadir","Lebih HK","Hari dibayar","Lembur (jam)","Gaji pokok dibayar","Tunj. jabatan","Tunj. transportasi","Tunj. lainnya","Bonus",
    "Uang makan","Transport","Lembur","Uang Lebih HK","Pot. telat","Pot. tidak hadir","Pot. izin","BPJS Kes","BPJS JHT","BPJS JP","PPh 21","Komponen tambahan","Komponen potongan","Angsuran pinjaman","Gaji bersih","Bank","No. rekening","Atas nama", ...(aturan.kolomGaji || []).map(k => k.nama)];
  const rows = hasilT().map(({ u, r }) => [u.nama, namaCV(u.grupCV), namaPJ(u.proyek), r.hariKerja, r.hadirKerja, r.kaliTelat, r.menitTelat, r.sakit, r.izin, r.cuti || 0, r.alpha, r.lebihHK || 0, r.hariDibayar, r.jamLembur,
    r.gajiPokok, r.tjJabatan, r.tjTransport, r.tunjangan, r.bonus, r.uangMakan, r.transport, r.lembur, r.uangLebihHK || 0, r.potTelat, r.potAlpha, r.potIzin, r.bpjsKes, r.bpjsJht, r.bpjsJp, r.pph, r.komponenTambah || 0, r.komponenPotong || 0, r.potPinjaman || 0, r.bersih,
    (gajiMap[u.uid] || {}).bank || "", (gajiMap[u.uid] || {}).noRek ? "'" + gajiMap[u.uid].noRek : "", (gajiMap[u.uid] || {}).atasNama || "",
    ...(aturan.kolomGaji || []).map(k => nilaiKolom(gajiMap[u.uid], k, curYM))]);
  unduhCSV([head, ...rows], "gaji-" + $("#g-bulan").value + ".csv");
};


/* ================= IMPORT ABSENSI DARI EXCEL (KHUSUS SUPERADMIN) ================= */
// Format: Username | Full Name | Group CV | Join Date | Date | Check In | Check Out  (satu baris per karyawan per tanggal)
function tglExcel(v){
  if (typeof v === "number" && v > 20000){ const d = new Date(Math.round((v - 25569) * 864e5)); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  const t = String(v ?? "").trim(); if (!t) return "";
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/); if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  return "";
}
function jamExcel(v){
  if (typeof v === "number"){ const f = v % 1, menit = Math.round((f || (v < 1 ? v : 0)) * 1440); if (!menit && v >= 1) return ""; return String(Math.floor(menit / 60) % 24).padStart(2, "0") + ":" + String(menit % 60).padStart(2, "0"); }
  const m = String(v ?? "").trim().match(/(\d{1,2})[:.](\d{2})/); return m && +m[1] < 24 && +m[2] < 60 ? m[1].padStart(2, "0") + ":" + m[2] : "";
}
function bukaImportAbsen(tombol){
  if (!isSuper()) return;
  const f = $("#imp-form");
  f.innerHTML = `<p class="meta" style="margin-top:0">Data masuk ke <b>${esc(perusahaan?.nama || CID)}</b>. Format kolom: <b>Username, Full Name, Group CV, Join Date, Date, Check In, Check Out</b> (satu baris per karyawan per tanggal; urutan kolom bebas).</p>
    <button type="button" class="small imp-pilih">📤 Pilih file Excel / CSV</button><input type="file" class="imp-file" accept=".xlsx,.csv" hidden>
    <label class="check" style="margin-top:10px"><input type="checkbox" class="imp-profil" checked> <span>Perbarui <b>Group CV</b> &amp; <b>Tanggal masuk</b> karyawan dari file (Group CV baru dibuat otomatis)</span></label>
    <details class="imp-riwayat"><summary>Riwayat import &amp; batalkan import</summary><div class="imp-riw-isi"><p class="meta">Memuat…</p></div></details>
    <div class="imp-prev"></div><p class="msg imp-msg"></p>
    <div class="btns" style="margin-top:10px"><button type="button" class="small alt imp-tutup">Tutup</button></div>`;
  const m = f.querySelector(".imp-msg");
  f.querySelector(".imp-tutup").onclick = () => { f.hidden = true; };
  // Riwayat import: absen hasil import dikelompokkan per kali import (nama file + waktu); bisa dibatalkan (dihapus) sekaligus
  const muatRiwayat = async () => {
    const isi = f.querySelector(".imp-riw-isi"); isi.innerHTML = '<p class="meta">Memuat…</p>';
    try{
      const snap = await getDocs(query(C("absensi"), where("import", "==", true)));
      const grup = {};
      snap.docs.forEach(d => { const x = d.data(), t = x.decidedAt?.toDate ? x.decidedAt.toDate() : tsOf(x);
        const k = x.importId || (x.alasan || "Import") + "|" + dayKey(t);
        const g = (grup[k] ||= { k, file: String(x.alasan || "Import").replace(/^Import Excel /, ""), waktu: t, oleh: x.by || "", ids: [], orang: new Set(), min: tsOf(x), max: tsOf(x) });
        g.ids.push(d.id); g.orang.add(x.uid); if (tsOf(x) < g.min) g.min = tsOf(x); if (tsOf(x) > g.max) g.max = tsOf(x); if (t < g.waktu) g.waktu = t; });
      const list = Object.values(grup).sort((a, b) => b.waktu - a.waktu);
      if (!list.length){ isi.innerHTML = '<p class="meta">Belum ada absen hasil import.</p>'; return; }
      isi.innerHTML = `<div class="tablewrap"><table class="mf-tbl"><tr><th>File</th><th>Diimport</th><th>Tanggal absen</th><th class="num">Absen</th><th class="num">Karyawan</th><th></th></tr>
        ${list.map((g, i) => `<tr><td>${esc(g.file)}</td><td>${esc(tglJam(g.waktu))}${g.oleh ? `<small>${esc(g.oleh)}</small>` : ""}</td><td>${esc(tglMedium(g.min))} – ${esc(tglMedium(g.max))}</td>
          <td class="num">${fmtNum(g.ids.length)}</td><td class="num">${fmtNum(g.orang.size)}</td><td><button type="button" class="small alt imp-batal" data-i="${i}">Batalkan</button></td></tr>`).join("")}</table></div>
        <p class="meta">Batalkan = semua absen dari import itu dihapus. Absen dari HP karyawan dan absen manual lain tidak ikut terhapus. Akun karyawan yang dibuat saat import tidak ikut terhapus.</p>`;
      isi.querySelectorAll(".imp-batal").forEach(b => b.onclick = async () => {
        const g = list[+b.dataset.i];
        if (!await tanya(`Batalkan import "${g.file}" (${tglJam(g.waktu)})?\n${fmtNum(g.ids.length)} absen milik ${fmtNum(g.orang.size)} karyawan akan DIHAPUS dan tidak bisa dikembalikan.`, { ya: "Hapus " + fmtNum(g.ids.length) + " absen", bahaya: true })) return;
        b.disabled = true; let n = 0;
        try{
          for (let i = 0; i < g.ids.length; i += 400){ const bt = writeBatch(db); g.ids.slice(i, i + 400).forEach(id => bt.delete(D("absensi", id))); await bt.commit(); n += Math.min(400, g.ids.length - i);
            msg(m, `Menghapus… ${fmtNum(n)} / ${fmtNum(g.ids.length)}`); }
          catatLog(CID, me.uid, profile, "hapus", `Membatalkan import ${g.file} (${tglJam(g.waktu)}): ${g.ids.length} absen dihapus`);
          msg(m, `Import "${g.file}" dibatalkan: ${fmtNum(g.ids.length)} absen dihapus.`, "ok");
          if ($("#l-out").dataset.done) $("#l-go").click();
          muatRiwayat();
        }catch(err){ msg(m, "Gagal membatalkan: " + (err.code === "permission-denied" ? "ditolak server (jalankan deploy-rules.bat)" : err.code || err.message) + (n ? `. ${fmtNum(n)} sudah terhapus, klik Batalkan lagi untuk sisanya.` : ""), "bad"); b.disabled = false; }
      });
    }catch(err){ isi.innerHTML = `<p class="meta">Gagal memuat riwayat: ${esc(err.code || err.message)}</p>`; }
  };
  f.querySelector(".imp-riwayat").addEventListener("toggle", e => { if (e.target.open) muatRiwayat(); });
  f.querySelector(".imp-pilih").onclick = () => f.querySelector(".imp-file").click();
  f.querySelector(".imp-file").onchange = async e => {
    const file = e.target.files[0]; e.target.value = ""; if (!file) return;
    const box = f.querySelector(".imp-prev"); box.innerHTML = '<p class="meta">Membaca file…</p>'; msg(m, "");
    let tabel; try{ tabel = await bacaTabel(file); }catch(err){ box.innerHTML = ""; msg(m, "File tidak bisa dibaca: " + err.message, "bad"); return; }
    // Baris judul: yang memuat "Check In"; kalau judul salah ketik, pakai baris pertama yang terisi
    let iH = tabel.findIndex(r => r.some(c => /check ?in|jam ?masuk/i.test(String(c))));
    if (iH < 0) iH = tabel.findIndex(r => r && r.filter(c => String(c ?? "").trim()).length >= 3);
    if (iH < 0){ box.innerHTML = ""; msg(m, "File kosong.", "bad"); return; }
    // Kolom dikenali dari judulnya; judul yang tidak dikenali (mis. salah ketik) memakai susunan baku A–G
    const H = tabel[iH].map(c => String(c ?? "").toLowerCase().trim()), kol = (re, bukan) => H.findIndex(h => re.test(h) && !(bukan && bukan.test(h)));
    const BAKU = { cU: [0, "Username"], cN: [1, "Full Name"], cCV: [2, "Group CV"], cJ: [3, "Join Date"], cD: [4, "Date"], cI: [5, "Check In"], cO: [6, "Check Out"] };
    const ketemu = { cU: kol(/user/), cN: kol(/name|nama/, /user/), cCV: kol(/cv|group|grup/), cJ: kol(/join|tgl ?masuk|tanggal ?masuk/), cD: kol(/date|tanggal|tgl/, /join|masuk/), cI: kol(/check ?in|chek ?in|cek ?in|jam ?masuk|^in$/), cO: kol(/check ?out|chek ?out|cek ?out|jam ?pulang|^out$/) };
    // format Talenta (Mekari): Employee ID*, Full Name, Date*, …, Check In, Check Out, …, Join Date
    const talenta = H.some(h => /employee ?id/.test(h)) && H.some(h => /schedule ?in/.test(h));
    if (talenta || ketemu.cU < 0) ketemu.cU = kol(/employee ?id|^id$|^nik|nomor induk/);
    // kolom yang dikenali kuat (judulnya ada) -> tidak perlu susunan baku untuk kolom opsional
    const dikenal = ["cN", "cD", "cI", "cO"].filter(k => ketemu[k] >= 0).length >= 3;
    const pakai = {}, posisi = [];
    for (const [k, [i, nama]] of Object.entries(BAKU)){
      const n = ketemu[k];
      if (n >= 0 && !Object.values(pakai).includes(n)) pakai[k] = n;
      else if (dikenal && ["cU", "cCV", "cJ"].includes(k)) pakai[k] = -1;             // kolom opsional tidak ada di file
      else { pakai[k] = i; posisi.push(`${nama} = kolom ${String.fromCharCode(65 + i)}${H[i] ? ` ("${tabel[iH][i]}")` : ""}`); }
    }
    const { cU, cN, cCV, cJ, cD, cI, cO } = pakai, cSI = kol(/schedule ?in|jadwal ?masuk/), cSO = kol(/schedule ?out|jadwal ?pulang/);
    // cek: kolom tanggal benar-benar berisi tanggal
    const contoh = tabel.slice(iH + 1).filter(r => r && String(r[cD] ?? "").trim()).slice(0, 20);
    if (!contoh.length || contoh.filter(r => tglExcel(r[cD])).length < contoh.length / 2){
      box.innerHTML = ""; msg(m, `Kolom tanggal (kolom ${String.fromCharCode(65 + cD)}) tidak berisi tanggal. Pastikan susunan kolom: Username, Full Name, Group CV, Join Date, Date, Check In, Check Out.`, "bad"); return; }
    const semua = pengguna.filter(u => ["karyawan", "supervisor", "admin"].includes(u.role));
    const byU = Object.fromEntries(semua.filter(u => u.username).map(u => [u.username.toLowerCase(), u])), byN = Object.fromEntries(semua.map(u => [normKunci(u.nama), u]));
    const byNik = Object.fromEntries(semua.filter(u => u.nik).map(u => [normKunci(u.nik), u]));
    // nama mirip: semua kata nama di aplikasi ada di nama file (atau sebaliknya), mis. "Afri Sujono" ~ "Afri Sujono Putra", "M. Chusen" ~ "M Chusen"
    const kata = s => String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean);
    const mirip = nama => { const kf = kata(nama); if (!kf.length) return null;
      const cocok = semua.filter(u => { const ku = kata(u.nama); if (!ku.length) return false;
        const [a, b] = ku.length <= kf.length ? [ku, kf] : [kf, ku]; return a.every(w => b.includes(w)) && (a.length >= 2 || a[0].length >= 4); });
      return cocok.length === 1 ? cocok[0] : null; };
    const sekarang = new Date(), orang = {}, salah = [];
    for (const r of tabel.slice(iH + 1)){
      if (!r || r.every(c => String(c ?? "").trim() === "")) continue;
      const user = cU >= 0 ? String(r[cU] ?? "").trim().replace(/^@/, "").replace(/\*$/, "") : "", nama = String(r[cN] ?? "").trim();
      const kunci = "f:" + (user || nama).toLowerCase(), tgl = tglExcel(r[cD]);
      let o = orang[kunci];
      if (!o){
        let u = byNik[normKunci(user)] || byU[user.toLowerCase()] || byN[normKunci(nama)], cara = u ? "pasti" : "";
        if (!u){ u = mirip(nama); if (u) cara = "mirip"; }
        o = orang[kunci] = { u, cara, idFile: user, namaFile: nama, label: nama || user, cv: cCV >= 0 ? String(r[cCV] ?? "").trim() : "", join: cJ >= 0 ? tglExcel(r[cJ]) : "", absen: [], hari: 0, kosong: 0, baris: [] };
      }
      if (!tgl){ salah.push("Tanggal tidak terbaca: " + (nama || user) + " " + String(r[cD] ?? "")); continue; }
      const ji = jamExcel(r[cI]), jo = jamExcel(r[cO]);
      const barisIni = { tgl, ji, jo }; o.baris.push(barisIni);
      if (!ji && !jo){ o.kosong++; continue; }
      o.hari++;
      const [y, mo, d] = tgl.split("-").map(Number);
      if (ji){ const [h, mi] = ji.split(":").map(Number); o.absen.push({ type: "masuk", ts: new Date(y, mo - 1, d, h, mi), tgl }); }
      // jadwal shift malam dari file (Talenta: Schedule In/Out, mis. 19:00–07:00)
      const sIn = cSI >= 0 ? jamExcel(r[cSI]) : "", sOut = cSO >= 0 ? jamExcel(r[cSO]) : "", jadwalMalam = !!(sIn && sOut && sOut < sIn);
      if (jo){ const [h, mi] = jo.split(":").map(Number); let t = new Date(y, mo - 1, d, h, mi);
        if ((ji && jo < ji) || (!ji && jadwalMalam && jo <= sOut)) t = new Date(y, mo - 1, d + 1, h, mi);   // pulang lewat tengah malam
        barisIni.besok = t.getDate() !== d; o.absen.push({ type: "pulang", ts: t, tgl }); }
    }
    const list = Object.values(orang);
    if (!list.length){ box.innerHTML = ""; msg(m, "Tidak ada baris data.", "bad"); return; }
    // absen yang sudah ada (dari aplikasi atau import sebelumnya) dilewati supaya tidak dobel
    const semuaTs = list.flatMap(o => o.absen.map(a => a.ts)), awal = new Date(Math.min(...semuaTs)), akhir = new Date(Math.max(...semuaTs));
    const ada = new Set();
    if (semuaTs.length){
      try{
        const snap = await getDocs(query(C("absensi"), where("ts", ">=", Timestamp.fromDate(new Date(awal.getFullYear(), awal.getMonth(), awal.getDate()))), where("ts", "<", Timestamp.fromDate(new Date(akhir.getFullYear(), akhir.getMonth(), akhir.getDate() + 2))), orderBy("ts")));
        snap.docs.forEach(d => { const x = d.data(); if (x.status !== "tolak"){ const t = tsOf(x); ada.add(x.uid + "|" + dayKey(t) + "|" + x.type); } });
      }catch(err){ msg(m, "Gagal memeriksa data lama: " + (err.code || err.message), "bad"); return; }
    }
    const opsiKar = [...semua].sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    const render = () => {
    list.forEach(o => { o.baru = o.absen.filter(a => o.u && a.ts <= sekarang && !ada.has(o.u.id + "|" + dayKey(a.ts) + "|" + a.type) && !ada.has(o.u.id + "|" + a.tgl + "|" + a.type));
      o.lewat = o.absen.length - o.baru.length; });
    const siap = list.filter(o => o.u), total = siap.reduce((t, o) => t + o.baru.length, 0);
    const tglMin = semuaTs.length ? dayKey(awal) : "", tglMaks = semuaTs.length ? dayKey(akhir) : "";
    box.innerHTML = `<h3 style="margin:12px 0 6px">Pratinjau: ${esc(file.name)}</h3>
      ${posisi.length ? `<p class="meta" style="color:var(--warn)">⚠ Judul kolom tidak dikenali, dibaca menurut susunan baku: ${esc(posisi.join(", "))}. Periksa pratinjau sebelum import.</p>` : ""}
      <p class="meta">${tglMin ? "Tanggal " + esc(tglMedium(tglMin)) + " – " + esc(tglMedium(tglMaks)) + " · " : ""}${fmtNum(list.length)} karyawan</p>
      ${list.some(o => !o.u) ? `<div class="imp-baru"><p class="meta" style="margin:0 0 6px">${fmtNum(list.filter(o => !o.u).length)} nama tidak ditemukan di aplikasi.
        Buat sebagai karyawan baru: username = nama depan (huruf kecil), password = username + 1006.</p>
        <button type="button" class="small imp-buat">Buat ${fmtNum(list.filter(o => !o.u).length)} karyawan baru</button></div>` : ""}
      <div class="tablewrap"><table class="mf-tbl"><tr><th>Nama</th><th>Group CV</th><th class="num">Hari</th><th class="num">Absen baru</th><th class="num">Dilewati</th><th>Karyawan di aplikasi</th></tr>${list.map(o =>
        `<tr class="${o.u ? "" : "salah"}"><td>${esc(o.label)}${o.join ? `<small>Masuk ${esc(tglMedium(o.join))}</small>` : ""}</td><td>${esc(o.cv || "-")}</td>
        <td class="num">${fmtNum(o.hari)}</td><td class="num">${fmtNum(o.baru.length)}</td><td class="num">${fmtNum(o.lewat)}</td>
        <td><select class="imp-pilih-kar" data-k="${esc("f:" + (o.idFile || o.namaFile).toLowerCase())}" title="Karyawan di aplikasi untuk ${esc(o.label)}">
          <option value="">✗ Tidak diimport</option>${opsiKar.map(u => `<option value="${esc(u.id)}" ${o.u?.id === u.id ? "selected" : ""}>${esc(u.nama)}${u.nik ? " · " + esc(u.nik) : ""}</option>`).join("")}</select>
          <small>${!o.u ? "Tidak ditemukan, pilih manual" : o.cara === "baru" ? "＋ akun baru @" + esc(o.u.username) : o.cara === "mirip" ? "≈ nama mirip, periksa" : o.cara === "manual" ? "dipilih manual" : "✓ cocok"}${o.idFile ? " · ID " + esc(o.idFile) : ""}</small></td></tr>`).join("")}</table></div>
      <details class="imp-rinci"><summary>Lihat rincian per tanggal (${fmtNum(list.reduce((t, o) => t + o.baris.length, 0))} baris)</summary>
        <div class="tablewrap"><table class="mf-tbl"><tr><th>Nama</th><th>Tanggal</th><th>Check In</th><th>Check Out</th><th>Keterangan</th></tr>${list.flatMap(o => o.baris
          .sort((a, b) => a.tgl.localeCompare(b.tgl)).map(x => {
            const lewatIn = x.ji && !o.baru.some(a => a.type === "masuk" && a.tgl === x.tgl), lewatOut = x.jo && !o.baru.some(a => a.type === "pulang" && a.tgl === x.tgl);
            const ket = !o.u ? "karyawan tidak ditemukan" : !x.ji && !x.jo ? "libur / kosong" : (lewatIn || lewatOut) ? "sudah ada, dilewati" : "baru";
            const t = new Date(x.tgl + "T00:00");
            return `<tr class="${!o.u ? "salah" : ""}"><td>${esc(o.label)}</td><td>${esc(tglMediumHari(x.tgl))}</td>
              <td>${esc(x.ji || "-")}</td><td>${esc(x.jo || "-")}${x.besok ? " <small>(+1 hari)</small>" : ""}</td><td class="meta">${ket}</td></tr>`; })).join("")}</table></div>
      </details>
      ${salah.length ? `<p class="meta" style="color:var(--bad)">${fmtNum(salah.length)} baris dilewati: ${esc(salah.slice(0, 3).join("; "))}${salah.length > 3 ? "…" : ""}</p>` : ""}
      <p class="meta">"Dilewati" = absen di tanggal itu sudah ada (tidak dobel) atau tanggal yang belum lewat. Absen hasil import langsung sah dan bertanda <b>import</b>.</p>
      ${list.some(o => o.idFile) ? `<label class="check"><input type="checkbox" class="imp-nik" checked> <span>Simpan ID karyawan dari file (mis. Employee ID Talenta) ke <b>Nomor induk</b> karyawan yang masih kosong, supaya import berikutnya langsung cocok</span></label>` : ""}
      <div class="btns"><button type="button" class="small imp-go" ${total ? "" : "disabled"}>Import ${fmtNum(total)} absen</button></div>`;
    // Nama yang tidak ditemukan -> buat akun karyawan baru (username nama depan, password username + 1006)
    const tBuat = box.querySelector(".imp-buat");
    if (tBuat) tBuat.onclick = async () => {
      const belum = list.filter(o => !o.u);
      const dipakai = new Set(pengguna.map(u => (u.username || "").toLowerCase()));
      const rencana = [];
      for (const o of belum){
        const kata = String(o.namaFile || o.label).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
        let dasar = kata[0] || "karyawan", i = 1;
        while (dasar.length < 3 && kata[i]) dasar += kata[i++];             // mis. "M. Alfi" -> "malfi"
        dasar = dasar.slice(0, 15);
        let un = usernameAkhir(dasar), n = 2;
        while (dipakai.has(un) || await sudahDipakai(un)) un = usernameAkhir(dasar + n++);
        dipakai.add(un);
        let pw = un.replace(/\.demo$/, "") + "1006"; while (pw.length < 8) pw += "1006";
        rencana.push({ o, un, pw });
      }
      if (!await tanya(`Buat ${rencana.length} akun karyawan baru di ${perusahaan?.nama || ""}?\n\n` + rencana.slice(0, 8).map(x => `• ${x.o.label}: ${x.un} / ${x.pw}`).join("\n") + (rencana.length > 8 ? `\n… dan ${rencana.length - 8} lainnya (daftar lengkap diunduh sebagai Excel setelah dibuat)` : ""), { ya: "Buat akun" })) return;
      tBuat.disabled = true;
      let daftarCVBaru = [...daftarCV], cvBerubah = false;
      const idCV = nama => { if (!nama) return ""; let c = daftarCVBaru.find(x => x.nama.toLowerCase() === nama.toLowerCase());
        if (!c){ c = { id: cvId(), nama }; daftarCVBaru.push(c); cvBerubah = true; } return c.id; };
      const hasilBuat = [];
      for (const [i, x] of rencana.entries()){
        msg(m, `Membuat akun ${i + 1} / ${rencana.length}: ${x.o.label}…`);
        try{
          const data = { nama: x.o.namaFile || x.o.label, username: x.un, role: "karyawan", peran: "", cid: CID, kode: perusahaan.kode, lokasiKerja: [],
            nik: x.o.idFile || "", jabatan: "", divisi: "", hp: "", masuk: x.o.join || "", alamat: "", shift: "", kehadiran: "", grupCV: idCV(x.o.cv),
            dibuat: serverTimestamp(), dibuatOleh: profile.nama };
          const uid = await buatAkun(keEmail(x.un), x.pw, async uid => {
            const bt = writeBatch(db); bt.set(doc(db, "users", uid), data); bt.set(doc(db, "usernames", x.un), { uid, cid: CID }); await bt.commit(); });
          const u = { id: uid, uid, ...data }; semua.push(u); opsiKar.push(u); x.o.u = u; x.o.cara = "baru";
          hasilBuat.push({ ...x, ok: true });
        }catch(err){ hasilBuat.push({ ...x, ok: false, err: err.code || err.message }); }
      }
      if (cvBerubah) try{ await simpanDaftarCV(daftarCVBaru); }catch(e){}
      opsiKar.sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
      const ok = hasilBuat.filter(x => x.ok), gagalB = hasilBuat.filter(x => !x.ok);
      catatLog(CID, me.uid, profile, "tambah", `Membuat ${ok.length} akun karyawan baru dari import ${file.name}: ` + ok.map(x => x.un).join(", "));
      render();
      msg(m, `${fmtNum(ok.length)} akun karyawan baru dibuat${gagalB.length ? `, ${fmtNum(gagalB.length)} gagal (${gagalB.map(x => x.o.label + ": " + x.err).join("; ")})` : ""}. Daftar username & password diunduh sebagai Excel.`, gagalB.length ? "bad" : "ok");
      if (ok.length){
        const blob = buatXlsx([["Nama", "Username", "Password awal"], ...ok.map(x => [x.o.label, x.un, x.pw])], "Akun baru", [32, 18, 18]);
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "akun-karyawan-baru-" + dayKey(new Date()) + ".xlsx"; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      }
    };
    box.querySelectorAll(".imp-pilih-kar").forEach(sl => sl.onchange = () => {
      const o = orang[sl.dataset.k]; if (!o) return;
      o.u = semua.find(u => u.id === sl.value) || null; o.cara = o.u ? "manual" : ""; render(); });
    box.querySelector(".imp-go").onclick = async ev => {
      if (!await tanya(`Import ${total} catatan absen untuk ${siap.length} karyawan ke ${perusahaan?.nama || "perusahaan ini"}?`, { ya: "Import" })) return;
      const tombolImp = ev.target; tombolImp.disabled = true; tombolImp.textContent = "Mengimpor…";
      tombolImp.scrollIntoView({ block: "center", behavior: "smooth" });
      const tugas = siap.flatMap(o => o.baru.map(a => ({ o, a }))), importId = "imp" + Date.now().toString(36);
      let jadi = 0, gagal = 0;
      const satu = async ({ o, a }) => {
        try{
          await setDoc(doc(C("absensi")), { uid: o.u.id, nama: o.u.nama, type: a.type, status: "terima", ts: Timestamp.fromDate(a.ts), manual: true, import: true,
            byUid: me.uid, by: profile.nama, alasan: "Import Excel " + file.name, importId, decidedAt: serverTimestamp(), dist: 0, rad: 0, acc: 0, lokasi: "import",
            device: "import", live: false, foto: null, face: null, finger: false });
          jadi++;
        }catch(err){ gagal++; }
        if ((jadi + gagal) % 10 === 0){ msg(m, `Mengimpor… ${fmtNum(jadi + gagal)} / ${fmtNum(tugas.length)}`);
          tombolImp.textContent = `Mengimpor… ${fmtNum(jadi + gagal)} / ${fmtNum(tugas.length)}`; }
      };
      msg(m, "Mengimpor…");
      for (let i = 0; i < tugas.length; i += 25) await Promise.all(tugas.slice(i, i + 25).map(satu));
      tombolImp.textContent = `Selesai: ${fmtNum(jadi)} absen diimpor`;
      // ID karyawan dari file -> Nomor induk (kalau masih kosong)
      let nikDisimpan = 0;
      if (box.querySelector(".imp-nik")?.checked) for (const o of siap){
        if (o.idFile && !o.u.nik && !semua.some(u => normKunci(u.nik) === normKunci(o.idFile))){
          try{ await updateDoc(doc(db, "users", o.u.id), { nik: o.idFile }); o.u.nik = o.idFile; nikDisimpan++; }catch(err){} }
      }
      // profil: Group CV & tanggal masuk
      let profilDiubah = 0;
      if (f.querySelector(".imp-profil").checked){
        let daftar = [...daftarCV], cvBaru = false;
        for (const o of siap){
          const ubah = {};
          if (o.cv){ let c = daftar.find(x => x.nama.toLowerCase() === o.cv.toLowerCase()); if (!c){ c = { id: cvId(), nama: o.cv }; daftar.push(c); cvBaru = true; }
            if (o.u.grupCV !== c.id) ubah.grupCV = c.id; }
          if (o.join && o.u.masuk !== o.join) ubah.masuk = o.join;
          if (Object.keys(ubah).length){ try{ await updateDoc(doc(db, "users", o.u.id), ubah); profilDiubah++; }catch(err){} }
        }
        if (cvBaru) try{ await simpanDaftarCV(daftar); }catch(err){}
      }
      catatLog(CID, me.uid, profile, "absen", `Import absensi Excel ${file.name}: ${jadi} absen, ${siap.length} karyawan${gagal ? ", " + gagal + " gagal" : ""}`);
      msg(m, `Selesai: ${fmtNum(jadi)} absen diimpor${gagal ? `, ${fmtNum(gagal)} gagal (cek deploy-rules)` : ""}${profilDiubah ? ` · ${fmtNum(profilDiubah)} profil karyawan diperbarui` : ""}${nikDisimpan ? ` · ${fmtNum(nikDisimpan)} nomor induk disimpan` : ""}.`, gagal ? "bad" : "ok");
      if ($("#l-out").dataset.done) $("#l-go").click();
    };
    };
    render();
  };
  f.hidden = false; popup(f, "Import absensi · " + (perusahaan?.nama || ""), tombol);
}
$("#imp-buka").onclick = e => bukaImportAbsen(e.currentTarget);

/* ================= KEHADIRAN MANUAL (UPLOAD EXCEL) ================= */
// Untuk karyawan yang tidak absen di aplikasi: hari kerja & lembur diisi di Excel per periode gaji.
let manualData = {}, manualYM = "";
async function muatManual(ym){
  try{ const x = await getDoc(D("kehadiranManual", ym)); manualData = x.exists() ? (x.data().data || {}) : {}; }
  catch(e){ manualData = {}; }
  manualYM = ym; infoManual(); return manualData;
}
function infoManual(){
  const n = Object.keys(manualData).length;
  const el = $("#g-manual-info");
  if (!n){ el.textContent = "Kehadiran manual (operator, supir) atau data gaji karyawan dari Excel."; return; }
  el.innerHTML = `${fmtNum(n)} karyawan memakai kehadiran manual di periode ${esc(ymLabel(manualYM))}. <button type="button" class="linkbtn mf-lihat">Lihat / hapus</button>`;
  el.querySelector(".mf-lihat").onclick = e => bukaManual(e.currentTarget, true);
}
$("#g-bulan").addEventListener("change", () => { if ($("#g-bulan").value) muatManual($("#g-bulan").value); });
const normKunci = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
function angkaSel(v){ if (typeof v === "number") return v; const t = String(v ?? "").trim(); if (!t) return null;
  const n = Number(t.replace(/\s|rp/gi, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return isFinite(n) ? n : NaN; }
function unduhTemplateManual(ym, cocok = () => true, namaPeran = []){
  const head = ["Username", "Nama", "Peran", "Jabatan", "Lokasi kerja", "Group CV", "Hari Kerja", "J Siang", "U Siang", "Trip", "U Trip", "Lembur", "U Lembur", "Uang Ker", "Pinjaman", "Pinjaman SIO", "BPJS", "Violence", "Uang lembur (Rp, opsional)", "Keterangan"];
  const daftar = karyawan.filter(cocok)
    .sort((a, b) => labelPeran(a).localeCompare(labelPeran(b)) || (a.nama || "").localeCompare(b.nama || ""));
  if (!daftar.length){ toast("Tidak ada karyawan dengan peran/lokasi itu."); return; }
  const rows = daftar.map(u => { const d = manualData[u.uid] || {};
    return [u.username || "", u.nama || "", labelPeran(u), u.jabatan || "", teksLokasi(u), namaCV(u.grupCV), d.hari ?? "", d.jSiang ?? "", d.uSiang ?? "", d.trip ?? "", d.uTrip ?? "", d.lembur ?? "", d.uLembur ?? "", d.uKer ?? "", d.pinjaman ?? "", d.pinjamanSio ?? "", d.potBpjs ?? "", d.violence ?? "", d.uangLembur ?? "", d.ket || ""]; });
  const blob = buatXlsx([head, ...rows], "Kehadiran " + ym, [14, 24, 14, 16, 18, 18, 11, 9, 9, 8, 9, 9, 10, 12, 12, 13, 10, 10, 22, 28]);
  const akhiran = namaPeran.length ? "-" + namaPeran.join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-") : "";
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "kehadiran-manual-" + ym + akhiran + ".xlsx"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function bukaManual(tombol, lihatTersimpan = false){
  const ym = $("#g-bulan").value; if (!ym){ toast("Pilih periode dulu."); return; }
  if (!karyawan.length){ toast("Data karyawan belum dimuat."); return; }
  const f = $("#manual-form");
  const render = () => {
    const ada = Object.entries(manualData);
    f.innerHTML = `<p class="meta" style="margin-top:0">Bulan <b>${esc(ymLabel(ym))}</b> · untuk karyawan yang dihitung dari <b>Excel</b> (operator, supir), bukan dari absen aplikasi.</p>
      <div class="mf-utama"><button type="button" class="mf-pilih">📤 Pilih file Excel</button><input type="file" class="mf-file" accept=".xlsx,.csv" hidden>
        <span class="meta">File OP (hari kerja, jam siang, trip, lembur, BPJS…). Setelah dipilih, cek pratinjau lalu klik <b>Simpan</b>.</span></div>
      <details class="mf-lipat"><summary>Belum punya file? Unduh template Excel</summary>
        <div class="mf-lipat-isi"><p class="meta" style="margin:0 0 6px">Pilih karyawan yang masuk template:</p>
          ${karyawan.some(u => u.kehadiran === "manual") ? `<label class="check mf-ditandai-wrap"><input type="checkbox" class="mf-ditandai" checked> <span>Karyawan bertanda <b>Kehadiran manual</b> (${fmtNum(karyawan.filter(u => u.kehadiran === "manual").length)} orang, diatur di Edit karyawan)</span></label>`
            : `<p class="meta" style="margin:4px 0">Tip: tandai karyawan di <b>Karyawan > Edit > Perhitungan kehadiran: Manual</b>, supaya template otomatis berisi mereka saja.</p>`}
          <div class="mf-saring"><div><label>Peran <span class="meta">(boleh pilih lebih dari satu; kosong = semua)</span></label><div class="mf-peran"></div></div>
            <div class="mf-lok-wrap"><label>Lokasi kerja</label><select class="mf-lok"></select></div></div>
          <button type="button" class="small alt mf-template">Unduh template Excel</button>
          <span class="meta mf-jumlah"></span>
          <p class="meta" style="margin:4px 0 0">Kolom <b>Peran</b>, <b>Jabatan</b>, dan <b>Lokasi kerja</b> ikut tercantum dan bisa difilter di Excel. Baris karyawan yang tidak dihitung manual cukup dihapus atau dikosongkan.</p>
          <p class="meta" style="margin:6px 0 0">Isi kolom <b>Hari kerja</b> dan <b>Lembur (jam)</b>. <b>Uang lembur</b> boleh dikosongkan (dihitung dari tarif lembur).</p></div></details>
      <div class="mf-preview"></div>
      <p class="msg mf-msg"></p>
      <details class="mf-lipat"${lihatTersimpan ? " open" : ""}><summary>Data tersimpan bulan ini: <b>${fmtNum(ada.length)} karyawan</b></summary><div class="mf-lipat-isi">
      ${ada.length ? `<div class="tablewrap"><table class="mf-tbl"><tr><th>Nama</th><th class="num">Hari</th><th class="num">J Siang</th><th class="num">Trip</th><th class="num">Lembur</th><th class="num">Uang lembur</th><th></th></tr>${ada
        .sort((a, b) => (a[1].nama || "").localeCompare(b[1].nama || "")).map(([uid, d]) => { const ku = karyawan.find(x => x.uid === uid);
        return `<tr><td>${esc(d.nama || uid)}<small>${esc([ku ? labelPeran(ku) : "", d.ket || ""].filter(Boolean).join(" · "))}</small></td>
        <td class="num">${fmtNum(d.hari || 0, 2)}</td><td class="num">${d.jSiang ? fmtNum(d.jSiang, 2) : "-"}</td><td class="num">${d.trip ? fmtNum(d.trip, 2) : "-"}</td><td class="num">${fmtNum(d.lembur || 0, 2)} j</td><td class="num">${d.uangLembur != null && d.uangLembur !== "" ? rp(d.uangLembur) : d.uLembur ? fmtNum(d.uLembur) + "/jam" : "otomatis"}</td>
        <td><button type="button" class="small alt mf-hapus" data-uid="${esc(uid)}" title="Kembali pakai absen aplikasi">✕</button></td></tr>`; }).join("")}</table></div>
        <button type="button" class="small alt mf-hapus-semua" style="margin-top:8px">Hapus semua data manual periode ini</button>`
        : '<p class="meta">Belum ada.</p>'}</div></details>
      <div class="btns" style="margin-top:12px"><button type="button" class="small alt mf-tutup">Tutup</button></div>`;
    const sP = f.querySelector(".mf-peran"), sL = f.querySelector(".mf-lok");
    // pilihan peran berupa centang: peran bawaan yang dipakai + peran tambahan
    const opsiP = [...["karyawan", "supervisor", "admin"].filter(r => karyawan.some(u => u.role === r && !u.peran)).map(r => [r, PERAN[r]]),
      ...daftarPeran.map(x => ["c:" + x.id, x.nama])];
    const dipilih = new Set(bukaManual.peran || []);
    sP.innerHTML = opsiP.map(([v, l]) => `<label class="chip-cek"><input type="checkbox" value="${esc(v)}" ${dipilih.has(v) ? "checked" : ""}> ${esc(l)}</label>`).join("");
    isiFilterLokasi(sL); f.querySelector(".mf-lok-wrap").hidden = sL.hidden; sL.value = bukaManual.lok || "";
    const pilihan = () => [...sP.querySelectorAll("input:checked")].map(x => x.value);
    const cekManual = f.querySelector(".mf-ditandai");
    const cocok = u => { const p = pilihan(); return (cekManual?.checked ? u.kehadiran === "manual" : (!p.length || p.some(v => cocokPeran(u, v)))) && cocokLokasi(u, sL.value); };
    if (cekManual){ cekManual.onchange = () => { sP.closest("div").classList.toggle("redup", cekManual.checked); hitungJml(); }; sP.closest("div").classList.toggle("redup", cekManual.checked); }
    const hitungJml = () => { bukaManual.peran = pilihan(); bukaManual.lok = sL.value;
      f.querySelector(".mf-jumlah").textContent = fmtNum(karyawan.filter(cocok).length) + " karyawan akan masuk template."; };
    sP.onchange = () => { if (cekManual){ cekManual.checked = false; sP.closest("div").classList.remove("redup"); } hitungJml(); }; sL.onchange = hitungJml; hitungJml();
    f.querySelector(".mf-template").onclick = () => unduhTemplateManual(ym, cocok, pilihan().map(v => (opsiP.find(o => o[0] === v) || [])[1]).filter(Boolean));
    f.querySelector(".mf-tutup").onclick = () => { f.hidden = true; };
    f.querySelector(".mf-pilih").onclick = () => f.querySelector(".mf-file").click();
    f.querySelector(".mf-file").onchange = e => { const file = e.target.files[0]; e.target.value = ""; if (file) prosesFile(file); };
    f.querySelectorAll(".mf-hapus").forEach(b => b.onclick = async () => {
      let srv = manualData; try{ const x = await getDoc(D("kehadiranManual", ym)); srv = x.exists() ? (x.data().data || {}) : {}; }catch(e){}
      const baru = { ...srv }; delete baru[b.dataset.uid]; await simpan(baru, "Menghapus kehadiran manual " + (manualData[b.dataset.uid]?.nama || "") + " " + ymLabel(ym));
    });
    f.querySelector(".mf-hapus-semua")?.addEventListener("click", async () => {
      if (!await tanya("Hapus semua data kehadiran manual periode " + ymLabel(ym) + "? Karyawan tersebut kembali dihitung dari absen aplikasi.", { ya: "Hapus" })) return;
      await simpan({}, "Menghapus semua kehadiran manual " + ymLabel(ym));
    });
  };
  const simpan = async (data, teks) => {
    try{
      // salinan versi sebelumnya disimpan ke riwayat (bisa dikembalikan), lalu tulis versi baru
      const bt = writeBatch(db);
      bt.set(D("kehadiranManual", ym), { data, periode: ym, oleh: profile.nama, waktu: serverTimestamp(), appVer: VERSI_APP });
      await bt.commit();
      manualData = data; manualYM = ym; infoManual(); catatLog(CID, me.uid, profile, "gaji", teks); toast(teks + ".");
      const lebih = await catatBayarPinjaman(ym, data);
      if (lebih.length) toast("⚠ Potongan melebihi sisa pinjaman: " + lebih.join(", "));
      render(); if (hasil.length && curYM === ym) $("#g-hitung").click();
    }catch(err){ msg(f.querySelector(".mf-msg"), err.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat untuk memasang aturan kehadiran manual." : "Gagal menyimpan: " + (err.code || err.message), "bad"); }
  };
  const prosesFile = async file => {
    const box = f.querySelector(".mf-preview"), m = f.querySelector(".mf-msg"); msg(m, "");
    box.innerHTML = '<p class="meta">Membaca file…</p>';
    let tabel;
    try{ tabel = await bacaTabel(file); }catch(err){ box.innerHTML = ""; msg(m, "File tidak bisa dibaca: " + err.message, "bad"); return; }
    // baris judul = baris pertama yang punya kolom "hari"
    const iH = tabel.findIndex(r => r.some(c => /hari/i.test(String(c))));
    if (iH < 0){ box.innerHTML = ""; msg(m, "Kolom \"Hari kerja\" tidak ditemukan. Pakai template dari tombol Unduh template.", "bad"); return; }
    const H = tabel[iH].map(c => String(c).toLowerCase().replace(/\s+/g, " ").trim());
    const kol = (re, bukan) => H.findIndex(h => re.test(h) && !(bukan && bukan.test(h)));
    // Judul kolom dikenali dari namanya (urutan bebas, huruf besar/kecil diabaikan)
    const cUser = kol(/user/), cNama = kol(/nama/, /atas nama/), cKet = kol(/ket|catatan/, /ker\b/);
    // file data gaji (Gaji > Karyawan > Import data gaji) salah diupload di sini -> tolak, supaya tidak tersimpan sebagai kehadiran
    if (H.some(h => /gaji ?pokok|cara ?gaji|upah ?harian/.test(h)) && !H.some(h => /^hari ?kerja$|^hk$|^hari$/.test(h))){
      msg(m, "File ini berisi DATA GAJI karyawan (Gaji pokok, Uang makan, BPJS, PPh…), bukan kehadiran. Upload lewat Gaji › Karyawan › 📥 Import data gaji (Excel).", "bad"); box.innerHTML = ""; return; }
    const cHari = (i => i >= 0 ? i : kol(/hari/, /upah|^u\.? |uang|makan|\//))(kol(/hari ?kerja|^hk$|^hari$/));
    const cJSiang = kol(/^j\.? ?siang|jam ?siang/), cUSiang = kol(/^u\.? ?siang|upah ?siang|uang ?siang/);
    const lemburJam = kol(/lembur/, /^u\.? |uang|upah|tarif|rp/), cULembur = kol(/^u\.? ?lembur|upah ?lembur|tarif ?lembur/);
    const cUang = kol(/uang ?lembur/), cUKer = kol(/ker\b|kerajinan/, /keterangan/);
    const cTrip = kol(/\btrip\b|^rit(ase)?$/, /^u\.? |uang|upah|tarif/), cUTrip = kol(/^u\.? ?trip|uang ?trip|upah ?trip|tarif ?trip/);
    const cBpjs = kol(/bpjs/), cViol = kol(/violence|denda/);
    const cSio = kol(/sio/), cPinjam = kol(/pinjam/, /sio/), cPeran = kol(/^peran$/);
    // Data gaji & jabatan (opsional): dipakai untuk akun baru, atau memperbarui data gaji karyawan yang cocok
    const cGP = kol(/gaji ?pokok|^gp$/), cUM = kol(/uang ?makan|^u\.? ?makan|^um$/), cRek = kol(/no\.? ?rek|rekening/), cCara = kol(/cara ?gaji|jenis ?gaji|mode ?gaji/);
    const cJab = kol(/jabatan|posisi|position/);
    const MODE = { bulanan: "bulanan", "bulanan tetap": "bulanan", harian: "harian", "upah harian": "harian", operator: "operator", prorata: "prorata", "hari kerja": "prorata" };
    // Kolom "Peran" (opsional): peran karyawan ikut diganti, mis. Operator / Supir. Peran yang belum ada dibuat otomatis (setara karyawan).
    const peranBaru = [];
    const cariPeran = t => { const k = normKunci(t); if (!k) return null;
      if (["karyawan", "supervisor", "admin", "superadmin"].includes(k)) return { bawaan: k };
      return daftarPeran.find(x => normKunci(x.nama) === k) || peranBaru.find(x => normKunci(x.nama) === k)
        || (peranBaru.push({ id: Math.random().toString(36).slice(2, 8), nama: String(t).trim().replace(/\s+/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()), akses: "karyawan", baru: true }), peranBaru[peranBaru.length - 1]); };
    const byUser = Object.fromEntries(karyawan.filter(u => u.username).map(u => [normKunci(u.username), u]));
    const byNama = Object.fromEntries(karyawan.map(u => [normKunci(u.nama), u]));
    const hasilBaca = [];
    for (const r of tabel.slice(iH + 1)){
      if (!r || r.every(c => String(c ?? "").trim() === "")) continue;
      const user = cUser >= 0 ? r[cUser] : "", nama = cNama >= 0 ? r[cNama] : "";
      const ambil = c => c >= 0 ? angkaSel(r[c]) : null;
      const hari = ambil(cHari), lembur = ambil(lemburJam), uang = ambil(cUang);
      const ekstra = { jSiang: ambil(cJSiang), uSiang: ambil(cUSiang), uLembur: ambil(cULembur), trip: ambil(cTrip), uTrip: ambil(cUTrip), uKer: ambil(cUKer), pinjaman: ambil(cPinjam), pinjamanSio: ambil(cSio), potBpjs: ambil(cBpjs), violence: ambil(cViol) };
      for (const k of ["pinjaman", "pinjamanSio", "potBpjs", "violence"]) if (ekstra[k] < 0) ekstra[k] = -ekstra[k];   // potongan boleh ditulis minus (-231.000)
      if (hari == null && !lembur && !ekstra.jSiang && !ekstra.trip) continue;       // baris tanpa angka: dilewati
      const u = byUser[normKunci(String(user).replace(/^@/, ""))] || byNama[normKunci(nama)];
      const gajiF = Object.fromEntries(Object.entries({ gajiPokok: ambil(cGP), uangMakan: ambil(cUM) }).filter(([, v]) => v != null && !isNaN(v) && v >= 0));
      if (cRek >= 0 && String(r[cRek] ?? "").replace(/\D/g, "")) gajiF.noRek = String(r[cRek]).replace(/\D/g, "");
      const cara = cCara >= 0 ? MODE[String(r[cCara] ?? "").trim().toLowerCase()] : ""; if (cara) gajiF.modeGaji = cara;
      const jabatanF = cJab >= 0 ? String(r[cJab] ?? "").trim().slice(0, 60) : "", peranF = cPeran >= 0 ? String(r[cPeran] ?? "").trim() : "";
      let salah = "";
      if (!u) salah = "Karyawan tidak ditemukan";
      else if (hari == null || isNaN(hari) || hari < 0 || hari > 31) salah = "Hari kerja harus 0–31";
      else if (lembur != null && (isNaN(lembur) || lembur < 0 || lembur > 400)) salah = "Jam lembur tidak valid";
      else if (uang != null && (isNaN(uang) || uang < 0)) salah = "Uang lembur tidak valid";
      else { const buruk = Object.entries(ekstra).find(([, v]) => v != null && (isNaN(v) || v < 0)); if (buruk) salah = "Angka " + ({ jSiang: "J Siang", uSiang: "U Siang", uLembur: "U Lembur", trip: "Trip", uTrip: "U Trip", uKer: "Uang Ker", pinjaman: "Pinjaman", pinjamanSio: "Pinjaman SIO", potBpjs: "BPJS", violence: "Violence" })[buruk[0]] + " tidak valid"; }
      // Ganti peran hanya untuk karyawan/supervisor (admin tidak diubah dari Excel)
      let gantiPeran = null;
      if (u && cPeran >= 0 && !["admin", "superadmin"].includes(u.role)){ const pr = cariPeran(r[cPeran]);
        if (pr && !pr.bawaan && u.peran !== pr.id) gantiPeran = pr;
        else if (pr?.bawaan === "karyawan" && (u.peran || u.role !== "karyawan")) gantiPeran = { id: "", nama: "Karyawan", akses: "karyawan" }; }
      hasilBaca.push({ u, gantiPeran, gajiF, jabatanF, peranF, namaF: String(nama || "").trim(), label: u?.nama || nama || user, hari, lembur: lembur || 0, uang, ekstra, ket: cKet >= 0 ? String(r[cKet] ?? "").trim().slice(0, 80) : "", salah });
    }
    if (!hasilBaca.length){ box.innerHTML = ""; msg(m, "Tidak ada baris berisi angka hari kerja.", "bad"); return; }
    const ok = hasilBaca.filter(x => !x.salah), dobel = new Set(), seen = new Set();
    const belum = hasilBaca.filter(x => !x.u && x.namaF);
    const adaGaji = ok.filter(x => Object.keys(x.gajiF).length);
    ok.forEach(x => { if (seen.has(x.u.uid)) dobel.add(x.u.uid); seen.add(x.u.uid); });
    box.innerHTML = `<h3 style="margin:12px 0 6px">Pratinjau: ${esc(file.name)}</h3>
      ${belum.length && isAdmin() ? `<div class="imp-baru"><p class="meta" style="margin:0 0 6px"><b>${fmtNum(belum.length)} nama belum terdaftar</b> sebagai karyawan di aplikasi.
        Buat sebagai karyawan baru: username = nama depan (huruf kecil), password = username + 1006, kehadiran = <b>Manual</b>${cPeran >= 0 ? ", peran dari kolom Peran" : ""}${cJab >= 0 ? ", jabatan dari kolom Jabatan" : ""}${cGP >= 0 || cUM >= 0 || cRek >= 0 ? ", data gaji dari kolom Gaji pokok / Uang makan / No rek" : ""}.</p>
        <button type="button" class="small mf-buat">Buat ${fmtNum(belum.length)} karyawan baru</button></div>` : ""}
      <div class="tablewrap"><table class="mf-tbl"><tr><th>Nama</th><th class="num">Hari</th><th class="num">J Siang</th><th class="num">Trip</th><th class="num">Lembur</th><th class="num">Uang Ker</th><th class="num">Pinjaman</th><th class="num">Pinj. SIO</th><th class="num">BPJS</th>${cPeran >= 0 ? "<th>Peran</th>" : ""}<th>Status</th></tr>${hasilBaca.map(x => {
        const n = v => v != null && !isNaN(v) && v ? fmtNum(v, 2) : "-";
        return `<tr class="${x.salah ? "salah" : ""}"><td>${esc(x.label)}${x.u ? `<small>${esc(labelPeran(x.u))}</small>` : ""}</td><td class="num">${x.hari == null || isNaN(x.hari) ? "-" : fmtNum(x.hari, 2)}</td>
        <td class="num">${n(x.ekstra.jSiang)}</td><td class="num">${n(x.ekstra.trip)}</td><td class="num">${fmtNum(x.lembur, 2)} j</td><td class="num">${n(x.ekstra.uKer)}</td><td class="num">${n(x.ekstra.pinjaman)}</td><td class="num">${n(x.ekstra.pinjamanSio)}</td><td class="num">${n(x.ekstra.potBpjs)}</td>
        ${cPeran >= 0 ? `<td>${x.gantiPeran && !x.salah ? `${esc(labelPeran(x.u))} → <b>${esc(x.gantiPeran.nama)}</b>${x.gantiPeran.baru ? " <small>(peran baru)</small>" : ""}` : '<span class="meta">tetap</span>'}</td>` : ""}
        <td>${x.salah ? "✗ " + esc(x.salah) : dobel.has(x.u.uid) ? "⚠ dobel (baris terakhir dipakai)" : "✓"}</td></tr>`; }).join("")}</table></div>
      <p class="meta">${fmtNum(ok.length)} baris siap disimpan${hasilBaca.length - ok.length ? `, <b style="color:var(--bad)">${fmtNum(hasilBaca.length - ok.length)} baris dilewati</b>` : ""}.</p>
      ${ok.some(x => x.gantiPeran) ? `<label class="check"><input type="checkbox" class="mf-peran-ok" checked> Ganti peran ${fmtNum(ok.filter(x => x.gantiPeran).length)} karyawan sesuai kolom Peran${peranBaru.length ? ` (peran baru dibuat: <b>${esc(peranBaru.map(x => x.nama).join(", "))}</b>)` : ""}</label>` : ""}
      ${adaGaji.length && isAdmin() ? `<label class="check"><input type="checkbox" class="mf-gaji-ok" checked> Perbarui data gaji ${fmtNum(adaGaji.length)} karyawan dari file (${esc([cGP >= 0 && "Gaji pokok", cUM >= 0 && "Uang makan", cRek >= 0 && "No rek", cCara >= 0 && "Cara gaji"].filter(Boolean).join(", "))}${cBpjs >= 0 ? "; BPJS otomatis dimatikan karena potongan BPJS dari file" : ""})</label>` : ""}
      <label class="check"><input type="checkbox" class="mf-ganti"> Ganti semua data manual periode ini (karyawan yang tidak ada di file kembali pakai absen aplikasi)</label>
      <div class="btns" style="margin-top:8px"><button type="button" class="small mf-simpan" ${ok.length ? "" : "disabled"}>Simpan ${fmtNum(ok.length)} karyawan</button></div>`;
    // Nama yang belum terdaftar -> buat akun karyawan baru (sama seperti import absensi), lalu file dibaca ulang
    const tBuat = box.querySelector(".mf-buat");
    if (tBuat) tBuat.onclick = async () => {
      const dipakai = new Set(pengguna.map(u => (u.username || "").toLowerCase()));
      const rencana = [];
      for (const x of belum){
        const kata = x.namaF.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
        let dasar = kata[0] || "karyawan", i = 1;
        while (dasar.length < 3 && kata[i]) dasar += kata[i++];             // mis. "Mhd. Sahputra" -> "mhd", "M. Alfi" -> "malfi"
        dasar = dasar.slice(0, 15);
        let un = usernameAkhir(dasar), n = 2;
        while (dipakai.has(un) || await sudahDipakai(un)) un = usernameAkhir(dasar + n++);
        dipakai.add(un);
        let pw = un.replace(/\.demo$/, "") + "1006"; while (pw.length < 8) pw += "1006";
        // nama HURUF BESAR semua -> Huruf Awal Besar
        const namaRapi = x.namaF === x.namaF.toUpperCase() ? x.namaF.toLowerCase().replace(/(^|[\s.'-])\p{L}/gu, c => c.toUpperCase()) : x.namaF;
        rencana.push({ x, un, pw, nama: namaRapi.replace(/\s+/g, " ") });
      }
      if (!await tanya(`Buat ${rencana.length} akun karyawan baru di ${perusahaan?.nama || ""}?\n\n` + rencana.slice(0, 8).map(r => `• ${r.nama}: ${r.un} / ${r.pw}`).join("\n") + (rencana.length > 8 ? `\n… dan ${rencana.length - 8} lainnya (daftar lengkap diunduh sebagai Excel)` : ""), { ya: "Buat akun" })) return;
      tBuat.disabled = true;
      // peran baru (mis. Operator / Supir) disimpan dulu
      const peranAkun = r => { const pr = r.x.peranF ? cariPeran(r.x.peranF) : null; return pr && !pr.bawaan ? pr : null; };
      const perluPeran = [...new Set(rencana.map(peranAkun).filter(p => p?.baru))];
      if (perluPeran.length){
        try{ await setDoc(D("settings", "peran"), { daftar: [...daftarPeran, ...perluPeran.map(({ id, nama, akses }) => ({ id, nama, akses }))], diubah: serverTimestamp(), oleh: profile.nama });
          perluPeran.forEach(p => { delete p.baru; daftarPeran.push({ id: p.id, nama: p.nama, akses: p.akses }); }); }
        catch(err){ msg(m, "Peran baru gagal dibuat: " + (err.code || err.message), "bad"); }
      }
      const hasilBuat = [];
      for (const [i, r] of rencana.entries()){
        msg(m, `Membuat akun ${i + 1} / ${rencana.length}: ${r.nama}…`);
        try{
          const pr = peranAkun(r);
          const data = { nama: r.nama, username: r.un, role: pr?.akses || "karyawan", peran: pr && daftarPeran.some(p => p.id === pr.id) ? pr.id : "", cid: CID, kode: perusahaan.kode, lokasiKerja: [],
            nik: "", jabatan: r.x.jabatanF, divisi: "", hp: "", masuk: "", alamat: "", shift: "", kehadiran: "manual", grupCV: "", proyek: "",
            dibuat: serverTimestamp(), dibuatOleh: profile.nama };
          const uid = await buatAkun(keEmail(r.un), r.pw, async uid => {
            const bt = writeBatch(db); bt.set(doc(db, "users", uid), data); bt.set(doc(db, "usernames", r.un), { uid, cid: CID }); await bt.commit(); });
          const g = { ...r.x.gajiF, ...(r.x.ekstra.potBpjs != null ? { ikutKes: false, ikutJht: false, ikutJp: false } : {}), ...(r.x.gajiF.noRek ? { atasNama: r.nama } : {}) };
          if (Object.keys(g).length) try{ await setDoc(D("payroll", uid), { ...g, appVer: VERSI_APP }, { merge: true }); gajiMap[uid] = g; }catch(e){}
          karyawan.push({ uid, id: uid, ...data });
          hasilBuat.push({ ...r, ok: true });
        }catch(err){ hasilBuat.push({ ...r, ok: false, err: err.code || err.message }); }
      }
      karyawan.sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
      const okB = hasilBuat.filter(r => r.ok), gagalB = hasilBuat.filter(r => !r.ok);
      catatLog(CID, me.uid, profile, "tambah", `Membuat ${okB.length} akun karyawan baru dari kehadiran manual ${file.name}: ` + okB.map(r => r.un).join(", "));
      if (okB.length){
        const blob = buatXlsx([["Nama", "Username", "Password awal"], ...okB.map(r => [r.nama, r.un, r.pw])], "Akun baru", [32, 18, 18]);
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "akun-karyawan-baru-" + dayKey(new Date()) + ".xlsx"; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      }
      await prosesFile(file);      // baca ulang: nama yang baru dibuat sekarang cocok
      msg(m, `${fmtNum(okB.length)} akun karyawan baru dibuat${gagalB.length ? `, ${fmtNum(gagalB.length)} gagal (${gagalB.map(r => r.nama + ": " + r.err).join("; ")})` : ""}. Daftar username & password diunduh sebagai Excel. Periksa pratinjau lalu klik Simpan.`, gagalB.length ? "bad" : "ok");
    };
    box.querySelector(".mf-simpan").onclick = async e => {
      e.target.disabled = true;
      // ambil data terbaru dari server dulu (bukan dari memori) supaya data karyawan lain di periode ini tidak hilang
      let lamaServer = manualData;
      if (!box.querySelector(".mf-ganti").checked){
        try{ const x = await getDoc(D("kehadiranManual", ym)); lamaServer = x.exists() ? (x.data().data || {}) : {}; }
        catch(err){ msg(f.querySelector(".mf-msg"), "Gagal membaca data lama: " + (err.code || err.message) + ". Coba lagi.", "bad"); e.target.disabled = false; return; }
      } else if (Object.keys(manualData).length && !await tanya(`"Ganti semua data manual" dicentang: ${fmtNum(Object.keys(manualData).length)} data kehadiran manual lain di ${ymLabel(ym)} akan DIHAPUS dan diganti isi file ini. Lanjut?`, { ya: "Ganti semua" })){ e.target.disabled = false; return; }
      const data = box.querySelector(".mf-ganti").checked ? {} : { ...lamaServer };
      ok.forEach(x => { const e = Object.fromEntries(Object.entries(x.ekstra).filter(([, v]) => v != null && !isNaN(v)));
        data[x.u.uid] = { nama: x.u.nama, hari: x.hari ?? 0, lembur: x.lembur, ...e, ...(x.uang != null ? { uangLembur: x.uang } : {}), ...(x.ket ? { ket: x.ket } : {}) }; });
      const ubahPeran = box.querySelector(".mf-peran-ok")?.checked ? ok.filter(x => x.gantiPeran) : [];
      if (ubahPeran.length){
        try{
          const bt = writeBatch(db), dipakai = new Set(ubahPeran.map(x => x.gantiPeran.id));
          const tambah = peranBaru.filter(x => dipakai.has(x.id)).map(({ id, nama, akses }) => ({ id, nama, akses }));
          if (tambah.length) bt.set(D("settings", "peran"), { daftar: [...daftarPeran, ...tambah], diubah: serverTimestamp(), oleh: profile.nama });
          ubahPeran.forEach(x => bt.update(doc(db, "users", x.u.uid), { role: x.gantiPeran.akses, peran: x.gantiPeran.id }));
          await bt.commit();
          ubahPeran.forEach(x => { x.u.role = x.gantiPeran.akses; x.u.peran = x.gantiPeran.id; });
          catatLog(CID, me.uid, profile, "karyawan", "Ganti peran " + ubahPeran.length + " karyawan dari Excel kehadiran manual" + (tambah.length ? " (peran baru: " + tambah.map(x => x.nama).join(", ") + ")" : ""));
        }catch(err){ msg(f.querySelector(".mf-msg"), "Peran gagal diganti: " + (err.code === "permission-denied" ? "hanya admin yang boleh mengganti peran." : (err.code || err.message)), "bad"); }
      }
      const ubahGaji = box.querySelector(".mf-gaji-ok")?.checked ? adaGaji : [];
      if (ubahGaji.length){
        try{
          const rwOk = await cekRiwayat(ubahGaji[0].u.uid), NG = BATCH_GAJI();
          for (let i = 0; i < ubahGaji.length; i += NG){ const bt = writeBatch(db);
            ubahGaji.slice(i, i + NG).forEach(x => { const g = { ...x.gajiF, ...(x.ekstra.potBpjs != null ? { ikutKes: false, ikutJht: false, ikutJp: false } : {}) };
              if (rwOk) salinRiwayat(bt, x.u.uid, gajiMap[x.u.uid], "Kehadiran manual: perbarui data gaji");
              bt.set(D("payroll", x.u.uid), { ...g, appVer: VERSI_APP }, { merge: true }); gajiMap[x.u.uid] = { ...(gajiMap[x.u.uid] || {}), ...g }; });
            await bt.commit(); }
          catatLog(CID, me.uid, profile, "gaji", "Perbarui data gaji " + ubahGaji.length + " karyawan dari Excel kehadiran manual " + file.name);
        }catch(err){ msg(f.querySelector(".mf-msg"), "Data gaji gagal diperbarui: " + (err.code || err.message), "bad"); }
      }
      await simpan(data, "Upload kehadiran manual " + ymLabel(ym) + " (" + ok.length + " karyawan, " + file.name + ")" + (ubahPeran.length ? ", peran " + ubahPeran.length + " diganti" : ""));
    };
  };
  muatManual(ym).then(render); render();
  f.hidden = false; popup(f, "Kehadiran manual · " + ymLabel(ym), tombol); f.closest(".modal")?.classList.add("modal-lebar");
}
// Satu tombol upload Excel di Gaji > Hitung: pilih jenis file (kehadiran operator & supir, atau data gaji karyawan)
$("#g-manual").onclick = e => {
  const tombol = e.currentTarget, ym = $("#g-bulan").value || dayKey(new Date()).slice(0, 7);
  const f = $("#upl-pilih");
  f.innerHTML = `<div class="upl-bulan"><label for="upl-ym"><b>1. Bulan data yang di-upload</b></label><input id="upl-ym" type="month" value="${esc(ym)}">
      <p class="meta">Data Excel akan disimpan untuk bulan ini. Pastikan sama dengan bulan di file Anda.</p></div>
    <p style="margin:14px 0 8px"><b>2. Jenis file Excel</b></p>
    <div class="upl-opsi">
      <button type="button" class="upl-btn" data-j="op"><b>🚜 Kehadiran manual</b><span>Operator, supir & karyawan lain yang tidak absen di aplikasi: hari kerja, jam siang, trip, lembur, uang kerajinan, BPJS, pinjaman (file OP)</span></button>
      <button type="button" class="upl-btn" data-j="kar"><b>👥 Karyawan</b><span>Data gaji: gaji pokok, uang makan, tunjangan, transport, lembur bulanan, BPJS, PPh 21, no rekening (file Karya)</span></button>
    </div>`;
  pasangPilihBulan(f);
  f.querySelectorAll(".upl-btn").forEach(b => b.onclick = () => {
    const bln = f.querySelector("#upl-ym").value;
    if (!/^\d{4}-\d{2}$/.test(bln)){ toast("Pilih bulan dulu."); return; }
    // periode Hitung ikut bulan yang dipilih (data kehadiran manual bulan itu dimuat)
    if ($("#g-bulan").value !== bln){ $("#g-bulan").value = bln; $("#g-bulan").dispatchEvent(new Event("change", { bubbles: true })); }
    f.hidden = true;
    if (b.dataset.j === "op"){ bukaManual(tombol); $("#manual-form .mf-file")?.click(); }
    else { const kp = $("#k-periode"); if (kp){ kp.value = bln; kp.dispatchEvent(new Event("change")); } bukaImportGaji(tombol); $("#kimp-form .ki-file")?.click(); }
  });
  f.hidden = false; popup(f, "Upload Excel", tombol);
};

// Pinjaman "potong manual": potongan kolom Pinjaman / Pinjaman SIO di Excel dicatat sebagai pembayaran pinjaman
// (pinjaman terlama dulu). Dipanggil setiap kali data kehadiran manual satu periode disimpan.
async function catatBayarPinjaman(ym, data){
  await muatPinjaman(true);
  const manualP = pinjamanData.filter(p => p.potong === "manual" && p.status !== "batal");
  const grup = {}, lebih = [];
  manualP.forEach(p => (grup[p.uid + "|" + (p.kolom || "pinjaman")] ||= []).push(p));
  const tulis = [];
  for (const [kunci, list] of Object.entries(grup)){
    const [uid, kolom] = kunci.split("|");
    let sisaPot = Math.max(0, Math.round(+(data[uid] || {})[kolom] || 0));
    list.sort((a, b) => (a.mulai || "").localeCompare(b.mulai || "") || (a.tanggal || "").localeCompare(b.tanggal || ""));
    for (const p of list){
      const bayar = { ...(p.bayar || {}) }; delete bayar[ym];
      let alok = 0;
      if (ym >= (p.mulai || "") && !(p.pelunasan?.cara === "tunai" && p.pelunasan.ym <= ym)){
        const sebelum = Object.entries(bayar).filter(([k]) => k < ym).reduce((t, [, v]) => t + (+v || 0), 0);
        alok = Math.min(sisaPot, Math.max(0, Math.round(+p.jumlah || 0) - sebelum));
      }
      sisaPot -= alok; if (alok > 0) bayar[ym] = alok;
      if (JSON.stringify(bayar) !== JSON.stringify(p.bayar || {})) tulis.push(updateDoc(D("pinjaman", p.id), { bayar }).then(() => { p.bayar = bayar; }));
    }
    if (sisaPot > 0) lebih.push((list[0].nama || "") + " " + KOLOM_PINJAMAN[kolom] + " " + rp(sisaPot));
  }
  await Promise.all(tulis).catch(e => toast("Sisa pinjaman belum diperbarui: " + (e.code || e.message)));
  return lebih;
}

/* ================= PINJAMAN KARYAWAN ================= */
const NAMA_JENIS_PJ = { karyawan: "Pinjaman Karyawan", sio: "Pinjaman SIO" };
const jenisPinjaman = p => p?.jenis || (p?.kolom === "pinjamanSio" ? "sio" : "karyawan");
let pinjamanData = [], pinjamanCID = "";
const ymSekarang = () => $("#g-bulan").value || (n => n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"))(new Date());
async function muatPinjaman(diam = false){
  if (!isAdmin() || !CID) return;
  try{
    const snap = await getDocs(C("pinjaman"));
    pinjamanData = snap.docs.map(d => ({ id: d.id, ...d.data() })); pinjamanCID = CID;
    if (gajiSiap && !gUsersDirty && !diam) renderUsers();
    if (!diam || $("#sub-pinjaman").classList.contains("on")) tampilPinjaman();
  }catch(e){
    pinjamanData = [];
    if (!diam) $("#pj-list").innerHTML = `<p class="meta">${e.code === "permission-denied" ? "Ditolak database. Jalankan deploy-rules.bat untuk memasang aturan pinjaman." : "Gagal memuat: " + esc(e.code || e.message)}</p>`;
  }
}
function tampilPinjaman(){
  const ym = ymSekarang(), q = $("#pj-cari").value.trim().toLowerCase(), f = $("#pj-status").value, fj = $("#pj-jenis").value;
  const bolehUid = new Set(karyawan.map(u => u.uid));
  const semua = pinjamanData.filter(p => p.status !== "batal" && (isSuper() || !Array.isArray(profile?.aksesCV) || bolehUid.has(p.uid))).map(p => ({ p, st: statusPinjaman(p, ym) }));
  const aktif = semua.filter(x => !x.st.lunas);
  const potBulanIni = semua.reduce((t, x) => t + (x.st.manual ? +((x.p.bayar || {})[ym] || 0) : angsuranPeriode([x.p], ym).reduce((a, b) => a + b.jumlah, 0)), 0);
  $("#pj-ringkas").innerHTML = `<div class="meta">Per periode gaji ${esc(ymLabel(ym))}</div>
    <div class="stat5 pj-stat">
      <div><b>${fmtNum(aktif.length)}</b><span>Pinjaman berjalan</span></div>
      <div><b>${rp(aktif.reduce((t, x) => t + x.st.sisa, 0))}</b><span>Total sisa</span></div>
      <div><b>${rp(potBulanIni)}</b><span>Dipotong periode ini</span></div>
    </div>`;
  const list = semua.filter(x => (!f || (f === "lunas" ? x.st.lunas : !x.st.lunas)) &&
    (!fj || jenisPinjaman(x.p) === fj) && (!q || [x.p.nama, x.p.ket, NAMA_JENIS_PJ[jenisPinjaman(x.p)]].some(v => String(v || "").toLowerCase().includes(q))))
    .sort((a, b) => (a.st.lunas - b.st.lunas) || (a.p.nama || "").localeCompare(b.p.nama || ""));
  if (!list.length){ $("#pj-list").innerHTML = `<p class="meta">${pinjamanData.length ? "Tidak ada pinjaman yang cocok." : "Belum ada pinjaman. Tekan ＋ Tambah pinjaman."}</p>`; return; }
  // 2 bagian: kiri = daftar nama + sisa pinjaman, kanan = rincian pinjaman nama yang diklik
  const kelompok = new Map();
  list.forEach(x => { const k = x.p.uid || ("nama:" + (x.p.nama || "")); if (!kelompok.has(k)) kelompok.set(k, []); kelompok.get(k).push(x); });
  const orang = [...kelompok.entries()].map(([k, xs]) => ({ k, nama: xs[0].p.nama || "", xs, sisa: xs.reduce((t, x) => t + x.st.sisa, 0), lunas: xs.every(x => x.st.lunas) }))
    .sort((a, b) => (a.lunas - b.lunas) || a.nama.localeCompare(b.nama));
  if (!orang.some(o => o.k === pjPilih)) pjPilih = orang[0]?.k || "";
  const kartu = ({ p, st }) => {
    const c = document.createElement("div"); c.className = "card pj-kartu" + (st.lunas ? " lunas" : "");
    const pct = Math.round(st.terbayar / (+p.jumlah || 1) * 100), ini = angsuranPeriode([p], ym)[0];
    c.innerHTML = `<div class="pj-atas"><div><b>${esc(p.nama)}</b><div class="meta"><span class="pj-jenis ${jenisPinjaman(p)}">${NAMA_JENIS_PJ[jenisPinjaman(p)]}</span>${p.ket ? " · " + esc(p.ket) : ""}</div></div>
        <span class="tag ${st.lunas ? "in" : "wait"}">${st.lunas ? (st.tunai ? "Lunas (tunai)" : "Lunas") : "Berjalan"}</span></div>
      <div class="pj-angka"><div><span>Pinjaman</span><b>${rp(p.jumlah)}</b></div>${st.manual
        ? `<div><span>Dipotong</span><b>Manual</b></div>`
        : `<div><span>Angsuran</span><b>${rp(jadwalPinjaman({ ...p, pelunasan: null })[0]?.jumlah || 0)} × ${fmtNum(jadwalPinjaman({ ...p, pelunasan: null }).length)}</b></div>`}
        <div><span>Sisa</span><b class="${st.sisa ? "" : "ok"}">${rp(st.sisa)}</b></div></div>
      <div class="pj-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <div class="meta">Terbayar ${rp(st.terbayar)} (${fmtNum(pct)}%) · ${st.manual ? (p.potong === "ketik" ? `bayar diketik di Gaji &gt; Karyawan, mulai ${esc(ymLabel(p.mulai))}` : `potong manual lewat kolom <b>${esc(KOLOM_PINJAMAN[p.kolom] || "Pinjaman")}</b> di Excel, mulai ${esc(ymLabel(p.mulai))}`) : `potong gaji ${esc(ymLabel(p.mulai))} – ${esc(ymLabel(st.akhir))}`}${p.tanggal ? " · dipinjam " + esc(tglMedium(p.tanggal)) : ""}</div>
      ${!st.lunas ? `<div class="meta pj-berikut">${st.manual ? ((p.bayar || {})[ym] ? "Periode ini dipotong <b>" + rp(p.bayar[ym]) + "</b>" + (p.potong === "ketik" ? "" : " (dari Excel)") : p.potong === "ketik" ? "Periode ini belum diisi di Gaji > Karyawan" : "Periode ini belum ada potongan dari Excel") : ini ? "Periode ini dipotong <b>" + rp(ini.jumlah) + "</b>" : st.berikut ? "Potongan berikutnya " + esc(ymLabel(st.berikut.ym)) + ": <b>" + rp(st.berikut.jumlah) + "</b>" : ""}</div>` : ""}
      <div class="btns3 pj-aksi"><button class="small alt pj-jadwal">Jadwal</button>${st.lunas ? "" : '<button class="small alt pj-lunas">Pelunasan</button>'}
        <button class="small alt pj-edit">Edit</button><button class="small alt pj-hapus">Hapus</button></div>`;
    c.querySelector(".pj-jadwal").onclick = e => jadwalPopup(p, e.currentTarget);
    c.querySelector(".pj-edit").onclick = e => formPinjaman(p, e.currentTarget);
    c.querySelector(".pj-lunas")?.addEventListener("click", e => pelunasanPopup(p, e.currentTarget));
    c.querySelector(".pj-hapus").onclick = async () => {
      if (!await tanya("Hapus pinjaman " + p.nama + " " + rp(p.jumlah) + "? Angsurannya tidak akan dipotong lagi. Slip yang sudah disimpan tidak berubah.", { ya: "Hapus" })) return;
      try{ await deleteDoc(D("pinjaman", p.id)); catatLog(CID, me.uid, profile, "gaji", "Menghapus pinjaman " + p.nama + " " + rp(p.jumlah)); toast("Pinjaman dihapus."); muatPinjaman(); }
      catch(err){ toast("Gagal: " + (err.code || err.message)); }
    };
    // rincian: jadwal angsuran langsung tampil (tanpa popup)
    const manualPJ = st.manual, jd = manualPJ ? statusPinjaman(p, "9999-12").jadwal : jadwalPinjaman(p);
    const tb = document.createElement("div"); tb.className = "tablewrap pj-jadwal-inline";
    tb.innerHTML = jd.length ? `<table class="pj-tbl"><tr><th>Ke</th><th>Periode gaji</th><th>${manualPJ ? "Dipotong" : "Angsuran"}</th><th>Sisa</th><th></th></tr>${jd.map(a =>
      `<tr${a.ym === ym ? ' class="ini"' : ""}><td>${a.pelunasan ? "Lunas" : a.ke}</td><td>${esc(ymLabel(a.ym))}</td><td>${rp(a.jumlah)}</td><td>${rp(a.sisa)}</td><td>${a.ym < ym ? "✓" : a.ym === ym ? "periode ini" : ""}</td></tr>`).join("")}</table>` : '<p class="meta">Belum ada potongan.</p>';
    c.querySelector(".pj-aksi").before(tb); c.querySelector(".pj-jadwal")?.remove();
    return c;
  };
  const kiri = document.createElement("div"); kiri.className = "pj-daftar card";
  kiri.innerHTML = `<div class="pj-dk-judul"><span>Karyawan</span><span>Sisa pinjaman</span></div>` + orang.map(o =>
    `<button type="button" class="pj-orang${o.k === pjPilih ? " aktif" : ""}${o.lunas ? " lunas" : ""}" data-k="${esc(o.k)}"><span class="pj-nm">${esc(o.nama)}${o.xs.length > 1 ? ` <small>(${o.xs.length} pinjaman)</small>` : ""}</span><b>${o.lunas ? "Lunas" : rp(o.sisa)}</b></button>`).join("")
    + `<div class="pj-dk-total"><span>Total sisa</span><b>${rp(orang.reduce((t, o) => t + o.sisa, 0))}</b></div>`;
  const kanan = document.createElement("div"); kanan.className = "pj-rinci";
  const tampilRinci = () => { const o = orang.find(x => x.k === pjPilih); kanan.replaceChildren(...(o ? [Object.assign(document.createElement("h3"), { className: "pj-rinci-judul", textContent: o.nama + " · sisa " + (o.lunas ? "lunas" : rp(o.sisa)) }), ...o.xs.map(kartu)] : [])); };
  kiri.querySelectorAll(".pj-orang").forEach(btn => btn.onclick = () => {
    pjPilih = btn.dataset.k; kiri.querySelectorAll(".pj-orang").forEach(x => x.classList.toggle("aktif", x === btn)); tampilRinci();
    if (matchMedia("(max-width: 899px)").matches) kanan.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  tampilRinci();
  const wrap = document.createElement("div"); wrap.className = "pj-2kolom"; wrap.append(kiri, kanan);
  $("#pj-list").replaceChildren(wrap);
}
let pjPilih = "";
function jadwalPopup(p, tombol){
  const manualPJ = p.potong === "manual" || p.potong === "ketik";
  const ym = ymSekarang(), jd = manualPJ ? statusPinjaman(p, "9999-12").jadwal : jadwalPinjaman(p);
  const box = document.createElement("div");
  box.innerHTML = `<p class="meta" style="margin-top:0">${esc(p.nama)} · pinjaman ${rp(p.jumlah)}${p.ket ? " · " + esc(p.ket) : ""}</p>
    ${p.potong === "manual" ? `<p class="meta">Riwayat potongan dari kolom <b>${esc(KOLOM_PINJAMAN[p.kolom] || "Pinjaman")}</b> di upload Excel kehadiran manual.</p>` : ""}
    ${p.potong === "ketik" ? `<p class="meta">Riwayat bayar yang diketik di Gaji &gt; Karyawan.</p>` : ""}
    ${manualPJ && !jd.length ? '<p class="meta">Belum ada potongan.</p>' : ""}
    <div class="tablewrap"><table class="pj-tbl"><tr><th>Ke</th><th>Periode gaji</th><th>${manualPJ ? "Dipotong" : "Angsuran"}</th><th>Sisa</th><th></th></tr>${jd.map(a =>
      `<tr${a.ym === ym ? ' class="ini"' : ""}><td>${a.pelunasan ? "Lunas" : a.ke}</td><td>${esc(ymLabel(a.ym))}</td><td>${rp(a.jumlah)}</td><td>${rp(a.sisa)}</td>
      <td>${a.ym < ym ? "✓" : a.ym === ym ? "periode ini" : ""}</td></tr>`).join("")}</table></div>
    ${p.pelunasan?.cara === "tunai" ? `<p class="meta">Dilunasi tunai pada periode ${esc(ymLabel(p.pelunasan.ym))}.</p>` : ""}
    <div class="btns" style="margin-top:10px"><button type="button" class="small alt pj-tutup">Tutup</button></div>`;
  document.body.append(box);
  box.querySelector(".pj-tutup").onclick = () => { box.hidden = true; };
  new MutationObserver((_, o) => { if (box.hidden){ o.disconnect(); box.remove(); } }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  popup(box, "Jadwal angsuran", tombol);
}
function pelunasanPopup(p, tombol){
  const ym = ymSekarang(), st = statusPinjaman(p, ymTambah(ym, -1));
  const box = document.createElement("div");
  box.innerHTML = `<p class="meta" style="margin-top:0">${esc(p.nama)} · sisa sebelum periode ${esc(ymLabel(ym))}: <b>${rp(st.sisa)}</b></p>
    <label>Periode pelunasan</label><input type="month" class="pl-ym" value="${ym}">
    <label>Cara</label><select class="pl-cara">${p.potong === "manual" || p.potong === "ketik" ? "" : '<option value="gaji">Potong gaji periode tersebut (seluruh sisa)</option>'}<option value="tunai">Dibayar tunai (tidak dipotong gaji lagi)</option></select>
    <p class="msg pl-msg"></p>
    <div class="btns" style="margin-top:10px"><button type="button" class="small pl-simpan">Simpan pelunasan</button>${p.pelunasan ? '<button type="button" class="small alt pl-batal-lunas">Batalkan pelunasan</button>' : ""}<button type="button" class="small alt pl-tutup">Tutup</button></div>`;
  document.body.append(box);
  box.querySelector(".pl-tutup").onclick = () => { box.hidden = true; };
  new MutationObserver((_, o) => { if (box.hidden){ o.disconnect(); box.remove(); } }).observe(box, { attributes: true, attributeFilter: ["hidden"] });
  const simpan = async (data, teks) => {
    try{ await updateDoc(D("pinjaman", p.id), { pelunasan: data, diubahOleh: profile.nama, diubahPada: serverTimestamp() });
      catatLog(CID, me.uid, profile, "gaji", teks); toast(teks); box.hidden = true; muatPinjaman(); }
    catch(err){ msg(box.querySelector(".pl-msg"), err.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat." : "Gagal: " + (err.code || err.message), "bad"); }
  };
  box.querySelector(".pl-simpan").onclick = () => {
    const v = box.querySelector(".pl-ym").value, cara = box.querySelector(".pl-cara").value;
    if (!v){ msg(box.querySelector(".pl-msg"), "Pilih periode pelunasan.", "bad"); return; }
    if (v < p.mulai){ msg(box.querySelector(".pl-msg"), "Periode pelunasan tidak boleh sebelum potongan pertama (" + ymLabel(p.mulai) + ").", "bad"); return; }
    simpan({ ym: v, cara }, "Pelunasan pinjaman " + p.nama + " (" + (cara === "gaji" ? "potong gaji " : "tunai ") + ymLabel(v) + ")");
  };
  box.querySelector(".pl-batal-lunas")?.addEventListener("click", () => simpan(null, "Membatalkan pelunasan pinjaman " + p.nama));
  popup(box, "Pelunasan pinjaman", tombol);
}
function formPinjaman(p, tombol){
  const f = $("#pj-form"), baru = !p;
  if (!karyawan.length){ toast("Data karyawan belum dimuat. Buka tab Hitung atau Karyawan dulu."); return; }
  const ymAwal = p?.mulai || ymTambah(ymSekarang(), 1);
  const n = new Date(), hariIni = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  f.innerHTML = `<label>Karyawan</label><select class="pf-uid" ${baru ? "" : "disabled"}>${karyawan.map(u => `<option value="${esc(u.uid)}"${p?.uid === u.uid ? " selected" : ""}>${esc(u.nama)}</option>`).join("")}</select>
    <div class="grid2 pf-atas">
      <div><label>Jenis pinjaman</label><select class="pf-jenis">
        <option value="karyawan" ${jenisPinjaman(p) !== "sio" ? "selected" : ""}>Pinjaman Karyawan</option>
        <option value="sio" ${jenisPinjaman(p) === "sio" ? "selected" : ""}>Pinjaman SIO</option></select></div>
      <div><label>Cara potong</label><select class="pf-potong">
        <option value="otomatis" ${p?.potong !== "manual" ? "selected" : ""}>Otomatis (angsuran tetap)</option>
        <option value="ketik" ${p?.potong === "ketik" ? "selected" : ""}>Manual (ketik di Gaji &gt; Karyawan)</option>
        <option value="manual" ${p?.potong === "manual" ? "selected" : ""}>Manual dari Excel</option></select></div>
    </div>
    <div class="grid2">
      <div><label>Jumlah pinjaman (Rp)</label><input class="pf-jumlah" data-num="int" inputmode="numeric" value="${p ? fmtNum(p.jumlah) : ""}" placeholder="mis. 3.000.000"></div>
      <div class="pf-otomatis"><label>Lama cicilan (bulan)</label><input class="pf-tenor" inputmode="numeric" value="${p?.potong === "manual" || p?.potong === "ketik" ? "" : p?.tenor || ""}" placeholder="mis. 6"></div>
    </div>
    <div class="grid2">
      <div class="pf-otomatis"><label>Angsuran per bulan (Rp)</label><input class="pf-angsuran" data-num="int" inputmode="numeric" value="${p?.angsuran ? fmtNum(p.angsuran) : ""}" placeholder="otomatis"></div>
      <div><label class="pf-lbl-mulai">Mulai potong gaji</label><input class="pf-mulai" type="month" value="${ymAwal}"></div>
    </div>
    <div class="grid2">
      <div><label>Tanggal pinjam</label><input class="pf-tgl" type="date" value="${p?.tanggal || hariIni}"></div>
      <div><label>Keterangan</label><input class="pf-ket" maxlength="60" value="${esc(p?.ket || "")}" placeholder="mis. kasbon, biaya sekolah"></div>
    </div>
    <p class="meta pf-info"></p>
    <p class="msg pf-msg"></p>
    <div class="btns" style="margin-top:10px"><button type="button" class="small pf-simpan">${baru ? "Simpan pinjaman" : "Simpan perubahan"}</button><button type="button" class="small alt pf-batal">Batal</button></div>`;
  const kolomDariJenis = () => f.querySelector(".pf-jenis").value === "sio" ? "pinjamanSio" : "pinjaman";
  const caraPotong = () => { const v = f.querySelector(".pf-potong").value; return v === "manual" ? "manual:" + kolomDariJenis() : v; };
  const nilai = () => {
    const manualP = caraPotong() !== "otomatis";
    const jumlah = parseInt0(f.querySelector(".pf-jumlah").value), tenor = manualP ? 1 : parseInt(f.querySelector(".pf-tenor").value, 10) || 0;
    let ang = parseInt0(f.querySelector(".pf-angsuran").value);
    const otomatis = jumlah && tenor ? Math.ceil(jumlah / tenor / 1000) * 1000 : 0;
    return { jumlah, tenor, ang: ang || otomatis, otomatis, mulai: f.querySelector(".pf-mulai").value };
  };
  const info = () => {
    const v = nilai(), el = f.querySelector(".pf-info"), manualP = caraPotong() !== "otomatis";
    f.querySelectorAll(".pf-otomatis").forEach(x => x.hidden = manualP);
    if (caraPotong() === "ketik"){ el.innerHTML = "Tidak dipotong otomatis. Ketik jumlah bayar tiap periode di <b>Gaji &gt; Karyawan</b> (bagian Pinjaman di kartu karyawan), lalu <b>Simpan gaji</b>; sisa pinjaman berkurang sesuai yang diketik."; return; }
    if (manualP){ el.innerHTML = `Tidak dipotong otomatis. Isi potongan tiap bulan di kolom <b>${esc(KOLOM_PINJAMAN[caraPotong().split(":")[1]])}</b> pada Excel kehadiran manual; sisa pinjaman berkurang otomatis setelah Excel di-upload.`; return; }
    f.querySelector(".pf-angsuran").placeholder = v.otomatis ? "otomatis: " + fmtNum(v.otomatis) : "otomatis";
    if (!v.jumlah || !v.tenor || !v.mulai){ el.textContent = "Isi jumlah, lama cicilan, dan periode mulai."; return; }
    const jd = jadwalPinjaman({ jumlah: v.jumlah, tenor: v.tenor, angsuran: v.ang, mulai: v.mulai });
    const akhir = jd.at(-1);
    const sama = akhir.jumlah === jd[0].jumlah;
    el.innerHTML = `Dipotong <b>${rp(jd[0].jumlah)}</b> × ${fmtNum(sama ? jd.length : jd.length - 1)} bulan${!sama ? ` + terakhir <b>${rp(akhir.jumlah)}</b>` : ""}, mulai gaji ${esc(ymLabel(v.mulai))} sampai ${esc(ymLabel(akhir.ym))}.` +
      (v.ang * v.tenor < v.jumlah ? ` <span style="color:var(--bad)">Angsuran terlalu kecil untuk ${fmtNum(v.tenor)} bulan; bulan terakhir menanggung sisanya.</span>` : "");
  };
  f.querySelectorAll("input").forEach(x => x.addEventListener("input", info)); f.querySelector(".pf-mulai").onchange = info; f.querySelector(".pf-potong").onchange = f.querySelector(".pf-jenis").onchange = info; info();
  f.querySelector(".pf-batal").onclick = () => { f.hidden = true; };
  f.querySelector(".pf-simpan").onclick = async e => {
    const v = nilai(), m = f.querySelector(".pf-msg");
    if (v.jumlah <= 0){ msg(m, "Isi jumlah pinjaman.", "bad"); return; }
    if (v.tenor < 1 || v.tenor > 120){ msg(m, "Lama cicilan 1 sampai 120 bulan.", "bad"); return; }
    if (!v.mulai){ msg(m, "Pilih periode mulai potong gaji.", "bad"); return; }
    const uid = baru ? f.querySelector(".pf-uid").value : p.uid, u = karyawan.find(x => x.uid === uid);
    const [cara, kolomP] = caraPotong().split(":");
    const data = { uid, nama: u?.nama || p?.nama || "", jumlah: v.jumlah, tenor: v.tenor, angsuran: cara === "otomatis" ? v.ang : 0, mulai: v.mulai,
      potong: cara, jenis: f.querySelector(".pf-jenis").value, kolom: kolomDariJenis(),
      tanggal: f.querySelector(".pf-tgl").value || "", ket: f.querySelector(".pf-ket").value.trim(), status: "aktif",
      ...(baru ? { dibuat: serverTimestamp(), oleh: profile.nama } : { diubahOleh: profile.nama, diubahPada: serverTimestamp() }) };
    e.target.disabled = true;
    try{
      if (baru) await setDoc(doc(C("pinjaman")), data); else await updateDoc(D("pinjaman", p.id), data);
      catatLog(CID, me.uid, profile, "gaji", (baru ? "Mencatat pinjaman " : "Mengubah pinjaman ") + data.nama + " " + rp(v.jumlah) + " [" + NAMA_JENIS_PJ[jenisPinjaman(data)] + "]" + (cara === "manual" ? " (potong manual, kolom " + KOLOM_PINJAMAN[kolomP] + ")" : cara === "ketik" ? " (bayar diketik di Gaji > Karyawan)" : " × " + v.tenor + " bulan") + " mulai " + ymLabel(v.mulai));
      f.hidden = true; toast((baru ? "Pinjaman dicatat: " : "Pinjaman diubah: ") + data.nama + " " + rp(v.jumlah)); muatPinjaman();
    }catch(err){ msg(m, err.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat untuk memasang aturan pinjaman." : "Gagal: " + (err.code || err.message), "bad"); e.target.disabled = false; }
  };
  f.hidden = false;
  popup(f, baru ? "Tambah pinjaman" : "Edit pinjaman · " + p.nama, tombol);
}
$("#pj-tambah").onclick = e => formPinjaman(null, e.currentTarget);
$("#pj-cari").oninput = tampilPinjaman;
$("#pj-status").onchange = tampilPinjaman;
$("#pj-jenis").onchange = tampilPinjaman;

/* tombol Keluar di samping tulisan "Absensi Hadir" (sidebar) */
$("#logout-nav").onclick = async e => {
  e.stopPropagation();
  if (await tanya("Keluar dari dashboard?", { ya: "Keluar" })) $("#logout").click();
};

/* ---------- warna pastel acak (dashboard admin, tema terang) ---------- */
const JUMLAH_WARNA = 6;
let warnaAwal = Math.floor(Math.random() * JUMLAH_WARNA), warnaKe = 0;
function warnai(){
  document.querySelectorAll(".card:not([data-tint]), .row:not([data-tint]), .tablewrap:not([data-tint]), .lok-card:not([data-tint])")
    .forEach(el => { el.dataset.tint = (warnaAwal + warnaKe++) % JUMLAH_WARNA; });
}
function terapkanWarnaAcak(){
  const h = document.documentElement, t = h.getAttribute("data-theme");
  const gelap = t === "dark" || (!t && matchMedia("(prefers-color-scheme: dark)").matches);
  h.classList.toggle("tint-on", !gelap);
  h.dataset.latar = String(warnaAwal);
}
new MutationObserver(warnai).observe(document.body, { childList: true, subtree: true });
warnai(); terapkanWarnaAcak();
$("#tema-pilih").addEventListener("change", () => setTimeout(terapkanWarnaAcak));
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", terapkanWarnaAcak);
$("#acak-warna").onclick = () => {
  let baru; do { baru = Math.floor(Math.random() * JUMLAH_WARNA); } while (baru === warnaAwal);
  warnaAwal = baru; warnaKe = 0;
  document.querySelectorAll("[data-tint]").forEach(el => delete el.dataset.tint);
  warnai(); terapkanWarnaAcak();
};

/* catatan akun demo di halaman login: ketuk untuk mengisi otomatis */
$("#isi-demo").onclick = () => { $("#f-user").value = "Demo01"; $("#f-pass").value = "Demo01"; $("#f-go").focus(); };

/* Mode kios ditampilkan atau tidak: hanya superadmin yang mengatur (per perusahaan) */
function terapkanKios(){
  const on = perusahaan?.kiosAktif !== false, boleh = bolehMenu("kios");
  document.querySelectorAll(".nav-kios").forEach(a => a.hidden = !on || !boleh);
  $("#kios-judul").hidden = $("#kios-row").hidden = (!on || !boleh) && !isSuper();
  $("#kios-tampil-wrap").hidden = !isSuper(); $("#kios-tampil").checked = on;
  $("#kios-isi").hidden = !on; $("#kios-sah-wrap").hidden = !on;
}
$("#kios-tampil").onchange = async e => {
  const on = e.target.checked; e.target.disabled = true;
  try{
    await updateDoc(doc(db, "companies", CID), { kiosAktif: on });
    perusahaan = { ...(perusahaan || {}), kiosAktif: on }; terapkanKios();
    catatLog(CID, me.uid, profile, "pengaturan", (on ? "Menampilkan" : "Menyembunyikan") + " mode kios");
    toast("Mode kios " + (on ? "ditampilkan." : "disembunyikan untuk admin & supervisor."));
  }catch(err){ e.target.checked = !on; toast("Gagal: " + (err.code === "permission-denied" ? "hanya superadmin" : err.code)); }
  e.target.disabled = false;
};
/* link mode kios: tampil lengkap + salin */
{
  const url = location.origin + "/kios";
  $("#kios-url").textContent = url;
  $("#kios-salin").onclick = async () => {
    try{ await navigator.clipboard.writeText(url); toast("Link kios disalin: " + url); }
    catch(e){ prompt("Salin link kios ini:", url); }
  };
}

/* ===================== BACKUP DATA (khusus admin) ===================== */
// Untuk saat ini backup data khusus superadmin
const tampilkanBackup = () => { $("#backup-wrap").hidden = !isSuper() || !CID; };
/* ---------- BackUp / Auto BackUp / Restore (server, Firebase Storage backup/{cid}/) ---------- */
const bkAksi = async data => (await httpsCallable(fns, "backupAksi", { timeout: 540000 })({ cid: CID, ...data })).data;
const BK_JENIS = { otomatis: "Auto BackUp", manual: "BackUp manual", "sebelum-restore": "Sebelum restore", unggah: "File unggahan" };
const BK_BAGIAN = [["payroll", "Data gaji karyawan (gaji pokok, U Makan, tunjangan, BPJS, …)", true], ["settings", "Aturan gaji & pengaturan perusahaan", true],
  ["kehadiranManual", "Kehadiran manual (operator, supir)", true], ["pinjaman", "Pinjaman", true], ["slips", "Slip gaji tersimpan", false],
  ["pajak", "Pajak & BPJS (kertas kerja)", false], ["lembur", "Lembur & Lebih HK (koreksi admin)", false], ["absensi", "Absensi", false],
  ["izin", "Izin, sakit, cuti", false], ["users", "Data karyawan & akun (nama, peran, jabatan, …)", false]];
const ringkasJml = j => Object.entries(j || {}).filter(([k]) => ["users", "payroll", "absensi", "kehadiranManual", "slips"].includes(k))
  .map(([k, v]) => ({ users: "karyawan", payroll: "gaji", absensi: "absen", kehadiranManual: "manual", slips: "slip" })[k] + " " + fmtNum(v)).join(" · ");
const errBk = e => /not-found|internal/.test(e.code || "") && !e.details ? "Fungsi backup belum terpasang — jalankan deploy-functions.bat dulu." : (e.message || e.code);
async function tampilDaftarBackup(tombol){
  const box = document.createElement("div"); box.className = "manual-form bk-histori";
  box.innerHTML = '<p class="meta">Memuat histori backup…</p>'; document.body.append(box);
  popup(box, "Histori BackUp", tombol); box.closest(".modal")?.classList.add("modal-bk");
  try{
    const { files } = await bkAksi({ aksi: "daftar" });
    box.innerHTML = files.length ? `<p class="meta" style="margin:6px 0 0">${files.length} dari maks. 30 backup · yang paling lama terhapus otomatis saat ada backup baru.</p><div class="tablewrap" style="margin-top:8px"><table class="mf-tbl"><tr><th>Waktu</th><th>Jenis</th><th>Isi</th><th class="num">Ukuran</th><th></th></tr>
      ${files.map((f, i) => `<tr><td>${esc(new Date(f.waktu).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }))}</td>
        <td>${esc(BK_JENIS[f.jenis] || f.jenis)}<small>${esc(f.oleh || "")}</small></td><td><small>${esc(ringkasJml(f.jumlah))}</small></td>
        <td class="num">${fmtNum(Math.max(1, Math.round(f.ukuran / 1024)))} KB</td>
        <td style="white-space:nowrap"><button type="button" class="small alt bk-unduh" data-i="${i}">⬇ Unduh</button> <button type="button" class="small alt bk-pulih" data-i="${i}">↩ Restore</button></td></tr>`).join("")}</table></div>`
      : '<p class="meta">Belum ada backup. Auto BackUp pertama dibuat malam ini jam 23:00, atau klik 💾 BackUp sekarang.</p>';
    box.querySelectorAll(".bk-unduh").forEach(b => b.onclick = async () => { b.disabled = true;
      try{ const { url } = await bkAksi({ aksi: "unduh", file: files[+b.dataset.i].nama }); const a = document.createElement("a"); a.href = url; a.download = files[+b.dataset.i].nama.split("/").pop(); document.body.append(a); a.click(); a.remove(); }
      catch(e){ toast("Gagal unduh: " + errBk(e)); } b.disabled = false; });
    box.querySelectorAll(".bk-pulih").forEach(b => b.onclick = () => bukaRestore(files[+b.dataset.i], b));
  }catch(e){ box.innerHTML = '<p class="msg bad">Gagal memuat: ' + esc(errBk(e)) + '</p>'; }
}
function bukaRestore(f, tombol){
  const form = $("#bk-form");
  form.innerHTML = `<p class="meta" style="margin-top:0">Restore dari <b>${esc(BK_JENIS[f.jenis] || f.jenis)}</b> · ${esc(new Date(f.waktu).toLocaleString("id-ID"))}${f.jumlah ? " · " + esc(ringkasJml(f.jumlah)) : ""}</p>
    <p class="meta">Pilih data yang dikembalikan (data lain tidak diubah). Kondisi data sekarang <b>dicadangkan dulu otomatis</b> ("Sebelum restore"), jadi Restore bisa dibatalkan dengan me-restore cadangan itu.</p>
    ${BK_BAGIAN.map(([k, l, on]) => `<label class="check"><input type="checkbox" class="bk-b" value="${k}" ${on ? "checked" : ""}> ${esc(l)}</label>`).join("")}
    <div class="btns" style="margin-top:12px"><button type="button" class="small bk-jalan">↩ Restore sekarang</button><button type="button" class="small alt bk-batal">Batal</button></div>
    <p class="msg bk-m"></p>`;
  form.querySelector(".bk-batal").onclick = () => { form.hidden = true; };
  form.querySelector(".bk-jalan").onclick = async e => {
    const bagian = [...form.querySelectorAll(".bk-b:checked")].map(x => x.value); if (!bagian.length){ msg(form.querySelector(".bk-m"), "Pilih minimal satu data.", "bad"); return; }
    if (!await tanya("Restore " + bagian.length + " jenis data dari backup ini? Data sekarang untuk bagian itu akan DIGANTI (dicadangkan dulu).", { ya: "Restore" })) return;
    e.target.disabled = true; msg(form.querySelector(".bk-m"), "Me-restore… jangan tutup halaman (bisa 1–3 menit).");
    try{
      const r = await bkAksi({ aksi: "restore", file: f.nama, bagian });
      msg(form.querySelector(".bk-m"), "Restore selesai: " + Object.entries(r.jumlah).map(([k, v]) => k + " " + fmtNum(v)).join(", ") + ". Halaman dimuat ulang…", "ok");
      setTimeout(() => location.reload(), 2500);
    }catch(err){ msg(form.querySelector(".bk-m"), "Gagal: " + errBk(err), "bad"); e.target.disabled = false; }
  };
  form.hidden = false; popup(form, "Restore data", tombol);
}
$("#bk-buat").onclick = async e => { const b = e.currentTarget; b.disabled = true; msg($("#backup-msg"), "");
  try{ await jalankanBackupManual(); } finally { b.disabled = false; } };
$("#bk-daftar").onclick = e => tampilDaftarBackup(e.currentTarget);
// proses BackUp manual ditampilkan di tengah layar sampai selesai
async function jalankanBackupManual(){
  const ov = document.createElement("div"); ov.className = "bk-proses"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-live", "polite");
  ov.innerHTML = `<div class="bk-kotak"><div class="bk-spin" aria-hidden="true"></div><b class="bk-jdl">Membuat BackUp…</b>
    <p class="meta bk-ket">Menyalin semua data perusahaan ke server. Jangan tutup halaman ini.</p><p class="bk-waktu">0 detik</p>
    <button type="button" class="small bk-tutup" hidden>Tutup</button></div>`;
  document.body.append(ov);
  const mulai = Date.now(), t = setInterval(() => { ov.querySelector(".bk-waktu").textContent = Math.round((Date.now() - mulai) / 1000) + " detik"; }, 1000);
  const selesai = (ok, teks) => {
    clearInterval(t); ov.classList.add(ok ? "ok" : "gagal");
    ov.querySelector(".bk-spin").textContent = ok ? "✓" : "!";
    ov.querySelector(".bk-jdl").textContent = ok ? "BackUp selesai" : "BackUp gagal";
    ov.querySelector(".bk-ket").textContent = teks;
    const tb = ov.querySelector(".bk-tutup"); tb.hidden = false; tb.focus(); tb.onclick = () => ov.remove();
  };
  try{ const r = await bkAksi({ aksi: "buat" });
    selesai(true, "Tersimpan di server: " + ringkasJml(r.jumlah) + "." + (isSuper() ? " Lihat di Pengaturan › 🕘 Histori BackUp." : "")); return r; }
  catch(err){ selesai(false, errBk(err)); }
}
// tombol BackUp manual di menu samping (di bawah Mode kios)
$("#nav-bk").onclick = async e => {
  const b = e.currentTarget; if (!CID) return;
  if (!await tanya("Buat BackUp manual seluruh data perusahaan sekarang?", { ya: "BackUp" })) return;
  b.disabled = true; try{ await jalankanBackupManual(); } finally { b.disabled = false; }
};
// ---- pulihkan karyawan yang terhapus dari backup ----
$("#bk-akun").onclick = async e => {
  const tombol = e.currentTarget, box = document.createElement("div"); box.className = "manual-form bk-histori";
  box.innerHTML = '<p class="meta">Mencari akun yang terhapus di backup… (bisa 1 menit)</p>'; document.body.append(box);
  popup(box, "Pulihkan karyawan terhapus", tombol); box.closest(".modal")?.classList.add("modal-bk");
  try{
    const { akun } = await bkAksi({ aksi: "terhapus" });
    if (!akun.length){ box.innerHTML = '<p class="meta">Tidak ada akun terhapus yang ditemukan di 30 backup terakhir.</p>'; return; }
    box.innerHTML = `<p class="meta" style="margin:6px 0 0">Akun yang ada di backup tapi sudah tidak ada sekarang. Akun dipulihkan dengan <b>ID yang sama</b>, jadi data absen, gaji & HP-nya tersambung lagi. Password diganti dengan password baru.</p>
      <div class="tablewrap" style="margin-top:8px"><table class="mf-tbl"><tr><th>Nama</th><th>Backup</th><th class="num">Absen di backup</th><th class="num">Absen masih ada</th><th></th></tr>
      ${akun.map((a, i) => `<tr><td><b>${esc(a.nama)}</b><small>@${esc(a.username)}</small></td><td><small>${esc(new Date(a.waktu).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }))}</small></td>
        <td class="num">${fmtNum(a.absen)}</td><td class="num">${fmtNum(a.absenSekarang)}</td><td><button type="button" class="small bk-pa" data-i="${i}">↩ Pulihkan</button></td></tr>`).join("")}</table></div>
      <div class="bk-pa-form" hidden style="margin-top:12px"></div>`;
    box.querySelectorAll(".bk-pa").forEach(b => b.onclick = () => {
      const a = akun[+b.dataset.i], f = box.querySelector(".bk-pa-form"); f.hidden = false;
      f.innerHTML = `<b>Pulihkan ${esc(a.nama)} (@${esc(a.username)})</b>
        <label style="margin-top:8px">Password baru untuk login</label>
        <div class="pass"><input class="pa-pass" type="password" autocomplete="new-password" placeholder="minimal 6 karakter">
          <button type="button" class="eye pa-eye" aria-label="Tampilkan password"></button></div>
        <div class="btns" style="margin-top:10px"><button type="button" class="small pa-jalan">↩ Pulihkan akun sekarang</button></div><p class="msg pa-m"></p>
        <hr style="margin:14px 0;border:0;border-top:1px solid var(--line)">
        <b>Atau: pindahkan data absen ${esc(a.nama)} ke akun yang masih ada</b>
        <p class="meta" style="margin:4px 0 8px">Data absen, izin & lembur akun terhapus ini digabungkan ke akun yang dipilih (mis. akun yang sekarang dipakai). Akun terhapus tidak dibuat ulang.</p>
        <select class="pd-ke"><option value="">— pilih akun tujuan —</option>${pengguna.filter(u => u.aktif !== false && u.role !== "superadmin").map(u =>
          `<option value="${esc(u.id)}" ${String(u.nama || "").toLowerCase().split(" ")[0] === String(a.nama || "").toLowerCase().split(" ")[0] ? "selected" : ""}>${esc(u.nama)} (@${esc(u.username || "")})</option>`).join("")}</select>
        <div class="btns" style="margin-top:10px"><button type="button" class="small alt pd-jalan">⇢ Pindahkan data absen</button></div><p class="msg pd-m"></p>`;
      f.querySelector(".pd-jalan").onclick = async ev => {
        const ke = f.querySelector(".pd-ke").value, mm = f.querySelector(".pd-m"), tj = pengguna.find(u => u.id === ke);
        if (!tj){ msg(mm, "Pilih akun tujuan.", "bad"); return; }
        if (!await tanya(`Pindahkan semua data absen ${a.nama} (@${a.username}) ke ${tj.nama} (@${tj.username || ""})?`, { ya: "Pindahkan" })) return;
        ev.target.disabled = true; msg(mm, "Memindahkan…");
        try{
          const r = await bkAksi({ aksi: "pindahData", file: a.file, uid: a.uid, keUid: ke });
          msg(mm, `✓ Data dipindahkan ke ${r.nama} (@${r.username}): absen ${fmtNum(r.jumlah.absensi)}, izin ${r.jumlah.izin}, lembur ${r.jumlah.lembur}.`, "ok");
        }catch(err){ msg(mm, "Gagal: " + errBk(err), "bad"); ev.target.disabled = false; }
      };
      pasangMata(f.querySelector(".pa-eye"), f.querySelector(".pa-pass")); f.querySelector(".pa-pass").focus();
      f.querySelector(".pa-jalan").onclick = async ev => {
        const pass = f.querySelector(".pa-pass").value, mm = f.querySelector(".pa-m");
        if (pass.length < 6){ msg(mm, "Password minimal 6 karakter.", "bad"); return; }
        ev.target.disabled = true; msg(mm, "Memulihkan…");
        try{
          const r = await bkAksi({ aksi: "pulihkanAkun", file: a.file, uid: a.uid, password: pass });
          msg(mm, `✓ ${r.nama} (@${r.username}) dipulihkan. Data dikembalikan: absen ${r.jumlah.absensi}, izin ${r.jumlah.izin}, slip ${r.jumlah.slips}. Login dengan password baru.`, "ok");
          b.disabled = true; b.textContent = "✓ Dipulihkan";
        }catch(err){ msg(mm, "Gagal: " + errBk(err), "bad"); ev.target.disabled = false; }
      };
    });
  }catch(err){ box.innerHTML = '<p class="msg bad">Gagal: ' + esc(errBk(err)) + '</p>'; }
};
$("#bk-restore-file").onclick = () => $("#bk-file").click();
$("#bk-file").onchange = async e => {
  const fl = e.target.files[0]; e.target.value = ""; if (!fl) return;
  const m = $("#backup-msg"); msg(m, "Mengunggah file backup…");
  try{
    const path = `backup/${CID}/unggah-${Date.now()}.json${/\.gz$/i.test(fl.name) ? ".gz" : ""}`;
    await unggahB(sRefB(storageB, path), fl, { contentType: /\.gz$/i.test(fl.name) ? "application/gzip" : "application/json" });
    msg(m, ""); bukaRestore({ nama: path, jenis: "unggah", waktu: new Date().toISOString() }, $("#bk-restore-file"));
  }catch(err){ msg(m, "Gagal mengunggah: " + (err.code === "storage/unauthorized" ? "aturan Storage belum diperbarui — jalankan deploy-rules.bat." : err.message || err.code), "bad"); }
};
setInterval(tampilkanBackup, 2000); tampilkanBackup();

// Ubah nilai Firestore menjadi bentuk yang bisa disimpan: Timestamp -> teks tanggal
function siapBackup(v){
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(siapBackup);
  if (v && typeof v === "object"){ const o = {}; for (const [k, x] of Object.entries(v)) o[k] = siapBackup(x); return o; }
  return v;
}
async function ambilSemuaData(){
  const ambil = async (q, label) => {
    try{ return (await getDocs(q)).docs.map(d => ({ id: d.id, ...siapBackup(d.data()) })); }
    catch(e){ console.warn("Backup: " + label + " tidak terbaca", e.code); return []; }
  };
  const [karyawan, absensi, izin, gaji, slip, pengaturan, log] = await Promise.all([
    ambil(query(collection(db, "users"), where("cid", "==", CID)), "karyawan"),
    ambil(C("absensi"), "absensi"), ambil(C("izin"), "izin"), ambil(C("payroll"), "gaji"),
    ambil(C("slips"), "slip"), ambil(C("settings"), "pengaturan"), ambil(C("log"), "log")]);
  return { versi: 1, dibuat: new Date().toISOString(), dibuatOleh: profile.nama,
    perusahaan: { id: CID, ...siapBackup(perusahaan || {}) }, karyawan, absensi, izin, gaji, slip, pengaturan, log };
}
function unduhBlob(blob, nama){
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nama;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const namaBackup = ext => "backup-" + (perusahaan?.kode || "data") + "-" + new Date().toISOString().slice(0, 10) + "." + ext;
const tglLokal = v => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) ? tglMedium(new Date(v)) + " " + new Date(v).toLocaleTimeString("id-ID") : v;
// Baris datar untuk Excel: objek/daftar bersarang ditulis sebagai teks JSON
const datar = rows => rows.map(r => { const o = {}; for (const [k, v] of Object.entries(r)) o[k] = v && typeof v === "object" ? JSON.stringify(v) : tglLokal(v); return o; });
let XLSXmod = null;
async function muatXLSX(){
  if (XLSXmod) return XLSXmod;
  try{ XLSXmod = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs"); }
  catch(e){
    await new Promise((ok, no) => { const sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; sc.onload = ok; sc.onerror = no; document.head.append(sc); });
    XLSXmod = window.XLSX;
  }
  return XLSXmod;
}
async function jalankanBackup(jenis, tombol){
  if (!isSuper()){ toast("Backup data hanya untuk superadmin."); return; }
  const m = $("#backup-msg"); tombol.disabled = true; msg(m, "Mengumpulkan data… jangan tutup halaman ini.");
  try{
    const d = await ambilSemuaData();
    const jumlah = `${fmtNum(d.karyawan.length)} karyawan, ${fmtNum(d.absensi.length)} absen, ${fmtNum(d.izin.length)} izin, ${fmtNum(d.slip.length)} slip`;
    if (jenis === "json"){
      unduhBlob(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }), namaBackup("json"));
    } else {
      msg(m, "Menyusun file Excel…");
      const X = await muatXLSX(), wb = X.utils.book_new();
      const nama = Object.fromEntries(d.karyawan.map(u => [u.id, u.nama]));
      const lembar = [
        ["Perusahaan", [{ ...d.perusahaan, logo: d.perusahaan.logo ? "(ada)" : "" }]],
        ["Karyawan", d.karyawan.map(u => ({ nama: u.nama, username: u.username, peran: labelPeran(u), aktif: u.aktif === false ? "Tidak" : "Ya",
          jabatan: u.jabatan || "", divisi: u.divisi || "", nik: u.nik || "", hp: u.hp || "", tanggal_masuk: u.masuk || "", alamat: u.alamat || "",
          shift: u.shift || "", lokasi_kerja: (u.lokasiKerja || []).join(", "), id: u.id }))],
        ["Absensi", d.absensi.sort((a, b) => String(a.ts).localeCompare(String(b.ts))).map(a => ({ waktu: tglLokal(a.ts), nama: a.nama, jenis: a.type,
          status: a.status, lokasi: a.lokasi || "", jarak_m: a.dist ?? "", akurasi_m: a.acc ?? "", alamat: a.alamat || "",
          via: a.kios ? "kios" : a.manual ? "manual" : "aplikasi", alasan: a.alasan || "", diputuskan_oleh: a.by || "", uid: a.uid }))],
        ["Izin & sakit", datar(d.izin)],
        ["Data gaji", datar(d.gaji.map(g => ({ nama: nama[g.id] || "", ...g })))],
        ["Slip gaji", datar(d.slip)],
        ["Pengaturan", d.pengaturan.map(p => ({ bagian: p.id, isi: JSON.stringify(p) }))],
        ["Log aktivitas", datar(d.log.sort((a, b) => String(b.ts).localeCompare(String(a.ts))))]
      ];
      for (const [judul, rows] of lembar) X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows.length ? rows : [{ keterangan: "Belum ada data" }]), judul);
      X.writeFile(wb, namaBackup("xlsx"));
    }
    catatLog(CID, me.uid, profile, "ekspor", "Mengunduh backup data (" + jenis.toUpperCase() + "): " + jumlah);
    msg(m, "Backup selesai diunduh: " + jumlah + ".", "ok");
  }catch(e){
    console.error(e);
    msg(m, "Backup gagal: " + (e?.message || e?.code || e) + ". Periksa koneksi internet, lalu coba lagi.", "bad");
  }
  tombol.disabled = false;
}
$("#backup-xlsx").onclick = e => jalankanBackup("xlsx", e.currentTarget);
$("#backup-json").onclick = e => jalankanBackup("json", e.currentTarget);

/* pesan Pengaturan (#msg2) hilang sendiri setelah 6 detik */
{
  let tHilang = null;
  new MutationObserver(() => {
    clearTimeout(tHilang);
    if ($("#msg2").textContent.trim()) tHilang = setTimeout(() => msg($("#msg2"), ""), 6000);
  }).observe($("#msg2"), { childList: true, characterData: true, subtree: true });
}

/* tombol keluar di pojok kanan atas (khusus HP, karena sidebar tidak tampil) */
$("#logout-hp").onclick = async () => { if (await tanya("Keluar dari dashboard?", { ya: "Keluar" })) $("#logout").click(); };

/* daftar libur nasional & cuti bersama (Gaji > Aturan): bisa ditambah, diubah, dihapus admin */
let tahunLiburPilih = new Date().getFullYear();
async function simpanLiburEdit(edit){
  try{ await updateDoc(D("settings", "payroll"), { liburEdit: edit, appVer: VERSI_APP }); }
  catch(e){ if (e.code === "not-found") await setDoc(D("settings", "payroll"), { liburEdit: edit, appVer: VERSI_APP }, { merge: true }); else throw e; }
  aturan = { ...aturan, liburEdit: edit }; infoLibur();
  catatLog(CID, me.uid, profile, "pengaturan", "Mengubah daftar libur nasional / cuti bersama");
}
// Peringatan di Gaji > Aturan kalau daftar libur tahun ini / tahun depan belum ada
function infoLibur(){
  const el = $("#libur-info"); if (!el) return;
  const ada = tahunLibur(aturan), n = new Date(), th = n.getFullYear();
  const kurang = [th, ...(n.getMonth() >= 8 ? [th + 1] : [])].filter(y => !ada.includes(y));
  el.textContent = kurang.length ? "⚠️ Daftar libur nasional " + kurang.join(" & ") + " belum ada. Tambahkan lewat Kelola daftar libur sesuai SKB 3 Menteri." : "";
  el.hidden = !kurang.length;
}
function bukaDaftarLibur(){
  const box = $("#daftar-libur");
  const hari = d => tglMediumHari(d);
  const edit = { ...(aturan.liburEdit || {}) }, L = daftarLibur(aturan);
  const nas = $("#a-liburNasional").checked, cb = $("#a-cutiBersama").checked;
  const semua = [...Object.entries(L.nasional).map(([d, n]) => [d, n, "nasional"]), ...Object.entries(L.cuti).map(([d, n]) => [d, n, "cuti"]),
    ...Object.entries(L.asal).filter(([, a]) => a === "dihapus").map(([d]) => [d, "", "hapus"])];
  const tahunAda = [...new Set([...semua.map(x => +x[0].slice(0, 4)), ...[0, 1, 2].map(k => new Date().getFullYear() + k), tahunLiburPilih])].sort();
  const baris = semua.filter(x => +x[0].slice(0, 4) === tahunLiburPilih).sort((a, b) => a[0].localeCompare(b[0]));
  const LABEL = { bawaan: "", diubah: '<span class="tag wait">diubah</span>', tambahan: '<span class="tag in">tambahan</span>', dihapus: '<span class="tag no">dihapus</span>' };
  box.innerHTML = `<p class="meta" style="margin:0 0 8px">Isi bawaan: SKB 3 Menteri tentang Hari Libur Nasional &amp; Cuti Bersama 2026 dan 2027.
      Untuk tahun berikutnya atau bila pemerintah mengubah tanggal, tambah/ubah di sini. Perubahan langsung tersimpan dan berlaku untuk gaji, rekap, dan pengajuan cuti.</p>
    <div class="libur-bar"><label for="lb-tahun">Tahun</label><select id="lb-tahun">${tahunAda.map(y => `<option${y === tahunLiburPilih ? " selected" : ""}>${y}</option>`).join("")}</select>
      <span class="meta">${fmtNum(baris.filter(x => x[2] === "nasional").length)} libur nasional · ${fmtNum(baris.filter(x => x[2] === "cuti").length)} cuti bersama</span></div>
    ${baris.length ? `<div class="tablewrap"><table class="libur-tbl"><tr><th>Tanggal</th><th>Keterangan</th><th>Jenis</th><th>Berlaku</th><th></th></tr>${baris.map(([d, n, j]) => {
      if (j === "hapus") return `<tr class="libur-mati"><td>${esc(hari(d))}</td><td colspan="3">${LABEL.dihapus} <span class="meta">dihapus dari daftar bawaan</span></td>
        <td class="aksi"><button type="button" class="small alt lb-pulih" data-d="${d}" title="Kembalikan isi bawaan">↺</button></td></tr>`;
      const aktif = j === "nasional" ? nas : cb;
      return `<tr${aktif ? "" : ' class="libur-mati"'}><td>${esc(hari(d))}</td><td>${esc(n)} ${LABEL[L.asal[d]] || ""}</td><td>${j === "nasional" ? "Libur nasional" : "Cuti bersama"}</td>
        <td>${aktif ? "✓ Libur" : "Hari kerja"}</td><td class="aksi"><button type="button" class="small alt lb-ubah" data-d="${d}" title="Ubah">✏️</button>
        ${L.asal[d] === "diubah" ? `<button type="button" class="small alt lb-pulih" data-d="${d}" title="Kembalikan isi bawaan">↺</button>` : ""}
        <button type="button" class="small alt lb-hapus" data-d="${d}" title="Hapus">🗑️</button></td></tr>`; }).join("")}</table></div>`
      : `<p class="meta libur-kosong">⚠️ Belum ada daftar libur untuk ${tahunLiburPilih}. Tambahkan sesuai SKB 3 Menteri tahun ${tahunLiburPilih}.</p>`}
    <div class="libur-form">
      <b class="lf-judul">Tambah tanggal libur</b>
      <div class="grid2">
        <div><label class="lf-lbl-mulai">Mulai tanggal</label><input class="lf-tgl" type="text" inputmode="numeric" placeholder="01/01/${String(tahunLiburPilih).slice(2)}"></div>
        <div class="lf-sampai-wrap"><label>Sampai tanggal</label><input class="lf-sampai" type="text" inputmode="numeric" placeholder="dd/mm/yy"></div>
      </div>
      <p class="meta" style="margin:4px 0 0">Format dd/mm/yy (mis. 01/01/${String(tahunLiburPilih).slice(2)}). Kosongkan <b>Sampai tanggal</b> bila liburnya hanya 1 hari.</p>
      <label>Jenis</label><select class="lf-jenis"><option value="nasional">Libur nasional</option><option value="cuti">Cuti bersama</option></select>
      <label>Keterangan</label><input class="lf-nama" placeholder="mis. Tahun Baru ${tahunLiburPilih} Masehi" maxlength="80">
      <div class="btns" style="margin-top:10px"><button type="button" class="small lf-simpan">Simpan tanggal</button><button type="button" class="small alt lf-batal" hidden>Batal ubah</button></div>
      <p class="msg lf-msg"></p>
    </div>`;
  const tgl = box.querySelector(".lf-tgl"), sampai = box.querySelector(".lf-sampai"), nama = box.querySelector(".lf-nama"), jenisEl = box.querySelector(".lf-jenis"), m = box.querySelector(".lf-msg");
  let ubahDari = "";
  [tgl, sampai].forEach(pasangTanggalMedium);
  // dd/mm/yy -> Date (null kalau tidak valid)
  const bacaTgl = v => { const iso = dmyKeIso(v); return iso ? new Date(iso + "T00:00") : null; };
  const keDMY = d => tglMedium(d);
  const muatUlang = () => { const top = box.closest(".modal-isi")?.scrollTop; bukaDaftarLibur.isi(); if (top != null) box.closest(".modal-isi").scrollTop = top; };
  const jalan = async (ubah, teks) => {
    try{ await simpanLiburEdit(ubah); toast(teks); muatUlang(); }
    catch(e){ msg(m, e.code === "permission-denied" ? "Ditolak server. Hanya admin yang bisa mengubah daftar libur." : "Gagal menyimpan: " + (e.code || e.message), "bad"); }
  };
  box.querySelector("#lb-tahun").onchange = e => { tahunLiburPilih = +e.target.value; muatUlang(); };
  box.querySelectorAll(".lb-ubah").forEach(b => b.onclick = () => {
    const d = b.dataset.d, isCuti = d in L.cuti;
    ubahDari = d; tgl.value = keDMY(d); nama.value = (isCuti ? L.cuti : L.nasional)[d] || ""; jenisEl.value = isCuti ? "cuti" : "nasional";
    box.querySelector(".lf-judul").textContent = "Ubah tanggal libur " + hari(d); box.querySelector(".lf-batal").hidden = false;
    box.querySelector(".lf-sampai-wrap").hidden = true; sampai.value = ""; box.querySelector(".lf-lbl-mulai").textContent = "Tanggal";
    box.querySelector(".libur-form").scrollIntoView({ behavior: "smooth", block: "center" }); nama.focus();
  });
  box.querySelector(".lf-batal").onclick = () => muatUlang();
  box.querySelectorAll(".lb-hapus").forEach(b => b.onclick = async () => {
    const d = b.dataset.d, n = L.nasional[d] || L.cuti[d] || "";
    if (!await tanya("Hapus " + hari(d) + (n ? " (" + n + ")" : "") + " dari daftar libur? Tanggal ini akan dihitung sebagai hari kerja biasa.", { ya: "Hapus" })) return;
    const ubah = { ...edit };
    if (L.asal[d] === "tambahan") delete ubah[d]; else ubah[d] = { j: d in L.cuti ? "cuti" : "nasional", hapus: true };
    jalan(ubah, "Libur " + hari(d) + " dihapus.");
  });
  box.querySelectorAll(".lb-pulih").forEach(b => b.onclick = () => { const ubah = { ...edit }; delete ubah[b.dataset.d]; jalan(ubah, "Dikembalikan ke isi bawaan SKB."); });
  box.querySelector(".lf-simpan").onclick = async () => {
    const t = bacaTgl(tgl.value);
    if (!t){ msg(m, "Tanggal mulai harus format dd/mm/yy dan valid, mis. 01/01/" + String(tahunLiburPilih).slice(2) + ".", "bad"); return; }
    let t2 = t;
    if (!ubahDari && sampai.value.trim()){
      t2 = bacaTgl(sampai.value);
      if (!t2){ msg(m, "Tanggal sampai harus format dd/mm/yy dan valid.", "bad"); return; }
      if (t2 < t){ msg(m, "Tanggal sampai tidak boleh sebelum tanggal mulai.", "bad"); return; }
      if ((t2 - t) / 864e5 > 30){ msg(m, "Rentang libur paling lama 31 hari.", "bad"); return; }
    }
    if (!nama.value.trim()){ msg(m, "Isi keterangan libur, mis. Tahun Baru Masehi.", "bad"); return; }
    const tanggal = [];
    for (let x = new Date(t); x <= t2; x.setDate(x.getDate() + 1)) tanggal.push(dayKey(x));
    const ubah = { ...edit }, d = tanggal[0];
    if (ubahDari && ubahDari !== d){ if (L.asal[ubahDari] === "tambahan") delete ubah[ubahDari]; else ubah[ubahDari] = { j: ubahDari in L.cuti ? "cuti" : "nasional", hapus: true }; }
    tanggal.forEach(k => { ubah[k] = { j: jenisEl.value, n: nama.value.trim() }; });
    tahunLiburPilih = t.getFullYear();
    jalan(ubah, (ubahDari ? "Libur diubah: " : "Libur ditambahkan: ") + hari(d) + (tanggal.length > 1 ? " s/d " + hari(tanggal.at(-1)) + " (" + tanggal.length + " hari)" : "") + " · " + nama.value.trim());
  };
}
bukaDaftarLibur.isi = bukaDaftarLibur;
$("#lihat-libur").onclick = () => {
  bukaDaftarLibur();
  const box = $("#daftar-libur"); box.hidden = false; box.dataset.isi = "1";
  popup(box, "Libur nasional & cuti bersama", $("#lihat-libur"));
};

// Aplikasi selesai dimuat tanpa error
window.__appSiap = true; try{ sessionStorage.removeItem("__perbaiki"); }catch(e){}
