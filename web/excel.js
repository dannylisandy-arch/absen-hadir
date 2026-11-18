// Baca & tulis file Excel (.xlsx) sederhana tanpa library luar.
// - bacaTabel(file): .xlsx atau .csv -> array baris (array sel berupa teks/angka), sheet pertama
// - buatXlsx(baris, namaSheet): array baris -> Blob .xlsx (baris pertama dicetak tebal)

/* ---------- ZIP ---------- */
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

async function inflateRaw(data){
  const ds = new DecompressionStream("deflate-raw");
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
async function bukaZip(buf){
  const b = new Uint8Array(buf), files = {};
  // cari End Of Central Directory dari belakang
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50){ e = i; break; }
  if (e < 0) throw new Error("Bukan file .xlsx yang valid.");
  const jumlah = u16(b, e + 10); let p = u32(b, e + 16);
  for (let k = 0; k < jumlah; k++){
    if (u32(b, p) !== 0x02014b50) break;
    const metode = u16(b, p + 10), ukur = u32(b, p + 20), nLen = u16(b, p + 28), xLen = u16(b, p + 30), cLen = u16(b, p + 32), lokal = u32(b, p + 42);
    const nama = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nLen));
    const awal = lokal + 30 + u16(b, lokal + 26) + u16(b, lokal + 28), isi = b.subarray(awal, awal + ukur);
    files[nama] = { metode, isi };
    p += 46 + nLen + xLen + cLen;
  }
  return async nama => {
    const f = files[nama] || files[Object.keys(files).find(k => k.toLowerCase() === nama.toLowerCase())];
    if (!f) return null;
    const data = f.metode === 0 ? f.isi : await inflateRaw(f.isi);
    return new TextDecoder().decode(data);
  };
}

