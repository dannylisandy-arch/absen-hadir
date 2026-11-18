// Perhitungan gaji dari data absensi. Dipakai oleh admin.html dan index.html.

export const ATURAN_DEFAULT = {
  // Dasar gaji pokok:
  //  "prorata" = gaji pokok ÷ pembagi × hari masuk
  //  "harian"  = upah per hari × hari masuk
  //  "bulanan" = gaji pokok penuh, dipotong per hari tidak hadir
  modeGaji: "prorata",
  awalPeriode: 1,                                          // tanggal mulai periode (1 = awal bulan; 26 = 26 bulan lalu s/d 25 bulan ini)
  pembagi: 0,                                              // 0 = jumlah hari kerja di kalender bulan itu
  jamMasuk: "08:00", jamPulang: "17:00", toleransi: 15,   // menit
  hariKerja: [1, 2, 3, 4, 5],                              // 0=Minggu ... 6=Sabtu
  libur: [],                                               // ["2026-12-25", ...] libur khusus perusahaan
  liburKet: {},
  jatahCuti: 12,                                           // hak cuti tahunan (hari kerja), UU Ketenagakerjaan minimal 12 hari                                            // { "2026-12-25": "keterangan" }
  liburNasional: true,                                     // libur nasional SKB 3 Menteri otomatis
  cutiBersama: false,                                      // cuti bersama ikut libur (fakultatif untuk swasta)
  uangMakan: 0, transport: 0,                              // per hari hadir
  telatPerKejadian: 0, telatPerMenit: 0,
  potongAlpha: true,                                       // potong gaji pokok per hari tidak hadir
  potongIzin: false,                                       // potong gaji pokok per hari izin (sakit tidak dipotong)
  lemburAktif: true, lemburMode: "depnaker", lemburTarif: 0, lemburMinMenit: 60, lemburMulaiMenit: 0,   // lembur dihitung mulai jam pulang + lemburMulaiMenit
  lebihHKMode: "", lebihHKTarif: 0,                      // Lebih HK: "" = hanya dihitung | "hari" | "jam"; tarif 0 = otomatis
  lemburSetuju: false,                                     // true = lembur baru dihitung setelah disetujui di Laporan > Cek lembur
  bpjsKes: true, bpjsJht: true, bpjsJp: true,              // potongan bagian karyawan
  pctKes: 1, pctJht: 2, pctJp: 1,                          // persen, bisa diubah admin
  capKes: 12000000, capJp: 10547400,                       // batas upah BPJS, cek angka terbaru
  pphAktif: false, pctPph: 5,                              // PPh 21 tarif rata (persen bisa diubah)
  dasarPph: "bruto",                                       // "bruto" | "neto" (bruto − iuran JHT & JP karyawan)
  // pphMetode: "ter" (PP 58/2023: TER per status PTKP, Desember dihitung setahun) | "tarif" (tarif rata di atas)
  // Iuran BPJS bagian perusahaan (tidak memotong gaji; JKK, JKM & BPJS Kesehatan perusahaan ikut menambah penghasilan bruto PPh 21)
  pctKesP: 4, pctJhtP: 3.7, pctJpP: 2, pctJkk: 0.24, pctJkm: 0.3
};

/* ---------- PPh 21 (PP 58/2023 & PMK 168/2023) ----------
   Januari–November: PPh = penghasilan bruto sebulan × tarif efektif (TER) kategori A/B/C.
   Desember (atau bulan terakhir bekerja): PPh setahun pasal 17 dikurangi PPh yang sudah dipotong. */
export const PTKP = { "TK/0": 54000000, "TK/1": 58500000, "TK/2": 63000000, "TK/3": 67500000, "K/0": 58500000, "K/1": 63000000, "K/2": 67500000, "K/3": 72000000 };
export const kategoriTER = st => ({ "TK/0": "A", "TK/1": "A", "K/0": "A", "TK/2": "B", "TK/3": "B", "K/1": "B", "K/2": "B", "K/3": "C" })[st] || "A";
// [batas atas penghasilan bruto sebulan (Rp), tarif %]
const TER = {
  A: [[5400000,0],[5650000,.25],[5950000,.5],[6300000,.75],[6750000,1],[7500000,1.25],[8550000,1.5],[9650000,1.75],[10050000,2],[10350000,2.25],[10700000,2.5],[11050000,3],[11600000,3.5],[12500000,4],[13750000,5],[15100000,6],[16950000,7],[19750000,8],[24150000,9],[26450000,10],[28000000,11],[30050000,12],[32400000,13],[35400000,14],[39100000,15],[43850000,16],[47800000,17],[51400000,18],[56300000,19],[62200000,20],[68600000,21],[77500000,22],[89000000,23],[103000000,24],[125000000,25],[157000000,26],[206000000,27],[337000000,28],[454000000,29],[550000000,30],[695000000,31],[910000000,32],[1400000000,33],[Infinity,34]],
  B: [[6200000,0],[6500000,.25],[6850000,.5],[7300000,.75],[9200000,1],[10750000,1.5],[11250000,2],[11600000,2.5],[12600000,3],[13600000,4],[14950000,5],[16400000,6],[18450000,7],[21850000,8],[26000000,9],[27700000,10],[29350000,11],[31450000,12],[33950000,13],[37100000,14],[41100000,15],[45800000,16],[49500000,17],[53800000,18],[58500000,19],[64000000,20],[71000000,21],[80000000,22],[93000000,23],[109000000,24],[129000000,25],[163000000,26],[211000000,27],[374000000,28],[459000000,29],[555000000,30],[704000000,31],[957000000,32],[1405000000,33],[Infinity,34]],
  C: [[6600000,0],[6950000,.25],[7350000,.5],[7800000,.75],[8850000,1],[9800000,1.25],[10950000,1.5],[11200000,1.75],[12050000,2],[12950000,3],[14150000,4],[15550000,5],[17050000,6],[19500000,7],[22700000,8],[26600000,9],[28100000,10],[30100000,11],[32600000,12],[35400000,13],[38900000,14],[43000000,15],[47400000,16],[51200000,17],[55800000,18],[60400000,19],[66700000,20],[74500000,21],[83200000,22],[95600000,23],[110000000,24],[134000000,25],[169000000,26],[221000000,27],[390000000,28],[463000000,29],[561000000,30],[709000000,31],[965000000,32],[1419000000,33],[Infinity,34]]
};
export const tarifTER = (status, bruto) => { const t = TER[kategoriTER(status)]; for (const [batas, p] of t) if (bruto <= batas) return p; return 34; };
// PPh 21 setahun dari PKP (tarif pasal 17 UU HPP)
export function pphPasal17(pkp){
  const lap = [[60000000, 5], [250000000, 15], [500000000, 25], [5000000000, 30], [Infinity, 35]];
  let sisa = Math.max(0, pkp), bawah = 0, pajak = 0;
  for (const [atas, p] of lap){ const kena = Math.min(sisa, atas - bawah); if (kena <= 0) break; pajak += kena * p / 100; sisa -= kena; bawah = atas; }
  return Math.floor(pajak);
}

const pad = n => String(n).padStart(2, "0");
/* Libur nasional & cuti bersama resmi (SKB Menteri Agama, Menaker, MenPANRB)
   2026: SKB No. 1497/2/5 Tahun 2025 · 2027: SKB No. 1205/3/2 Tahun 2026 (sumber: setneg.go.id) */
