// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useReportExport } from "./useReportExport";

const mockAddToast = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    addToast: mockAddToast,
  }),
}));

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("useReportExport composable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-pdf");
    global.URL.revokeObjectURL = vi.fn();
  });

  it("downloads the PDF report and uses the Content-Disposition filename", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const mockBlob = new Blob(["%PDF-1.4 mock"], { type: "application/pdf" });

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: (name) =>
          name.toLowerCase() === "content-disposition"
            ? 'attachment; filename="Reimbursement-Report-#5.pdf"'
            : null,
      },
      blob: () => Promise.resolve(mockBlob),
    });

    const { isExporting, exportReport } = useReportExport();
    expect(isExporting.value).toBe(false);

    const promise = exportReport("reimbursement", 5);
    expect(isExporting.value).toBe(true);

    const result = await promise;
    expect(result).toBe(true);
    expect(isExporting.value).toBe(false);
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/serms/reports/reimbursement/5",
      expect.objectContaining({
        headers: { Accept: "application/pdf" },
      }),
    );
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(mockAddToast).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });

  it("appends ?by=cash_advance when options.byCashAdvance is true", async () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => null },
      blob: () => Promise.resolve(new Blob(["%PDF-1.4"], { type: "application/pdf" })),
    });

    const { exportReport } = useReportExport();
    await exportReport("liquidation", 12, { byCashAdvance: true });

    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/serms/reports/liquidation/12?by=cash_advance",
      expect.any(Object),
    );
  });

  it("shows an error toast and resets isExporting when download fails", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: "Forbidden. You are not allowed to export this report." }),
    });

    const { isExporting, exportReport } = useReportExport();
    const result = await exportReport("reimbursement", 99);

    expect(result).toBe(false);
    expect(isExporting.value).toBe(false);
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Forbidden. You are not allowed to export this report.",
        type: "error",
      }),
    );
  });
});
