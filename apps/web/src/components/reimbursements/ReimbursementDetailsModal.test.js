// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ReimbursementDetailsModal from "./ReimbursementDetailsModal.vue";
import SbsiReportPreviewModal from "@/components/base/SbsiReportPreviewModal.vue";
import * as pdfGen from "@/utils/sbsiPdfGenerator";

const authState = {
  isAdmin: true,
  user: { id: "admin-1", name: "Admin User" },
};

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => authState,
}));

describe("ReimbursementDetailsModal — Notes & Explanation Section", () => {
  it("displays the custom user comment on admin side when present", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 1,
          status: "pending",
          description: "Client Lunch",
          user_comment: "Lunch meeting with clients from Acme Corp.",
          user: { name: "John Doe" },
          amount: 1500,
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const notesSection = wrapper.find('[data-testid="modal-notes-section"]');
    expect(notesSection.exists()).toBe(true);
    expect(notesSection.text()).toContain("User Comment");
    expect(notesSection.text()).toContain("Lunch meeting with clients from Acme Corp.");
  });

  it("displays Reviewer / Admin Note when admin_notes or rejection_comment is present", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 12,
          status: "revise",
          description: "Site visit",
          user_comment: null,
          rejection_comment: "Attach clearer VAT TIN photo.",
          user: { name: "Jane Smith" },
          amount: 950,
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const notesSection = wrapper.find('[data-testid="modal-notes-section"]');
    expect(notesSection.exists()).toBe(true);
    expect(notesSection.text()).toContain("Attach clearer VAT TIN photo.");
  });

  it("displays 'No notes provided' fallback when neither user_comment nor reviewer note is present", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 2,
          status: "pending",
          description: "Office Supplies",
          user_comment: null,
          admin_notes: null,
          rejection_comment: null,
          user: { name: "Jane Smith" },
          amount: 500,
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const notesSection = wrapper.find('[data-testid="modal-notes-section"]');
    expect(notesSection.exists()).toBe(true);
    expect(notesSection.text()).toContain("No notes provided");
  });

  it("renders Export Report button beside Receipts header in default Receipts tab (G2-055, G2-058)", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 42,
          status: "approved",
          description: "Client Dinner",
          user_comment: "Team dinner",
          user: { name: "John Doe" },
          amount: 2400,
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-reimbursement-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");
    expect(wrapper.text()).toContain("No receipts attached.");
  });
});

