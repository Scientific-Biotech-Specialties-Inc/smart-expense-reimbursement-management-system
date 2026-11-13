import { formatDate } from "@/utils/formatters";
import { receiptGrossAmount } from "@/utils/receiptUtils";

/** Default SBSI addressee used by all premade attachment reports. */
export const DEFAULT_SBSI_RECIPIENT = {
  name: "Lourdes C. Roxas",
  title: "Finance and Administration Director",
  company: "Scientific Biotech Specialties, Inc. (SBSI)",
  salutation: "Dear Ms. Roxas,",
};

/** Footer contact block printed on every SBSI letterhead. */
export const SBSI_FOOTER_CONTACT = {
  email: "info@sbsi.com.ph",
  phone: "Tel: +63 (2) 8824 4551",
  address: "6023 Sacred Heart cor. Kamagong Sts., San Antonio, Makati City",
};

export const SBSI_TEMPLATE_TYPES = ["reimbursement", "cash-advance", "liquidation"];

const DEFAULT_SUBJECTS = {
  reimbursement: "REIMBURSEMENT REQUEST FOR FIELD EXPENSES",
  "cash-advance": "OPERATIONAL CASH ADVANCE REQUEST",
  liquidation: "LIQUIDATION REPORT FOR CASH ADVANCE",
};

const REF_PREFIX = { reimbursement: "REIMB", liquidation: "LIQ" };
const BLANK = "________";
const VARIANCE_EPSILON = 0.005;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Today as local ISO `YYYY-MM-DD` (storage format; never shown to humans). */
export function todayIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** ISO date -> SERMS Medium Date (`Nov 13, 2026`); blank placeholder when empty. */
export function formatMediumDate(value) {
  if (!value) return BLANK;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  // Local-date construction avoids the UTC off-by-one that `new Date("YYYY-MM-DD")` causes.
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : value;
  return formatDate(date);
}

