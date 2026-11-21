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

const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
const CL_ORDER = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

function buildHuffmanTree(lengths) {
  const blCount = new Int32Array(16);
  for (let i = 0; i < lengths.length; i++) {
    if (lengths[i] > 0) blCount[lengths[i]]++;
  }
  const nextCode = new Int32Array(16);
  let code = 0;
  for (let bits = 1; bits <= 15; bits++) {
    code = (code + blCount[bits - 1]) << 1;
    nextCode[bits] = code;
  }
  const root = {};
  for (let sym = 0; sym < lengths.length; sym++) {
    const len = lengths[sym];
    if (!len) continue;
    const c = nextCode[len]++;
    let node = root;
    for (let b = len - 1; b >= 0; b--) {
      const bit = (c >> b) & 1;
      if (!node[bit]) node[bit] = {};
      node = node[bit];
    }
    node.sym = sym;
  }
  return root;
}

const FIXED_LIT_TREE = (() => {
  const lens = new Uint8Array(288);
  for (let i = 0; i <= 143; i++) lens[i] = 8;
  for (let i = 144; i <= 255; i++) lens[i] = 9;
  for (let i = 256; i <= 279; i++) lens[i] = 7;
  for (let i = 280; i <= 287; i++) lens[i] = 8;
  return buildHuffmanTree(lens);
})();

const FIXED_DIST_TREE = (() => {
  const lens = new Uint8Array(32);
  lens.fill(5);
  return buildHuffmanTree(lens);
})();

function inflateZlib(src) {
  if (src.length < 6) throw new Error("Zlib stream too short");
  const cmf = src[0];
  const flg = src[1];
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
    throw new Error("Invalid zlib header");
  }
  let bytePos = flg & 0x20 ? 6 : 2;
  let bitPos = 0;
  const readBit = () => {
    if (bytePos >= src.length) throw new Error("Unexpected end of zlib stream");
    const bit = (src[bytePos] >> bitPos) & 1;
    bitPos++;
    if (bitPos === 8) {
      bitPos = 0;
      bytePos++;
    }
    return bit;
  };
  const readBits = (count) => {
    let val = 0;
    for (let i = 0; i < count; i++) val |= readBit() << i;
    return val;
  };
  const decodeSym = (tree) => {
    let node = tree;
    while (node.sym === undefined) {
      node = node[readBit()];
      if (!node) throw new Error("Invalid Huffman code");
    }
    return node.sym;
  };

  const out = [];
  let bfinal = 0;
  while (!bfinal) {
    bfinal = readBit();
    const btype = readBits(2);
    if (btype === 0) {
      if (bitPos > 0) {
        bitPos = 0;
        bytePos++;
      }
      if (bytePos + 4 > src.length) throw new Error("Truncated stored block");
      const len = src[bytePos] | (src[bytePos + 1] << 8);
      const nlen = src[bytePos + 2] | (src[bytePos + 3] << 8);
      if ((len ^ 0xffff) !== nlen) throw new Error("Corrupt stored block");
      bytePos += 4;
      if (bytePos + len > src.length) throw new Error("Truncated stored payload");
      for (let i = 0; i < len; i++) out.push(src[bytePos + i]);
      bytePos += len;
      continue;
    }

    let litTree;
    let distTree;
    if (btype === 1) {
      litTree = FIXED_LIT_TREE;
      distTree = FIXED_DIST_TREE;
    } else if (btype === 2) {
      const hlit = readBits(5) + 257;
      const hdist = readBits(5) + 1;
      const hclen = readBits(4) + 4;
      const clLens = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) clLens[CL_ORDER[i]] = readBits(3);
      const clTree = buildHuffmanTree(clLens);
      const lens = new Uint8Array(hlit + hdist);
      let idx = 0;
      while (idx < lens.length) {
        const sym = decodeSym(clTree);
        if (sym < 16) {
          lens[idx++] = sym;
        } else {
          const rep = sym === 16 ? 3 + readBits(2) : sym === 17 ? 3 + readBits(3) : 11 + readBits(7);
          const val = sym === 16 ? lens[idx - 1] || 0 : 0;
          for (let r = 0; r < rep && idx < lens.length; r++) lens[idx++] = val;
        }
      }
      litTree = buildHuffmanTree(lens.subarray(0, hlit));
      distTree = buildHuffmanTree(lens.subarray(hlit));
    } else {
      throw new Error("Unsupported deflate block type");
    }

    while (true) {
      const sym = decodeSym(litTree);
      if (sym < 256) {
        out.push(sym);
      } else if (sym === 256) {
        break;
      } else {
        const li = sym - 257;
        if (li < 0 || li >= LEN_BASE.length) {
          throw new Error(`Invalid deflate length symbol: ${sym}`);
        }
        const len = LEN_BASE[li] + (LEN_EXTRA[li] ? readBits(LEN_EXTRA[li]) : 0);
        const di = decodeSym(distTree);
        if (di < 0 || di >= DIST_BASE.length) {
          throw new Error(`Invalid deflate distance symbol: ${di}`);
        }
        const dist = DIST_BASE[di] + (DIST_EXTRA[di] ? readBits(DIST_EXTRA[di]) : 0);
        if (dist <= 0 || dist > out.length) {
          throw new Error(`Invalid deflate back-reference distance: ${dist}`);
        }
        for (let k = 0; k < len; k++) {
          out.push(out[out.length - dist]);
        }
      }
    }
  }
  return new Uint8Array(out);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function rleEncode(bytes) {
  const out = [];
  let i = 0;
  while (i < bytes.length) {
    if (i + 1 < bytes.length && bytes[i] === bytes[i + 1]) {
      const val = bytes[i];
      let run = 2;
      while (run < 128 && i + run < bytes.length && bytes[i + run] === val) run++;
      out.push(257 - run, val);
      i += run;
    } else {
      const start = i;
      let lit = 1;
      while (
        lit < 128 &&
        i + lit < bytes.length &&
        !(i + lit + 1 < bytes.length && bytes[i + lit] === bytes[i + lit + 1])
      ) {
        lit++;
      }
      out.push(lit - 1);
      for (let k = 0; k < lit; k++) out.push(bytes[start + k]);
      i += lit;
    }
  }
  out.push(128);
  return new Uint8Array(out);
}

