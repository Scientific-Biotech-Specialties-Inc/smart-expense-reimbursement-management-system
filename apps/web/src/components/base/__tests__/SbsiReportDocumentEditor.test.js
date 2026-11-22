// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/stores/auth";
import SbsiReportDocumentEditor from "../SbsiReportDocumentEditor.vue";
import {
  DEFAULT_SBSI_RECIPIENT,
  buildTemplateParagraphs,
  createDefaultTemplateData,
  formatMediumDate,
  formatPhp,
  generateSystemRefId,
  resetBreakdownFromReceipts,
  syncTemplateWithContext,
  validateTemplateData,
} from "@/utils/sbsiReportTemplateUtils";
import { generateSbsiReportPdfBytes, createSbsiReportPdfFile } from "@/utils/sbsiPdfGenerator";
import { deflateSync } from "node:zlib";

function buildTestRgbaPngDataUrl(width, height, rgbaRows) {
  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 4);
    raw[off] = 1; // Sub filter to exercise PNG unfiltering too
    for (let i = 0; i < width * 4; i++) {
      const prev = i >= 4 ? rgbaRows[y][i - 4] : 0;
      raw[off + 1 + i] = (rgbaRows[y][i] - prev) & 0xff;
    }
  }
  const idat = deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

function decodePdfRle(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length; ) {
    const len = bytes[i++];
    if (len === 128) break;
    if (len < 128) {
      for (let k = 0; k < len + 1; k++) out.push(bytes[i++]);
    } else {
      const val = bytes[i++];
      for (let k = 0; k < 257 - len; k++) out.push(val);
    }
  }
  return Uint8Array.from(out);
}

const user = { name: "Juan Dela Cruz", position: "Field Engineer", department: "Operations" };
const receipts = [
  { id: 1, category: "Meals", vendor_name: "Jollibee", total_amount: 250, date: "2026-11-10" },
  { id: 2, category: "Transportation", vendor_name: "Grab", total_amount: 1000, date: "2026-11-10" },
];

const mountEditor = (props, options = {}) =>
  mount(SbsiReportDocumentEditor, {
    props,
    global: { stubs: { SbsiReportPreviewModal: true } },
    ...options,
  });

const pdfText = (data) => new TextDecoder("latin1").decode(generateSbsiReportPdfBytes(data));

