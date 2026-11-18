import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence, inMemoryPersistence,
  browserLocalPersistence, EmailAuthProvider, reauthenticateWithCredential } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { doc, getDoc, setDoc, collection, serverTimestamp, query, where, orderBy, limit, getDocs, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { ref as sRef, uploadBytesResumable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { firebaseConfig } from "./firebase-config.js";
import { auth, db, storage, $, msg, toast, fmtJam, keEmail, authError, pasangMata, catatLog, tandaiLogin, jenisMasuk, perangkatInfo, tglMediumHari } from "./common.js";
import { VERSI_APP, pantauVersiBaru, masaAktif, teksHabis } from "./common.js";
pantauVersiBaru(() => false);

// Versi HTML & JS harus sama; kalau beda (cache campur, mis. HTML lama + JS baru) -> hapus cache & muat ulang sekali
{ const vH = document.querySelector('meta[name="versi-app"]')?.content;
  if (vH !== VERSI_APP){
    let sudah = true; try{ sudah = sessionStorage.getItem("__perbaiki") === "1"; if (!sudah) sessionStorage.setItem("__perbaiki", "1"); }catch(e){}
    if (!sudah){ const ulang = () => location.reload(); (window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve()).then(ulang, ulang); }
  } }

/* ===================== MODE KIOS =====================
   Perangkat kantor (PC/tablet + webcam) dibuka oleh admin/supervisor.
   Karyawan membuktikan identitas dengan username + password, lalu uji wajah hidup + foto selfie. */
let me = null, profile = null, CID = "", lokasiList = [], kiosSah = true, sibuk = false;
const D = (...p) => doc(db, "companies", CID, ...p);
const C = n => collection(db, "companies", CID, n);
pasangMata($("#f-eye"), $("#f-pass"));
pasangMata($("#k-eye"), $("#k-pass"));

/* ---------- jam ---------- */
function tick(){
  const d = new Date();
  $("#kios-jam").textContent = fmtJam(d);
  $("#kios-tgl").textContent = tglMediumHari(d, "panjang");
}
tick(); setInterval(tick, 10000);

/* ---------- buka kios (login admin/supervisor) ---------- */
$("#auth-form").onsubmit = async e => {
  e.preventDefault();
  const m = $("#auth-msg"), u = $("#f-user").value.trim(), p = $("#f-pass").value;
  if (!u || !p){ msg(m, "Isi username dan password.", "bad"); return; }
  $("#f-go").disabled = true; msg(m, "Membuka kios…");
  try{ await setPersistence(auth, browserLocalPersistence); tandaiLogin(); await signInWithEmailAndPassword(auth, keEmail(u), p); }
  catch(err){ msg(m, authError(err), "bad"); }
  $("#f-go").disabled = false;
};

onAuthStateChanged(auth, user => { mulai(user).catch(gagal).finally(() => $("#memuat")?.remove()); });
function gagal(e){
  console.error(e);
  $("#app-view").hidden = true; $("#auth-view").hidden = false;
  msg($("#auth-msg"), "Kios gagal dibuka: " + (e?.code || e?.message || e), "bad");
}
async function mulai(user){
  me = user;
  if (!user){ $("#app-view").hidden = true; $("#auth-view").hidden = false; return; }
  const s = await getDoc(doc(db, "users", user.uid));
  profile = s.exists() ? s.data() : null;
  if (!profile || !["admin", "supervisor", "superadmin"].includes(profile.role) || profile.aktif === false){
    await signOut(auth); msg($("#auth-msg"), "Mode kios hanya bisa dibuka oleh admin atau supervisor.", "bad"); return;
  }
  CID = profile.cid || "";
  if (!CID){ await signOut(auth); msg($("#auth-msg"), "Akun ini belum terhubung ke perusahaan.", "bad"); return; }
  // akses menu per admin (diatur superadmin di Pengaturan › Akses admin)
  if (profile.role === "admin" && Array.isArray(profile.aksesMenu) && !profile.aksesMenu.includes("kios")){
    await signOut(auth); msg($("#auth-msg"), "Akun ini tidak diberi akses Mode kios. Hubungi superadmin.", "bad"); return; }
  if (profile.role !== "superadmin"){
    let pt0 = null; try{ const c0 = await getDoc(doc(db, "companies", CID)); pt0 = c0.exists() ? c0.data() : null; }catch(e){}
    if (masaAktif(pt0).habis){ await signOut(auth); msg($("#auth-msg"), teksHabis(pt0), "bad"); return; }
  }
  const [co, lok, kantor, ver] = await Promise.all([getDoc(doc(db, "companies", CID)), getDoc(D("settings", "lokasi")),
    getDoc(D("settings", "kantor")), getDoc(D("settings", "verifikasi")).catch(() => null)]);
  const pt = co.exists() ? co.data() : {};
  // Mode kios bisa dimatikan superadmin per perusahaan
  if (pt.kiosAktif === false){ await signOut(auth); msg($("#auth-msg"), "Mode kios tidak diaktifkan untuk perusahaan ini. Hubungi superadmin.", "bad"); return; }
  $("#kios-pt").textContent = pt.nama || "";
  if (pt.logo){ $("#pt-logo").src = pt.logo; $("#pt-logo").hidden = false; }
  lokasiList = lok.exists() ? (lok.data().daftar || []) : (kantor.exists() ? [{ id: "kantor", nama: "Kantor", ...kantor.data() }] : []);
  kiosSah = ver?.exists() ? ver.data().kiosSah !== false : true;
  let pilih = ""; try{ pilih = localStorage.getItem("absen:kiosLokasi") || ""; }catch(e){}
  $("#k-lokasi").innerHTML = lokasiList.length ? lokasiList.map(L => `<option value="${L.id}" ${L.id === pilih ? "selected" : ""}>${L.nama}</option>`).join("")
    : '<option value="">(Lokasi belum diatur)</option>';
  $("#k-lokasi").onchange = () => { try{ localStorage.setItem("absen:kiosLokasi", $("#k-lokasi").value); }catch(e){} };
  $("#k-oleh").textContent = "Dibuka oleh " + profile.nama + (kiosSah ? "" : " · absen perlu disetujui");
  const jm = jenisMasuk();
  if (jm) catatLog(CID, user.uid, profile, jm, jm === "login" ? "Membuka mode kios" : "Melanjutkan mode kios");
  $("#auth-view").hidden = true; $("#app-view").hidden = false;
  $("#k-user").focus();
}

/* ---------- kamera & uji wajah hidup (sama dengan aplikasi karyawan) ---------- */
let stream = null;
async function startCam(){
  if (stream) return document.querySelector("#lens video");
  stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 480, height: 480 }, audio: false });
  const v = document.createElement("video");
  v.playsInline = true; v.muted = true; v.srcObject = stream;
  $("#lens").replaceChildren(v);
  await v.play();
  await new Promise(r => setTimeout(r, 900));
  return v;
}
function stopCam(){
  if (stream){ stream.getTracks().forEach(t => t.stop()); stream = null; }
  $("#lens").innerHTML = "";
}
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


