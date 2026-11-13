import {
  SBSI_FOOTER_CONTACT,
  buildTemplateParagraphs,
  formatPhp,
  formatMediumDate,
} from "@/utils/sbsiReportTemplateUtils";

// Pure-JS %PDF-1.4 writer (no dependencies) reproducing the SBSI letterhead reference PDFs.
// shortcut: logo is drawn as vector "SBSI" text, not the PNG raster; upgrade if exact logo art is required.

const W = 595.5;
const H = 850;
const L = 59.5;
const R = 535.7;
const CONTENT_TOP = 722;
const CONTENT_BOTTOM = 118;
const BLUE = "0 0.2902 0.6784";

// Helvetica AFM advance widths for ASCII 32..126 (1/1000 em).
const WIDTHS_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const WIDTHS_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const WIN_ANSI = { "—": 0x97, "–": 0x96, "•": 0x95, "’": 0x92, "‘": 0x91, "“": 0x93, "”": 0x94 };
const WIN_ANSI_WIDTH = { 0x97: 1000, 0x96: 556, 0x95: 350, 0x92: 222, 0x91: 222, 0x93: 333, 0x94: 333 };

function codeOf(ch) {
  const c = ch.charCodeAt(0);
  if (c >= 32 && c <= 126) return c;
  return WIN_ANSI[ch] ?? 63; // unsupported glyph -> "?"
}

function textWidth(text, size, bold = false) {
  let w = 0;
  for (const ch of String(text)) {
    const c = codeOf(ch);
    w += c <= 126 ? (bold ? WIDTHS_BOLD : WIDTHS_REG)[c - 32] : WIN_ANSI_WIDTH[c] || 556;
  }
  return (w * size) / 1000;
}

function esc(text) {
  let out = "";
  for (const ch of String(text)) {
    const c = codeOf(ch);
    const s = String.fromCharCode(c);
    out += s === "(" || s === ")" || s === "\\" ? `\\${s}` : s;
  }
  return out;
}

const n = (v) => Number(v.toFixed(2));

/** Accumulates content-stream operators for one page. */
class Page {
  constructor() {
    this.ops = [];
  }
  fill(rgb, path) {
    this.ops.push(`${rgb} rg ${path} f`);
  }
  rect(rgb, x, y, w, h) {
    this.fill(rgb, `${n(x)} ${n(y)} ${n(w)} ${n(h)} re`);
  }
  poly(rgb, pts) {
    const [first, ...rest] = pts;
    this.fill(rgb, `${n(first[0])} ${n(first[1])} m ${rest.map((p) => `${n(p[0])} ${n(p[1])} l`).join(" ")} h`);
  }
  text(str, x, y, { size = 10.5, bold = false, italic = false, rgb = "0.1 0.1 0.1" } = {}) {
    const font = bold ? "F1" : italic ? "F3" : "F2";
    this.ops.push(`BT /${font} ${size} Tf ${rgb} rg ${n(x)} ${n(y)} Td (${esc(str)}) Tj ET`);
  }
}

function chevron(page, rgb, x0, yB, size = 24.62) {
  const t = size / 2;
  const yM = yB + size / 2;
  const yT = yB + size;
  page.poly(rgb, [[x0 + size, yT], [x0 + t, yT], [x0, yM], [x0 + t, yB], [x0 + size, yB], [x0 + t, yM]]);
}

