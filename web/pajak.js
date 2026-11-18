// Menu Pajak & BPJS: kertas kerja PPh 21 TER + iuran BPJS per karyawan per bulan (format seperti kertas kerja konsultan pajak)
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db, $, msg, toast, fmtNum, catatLog, tanya, VERSI_APP } from "./common.js";
import { PTKP, kategoriTER, tarifTER, pphPasal17, esc, rp } from "./payroll.js";
import { bacaTabel, bacaSemuaSheet, buatXlsx, buatXlsxGaya } from "./excel.js";

export const PAJAK_DEFAULT = { dasar: "tetap", upah: 0, kesP: 4, kesK: 1, jhtP: 3.7, jhtK: 2, jpP: 2, jpK: 1, jkk: 0.24, jkm: 0.3, capKes: 12000000, capJp: 10547400 };
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const angka = v => { const n = Number(String(v ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")); return isFinite(n) ? n : 0; };
const dec = v => { const n = Number(String(v ?? "").trim().replace(",", ".")); return isFinite(n) ? n : 0; };
const fmt2 = n => (+n || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/* ---------- hitungan satu karyawan satu bulan ----------
   g: data pajak karyawan (payroll doc), set: pengaturan, isi: { gaji, thr }, lalu: jumlah Jan s/d bulan lalu (khusus Desember) */
export function hitungPajak(g, set, isi, bulanKe, lalu){
  const gaji = +isi.gaji || 0, thr = +isi.thr || 0;
  const upah = +g.upahBpjs > 0 ? +g.upahBpjs : set.dasar === "tetap" && +set.upah > 0 ? +set.upah : gaji;
  const ikutKes = g.ikutKes !== false, ikutTK = g.ikutJht !== false, ikutJp = g.ikutJp !== false;
  const p = (x, pct) => x * (+pct || 0) / 100;
  const r = { gaji, thr, upah,
    kesP: ikutKes ? p(Math.min(upah, set.capKes || upah), set.kesP) : 0, kesK: ikutKes ? p(Math.min(upah, set.capKes || upah), set.kesK) : 0,
    jkk: ikutTK ? p(upah, set.jkk) : 0, jkm: ikutTK ? p(upah, set.jkm) : 0,
    jhtP: ikutTK ? p(upah, set.jhtP) : 0, jhtK: ikutTK ? p(upah, set.jhtK) : 0,
    jpP: ikutJp ? p(Math.min(upah, set.capJp || upah), set.jpP) : 0, jpK: ikutJp ? p(Math.min(upah, set.capJp || upah), set.jpK) : 0 };
  if (isi.tetap){ for (const k of ["jkk", "jkm", "kesP"]) if (isi.tetap[k] != null) r[k] = +isi.tetap[k] || 0; r.dariExcel = true; }
  if (!gaji && !thr){ Object.keys(r).forEach(k => { if (k !== "upah") r[k] = 0; }); }
  r.ptkp = PTKP[g.ptkp] ? g.ptkp : "TK/0";
  r.ter = "TER " + kategoriTER(r.ptkp);
  r.bruto = Math.round(gaji + thr + r.jkk + r.jkm + r.kesP);
  r.iuranK = r.jhtK + r.jpK;
  const npwp = g.tanpaNpwp ? 1.2 : 1;
  if (bulanKe === 12 && lalu && (gaji || thr)){
    const bln = (lalu.bulan || 0) + 1, bruto = (lalu.bruto || 0) + r.bruto, iuran = (lalu.iuran || 0) + r.iuranK;
    const bj = Math.min(bruto * 0.05, 500000 * bln), neto = bruto - bj - iuran;
    const pkp = Math.max(0, Math.floor((neto - PTKP[r.ptkp]) / 1000) * 1000);
    const setahun = Math.round(pphPasal17(pkp) * npwp);
    r.tahunan = { bulan: bln, bruto, bj: Math.round(bj), iuran: Math.round(iuran), neto: Math.round(neto), ptkp: PTKP[r.ptkp], pkp, setahun, sudah: lalu.pph || 0 };
    r.tarif = null; r.pph = setahun - (lalu.pph || 0);       // negatif = lebih potong
  } else {
    r.tarif = r.bruto ? tarifTER(r.ptkp, r.bruto) : 0;
    r.pph = Math.round(r.bruto * r.tarif / 100 * npwp);
  }
  return r;
}

/* ---------- menu ---------- */
export function pasangPajak(ctx){
  // ctx: { CID(), me(), profile(), isAdmin(), popup, unduh(blob, nama) }
  const D = (...p) => doc(db, "companies", ctx.CID(), ...p), C = (...p) => collection(db, "companies", ctx.CID(), ...p);
  let set = { ...PAJAK_DEFAULT }, users = [], gmap = {}, isi = {}, hasil = [], ym = "", siap = false, kotor = false;
  { const n = new Date(); n.setMonth(n.getMonth() - 1); $("#pjk-bulan").value = n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"); }

  async function muatDasar(){
    const [sSnap, uSnap, pSnap] = await Promise.all([getDoc(D("settings", "pajak")), getDocs(query(collection(db, "users"), where("cid", "==", ctx.CID()))), getDocs(C("payroll"))]);
    set = { ...PAJAK_DEFAULT, ...(sSnap.exists() ? sSnap.data() : {}) };
    users = uSnap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.kehadiran !== "tidak" && (!ctx.cvBoleh || ctx.cvBoleh(u)))   // sama dengan daftar Gaji (termasuk akun superadmin yang terdaftar di perusahaan ini)
      .sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    gmap = Object.fromEntries(pSnap.docs.map(d => [d.id, d.data()]));
    isiPengaturan(); renderData(); siap = true;
  }
  ctx.saatBuka = async () => { if (!siap){ try{ await muatDasar(); }catch(e){ msg($("#pjk-msg"), "Gagal memuat: " + (e.code || e.message), "bad"); } } };
  const statusOf = u => (gmap[u.uid] || {}).statusPegawai === "tidak" ? "TIDAK TETAP" : "KARTAP";

  /* ----- Pengaturan ----- */
  const F = ["kesP", "kesK", "jhtP", "jhtK", "jpP", "jpK", "jkk", "jkm"];
  function isiPengaturan(){
    $("#pja-dasar").value = set.dasar; $("#pja-upah").value = set.upah ? fmtNum(set.upah) : "";
    F.forEach(k => $("#pja-" + k).value = fmt2(set[k]));
    $("#pja-capKes").value = fmtNum(set.capKes); $("#pja-capJp").value = fmtNum(set.capJp);
    $("#pja-upah-wrap").hidden = set.dasar !== "tetap";
  }
  $("#pja-dasar").onchange = () => { $("#pja-upah-wrap").hidden = $("#pja-dasar").value !== "tetap"; };
  $("#pja-simpan").onclick = async () => {
    const baru = { dasar: $("#pja-dasar").value, upah: angka($("#pja-upah").value), capKes: angka($("#pja-capKes").value), capJp: angka($("#pja-capJp").value) };
    F.forEach(k => baru[k] = dec($("#pja-" + k).value));
    if (baru.dasar === "tetap" && !baru.upah){ msg($("#pja-msg"), "Isi upah dasar BPJS.", "bad"); return; }
    try{ await setDoc(D("settings", "pajak"), { ...baru, diubah: serverTimestamp(), oleh: ctx.profile().nama }); set = { ...PAJAK_DEFAULT, ...baru };
      msg($("#pja-msg"), "Pengaturan tersimpan.", "ok"); catatLog(ctx.CID(), ctx.me().uid, ctx.profile(), "pengaturan", "Mengubah pengaturan Pajak & BPJS");
      if (hasil.length) hitungUlang(); }
    catch(e){ msg($("#pja-msg"), e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal: " + e.code, "bad"); }
  };

  /* ----- Data karyawan ----- */
  function renderData(){
    const q = norm($("#pjd-cari").value);
    const list = users.filter(u => !q || norm(u.nama).includes(q));
    $("#pjd-out").innerHTML = `<div class="tablewrap"><table class="pjd-tbl"><thead><tr><th>Nama</th><th>Status</th><th>L/P</th><th>NIK</th><th>PTKP</th><th title="Belum punya NPWP: PPh +20%">Tanpa NPWP</th><th>BPJS Kes</th><th>BPJS TK</th><th>JP</th><th>Upah BPJS khusus</th></tr></thead><tbody>
      ${list.map(u => { const g = gmap[u.uid] || {}, c = k => g[k] !== false ? "checked" : "";
        return `<tr data-uid="${esc(u.uid)}"><td><b>${esc(u.nama)}</b><div class="meta">${esc(u.jabatan || "")}</div></td>
        <td><select class="d-status"><option value="tetap">Tetap</option><option value="tidak" ${g.statusPegawai === "tidak" ? "selected" : ""}>Tidak tetap</option></select></td>
        <td><select class="d-jk"><option value="">–</option><option ${g.jk === "L" ? "selected" : ""}>L</option><option ${g.jk === "P" ? "selected" : ""}>P</option></select></td>
        <td><input class="d-nik" inputmode="numeric" maxlength="16" value="${esc(g.npwp || "")}" placeholder="16 digit"></td>
        <td><select class="d-ptkp">${Object.keys(PTKP).map(x => `<option ${(g.ptkp || "TK/0") === x ? "selected" : ""}>${x}</option>`).join("")}</select></td>
        <td class="c"><input type="checkbox" class="d-npwp" ${g.tanpaNpwp ? "checked" : ""} aria-label="Tanpa NPWP"></td>
        <td class="c"><input type="checkbox" class="d-kes" ${c("ikutKes")} aria-label="BPJS Kesehatan"></td>
        <td class="c"><input type="checkbox" class="d-tk" ${c("ikutJht")} aria-label="BPJS Ketenagakerjaan"></td>
        <td class="c"><input type="checkbox" class="d-jp" ${c("ikutJp")} aria-label="Jaminan Pensiun"></td>
        <td><input class="d-upah" inputmode="numeric" data-num="int" value="${+g.upahBpjs > 0 ? fmtNum(g.upahBpjs) : ""}" placeholder="ikut pengaturan"></td></tr>`; }).join("")}</tbody></table></div>`;
  }
  $("#pjd-cari").oninput = renderData;
  $("#pjd-simpan").onclick = async () => {
    const rows = [...document.querySelectorAll("#pjd-out tr[data-uid]")];
    try{
      for (const tr of rows){
        const uid = tr.dataset.uid, v = s => tr.querySelector(s);
        const data = { statusPegawai: v(".d-status").value, jk: v(".d-jk").value, npwp: v(".d-nik").value.replace(/\D/g, "").slice(0, 16), ptkp: v(".d-ptkp").value,
          tanpaNpwp: v(".d-npwp").checked, ikutKes: v(".d-kes").checked, ikutJht: v(".d-tk").checked, ikutJp: v(".d-jp").checked, upahBpjs: angka(v(".d-upah").value) || "" };
        const lama = gmap[uid] || {};
        if (Object.keys(data).some(k => String(lama[k] ?? (k.startsWith("ikut") ? true : "")) !== String(data[k]))){
          await setDoc(D("payroll", uid), { ...data, appVer: VERSI_APP }, { merge: true }); gmap[uid] = { ...lama, ...data }; }
      }
      msg($("#pjd-msg"), "Data karyawan tersimpan.", "ok"); catatLog(ctx.CID(), ctx.me().uid, ctx.profile(), "ubah", "Mengubah data pajak karyawan");
      if (hasil.length) hitungUlang();
    }catch(e){ msg($("#pjd-msg"), "Gagal: " + (e.code || e.message), "bad"); }
  };

  /* ----- Kertas kerja ----- */
  let lalu = {};
  $("#pjk-go").onclick = async () => {
    if (kotor && !await tanya("Perubahan bulan sebelumnya belum disimpan. Tetap pindah?", { ya: "Pindah" })) return;
    await muatBulan();
  };
  async function muatBulan(){
    ym = $("#pjk-bulan").value; if (!ym) return;
    $("#pjk-go").disabled = true; msg($("#pjk-msg"), "Memuat…");
    try{
      if (!siap) await muatDasar();
      const [y, m] = ym.split("-").map(Number);
      const d = await getDoc(D("pajak", ym)); isi = d.exists() ? (d.data().data || {}) : {};
      lalu = {};
      if (m === 12){
        const s = await getDocs(query(C("pajak"), where("periode", ">=", y + "-01"), where("periode", "<", ym)));
        s.docs.forEach(x => { for (const [uid, h] of Object.entries(x.data().hasil || {})){ if (!h.bruto) continue;
          const t = (lalu[uid] ||= { bulan: 0, bruto: 0, pph: 0, iuran: 0 }); t.bulan++; t.bruto += +h.bruto || 0; t.pph += +h.pph || 0; t.iuran += +h.iuranK || 0; } });
      }
      kotor = false; hitungUlang(); msg($("#pjk-msg"), d.exists() ? "" : "Belum ada data bulan ini. Klik \"Ambil dari slip gaji\", ketik gaji, atau upload Excel.");
      $("#pjk-aksi").hidden = false;
    }catch(e){ msg($("#pjk-msg"), e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal memuat: " + (e.code || e.message), "bad"); }
    $("#pjk-go").disabled = false;
  }
  // Dari Gaji › Hitung: gaji (total pendapatan sebelum potongan) semua karyawan langsung masuk ke kertas kerja untuk direview
  ctx.terimaDariGaji = async (bulan, daftar) => {
    $("#pjk-bulan").value = bulan; kotor = false;
    if (!siap || daftar.some(x => !users.some(u => u.uid === x.uid))) await muatDasar();   // ada karyawan baru / berubah: muat ulang daftar
    // semua yang dikirim dari Gaji wajib tampil di kertas kerja, apa pun peran / statusnya
    for (const x of daftar) if (!users.some(u => u.uid === x.uid)){
      try{ const d = await getDoc(doc(db, "users", x.uid)); if (d.exists()) users.push({ uid: d.id, ...d.data() }); }catch(e){}
    }
    users.sort((a, b) => (a.nama || "").localeCompare(b.nama || ""));
    document.querySelector('#tab-pajak [data-s="sub-pj-kerja"]')?.click();
    await muatBulan();
    let n = 0;
    for (const { uid, gaji } of daftar){ const o = (isi[uid] ||= {}); o.gaji = Math.round(+gaji || 0); o.sumber = "gaji"; n++; }
    kotor = true; hitungUlang();
    msg($("#pjk-msg"), `Gaji ${fmtNum(n)} karyawan dari Gaji › Hitung sudah masuk. Review perhitungannya; kalau sudah benar klik "Kirim ke slip karyawan".`, "ok");
  };
  function hitungUlang(){
    const m = +ym.slice(5, 7);
    hasil = users.filter(u => u.aktif !== false || isi[u.uid]).map(u => ({ u, g: gmap[u.uid] || {}, r: hitungPajak(gmap[u.uid] || {}, set, isi[u.uid] || {}, m, lalu[u.uid] || { bulan: 0, bruto: 0, pph: 0, iuran: 0 }) }));
    render();
  }
  function render(){
    const m = +ym.slice(5, 7), des = m === 12;
    const grup = [["KARTAP", hasil.filter(x => statusOf(x.u) === "KARTAP")], ["TIDAK TETAP", hasil.filter(x => statusOf(x.u) !== "KARTAP")]];
    const T = (l, k) => l.reduce((a, x) => a + (+x.r[k] || 0), 0);
    const baris = (x, i) => { const r = x.r;
      return `<tr data-uid="${esc(x.u.uid)}" class="${r.gaji || r.thr ? "" : "kosong"}"><td>${i + 1}</td><td><b>${esc(x.u.nama)}</b>${x.g.npwp ? "" : '<div class="meta warn">NIK belum diisi</div>'}</td>
        <td>${esc(r.ptkp)}</td><td>${r.tahunan ? "Setahun" : esc(r.ter)}</td>
        <td><input class="i-gaji" inputmode="numeric" data-num="int" value="${r.gaji ? fmtNum(r.gaji) : ""}" aria-label="Gaji ${esc(x.u.nama)}"></td>
        <td><input class="i-thr" inputmode="numeric" data-num="int" value="${r.thr ? fmtNum(r.thr) : ""}" aria-label="THR ${esc(x.u.nama)}"></td>
        <td class="n">${fmt2(r.jkk)}</td><td class="n">${fmt2(r.jkm)}</td><td class="n">${fmt2(r.kesP)}</td><td class="n"><b>${fmtNum(r.bruto)}</b></td>
        <td class="n">${r.tahunan ? "–" : fmt2(r.tarif) + "%"}</td><td class="n"><b class="${r.pph < 0 ? "lebih" : ""}">${fmtNum(r.pph)}</b>${r.tahunan ? `<button type="button" class="link-btn b-tahunan">rincian</button>` : ""}</td>
        <td class="n">${fmt2(r.kesK)}</td><td class="n">${fmt2(r.jhtK)}</td><td class="n">${fmt2(r.jpK)}</td></tr>`; };
    const sub = (l, nama) => `<tr class="subtotal"><td colspan="4">Jumlah ${nama}</td><td class="n">${fmtNum(T(l, "gaji"))}</td><td class="n">${fmtNum(T(l, "thr"))}</td><td class="n">${fmt2(T(l, "jkk"))}</td><td class="n">${fmt2(T(l, "jkm"))}</td><td class="n">${fmt2(T(l, "kesP"))}</td><td class="n">${fmtNum(T(l, "bruto"))}</td><td></td><td class="n">${fmtNum(T(l, "pph"))}</td><td class="n">${fmt2(T(l, "kesK"))}</td><td class="n">${fmt2(T(l, "jhtK"))}</td><td class="n">${fmt2(T(l, "jpK"))}</td></tr>`;
    const ada = hasil.filter(x => x.r.gaji || x.r.thr);
    $("#pjk-info").textContent = `${BULAN[m - 1]} ${ym.slice(0, 4)} · ${fmtNum(ada.length)} karyawan bergaji · dasar BPJS ${set.dasar === "tetap" ? "Rp " + fmtNum(set.upah) : "gaji bulan ini"} · JKK ${fmt2(set.jkk)}%${des ? " · Desember: PPh dihitung setahun dari data Januari–November yang tersimpan" : ""}`;
    $("#pjk-out").innerHTML = `<div class="pjk-ringkas">
        <div><b>${fmtNum(T(hasil, "bruto"))}</b><span>Penghasilan bruto</span></div><div><b>${fmtNum(T(hasil, "pph"))}</b><span>PPh 21</span></div>
        <div><b>${fmtNum(Math.round(T(hasil, "kesP") + T(hasil, "kesK")))}</b><span>BPJS Kesehatan (5%)</span></div>
        <div><b>${fmtNum(Math.round(T(hasil, "jkk") + T(hasil, "jkm") + T(hasil, "jhtP") + T(hasil, "jhtK") + T(hasil, "jpP") + T(hasil, "jpK")))}</b><span>BPJS Ketenagakerjaan</span></div></div>
      <div class="tablewrap"><table class="pjk-tbl"><thead><tr><th>No</th><th>Nama</th><th>PTKP</th><th>TER</th><th>Gaji</th><th>THR</th><th>JKK</th><th>JKM</th><th>Kesehatan</th><th>Bruto</th><th>Tarif</th><th>PPh 21</th>
        <th title="Dipotong dari karyawan">Kes 1%</th><th title="Dipotong dari karyawan">JHT 2%</th><th title="Dipotong dari karyawan">JP 1%</th></tr></thead>
      ${grup.filter(([, l]) => l.length).map(([nama, l]) => `<tbody><tr class="grup"><td colspan="15">${nama}</td></tr>${l.map(baris).join("")}${sub(l, nama.toLowerCase())}</tbody>`).join("")}
      <tfoot>${sub(hasil, "semua").replace('class="subtotal"', 'class="total"')}</tfoot></table></div>
      <p class="meta">Gaji = total gaji sebulan sebelum potongan. Bruto = Gaji + THR + JKK + JKM + Kesehatan perusahaan. ${ada.length < hasil.length ? "Baris pucat: gaji belum diisi." : ""}</p>`;
    $("#pjk-out").querySelectorAll(".i-gaji,.i-thr").forEach(inp => inp.onchange = () => {
      const uid = inp.closest("tr").dataset.uid, o = (isi[uid] ||= {});
      o[inp.classList.contains("i-gaji") ? "gaji" : "thr"] = angka(inp.value); o.sumber = o.sumber === "slip" ? "slip+ubah" : (o.sumber || "manual");
      kotor = true; hitungUlang();
      setTimeout(() => document.querySelector(`#pjk-out tr[data-uid="${CSS.escape(uid)}"] .${inp.classList[0]}`)?.focus(), 0);
    });
    $("#pjk-out").querySelectorAll(".b-tahunan").forEach(b => b.onclick = () => rincianTahunan(hasil.find(x => x.u.uid === b.closest("tr").dataset.uid), b));
  }
  function rincianTahunan(x, tombol){
    const t = x.r.tahunan, row = (k, v) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`;
    const box = document.createElement("div");
    box.innerHTML = `<table class="slip">${row("Masa kerja tahun ini", fmtNum(t.bulan) + " bulan")}${row("Penghasilan bruto setahun", rp(t.bruto))}${row("Biaya jabatan (5%, maks 500rb/bulan)", "−" + rp(t.bj))}
      ${row("Iuran JHT &amp; JP karyawan", "−" + rp(t.iuran))}${row("Penghasilan neto", rp(t.neto))}${row("PTKP " + esc(x.r.ptkp), "−" + rp(t.ptkp))}${row("PKP (dibulatkan ribuan)", rp(t.pkp))}
      ${row("PPh 21 setahun (pasal 17)", rp(t.setahun))}${row("Sudah dipotong Jan–Nov", "−" + rp(t.sudah))}
      <tr class="total"><td>${x.r.pph >= 0 ? "PPh 21 Desember" : "Lebih potong (dikembalikan)"}</td><td class="n">${rp(Math.abs(x.r.pph))}</td></tr></table>
      <div class="btns" style="margin-top:12px"><button type="button" class="small alt t-tutup">Tutup</button></div>`;
    document.body.append(box); box.querySelector(".t-tutup").onclick = () => { box.hidden = true; };
    ctx.popup(box, "PPh 21 setahun · " + x.u.nama, tombol);
  }
  // Ambil gaji (total sebelum potongan) dari slip gaji yang sudah disimpan di menu Gaji
  $("#pjk-slip").onclick = async () => {
    try{
      const s = await getDocs(query(C("slips"), where("periode", "==", ym)));
      if (!s.size){ msg($("#pjk-msg"), "Belum ada slip gaji tersimpan untuk " + BULAN[+ym.slice(5, 7) - 1] + ". Simpan slip di menu Gaji dulu, atau ketik / upload gaji.", "bad"); return; }
      let n = 0;
      s.docs.forEach(d => { const x = d.data(), h = x.hasil || {}; if (!x.uid) return;
        const o = (isi[x.uid] ||= {}); o.gaji = Math.round(+h.bruto || 0); o.sumber = "slip"; n++; });
      kotor = true; hitungUlang(); msg($("#pjk-msg"), `Gaji ${fmtNum(n)} karyawan diambil dari slip gaji (total pendapatan sebelum potongan). Periksa lalu klik Simpan.`, "ok");
    }catch(e){ msg($("#pjk-msg"), "Gagal: " + (e.code || e.message), "bad"); }
  };
  // Upload Excel: kolom Nama (atau NIK / Username), Gaji, THR
  $("#pjk-template").onclick = () => {
    const rows = [["Nama", "NIK", "Gaji", "THR"], ...users.filter(u => u.aktif !== false).map(u => [u.nama, (gmap[u.uid] || {}).npwp || "", (isi[u.uid] || {}).gaji || "", (isi[u.uid] || {}).thr || ""])];
    ctx.unduh(buatXlsx(rows, "Gaji " + ym, [32, 20, 16, 14]), "template-gaji-pajak-" + ym + ".xlsx");
  };
  $("#pjk-upload").onclick = () => $("#pjk-file").click();
  $("#pjk-file").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try{
      const t = await bacaTabel(f); const head = (t[0] || []).map(norm);
      const iN = head.findIndex(h => h.includes("nama")), iK = head.findIndex(h => h === "nik" || h.includes("nik") || h.includes("npwp")), iU = head.findIndex(h => h.includes("username"));
      const iG = head.findIndex(h => h.includes("gaji") || h.includes("bruto")), iT = head.findIndex(h => h === "thr" || h.includes("thr"));
      if (iG < 0 || (iN < 0 && iK < 0 && iU < 0)){ msg($("#pjk-msg"), "Kolom tidak dikenali. Pakai judul kolom: Nama (atau NIK), Gaji, THR.", "bad"); return; }
      let ok = 0; const gagal = [];
      for (const r of t.slice(1)){
        if (!r || r.every(c => c === "" || c == null)) continue;
        const nik = iK >= 0 ? String(r[iK] ?? "").replace(/\D/g, "") : "", nm = iN >= 0 ? norm(r[iN]) : "", us = iU >= 0 ? norm(r[iU]) : "";
        const u = (nik && users.find(x => (gmap[x.uid] || {}).npwp === nik)) || (us && users.find(x => norm(x.username) === us)) || (nm && users.find(x => norm(x.nama) === nm));
        if (!u){ gagal.push(iN >= 0 ? r[iN] : nik); continue; }
        const o = (isi[u.uid] ||= {}); o.gaji = Math.round(typeof r[iG] === "number" ? r[iG] : angka(r[iG])); if (iT >= 0) o.thr = Math.round(typeof r[iT] === "number" ? r[iT] : angka(r[iT])); o.sumber = "excel"; ok++;
      }
      kotor = true; hitungUlang();
      msg($("#pjk-msg"), `${fmtNum(ok)} karyawan diisi dari ${f.name}.` + (gagal.length ? ` Tidak ditemukan: ${gagal.slice(0, 8).join(", ")}${gagal.length > 8 ? ", …" : ""}` : "") + " Periksa lalu klik Simpan.", gagal.length ? "bad" : "ok");
    }catch(err){ msg($("#pjk-msg"), "Gagal membaca file: " + (err.message || err), "bad"); }
  };
  async function simpanKertas(){
    const h = Object.fromEntries(hasil.filter(x => x.r.gaji || x.r.thr).map(({ u, r }) => [u.uid, { nama: u.nama, bruto: r.bruto, pph: r.pph, iuranK: Math.round(r.iuranK * 100) / 100,
      kesP: r.kesP, kesK: r.kesK, jkk: r.jkk, jkm: r.jkm, jhtP: r.jhtP, jhtK: r.jhtK, jpP: r.jpP, jpK: r.jpK, ptkp: r.ptkp, tarif: r.tarif }]));
    const data = Object.fromEntries(Object.entries(isi).filter(([, o]) => (+o.gaji || 0) || (+o.thr || 0)));
    await setDoc(D("pajak", ym), { periode: ym, data, hasil: h, pengaturan: set, diubah: serverTimestamp(), oleh: ctx.profile().nama });
    kotor = false;
  }
  // Kirim potongan BPJS karyawan & PPh 21 ke slip gaji bulan ini, lalu hitung ulang & simpan slip di menu Gaji
  $("#pjk-kirim").onclick = async () => {
    const l = hasil.filter(x => x.r.gaji || x.r.thr);
    if (!l.length){ msg($("#pjk-msg"), "Belum ada gaji yang terisi.", "bad"); return; }
    if (!await tanya(`Kirim potongan BPJS karyawan & PPh 21 ${BULAN[+ym.slice(5, 7) - 1]} untuk ${fmtNum(l.length)} karyawan ke slip gaji?\nSetelah itu gaji dihitung ulang di menu Gaji, lalu Anda diminta konfirmasi untuk menyimpan slip ke semua karyawan.\n\nPastikan kolom BPJS / PPh21 yang diketik manual di Gaji › Karyawan untuk bulan ini kosong, supaya tidak terpotong dua kali.`, { ya: "Kirim" })) return;
    $("#pjk-kirim").disabled = true; msg($("#pjk-msg"), "Mengirim…");
    try{
      await simpanKertas();
      for (const { u, r } of l){
        const potong = { kes: Math.round(r.kesK), jht: Math.round(r.jhtK), jp: Math.round(r.jpK), pph: Math.max(0, r.pph), lebih: Math.max(0, -r.pph),
          label: r.tahunan ? "dihitung setahun" : (r.ter + " " + String(r.tarif).replace(".", ",") + "%"), dikirim: new Date().toISOString(), oleh: ctx.profile().nama };
        await setDoc(D("payroll", u.uid), { pajakPotong: { [ym]: potong }, appVer: VERSI_APP }, { merge: true });
        gmap[u.uid] = { ...(gmap[u.uid] || {}), pajakPotong: { ...((gmap[u.uid] || {}).pajakPotong || {}), [ym]: potong } };
      }
      catatLog(ctx.CID(), ctx.me().uid, ctx.profile(), "ubah", `Mengirim potongan BPJS & PPh 21 ${ym} ke slip (${l.length} karyawan)`);
      msg($("#pjk-msg"), "Potongan terkirim. Membuka menu Gaji…", "ok");
      await ctx.kirimSlip(ym);
    }catch(e){ msg($("#pjk-msg"), e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal: " + (e.code || e.message), "bad"); }
    $("#pjk-kirim").disabled = false;
  };
  $("#pjk-simpan").onclick = async () => {
    const h = Object.fromEntries(hasil.filter(x => x.r.gaji || x.r.thr).map(({ u, r }) => [u.uid, { nama: u.nama, bruto: r.bruto, pph: r.pph, iuranK: Math.round(r.iuranK * 100) / 100,
      kesP: r.kesP, kesK: r.kesK, jkk: r.jkk, jkm: r.jkm, jhtP: r.jhtP, jhtK: r.jhtK, jpP: r.jpP, jpK: r.jpK, ptkp: r.ptkp, tarif: r.tarif }]));
    const data = Object.fromEntries(Object.entries(isi).filter(([, o]) => (+o.gaji || 0) || (+o.thr || 0)));
    try{
      await setDoc(D("pajak", ym), { periode: ym, data, hasil: h, pengaturan: set, diubah: serverTimestamp(), oleh: ctx.profile().nama });
      kotor = false; msg($("#pjk-msg"), "Kertas kerja " + BULAN[+ym.slice(5, 7) - 1] + " tersimpan.", "ok");
      catatLog(ctx.CID(), ctx.me().uid, ctx.profile(), "ubah", "Menyimpan kertas kerja PPh 21 & BPJS " + ym);
    }catch(e){ msg($("#pjk-msg"), e.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal: " + e.code, "bad"); }
  };
  // Unduh kertas kerja: kolom seperti kertas kerja konsultan (NIK, NITKU, alamat, jabatan, L/P, PTKP, TER, ... PPh 21)
  $("#pjk-xlsx").onclick = () => {
    const H = s => ({ v: s, s: "kepala" }), n = v => ({ v: Math.round((+v || 0) * 100) / 100, s: "isiAngka" }), t = v => ({ v: v ?? "", s: "teks" });
    const judul = ["NO.", "NAMA KARYAWAN", "STATUS", "NIK / PASPOR", "NITKU", "ALAMAT", "JABATAN", "L/P", "PTKP", "TER", "Gaji Pokok", "THR", "JKK", "JKM", "KESEHATAN", "Penghasilan Bruto", "Tarif TER", "PPh 21"];
    const baris = [[{ v: "KERTAS KERJA PPh 21 · " + BULAN[+ym.slice(5, 7) - 1].toUpperCase() + " " + ym.slice(0, 4), s: "judul" }], judul.map(H)];
    const tot = { gaji: 0, thr: 0, jkk: 0, jkm: 0, kesP: 0, bruto: 0, pph: 0 };
    for (const nama of ["KARTAP", "TIDAK TETAP"]){
      const l = hasil.filter(x => statusOf(x.u) === nama && (x.r.gaji || x.r.thr)); if (!l.length) continue;
      if (nama !== "KARTAP") baris.push([t(nama)]);
      const sub = { gaji: 0, thr: 0, jkk: 0, jkm: 0, kesP: 0, bruto: 0, pph: 0 };
      l.forEach(({ u, g, r }, i) => { for (const k in sub) sub[k] += +r[k] || 0;
        baris.push([n(i + 1), t((u.nama || "").toUpperCase()), t(nama), t(g.npwp || ""), t(g.npwp ? g.npwp + "000000" : ""), t(u.alamat || ""), t((u.jabatan || "").toUpperCase()), t(g.jk || ""), t(r.ptkp), t(r.tahunan ? "SETAHUN" : r.ter),
          n(r.gaji), n(r.thr), n(r.jkk), n(r.jkm), n(r.kesP), n(r.bruto), t(r.tarif == null ? "" : fmt2(r.tarif) + "%"), n(r.pph)]); });
      baris.push(["", "", "", "", "", "", "", "", "", t("Jumlah"), n(sub.gaji), n(sub.thr), n(sub.jkk), n(sub.jkm), n(sub.kesP), n(sub.bruto), "", n(sub.pph)]);
      for (const k in tot) tot[k] += sub[k];
      baris.push([]);
    }
    baris.push(["", "", "", "", "", "", "", "", "", H("TOTAL"), n(tot.gaji), n(tot.thr), n(tot.jkk), n(tot.jkm), n(tot.kesP), n(tot.bruto), "", n(tot.pph)]);
    ctx.unduh(buatXlsxGaya([{ nama: ym.slice(5, 7) + ym.slice(0, 4), baris, beku: 2, lebar: [5, 30, 12, 19, 25, 34, 20, 5, 7, 8, 14, 12, 12, 12, 13, 16, 9, 12], gabung: ["A1:R1"] }]),
      "kertas-kerja-pph21-" + ym + ".xlsx");
    catatLog(ctx.CID(), ctx.me().uid, ctx.profile(), "ekspor", "Mengunduh kertas kerja PPh 21 " + ym);
  };
  // Rekap BPJS setahun dari kertas kerja yang sudah disimpan: Kesehatan, JKK, JKM (ditanggung perusahaan) & JHT, JP (karyawan)
  $("#pjk-bpjs").onclick = async () => {
    const y = ym.slice(0, 4);
    try{
      const s = await getDocs(query(C("pajak"), where("periode", ">=", y + "-01"), where("periode", "<=", y + "-12")));
      if (!s.size){ toast("Belum ada kertas kerja tersimpan di tahun " + y + "."); return; }
      const per = {}; s.docs.forEach(d => { per[+d.data().periode.slice(5, 7)] = d.data().hasil || {}; });
      const nama = {}; Object.values(per).forEach(h => Object.entries(h).forEach(([uid, x]) => { nama[uid] = x.nama || nama[uid] || uid; }));
      const uids = Object.keys(nama).sort((a, b) => nama[a].localeCompare(nama[b]));
      const sheet = (judul, k) => { const head = ["No.", "Nama", ...BULAN].map(v => ({ v, s: "kepala" }));
        const rows = uids.map((uid, i) => [{ v: i + 1, s: "isi" }, { v: nama[uid], s: "teks" }, ...BULAN.map((_, b) => { const v = per[b + 1]?.[uid]?.[k]; return v ? { v: Math.round(v * 100) / 100, s: "isiAngka" } : { v: "", s: "isi" }; })]);
        rows.push([{ v: "", s: "kepala" }, { v: "Total", s: "kepala" }, ...BULAN.map((_, b) => ({ v: Math.round(uids.reduce((a, uid) => a + (+per[b + 1]?.[uid]?.[k] || 0), 0) * 100) / 100, s: "isiAngka" }))]);
        return { nama: judul, baris: [[{ v: judul + " " + y, s: "judul" }], head, ...rows], beku: 2, lebar: [5, 32, ...BULAN.map(() => 13)], gabung: ["A1:N1"] }; };
      ctx.unduh(buatXlsxGaya([sheet("Kesehatan perusahaan", "kesP"), sheet("Kesehatan karyawan", "kesK"), sheet("JKK", "jkk"), sheet("JKM", "jkm"),
        sheet("JHT perusahaan", "jhtP"), sheet("JHT karyawan", "jhtK"), sheet("JP perusahaan", "jpP"), sheet("JP karyawan", "jpK"), sheet("PPh 21", "pph")]), "rekap-bpjs-pph21-" + y + ".xlsx");
    }catch(e){ toast("Gagal: " + (e.code || e.message)); }
  };

  /* ----- Import dari Excel kertas kerja (sheet bulanan seperti "092026") -----
     Data karyawan (Status, NIK, L/P, PTKP, alamat) diambil dari sheet bulan terakhir; gaji & THR tiap sheet bulanan bisa ikut diimpor. */
  const cariKolom = (head, ...kunci) => head.findIndex(h => kunci.some(k => h === k || h.includes(k)));
  function bacaKertasKerja(sheets){
    const bulan = [], data = {};
    for (const sh of sheets){
      const m = String(sh.nama).replace(/\s/g, "").match(/^(\d{2})(\d{4})$/);
      const iH = sh.baris.findIndex(r => r && r.some(c => norm(c) === "namakaryawan") && r.some(c => norm(c) === "ptkp"));
      if (iH < 0) continue;
      const head = sh.baris[iH].map(norm);
      const k = { nama: cariKolom(head, "namakaryawan"), status: cariKolom(head, "status"), nik: cariKolom(head, "nikpaspor", "nik"), alamat: cariKolom(head, "alamat"),
        jabatan: cariKolom(head, "jabatan"), jk: head.findIndex(h => h === "lp"), ptkp: cariKolom(head, "ptkp"), gaji: cariKolom(head, "gajipokok", "gaji"), thr: head.findIndex(h => h === "thr"),
        jkk: head.findIndex(h => h === "jkk"), jkm: head.findIndex(h => h === "jkm"), kes: head.findIndex(h => h === "kesehatan") };
      const rows = [];
      for (const r of sh.baris.slice(iH + 1)){
        const nama = String(r?.[k.nama] ?? "").trim();
        if (!nama || !PTKP[String(r[k.ptkp] ?? "").trim().toUpperCase()]) continue;
        const o = { nama, status: String(r[k.status] ?? "").trim().toUpperCase(), nik: String(r[k.nik] ?? "").replace(/\D/g, ""), alamat: String(r[k.alamat] ?? "").trim(),
          jabatan: String(r[k.jabatan] ?? "").trim(), jk: String(r[k.jk] ?? "").trim().toUpperCase(), ptkp: String(r[k.ptkp]).trim().toUpperCase(),
          gaji: k.gaji >= 0 ? Math.round(+r[k.gaji] || 0) : 0, thr: k.thr >= 0 ? Math.round(+r[k.thr] || 0) : 0,
          // iuran BPJS yang tercatat di Excel bulan itu (mis. JKK Januari setengah karena relaksasi) dipakai apa adanya
          bpjs: k.jkk >= 0 && typeof r[k.jkk] === "number" ? { jkk: +r[k.jkk] || 0, jkm: k.jkm >= 0 ? +r[k.jkm] || 0 : 0, kesP: k.kes >= 0 ? +r[k.kes] || 0 : 0 } : null };
        rows.push(o); data[norm(nama)] = o;      // sheet berikutnya (bulan lebih baru) menimpa data lama
      }
      if (m && rows.length) bulan.push({ ym: m[2] + "-" + m[1], rows });
    }
    return { orang: Object.values(data), bulan: bulan.sort((a, b) => a.ym.localeCompare(b.ym)) };
  }
  // Cocokkan nama di Excel dengan karyawan di aplikasi: NIK sama > nama sama > nama mirip (kata yang sama paling banyak)
  function cocokkan(o){
    if (o.nik){ const u = users.find(x => (gmap[x.uid] || {}).npwp === o.nik); if (u) return u.uid; }
    const n = norm(o.nama); let u = users.find(x => norm(x.nama) === n); if (u) return u.uid;
    const kata = s => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 1);
    const a = kata(o.nama); let best = null, skor = 0;
    for (const x of users){ const b = kata(x.nama), sama = b.filter(w => a.includes(w)).length;
      const s = sama / Math.max(1, Math.min(a.length, b.length)); if (sama && s > skor){ skor = s; best = x; } }
    return skor >= 0.99 || (best && skor >= 0.66) ? best.uid : "";
  }
  $("#pjd-import").onclick = () => $("#pjd-file").click();
  $("#pjd-file").onchange = async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (!siap) await muatDasar();
    let kk;
    try{ kk = bacaKertasKerja(await bacaSemuaSheet(f)); }catch(err){ msg($("#pjd-msg"), "Gagal membaca file: " + (err.message || err), "bad"); return; }
    if (!kk.orang.length){ msg($("#pjd-msg"), "Tidak ditemukan tabel dengan kolom NAMA KARYAWAN dan PTKP di file ini.", "bad"); return; }
    const opsi = sel => `<option value="">— lewati —</option>` + users.map(u => `<option value="${esc(u.uid)}" ${u.uid === sel ? "selected" : ""}>${esc(u.nama)}</option>`).join("");
    const box = document.createElement("div"); box.className = "pjd-import";
    const terisi = kk.orang.map(o => ({ o, uid: cocokkan(o) }));
    box.innerHTML = `<p class="meta" style="margin-top:0">${fmtNum(kk.orang.length)} karyawan ditemukan di <b>${esc(f.name)}</b>${kk.bulan.length ? ` · sheet bulanan: ${kk.bulan.map(b => b.ym.slice(5) + "/" + b.ym.slice(2, 4)).join(", ")}` : ""}.
      Periksa pasangan nama; yang tidak cocok pilih manual atau biarkan "lewati".</p>
      <div class="tablewrap" style="max-height:55vh"><table class="pjd-tbl"><thead><tr><th>Nama di Excel</th><th>Karyawan di aplikasi</th><th>Status</th><th>NIK</th><th>L/P</th><th>PTKP</th></tr></thead><tbody>
      ${terisi.map(({ o, uid }, i) => `<tr class="${uid ? "" : "belum"}"><td>${esc(o.nama)}</td><td><select data-i="${i}">${opsi(uid)}</select></td><td>${esc(o.status === "KARTAP" ? "Tetap" : o.status ? "Tidak tetap" : "")}</td><td>${esc(o.nik)}</td><td>${esc(o.jk)}</td><td>${esc(o.ptkp)}</td></tr>`).join("")}
      </tbody></table></div>
      <label class="check" style="margin-top:10px"><input type="checkbox" class="im-alamat" checked> Isi alamat karyawan dari Excel (hanya yang alamatnya masih kosong)</label>
      ${kk.bulan.length ? `<label class="check"><input type="checkbox" class="im-gaji" checked> Impor juga gaji &amp; THR ${fmtNum(kk.bulan.length)} bulan ke Kertas kerja (menimpa data bulan itu untuk karyawan yang dipasangkan)</label>` : ""}
      <p class="msg im-msg"></p>
      <div class="btns" style="margin-top:10px"><button type="button" class="small im-go">Impor</button><button type="button" class="small alt im-batal">Batal</button></div>`;
    document.body.append(box);
    box.querySelector(".im-batal").onclick = () => { box.hidden = true; };
    box.querySelectorAll("select[data-i]").forEach(s => s.onchange = () => { terisi[+s.dataset.i].uid = s.value; s.closest("tr").classList.toggle("belum", !s.value); });
    box.querySelector(".im-go").onclick = async ev => {
      const pakai = terisi.filter(x => x.uid), m = box.querySelector(".im-msg");
      const dobel = pakai.map(x => x.uid).filter((u, i, a) => a.indexOf(u) !== i);
      if (dobel.length){ msg(m, "Ada karyawan aplikasi yang dipasangkan ke 2 nama Excel: " + [...new Set(dobel)].map(u => users.find(x => x.uid === u)?.nama).join(", "), "bad"); return; }
      ev.currentTarget.disabled = true; msg(m, "Mengimpor…");
      try{
        for (const { o, uid } of pakai){
          const data = { ptkp: o.ptkp, ...(o.nik ? { npwp: o.nik } : {}), ...(o.jk === "L" || o.jk === "P" ? { jk: o.jk } : {}), ...(o.status ? { statusPegawai: o.status === "KARTAP" ? "tetap" : "tidak" } : {}) };
          await setDoc(D("payroll", uid), { ...data, appVer: VERSI_APP }, { merge: true }); gmap[uid] = { ...(gmap[uid] || {}), ...data };
          const u = users.find(x => x.uid === uid);
          if (box.querySelector(".im-alamat").checked && o.alamat && !u.alamat){ await updateDoc(doc(db, "users", uid), { alamat: o.alamat }); u.alamat = o.alamat; }
        }
        let nb = 0;
        if (box.querySelector(".im-gaji")?.checked){
          const peta = Object.fromEntries(pakai.map(x => [norm(x.o.nama), x.uid]));
          const lalu2 = {};
          for (const b of kk.bulan){
            const ref = D("pajak", b.ym), lama = await getDoc(ref), dataB = lama.exists() ? { ...(lama.data().data || {}) } : {};
            for (const r of b.rows){ const uid = peta[norm(r.nama)]; if (!uid) continue;
              if (r.gaji || r.thr) dataB[uid] = { gaji: r.gaji, thr: r.thr, ...(r.bpjs ? { tetap: r.bpjs } : {}), sumber: "excel" }; else delete dataB[uid]; }
            const bln = +b.ym.slice(5, 7), hs = {};
            for (const [uid, x] of Object.entries(dataB)){ const u = users.find(z => z.uid === uid); if (!u) continue;
              const r = hitungPajak(gmap[uid] || {}, set, x, bln, lalu2[uid]);
              hs[uid] = { nama: u.nama, bruto: r.bruto, pph: r.pph, iuranK: Math.round(r.iuranK * 100) / 100, kesP: r.kesP, kesK: r.kesK, jkk: r.jkk, jkm: r.jkm, jhtP: r.jhtP, jhtK: r.jhtK, jpP: r.jpP, jpK: r.jpK, ptkp: r.ptkp, tarif: r.tarif };
              const t = (lalu2[uid] ||= { bulan: 0, bruto: 0, pph: 0, iuran: 0 }); t.bulan++; t.bruto += r.bruto; t.pph += r.pph; t.iuran += r.iuranK; }
            await setDoc(ref, { periode: b.ym, data: dataB, hasil: hs, pengaturan: set, diubah: serverTimestamp(), oleh: ctx.profile().nama }); nb++;
          }
        }
        catatLog(ctx.CID(), ctx.me().uid, ctx.profile(), "ubah", `Import kertas kerja ${f.name}: data pajak ${pakai.length} karyawan${nb ? ", gaji " + nb + " bulan" : ""}`);
        box.hidden = true; renderData();
        msg($("#pjd-msg"), `Data pajak ${fmtNum(pakai.length)} karyawan diperbarui${nb ? ` · gaji & THR ${fmtNum(nb)} bulan masuk ke Kertas kerja` : ""}.` + (terisi.length > pakai.length ? ` ${fmtNum(terisi.length - pakai.length)} nama dilewati.` : ""), "ok");
        if (ym && hasil.length) $("#pjk-go").click();
      }catch(err){ msg(m, err.code === "permission-denied" ? "Ditolak server. Jalankan deploy-rules.bat terbaru." : "Gagal: " + (err.code || err.message), "bad"); ev.currentTarget.disabled = false; }
    };
    ctx.popup(box, "Import data dari kertas kerja", $("#pjd-import"));
  };
  ctx.reset = () => { siap = false; hasil = []; isi = {}; $("#pjk-out").innerHTML = ""; $("#pjk-aksi").hidden = true; };
}
