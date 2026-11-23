import * as XLSX from "xlsx";
import { formatDateTime } from "./formatters";

/**
 * Escapes text for RFC 4180 CSV compliance.
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
}

/**
 * Format field changes into a readable summary string.
 */
function formatChanges(changes) {
  if (!Array.isArray(changes) || changes.length === 0) return "";
  return changes
    .map((c) => `${c.field || c.key || "Field"}: ${c.before ?? "—"} -> ${c.after ?? "—"}`)
    .join("; ");
}

/**
 * Generate standard RFC 4180 CSV format with UTF-8 BOM.
 */
export function generateCsv(trail = [], options = {}) {
  const headers = [
    "Time",
    "User",
    "Role",
    "IP Address",
    "Domain",
    "Action",
    "Comment",
    "Changes",
  ];

  const rows = [headers.join(",")];

  for (const entry of trail) {
    const time = entry.created_at ? formatDateTime(entry.created_at) : "—";
    const user = entry.actor_name || "System";
    const role = entry.actor_role || "";
    const ip = entry.ip_address || "";
    const domain = entry.domain_label || entry.domain || "";
    const action = entry.label || entry.action_type || "";
    const comment = entry.comment || "";
    const changes = formatChanges(entry.changes);

    const row = [
      escapeCsv(time),
      escapeCsv(user),
      escapeCsv(role),
      escapeCsv(ip),
      escapeCsv(domain),
      escapeCsv(action),
      escapeCsv(comment),
      escapeCsv(changes),
    ];

    rows.push(row.join(","));
  }

  // Prepend UTF-8 BOM so Excel opens with proper encoding
  return "\uFEFF" + rows.join("\r\n");
}

/**
 * Generate native binary XLSX (OpenXML) format using SheetJS.
 */
export function generateXlsx(trail = [], options = {}) {
  const rows = trail.map((entry) => ({
    Time: entry.created_at ? formatDateTime(entry.created_at) : "—",
    User: entry.actor_name || "System",
    Role: entry.actor_role || "",
    "IP Address": entry.ip_address || "",
    Domain: entry.domain_label || entry.domain || "",
    Action: entry.label || entry.action_type || "",
    Comment: entry.comment || "",
    Changes: formatChanges(entry.changes),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows, {
    header: ["Time", "User", "Role", "IP Address", "Domain", "Action", "Comment", "Changes"],
  });

  // Set friendly column widths
  worksheet["!cols"] = [
    { wch: 22 }, // Time
    { wch: 20 }, // User
    { wch: 14 }, // Role
    { wch: 16 }, // IP Address
    { wch: 16 }, // Domain
    { wch: 18 }, // Action
    { wch: 35 }, // Comment
    { wch: 35 }, // Changes
  ];

  const workbook = XLSX.utils.book_new();
  const rawTitle = options.title || "Audit Log";
  const sheetTitle = String(rawTitle).replace(/[:\\\/?*\[\]]/g, "-").slice(0, 31);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetTitle);

  const arrayBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  return new Uint8Array(arrayBuffer);
}

/**
 * Generate formatted JSON string.
 */
export function generateJson(trail = []) {
  return JSON.stringify(trail, null, 2);
}

/**
 * Pure JavaScript PDF 1.4 compiler.
 */
function escapePdfText(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[\r\n]+/g, " ");
}

/**
 * Truncate string for PDF table column width.
 */
function truncateText(str, maxLen = 40) {
  if (!str) return "";
  const clean = String(str).trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + "…";
}

/**
 * Generate a clean corporate PDF 1.4 document of the audit log.
 */