describe("sbsiReportTemplateUtils", () => {
  it("formats SERMS medium dates and PHP amounts", () => {
    expect(formatMediumDate("2026-11-13")).toBe("Nov 13, 2026");
    expect(formatPhp(1250)).toBe("PHP 1,250.00");
  });

  it("generates deterministic system ref ids and none for cash advances", () => {
    const year = new Date().getFullYear();
    expect(generateSystemRefId("reimbursement", 7)).toBe(`SYS-REIMB-${year}-0007`);
    expect(generateSystemRefId("liquidation", 12345)).toBe(`SYS-LIQ-${year}-2345`);
    expect(generateSystemRefId("cash-advance", 1)).toBeNull();
  });

  it("builds defaults per type with recipient, signatory and receipt breakdown", () => {
    const r = createDefaultTemplateData("reimbursement", { user, receipts, recordId: 5 });
    expect(r.subject).toBe("REIMBURSEMENT REQUEST FOR FIELD EXPENSES");
    expect(r.recipientName).toBe(DEFAULT_SBSI_RECIPIENT.name);
    expect(r.signatoryName).toBe("Juan Dela Cruz");
    expect(r.signatoryRole).toBe("Field Engineer");
    expect(r.signatoryDepartment).toBe("Operations");
    expect(r.systemRefId).toMatch(/^SYS-REIMB-\d{4}-0005$/);
    expect(r.breakdownItems.map((i) => i.amount)).toEqual([250, 1000]);
    expect(r.totalAmount).toBe(1250);

    const ca = createDefaultTemplateData("cash-advance", { totalAmount: 500 });
    expect(ca.systemRefId).toBeNull();
    expect(ca.breakdownItems).toEqual([{ description: "", amount: 500 }]);

    const liq = createDefaultTemplateData("liquidation", { receipts, allocatedAmount: 2000 });
    expect(liq.systemRefId).toMatch(/^SYS-LIQ-/);
    expect(liq.variance).toBe(750);
  });

  it("keeps existingData edits and user-edited descriptions when syncing", () => {
    const existing = createDefaultTemplateData("reimbursement", { receipts });
    existing.subject = "CUSTOM SUBJECT";
    existing.breakdownItems[0].description = "Team lunch";
    existing.breakdownItems[0].descriptionEdited = true;
    const synced = syncTemplateWithContext(existing, {
      receipts: [{ ...receipts[0], total_amount: 300 }, receipts[1]],
    });
    expect(synced.subject).toBe("CUSTOM SUBJECT");
    expect(synced.breakdownItems[0]).toMatchObject({ description: "Team lunch", amount: 300 });
    expect(synced.totalAmount).toBe(1300);
  });

  it("orders subject/salutation per reference PDFs", () => {
    const order = (type) => buildTemplateParagraphs(createDefaultTemplateData(type, {})).headerOrder;
    expect(order("cash-advance")).toEqual(["salutation", "subject"]);
    expect(order("reimbursement")).toEqual(["subject", "salutation"]);
    expect(order("liquidation")).toEqual(["subject", "salutation"]);
  });

  it.each([
    [500, "excess unexpended cash balance of PHP 500.00"],
    [0, "remaining balance of PHP 0.00"],
    [-250, "excess out-of-pocket expenditure of PHP 250.00"],
  ])("liquidation paragraph 3 for variance %s", (variance, expected) => {
    const data = createDefaultTemplateData("liquidation", {
      allocatedAmount: 1000 + variance,
      utilizedAmount: 1000,
      disbursementDate: "2026-11-01",
      purpose: "Field work",
    });
    data.additionalNotes = "See attached.";
    const p3 = buildTemplateParagraphs(data).paragraphs[2].text;
    expect(p3).toContain(expected);
    expect(p3).toContain("Additional notes: See attached.");
  });

  it("validates required fields and rows", () => {
    const empty = createDefaultTemplateData("cash-advance", {});
    const result = validateTemplateData(empty);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/Purpose/);
    expect(result.errors.join(" ")).toMatch(/Breakdown row 1/);

    const ok = createDefaultTemplateData("cash-advance", {
      user,
      purpose: "Site visit",
      totalAmount: 100,
      disbursementDate: "2026-11-14",
      liquidationDeadline: "2026-11-20",
    });
    ok.breakdownItems[0].description = "Fuel";
    expect(validateTemplateData(ok)).toEqual({ valid: true, errors: [] });
  });

  it("reconciles receipt additions/removals while preserving custom rows, manual edits, and removedSourceIds", () => {
    const base = createDefaultTemplateData("reimbursement", { receipts });
    base.breakdownItems[0].description = "Team lunch";
    base.breakdownItems[0].descriptionEdited = true;
    base.breakdownItems[0].amount = 300;
    base.breakdownItems[0].amountEdited = true;
    base.breakdownItems.push({ description: "Toll fee", amount: 150 });
    base.removedSourceIds = ["2"];
    base.breakdownItems = base.breakdownItems.filter((item) => item.sourceId !== "2");

    // Receipt 2 still exists in receipts, receipt 3 is added -> 2 stays deleted, 3 is appended, custom & edited kept
    const afterAdd = syncTemplateWithContext(base, {
      receipts: [
        { ...receipts[0], total_amount: 999 },
        receipts[1],
        { id: 3, category: "Supplies", vendor_name: "National Book Store", total_amount: 200 },
      ],
    });
    expect(afterAdd.breakdownItems).toEqual([
      { sourceId: "1", description: "Team lunch", descriptionEdited: true, amount: 300, amountEdited: true },
      { description: "Toll fee", amount: 150 },
      { sourceId: "3", description: "Supplies - National Book Store", descriptionEdited: false, amount: 200, amountEdited: false },
    ]);
    expect(afterAdd.totalAmount).toBe(650);
    expect(afterAdd.removedSourceIds).toEqual(["2"]);

    // Receipt 2 is actually removed from receipts, receipt 3 is removed -> 3 drops, removedSourceIds prunes "2"
    const afterRemove = syncTemplateWithContext(afterAdd, { receipts: [receipts[0]] });
    expect(afterRemove.breakdownItems).toEqual([
      { sourceId: "1", description: "Team lunch", descriptionEdited: true, amount: 300, amountEdited: true },
      { description: "Toll fee", amount: 150 },
    ]);
    expect(afterRemove.totalAmount).toBe(450);
    expect(afterRemove.removedSourceIds).toEqual([]);

    // Reset restores clean 1-to-1 from receipts
    const reset = resetBreakdownFromReceipts(afterRemove, { receipts });
    expect(reset.breakdownItems.map((i) => ({ sourceId: i.sourceId, amount: i.amount }))).toEqual([
      { sourceId: "1", amount: 250 },
      { sourceId: "2", amount: 1000 },
    ]);
    expect(reset.totalAmount).toBe(1250);
    expect(reset.removedSourceIds).toEqual([]);
  });

  it("does not duplicate legacy breakdownItems lacking sourceId when syncing with receipts, while keeping isCustom rows", () => {
    const legacy = {
      type: "liquidation",
      allocatedAmount: 1000,
      breakdownItems: [{ qty: 1, description: "Meals - Jollibee", amount: 250 }],
    };
    const synced = syncTemplateWithContext(legacy, {
      receipts: [receipts[0]],
    });
    expect(synced.breakdownItems).toHaveLength(1);
    expect(synced.breakdownItems[0].sourceId).toBe("1");
    expect(synced.utilizedAmount).toBe(250);

    // Explicit isCustom row is kept even when no sourceId rows exist
    const customOnly = {
      type: "reimbursement",
      breakdownItems: [{ description: "Custom Toll", amount: 120, isCustom: true }],
    };
    const syncedCustom = syncTemplateWithContext(customOnly, { receipts: [receipts[0]] });
    expect(syncedCustom.breakdownItems.map((i) => i.description)).toEqual([
      "Custom Toll",
      "Meals - Jollibee",
    ]);
    expect(syncedCustom.totalAmount).toBe(370);
  });
});

