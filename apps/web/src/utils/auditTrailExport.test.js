// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  generateCsv,
  generateXlsx,
  generateJson,
  generatePdf,
  exportAuditTrail,
} from "./auditTrailExport";

const sampleTrail = [
  {
    id: "log-1",
    created_at: "2026-10-20T08:00:00Z",
    actor_name: "Juan Dela Cruz",
    actor_role: "Employee",
    ip_address: "10.0.0.1",
    domain_label: "Reimbursement",
    label: "Submitted",
    action_type: "CLAIM_SUBMITTED",
    comment: 'Urgent "priority" reimbursement',
    changes: [],
  },
  {
    id: "log-2",
    created_at: "2026-10-21T09:30:00Z",
    actor_name: "Alex Reyes",
    actor_role: "Approver",
    ip_address: "192.168.1.100",
    domain_label: "Reimbursement",
    label: "Revised",
    action_type: "CLAIM_REVISED",
    comment: "Please update receipt, total is wrong.",
    changes: [
      { field: "Amount", before: "₱1,000.00", after: "₱1,200.00" },
    ],
  },
];

describe("auditTrailExport", () => {
  describe("generateCsv", () => {
    it("generates valid CSV with header and properly escaped fields", () => {
      const csv = generateCsv(sampleTrail);
      expect(csv).toContain("Time,User,Role,IP Address,Domain,Action,Comment,Changes");
      expect(csv).toContain('"Juan Dela Cruz"');
      expect(csv).toContain('Urgent ""priority"" reimbursement');
      expect(csv).toContain("10.0.0.1");
      expect(csv).toContain("Amount: ₱1,000.00 -> ₱1,200.00");
    });
  });

  describe("generateXlsx", () => {
    it("generates a valid binary XLSX file with PK zip magic header", () => {
      const u8 = generateXlsx(sampleTrail, { title: "Test Reimbursement" });
      expect(u8).toBeInstanceOf(Uint8Array);
      // PK zip magic bytes: 0x50, 0x4B, 0x03, 0x04
      expect(u8[0]).toBe(0x50);
      expect(u8[1]).toBe(0x4B);
    });
  });

  describe("generateJson", () => {
    it("generates formatted JSON matching the trail data", () => {
      const jsonStr = generateJson(sampleTrail);
      const parsed = JSON.parse(jsonStr);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].actor_name).toBe("Juan Dela Cruz");
    });
  });

  describe("generatePdf", () => {
    it("generates a valid binary PDF document", () => {
      const pdf = generatePdf(sampleTrail, { title: "Reimbursement #101" });
      expect(pdf.startsWith("%PDF-1.4")).toBe(true);
      expect(pdf.trim().endsWith("%%EOF")).toBe(true);
      expect(pdf).toContain("/Type /Catalog");
      expect(pdf).toContain("/Type /Pages");
      expect(pdf).toContain("/Helvetica");
    });
  });

  describe("exportAuditTrail", () => {
    let originalCreateElement;
    let clickedLink;

    beforeEach(() => {
      clickedLink = null;
      originalCreateElement = document.createElement.bind(document);

      vi.spyOn(document, "createElement").mockImplementation((tag) => {
        const el = originalCreateElement(tag);
        if (tag === "a") {
          clickedLink = el;
          el.click = vi.fn();
        }
        return el;
      });

      globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/test-blob");
      globalThis.URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("triggers CSV download with .csv filename", () => {
      exportAuditTrail(sampleTrail, "csv", { filename: "audit-test.csv" });
      expect(clickedLink).not.toBeNull();
      expect(clickedLink.download).toBe("audit-test.csv");
      expect(clickedLink.click).toHaveBeenCalled();
    });

    it("triggers XLSX download with default clean filename", () => {
      exportAuditTrail(sampleTrail, "xlsx", { entityTitle: "Cash-Advance-#9" });
      expect(clickedLink).not.toBeNull();
      expect(clickedLink.download).toMatch(/Audit-Log-Cash-Advance-9-.*\.xlsx/);
      expect(clickedLink.click).toHaveBeenCalled();
    });

    it("triggers PDF download with default filename", () => {
      exportAuditTrail(sampleTrail, "pdf");
      expect(clickedLink).not.toBeNull();
      expect(clickedLink.download).toMatch(/Audit-Log-.*\.pdf/);
      expect(clickedLink.click).toHaveBeenCalled();
    });

    it("triggers JSON download with default filename", () => {
      exportAuditTrail(sampleTrail, "json");
      expect(clickedLink).not.toBeNull();
      expect(clickedLink.download).toMatch(/Audit-Log-.*\.json/);
      expect(clickedLink.click).toHaveBeenCalled();
    });
  });
});
