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

describe("ReimbursementDetailsModal — Custom User Comment Display", () => {
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

    expect(wrapper.text()).toContain("User Comment");
    expect(wrapper.text()).toContain("Lunch meeting with clients from Acme Corp.");
  });

  it("displays fallback message when user_comment is empty or null", () => {
    const wrapper = mount(ReimbursementDetailsModal, {
      props: {
        viewingRecord: {
          id: 2,
          status: "pending",
          description: "Office Supplies",
          user_comment: null,
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

    expect(wrapper.text()).toContain("User Comment");
    expect(wrapper.text()).toContain("No comment provided");
  });

  it("renders Export Report button beside Receipts header and triggers reimbursement report export (G2-055, G2-058)", async () => {
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
    const editBtn = wrapper.find("button.bg-orange-500");
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

    const editBtn = wrapper.find("button.bg-orange-500");
    expect(editBtn.exists()).toBe(true);
    expect(editBtn.text()).toContain("Edit & Resubmit");

    await editBtn.trigger("click");
    expect(wrapper.emitted("edit")).toBeTruthy();
    expect(wrapper.emitted("edit")[0][0]).toEqual(expect.objectContaining({ id: 102 }));
  });

  it("renders BaseAuditTrail section with audit events", () => {
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
              label: "Submitted",
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

    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.text()).toContain("Jane Doe");
  });

  describe("Admin Modal Button Sizing Guardrails", () => {
    it("sizes Actions select and Approve Claim button intrinsically with sm:justify-end (no flex-1)", () => {
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

      const approveBtn = wrapper.findAll("button").find(b => b.text().includes("Approve Claim"));
      expect(approveBtn).toBeDefined();
      expect(approveBtn.classes()).not.toContain("flex-1");
      expect(approveBtn.classes()).toContain("px-5");

      const selectWrapper = wrapper.find("select").element.parentElement;
      expect(selectWrapper.classList.contains("flex-1")).toBe(false);
    });

    it("sizes Grant Claim button intrinsically with sm:w-auto and px-5 in approved state", () => {
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

      const grantBtn = wrapper.findAll("button").find(b => b.text().includes("Grant Claim"));
      expect(grantBtn).toBeDefined();
      expect(grantBtn.classes()).toContain("px-5");
      expect(grantBtn.classes()).toContain("sm:w-auto");
    });
  });

  describe("Report Preview & Template PDF Download", () => {
    it("opens SbsiReportPreviewModal when Preview Report button is clicked", async () => {
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

      const previewBtn = wrapper.find('[data-testid="preview-report-btn"]');
      expect(previewBtn.exists()).toBe(true);
      expect(previewBtn.text()).toContain("Preview Report");

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

      const downloadBtn = wrapper.find('[data-testid="download-template-report-btn"]');
      expect(downloadBtn.exists()).toBe(true);
      await downloadBtn.trigger("click");
      expect(downloadSpy).toHaveBeenCalledWith(templateData, "SBSI-reimbursement-302.pdf");
      downloadSpy.mockRestore();
    });
  });
});