/* ---------- absen lewat kios ---------- */
// Membuktikan identitas karyawan tanpa mengganggu sesi admin di perangkat ini
async function cekAkunKaryawan(username, pass){
  const app2 = initializeApp(firebaseConfig, "kios-" + Date.now());
  try{
    const a2 = getAuth(app2);
    await setPersistence(a2, inMemoryPersistence);
    const c = await signInWithEmailAndPassword(a2, keEmail(username), pass);
    const uid = c.user.uid;
    await signOut(a2);
    return uid;
  } finally { await deleteApp(app2); }
}
function tampil(bagian){ ["k-form", "k-kamera", "k-hasil"].forEach(id => $("#" + id).hidden = id !== bagian); }
let tReset = null;
function selesai(ok, judul, ket){
  $("#k-ikon").textContent = ok ? "✅" : "⚠️";
  $("#k-judul").textContent = judul; $("#k-ket").textContent = ket || "";
  tampil("k-hasil");
  clearTimeout(tReset);
  tReset = setTimeout(() => { $("#k-user").value = $("#k-pass").value = ""; msg($("#k-msg"), ""); tampil("k-form"); $("#k-user").focus(); }, 5000);
}
async function absenKios(type){
  if (sibuk) return;
  const m = $("#k-msg"), username = $("#k-user").value.trim(), pass = $("#k-pass").value;
  const L = lokasiList.find(x => x.id === $("#k-lokasi").value) || lokasiList[0];
  if (!username || !pass){ msg(m, "Isi username dan password kamu.", "bad"); return; }
  if (!L){ msg(m, "Lokasi kios belum diatur admin.", "bad"); return; }
  sibuk = true; $("#k-masuk").disabled = $("#k-pulang").disabled = true; msg(m, "Memeriksa akun…");
  let uid, karyawan;
  try{
    uid = await cekAkunKaryawan(username, pass);
    const s = await getDoc(doc(db, "users", uid));
    karyawan = s.exists() ? s.data() : null;
    if (!karyawan || karyawan.cid !== CID) throw { pesan: "Akun ini bukan karyawan perusahaan ini." };
    if (karyawan.aktif === false) throw { pesan: "Akun ini dinonaktifkan. Hubungi admin." };
    // Masuk terkunci selama absen masuk terakhir belum ditutup absen pulang; pulang sampai jam pulang + 4 jam (atau terus kalau "Masih lembur")
    { const qs = await getDocs(query(C("absensi"), where("uid", "==", uid), orderBy("ts", "desc"), limit(10)));
      const akhirDoc = qs.docs.find(d => d.data().status !== "tolak"), akhir = akhirDoc?.data();
      let terbuka = akhir?.type === "masuk";
      if (terbuka){   // lupa absen pulang yang sudah diajukan (menunggu/disetujui) menutup absen masuk itu
        const t = akhir.ts.toDate(), tgl = t.getFullYear() + "-" + String(t.getMonth() + 1).padStart(2, "0") + "-" + String(t.getDate()).padStart(2, "0");
        const iz = await getDocs(query(C("izin"), where("uid", "==", uid), where("jenis", "==", "lupaPulang"), where("mulai", "==", tgl))).catch(() => ({ docs: [] }));
        if (iz.docs.some(d => d.data().status !== "tolak")) terbuka = false;
      }
      const lewat = false;   // tidak ada batas: tanpa jawaban pengingat, server menutup absen pulang otomatis
      if (type === "masuk" && terbuka) throw { pesan: karyawan.nama + (lewat ? " punya absen masuk yang belum ditutup. Buka aplikasi Absensi Hadir di HP lalu pilih Lupa absen pulang." : " sudah absen masuk. Absen pulang dulu sebelum absen masuk lagi.") };
      if (type === "pulang" && !terbuka) throw { pesan: "Belum ada absen masuk untuk " + karyawan.nama + ". Absen masuk dulu." };
      if (type === "pulang" && lewat) throw { pesan: "Batas absen pulang " + karyawan.nama + " sudah lewat (jam pulang + 4 jam). Buka aplikasi Absensi Hadir di HP lalu pilih Lupa absen pulang." }; }
  }catch(e){
    msg(m, e.pesan || (String(e.code).includes("invalid") || String(e.code).includes("wrong") || String(e.code).includes("user-not-found")
      ? "Username atau password salah." : authError(e)), "bad");
    sibuk = false; $("#k-masuk").disabled = $("#k-pulang").disabled = false; return;
  }
  msg(m, "");
  $("#k-nama").textContent = karyawan.nama + " · Absen " + (type === "masuk" ? "Masuk" : "Pulang");
  $("#k-status").textContent = "Menyiapkan kamera…";
  tampil("k-kamera");
  let live = false, selfie = null;
  try{
    const v = await startCam();
    let lm = null; try{ lm = await siapkanLiveness(); }catch(e){ lm = null; }
    if (lm){ $("#k-status").textContent = "Ikuti petunjuk di layar kamera"; await ujiHidup(v, lm); live = true; }
    caption("");
    selfie = await ambilSelfie(v);
    stopCam();
    $("#k-status").textContent = "Menyimpan absen…";
    const ref = doc(C("absensi"));
    let foto = null;
    try{
      const path = `kios/${CID}/${uid}/${ref.id}.jpg`;
      await uploadBytesResumable(sRef(storage, path), selfie, { contentType: "image/jpeg" });
      foto = path;
    }catch(e){ foto = null; }
    await setDoc(ref, { uid, nama: karyawan.nama, type, status: kiosSah ? "otomatis" : "menunggu", ts: serverTimestamp(),
      kios: true, byUid: me.uid, oleh: profile.nama, lokasi: L.nama, lokasiId: L.id, dist: 0, rad: L.rad || 100, acc: 0,
      la: L.lat ?? null, lo: L.lng ?? null, alamat: L.alamat || "", live, foto, device: "kios", face: null, finger: false, perangkat: await perangkatInfo(),
      alasan: kiosSah ? "" : "Absen lewat kios" });
    selesai(true, "Absen " + (type === "masuk" ? "masuk" : "pulang") + " tercatat", karyawan.nama + " · " + fmtJam(new Date()) + " · " + L.nama +
      (kiosSah ? "" : " · menunggu persetujuan admin"));
  }catch(e){
    stopCam(); caption("");
    selesai(false, "Absen belum tercatat", Array.isArray(e) ? e[1] : (e?.code === "NotAllowedError" ? "Izinkan akses kamera di browser ini." : (e?.message || e?.code || "Coba lagi.")));
  }
  sibuk = false; $("#k-masuk").disabled = $("#k-pulang").disabled = false;
}
$("#k-masuk").onclick = () => absenKios("masuk");
$("#k-pulang").onclick = () => absenKios("pulang");
$("#k-pass").addEventListener("keydown", e => { if (e.key === "Enter") absenKios("masuk"); });
// kosongkan isian kalau dibiarkan 60 detik
let tDiam = null;
["input", "keydown"].forEach(ev => document.addEventListener(ev, () => { clearTimeout(tDiam);
  tDiam = setTimeout(() => { if (!sibuk){ $("#k-user").value = $("#k-pass").value = ""; msg($("#k-msg"), ""); } }, 60000); }));

/* ---------- tutup kios: wajib password admin/supervisor ---------- */
$("#k-tutup").onclick = () => { $("#k-tutup-dlg").hidden = false; $("#k-tutup-pass").value = ""; msg($("#k-tutup-msg"), ""); $("#k-tutup-pass").focus(); };
$("#k-tutup-batal").onclick = () => { $("#k-tutup-dlg").hidden = true; };
$("#k-tutup-ya").onclick = async () => {
  const pw = $("#k-tutup-pass").value;
  try{
    await reauthenticateWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, pw));
    await catatLog(CID, me.uid, profile, "logout", "Menutup mode kios");
    try{ sessionStorage.removeItem("absen:dicatat"); }catch(e){}
    $("#k-tutup-dlg").hidden = true; await signOut(auth);
  }catch(e){ msg($("#k-tutup-msg"), "Password salah.", "bad"); }
};
$("#k-tutup-pass").addEventListener("keydown", e => { if (e.key === "Enter") $("#k-tutup-ya").click(); });

// Aplikasi selesai dimuat tanpa error
window.__appSiap = true; try{ sessionStorage.removeItem("__perbaiki"); }catch(e){}