describe("ReimbursementDetailsModal — Unified Vertical Layout, Tabs & Summary", () => {
  it("enforces vertical order: Alert Banner -> Roadmap -> BaseModalTabs -> Notes -> Summary", () => {
    authState.isAdmin = false;
    authState.user = { id: 10, name: "Employee User" };

    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 77,
          status: "revise",
          user_id: 10,
          user: { id: 10, name: "Employee User" },
          amount: 3200,
          admin_notes: "Please attach itemized OR.",
          vendor_audit_required: true,
          unverified_vendors: ["Corner Store"],
          receipts: [],
          audit_trail: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const html = wrapper.html();
    const bannerIdx = html.indexOf("Needs Revision");
    const auditBannerIdx = html.indexOf("[Unverified Vendor — Secondary Accounting Audit Required]");
    const roadmapIdx = html.indexOf('aria-label="Reimbursement Timeline"');
    const tabsIdx = html.indexOf('data-testid="modal-tab-receipts"');
    const notesIdx = html.indexOf('data-testid="modal-notes-section"');
    const summaryIdx = html.indexOf('data-testid="modal-summary-section"');

    expect(bannerIdx).toBeGreaterThan(-1);
    expect(auditBannerIdx).toBeGreaterThan(-1);
    expect(roadmapIdx).toBeGreaterThan(bannerIdx);
    expect(roadmapIdx).toBeGreaterThan(auditBannerIdx);
    expect(tabsIdx).toBeGreaterThan(roadmapIdx);
    expect(notesIdx).toBeGreaterThan(tabsIdx);
    expect(summaryIdx).toBeGreaterThan(notesIdx);
  });

  it("switches between Receipts, Report Attachment, and Audit Trail tabs and resets to Receipts when viewingRecord changes", async () => {
    authState.isAdmin = true;
    authState.user = { id: "admin-1", name: "Admin User" };

    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 88,
          status: "pending",
          user: { name: "Alex Cruz" },
          amount: 1200,
          receipts: [
            {
              id: "r-1",
              vendor_name: "Jollibee",
              invoice_number: "INV-001",
              total_amount: 1200,
              currency: "PHP",
              status: "verified",
            },
          ],
          audit_trail: [
            {
              id: "t-1",
              action_type: "CLAIM_SUBMITTED",
              label: "Claim Submitted via Portal",
              actor_name: "Alex Cruz",
              created_at: "2026-10-20T08:00:00Z",
            },
          ],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const receiptsTab = wrapper.find('[data-testid="modal-tab-receipts"]');
    const reportTab = wrapper.find('[data-testid="modal-tab-report"]');
    const auditTab = wrapper.find('[data-testid="modal-tab-audit"]');

    expect(receiptsTab.exists()).toBe(true);
    expect(receiptsTab.text()).toContain("Receipts");
    expect(receiptsTab.text()).toContain("1");
    expect(reportTab.text()).toContain("Report Attachment");
    expect(auditTab.text()).toContain("Audit Trail");
    expect(auditTab.text()).toContain("1");

    // Default tab is receipts
    expect(wrapper.text()).toContain("Jollibee");
    expect(wrapper.text()).not.toContain("No report attachment uploaded.");
    expect(wrapper.text()).not.toContain("Claim Submitted via Portal");

    // Switch to report tab (empty state)
    await reportTab.trigger("click");
    expect(wrapper.text()).toContain("No report attachment uploaded.");
    expect(wrapper.find('[data-testid="modal-notes-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-summary-section"]').exists()).toBe(true);

    // Switch to audit tab
    await auditTab.trigger("click");
    expect(wrapper.text()).toContain("Claim Submitted via Portal");
    expect(wrapper.find('[data-testid="modal-notes-section"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-summary-section"]').exists()).toBe(true);

    // Changing viewingRecord resets activeTab back to 'receipts'
    await wrapper.setProps({
      viewingRecord: {
        id: 89,
        status: "pending",
        user: { name: "Bea Lim" },
        amount: 450,
        receipts: [],
        audit_trail: [],
      },
    });
    expect(receiptsTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.text()).toContain("No receipts attached.");
  });

  it("renders consolidated metadata and financial breakdown in Summary section with Medium Date format", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 90,
          status: "approved",
          user: { name: "Carlos Reyes" },
          event_type: "Client Presentation",
          contract_id: 501,
          client_name: "Globe Business",
          ticket_id: 77,
          ticket_number: "TKT-0077",
          approved_by: "Maria Santos",
          approved_at: "2026-10-20T09:15:00Z",
          amount: 4500,
          currency: "PHP",
          receipts: [{ id: 1, total_amount: 2000 }, { id: 2, total_amount: 2500 }],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const summary = wrapper.find('[data-testid="modal-summary-section"]');
    expect(summary.exists()).toBe(true);
    expect(summary.text()).toContain("Carlos Reyes");
    expect(summary.text()).toContain("Client Presentation");
    expect(summary.text()).toContain("Globe Business (Contract #501)");
    expect(summary.text()).toContain("Linked Support Ticket (TS)");
    expect(summary.text()).toContain("Ticket TKT-0077");
    expect(summary.text()).toContain("Maria Santos");
    expect(summary.text()).toContain("Oct 20, 2026");
    expect(summary.text()).toContain("Receipt Count");
    expect(summary.text()).toContain("2");
    expect(summary.text()).toContain("Total Claim Amount");
    expect(summary.text()).toContain("4,500.00");
  });
});