export const LIBUR_NASIONAL = {
  2026: { "2026-01-01": "Tahun Baru 2026 Masehi", "2026-01-16": "Isra Mikraj Nabi Muhammad saw.", "2026-02-17": "Tahun Baru Imlek 2577 Kongzili", "2026-03-19": "Hari Suci Nyepi (Tahun Baru Saka 1948)", "2026-03-21": "Idulfitri 1447 H", "2026-03-22": "Idulfitri 1447 H", "2026-04-03": "Wafat Yesus Kristus", "2026-04-05": "Kebangkitan Yesus Kristus (Paskah)", "2026-05-01": "Hari Buruh Internasional", "2026-05-14": "Kenaikan Yesus Kristus", "2026-05-27": "Iduladha 1447 H", "2026-05-31": "Hari Raya Waisak 2570 BE", "2026-06-01": "Hari Lahir Pancasila", "2026-06-16": "1 Muharam Tahun Baru Islam 1448 H", "2026-08-17": "Proklamasi Kemerdekaan", "2026-08-25": "Maulid Nabi Muhammad saw.", "2026-12-25": "Kelahiran Yesus Kristus (Natal)" },
  2027: { "2027-01-01": "Tahun Baru 2027 Masehi", "2027-01-05": "Isra Mikraj Nabi Muhammad saw.", "2027-02-06": "Tahun Baru Imlek 2578 Kongzili", "2027-03-08": "Hari Suci Nyepi (Tahun Baru Saka 1949)", "2027-03-10": "Idulfitri 1448 H", "2027-03-11": "Idulfitri 1448 H", "2027-03-26": "Wafat Yesus Kristus", "2027-03-28": "Kebangkitan Yesus Kristus (Paskah)", "2027-05-01": "Hari Buruh Internasional", "2027-05-06": "Kenaikan Yesus Kristus", "2027-05-17": "Iduladha 1448 H", "2027-05-20": "Hari Raya Waisak 2571 BE", "2027-06-01": "Hari Lahir Pancasila", "2027-06-06": "1 Muharam Tahun Baru Islam 1449 H", "2027-08-15": "Maulid Nabi Muhammad saw.", "2027-08-17": "Proklamasi Kemerdekaan", "2027-12-25": "Kelahiran Yesus Kristus (Natal)", "2027-12-26": "Isra Mikraj Nabi Muhammad saw." }
};
export const CUTI_BERSAMA = {
  2026: { "2026-02-16": "Cuti bersama Tahun Baru Imlek", "2026-03-18": "Cuti bersama Nyepi", "2026-03-20": "Cuti bersama Idulfitri", "2026-03-23": "Cuti bersama Idulfitri", "2026-03-24": "Cuti bersama Idulfitri", "2026-05-15": "Cuti bersama Kenaikan Yesus Kristus", "2026-05-28": "Cuti bersama Iduladha", "2026-12-24": "Cuti bersama Natal" },
  2027: { "2027-02-05": "Cuti bersama Tahun Baru Imlek", "2027-03-09": "Cuti bersama Idulfitri", "2027-03-12": "Cuti bersama Idulfitri", "2027-03-15": "Cuti bersama Idulfitri", "2027-03-25": "Cuti bersama Wafat Yesus Kristus", "2027-05-18": "Cuti bersama Iduladha", "2027-05-19": "Cuti bersama Waisak", "2027-12-24": "Cuti bersama Natal" }
};
// Peta tanggal -> nama libur yang berlaku menurut aturan perusahaan
// Daftar libur nasional & cuti bersama yang berlaku: bawaan (SKB) + perubahan admin (A.liburEdit)
// liburEdit: { "YYYY-MM-DD": { j: "nasional"|"cuti", n: "nama" } atau { j, hapus: true } }
export function daftarLibur(A = {}){
  const nasional = {}, cuti = {}, asal = {};
  for (const th of Object.values(LIBUR_NASIONAL)) for (const [d, n] of Object.entries(th)){ nasional[d] = n; asal[d] = "bawaan"; }
  for (const th of Object.values(CUTI_BERSAMA)) for (const [d, n] of Object.entries(th)){ cuti[d] = n; asal[d] = "bawaan"; }
  for (const [d, e] of Object.entries(A.liburEdit || {})){
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const bawaan = asal[d] === "bawaan";
    delete nasional[d]; delete cuti[d];
    if (e.hapus){ asal[d] = "dihapus"; continue; }
    (e.j === "cuti" ? cuti : nasional)[d] = e.n || (e.j === "cuti" ? "Cuti bersama" : "Libur nasional");
    asal[d] = bawaan ? "diubah" : "tambahan";
  }
  return { nasional, cuti, asal };
}
// Tahun yang sudah punya daftar libur nasional (untuk peringatan "daftar tahun depan belum ada")
export const tahunLibur = A => [...new Set(Object.keys(daftarLibur(A).nasional).map(d => +d.slice(0, 4)))].sort();
export function petaLibur(A){
  const peta = {}, L = daftarLibur(A);
  if (A.liburNasional !== false) Object.assign(peta, L.nasional);
  if (A.cutiBersama) Object.assign(peta, L.cuti);
  for (const d of (A.libur || [])) peta[d] = (A.liburKet || {})[d] || "Libur perusahaan";
  return peta;
}
export const dayKey = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const toMin = s => { const [h, m] = String(s).split(":").map(Number); return h * 60 + (m || 0); };
const minOf = d => d.getHours() * 60 + d.getMinutes();
/* ---------- Tanggal: tampil Medium Date "06 Okt 26" (input tetap diketik dd/mm/yy) ---------- */
export const BULAN_PENDEK = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
export const BULAN_ID = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];   // ejaan Inggris tetap diterima saat diketik
const HARI_P = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"], HARI_L = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
// x: Date, Timestamp Firestore, atau teks "YYYY-MM-DD"
export const keTanggal = x => !x ? null : x.toDate ? x.toDate() : x instanceof Date ? x
  : /^\d{4}-\d{2}-\d{2}/.test(String(x)) ? new Date(+String(x).slice(0, 4), +String(x).slice(5, 7) - 1, +String(x).slice(8, 10)) : null;
export const tglMedium = x => { const d = keTanggal(x); return d && !isNaN(d) ? String(d.getDate()).padStart(2, "0") + " " + BULAN_PENDEK[d.getMonth()] + " " + String(d.getFullYear()).slice(2) : ""; };
// hari: "pendek" -> "Jum, 09 Okt 26", "panjang" -> "Jumat, 09 Okt 26"
export const tglMediumHari = (x, hari = "pendek") => { const d = keTanggal(x); return d && !isNaN(d) ? (hari === "panjang" ? HARI_L : HARI_P)[d.getDay()] + ", " + tglMedium(d) : ""; };
export const jamHM = d => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
export const tglJamMedium = x => { const d = keTanggal(x); return d && !isNaN(d) ? tglMedium(d) + " " + jamHM(d) : ""; };

const pct = n => (+n || 0).toLocaleString("id-ID", {maximumFractionDigits: 2});
const nf = n => (+n || 0).toLocaleString("id-ID");
const jam = d => d ? pad(d.getHours()) + ":" + pad(d.getMinutes()) : "-";
export const rp = n => "Rp " + Math.round(n || 0).toLocaleString("id-ID");
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const namaBulan = (y, m) => new Date(y, m, 1).toLocaleDateString("id-ID", {month: "long", year: "numeric"});

// Uang lembur menurut PP 35/2021: upah sejam = 1/173 x upah bulanan.
function lemburDepnaker(jamLembur, hariLibur, upahJam, enamHari){
  let kali = 0;
  for (let i = 1; i <= jamLembur; i++){
    if (!hariLibur) kali += i === 1 ? 1.5 : 2;
    else {
      const batas = enamHari ? 7 : 8;
      kali += i <= batas ? 2 : i === batas + 1 ? 3 : 4;
    }
  }
  return kali * upahJam;
}

// Pengajuan lupa absen (karyawan lupa absen masuk / pulang): disetujui -> jadi data absen
export const LUPA_ABSEN = { lupaMasuk: "masuk", lupaPulang: "pulang" };
export const namaJenisIzin = j => ({ sakit: "Sakit", cuti: "Cuti", lupaMasuk: "Tidak bisa absen masuk", lupaPulang: "Lupa absen pulang" })[j] || "Izin";
// Tanggal-tanggal dari pengajuan izin/sakit yang disetujui -> { "2026-09-03": "sakit", ... }
export function petaIzin(izinList){
  const peta = {};
  for (const z of izinList || []){
    if (z.status !== "terima" || LUPA_ABSEN[z.jenis]) continue;   // lupa absen: jamnya sudah jadi data absen, bukan izin
    const [y1, m1, d1] = z.mulai.split("-").map(Number), [y2, m2, d2] = z.selesai.split("-").map(Number);
    for (let d = new Date(y1, m1 - 1, d1), akhir = new Date(y2, m2 - 1, d2); d <= akhir; d.setDate(d.getDate() + 1))
      peta[dayKey(d)] = z.jenis;
  }
  return peta;
}

/**
 * records: absen satu karyawan dalam bulan itu ({type, status, ts})
 * gaji: {gajiPokok, tjJabatan, tjTransport, tunjangan (= tunjangan lainnya), bonus (periode ini),
 *        ikutKes, ikutJht, ikutJp}
 * izinList: pengajuan izin/sakit karyawan itu ({jenis, mulai, selesai, status})
 */