function bytesToLatin1(bytes) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  }
  return out;
}

/** Decode a `data:image/png;base64,...` signature into a PDF-ready RGB RunLengthDecode payload. */
function decodePngDataUrlToPdfRgbRle(dataUrl) {
  if (typeof dataUrl !== "string") return null;
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/i.exec(dataUrl.trim());
  if (!match) return null;

  try {
    const binStr = atob(match[1].replace(/\s+/g, ""));
    const png = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) png[i] = binStr.charCodeAt(i);

    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.length < 33 || sig.some((b, idx) => png[idx] !== b)) return null;

    const u32 = (off) => ((png[off] << 24) | (png[off + 1] << 16) | (png[off + 2] << 8) | png[off + 3]) >>> 0;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let plte = null;
    let trns = null;
    const idatChunks = [];

    let pos = 8;
    while (pos + 12 <= png.length) {
      const len = u32(pos);
      const type = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
      const dataStart = pos + 8;
      if (dataStart + len + 4 > png.length) break;
      const chunk = png.subarray(dataStart, dataStart + len);

      if (type === "IHDR" && len >= 13) {
        width = u32(dataStart);
        height = u32(dataStart + 4);
        bitDepth = png[dataStart + 8];
        colorType = png[dataStart + 9];
        const compression = png[dataStart + 10];
        const filter = png[dataStart + 11];
        const interlace = png[dataStart + 12];
        if (!width || !height || width * height > 16_000_000 || bitDepth !== 8 || compression || filter || interlace) {
          return null;
        }
      } else if (type === "PLTE") {
        plte = chunk;
      } else if (type === "tRNS") {
        trns = chunk;
      } else if (type === "IDAT") {
        idatChunks.push(chunk);
      } else if (type === "IEND") {
        break;
      }
      pos = dataStart + len + 4;
    }

    const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
    const bpp = bppMap[colorType];
    if (!width || !height || !bpp || !idatChunks.length) return null;
    if (colorType === 3 && !plte) return null;

    const totalIdat = idatChunks.reduce((s, c) => s + c.length, 0);
    const idat = new Uint8Array(totalIdat);
    let offset = 0;
    for (const c of idatChunks) {
      idat.set(c, offset);
      offset += c.length;
    }

    const raw = inflateZlib(idat);
    const stride = width * bpp;
    if (raw.length < height * (1 + stride)) return null;

    const rgb = new Uint8Array(width * height * 3);
    let prevRow = new Uint8Array(stride);
    let curRow = new Uint8Array(stride);

    for (let y = 0; y < height; y++) {
      const rowBase = y * (1 + stride);
      const filterType = raw[rowBase];
      for (let i = 0; i < stride; i++) {
        const x = raw[rowBase + 1 + i];
        const a = i >= bpp ? curRow[i - bpp] : 0;
        const b = prevRow[i];
        const c = i >= bpp ? prevRow[i - bpp] : 0;
        if (filterType === 0) curRow[i] = x;
        else if (filterType === 1) curRow[i] = (x + a) & 0xff;
        else if (filterType === 2) curRow[i] = (x + b) & 0xff;
        else if (filterType === 3) curRow[i] = (x + ((a + b) >> 1)) & 0xff;
        else if (filterType === 4) curRow[i] = (x + paethPredictor(a, b, c)) & 0xff;
        else return null;
      }

      for (let x = 0; x < width; x++) {
        const dst = (y * width + x) * 3;
        const srcIdx = x * bpp;
        let r = 255;
        let g = 255;
        let bl = 255;
        let a = 255;

        if (colorType === 6) {
          r = curRow[srcIdx];
          g = curRow[srcIdx + 1];
          bl = curRow[srcIdx + 2];
          a = curRow[srcIdx + 3];
        } else if (colorType === 2) {
          r = curRow[srcIdx];
          g = curRow[srcIdx + 1];
          bl = curRow[srcIdx + 2];
          if (trns && trns.length >= 6) {
            const tr = (trns[0] << 8) | trns[1];
            const tg = (trns[2] << 8) | trns[3];
            const tb = (trns[4] << 8) | trns[5];
            if (r === tr && g === tg && bl === tb) a = 0;
          }
        } else if (colorType === 4) {
          r = g = bl = curRow[srcIdx];
          a = curRow[srcIdx + 1];
        } else if (colorType === 0) {
          r = g = bl = curRow[srcIdx];
          if (trns && trns.length >= 2 && r === ((trns[0] << 8) | trns[1])) a = 0;
        } else if (colorType === 3 && plte) {
          const pi = curRow[srcIdx];
          if (pi * 3 + 2 < plte.length) {
            r = plte[pi * 3];
            g = plte[pi * 3 + 1];
            bl = plte[pi * 3 + 2];
          }
          if (trns && pi < trns.length) a = trns[pi];
        }

        if (a === 255) {
          rgb[dst] = r;
          rgb[dst + 1] = g;
          rgb[dst + 2] = bl;
        } else if (a === 0) {
          rgb[dst] = 255;
          rgb[dst + 1] = 255;
          rgb[dst + 2] = 255;
        } else {
          const inv = 255 - a;
          rgb[dst] = ((r * a + 255 * inv + 127) / 255) | 0;
          rgb[dst + 1] = ((g * a + 255 * inv + 127) / 255) | 0;
          rgb[dst + 2] = ((bl * a + 255 * inv + 127) / 255) | 0;
        }
      }

      const tmp = prevRow;
      prevRow = curRow;
      curRow = tmp;
    }

    return { width, height, rleBytes: rleEncode(rgb) };
  } catch (error) {
    console.warn("sbsiPdfGenerator: failed to decode signatory signature PNG:", error);
    return null;
  }
}