function drawLetterhead(page) {
  // Header: angled royal-blue banner (42.3% -> 32.3% of page width, 45deg) + logo wordmark.
  page.poly(BLUE, [[0, H], [W * 0.423, H], [W * 0.323, H - 60], [0, H - 60]]);
  page.text("SBSI", 14, H - 40, { size: 24, bold: true, rgb: "1 1 1" });
  page.text("SCIENTIFIC BIOTECH", 84, H - 29, { size: 8.5, bold: true, rgb: "1 1 1" });
  page.text("SPECIALTIES, INC.", 84, H - 41, { size: 8.5, bold: true, rgb: "1 1 1" });
  page.rect(BLUE, L, 752.77, R - L, 3.75);

  // Footer: three chevrons + notched solid block, rule, contact columns.
  chevron(page, "0.2824 0.5725 0.9569", 421.39, 75.99);
  chevron(page, "0.102 0.4235 0.851", 436.94, 75.99);
  chevron(page, BLUE, 452.98, 75.99);
  page.poly(BLUE, [[R, 100.61], [469.0 + 12.31, 100.61], [469.0, 88.3], [469.0 + 12.31, 75.99], [R, 75.99]]);
  page.rect(BLUE, L, 67.72, R - L, 3.75);

  const c = SBSI_FOOTER_CONTACT;
  const gray = "0.25 0.25 0.25";
  page.text(c.email, L, 52, { size: 8, rgb: gray });
  page.text(c.phone, 192.24, 52, { size: 8, rgb: gray });
  const addrX = 338.79;
  const words = c.address.split(" ");
  let line = "";
  let y = 52;
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (textWidth(trial, 8) > R - addrX && line) {
      page.text(line, addrX, y, { size: 8, rgb: gray });
      y -= 10;
      line = word;
    } else line = trial;
  }
  if (line) page.text(line, addrX, y, { size: 8, rgb: gray });
}

/** Turn paragraph segments into pieces [{text,bold}] grouped into glued words. */
function segmentPieces(segments, data) {
  const pieces = [];
  for (const s of segments) {
    if (s.type === "text") pieces.push({ text: s.value, bold: false });
    else if (s.type === "amount") pieces.push({ text: formatPhp(s.value), bold: true });
    else if (s.type === "field") {
      const raw = data[s.key];
      if (s.optional && !raw) continue;
      const shown = s.kind === "date" ? formatMediumDate(raw) : String(raw || "").trim() || "________";
      if (s.prefix) pieces.push({ text: s.prefix, bold: false });
      pieces.push({ text: shown, bold: false });
    }
  }
  return pieces;
}

function toWords(pieces) {
  const words = [];
  let cur = [];
  for (const p of pieces) {
    for (const part of p.text.split(/(\s+)/)) {
      if (part === "") continue;
      if (/^\s+$/.test(part)) {
        if (cur.length) words.push(cur);
        cur = [];
      } else cur.push({ text: part, bold: p.bold });
    }
  }
  if (cur.length) words.push(cur);
  return words;
}

const wordWidth = (word, size) => word.reduce((w, p) => w + textWidth(p.text, size, p.bold), 0);