export function generatePdf(trail = [], options = {}) {
  const pageWidth = 612; // Letter width (pt)
  const pageHeight = 792; // Letter height (pt)
  const margin = 36;
  const contentWidth = pageWidth - margin * 2; // 540 pt
  const rowHeight = 22;
  const topY = 720;
  const bottomY = 54;
  const rowsPerPage = Math.floor((topY - bottomY - 40) / rowHeight);

  const title = options.title || "Audit Trail Log";
  const exportedAt = formatDateTime(new Date().toISOString());

  // Split trail into pages
  const chunks = [];
  if (trail.length === 0) {
    chunks.push([]);
  } else {
    for (let i = 0; i < trail.length; i += rowsPerPage) {
      chunks.push(trail.slice(i, i + rowsPerPage));
    }
  }

  const pages = [];
  const totalPages = chunks.length;

  chunks.forEach((chunk, pageIndex) => {
    let stream = "";

    // Header background & corporate bar
    stream += `0.118 0.161 0.231 rg\n`; // Slate 900
    stream += `${margin} ${pageHeight - 50} ${contentWidth} 24 re f\n`;

    // Header text
    stream += `BT\n/F1 12 Tf\n1 1 1 rg\n`;
    stream += `${margin + 8} ${pageHeight - 43} Td\n(${escapePdfText(title)}) Tj\n`;
    stream += `/F2 8 Tf\n0.8 0.8 0.8 rg\n`;
    stream += `300 0 Td\n(Exported: ${escapePdfText(exportedAt)} | Page ${pageIndex + 1} of ${totalPages}) Tj\nET\n`;

    // Table Column Headers
    const colX = [margin, margin + 110, margin + 200, margin + 270, margin + 370];
    const headerY = topY;

    // Table header background
    stream += `0.941 0.953 0.973 rg\n`; // Slate 100
    stream += `${margin} ${headerY - 4} ${contentWidth} 16 re f\n`;

    stream += `BT\n/F1 8 Tf\n0.3 0.35 0.4 rg\n`;
    stream += `${colX[0] + 4} ${headerY} Td\n(TIME) Tj\n`;
    stream += `${colX[1] - colX[0]} 0 Td\n(USER) Tj\n`;
    stream += `${colX[2] - colX[1]} 0 Td\n(ROLE) Tj\n`;
    stream += `${colX[3] - colX[2]} 0 Td\n(ACTION) Tj\n`;
    stream += `${colX[4] - colX[3]} 0 Td\n(DETAILS / COMMENT) Tj\nET\n`;

    // Rows
    let currentY = headerY - 20;

    if (chunk.length === 0) {
      stream += `BT\n/F2 9 Tf\n0.5 0.5 0.5 rg\n`;
      stream += `${margin + 4} ${currentY} Td\n(No audit trail records found.) Tj\nET\n`;
    } else {
      chunk.forEach((entry, rowIdx) => {
        // Alternating row background
        if (rowIdx % 2 === 1) {
          stream += `0.98 0.98 0.99 rg\n`;
          stream += `${margin} ${currentY - 4} ${contentWidth} ${rowHeight} re f\n`;
        }

        // Row border bottom
        stream += `0.89 0.91 0.94 RG\n0.5 w\n`;
        stream += `${margin} ${currentY - 4} m ${margin + contentWidth} ${currentY - 4} l S\n`;

        const time = formatDateTime(entry.created_at);
        const user = truncateText(entry.actor_name || "System", 16);
        const role = truncateText(entry.actor_role || "—", 12);
        const action = truncateText(entry.label || entry.action_type || "—", 16);

        let details = entry.comment || "";
        if (entry.changes && entry.changes.length > 0) {
          const diffStr = formatChanges(entry.changes);
          details = details ? `${details} | ${diffStr}` : diffStr;
        }
        details = truncateText(details || "—", 32);

        stream += `BT\n/F2 8 Tf\n0.2 0.25 0.3 rg\n`;
        stream += `${colX[0] + 4} ${currentY + 2} Td\n(${escapePdfText(time)}) Tj\nET\n`;

        stream += `BT\n/F1 8 Tf\n0.1 0.15 0.2 rg\n`;
        stream += `${colX[1] + 4} ${currentY + 2} Td\n(${escapePdfText(user)}) Tj\nET\n`;

        stream += `BT\n/F2 8 Tf\n0.4 0.45 0.5 rg\n`;
        stream += `${colX[2] + 4} ${currentY + 2} Td\n(${escapePdfText(role)}) Tj\nET\n`;

        stream += `BT\n/F1 8 Tf\n0.1 0.15 0.2 rg\n`;
        stream += `${colX[3] + 4} ${currentY + 2} Td\n(${escapePdfText(action)}) Tj\nET\n`;

        stream += `BT\n/F2 8 Tf\n0.3 0.35 0.4 rg\n`;
        stream += `${colX[4] + 4} ${currentY + 2} Td\n(${escapePdfText(details)}) Tj\nET\n`;

        currentY -= rowHeight;
      });
    }

    pages.push(stream);
  });

  return compilePdfDocument(pages, pageWidth, pageHeight);
}