describe("sbsiPdfGenerator", () => {
  it("produces a valid %PDF-1.4 document with SBSI header/footer and body text", () => {
    const data = createDefaultTemplateData("reimbursement", { user, receipts, purpose: "client visit", recordId: 9 });
    const bytes = generateSbsiReportPdfBytes(data);
    expect(bytes).toBeInstanceOf(Uint8Array);
    const text = pdfText(data);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
    for (const needle of [
      "SCIENTIFIC BIOTECH",
      "SPECIALTIES, INC.",
      "info@sbsi.com.ph",
      "Tel: +63 \\(2\\) 8824 4551",
      "Makati City",
      "SUBJECT: REIMBURSEMENT REQUEST FOR FIELD EXPENSES",
      "Dear Ms. Roxas,",
      "PHP 1,250.00",
      "_______________________",
      "Juan Dela Cruz",
      "0 0.2902 0.6784 rg",
    ]) {
      expect(text).toContain(needle);
    }
    expect(text.indexOf("SUBJECT:")).toBeLessThan(text.indexOf("Dear Ms. Roxas,"));
  });

  it("puts the salutation above the subject for cash advances", () => {
    const data = createDefaultTemplateData("cash-advance", { purpose: "Trip", totalAmount: 100 });
    const text = pdfText(data);
    expect(text.indexOf("Dear Ms. Roxas,")).toBeLessThan(text.indexOf("SUBJECT:"));
  });

  it("paginates long breakdowns and exposes a PDF File", () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ id: i, category: "Meals", vendor_name: `Vendor ${i}`, total_amount: 10 }));
    const data = createDefaultTemplateData("liquidation", { receipts: many, allocatedAmount: 800 });
    expect((pdfText(data).match(/\/Type \/Page /g) || []).length).toBeGreaterThan(1);
    const file = createSbsiReportPdfFile(data, "x.pdf");
    expect(file.type).toBe("application/pdf");
    expect(file.name).toBe("x.pdf");
  });
});