/** Accumulates content-stream operators for one page. */
class Page {
  constructor() {
    this.ops = [];
    this.images = [];
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
  image(imgData, x, y, drawW, drawH) {
    const name = `Im${this.images.length + 1}`;
    this.images.push({ name, ...imgData });
    this.ops.push(`q\n${n(drawW)} 0 0 ${n(drawH)} ${n(x)} ${n(y)} cm\n/${name} Do\nQ`);
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
  const sigLineY = y - 46;
  if (data.signatorySignature) {
    const img = decodePngDataUrlToPdfRgbRle(data.signatorySignature);
    if (img) {
      const maxW = 140;
      const maxH = 36;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      page.image(img, L, sigLineY + 3, img.width * scale, img.height * scale);
    }
  }
  y = sigLineY;
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
    const xObjectEntries = [];
    for (const img of p.images) {
      const imgStream = bytesToLatin1(img.rleBytes);
      const imgId = add(
        `<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /RunLengthDecode /Length ${imgStream.length} >>\nstream\n${imgStream}\nendstream`,
      );
      xObjectEntries.push(`/${img.name} ${imgId} 0 R`);
    }
    const xObjectRes = xObjectEntries.length ? ` /XObject << ${xObjectEntries.join(" ")} >>` : "";
    const stream = p.ops.join("\n");
    const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = add(
      `<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${fonts[0]} 0 R /F2 ${fonts[1]} 0 R /F3 ${fonts[2]} 0 R >>${xObjectRes} >> /Contents ${contentId} 0 R >>`,
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