// keputusan: { "YYYY-MM-DD": { status: "lembur" | "lupa", jam?: number } } dari Laporan > Cek lembur
export function hitungGaji(records, aturan, gaji, year, month, today = new Date(), izinList = [], keputusan = {}){
  const A = { ...ATURAN_DEFAULT, ...(aturan || {}) };
  // BPJS & PPh 21 diisi manual (lewat kolom gaji tambahan): hitungan otomatis dimatikan
  if (A.potonganManual){ A.bpjsKes = A.bpjsJht = A.bpjsJp = A.pphAktif = false; }
  const G = { gajiPokok: 0, tjJabatan: 0, tjTransport: 0, tunjangan: 0, bonus: 0,
              ikutKes: true, ikutJht: true, ikutJp: true, kenaPph: true, ...(gaji || {}) };
  if (typeof G.bonus !== "number") G.bonus = 0;              // peta bonus per periode harus diubah dulu oleh pemanggil
  // hari kerja per karyawan: "5" Senin–Jumat, "6" Senin–Sabtu, "7" setiap hari (Minggu juga hari kerja; libur nasional tetap libur)
  const POLA = { "5": [1, 2, 3, 4, 5], "6": [1, 2, 3, 4, 5, 6], "7": [0, 1, 2, 3, 4, 5, 6], "7L": [1, 2, 3, 4, 5, 6] };   // 7L: Senin–Sabtu hari kerja, masuk Minggu / tanggal merah = Lebih HK
  // "7L" Setiap Hari (Full) + Lbr + Lebih HK: hari kerja = hari Senin–Sabtu yang diabsen (tanpa denda tidak hadir), lembur dihitung, masuk Minggu / tanggal merah = Lebih HK
  if (G.polaKerja === "28") G.polaKerja = "7L";            // pilihan "28 hari" sudah dihapus -> ikut absen
  const polaIkut = G.polaKerja === "7L";
  if (POLA[G.polaKerja]) A.hariKerja = POLA[G.polaKerja];
  const full = G.polaKerja === "7";
  // Tunjangan tetap (dasar lembur & BPJS): jabatan + lainnya. Transportasi & bonus tidak termasuk.
  const tetap = (G.tjJabatan || 0) + (G.tunjangan || 0);
  const namaLibur = petaLibur(A), libur = new Set(Object.keys(namaLibur));
  const isWork = d => A.hariKerja.includes(d.getDay()) && !libur.has(dayKey(d));
  const todayKey = dayKey(today);
  const izinPeta = petaIzin(izinList);
  const P = rentangPeriode(year, month, A.awalPeriode);

  // Kelompokkan per tanggal: masuk paling awal, pulang paling akhir
  // Shift karyawan (kalau ada); tanpa shift = jam kerja utama perusahaan
  const S = (A.shifts || []).find(x => x.id === G.shift);
  const jamMasuk = S?.masuk || A.jamMasuk, jamPulang = S?.pulang || A.jamPulang;
  const lintas = toMin(jamPulang) <= toMin(jamMasuk);            // shift malam melewati tengah malam
  const hari = {}; let menunggu = 0;
  for (const r of records){
    if (r.status === "menunggu"){ menunggu++; continue; }
    if (r.status === "tolak") continue;
    const d = r.ts?.toDate ? r.ts.toDate() : new Date(r.ts);
    let k = dayKey(d), besok = false;
    // Shift malam: absen pulang dini hari dihitung untuk hari kerja sebelumnya
    if (lintas && r.type === "pulang" && minOf(d) < toMin(jamPulang) + 360){
      k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); besok = true;
    }
    const h = hari[k] ||= { tanggal: k, masuk: null, pulang: null, pulangBesok: false };
    if (r.type === "masuk"  && (!h.masuk  || d < h.masuk))  h.masuk = d;
    if (r.type === "pulang" && (!h.pulang || d > h.pulang)){ h.pulang = d; h.pulangBesok = besok; }
  }

  const enamHari = A.hariKerja.length >= 6;
  // gajiTetap: gaji bulanan penuh, tidak dihitung dari absen (tanpa potongan tidak hadir / telat, tanpa lembur dari absen)
  const mode = G.gajiTetap ? "bulanan" : (G.modeGaji || A.modeGaji || "bulanan");     // cara hitung per karyawan (kalau diisi) atau aturan perusahaan
  // Upah sebulan untuk dasar lembur (PP 35/2021). Upah harian disetarakan 25 hari (6 hari kerja) atau 21 hari (5 hari kerja).
  const upahBulanan = (mode === "harian" || mode === "operator") ? G.gajiPokok * (enamHari ? 25 : 21) : G.gajiPokok;
  const upahJam = (upahBulanan + tetap) / 173;
  const rows = [], kalender = [];   // kalender: semua tanggal di periode (hari kerja / libur), untuk laporan format harian
  let hariKerja = 0, hadir = 0, hadirKerja = 0, alpha = 0, sakit = 0, izin = 0, cuti = 0, kaliTelat = 0, menitTelat = 0,
      jamLembur = 0, uangLembur = 0, tanpaPulang = 0, lebihHK = 0, jamLebihHK = 0;
  // Lebih HK: masuk di tanggal merah / hari libur / hari off (tidak untuk operator & supir)
  // Kerja di hari libur per karyawan per periode: "lhk" (Lebih HK) ATAU "lembur", tidak dicampur. Kosong = ikut aturan perusahaan.
  const kunciPer = year + "-" + pad(month + 1);
  const pilLibur = ((G.liburJadi && typeof G.liburJadi === "object") ? G.liburJadi[kunciPer] : G.liburJadi) || (A.liburLembur === "lembur" ? "lembur" : "lhk");
  const pakaiLebihHK = !G.tanpaLebihHK && mode !== "operator" && pilLibur !== "lembur";
  // Cara bayar Lebih HK: per karyawan ("tidak" | "hari" | "jam") atau ikut aturan perusahaan
  const modeLHK = G.lebihHKMode === "tidak" ? "" : (G.lebihHKMode || A.lebihHKMode || "");

  for (let t = new Date(P.mulai); t < P.akhir; t.setDate(t.getDate() + 1)){
    const d = new Date(t), k = dayKey(d), kerja = isWork(d), h = hari[k];
    kalender.push({ tanggal: k, kerja, libur: kerja ? "" : (namaLibur[k] || "Hari libur") });
    if (kerja) hariKerja++;
    if (!h){
      const z = izinPeta[k];
      if (kerja && z && k <= todayKey){
        if (z === "sakit") sakit++; else if (z === "cuti") cuti++; else izin++;
        rows.push({ tanggal: k, ket: z === "sakit" ? "Sakit" : z === "cuti" ? "Cuti" : "Izin" });
      }
      else if (kerja && k < todayKey){ alpha++; rows.push({ tanggal: k, ket: "Tidak hadir", alpha: true }); }
      continue;
    }
    hadir++; if (kerja) hadirKerja++;
    // Lebih HK bisa dikoreksi admin per tanggal (keputusan.lhkJam: jam; 0 = tidak dihitung Lebih HK)
    const kepH = (keputusan || {})[k], lhkKoreksi = kepH?.lhkJam != null && kepH.lhkJam !== "" && isFinite(+kepH.lhkJam) ? Math.max(0, +kepH.lhkJam) : null;
    // angka Lebih HK yang diisi admin selalu dipakai (juga untuk karyawan yang biasanya tanpa Lebih HK)
    // "Setiap hari" (full masuk): tidak ada Lebih HK dan tidak ada lembur sama sekali
    // hari kerja biasa: Lebih HK hanya kalau diisi admin di Rincian absen (angka > 0)
    // "Setiap hari" (full): tidak ada Lebih HK otomatis, tapi angka yang diisi admin tetap dihitung
    const lebih = full ? lhkKoreksi > 0 && !!h.masuk : (kerja ? lhkKoreksi > 0 && !!h.masuk : lhkKoreksi != null ? lhkKoreksi > 0 && !!h.masuk : pakaiLebihHK && !!h.masuk);
    const jamLHK = !lebih ? 0 : lhkKoreksi != null ? lhkKoreksi : h.pulang && h.masuk ? Math.max(0, Math.floor((h.pulang - h.masuk) / 3600000)) : 0;
    if (lebih){ lebihHK++; jamLebihHK += jamLHK; }
    const row = { tanggal: k, masuk: jam(h.masuk), pulang: jam(h.pulang), pulangTgl: h.pulang && dayKey(h.pulang) !== k ? dayKey(h.pulang) : "", telat: 0, lembur: 0, lebihHK: lebih, jamLHK, lhkKoreksi: lhkKoreksi != null, ket: kerja ? (lebih ? "Lebih HK (diisi admin)" : "") : (lebih ? "Lebih HK · " : h.masuk && pilLibur === "lembur" && pakaiLebihHK === false && !G.tanpaLebihHK && mode !== "operator" ? "Lembur hari libur · " : "") + (namaLibur[k] || "Hari libur") };
    // tidak absen pulang, tapi lemburnya sudah diisi & disetujui admin -> dianggap selesai (bukan "tidak absen pulang")
    const lemburTanpaPulang = !h.pulang && h.masuk && (keputusan || {})[k]?.status === "lembur";
    if (lemburTanpaPulang) row.ket = (lebih ? "Lebih HK · " : "") + "Lembur disetujui (tanpa absen pulang)";
    else if (!h.pulang && k < todayKey){ tanpaPulang++; row.ket = (lebih ? "Lebih HK · " : "") + "Tidak absen pulang"; }

    // "Setiap hari": hari Minggu jam kerjanya bebas -> tidak ada telat (libur nasional memang bukan hari kerja)
    const jamBebas = (G.polaKerja === "7" || polaIkut) && d.getDay() === 0;
    if (jamBebas && h.masuk && !row.ket) row.ket = "Minggu · jam kerja bebas";
    if (kerja && h.masuk && !jamBebas){
      const t = minOf(h.masuk) - toMin(jamMasuk);
      if (t > A.toleransi){ kaliTelat++; menitTelat += t; row.telat = t; }
    }
    const kep = (keputusan || {})[k];
    if (kep) row.cek = kep.status;
    // hari libur/tanggal merah: jam kerja bebas; lamanya kerja masuk Lebih HK, atau lembur kalau pilihan periode ini "lembur"
    // lembur yang diisi / disetujui admin tetap dihitung walau "Hitung lembur dari jam absen" tidak aktif
    // "Setiap hari" (full): lembur otomatis tidak dihitung, kecuali diisi / disetujui admin
    const lemburBoleh = full ? kep?.status === "lembur" && !lebih : (A.lemburAktif || kep?.status === "lembur") && !lebih;
    if (lemburBoleh && h.pulang){
      let menit = 0;
      if (kerja) menit = (minOf(h.pulang) + (h.pulangBesok ? 1440 : 0)) - (toMin(jamPulang) + (lintas ? 1440 : 0)) - (+A.lemburMulaiMenit || 0);
      else if (h.masuk) menit = (h.pulang - h.masuk) / 60000;
      row.lemburTercatat = menit >= A.lemburMinMenit ? Math.floor(menit / 60) : 0;
      // "lupa" = lupa absen pulang: lembur dibatalkan. Kalau lembur perlu disetujui, hanya yang disetujui yang dihitung.
      let j = row.lemburTercatat;
      // pulang sebelum batas lembur (jam pulang + mulai lembur + minimal lembur): tidak ada lembur, persetujuan apa pun diabaikan
      if (!row.lemburTercatat && !kep?.superadmin && !full) j = 0;          // kecuali superadmin yang menetapkan (full: lembur memang diisi manual admin)
      else if (kep?.status === "lupa") j = 0;
      else if (kep?.status === "lembur" && kep.jam != null && kep.jam !== "") j = Math.max(0, Math.floor(+kep.jam));
      else if (A.lemburSetuju && kep?.status !== "lembur") j = 0;
      if (j > 0){
        row.lembur = j; jamLembur += j;
        uangLembur += A.lemburMode === "depnaker" ? lemburDepnaker(j, !kerja, upahJam, enamHari) : j * A.lemburTarif;
      }
    } else if (lemburBoleh && h.masuk && kep?.status === "lembur" && +kep.jam > 0){
      // tidak absen pulang, tapi admin menyetujui lembur dengan jumlah jam tertentu
      const j = Math.floor(+kep.jam);
      row.lembur = j; jamLembur += j;
      uangLembur += A.lemburMode === "depnaker" ? lemburDepnaker(j, !kerja, upahJam, enamHari) : j * A.lemburTarif;
    }
    rows.push(row);
  }

  if (polaIkut){
    // semua hari yang diabsen (termasuk Minggu / tanggal merah) = hari kerja dibayar; Minggu / tanggal merah DITAMBAH Lebih HK
    hadirKerja = hadir; hariKerja = hadir + sakit + cuti + izin;
    alpha = 0; rows.forEach(x => { if (x.alpha){ x.alpha = false; x.ket = "Off (tanpa denda)"; } });
  }
  // Kehadiran manual (upload Excel, mis. operator & supir yang tidak absen di aplikasi): menggantikan hasil absensi
  const manual = G.manual && (G.manual.hari != null || G.manual.lembur != null) ? G.manual : null;
  if (manual){
    hadir = hadirKerja = Math.max(0, +manual.hari || 0);
    alpha = sakit = izin = cuti = kaliTelat = menitTelat = tanpaPulang = menunggu = lebihHK = jamLebihHK = 0;
    jamLembur = Math.max(0, +manual.lembur || 0);
    // Uang lembur: kolom "Uang lembur" di Excel (kalau diisi), atau jam × tarif per jam di Aturan,
    // atau (aturan Depnaker) jam × 1,5 × upah sejam karena rincian per hari tidak diketahui
    uangLembur = manual.uangLembur != null && manual.uangLembur !== "" ? Math.max(0, +manual.uangLembur || 0)
      : A.lemburMode === "depnaker" ? jamLembur * 1.5 * upahJam : jamLembur * A.lemburTarif;
    rows.length = 0;
  }
  if (G.gajiTetap){
    hadir = hadirKerja = hariKerja;            // dianggap masuk penuh
    alpha = sakit = izin = cuti = kaliTelat = menitTelat = tanpaPulang = menunggu = lebihHK = jamLebihHK = 0;
    jamLembur = 0; uangLembur = 0;
    rows.length = 0;
  }
  // Hari masuk yang dibayar: hadir di hari kerja + sakit + izin (kecuali izin dipotong)
  // Group CV tertentu (Aturan gaji): tidak ada denda / potongan gaji pokok untuk hari tidak hadir
  const bebasAlpha = Array.isArray(A.tanpaDendaAlphaCV) && A.tanpaDendaAlphaCV.includes(G.grupCV || "-");
  const hariDibayar = hadirKerja + sakit + cuti + (A.potongIzin ? 0 : izin) + (bebasAlpha && (mode === "prorata" || mode === "harian") ? alpha : 0);   // cuti = hari dibayar
  const pembagi = A.pembagi > 0 ? A.pembagi : hariKerja;
  let gpDibayar = G.gajiPokok;
  if (mode === "prorata" && !polaIkut) gpDibayar = pembagi ? Math.round(G.gajiPokok / pembagi * Math.min(hariDibayar, pembagi)) : 0;
  if (mode === "harian" || mode === "operator") gpDibayar = G.gajiPokok * hariDibayar;

  // Uang Lebih HK: per hari atau per jam. Tarif: isian karyawan > tarif perusahaan > otomatis (upah sehari / upah sejam)
  let tarifLebihHK = 0, uangLebihHK = 0;
  if (modeLHK && lebihHK){
    const otomatis = modeLHK === "jam" ? upahJam
      : (mode === "harian" || mode === "operator") ? G.gajiPokok : (pembagi ? (G.gajiPokok + tetap) / pembagi : 0);
    tarifLebihHK = +G.uLebihHK > 0 ? +G.uLebihHK : +A.lebihHKTarif > 0 ? +A.lebihHKTarif : Math.round(otomatis);
    uangLebihHK = Math.round((modeLHK === "jam" ? jamLebihHK : lebihHK) * tarifLebihHK);
  }
  const base = (mode === "harian" || mode === "operator" ? gpDibayar : G.gajiPokok) + tetap;
  // Mode operator: lembur = jam × U Lembur karyawan (bila diisi); uang makan & transport hanya dari isian karyawan
  const operator = mode === "operator";
  if (operator){ A.bpjsKes = A.bpjsJht = A.bpjsJp = A.pphAktif = false; }   // rumus operator: tanpa BPJS/PPh otomatis
  const uLembur = +(manual?.uLembur ?? "") > 0 ? +manual.uLembur : +G.uLembur || 0;
  // U Lembur per karyawan (bila diisi) berlaku untuk semua cara hitung: jam lembur × tarif karyawan itu
  if (uLembur > 0 && !(manual && manual.uangLembur != null && manual.uangLembur !== "")) uangLembur = jamLembur * uLembur;
  // Tambahan/potongan dari Excel kehadiran manual & mode operator
  const ekstra = [];
  const jSiang = Math.max(0, +(manual?.jSiang) || 0), uSiang = +(manual?.uSiang ?? "") > 0 ? +manual.uSiang : +G.uSiang || 0;
  if (jSiang && uSiang) ekstra.push({ nama: `Jam siang (${nf(jSiang)} jam × ${rp(uSiang)})`, jumlah: Math.round(jSiang * uSiang), jenis: "tambah" });
  // Trip / ritase (supir): jumlah trip × U Trip (dari Excel, atau isian karyawan)
  const trip = Math.max(0, +(manual?.trip) || 0), uTrip = +(manual?.uTrip ?? "") > 0 ? +manual.uTrip : +G.uTrip || 0;
  if (trip) ekstra.push(uTrip ? { nama: `Trip (${nf(trip)} × ${rp(uTrip)})`, jumlah: Math.round(trip * uTrip), jenis: "tambah" }
    : { nama: `Trip (${nf(trip)} trip · U Trip belum diisi)`, jumlah: 0, jenis: "tambah", tampilNol: true });   // tetap tampil walau tarifnya belum diisi
  if (+manual?.uKer > 0) ekstra.push({ nama: "Uang Ker", jumlah: Math.round(+manual.uKer), jenis: "tambah" });
  if (+manual?.pinjaman > 0) ekstra.push({ nama: "Pinjaman", jumlah: Math.round(+manual.pinjaman), jenis: "potong" });
  if (+manual?.pinjamanSio > 0) ekstra.push({ nama: "Pinjaman SIO", jumlah: Math.round(+manual.pinjamanSio), jenis: "potong" });
  if (+manual?.potBpjs > 0) ekstra.push({ nama: "Potongan BPJS", jumlah: Math.round(+manual.potBpjs), jenis: "potong" });
  if (+manual?.violence > 0) ekstra.push({ nama: "Violence", jumlah: Math.round(+manual.violence), jenis: "potong" });
  const p = {
    gajiPokok: gpDibayar,
    tjJabatan: G.tjJabatan || 0,
    tjTransport: G.tjTransport || 0,
    tunjangan: G.tunjangan || 0,
    bonus: G.bonus || 0,
    // gaji tetap penuh = all in: uang makan & transport harian tidak ditambahkan (tambahan lewat Bonus / Komponen khusus)
    // gaji tetap penuh (tidak absen): uang makan = total yang diinput manual untuk bulan itu (Rp)
    uangMakan: G.gajiTetap ? Math.round(+G.umIni || 0) : hadir * (+G.uangMakan > 0 ? +G.uangMakan : (operator ? 0 : A.uangMakan)),
    transport: operator || G.gajiTetap ? 0 : hadir * A.transport,
    lembur: Math.round(uangLembur),
    uangLebihHK,
    potTelat: kaliTelat * (+A.telatPerKejadian || 0),      // denda telat = jumlah hari telat × denda telat per hari
    // Potongan per hari hanya untuk mode bulanan; di mode lain hari tidak masuk memang tidak dibayar
    potAlpha: mode === "bulanan" && A.potongAlpha && !bebasAlpha && pembagi ? Math.round(G.gajiPokok / pembagi * alpha) : 0,
    potIzin:  mode === "bulanan" && A.potongIzin  && pembagi ? Math.round(G.gajiPokok / pembagi * izin) : 0,
    // BPJS hanya dipotong kalau aktif di Aturan DAN karyawan ikut program itu
    bpjsKes: A.bpjsKes && G.ikutKes !== false ? Math.round(Math.min(base, A.capKes) * A.pctKes / 100) : 0,
    bpjsJht: A.bpjsJht && G.ikutJht !== false ? Math.round(base * A.pctJht / 100) : 0,
    bpjsJp:  A.bpjsJp  && G.ikutJp  !== false ? Math.round(Math.min(base, A.capJp) * A.pctJp / 100) : 0
  };
  // Iuran bagian perusahaan (info biaya perusahaan; tidak memotong gaji). JKK & JKM ikut program BPJS Ketenagakerjaan (JHT).
  const ikutTK = A.bpjsJht && G.ikutJht !== false;
  p.iuranPerusahaan = {
    kes: A.bpjsKes && G.ikutKes !== false ? Math.round(Math.min(base, A.capKes) * (A.pctKesP ?? 4) / 100) : 0,
    jht: ikutTK ? Math.round(base * (A.pctJhtP ?? 3.7) / 100) : 0,
    jp:  A.bpjsJp && G.ikutJp !== false ? Math.round(Math.min(base, A.capJp) * (A.pctJpP ?? 2) / 100) : 0,
    jkk: ikutTK ? Math.round(base * (A.pctJkk ?? 0.24) / 100) : 0,
    jkm: ikutTK ? Math.round(base * (A.pctJkm ?? 0.3) / 100) : 0
  };
  p.totalIuranPerusahaan = Object.values(p.iuranPerusahaan).reduce((a, x) => a + x, 0);
  p.upahBpjs = base;
  // Komponen khusus per karyawan (setiap bulan + periode ini): tambahan atau potongan
  const komponen = [...ekstra, ...(G.komponenList || [])].filter(k => k && k.nama && (+k.jumlah || k.tampilNol));
  p.komponen = komponen.map(k => ({ nama: k.nama, jumlah: Math.round(+k.jumlah), jenis: k.jenis === "potong" ? "potong" : "tambah" }));
  p.komponenTambah = p.komponen.filter(k => k.jenis === "tambah").reduce((a, k) => a + k.jumlah, 0);
  p.komponenPotong = p.komponen.filter(k => k.jenis === "potong").reduce((a, k) => a + k.jumlah, 0);
  p.bruto = p.gajiPokok + p.tjJabatan + p.tjTransport + p.tunjangan + p.bonus + p.uangMakan + p.transport + p.lembur + p.uangLebihHK + p.komponenTambah;
  // PPh 21
  const kenaPph = A.pphAktif && G.kenaPph !== false;
  p.pphMetode = A.pphMetode === "ter" ? "ter" : "tarif";   // data lama tanpa pilihan: tetap tarif rata
  // penghasilan bruto untuk pajak: yang dibayarkan (setelah potongan telat/alpa/izin) + premi JKK, JKM & BPJS Kesehatan dari perusahaan
  p.brutoPajak = Math.max(0, p.bruto - p.potTelat - p.potAlpha - p.potIzin) + p.iuranPerusahaan.kes + p.iuranPerusahaan.jkk + p.iuranPerusahaan.jkm;
  p.iuranPensiunKaryawan = p.bpjsJht + p.bpjsJp;   // pengurang penghasilan bruto saat dihitung setahun
  p.ptkp = PTKP[G.ptkp] ? G.ptkp : "TK/0";
  p.tanpaNpwp = !!G.tanpaNpwp;
  p.pphLebih = 0;
  if (!kenaPph) p.pph = 0;
  else if (p.pphMetode === "tarif"){
    // tarif rata × dasar (bruto, atau bruto dikurangi iuran JHT & JP karyawan)
    p.dasarPph = A.dasarPph === "neto" ? Math.max(0, p.bruto - p.bpjsJht - p.bpjsJp) : p.bruto;
    p.pph = Math.round(p.dasarPph * (A.pctPph || 0) / 100);
  } else if (G.pphSetahun){
    // Desember / bulan terakhir: hitung setahun (G.pphSetahun = jumlah Januari s/d bulan lalu dari slip tersimpan)
    const L = G.pphSetahun, bulan = (+L.bulan || 0) + 1;
    const bruto = (+L.bruto || 0) + p.brutoPajak, iuran = (+L.iuran || 0) + p.iuranPensiunKaryawan;
    const biayaJabatan = Math.min(Math.floor(bruto * 5 / 100), 500000 * bulan);
    const neto = Math.max(0, bruto - biayaJabatan - iuran);
    const pkp = Math.max(0, Math.floor((neto - PTKP[p.ptkp]) / 1000) * 1000);
    let setahun = pphPasal17(pkp); if (p.tanpaNpwp) setahun = Math.floor(setahun * 1.2);
    const selisih = setahun - (+L.pph || 0);
    p.pphTahunan = { bulan, bruto, biayaJabatan, iuran, neto, ptkp: PTKP[p.ptkp], pkp, setahun, sudah: +L.pph || 0 };
    p.pph = Math.max(0, selisih);
    p.pphLebih = Math.max(0, -selisih);       // kelebihan potong dikembalikan ke karyawan
  } else {
    p.terKategori = kategoriTER(p.ptkp);
    p.terPersen = tarifTER(p.ptkp, p.brutoPajak);
    p.pph = Math.floor(p.brutoPajak * p.terPersen / 100 * (p.tanpaNpwp ? 1.2 : 1));
  }
  // Potongan BPJS & PPh 21 dari menu Pajak & BPJS (sudah direview) untuk periode ini: menggantikan hitungan otomatis
  const pjk = G.pajakPotong && typeof G.pajakPotong === "object" ? G.pajakPotong[kunciPer] : null;
  if (pjk){
    p.bpjsKes = Math.round(+pjk.kes || 0); p.bpjsJht = Math.round(+pjk.jht || 0); p.bpjsJp = Math.round(+pjk.jp || 0);
    p.pph = Math.max(0, Math.round(+pjk.pph || 0)); p.pphLebih = Math.max(0, Math.round(+pjk.lebih || 0));
    p.dariPajak = true; p.pajakLabel = pjk.label || ""; delete p.terPersen; delete p.pphTahunan;
  }
  // Angsuran pinjaman periode ini (dihitung dari menu Pinjaman; tidak memengaruhi PPh)
  p.pinjaman = (G.pinjamanList || []).filter(x => x && +x.jumlah > 0).map(x => ({ id: x.id || "", nama: x.nama, jumlah: Math.round(+x.jumlah) }));
  p.potPinjaman = p.pinjaman.reduce((a, x) => a + x.jumlah, 0);
  p.potongan = p.potTelat + p.potAlpha + p.potIzin + p.bpjsKes + p.bpjsJht + p.bpjsJp + p.pph + p.komponenPotong + p.potPinjaman;
  p.bersih = Math.max(0, p.bruto - p.potongan + (p.pphLebih || 0));

  return { tarifLembur: uLembur > 0 && !(manual && manual.uangLembur != null && manual.uangLembur !== "") ? uLembur : 0, manual: manual ? { hari: hadirKerja, lembur: jamLembur, jSiang, trip, ket: manual.ket || "", ...(manual.kosong ? { kosong: true } : {}) } : null, aturan: A, gaji: G, periodeLabel: P.label, shiftNama: S ? S.nama + " (" + S.masuk + "–" + S.pulang + ")" : "", mode, hariDibayar, pembagi, rows, kalender, menunggu, gajiTetap: !!G.gajiTetap, bebasAlpha,
    // Group CV tanpa potongan tidak hadir: HK yang tampil = hari yang diabsen (gaji tetap penuh); hari kerja kalender tetap disimpan
    hariKerja: bebasAlpha && !G.gajiTetap && !manual ? hadirKerja + sakit + cuti + izin : hariKerja, hariKerjaKalender: hariKerja, hadir, hadirKerja, lebihHK, jamLebihHK, tarifLebihHK, lebihHKMode: modeLHK, liburJadi: pilLibur, alpha, sakit, izin, cuti, kaliTelat, menitTelat, jamLembur, tanpaPulang, ...p };
}