/**
 * Compiles PDF objects, cross-reference table, and trailer.
 */
function compilePdfDocument(pages, pageWidth, pageHeight) {
  const pageCount = pages.length;
  const objects = {};
  let objIndex = 1;

  const catalogIndex = objIndex++;
  const pagesIndex = objIndex++;
  const fontBoldIndex = objIndex++;
  const fontRegularIndex = objIndex++;
  const fontObliqueIndex = objIndex++;

  const pageObjIndices = [];
  const streamObjIndices = [];

  for (let i = 0; i < pageCount; i++) {
    pageObjIndices.push(objIndex++);
    streamObjIndices.push(objIndex++);
  }

  objects[catalogIndex] = `${catalogIndex} 0 obj\n<< /Type /Catalog /Pages ${pagesIndex} 0 R >>\nendobj\n`;

  const kids = pageObjIndices.map((idx) => `${idx} 0 R`).join(" ");
  objects[pagesIndex] = `${pagesIndex} 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj\n`;

  objects[fontBoldIndex] = `${fontBoldIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;
  objects[fontRegularIndex] = `${fontRegularIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  objects[fontObliqueIndex] = `${fontObliqueIndex} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>\nendobj\n`;

  for (let i = 0; i < pageCount; i++) {
    const pIdx = pageObjIndices[i];
    const sIdx = streamObjIndices[i];
    const streamContent = pages[i];
    const streamLen = new TextEncoder().encode(streamContent).length;

    objects[pIdx] = `${pIdx} 0 obj\n<< /Type /Page /Parent ${pagesIndex} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontBoldIndex} 0 R /F2 ${fontRegularIndex} 0 R /F3 ${fontObliqueIndex} 0 R >> >> /Contents ${sIdx} 0 R >>\nendobj\n`;
    objects[sIdx] = `${sIdx} 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamContent}\nendstream\nendobj\n`;
  }

  let pdf = "%PDF-1.4\n";
  const offsets = {};
  const sortedKeys = Object.keys(objects)
    .map(Number)
    .sort((a, b) => a - b);

  for (const num of sortedKeys) {
    offsets[num] = new TextEncoder().encode(pdf).length;
    pdf += objects[num];
  }

  const xrefOffset = new TextEncoder().encode(pdf).length;
  const count = sortedKeys.length + 1;
  pdf += `xref\n0 ${count}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= sortedKeys.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, "0");
    pdf += `${offsetStr} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${count} /Root ${catalogIndex} 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

/**
 * Triggers a browser file download for the specified audit trail and format.
 */
export function exportAuditTrail(trail = [], format = "csv", options = {}) {
  const normFormat = String(format).toLowerCase();
  const dateStr = new Date().toISOString().slice(0, 10);
  const titleSlug = options.entityTitle
    ? String(options.entityTitle)
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
    : "Export";

  let content = "";
  let mimeType = "text/plain";
  let defaultExt = "txt";

  if (normFormat === "csv") {
    content = generateCsv(trail, options);
    mimeType = "text/csv;charset=utf-8;";
    defaultExt = "csv";
  } else if (normFormat === "xlsx" || normFormat === "excel") {
    content = generateXlsx(trail, options);
    mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    defaultExt = "xlsx";
  } else if (normFormat === "pdf") {
    content = generatePdf(trail, options);
    mimeType = "application/pdf";
    defaultExt = "pdf";
  } else if (normFormat === "json") {
    content = generateJson(trail);
    mimeType = "application/json;charset=utf-8;";
    defaultExt = "json";
  } else {
    throw new Error(`Unsupported export format: ${format}`);
  }

  const filename = options.filename || `Audit-Log-${titleSlug}-${dateStr}.${defaultExt}`;

  const blob = new Blob([content], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);

  return true;
}