/* ---------- baca .xlsx ---------- */
const kolomKeIndex = ref => { let n = 0; for (const c of ref.replace(/\d+/g, "")) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
async function bacaXlsx(buf, semua = false){
  const ambil = await bukaZip(buf), dom = s => new DOMParser().parseFromString(s, "application/xml");
  // daftar sheet sesuai urutan di workbook
  let daftar = [{ nama: "Sheet1", path: "xl/worksheets/sheet1.xml" }];
  try{
    const wb = dom(await ambil("xl/workbook.xml")), rels = dom(await ambil("xl/_rels/workbook.xml.rels"));
    const d = [...wb.getElementsByTagName("sheet")].map(sh => {
      const rid = sh.getAttribute("r:id") || sh.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
      const rel = [...rels.getElementsByTagName("Relationship")].find(r => r.getAttribute("Id") === rid);
      if (!rel) return null;
      const t = rel.getAttribute("Target").replace(/^\//, "");
      return { nama: sh.getAttribute("name") || "", path: t.startsWith("xl/") ? t : "xl/" + t };
    }).filter(Boolean);
    if (d.length) daftar = d;
  }catch(e){}
  const shared = [];
  const ss = await ambil("xl/sharedStrings.xml");
  if (ss) for (const si of dom(ss).getElementsByTagName("si")) shared.push([...si.getElementsByTagName("t")].map(t => t.textContent).join(""));
  const baca = async path => {
    const sheetXml = await ambil(path);
    if (!sheetXml) throw new Error("Sheet tidak ditemukan di file Excel.");
    const baris = [];
    for (const row of dom(sheetXml).getElementsByTagName("row")){
      const r = (+row.getAttribute("r") || baris.length + 1) - 1, isi = baris[r] = baris[r] || [];
      let urut = 0;
      for (const c of row.getElementsByTagName("c")){
        const ref = c.getAttribute("r"), i = ref ? kolomKeIndex(ref) : urut; urut = i + 1;
        const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent;
        let nilai = "";
        if (t === "s") nilai = shared[+v] ?? "";
        else if (t === "inlineStr") nilai = [...c.getElementsByTagName("t")].map(x => x.textContent).join("");
        else if (t === "str" || t === "e") nilai = v ?? "";
        else if (t === "b") nilai = v === "1";
        else if (v != null && v !== "") nilai = +v;
        isi[i] = nilai;
      }
    }
    return [...baris].map(r => r ? [...r].map(x => x ?? "") : []);
  };
  if (!semua) return baca(daftar[0].path);
  const out = [];
  for (const d of daftar){ try{ out.push({ nama: d.nama, baris: await baca(d.path) }); }catch(e){} }
  return out;
}
// Semua sheet dari file .xlsx: [{ nama, baris }]
export async function bacaSemuaSheet(file){
  if (!(file.name || "").toLowerCase().endsWith(".xlsx")) throw new Error("Pakai file Excel .xlsx.");
  return bacaXlsx(await file.arrayBuffer(), true);
}

/* ---------- baca .csv (pemisah , atau ; otomatis) ---------- */
function bacaCsv(teks){
  teks = teks.replace(/^﻿/, "");
  const baris1 = teks.split(/\r?\n/)[0] || "", sep = (baris1.match(/;/g) || []).length >= (baris1.match(/,/g) || []).length ? ";" : ",";
  const out = []; let row = [], sel = "", kutip = false;
  for (let i = 0; i < teks.length; i++){
    const ch = teks[i];
    if (kutip){ if (ch === '"'){ if (teks[i + 1] === '"'){ sel += '"'; i++; } else kutip = false; } else sel += ch; }
    else if (ch === '"') kutip = true;
    else if (ch === sep){ row.push(sel); sel = ""; }
    else if (ch === "\n" || ch === "\r"){ if (ch === "\r" && teks[i + 1] === "\n") i++; row.push(sel); out.push(row); row = []; sel = ""; }
    else sel += ch;
  }
  if (sel !== "" || row.length){ row.push(sel); out.push(row); }
  return out;
}

export async function bacaTabel(file){
  const nama = (file.name || "").toLowerCase();
  if (nama.endsWith(".csv") || file.type === "text/csv") return bacaCsv(await file.text());
  if (nama.endsWith(".xls")) throw new Error("Format .xls lama belum didukung. Di Excel pilih File > Save As > Excel Workbook (.xlsx), lalu upload lagi.");
  return bacaXlsx(await file.arrayBuffer());
}

/* ---------- tulis .xlsx ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++){ let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files){
  const enc = new TextEncoder(), lokal = [], pusat = []; let off = 0;
  for (const [nama, teks] of files){
    const n = enc.encode(nama), d = enc.encode(teks), c = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true);
    h.setUint32(14, c, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    lokal.push(new Uint8Array(h.buffer), n, d);
    const p = new DataView(new ArrayBuffer(46));
    p.setUint32(0, 0x02014b50, true); p.setUint16(4, 20, true); p.setUint16(6, 20, true);
    p.setUint32(16, c, true); p.setUint32(20, d.length, true); p.setUint32(24, d.length, true); p.setUint16(28, n.length, true); p.setUint32(42, off, true);
    pusat.push(new Uint8Array(p.buffer), n);
    off += 30 + n.length + d.length;
  }
  const ukPusat = pusat.reduce((t, x) => t + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, ukPusat, true); e.setUint32(16, off, true);
  return new Blob([...lokal, ...pusat, new Uint8Array(e.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const xmlEsc = s => String(s).replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
const kolomHuruf = i => { let s = ""; i++; while (i){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
export function buatXlsx(baris, namaSheet = "Data", lebar = [], saring = true){
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>
${lebar.length ? "<cols>" + lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>" : ""}
<sheetData>${baris.map((r, y) => `<row r="${y + 1}">${r.map((v, x) => {
    const ref = kolomHuruf(x) + (y + 1), s = y === 0 ? ' s="1"' : "";
    if (v === "" || v == null) return y === 0 ? `<c r="${ref}"${s}/>` : "";
    return typeof v === "number" && isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
  }).join("")}</row>`).join("")}</sheetData>${saring && baris.length > 1 ? `<autoFilter ref="A1:${kolomHuruf(Math.max(0, (baris[0] || []).length - 1))}${baris.length}"/>` : ""}</worksheet>`;
  return zipStore([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="${xmlEsc(namaSheet).slice(0, 31)}" sheetId="1" r:id="rId1"/></sheets>${saring && baris.length > 1 ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlEsc(namaSheet).slice(0, 31).replace(/'/g, "''")}'!$A$1:$${kolomHuruf(Math.max(0, (baris[0] || []).length - 1))}$${baris.length}</definedName></definedNames>` : ""}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", sheet]
  ]);
}

/* ---------- Excel berwarna, banyak sheet (laporan format harian) ----------
   sheets: [{ nama, baris: [[sel...]], gabung: ["A1:A2", ...], lebar: [..] }]
   sel: nilai biasa, atau { v, s } dengan s = nama gaya di GAYA_XLSX */
const GAYA_XLSX = { biasa: 0, judul: 1, kepala: 2, isi: 3, isiAngka: 4, libur: 5, liburAngka: 6, tidakMasuk: 7, kiri: 8, liburKiri: 9, teks: 10 };
const STYLES_GAYA = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="12"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFF0000"/><name val="Calibri"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9D9D9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2DCDB"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFFF00"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="2" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
export function buatXlsxGaya(sheets){
  const dipakai = new Set();
  const namaAman = n => { let b = String(n || "Sheet").replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet", x = b, i = 2;
    while (dipakai.has(x.toLowerCase())) x = b.slice(0, 31 - String(i).length - 1) + " " + i++; dipakai.add(x.toLowerCase()); return x; };
  const isi = sheets.map((sh, n) => {
    const baris = sh.baris.map((r, y) => `<row r="${y + 1}">${r.map((c, x) => {
      const o = c && typeof c === "object" ? c : { v: c }, ref = kolomHuruf(x) + (y + 1), s = GAYA_XLSX[o.s] ? ` s="${GAYA_XLSX[o.s]}"` : "";
      if (o.v === "" || o.v == null) return s ? `<c r="${ref}"${s}/>` : "";
      return typeof o.v === "number" && isFinite(o.v) ? `<c r="${ref}"${s}><v>${o.v}</v></c>` : `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEsc(o.v)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0"${n === 0 ? ' tabSelected="1"' : ""}>${sh.beku ? `<pane ySplit="${sh.beku}" topLeftCell="A${sh.beku + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.beku + 1}" sqref="A${sh.beku + 1}"/>` : '<selection activeCell="A1" sqref="A1"/>'}</sheetView></sheetViews>
${(sh.lebar || []).length ? "<cols>" + sh.lebar.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>" : ""}
<sheetData>${baris}</sheetData>${(sh.gabung || []).length ? `<mergeCells count="${sh.gabung.length}">${sh.gabung.map(g => `<mergeCell ref="${g}"/>`).join("")}</mergeCells>` : ""}
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/></worksheet>`;
    return { nama: namaAman(sh.nama), xml };
  });
  return zipStore([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${isi.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${isi.map((s, i) => `<sheet name="${xmlEsc(s.nama)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${isi.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${isi.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES_GAYA],
    ...isi.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, s.xml])
  ]);
}