// Rincian gaji sebagai HTML (dipakai di layar dan slip cetak)
export function rincianHTML(r, harian = true){
  const A = r.aturan, mode = r.mode || A.modeGaji || "bulanan";
  const gpLabel = (mode === "harian" || mode === "operator") ? `Upah harian (${r.bebasAlpha && r.alpha ? "tetap " : ""}${nf(r.hariDibayar)} hari × ${rp(r.gaji.gajiPokok)})`
    : mode === "prorata" ? (r.bebasAlpha ? "Gaji pokok (tetap)" : `Gaji pokok (${nf(Math.min(r.hariDibayar, r.pembagi))}/${nf(r.pembagi)} hari × ${rp(r.gaji.gajiPokok)})`)
    : "Gaji pokok";
  const baris = (k, v, neg) => `<tr><td>${k}</td><td class="num">${neg && v ? "−" : ""}${rp(v)}</td></tr>`;
  let h = `<table class="slip">
    <tr><th colspan="2">Pendapatan</th></tr>
    ${baris(gpLabel, r.gajiPokok)}
    ${r.tjJabatan ? baris("Tunjangan jabatan", r.tjJabatan) : ""}
    ${r.tjTransport ? baris("Tunjangan transportasi", r.tjTransport) : ""}
    ${r.tunjangan ? baris("Tunjangan lainnya", r.tunjangan) : ""}
    ${r.bonus ? baris("Bonus", r.bonus) : ""}
    ${r.uangMakan ? baris(r.gajiTetap ? "Uang makan" : `Uang makan (${r.hadir} hari)`, r.uangMakan) : ""}
    ${A.transport ? baris(`Transport (${r.hadir} hari)`, r.transport) : ""}
    ${A.lemburAktif || r.lembur > 0 ? baris(`Lembur (${nf(r.jamLembur)} jam${r.tarifLembur ? " × " + rp(r.tarifLembur) : ""})`, r.lembur) : ""}
    ${r.uangLebihHK ? baris(`Lebih HK (${r.lebihHKMode === "jam" ? nf(r.jamLebihHK) + " jam" : nf(r.lebihHK) + " hari"} × ${rp(r.tarifLebihHK)})`, r.uangLebihHK) : ""}
    ${(r.komponen || []).filter(k => k.jenis === "tambah").map(k => k.jumlah ? baris(esc(k.nama), k.jumlah) : `<tr><td>${esc(k.nama)}</td><td class="num">–</td></tr>`).join("")}
    <tr class="subtotal"><td>Total pendapatan</td><td class="num">${rp(r.bruto)}</td></tr>
    <tr><th colspan="2">Potongan</th></tr>
    ${A.telatPerKejadian ? baris(`Denda telat (${nf(r.kaliTelat)} hari × ${rp(A.telatPerKejadian)})`, r.potTelat, 1) : ""}
    ${mode === "bulanan" && A.potongAlpha && !r.bebasAlpha ? baris(`Tidak hadir (${r.alpha} hari)`, r.potAlpha, 1) : ""}
    ${mode === "bulanan" && A.potongIzin ? baris(`Izin (${r.izin || 0} hari)`, r.potIzin, 1) : ""}
    ${(A.bpjsKes || r.dariPajak) && r.bpjsKes ? baris(r.dariPajak ? "BPJS Kesehatan" : `BPJS Kesehatan ${pct(A.pctKes)}%`, r.bpjsKes, 1) : ""}
    ${(A.bpjsJht || r.dariPajak) && r.bpjsJht ? baris(r.dariPajak ? "BPJS JHT" : `BPJS JHT ${pct(A.pctJht)}%`, r.bpjsJht, 1) : ""}
    ${(A.bpjsJp || r.dariPajak)  && r.bpjsJp  ? baris(r.dariPajak ? "BPJS Pensiun (JP)" : `BPJS Pensiun ${pct(A.pctJp)}%`, r.bpjsJp, 1) : ""}
    ${(r.komponen || []).filter(k => k.jenis === "potong").map(k => baris(esc(k.nama), k.jumlah, 1)).join("")}
    ${(r.pinjaman || []).map(k => baris(esc(k.nama), k.jumlah, 1)).join("")}
    ${r.dariPajak && r.pph ? baris(`PPh 21${r.pajakLabel ? " (" + esc(r.pajakLabel) + ")" : ""}`, r.pph, 1) : ""}
    ${!r.dariPajak && A.pphAktif && r.pph ? baris(r.pphTahunan ? `PPh 21 (hitung setahun, ${r.ptkp})`
      : r.terPersen != null ? `PPh 21 TER ${r.terKategori} ${pct(r.terPersen)}% × ${rp(r.brutoPajak)}${r.tanpaNpwp ? " (+20% tanpa NPWP)" : ""}`
      : `PPh 21 ${pct(A.pctPph)}%${A.dasarPph === "neto" ? " (dari bruto − JHT & JP)" : ""}`, r.pph, 1) : ""}
    <tr class="subtotal"><td>Total potongan</td><td class="num">−${rp(r.potongan)}</td></tr>
    ${r.pphLebih ? `<tr><td>Pengembalian kelebihan PPh 21</td><td class="num">${rp(r.pphLebih)}</td></tr>` : ""}
    <tr class="total"><td>Gaji bersih</td><td class="num">${rp(r.bersih)}</td></tr>
  </table>${r.pphTahunan ? pphTahunanHTML(r) : ""}${iuranPerusahaanHTML(r)}${r.gaji?.noRek ? `<p class="slip-rek">Ditransfer ke: <b>${esc(r.gaji.bank || "")} ${esc(r.gaji.noRek)}</b>${r.gaji.atasNama ? " a.n. " + esc(r.gaji.atasNama) : ""}</p>` : ""}`;
  h += rekapAbsenHTML(r);
  if (harian) h += harianHTML(r);
  return h;
}
// Rincian PPh 21 setahun (slip Desember / bulan terakhir)
function pphTahunanHTML(r){
  const t = r.pphTahunan, b = (k, v, neg) => `<tr><td>${k}</td><td class="num">${neg ? "−" : ""}${rp(v)}</td></tr>`;
  return `<h3 class="rekap-judul">PPh 21 setahun (${nf(t.bulan)} bulan)</h3><table class="slip">
    ${b("Penghasilan bruto setahun", t.bruto)}${b("Biaya jabatan (5%, maks. Rp 500.000/bulan)", t.biayaJabatan, 1)}
    ${b("Iuran JHT &amp; JP karyawan", t.iuran, 1)}${b("Penghasilan neto", t.neto)}${b("PTKP " + esc(r.ptkp), t.ptkp, 1)}
    ${b("Penghasilan kena pajak", t.pkp)}${b("PPh 21 setahun (pasal 17)" + (r.tanpaNpwp ? " +20%" : ""), t.setahun)}
    ${b("Sudah dipotong Januari s/d bulan lalu", t.sudah, 1)}
    <tr class="subtotal"><td>${t.setahun >= t.sudah ? "PPh 21 bulan ini" : "Kelebihan potong (dikembalikan)"}</td><td class="num">${rp(Math.abs(t.setahun - t.sudah))}</td></tr></table>`;
}
// Iuran BPJS bagian perusahaan (info, tidak memotong gaji)
export function iuranPerusahaanHTML(r){
  const i = r.iuranPerusahaan; if (!i || !r.totalIuranPerusahaan) return "";
  const b = (k, v) => v ? `<tr><td>${k}</td><td class="num">${rp(v)}</td></tr>` : "";
  return `<h3 class="rekap-judul">Ditanggung perusahaan (tidak memotong gaji)</h3><table class="slip">
    ${b("BPJS Kesehatan", i.kes)}${b("BPJS JHT", i.jht)}${b("BPJS Pensiun (JP)", i.jp)}${b("BPJS JKK", i.jkk)}${b("BPJS JKM", i.jkm)}
    <tr class="subtotal"><td>Total iuran perusahaan</td><td class="num">${rp(r.totalIuranPerusahaan)}</td></tr></table>`;
}
// Rekap absensi satu periode (ditampilkan di bawah gaji bersih)
export function rekapAbsenHTML(r){
  const sel = (k, v) => `<td>${k}</td><td class="num">${v}</td>`;
  if (r.gajiTetap) return `<p class="meta rekap-judul">Gaji tetap penuh · tidak dihitung dari absen</p>`;
  if (r.manual) return `<h3 class="rekap-judul">Rekap kehadiran (input manual)</h3>
  <table class="slip rekap">
    <tr>${sel("Hari kerja dibayar", nf(r.hadirKerja))}${sel("Lembur", nf(r.jamLembur) + " jam")}</tr>
    ${r.manual.jSiang || r.manual.trip ? `<tr>${sel("Jam siang", r.manual.jSiang ? nf(r.manual.jSiang) + " jam" : "-")}${sel("Trip", r.manual.trip ? nf(r.manual.trip) + "x" : "-")}</tr>` : ""}
    ${r.manual.ket ? `<tr><td colspan="4" class="meta">${esc(r.manual.ket)}</td></tr>` : ""}
  </table>`;
  return `<h3 class="rekap-judul">Rekap absensi</h3>
  <table class="slip rekap">
    <tr>${sel("Hari kerja", nf(r.hariKerja))}${sel("Hadir", nf(r.hadirKerja))}</tr>
    <tr>${sel("Telat", nf(r.kaliTelat) + "×" + (r.menitTelat ? " (" + nf(r.menitTelat) + " menit)" : ""))}${sel("Tidak hadir", nf(r.alpha))}</tr>
    <tr>${sel("Sakit", nf(r.sakit))}${sel("Izin", nf(r.izin))}</tr>
    <tr>${sel("Cuti", nf(r.cuti || 0))}${sel("Lebih HK", nf(r.lebihHK || 0) + " hari" + (r.jamLebihHK ? " (" + nf(r.jamLebihHK) + " jam)" : ""))}</tr>
    <tr>${sel("Lembur", nf(r.jamLembur) + " jam")}${sel("Tidak absen pulang", nf(r.tanpaPulang || 0) + "×")}</tr>
  </table>`;
}
// Tabel absensi harian (halaman 2 saat dicetak)
export function harianHTML(r){
  if (!r.rows?.length) return "";
  return `<table class="slip harian"><tr><th>Tanggal</th><th>Masuk</th><th>Pulang</th><th>Telat</th><th>Lembur</th><th>Ket.</th></tr>` +
    r.rows.map(x => `<tr${x.alpha ? ' class="alpha"' : ""}><td>${tglMedium(x.tanggal)}</td>
      <td>${x.masuk || "-"}</td><td>${x.pulang || "-"}</td><td>${x.telat ? x.telat + "m" : ""}</td>
      <td>${x.lembur ? x.lembur + "j" : ""}</td><td>${esc(x.ket)}</td></tr>`).join("") + `</table>`;
}

