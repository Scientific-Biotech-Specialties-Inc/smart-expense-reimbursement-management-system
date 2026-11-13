// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import SbsiReportDocumentEditor from "../SbsiReportDocumentEditor.vue";
import {
  DEFAULT_SBSI_RECIPIENT,
  buildTemplateParagraphs,
  createDefaultTemplateData,
  formatMediumDate,
  formatPhp,
  generateSystemRefId,
  syncTemplateWithContext,
  validateTemplateData,
} from "@/utils/sbsiReportTemplateUtils";
import { generateSbsiReportPdfBytes, createSbsiReportPdfFile } from "@/utils/sbsiPdfGenerator";

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
});