describe("ReimbursementDetailsModal — Edit & Resubmit button for revised reimbursements", () => {
  it("renders Edit & Resubmit button and Needs Revision banner when employee views revised reimbursement", async () => {
    authState.isAdmin = false;
    authState.user = { id: 10, name: "Employee User" };

    const record = {
      id: 99,
      status: "revise",
      user_id: 10,
      description: "Travel expenses",
      amount: 1200,
      admin_notes: "Please upload official receipts.",
      receipts: [],
    };

    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: record,
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Needs Revision");
    expect(wrapper.text()).toContain("Please upload official receipts.");
    const editBtn = wrapper.find('[data-testid="edit-resubmit-btn"]');
    expect(editBtn.exists()).toBe(true);
    expect(editBtn.text()).toContain("Edit & Resubmit");

    await editBtn.trigger("click");
    expect(wrapper.emitted("edit")).toBeTruthy();
    expect(wrapper.emitted("edit")[0][0]).toEqual(expect.objectContaining({ id: 99 }));
  });

  it("does not render Edit & Resubmit button when status is pending", () => {
    authState.isAdmin = false;
    authState.user = { id: 10, name: "Employee User" };

    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 100,
          status: "pending",
          user_id: 10,
          description: "Pending claim",
          amount: 500,
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    expect(wrapper.text()).not.toContain("Edit & Resubmit");
  });

  it("does not render Edit & Resubmit button when admin views someone else's revised claim", () => {
    authState.isAdmin = true;
    authState.user = { id: 1, name: "Admin User" };

    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 101,
          status: "revise",
          user_id: 10,
          description: "Employee claim",
          amount: 800,
          admin_notes: "Fix receipt",
          receipts: [],
        },
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    expect(wrapper.text()).not.toContain("Edit & Resubmit");
  });

  it("renders Edit & Resubmit button when admin views their OWN revised claim", async () => {
    authState.isAdmin = true;
    authState.user = { id: 1, name: "Admin User" };

    const record = {
      id: 102,
      status: "revise",
      user_id: 1,
      user: { id: 1, name: "Admin User" },
      description: "Admin's own claim",
      amount: 1500,
      admin_notes: "Please re-attach summary",
      receipts: [],
    };

    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: record,
        modalLoading: false,
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    const editBtn = wrapper.find('[data-testid="edit-resubmit-btn"]');
    expect(editBtn.exists()).toBe(true);
    expect(editBtn.text()).toContain("Edit & Resubmit");

    await editBtn.trigger("click");
    expect(wrapper.emitted("edit")).toBeTruthy();
    expect(wrapper.emitted("edit")[0][0]).toEqual(expect.objectContaining({ id: 102 }));
  });

  it("renders BaseAuditTrail section with audit events inside Audit Trail tab", async () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 5,
          status: "pending",
          description: "Office Supplies",
          user: { name: "Jane Doe" },
          amount: 500,
          receipts: [],
          audit_trail: [
            {
              id: "trail-1",
              action_type: "CLAIM_SUBMITTED",
              label: "Submitted for Finance Review",
              actor_name: "Jane Doe",
              created_at: "2026-10-20T08:00:00Z",
            },
          ],
        },
      },
      global: {
        stubs: {
          StatusBadge: true,
          BaseReceiptImage: true,
        },
      },
    });

    expect(wrapper.text()).not.toContain("Submitted for Finance Review");
    await wrapper.find('[data-testid="modal-tab-audit"]').trigger("click");
    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.text()).toContain("Jane Doe");
    expect(wrapper.text()).toContain("Submitted for Finance Review");
  });

  describe("Admin Modal Button Sizing Guardrails", () => {
    it("sizes Actions select and Approve Claim button intrinsically with sm:justify-end (no flex-1)", () => {
      authState.isAdmin = true;
      authState.user = { id: "admin-1", name: "Admin User" };

      const wrapper = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 201,
            status: "pending",
            user: { id: "user-2", name: "Employee" },
            amount: 1000,
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
          },
        },
      });

      const footer = wrapper.find("footer");
      expect(footer.exists()).toBe(true);
      expect(footer.classes()).toContain("sm:justify-end");

      const approveBtn = wrapper.findAll("button").find((b) => b.text().includes("Approve Claim"));
      expect(approveBtn).toBeDefined();
      expect(approveBtn.classes()).not.toContain("flex-1");
      expect(approveBtn.classes()).toContain("px-5");

      const selectWrapper = wrapper.find("select").element.parentElement;
      expect(selectWrapper.classList.contains("flex-1")).toBe(false);
    });

    it("sizes Grant Claim button intrinsically with sm:w-auto and px-5 in approved state", () => {
      authState.isAdmin = true;
      authState.user = { id: "admin-1", name: "Admin User" };

      const wrapper = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 202,
            status: "approved",
            user: { id: "user-2", name: "Employee" },
            amount: 2500,
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
          },
        },
      });

      const grantBtn = wrapper.findAll("button").find((b) => b.text().includes("Grant Claim"));
      expect(grantBtn).toBeDefined();
      expect(grantBtn.classes()).toContain("px-5");
      expect(grantBtn.classes()).toContain("sm:w-auto");
    });
  });

  describe("Report Preview & Template PDF Download (Report Attachment Tab)", () => {
    it("opens SbsiReportPreviewModal when Preview Report button is clicked in Report tab", async () => {
      const templateData = { type: "reimbursement", purpose: "Field work" };
      const wrapper = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 301,
            status: "pending",
            amount: 1250,
            report_url: "https://example.com/report.pdf",
            report_template_data: templateData,
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
            SbsiReportPreviewModal: true,
          },
        },
      });

      await wrapper.find('[data-testid="modal-tab-report"]').trigger("click");

      const previewBtn = wrapper.find('[data-testid="preview-report-btn"]');
      expect(previewBtn.exists()).toBe(true);
      expect(previewBtn.text()).toContain("Preview Report");

      const downloadLink = wrapper.find('a[href="https://example.com/report.pdf"]');
      expect(downloadLink.exists()).toBe(true);

      await previewBtn.trigger("click");
      const previewModal = wrapper.findComponent(SbsiReportPreviewModal);
      expect(previewModal.exists()).toBe(true);
      expect(previewModal.props("isOpen")).toBe(true);
      expect(previewModal.props("templateData")).toEqual(templateData);
      expect(previewModal.props("fallbackType")).toBe("reimbursement");
      expect(previewModal.props("fileUrl")).toBe("https://example.com/report.pdf");
    });

    it("allows downloading generated PDF directly when report_template_data exists without report_url", async () => {
      const downloadSpy = vi.spyOn(pdfGen, "downloadSbsiReportPdf").mockImplementation(() => {});
      const templateData = { type: "reimbursement", purpose: "Client visit" };
      const wrapper = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 302,
            status: "pending",
            amount: 500,
            report_url: null,
            report_template_data: templateData,
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
            SbsiReportPreviewModal: true,
          },
        },
      });

      await wrapper.find('[data-testid="modal-tab-report"]').trigger("click");

      const downloadBtn = wrapper.find('[data-testid="download-template-report-btn"]');
      expect(downloadBtn.exists()).toBe(true);
      await downloadBtn.trigger("click");
      expect(downloadSpy).toHaveBeenCalledWith(templateData, "SBSI-reimbursement-302.pdf");
      downloadSpy.mockRestore();
    });
  });

  describe("Fast-Track & Secondary Accounting Audit Badges", () => {
    it("displays [Fast-Track Eligible] badge when fast_track_eligible is true", () => {
      const wrapper = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 401,
            status: "pending",
            amount: 1500,
            fast_track_eligible: true,
            vendor_audit_required: false,
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
          },
        },
      });

      expect(wrapper.text()).toContain("[Fast-Track Eligible]");
    });

    it("displays Secondary Accounting Audit Required warning before audit confirmation and Completed card after", () => {
      const pendingAudit = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 402,
            status: "pending",
            amount: 2500,
            fast_track_eligible: false,
            vendor_audit_required: true,
            unverified_vendors: ["New Corner Hardware (TIN: 999-888-777-000)"],
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
          },
        },
      });

      expect(pendingAudit.text()).toContain("[Unverified Vendor — Secondary Accounting Audit Required]");
      expect(pendingAudit.text()).toContain("New Corner Hardware (TIN: 999-888-777-000)");

      const confirmedAudit = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 403,
            status: "approved",
            amount: 2500,
            vendor_audit_required: true,
            secondary_audit_confirmed_at: "2026-11-14T10:00:00Z",
            secondary_audit_by: "Maria Santos",
            secondary_audit_note: "Verified physical BIR receipt.",
            receipts: [],
          },
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
          },
        },
      });

      expect(confirmedAudit.text()).toContain("Secondary Accounting Audit Completed");
      expect(confirmedAudit.text()).toContain("Maria Santos");
      expect(confirmedAudit.text()).toContain("Verified physical BIR receipt.");
    });
  });

  describe("Ticketing System (TS) source tag & linked ticket metadata", () => {
    it("displays From TS tag, Ticket badge, and reference_no when source_system is ts or ticket_id is set", () => {
      const wrapper = mount(ReimbursementDetailsModal, {
        props: {
          viewingRecord: {
            id: 42,
            reference_no: "RMB-2026-00042",
            source_system: "ts",
            ticket_id: 77,
            ticket_number: "TKT-0077",
            status: "pending",
            amount: 1850,
            receipts: [],
          },
          modalLoading: false,
        },
        global: {
          stubs: {
            StatusBadge: true,
            BaseReceiptImage: true,
          },
        },
      });

      expect(wrapper.text()).toContain("RMB-2026-00042");
      expect(wrapper.text()).toContain("From TS");
      expect(wrapper.text()).toContain("Ticket TKT-0077");
      expect(wrapper.text()).toContain("Linked Support Ticket (TS)");
    });
  });
});