describe("SbsiReportDocumentEditor", () => {
  const order = (wrapper) => {
    const html = wrapper.find('[data-testid="header-lines"]').html();
    return html.indexOf("subject-line") < html.indexOf("salutation-line") ? "subject-first" : "salutation-first";
  };

  it("renders reimbursement with subject above salutation, system ref and receipt rows", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts, user, recordId: 3 });
    await nextTick();
    expect(order(wrapper)).toBe("subject-first");
    expect(wrapper.find('[data-testid="system-ref"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-template"]').attributes("aria-label")).toBe("Use Premade Template");
    expect(wrapper.find('[data-testid="breakdown-description-1"]').element.value).toContain("Grab");
    expect(wrapper.text()).toContain("PHP 1,250.00");
    const emitted = wrapper.emitted("update:modelValue");
    expect(emitted.at(-1)[0].totalAmount).toBe(1250);
  });

  it("renders cash advance with salutation above subject and no system ref", async () => {
    const wrapper = mountEditor({ type: "cash-advance" });
    await nextTick();
    expect(order(wrapper)).toBe("salutation-first");
    expect(wrapper.find('[data-testid="system-ref"]').exists()).toBe(false);
  });

  it("syncs cash advance breakdown total both ways and guards against loops", async () => {
    const wrapper = mountEditor({ type: "cash-advance", totalAmount: "" });
    await nextTick();

    await wrapper.setProps({ totalAmount: 500 });
    expect(wrapper.find('[data-testid="breakdown-amount-0"]').element.value).toBe("500");

    await wrapper.find('[data-testid="breakdown-amount-0"]').setValue(750);
    expect(wrapper.emitted("update:totalAmount").at(-1)).toEqual([750]);

    await wrapper.find('[data-testid="breakdown-add"]').trigger("click");
    await wrapper.find('[data-testid="breakdown-amount-1"]').setValue(250);
    expect(wrapper.emitted("update:totalAmount").at(-1)).toEqual([1000]);
    expect(wrapper.emitted("update:modelValue").at(-1)[0].totalAmount).toBe(1000);

    await wrapper.setProps({ totalAmount: 1000 });
    const before = wrapper.emitted("update:totalAmount").length;
    await nextTick();
    expect(wrapper.emitted("update:totalAmount").length).toBe(before);

    await wrapper.find('[data-testid="breakdown-remove-1"]').trigger("click");
    expect(wrapper.emitted("update:totalAmount").at(-1)).toEqual([750]);
  });

  it("emits purpose and date updates from inline blanks", async () => {
    const wrapper = mountEditor({ type: "cash-advance" });
    await nextTick();
    await wrapper.find('[data-testid="field-purpose"]').setValue("Site survey");
    expect(wrapper.emitted("update:purpose").at(-1)).toEqual(["Site survey"]);
    await wrapper.find('[data-testid="field-disbursementDate"] input').setValue("2026-11-20");
    expect(wrapper.emitted("update:disbursementDate").at(-1)).toEqual(["2026-11-20"]);
    await wrapper.find('[data-testid="field-liquidationDeadline"] input').setValue("2026-11-30");
    expect(wrapper.emitted("update:liquidationDeadline").at(-1)).toEqual(["2026-11-30"]);
    expect(wrapper.text()).toContain("Nov 30, 2026");
  });

  it("shows the dynamic liquidation closing for each variance", async () => {
    const wrapper = mountEditor({ type: "liquidation", receipts, allocatedAmount: 2000, utilizedAmount: 1250 });
    await nextTick();
    expect(wrapper.find('[data-testid="para-p3"]').text()).toContain("PHP 750.00");
    await wrapper.setProps({ allocatedAmount: 1250 });
    expect(wrapper.find('[data-testid="para-p3"]').text()).toContain("PHP 0.00");
    await wrapper.setProps({ allocatedAmount: 1000, utilizedAmount: 1250 });
    expect(wrapper.find('[data-testid="para-p3"]').text()).toContain("out-of-pocket");
  });

  it("switches to manual upload and notifies the parent of valid files only", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts });
    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    expect(wrapper.find('[data-testid="manual-upload"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="document-canvas"]').exists()).toBe(false);

    const input = wrapper.find('[data-testid="manual-file-input"]');
    const bad = new File(["x"], "pic.png", { type: "image/png" });
    Object.defineProperty(input.element, "files", { value: [bad], configurable: true });
    await input.trigger("change");
    expect(wrapper.emitted("update:reportFile")).toBeUndefined();

    const good = new File(["x"], "report.pdf", { type: "application/pdf" });
    Object.defineProperty(input.element, "files", { value: [good], configurable: true });
    await input.trigger("change");
    expect(wrapper.emitted("update:reportFile").at(-1)).toEqual([good]);
    expect(wrapper.find('[data-testid="manual-file-name"]').text()).toBe("report.pdf");

    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    expect(wrapper.emitted("update:reportFile").at(-1)).toEqual([null]);
    expect(wrapper.find('[data-testid="document-canvas"]').exists()).toBe(true);
  });

  it("renders the SBSI webp logo in the letterhead without invert filter", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts });
    await nextTick();
    const logo = wrapper.find('header img[alt="SBSI logo"]');
    expect(logo.exists()).toBe(true);
    expect(logo.attributes("src")).toContain("sbsi-logo.webp");
    expect(logo.classes()).not.toContain("brightness-0");
    expect(logo.classes()).not.toContain("invert");
  });

  it("renders read-only without inputs", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts, readonly: true });
    await nextTick();
    expect(wrapper.find('[data-testid="document-canvas"] input').exists()).toBe(false);
    expect(wrapper.text()).toContain("Lourdes C. Roxas");
  });

  it("teleports the document wrapper to body when expanded and restores inline on close", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts }, { attachTo: document.body });
    await nextTick();

    const expandBtn = wrapper.find('[data-testid="expand-editor"]');
    expect(expandBtn.exists()).toBe(true);
    await expandBtn.trigger("click");

    const expandedEl = document.body.querySelector('[data-testid="document-wrapper"]');
    expect(expandedEl).not.toBeNull();
    expect(expandedEl.parentElement).toBe(document.body);
    expect(expandedEl.className).toContain("fixed");
    expect(expandedEl.className).toContain("inset-0");
    expect(expandedEl.querySelector('[data-testid="document-canvas"]').className).not.toContain("ring-1");

    const closeBtn = document.body.querySelector('[data-testid="collapse-editor"]');
    expect(closeBtn).not.toBeNull();
    closeBtn.click();
    await nextTick();

    expect(wrapper.find('[data-testid="document-wrapper"]').element.parentElement).not.toBe(document.body);
    expect(wrapper.find('[data-testid="document-canvas"]').classes()).toContain("ring-1");
    wrapper.unmount();
  });

  it("defaults signatorySignature to saved profile signature and allows switching to free draw and back", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 1, name: "Juan Dela Cruz", signature: savedSig };

    const wrapper = mountEditor({ type: "reimbursement", receipts, user });
    await nextTick();

    expect(wrapper.find('[data-testid="signatory-signature-pad"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="saved-signature-indicator"]').exists()).toBe(true);
    expect(wrapper.emitted("update:modelValue").at(-1)[0].signatorySignature).toBe(savedSig);

    // Clear and free draw a custom signature
    await wrapper.find('[data-testid="clear-signature-btn"]').trigger("click");
    await nextTick();
    expect(wrapper.emitted("update:modelValue").at(-1)[0].signatorySignature).toBe("");

    const canvas = wrapper.find('[data-testid="signatory-signature-pad"] canvas');
    const ctxMock = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    canvas.element.getContext = vi.fn(() => ctxMock);
    canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,freeDrawnSignature");

    await canvas.trigger("pointerdown", { clientX: 10, clientY: 10, pointerId: 1 });
    await canvas.trigger("pointermove", { clientX: 40, clientY: 20 });
    await canvas.trigger("pointerup");
    await nextTick();

    expect(wrapper.emitted("update:modelValue").at(-1)[0].signatorySignature).toBe("data:image/png;base64,freeDrawnSignature");

    // Switch back to saved profile signature
    const useSavedBtn = wrapper.find('[data-testid="use-saved-signature-btn"]');
    expect(useSavedBtn.exists()).toBe(true);
    await useSavedBtn.trigger("click");
    await nextTick();

    expect(wrapper.emitted("update:modelValue").at(-1)[0].signatorySignature).toBe(savedSig);
  });

  it("allows free draw when user has no saved profile signature", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { id: 2, name: "Maria Clara", signature: null };

    const wrapper = mountEditor({ type: "cash-advance" });
    await nextTick();

    expect(wrapper.find('[data-testid="saved-signature-indicator"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="use-saved-signature-btn"]').exists()).toBe(false);

    const canvas = wrapper.find('[data-testid="signatory-signature-pad"] canvas');
    const ctxMock = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      clearRect: vi.fn(),
    };
    canvas.element.getContext = vi.fn(() => ctxMock);
    canvas.element.toDataURL = vi.fn(() => "data:image/png;base64,noProfileFreeDraw");

    await canvas.trigger("pointerdown", { clientX: 5, clientY: 5, pointerId: 1 });
    await canvas.trigger("pointermove", { clientX: 30, clientY: 18 });
    await canvas.trigger("pointerup");
    await nextTick();

    expect(wrapper.emitted("update:modelValue").at(-1)[0].signatorySignature).toBe("data:image/png;base64,noProfileFreeDraw");
  });

  it("renders signatory signature image in readonly mode and ignores unsafe urls", async () => {
    const validSig = "data:image/png;base64,iVBORw0KGgo=";
    const wrapper = mountEditor({
      type: "reimbursement",
      receipts,
      readonly: true,
      modelValue: { signatorySignature: validSig },
    });
    await nextTick();

    expect(wrapper.find('[data-testid="signatory-signature-pad"]').exists()).toBe(false);
    const img = wrapper.find('[data-testid="signatory-signature-image"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes("src")).toBe(validSig);

    await wrapper.setProps({ modelValue: { signatorySignature: "javascript:alert(1)" } });
    await nextTick();
    expect(wrapper.find('[data-testid="signatory-signature-image"]').exists()).toBe(false);
  });

  it("embeds a valid RGBA PNG signature into the generated PDF with accurate white-composited RGB pixels", () => {
    // 2x1 RGBA PNG: pixel 0 = opaque dark ink (30, 41, 59, 255), pixel 1 = transparent (0, 0, 0, 0)
    const sigUrl = buildTestRgbaPngDataUrl(2, 1, [[30, 41, 59, 255, 0, 0, 0, 0]]);
    const data = createDefaultTemplateData("reimbursement", {
      user: { ...user, signature: sigUrl },
      receipts,
      purpose: "Field visit",
    });

    const bytes = generateSbsiReportPdfBytes(data);
    const latin1 = new TextDecoder("latin1").decode(bytes);
    expect(latin1).toContain("/Subtype /Image");
    expect(latin1).toContain("/Width 2 /Height 1");
    expect(latin1).toContain("/Filter /RunLengthDecode");
    expect(latin1).toContain("/Im1 Do");

    const imgMatch = /\/Subtype \/Image[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(latin1);
    expect(imgMatch).not.toBeNull();
    const streamStart = imgMatch.index + imgMatch[0].length;
    const streamLen = Number(imgMatch[1]);
    const rleBytes = bytes.slice(streamStart, streamStart + streamLen);
    const decodedRgb = Array.from(decodePdfRle(rleBytes));
    expect(decodedRgb).toEqual([30, 41, 59, 255, 255, 255]);
  });

  it("decodes larger multi-row RGBA PNGs (dynamic Huffman) cleanly and keeps PDF size compact", () => {
    const w = 120;
    const h = 40;
    const rows = Array.from({ length: h }, (_, y) => {
      const row = new Uint8Array(w * 4);
      for (let x = 0; x < w; x++) {
        const onStroke = (x + y * 2) % 17 === 0 || (x > 20 && x < 100 && y === 20);
        row[x * 4] = onStroke ? 30 : 0;
        row[x * 4 + 1] = onStroke ? 41 : 0;
        row[x * 4 + 2] = onStroke ? 59 : 0;
        row[x * 4 + 3] = onStroke ? 255 : 0;
      }
      return row;
    });
    const sigUrl = buildTestRgbaPngDataUrl(w, h, rows);
    const data = createDefaultTemplateData("reimbursement", {
      user: { ...user, signature: sigUrl },
      receipts,
      purpose: "Dynamic Huffman signature check",
    });

    const bytes = generateSbsiReportPdfBytes(data);
    const latin1 = new TextDecoder("latin1").decode(bytes);
    expect(latin1).toContain("/Width 120 /Height 40");
    expect(bytes.length).toBeLessThan(50_000);
  });

  it("gracefully skips malformed signature data URLs during PDF generation without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const data = createDefaultTemplateData("cash-advance", {
      purpose: "Travel",
      totalAmount: 500,
    });
    data.signatorySignature = "data:image/png;base64,bm90LWEtdmFsaWQtcG5n";

    const text = pdfText(data);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
    expect(text).not.toContain("/Subtype /Image");
    warnSpy.mockRestore();
  });

  it("preserves signatorySignature across Expand Editor toggle and keeps signature pad active", async () => {
    const savedSig = "data:image/png;base64,savedProfileSignatureData";
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.user = { ...user, signature: savedSig };

    const wrapper = mountEditor(
      {
        type: "reimbursement",
        receipts,
        user: auth.user,
      },
      { attachTo: document.body }
    );

    await nextTick();
    await wrapper.find('[data-testid="expand-editor"]').trigger("click");
    await nextTick();

    const expandedEl = document.body.querySelector('[data-testid="document-wrapper"]');
    expect(expandedEl).not.toBeNull();
    const pad = wrapper.findComponent({ name: "BaseSignaturePad" });
    expect(pad.exists()).toBe(true);
    expect(pad.props("modelValue")).toBe(savedSig);

    pad.vm.$emit("update:modelValue", "data:image/png;base64,drawnInExpanded");
    await nextTick();
    expect(wrapper.emitted("update:modelValue").at(-1)[0].signatorySignature).toBe(
      "data:image/png;base64,drawnInExpanded"
    );

    document.body.querySelector('[data-testid="collapse-editor"]')?.click();
    await nextTick();
    expect(pad.props("modelValue")).toBe("data:image/png;base64,drawnInExpanded");
    wrapper.unmount();
  });

  it("gracefully skips indexed colorType 3 PNG missing a PLTE chunk without crashing", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr[8] = 8;
    ihdr[9] = 3; // indexed color without PLTE chunk
    const idat = deflateSync(Buffer.from([0, 0, 1]));

    const makeChunk = (type, data) => {
      let c = 0xffffffff;
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      for (let i = 0; i < body.length; i++) {
        c ^= body[i];
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      const out = Buffer.alloc(12 + data.length);
      out.writeUInt32BE(data.length, 0);
      body.copy(out, 4);
      out.writeUInt32BE((c ^ 0xffffffff) >>> 0, 8 + data.length);
      return out;
    };

    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk("IHDR", ihdr),
      makeChunk("IDAT", idat),
      makeChunk("IEND", Buffer.alloc(0)),
    ]);

    const data = createDefaultTemplateData("cash-advance", {
      purpose: "Missing PLTE",
      totalAmount: 100,
    });
    data.signatorySignature = `data:image/png;base64,${png.toString("base64")}`;

    const text = pdfText(data);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.endsWith("%%EOF")).toBe(true);
    expect(text).not.toContain("/Subtype /Image");
    warnSpy.mockRestore();
  });

  it("allows editing amounts, adding custom rows, removing rows, and resetting from receipts in reimbursement", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts, totalAmount: 1250 });
    await nextTick();

    // Amounts and Add/Remove controls are editable for reimbursement
    const amount0 = wrapper.find('[data-testid="breakdown-amount-0"]');
    expect(amount0.exists()).toBe(true);
    await amount0.setValue(400);
    await nextTick();
    expect(wrapper.emitted("update:modelValue").at(-1)[0].totalAmount).toBe(1400);
    expect(wrapper.emitted("update:totalAmount")).toBeUndefined();

    // Mismatch warning appears because 1400 !== 1250
    expect(wrapper.find('[data-testid="breakdown-mismatch-warning"]').exists()).toBe(true);

    // Add custom row
    await wrapper.find('[data-testid="breakdown-add"]').trigger("click");
    await nextTick();
    await wrapper.find('[data-testid="breakdown-description-2"]').setValue("Parking");
    await wrapper.find('[data-testid="breakdown-amount-2"]').setValue(100);
    await nextTick();
    expect(wrapper.emitted("update:modelValue").at(-1)[0].totalAmount).toBe(1500);

    // Remove receipt-linked row 1 (Grab); stays removed when a new receipt is added
    await wrapper.find('[data-testid="breakdown-remove-1"]').trigger("click");
    await nextTick();
    expect(wrapper.emitted("update:modelValue").at(-1)[0].breakdownItems).toHaveLength(2);
    expect(wrapper.emitted("update:modelValue").at(-1)[0].totalAmount).toBe(500);

    await wrapper.setProps({
      receipts: [...receipts, { id: 3, category: "Supplies", vendor_name: "NBS", total_amount: 50 }],
      totalAmount: 1300,
    });
    await nextTick();
    const descriptionsAfterAdd = wrapper
      .findAll('[data-testid^="breakdown-description-"]')
      .map((el) => el.element.value);
    expect(descriptionsAfterAdd.some((d) => d.includes("Grab"))).toBe(false);
    expect(descriptionsAfterAdd.some((d) => d.includes("NBS"))).toBe(true);
    expect(descriptionsAfterAdd).toContain("Parking");

    // Reset from receipts restores 1-to-1 sync and clears mismatch warning
    await wrapper.find('[data-testid="breakdown-reset"]').trigger("click");
    await nextTick();
    const resetItems = wrapper.emitted("update:modelValue").at(-1)[0].breakdownItems;
    expect(resetItems).toHaveLength(3);
    expect(wrapper.emitted("update:modelValue").at(-1)[0].totalAmount).toBe(1300);
    expect(wrapper.find('[data-testid="breakdown-mismatch-warning"]').exists()).toBe(false);
  });

  it("removes linked row when a receipt is removed and enforces minimum 1 row in reimbursement and liquidation", async () => {
    const wrapper = mountEditor({ type: "reimbursement", receipts, totalAmount: 1250 });
    await nextTick();

    // Add custom row, then remove receipt 2 from props.receipts
    await wrapper.find('[data-testid="breakdown-add"]').trigger("click");
    await wrapper.find('[data-testid="breakdown-description-2"]').setValue("Extra");
    await wrapper.find('[data-testid="breakdown-amount-2"]').setValue(50);
    await wrapper.setProps({ receipts: [receipts[0]], totalAmount: 250 });
    await nextTick();

    const items = wrapper.emitted("update:modelValue").at(-1)[0].breakdownItems;
    expect(items.map((i) => i.amount)).toEqual([250, 50]);

    // Removing down to 1 row hides the remove button on the last row
    await wrapper.find('[data-testid="breakdown-remove-1"]').trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="breakdown-remove-0"]').exists()).toBe(false);

    // Liquidation also supports editing amounts, adding/removing rows, and resetting
    const liqWrapper = mountEditor({ type: "liquidation", receipts, allocatedAmount: 2000, utilizedAmount: 1250 });
    await nextTick();
    await liqWrapper.find('[data-testid="breakdown-amount-0"]').setValue(500);
    await nextTick();
    expect(liqWrapper.emitted("update:modelValue").at(-1)[0].utilizedAmount).toBe(1500);
    expect(liqWrapper.emitted("update:modelValue").at(-1)[0].variance).toBe(500);
    expect(liqWrapper.find('[data-testid="breakdown-mismatch-warning"]').exists()).toBe(true);
    expect(liqWrapper.find('[data-testid="breakdown-add"]').exists()).toBe(true);
    expect(liqWrapper.find('[data-testid="breakdown-reset"]').exists()).toBe(true);
  });
});

