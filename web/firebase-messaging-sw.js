// Service worker: notifikasi push (Firebase) + dukungan offline (syarat PWA/APK).
const VERSI = "absensi-v237";               // naikkan angka ini setiap kali file aplikasi berubah besar
const FILE_INTI = ["./index.html", "./admin.html", "./index.js", "./admin.js", "./kios.html", "./kios.js", "./offline.html", "./style.css", "./common.js", "./payroll.js", "./excel.js", "./pajak.js",
  "./firebase-config.js", "./manifest.json", "./manifest-admin.json", "./manifest-kios.json", "./icon.svg", "./notif-absen.mp3", "./icons/icon-192.png", "./icons/icon-512.png"];

// --- Notifikasi push ---
try{
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");
  const cfg = JSON.parse(new URL(self.location).searchParams.get("c") || "{}");
  if (cfg.apiKey && !String(cfg.apiKey).startsWith("ISI_")){
    firebase.initializeApp(cfg);
    // Pengingat absen pulang (pesan data): tampilkan dengan tombol "Masih lembur" / "Lupa absen pulang"
    firebase.messaging().onBackgroundMessage(p => {
      const d = p.data || {};
      if (d.jenis !== "pengingatPulang") return;
      return self.registration.showNotification(d.judul || "Kamu belum absen pulang", {
        body: d.isi || "", tag: "pengingat-" + d.masukId, renotify: true, requireInteraction: true,
        icon: "icons/icon-192.png", badge: "icons/icon-192.png",
        actions: [{ action: "lembur", title: "Lembur" }, { action: "lupa", title: "Absen Pulang" }],
        data: { pengingat: true, masukId: d.masukId, cid: d.cid, url: d.url || "./index.html" } });
    });
  }
}catch(e){ /* tanpa internet saat pertama dipasang: notifikasi aktif lagi di pembaruan berikutnya */ }

// Tombol / ketuk notifikasi pengingat -> buka aplikasi karyawan dengan jawabannya
self.addEventListener("notificationclick", e => {
  const d = e.notification.data || {};
  if (!d.pengingat) return;
  e.notification.close();
  const jawab = e.action || "tanya";
  const url = new URL(d.url || "./index.html", self.location);
  url.searchParams.set("pengingat", jawab); url.searchParams.set("m", d.masukId || ""); url.searchParams.set("c", d.cid || "");
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
    const c = cs.find(x => /\/(index(\.html)?)?(\?|$)/.test(new URL(x.url).pathname + new URL(x.url).search));
    if (c){ c.postMessage({ pengingat: jawab, masukId: d.masukId, cid: d.cid }); return c.focus(); }
    return clients.openWindow(url.href);
  }));
});

// --- Offline ---
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(FILE_INTI)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Selalu ambil versi terbaru dari internet; pakai salinan tersimpan hanya saat offline.
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // Firebase, Google Fonts, dll. langsung ke internet
  e.respondWith(
    fetch(req, { cache: "no-store" }).then(res => {
      if (res.ok){ const salin = res.clone(); caches.open(VERSI).then(c => c.put(req, salin)); }
      return res;
    }).catch(async () =>
      (await caches.match(req, { ignoreSearch: true })) ||
      (req.mode === "navigate" ? caches.match("./offline.html") : Response.error()))
  );
});
