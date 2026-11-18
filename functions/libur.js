// Salinan daftar libur dari payroll.js (dipakai Cloud Functions). Perbarui bersama payroll.js.
const LIBUR_NASIONAL = {
  2026: { "2026-01-01": "Tahun Baru 2026 Masehi", "2026-01-16": "Isra Mikraj Nabi Muhammad saw.", "2026-02-17": "Tahun Baru Imlek 2577 Kongzili", "2026-03-19": "Hari Suci Nyepi (Tahun Baru Saka 1948)", "2026-03-21": "Idulfitri 1447 H", "2026-03-22": "Idulfitri 1447 H", "2026-04-03": "Wafat Yesus Kristus", "2026-04-05": "Kebangkitan Yesus Kristus (Paskah)", "2026-05-01": "Hari Buruh Internasional", "2026-05-14": "Kenaikan Yesus Kristus", "2026-05-27": "Iduladha 1447 H", "2026-05-31": "Hari Raya Waisak 2570 BE", "2026-06-01": "Hari Lahir Pancasila", "2026-06-16": "1 Muharam Tahun Baru Islam 1448 H", "2026-08-17": "Proklamasi Kemerdekaan", "2026-08-25": "Maulid Nabi Muhammad saw.", "2026-12-25": "Kelahiran Yesus Kristus (Natal)" },
  2027: { "2027-01-01": "Tahun Baru 2027 Masehi", "2027-01-05": "Isra Mikraj Nabi Muhammad saw.", "2027-02-06": "Tahun Baru Imlek 2578 Kongzili", "2027-03-08": "Hari Suci Nyepi (Tahun Baru Saka 1949)", "2027-03-10": "Idulfitri 1448 H", "2027-03-11": "Idulfitri 1448 H", "2027-03-26": "Wafat Yesus Kristus", "2027-03-28": "Kebangkitan Yesus Kristus (Paskah)", "2027-05-01": "Hari Buruh Internasional", "2027-05-06": "Kenaikan Yesus Kristus", "2027-05-17": "Iduladha 1448 H", "2027-05-20": "Hari Raya Waisak 2571 BE", "2027-06-01": "Hari Lahir Pancasila", "2027-06-06": "1 Muharam Tahun Baru Islam 1449 H", "2027-08-15": "Maulid Nabi Muhammad saw.", "2027-08-17": "Proklamasi Kemerdekaan", "2027-12-25": "Kelahiran Yesus Kristus (Natal)", "2027-12-26": "Isra Mikraj Nabi Muhammad saw." }
};
const CUTI_BERSAMA = {
  2026: { "2026-02-16": "Cuti bersama Tahun Baru Imlek", "2026-03-18": "Cuti bersama Nyepi", "2026-03-20": "Cuti bersama Idulfitri", "2026-03-23": "Cuti bersama Idulfitri", "2026-03-24": "Cuti bersama Idulfitri", "2026-05-15": "Cuti bersama Kenaikan Yesus Kristus", "2026-05-28": "Cuti bersama Iduladha", "2026-12-24": "Cuti bersama Natal" },
  2027: { "2027-02-05": "Cuti bersama Tahun Baru Imlek", "2027-03-09": "Cuti bersama Idulfitri", "2027-03-12": "Cuti bersama Idulfitri", "2027-03-15": "Cuti bersama Idulfitri", "2027-03-25": "Cuti bersama Wafat Yesus Kristus", "2027-05-18": "Cuti bersama Iduladha", "2027-05-19": "Cuti bersama Waisak", "2027-12-24": "Cuti bersama Natal" }
};
function petaLibur(A = {}){
  const nasional = {}, cuti = {};
  for (const th of Object.values(LIBUR_NASIONAL)) Object.assign(nasional, th);
  for (const th of Object.values(CUTI_BERSAMA)) Object.assign(cuti, th);
  for (const [d, e] of Object.entries(A.liburEdit || {})){
    if (!e || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    delete nasional[d]; delete cuti[d];
    if (e.hapus) continue;
    (e.j === "cuti" ? cuti : nasional)[d] = e.n || "Libur";
  }
  const peta = {};
  if (A.liburNasional !== false) Object.assign(peta, nasional);
  if (A.cutiBersama) Object.assign(peta, cuti);
  for (const d of (A.libur || [])) peta[d] = "Libur perusahaan";
  return peta;
}
// Hari libur / tanggal merah / hari off untuk tanggal "YYYY-MM-DD" (hari 0=Minggu..6=Sabtu)
function hariLibur(A, tgl, hari){
  const kerja = Array.isArray(A.hariKerja) && A.hariKerja.length ? A.hariKerja : [1, 2, 3, 4, 5];
  return !kerja.includes(hari) || !!petaLibur(A)[tgl];
}
module.exports = { petaLibur, hariLibur };
