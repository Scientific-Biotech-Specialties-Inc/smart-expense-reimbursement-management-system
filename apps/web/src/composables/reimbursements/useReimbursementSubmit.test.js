// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReimbursementSubmit } from "./useReimbursementSubmit";
import { createDefaultTemplateData } from "@/utils/sbsiReportTemplateUtils";
import * as pdfGen from "@/utils/sbsiPdfGenerator";

const submitMock = vi.fn().mockResolvedValue({ id: 1 });
const updateRequestMock = vi.fn().mockResolvedValue({ id: 1 });
const addToastMock = vi.fn();

vi.mock("@/stores/reimbursement", () => ({
  useReimbursementStore: () => ({
    submit: submitMock,
    updateRequest: updateRequestMock,
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: addToastMock,
  }),
}));

describe("useReimbursementSubmit — userComment handling", () => {
  const emit = vi.fn();
  const router = { push: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validReceipt = {
    id: 10,
    fileName: "receipt.png",
    merchantName: "Vendor Inc",
    categoryId: 2,
    eventType: "Client Meeting",
    date: "2026-10-01",
    amount: 250,
    tax: 30,
    items: [],
  };

  it("appends user_comment when submitting a reimbursement with a comment", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);

    const reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const success = await submitReimbursement({
      receipts: [validReceipt],
      reportFile,
      totalAmount: 250,
      userComment: "Optional note for finance.",
    });

    expect(success).toBe(true);
    expect(submitMock).toHaveBeenCalledTimes(1);

    const sentFormData = submitMock.mock.calls[0][0];
    expect(sentFormData.get("user_comment")).toBe("Optional note for finance.");
    expect(sentFormData.get("description")).toBe("Vendor Inc");
    expect(sentFormData.get("cutoff_period")).toBeNull();
  });

  it("omits user_comment or does not append when userComment is not provided", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);

    const reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const success = await submitReimbursement({
      receipts: [validReceipt],
      reportFile,
      totalAmount: 250,
    });

    expect(success).toBe(true);
    expect(submitMock).toHaveBeenCalledTimes(1);

    const sentFormData = submitMock.mock.calls[0][0];
    expect(sentFormData.get("user_comment")).toBeNull();
  });

  it("appends user_comment when updating a reimbursement", async () => {
    const { updateReimbursement } = useReimbursementSubmit(emit, router);

    const success = await updateReimbursement(1, {
      receipts: [validReceipt],
      reportFile: null,
      totalAmount: 250,
      userComment: "Updated rationale.",
    });

    expect(success).toBe(true);
    expect(updateRequestMock).toHaveBeenCalledTimes(1);

    const sentFormData = updateRequestMock.mock.calls[0][1];
    expect(sentFormData.get("user_comment")).toBe("Updated rationale.");
  });

  it("blocks submission and shows error toast when any receipt is missing eventType", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);
    const receiptWithoutEventType = { ...validReceipt, eventType: "" };

    const reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const success = await submitReimbursement({
      receipts: [receiptWithoutEventType],
      reportFile,
      totalAmount: 250,
    });

    expect(success).toBe(false);
    expect(submitMock).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Type of event is required for every receipt.",
        type: "error",
      }),
    );
  });

  it("appends event_type to form data for request and receipts when submitting", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);
    const receiptWithEvent = { ...validReceipt, eventType: "Client Meeting" };

    const reportFile = new File(["dummy"], "report.pdf", { type: "application/pdf" });
    const success = await submitReimbursement({
      receipts: [receiptWithEvent],
      reportFile,
      totalAmount: 250,
    });

    expect(success).toBe(true);
    expect(submitMock).toHaveBeenCalledTimes(1);
    const sentFormData = submitMock.mock.calls[0][0];
    expect(sentFormData.get("event_type")).toBe("Client Meeting");
    expect(sentFormData.get("receipts[0][event_type]")).toBe("Client Meeting");
  });

  it("generates PDF file and appends report_template_data in template mode without manual reportFile", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);
    const tpl = createDefaultTemplateData("reimbursement", {
      user: { name: "Juan Dela Cruz", position: "Field Engineer", department: "Ops" },
      receipts: [validReceipt],
      purpose: "Client visit",
    });

    const success = await submitReimbursement({
      receipts: [validReceipt],
      reportFile: null,
      reportTemplateData: tpl,
      totalAmount: 250,
    });

    expect(success).toBe(true);
    expect(submitMock).toHaveBeenCalledTimes(1);
    const sentFormData = submitMock.mock.calls[0][0];
    const uploadedFile = sentFormData.get("report_file");
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.type).toBe("application/pdf");
    expect(JSON.parse(sentFormData.get("report_template_data"))).toMatchObject({
      type: "reimbursement",
      purpose: "Client visit",
    });
  });

  it("blocks template submission and surfaces error toast when template data is invalid", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);
    const invalidTpl = createDefaultTemplateData("reimbursement", {
      receipts: [validReceipt],
    });
    invalidTpl.purpose = "";

    const success = await submitReimbursement({
      receipts: [validReceipt],
      reportFile: null,
      reportTemplateData: invalidTpl,
      totalAmount: 250,
    });

    expect(success).toBe(false);
    expect(submitMock).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("catches PDF generation failure cleanly and surfaces error toast", async () => {
    const spy = vi.spyOn(pdfGen, "createSbsiReportPdfFile").mockImplementationOnce(() => {
      throw new Error("PDF boom");
    });
    const { submitReimbursement } = useReimbursementSubmit(emit, router);
    const tpl = createDefaultTemplateData("reimbursement", {
      user: { name: "Juan Dela Cruz" },
      receipts: [validReceipt],
      purpose: "Client visit",
    });

    const success = await submitReimbursement({
      receipts: [validReceipt],
      reportFile: null,
      reportTemplateData: tpl,
      totalAmount: 250,
    });

    expect(success).toBe(false);
    expect(submitMock).not.toHaveBeenCalled();
    expect(addToastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Failed to generate the report PDF. Please review the report template and try again.",
        type: "error",
      }),
    );
    spy.mockRestore();
  });

  it("appends generated PDF and report_template_data when updating in template mode", async () => {
    const { updateReimbursement } = useReimbursementSubmit(emit, router);
    const tpl = createDefaultTemplateData("reimbursement", {
      user: { name: "Juan Dela Cruz" },
      receipts: [validReceipt],
      purpose: "Revised visit",
      recordId: 7,
    });

    const success = await updateReimbursement(7, {
      receipts: [validReceipt],
      reportFile: null,
      reportTemplateData: tpl,
      totalAmount: 250,
    });

    expect(success).toBe(true);
    expect(updateRequestMock).toHaveBeenCalledTimes(1);
    const sentFormData = updateRequestMock.mock.calls[0][1];
    expect(sentFormData.get("report_file")).toBeInstanceOf(File);
    expect(JSON.parse(sentFormData.get("report_template_data"))).toMatchObject({
      purpose: "Revised visit",
    });
  });

  it("appends manual reportFile and manual mode marker when reportTemplateData.mode === 'manual'", async () => {
    const { submitReimbursement } = useReimbursementSubmit(emit, router);
    const manualFile = new File(["pdf"], "manual.pdf", { type: "application/pdf" });

    const success = await submitReimbursement({
      receipts: [validReceipt],
      reportFile: manualFile,
      reportTemplateData: { mode: "manual" },
      totalAmount: 250,
    });

    expect(success).toBe(true);
    const sentFormData = submitMock.mock.calls[0][0];
    expect(sentFormData.get("report_file")).toBe(manualFile);
    expect(JSON.parse(sentFormData.get("report_template_data"))).toEqual({ mode: "manual" });
  });
});