function wrapWords(words, size, width) {
  const lines = [];
  let line = [];
  let used = 0;
  const space = textWidth(" ", size);
  for (const word of words) {
    const w = wordWidth(word, size);
    if (line.length && used + space + w > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    used += (line.length ? space : 0) + w;
    line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

/** Draw one wrapped line as merged same-font runs so strings stay searchable. */
function drawLine(page, line, x, y, size) {
  const runs = [];
  line.forEach((word, wi) => {
    if (wi > 0) {
      const last = runs[runs.length - 1];
      if (last.bold && !word[0].bold) runs.push({ text: " ", bold: false });
      else last.text += " ";
    }
    for (const p of word) {
      const last = runs[runs.length - 1];
      if (last && last.bold === p.bold) last.text += p.text;
      else runs.push({ text: p.text, bold: p.bold });
    }
  });
  let cx = x;
  for (const r of runs) {
    page.text(r.text, cx, y, { size, bold: r.bold });
    cx += textWidth(r.text, size, r.bold);
  }
}

function buildPages(data) {
  const doc = buildTemplateParagraphs(data);
  const pages = [];
  let page;
  let y;
  const newPage = () => {
    page = new Page();
    drawLetterhead(page);
    pages.push(page);
    y = CONTENT_TOP;
  };
  const ensure = (h) => {
    if (y - h < CONTENT_BOTTOM) newPage();
  };
  newPage();

  const SIZE = 10.5;
  const LEAD = 15;
  const width = R - L;

  const rightText = (str, yy, opts = {}) => {
    const size = opts.size || SIZE;
    page.text(str, R - textWidth(str, size, opts.bold), yy, { size, ...opts });
  };

  rightText(doc.dateLine, y);
  y -= LEAD;
  if (doc.systemRefLine) {
    rightText(doc.systemRefLine, y, { size: 9, italic: true });
    y -= LEAD;
  }
  y -= 8;

  for (const line of [
    [data.recipientName, true],
    [data.recipientTitle, false],
    [data.recipientCompany, false],
  ]) {
    if (!line[0]) continue;
    page.text(line[0], L, y, { bold: line[1] });
    y -= LEAD - 1;
  }
  y -= 12;

  for (const part of doc.headerOrder) {
    ensure(LEAD * 2);
    if (part === "subject") page.text(doc.subjectLine, L, y, { bold: true });
    else page.text(doc.salutation, L, y);
    y -= LEAD + 6;
  }

  for (const para of doc.paragraphs) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      for (const line of wrapWords(toWords(run), SIZE, width)) {
        ensure(LEAD);
        drawLine(page, line, L, y, SIZE);
        y -= LEAD;
      }
      run = [];
    };
    for (const seg of para.segments) {
      if (seg.type !== "breakdown") {
        run.push(...segmentPieces([seg], data));
        continue;
      }
      flush();
      y -= 2;
      const items = data.breakdownItems || [];
      const amountCol = 120;
      for (const item of items) {
        const lines = wrapWords(toWords([{ text: item.description || "(item)", bold: false }]), SIZE, width - amountCol - 30);
        ensure(LEAD * lines.length);
        page.text("•", L + 12, y);
        lines.forEach((line, i) => drawLine(page, line, L + 26, y - i * LEAD, SIZE));
        const amt = formatPhp(item.amount);
        page.text(amt, R - textWidth(amt, SIZE, true), y, { bold: true });
        y -= LEAD * lines.length;
      }
      ensure(LEAD + 6);
      page.rect("0.75 0.75 0.75", L + 26, y + 10, width - 26, 0.6);
      y -= 2;
      const total = formatPhp((data.breakdownItems || []).reduce((s, i) => s + (Number(i.amount) || 0), 0));
      page.text("TOTAL", L + 26, y, { bold: true });
      page.text(total, R - textWidth(total, SIZE, true), y, { bold: true });
      y -= LEAD + 2;
    }
    flush();
    y -= 7;
  }

  ensure(120);
  y -= 6;
  page.text("Respectfully yours,", L, y);
  y -= 46;
  page.text("_______________________", L, y);
  y -= LEAD;
  page.text(data.signatoryName || "", L, y, { bold: true });
  for (const extra of [data.signatoryRole, data.signatoryDepartment]) {
    if (!extra) continue;
    y -= LEAD - 2;
    page.text(extra, L, y);
  }
  return pages;
}

function compile(pages) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add("");
  const pagesObj = add("");
  const fonts = ["Helvetica-Bold", "Helvetica", "Helvetica-Oblique"].map((f) =>
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /${f} /Encoding /WinAnsiEncoding >>`),
  );
  const kids = [];
  for (const p of pages) {
    const stream = p.ops.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    kids.push(`${pageId} 0 R`);
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;

  // Every char is <= 0xFF (see esc()), so string offsets equal byte offsets.
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

/** Render a template into PDF bytes (A4-ish 595.5x850, multi-page capable). */
export function generateSbsiReportPdfBytes(templateData) {
  if (!templateData || typeof templateData !== "object") {
    throw new Error("generateSbsiReportPdfBytes: templateData is required.");
  }
  return compile(buildPages(templateData));
}

function defaultFileName(data) {
  const ref = data?.systemRefId || `${data?.type || "report"}-${data?.date || "draft"}`;
  return `SBSI-${String(ref).replace(/[^A-Za-z0-9_-]+/g, "-")}.pdf`;
}

/** Wrap the generated PDF as a `File` ready for FormData upload. */
export function createSbsiReportPdfFile(templateData, customFileName = null) {
  try {
    const bytes = generateSbsiReportPdfBytes(templateData);
    return new File([bytes], customFileName || defaultFileName(templateData), { type: "application/pdf" });
  } catch (error) {
    console.error("SBSI report PDF file creation failed:", error);
    throw error;
  }
}

/** Trigger a browser download of the generated PDF. */
export function downloadSbsiReportPdf(templateData, customFileName = null) {
  let url = null;
  try {
    const file = createSbsiReportPdfFile(templateData, customFileName);
    url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (error) {
    console.error("SBSI report PDF download failed:", error);
    throw error;
  } finally {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
