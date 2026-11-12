// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceDetailsModal from "./CashAdvanceDetailsModal.vue";
import { useCashAdvanceStore } from "@/stores/cashAdvance";

const mockExportReport = vi.fn(() => Promise.resolve(true));
vi.mock("@/composables/useReportExport", () => ({
  useReportExport: () => ({
    isExporting: ref(false),
    exportReport: mockExportReport,
  }),
}));

const mockAuth = {
  isAdmin: true,
  user: { id: 99, name: "Admin User" },
};
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => mockAuth,
}));

describe("CashAdvanceDetailsModal — Export Report (G2-056, G2-059)", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders Export Report button beside Disburse in Admin view without triggering Disburse (G2-059)", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 15,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Field Calibration",
          amount: 5000,
          balance: 5000,
          date: "2026-10-01",
          dueDate: "2026-10-10",
          status: "approved",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-cash-advance-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    expect(exportBtn.text()).toContain("Export Report");

    await exportBtn.trigger("click");
    expect(mockExportReport).toHaveBeenCalledWith("cash-advance", 15);
  });

  it("renders Export Report button in Employee Cash Advance view modal for any status (G2-056)", async () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 21,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Reagent Delivery",
          amount: 3200,
          balance: 3200,
          date: "2026-10-05",
          dueDate: "2026-10-12",
          status: "pending",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const exportBtn = wrapper.find('[data-testid="export-cash-advance-report-btn"]');
    expect(exportBtn.exists()).toBe(true);
    await exportBtn.trigger("click");
    expect(mockExportReport).toHaveBeenCalledWith("cash-advance", 21);
  });

  it("passes layout='horizontal' to UnifiedRoadmapStepper when overpayment exists (Admin)", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 15,
          userId: 10,
          amount: 5000,
          balance: 5000,
          overpayment_amount: 1500,
          status: "settled",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: {
            name: "UnifiedRoadmapStepper",
            props: ["layout", "overpaymentAmount"],
            template: "<div data-testid='stepper' :data-layout='layout'></div>",
          },
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const stepper = wrapper.find('[data-testid="stepper"]');
    expect(stepper.attributes("data-layout")).toBe("horizontal");
  });

  it("passes layout='horizontal' to UnifiedRoadmapStepper when overpayment exists (Employee)", async () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 21,
          userId: 99,
          amount: 3200,
          balance: 3200,
          overpayment_amount: 800,
          status: "settled",
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: {
            name: "UnifiedRoadmapStepper",
            props: ["layout", "overpaymentAmount"],
            template: "<div data-testid='stepper' :data-layout='layout'></div>",
          },
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    const stepper = wrapper.find('[data-testid="stepper"]');
    expect(stepper.attributes("data-layout")).toBe("horizontal");
  });

  it("renders BaseAuditTrail in Admin view", () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 30,
          userId: 12,
          amount: 2000,
          balance: 2000,
          status: "pending",
          audit_trail: [
            {
              id: "ca-log-1",
              action_type: "CASH_ADVANCE_SUBMITTED",
              label: "Submitted",
              actor_name: "Carlo Gomez",
              created_at: "2026-10-22T08:00:00Z",
            },
          ],
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail (1)");
    expect(wrapper.text()).toContain("Carlo Gomez");
  });

  it("renders BaseAuditTrail in Employee view", () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 31,
          userId: 99,
          amount: 2500,
          balance: 2500,
          status: "pending",
          audit_trail: [
            {
              id: "ca-log-2",
              action_type: "CASH_ADVANCE_SUBMITTED",
              label: "Submitted",
              actor_name: "Elena Cruz",
              created_at: "2026-10-22T09:00:00Z",
            },
          ],
        },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          BaseModal: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Audit Trail (1)");
    expect(wrapper.text()).toContain("Elena Cruz");
  });

  describe("Modal Button Sizing Guardrails", () => {
    it("sizes admin action buttons intrinsically without flex-1 or fixed max-w", () => {
      mockAuth.isAdmin = true;
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 40,
            userId: 10,
            requestedBy: "Pedro Cruz",
            amount: 3000,
            balance: 3000,
            status: "pending",
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const approveBtn = wrapper.findAll("button").find((b) => b.text().includes("Approve"));
      expect(approveBtn).toBeDefined();
      expect(approveBtn.classes()).not.toContain("flex-1");
      expect(approveBtn.classes()).not.toContain("sm:max-w-[200px]");
      expect(approveBtn.classes()).toContain("px-5");

      const selectWrapper = wrapper.find("select").element.parentElement;
      expect(selectWrapper.classList.contains("flex-1")).toBe(false);
      expect(selectWrapper.classList.contains("sm:max-w-[200px]")).toBe(false);
    });

    it("sizes disburse button intrinsically without flex-1 or fixed max-w", () => {
      mockAuth.isAdmin = true;
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 41,
            userId: 10,
            requestedBy: "Pedro Cruz",
            amount: 3000,
            balance: 3000,
            status: "approved",
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const disburseBtn = wrapper.findAll("button").find((b) => b.text().includes("Disburse"));
      expect(disburseBtn).toBeDefined();
      expect(disburseBtn.classes()).not.toContain("flex-1");
      expect(disburseBtn.classes()).not.toContain("sm:max-w-[220px]");
      expect(disburseBtn.classes()).toContain("px-5");
    });
  });

  describe("Document Attachment & Download", () => {
    it("renders document attachment link with truncate classes and title tooltip in Admin view", () => {
      mockAuth.isAdmin = true;
      const longName = "very_long_cash_advance_document_travel_form_2026_q4_operations.pdf";
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 50,
            userId: 10,
            amount: 5000,
            balance: 5000,
            status: "pending",
            documentFileName: longName,
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const docLink = wrapper.find('a[role="button"]');
      expect(docLink.exists()).toBe(true);
      expect(docLink.attributes("title")).toBe(longName);
      expect(docLink.classes()).toContain("max-w-full");

      const span = docLink.find("span");
      expect(span.text()).toBe(longName);
      expect(span.classes()).toContain("truncate");
    });

    it("renders document attachment link with truncate classes in Employee view", () => {
      mockAuth.isAdmin = false;
      const fileName = "employee_itinerary_receipt.pdf";
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 51,
            userId: 99,
            amount: 3000,
            balance: 3000,
            status: "pending",
            documentFileName: fileName,
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const docLink = wrapper.find('a[role="button"]');
      expect(docLink.exists()).toBe(true);
      expect(docLink.attributes("title")).toBe(fileName);

      const span = docLink.find("span");
      expect(span.text()).toBe(fileName);
      expect(span.classes()).toContain("truncate");
    });

    it("preserves document filename without hiding it when clicking download", async () => {
      mockAuth.isAdmin = true;
      const store = useCashAdvanceStore();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      // Simulate API returning document where file_name is missing or structured differently
      store.fetchDocument = vi.fn().mockResolvedValue({
        id: 1,
        file_path: "documents/cash_advances/advance_52.pdf",
        file_url: "https://example.com/advance_52.pdf",
      });

      const initialName = "initial_receipt_name.pdf";
      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 52,
            userId: 10,
            amount: 4000,
            balance: 4000,
            status: "pending",
            documentFileName: initialName,
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const docLink = wrapper.find('a[role="button"]');
      expect(docLink.text()).toContain(initialName);

      await docLink.trigger("click");

      expect(store.fetchDocument).toHaveBeenCalledWith(52);
      expect(clickSpy).toHaveBeenCalled();

      // Ensure the filename was NOT hidden or blanked out
      expect(docLink.text()).toContain(initialName);
      expect(docLink.find("span").text()).toBe(initialName);

      clickSpy.mockRestore();
    });

    it("updates document filename when fetched document has a distinct file_name", async () => {
      mockAuth.isAdmin = true;
      const store = useCashAdvanceStore();
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

      const updatedName = "official_signed_permit.pdf";
      store.fetchDocument = vi.fn().mockResolvedValue({
        id: 2,
        file_name: updatedName,
        file_path: "documents/cash_advances/permit.pdf",
        file_url: "https://example.com/permit.pdf",
      });

      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 53,
            userId: 10,
            amount: 4000,
            balance: 4000,
            status: "pending",
            documentFileName: "generic_request.pdf",
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
          },
        },
      });

      const docLink = wrapper.find('a[role="button"]');
      await docLink.trigger("click");

      expect(docLink.find("span").text()).toBe(updatedName);
      expect(docLink.attributes("title")).toBe(updatedName);

      clickSpy.mockRestore();
    });
  });

  describe("CashAdvanceDetailsModal — Signature & Acknowledgement", () => {
    it("renders BaseSignaturePad and pre-fills from auth.user.signature when acknowledging disbursed advance", async () => {
      mockAuth.isAdmin = false;
      mockAuth.user = {
        id: 10,
        name: "Test Employee",
        signature: "data:image/png;base64,empSavedSig",
      };

      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 88,
            userId: 10,
            amount: 5000,
            balance: 5000,
            status: "disbursed",
            acknowledgedAt: null,
            signatureImage: null,
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
            BaseAuditTrail: true,
          },
        },
      });

      const sigPad = wrapper.findComponent({ name: "BaseSignaturePad" });
      expect(sigPad.exists()).toBe(true);

      const acknowledgeBtn = wrapper.findAll("button").find((b) => b.text().includes("I acknowledge"));
      expect(acknowledgeBtn).toBeTruthy();
      expect(acknowledgeBtn.attributes("disabled")).toBeUndefined();
    });

    it("renders verified signature preview when viewing an already signed cash advance in Employee view", () => {
      mockAuth.isAdmin = false;
      mockAuth.user = {
        id: 10,
        name: "Test Employee",
      };

      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 12,
            userId: 10,
            amount: 5500,
            balance: 5500,
            status: "signed",
            acknowledgedAt: "2026-11-10T08:00:00Z",
            signatureImage: "data:image/png;base64,signedSigImage",
          },
        },
        global: {
          stubs: {
            UnifiedRoadmapStepper: true,
            StatusBadge: true,
            DecisionConfirmationModal: true,
            BaseModal: true,
            BaseAuditTrail: true,
          },
        },
      });

      expect(wrapper.text()).toContain("Signature");
      expect(wrapper.text()).toContain("Verified");
      const img = wrapper.find('img[alt="Signature"]');
      expect(img.exists()).toBe(true);
      expect(img.attributes("src")).toBe("data:image/png;base64,signedSigImage");
      expect(wrapper.findComponent({ name: "BaseSignaturePad" }).exists()).toBe(false);
    });
  });
});