// Satu atau banyak slip dalam satu jendela cetak; tiap slip di halaman terpisah.
// Kop perusahaan untuk dokumen cetak
export const kopHTML = pt => pt?.nama ? `<div class="kop">${pt.logo ? `<img src="${pt.logo}" alt="">` : ""}<div><b>${esc(pt.nama)}</b>${pt.alamat ? `<span>${esc(pt.alamat)}</span>` : ""}${pt.telp ? `<span>Telp. ${esc(pt.telp)}</span>` : ""}</div></div>` : "";
export const KOP_CSS = ".kop{display:flex;align-items:center;gap:12px;border-bottom:2px solid #13213C;padding-bottom:8px;margin-bottom:14px}.kop img{max-height:56px;max-width:120px;object-fit:contain}.kop b{display:block;font-size:1.1rem}.kop span{display:block;color:#5B6878;font-size:.85rem}";
export function cetakSlips(list, judul = "Slip Gaji", pt = null){
  const w = window.open("", "_blank");
  if (!w) return false;
  // Halaman 1: slip + rekap absensi. Halaman 2: rincian absensi harian.
  const halaman = list.map(({ r, nama, periode }) => `<section class="page">${kopHTML(pt)}
    <h1>Slip Gaji</h1><p>${esc(nama)} · ${esc(periode)}</p>
    ${rincianHTML(r, false)}</section>
    ${r.rows?.length ? `<section class="page">${kopHTML(pt)}
    <h1>Rincian Absensi</h1><p>${esc(nama)} · ${esc(periode)}${r.periodeLabel && r.periodeLabel !== periode ? " · " + esc(r.periodeLabel) : ""}</p>
    ${harianHTML(r)}</section>` : ""}`).join("");
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${esc(judul)}</title>
  <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:24px auto;padding:0 16px;color:#13213C}
  h1{font-size:1.3rem;margin:0}p{margin:4px 0 16px;color:#5B6878}
  table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:.92rem}
  th{text-align:left;padding:8px 0 4px;border-bottom:1.5px solid #13213C}td{padding:5px 0;border-bottom:1px solid #D5DDD9}
  .num{text-align:right;font-variant-numeric:tabular-nums}.subtotal td{font-weight:600}.total td{font-weight:800;font-size:1.05rem;border-top:2px solid #13213C}
  .harian td,.harian th{padding:4px 6px 4px 0;font-size:.82rem}.alpha td{color:#C2412D}
  ${KOP_CSS}
  .slip-rek{margin:10px 0 0;font-size:.92em;color:#3B4757}
  .rekap-judul{font-size:.95rem;margin:22px 0 4px}
  .rekap td{padding:5px 8px 5px 0}.rekap td.num{padding-right:22px;font-weight:600}
  .page{page-break-after:always;break-after:page;padding-bottom:24px}.page:last-child{page-break-after:auto;break-after:auto}
  @media screen{.page+.page{border-top:2px dashed #D5DDD9;padding-top:24px}}</style></head>
  <body>${halaman}<script>print()<\/script></body></html>`);
  w.document.close();
  return true;
}
export const cetakSlip = (r, nama, periode, pt = null) => cetakSlips([{ r, nama, periode }], `Slip Gaji ${nama} ${periode}`, pt);

// Helper periode "YYYY-MM"
export const ym = (y, m) => y + "-" + String(m + 1).padStart(2, "0");
export function ym12(now = new Date()){ const d = new Date(now.getFullYear(), now.getMonth() - 11, 1); return ym(d.getFullYear(), d.getMonth()); }
// Hasil hitungan siap disimpan ke Firestore (tanpa nilai undefined)
export const bersihkan = r => JSON.parse(JSON.stringify(r));

// Hari cuti terpakai dalam tahun tertentu dari daftar pengajuan cuti yang disetujui
export function cutiTerpakai(list, tahun, aturan){
  const a = tahun + "-01-01", b = tahun + "-12-31";
  return (list || []).filter(z => z.jenis === "cuti" && z.status === "terima" && z.selesai >= a && z.mulai <= b)
    .reduce((n, z) => n + hariKerjaAntara(z.mulai < a ? a : z.mulai, z.selesai > b ? b : z.selesai, aturan), 0);
}
// Jumlah hari kerja antara dua tanggal (untuk info pengajuan izin)
export function hariKerjaAntara(mulai, selesai, aturan){
  const A = { ...ATURAN_DEFAULT, ...(aturan || {}) }, libur = new Set(Object.keys(petaLibur(A)));
  const [y1, m1, d1] = mulai.split("-").map(Number), [y2, m2, d2] = selesai.split("-").map(Number);
  let n = 0;
  for (let d = new Date(y1, m1 - 1, d1), akhir = new Date(y2, m2 - 1, d2); d <= akhir; d.setDate(d.getDate() + 1))
    if (A.hariKerja.includes(d.getDay()) && !libur.has(dayKey(d))) n++;
  return n;
}
export const fmtTgl = s => tglMedium(s);
export const rentang = z => (z.mulai === z.selesai ? fmtTgl(z.mulai) : fmtTgl(z.mulai) + " – " + fmtTgl(z.selesai)) + (z.jam ? " jam " + z.jam : "");

export const MODE_GAJI = {
  prorata: "Berdasarkan hari kerja",
  harian:  "Upah harian",
  bulanan: "Bulanan tetap"
};

// Data gaji karyawan untuk satu periode: bonus diambil dari peta bonus {"2026-09": 500000}
// kolomDef: kolom gaji tambahan perusahaan [{ id, nama, jenis: "potong"|"tambah", periode: bool }]
//   nilai tetap disimpan di g.kolomTetap {id: n}, nilai per periode di g.kolomPer {"2026-10": {id: n}}
//   kolom per periode yang tidak diisi di suatu bulan memakai nilai bulan terakhir sebelumnya (disamakan, kecuali diubah; isi 0 untuk berhenti)
export const nilaiWarisan = (g, k, periode) => { const per = g?.kolomPer || {};
  const lalu = Object.keys(per).filter(p => p < periode && per[p] && Object.prototype.hasOwnProperty.call(per[p], k.id)).sort().pop();
  return lalu ? +per[lalu][k.id] || 0 : 0; };
export const nilaiKolom = (g, k, periode) => { if (!k.periode) return +(g?.kolomTetap?.[k.id]) || 0;
  const ini = g?.kolomPer?.[periode];
  return ini && Object.prototype.hasOwnProperty.call(ini, k.id) ? +ini[k.id] || 0 : nilaiWarisan(g, k, periode); };
// tanpaKomponen: perusahaan menyembunyikan "Komponen khusus" -> isinya tidak dihitung
// Kolom gaji tambahan yang namanya tarif (mis. "U Lembur", "Tarif lembur", "U Lebih HK") dipakai sebagai TARIF, bukan tambahan gaji
export const KOLOM_TARIF = [["uLembur", /^(u\.?|upah|tarif) ?lembur( ?(\/|per) ?jam)?$|^(uang )?lembur ?(\/|per) ?jam$/i],
  ["uLebihHK", /^(u\.?|upah|tarif) ?lebih ?hk( ?(\/|per) ?(hari|jam))?$/i], ["uSiang", /^(u\.?|upah|tarif) ?siang$/i], ["uTrip", /^(u\.?|upah|tarif) ?trip$/i]];
const tarifKolom = k => (KOLOM_TARIF.find(([, re]) => re.test(String(k.nama || "").trim())) || [])[0] || "";
export const gajiPeriode = (g, periode, kolomDef = [], tanpaKomponen = false) => g ? { ...g,
  umIni: (g.umBulan && typeof g.umBulan === "object") ? (+g.umBulan[periode] || 0) : 0,
  ...Object.fromEntries((kolomDef || []).map(k => [tarifKolom(k), nilaiKolom(g, k, periode)]).filter(([f, v]) => f && v > 0 && !(+g[f] > 0))),
  bonus: (g.bonus && typeof g.bonus === "object") ? (g.bonus[periode] || 0) : 0,
  komponenList: [...(kolomDef || []).filter(k => !tarifKolom(k)).map(k => ({ nama: k.nama, jenis: k.jenis === "tambah" ? "tambah" : "potong", jumlah: nilaiKolom(g, k, periode) })).filter(k => k.jumlah > 0),
    ...(tanpaKomponen ? [] : [...(g.komponenTetap || []), ...((g.komponen && typeof g.komponen === "object") ? (g.komponen[periode] || []) : [])])] } : g;

/* Periode absensi/gaji. Periode "bulan m" berakhir di bulan m.
   awal = 1  -> 1 s/d akhir bulan m
   awal = 26 -> 26 bulan (m-1) s/d 25 bulan m                      */
export function rentangPeriode(year, month, awal = 1){
  awal = Math.min(28, Math.max(1, parseInt(awal, 10) || 1));
  const mulai = awal === 1 ? new Date(year, month, 1) : new Date(year, month - 1, awal);
  const akhir = awal === 1 ? new Date(year, month + 1, 1) : new Date(year, month, awal);     // batas akhir (tidak termasuk)
  const terakhir = new Date(akhir.getFullYear(), akhir.getMonth(), akhir.getDate() - 1);
  const label = awal === 1 ? namaBulan(year, month) : tglMedium(mulai) + " – " + tglMedium(terakhir);
  return { mulai, akhir, label, awalKey: dayKey(mulai), akhirKey: dayKey(terakhir) };
}

/* ================= PINJAMAN KARYAWAN =================
   Dokumen companies/{cid}/pinjaman/{id}:
   { uid, nama, jumlah, tenor, angsuran, mulai: "YYYY-MM" (periode gaji pertama dipotong), tanggal, ket,
     pelunasan?: { ym, cara: "gaji" | "tunai" }, status: "aktif" | "batal" }
   Angsuran terakhir = sisa pokok, jadi totalnya selalu pas. */
export const ymTambah = (ym, n) => { const [y, m] = ym.split("-").map(Number), d = new Date(y, m - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
export const ymLabel = ym => { const [y, m] = String(ym || "").split("-").map(Number); return y ? namaBulan(y, m - 1) : "-"; };
export function jadwalPinjaman(p){
  const n = Math.max(1, Math.round(+p.tenor || 1)), pokok = Math.max(0, Math.round(+p.jumlah || 0));
  const cicil = Math.round(+p.angsuran) || Math.ceil(pokok / n);
  const out = []; let sisa = pokok;
  for (let i = 0; i < n && sisa > 0; i++){
    const j = i === n - 1 ? sisa : Math.min(cicil, sisa);
    sisa -= j; out.push({ ym: ymTambah(p.mulai, i), ke: i + 1, jumlah: j, sisa });
  }
  // Dilunasi lewat potong gaji: semua sisa ditagih di periode pelunasan; lunas tunai: tidak ada potongan mulai periode itu
  const L = p.pelunasan;
  if (L?.ym){
    const sebelum = out.filter(a => a.ym < L.ym);
    const terbayar = sebelum.reduce((t, a) => t + a.jumlah, 0);
    if (L.cara === "gaji" && pokok - terbayar > 0) sebelum.push({ ym: L.ym, ke: sebelum.length + 1, jumlah: pokok - terbayar, sisa: 0, pelunasan: true });
    return sebelum;
  }
  return out;
}
// Potongan pinjaman untuk satu periode gaji (dipakai di Hitung gaji)
export function angsuranPeriode(list, ym){
  // pinjaman "manual" tidak dipotong otomatis: potongannya diisi sendiri (kolom Pinjaman / Pinjaman SIO di Excel)
  return (list || []).filter(p => p && p.status !== "batal" && p.potong !== "manual").flatMap(p => {
    // "ketik": jumlah bayar diketik admin di Gaji > Karyawan, tersimpan di p.bayar[periode]
    if (p.potong === "ketik"){
      const v = Math.round(+(p.bayar || {})[ym] || 0);
      return v > 0 ? [{ id: p.id || "", jumlah: v, nama: "Bayar " + (p.jenis === "sio" ? "pinjaman SIO" : "pinjaman") + (p.ket ? " · " + p.ket : "") }] : [];
    }
    const jd = jadwalPinjaman(p), x = jd.find(a => a.ym === ym);
    if (!x) return [];
    const n = (p.pelunasan?.ym ? jadwalPinjaman({ ...p, pelunasan: null }) : jd).length;
    return [{ id: p.id || "", jumlah: x.jumlah,
      nama: (x.pelunasan ? "Pelunasan " : "Angsuran ") + (p.jenis === "sio" ? "pinjaman SIO" : "pinjaman") + (x.pelunasan ? "" : " " + x.ke + "/" + n) + (p.ket ? " · " + p.ket : "") }];
  });
}
// Ringkasan status pinjaman pada periode tertentu (angsuran periode itu dianggap sudah dipotong)
export const KOLOM_PINJAMAN = { pinjaman: "Pinjaman", pinjamanSio: "Pinjaman SIO" };
export function statusPinjaman(p, ym){
  const pokok = Math.round(+p.jumlah || 0);
  if (p.potong === "manual" || p.potong === "ketik"){
    // pembayaran tercatat per periode di p.bayar {"2026-10": 300000} (diisi otomatis dari upload Excel)
    const daftar = Object.entries(p.bayar || {}).filter(([, v]) => +v > 0).sort((a, b) => a[0].localeCompare(b[0]));
    let sisaJalan = pokok;
    const jd = daftar.map(([k, v], i) => { sisaJalan = Math.max(0, sisaJalan - +v); return { ym: k, ke: i + 1, jumlah: +v, sisa: sisaJalan }; });
    const lewat = jd.filter(a => a.ym <= ym), dibayar = lewat.reduce((t, a) => t + a.jumlah, 0);
    const tunai = p.pelunasan?.cara === "tunai" && p.pelunasan.ym <= ym;
    const sisa = tunai ? 0 : Math.max(0, pokok - dibayar);
    return { manual: true, jadwal: jd, sisa, terbayar: pokok - sisa, kali: lewat.length, total: jd.length, lunas: p.status !== "batal" && sisa === 0,
      berikut: null, akhir: jd.at(-1)?.ym || p.mulai, tunai };
  }
  const jd = jadwalPinjaman(p);
  const lewat = jd.filter(a => a.ym <= ym), terbayarGaji = lewat.reduce((t, a) => t + a.jumlah, 0);
  const tunai = p.pelunasan?.cara === "tunai" && p.pelunasan.ym <= ym;
  const sisa = tunai ? 0 : Math.max(0, pokok - terbayarGaji);
  const berikut = jd.find(a => a.ym > ym);
  return { jadwal: jd, sisa, terbayar: pokok - sisa, kali: lewat.length, total: jd.length, lunas: p.status !== "batal" && sisa === 0,
    berikut, akhir: jd.at(-1)?.ym || p.mulai, tunai };
}