/** Number -> `PHP 1,250.00` (SERMS response standard; not the ₱ glyph). */
export function formatPhp(value) {
  return `PHP ${num(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * `SYS-REIMB-{YYYY}-{XXXX}` / `SYS-LIQ-{YYYY}-{XXXX}`; null for types without a ref id.
 * Deterministic when `id` is given, timestamp suffix when the record is unsaved.
 */
export function generateSystemRefId(type, id = null) {
  const prefix = REF_PREFIX[type];
  if (!prefix) return null;
  const hasId = id !== null && id !== undefined && id !== "";
  const suffix = hasId ? String(id).replace(/\D/g, "").slice(-4) || String(id).slice(-4) : String(Date.now()).slice(-4);
  return `SYS-${prefix}-${new Date().getFullYear()}-${suffix.padStart(4, "0")}`;
}

function receiptDescription(r) {
  const category = typeof r?.category === "object" ? r?.category?.name : r?.category;
  const vendor = r?.merchantName || r?.vendor_name || r?.vendor || r?.title || r?.fileName;
  return [category, vendor].filter(Boolean).join(" - ") || "Expense";
}

function receiptKey(r, i) {
  return String(r?.id ?? r?.receiptId ?? `idx-${i}`);
}

function receiptDate(receipts) {
  const r = (receipts || []).find((x) => x?.date || x?.transaction_date);
  const raw = r?.date || r?.transaction_date;
  return raw ? String(raw).slice(0, 10) : "";
}

function userFields(user) {
  if (!user) return {};
  const name = user.name || [user.first_name, user.last_name].filter(Boolean).join(" ");
  const dept = typeof user.department === "object" ? user.department?.name : user.department;
  return {
    signatoryName: name || "",
    signatoryRole: user.position || user.job_title || user.title || user.role || "",
    signatoryDepartment: dept || "",
  };
}

const sumItems = (items) => round2((items || []).reduce((s, i) => s + num(i.amount), 0));

function itemsFromReceipts(receipts, previous = []) {
  return receipts.map((r, i) => {
    const sourceId = receiptKey(r, i);
    const auto = receiptDescription(r);
    const prev = previous.find((p) => p.sourceId === sourceId);
    return {
      sourceId,
      description: prev?.descriptionEdited ? prev.description : auto,
      descriptionEdited: !!prev?.descriptionEdited,
      amount: round2(receiptGrossAmount(r)),
    };
  });
}

function baseTemplate(type) {
  return {
    type,
    date: todayIso(),
    systemRefId: null,
    systemRefIdAuto: false,
    recipientName: DEFAULT_SBSI_RECIPIENT.name,
    recipientTitle: DEFAULT_SBSI_RECIPIENT.title,
    recipientCompany: DEFAULT_SBSI_RECIPIENT.company,
    salutation: DEFAULT_SBSI_RECIPIENT.salutation,
    salutationAboveSubject: type === "cash-advance",
    subject: DEFAULT_SUBJECTS[type],
    purpose: "",
    expenseDate: "",
    disbursementDate: "",
    liquidationDeadline: "",
    totalAmount: 0,
    allocatedAmount: 0,
    utilizedAmount: 0,
    variance: 0,
    breakdownItems: [],
    additionalNotes: "",
    signatoryName: "",
    signatoryRole: "",
    signatoryDepartment: "",
  };
}

/**
 * Update context-driven fields (receipts, amounts, dates, purpose, ref id) on a template
 * without touching user-authored narrative, recipient, subject or signatory edits.
 * Returns a new object.
 */
export function syncTemplateWithContext(templateData, context = {}) {
  const type = templateData?.type;
  const next = { ...templateData, breakdownItems: (templateData?.breakdownItems || []).map((i) => ({ ...i })) };

  if (typeof context.purpose === "string" && context.purpose !== "") next.purpose = context.purpose;
  if (context.disbursementDate) next.disbursementDate = String(context.disbursementDate).slice(0, 10);
  if (context.liquidationDeadline) next.liquidationDeadline = String(context.liquidationDeadline).slice(0, 10);

  const u = userFields(context.user);
  for (const k of Object.keys(u)) if (!next[k] && u[k]) next[k] = u[k];

  if (type === "reimbursement" || type === "liquidation") {
    if (Array.isArray(context.receipts)) {
      next.breakdownItems = itemsFromReceipts(context.receipts, next.breakdownItems);
      if (!next.expenseDate) next.expenseDate = receiptDate(context.receipts);
    }
    const sum = sumItems(next.breakdownItems);
    if (type === "reimbursement") {
      next.totalAmount = next.breakdownItems.length ? sum : num(context.totalAmount ?? next.totalAmount);
    } else {
      if (context.allocatedAmount !== undefined) next.allocatedAmount = round2(context.allocatedAmount);
      next.utilizedAmount = num(context.utilizedAmount) > 0 ? round2(context.utilizedAmount) : sum;
      next.variance =
        next.allocatedAmount || next.utilizedAmount
          ? round2(next.allocatedAmount - next.utilizedAmount)
          : round2(context.variance ?? next.variance);
    }
  } else if (type === "cash-advance") {
    if (!next.breakdownItems.length) next.breakdownItems = [{ description: "", amount: 0 }];
    const sum = sumItems(next.breakdownItems);
    if (context.totalAmount !== undefined && round2(context.totalAmount) !== sum && next.breakdownItems.length === 1) {
      next.breakdownItems[0].amount = round2(context.totalAmount);
    }
    next.totalAmount = sumItems(next.breakdownItems);
  }

  const hasRecord = context.recordId !== null && context.recordId !== undefined && context.recordId !== "";
  if (REF_PREFIX[type] && (!next.systemRefId || (next.systemRefIdAuto && hasRecord))) {
    next.systemRefId = generateSystemRefId(type, hasRecord ? context.recordId : null);
    next.systemRefIdAuto = true;
  }
  return next;
}

/**
 * Build a complete template for a submission type. `context.existingData` (a persisted
 * `report_template_data`) wins over defaults while every required key is retained.
 */
export function createDefaultTemplateData(type, context = {}) {
  if (!SBSI_TEMPLATE_TYPES.includes(type)) throw new Error(`Unknown SBSI template type: ${type}`);
  const base = baseTemplate(type);
  const existing = context.existingData && typeof context.existingData === "object" ? context.existingData : {};
  const merged = { ...base };
  for (const [k, v] of Object.entries(existing)) if (v !== undefined) merged[k] = v;
  merged.type = type;
  if (!Array.isArray(merged.breakdownItems)) merged.breakdownItems = [];
  const hadExisting = Object.keys(existing).length > 0;
  if (hadExisting && merged.systemRefId) merged.systemRefIdAuto = !!existing.systemRefIdAuto;
  return syncTemplateWithContext(merged, context);
}

/** `Description — PHP 1.00; Other — PHP 2.00` */
export function formatBreakdownNarrative(breakdownItems) {
  return (breakdownItems || [])
    .map((i) => `${i.description || "(item)"} — ${formatPhp(i.amount)}`)
    .join("; ");
}

const T = (value) => ({ type: "text", value });
const F = (key, kind, extra = {}) => ({ type: "field", key, kind, ...extra });
const A = (value) => ({ type: "amount", value });
const B = () => ({ type: "breakdown" });

function liquidationClosing(data) {
  const v = data.allocatedAmount || data.utilizedAmount
    ? round2(num(data.allocatedAmount) - num(data.utilizedAmount))
    : round2(data.variance);
  const notes = F("additionalNotes", "text", { optional: true, prefix: " Additional notes: ", placeholder: "add an optional note" });
  if (v > VARIANCE_EPSILON) {
    return [
      T("The excess unexpended cash balance of "),
      A(v),
      T(" is being returned and remitted to Treasury/Finance alongside this submission."),
      notes,
    ];
  }
  if (v < -VARIANCE_EPSILON) {
    return [
      T("The excess out-of-pocket expenditure of "),
      A(Math.abs(v)),
      T(" was incurred beyond the allocated advance and is submitted for reimbursement consideration upon Finance review."),
      notes,
    ];
  }
  return [
    T("The allocated funds were fully utilized, with a remaining balance of "),
    A(0),
    T("."),
    notes,
  ];
}

/** Resolve a segment list to plain text (blank fields render as `________`). */
function segmentsToText(segments, data) {
  return segments
    .map((s) => {
      if (s.type === "text") return s.value;
      if (s.type === "amount") return formatPhp(s.value);
      if (s.type === "breakdown") return `${formatBreakdownNarrative(data.breakdownItems)}.`;
      const raw = data[s.key];
      if (s.optional && !raw) return "";
      const shown = s.kind === "date" ? formatMediumDate(raw) : String(raw || "").trim() || BLANK;
      return `${s.prefix || ""}${shown}`;
    })
    .join("");
}

/**
 * Structured letter content shared by the editor, preview and PDF generator so the
 * prose is defined exactly once. Paragraph `segments` describe inline Mad-Libs blanks.
 */
export function buildTemplateParagraphs(templateData) {
  const data = templateData || {};
  const type = data.type;
  const total = num(data.totalAmount);
  let defs;

  if (type === "cash-advance") {
    defs = [
      [
        T("I would like to formally request a cash advance in the amount of "),
        A(total),
        T(" to cover operational expenses for "),
        F("purpose", "text", { placeholder: "purpose" }),
        T(", with expected disbursement on "),
        F("disbursementDate", "date"),
        T("."),
      ],
      [T("The projected expenditure breakdown is as follows:"), B()],
      [
        T("I formally commit to liquidate all expenses and submit the official VAT/Non-VAT receipts on or before "),
        F("liquidationDeadline", "date"),
        T(
          ". I acknowledge that any unliquidated balance beyond the due date shall be subject to salary/payroll deduction in accordance with company policy.",
        ),
      ],
    ];
  } else if (type === "liquidation") {
    defs = [
      [
        T("I am submitting this formal liquidation report for the cash advance disbursed on "),
        F("disbursementDate", "date"),
        T(" in the total allocated amount of "),
        A(num(data.allocatedAmount)),
        T(" for "),
        F("purpose", "text", { placeholder: "purpose" }),
        T("."),
      ],
      [
        T("The utilization summary below shows total actual expenses of "),
        A(num(data.utilizedAmount)),
        T(" across the following items, supported by the uploaded official receipts:"),
        B(),
      ],
      liquidationClosing(data),
    ];
  } else {
    defs = [
      [
        T("I am writing to formally request reimbursement for operational expenses incurred during "),
        F("purpose", "text", { placeholder: "purpose" }),
        T(" on "),
        F("expenseDate", "date"),
        T(", totaling "),
        A(total),
        T(", as documented by the official receipts attached to this filing."),
      ],
      [
        T("The cost breakdown of the expenses is as follows:"),
        B(),
        T(" Verified receipts, including the BIR VAT details, are attached in the system submission."),
      ],
      [
        T(
          "I confirm that these expenses are strictly business-related, and I commit to providing any additional supporting information that may be required during Finance verification.",
        ),
      ],
    ];
  }

  const above = data.salutationAboveSubject ?? type === "cash-advance";
  return {
    type,
    dateLine: formatMediumDate(data.date),
    systemRefLine: data.systemRefId ? `System Ref ID: ${data.systemRefId}` : null,
    subjectLine: `SUBJECT: ${data.subject || ""}`,
    salutation: data.salutation || "",
    salutationAboveSubject: !!above,
    headerOrder: above ? ["salutation", "subject"] : ["subject", "salutation"],
    paragraphs: defs.map((segments, i) => ({
      id: `p${i + 1}`,
      segments,
      text: segmentsToText(segments, data),
    })),
  };
}

/** Returns `{ valid, errors[] }`; each error names the failed field, the reason and the fix. */
export function validateTemplateData(templateData) {
  const errors = [];
  const d = templateData;
  if (!d || typeof d !== "object") return { valid: false, errors: ["Template data: missing. Fill in the report template."] };
  const need = (key, label) => {
    if (!String(d[key] ?? "").trim()) errors.push(`${label}: required. Please fill in this field.`);
  };
  need("recipientName", "Recipient name");
  need("salutation", "Salutation");
  need("subject", "Subject");
  need("purpose", "Purpose");
  need("signatoryName", "Signatory name");
  if (d.type === "reimbursement") need("expenseDate", "Expense date");
  if (d.type === "cash-advance" || d.type === "liquidation") need("disbursementDate", "Disbursement date");
  if (d.type === "cash-advance") {
    need("liquidationDeadline", "Liquidation deadline");
    if (d.disbursementDate && d.liquidationDeadline && d.liquidationDeadline <= d.disbursementDate) {
      errors.push("Liquidation deadline: must be after the disbursement date. Choose a later date.");
    }
  }
  const items = Array.isArray(d.breakdownItems) ? d.breakdownItems : [];
  if (!items.length) errors.push("Breakdown: at least one item is required. Add a breakdown row.");
  items.forEach((item, i) => {
    if (!String(item.description || "").trim()) errors.push(`Breakdown row ${i + 1} description: required. Describe the expense.`);
    if (!(num(item.amount) > 0)) errors.push(`Breakdown row ${i + 1} amount: must be greater than PHP 0.00. Enter a positive amount.`);
  });
  return { valid: errors.length === 0, errors };
}

