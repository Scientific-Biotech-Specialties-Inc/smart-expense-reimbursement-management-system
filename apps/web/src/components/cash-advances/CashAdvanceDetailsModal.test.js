// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceDetailsModal from "./CashAdvanceDetailsModal.vue";
import DaysLeftBadge from "@/components/base/DaysLeftBadge.vue";
import GrantPayoutModal from "@/components/reimbursements/GrantPayoutModal.vue";
import DecisionConfirmationModal from "@/components/base/DecisionConfirmationModal.vue";
import { useCashAdvanceStore } from "@/stores/cashAdvance";
import { useToast } from "@/composables/useToast";

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

  it("renders BaseAuditTrail in Admin view", async () => {
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

    await wrapper.find('[data-testid="modal-tab-audit"]').trigger("click");
    expect(wrapper.text()).toContain("Audit Trail");
    expect(wrapper.text()).toContain("Carlo Gomez");
  });

  it("renders BaseAuditTrail in Employee view", async () => {
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

    await wrapper.find('[data-testid="modal-tab-audit"]').trigger("click");
    expect(wrapper.text()).toContain("Audit Trail");
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
      expect(sigPad.props("required")).toBe(true);

      const acknowledgeBtn = wrapper.findAll("button").find((b) => b.text().includes("I acknowledge"));
      expect(acknowledgeBtn).toBeTruthy();
      expect(acknowledgeBtn.attributes("disabled")).toBeUndefined();
    });

    it("renders verified signature preview when viewing an already signed cash advance in Employee view", async () => {
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

      await wrapper.find('[data-testid="modal-tab-signatures"]').trigger("click");
      expect(wrapper.text()).toContain("Signature");
      expect(wrapper.text()).toContain("Verified");
      const img = wrapper.find('img[alt="Signature"]');
      expect(img.exists()).toBe(true);
      expect(img.attributes("src")).toBe("data:image/png;base64,signedSigImage");
      expect(wrapper.findComponent({ name: "BaseSignaturePad" }).exists()).toBe(false);
    });
  });

  describe("SBSI Report Preview", () => {
    it("renders Preview Report button in both Admin and Employee views and opens SbsiReportPreviewModal", async () => {
      for (const isAdmin of [true, false]) {
        mockAuth.isAdmin = isAdmin;
        const wrapper = mount(CashAdvanceDetailsModal, {
          props: {
            isOpen: true,
            record: {
              id: 31,
              userId: 10,
              requestedBy: "Juan Dela Cruz",
              purpose: "Field Audit",
              amount: 4500,
              balance: 4500,
              date: "2026-10-10",
              dueDate: "2026-10-20",
              status: "pending",
              report_template_data: {
                type: "cash-advance",
                purpose: "Field Audit",
                totalAmount: 4500,
              },
              document: {
                file_name: "SBSI-cash-advance-31.pdf",
                file_path: "cash_advances/report-31.pdf",
              },
            },
          },
          global: {
            stubs: {
              UnifiedRoadmapStepper: true,
              StatusBadge: true,
              DecisionConfirmationModal: true,
              BaseModal: true,
              BaseAuditTrail: true,
              SbsiReportPreviewModal: true,
            },
          },
        });

        const previewBtn = wrapper.find('[data-testid="preview-cash-advance-report-btn"]');
        expect(previewBtn.exists()).toBe(true);
        expect(previewBtn.text()).toContain("Preview Report");

        await previewBtn.trigger("click");
        const modal = wrapper.findComponent({ name: "SbsiReportPreviewModal" });
        expect(modal.exists()).toBe(true);
        expect(modal.props("isOpen")).toBe(true);
        expect(modal.props("fallbackType")).toBe("cash-advance");
        expect(modal.props("templateData")).toMatchObject({
          type: "cash-advance",
          purpose: "Field Audit",
        });
      }
    });
  });
});

describe("CashAdvanceDetailsModal — GrantPayoutModal Disbursement Flow", () => {
  const { toasts } = useToast();

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockAuth.isAdmin = true;
    mockAuth.user = { id: 99, name: "Admin User" };
    toasts.value = [];
  });

  const approvedAdvance = {
    id: 61,
    userId: 10,
    requestedBy: "Juan Dela Cruz",
    purpose: "Regional Audit Travel",
    amount: 7500,
    balance: 7500,
    date: "2026-10-10",
    dueDate: "2026-10-25",
    approved_at: "2026-10-12T09:00:00Z",
    approved_by: "Approver Jane",
    status: "approved",
  };

  const mountWithStubs = (record = approvedAdvance) =>
    mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: true,
          DecisionConfirmationModal: true,
          GrantPayoutModal: true,
          BaseModal: true,
          BaseAuditTrail: true,
        },
      },
    });

  it("opens GrantPayoutModal with Cash Advance props instead of DecisionConfirmationModal when clicking Disburse", async () => {
    const wrapper = mountWithStubs();
    const disburseBtn = wrapper.findAll("button").find((b) => b.text().includes("Disburse"));
    expect(disburseBtn).toBeDefined();

    await disburseBtn.trigger("click");
    await nextTick();

    const grantModal = wrapper.findComponent(GrantPayoutModal);
    expect(grantModal.exists()).toBe(true);
    expect(grantModal.props("isOpen")).toBe(true);
    expect(grantModal.props("record")).toEqual(approvedAdvance);
    expect(grantModal.props("defaultGrantedBy")).toBe("Admin User");
    expect(grantModal.props("title")).toBe("Disburse Cash Advance");
    expect(grantModal.props("confirmTitle")).toBe("Confirm Cash Advance Handover");
    expect(grantModal.props("submitLabel")).toBe("Submit Disbursement");
    expect(grantModal.props("confirmLabel")).toBe("Confirm & Disburse");

    const decisionModal = wrapper.findComponent(DecisionConfirmationModal);
    expect(decisionModal.props("isOpen")).toBe(false);
  });

  it("blocks self-disbursement and shows error toast without opening GrantPayoutModal", () => {
    const ownAdvance = { ...approvedAdvance, userId: 99 };
    const wrapper = mountWithStubs(ownAdvance);

    expect(wrapper.text()).toContain("You cannot process your own request.");
    expect(wrapper.findAll("button").find((b) => b.text().includes("Disburse"))).toBeUndefined();

    wrapper.vm.$.setupState.requestConfirmation("disburse");
    expect(
      toasts.value.some((t) => t.type === "error" && t.message === "You cannot process your own request."),
    ).toBe(true);
    const grantModal = wrapper.findComponent(GrantPayoutModal);
    expect(grantModal.props("isOpen")).toBe(false);
  });

  it("completes full disbursement flow with unstubbed GrantPayoutModal and submits payload to store.disburseRequest", async () => {
    const store = useCashAdvanceStore();
    store.disburseRequest = vi.fn().mockResolvedValue({
      ...approvedAdvance,
      status: "disbursed",
    });

    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: approvedAdvance,
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

    const disburseBtn = wrapper.findAll("button").find((b) => b.text().includes("Disburse"));
    await disburseBtn.trigger("click");
    await nextTick();

    const text = wrapper.text();
    expect(text).toContain("Disburse Cash Advance");
    expect(text).toContain("Approver Jane");
    expect(text).toContain("Oct 10, 2026");
    expect(text).toContain("Oct 12, 2026");

    await wrapper.find("select#payout-method-select").setValue("E-wallet");
    await wrapper
      .findComponent({ name: "BaseSignaturePad" })
      .vm.$emit("update:modelValue", "data:image/png;base64,granterSig61");
    await nextTick();

    const submitPayoutBtn = wrapper.find('[data-testid="submit-payout-btn"]');
    expect(submitPayoutBtn.text()).toBe("Submit Disbursement");
    await submitPayoutBtn.trigger("click");
    await nextTick();

    expect(wrapper.text()).toContain("Confirm Cash Advance Handover");
    const passwordInput = wrapper.find('input[type="password"]');
    await passwordInput.setValue("secret123");

    const confirmBtn = wrapper.find('[data-testid="final-grant-proceed-btn"]');
    expect(confirmBtn.text()).toBe("Confirm & Disburse");
    await confirmBtn.trigger("click");
    await flushPromises();

    expect(store.disburseRequest).toHaveBeenCalledWith(61, {
      granted_by: "Admin User",
      payout_method: "E-wallet",
      payout_method_other: null,
      granter_signature: "data:image/png;base64,granterSig61",
      password: "secret123",
    });
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("submits payout payload via store.disburseRequest, shows success toast, closes modals on confirm", async () => {
    const store = useCashAdvanceStore();
    store.disburseRequest = vi.fn().mockResolvedValue({
      ...approvedAdvance,
      status: "disbursed",
    });

    const wrapper = mountWithStubs();
    const disburseBtn = wrapper.findAll("button").find((b) => b.text().includes("Disburse"));
    await disburseBtn.trigger("click");

    const payoutPayload = {
      granted_by: "Admin User",
      payout_method: "E-wallet",
      payout_method_other: null,
      granter_signature: "data:image/png;base64,granterSig",
      password: "secret123",
    };

    const grantModal = wrapper.findComponent(GrantPayoutModal);
    await grantModal.vm.$emit("confirm", payoutPayload);
    await flushPromises();

    expect(store.disburseRequest).toHaveBeenCalledWith(61, payoutPayload);
    expect(grantModal.props("isOpen")).toBe(false);
    expect(wrapper.emitted("close")).toBeTruthy();
    expect(toasts.value.some((t) => t.type === "success" && t.message.includes("disbursed"))).toBe(true);
  });

  it("keeps GrantPayoutModal open and shows error toast when store.disburseRequest fails", async () => {
    const store = useCashAdvanceStore();
    store.disburseRequest = vi.fn().mockRejectedValue(new Error("Invalid password. Please try again."));

    const wrapper = mountWithStubs();
    const disburseBtn = wrapper.findAll("button").find((b) => b.text().includes("Disburse"));
    await disburseBtn.trigger("click");

    const grantModal = wrapper.findComponent(GrantPayoutModal);
    await grantModal.vm.$emit("confirm", {
      granted_by: "Admin User",
      payout_method: "Cash",
      payout_method_other: null,
      granter_signature: "data:image/png;base64,granterSig",
      password: "wrong",
    });
    await flushPromises();

    expect(grantModal.props("isOpen")).toBe(true);
    expect(wrapper.emitted("close")).toBeFalsy();
    expect(
      toasts.value.some((t) => t.type === "error" && t.message === "Invalid password. Please try again."),
    ).toBe(true);
  });

  it("displays payout metadata, granter signature, and synchronized employee signature in Admin and Employee views", async () => {
    const disbursedWithPayout = {
      id: 72,
      userId: 10,
      requestedBy: "Juan Dela Cruz",
      purpose: "Client Visit",
      amount: 4200,
      balance: 4200,
      status: "signed",
      payout: {
        payout_method: "Other",
        payout_method_other: "Direct Bank Wire",
        granted_by: "Finance Officer Ana",
        granted_at: "2026-11-15T10:00:00Z",
        granter_signature: "data:image/png;base64,granterSig72",
        employee_signature: "data:image/png;base64,empSig72",
        acknowledged_at: "2026-11-16T08:30:00Z",
      },
    };

    for (const isAdmin of [true, false]) {
      mockAuth.isAdmin = isAdmin;
      mockAuth.user = isAdmin ? { id: 99, name: "Admin User" } : { id: 10, name: "Juan Dela Cruz" };

      const wrapper = mountWithStubs(disbursedWithPayout);
      await wrapper.find('[data-testid="modal-tab-signatures"]').trigger("click");
      const text = wrapper.text();

      expect(text).toContain("Direct Bank Wire");
      expect(text).toContain("Finance Officer Ana");
      expect(text).toContain("Nov 15, 2026");
      expect(text).toContain("Nov 16, 2026");
      expect(text).toContain("Verified");

      const granterImg = wrapper.find('img[alt="Granter Signature"]');
      expect(granterImg.exists()).toBe(true);
      expect(granterImg.attributes("src")).toBe("data:image/png;base64,granterSig72");

      const empImg = wrapper.find('img[alt="Signature"]');
      expect(empImg.exists()).toBe(true);
      expect(empImg.attributes("src")).toBe("data:image/png;base64,empSig72");
    }
  });
});

describe("CashAdvanceDetailsModal — Unified Tabbed Layout, Notes & Summary", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockAuth.isAdmin = true;
    mockAuth.user = { id: 99, name: "Admin User" };
  });

  const baseStubs = {
    UnifiedRoadmapStepper: {
      name: "UnifiedRoadmapStepper",
      template: '<div data-testid="roadmap-stepper-stub"></div>',
    },
    StatusBadge: true,
    DecisionConfirmationModal: true,
    GrantPayoutModal: true,
    BaseModal: true,
    SbsiReportPreviewModal: true,
  };

  it("enforces Roadmap -> Tabs -> Notes -> Summary vertical order in both Admin and Employee views", () => {
    for (const isAdmin of [true, false]) {
      mockAuth.isAdmin = isAdmin;
      mockAuth.user = isAdmin
        ? { id: 99, name: "Admin User" }
        : { id: 10, name: "Juan Dela Cruz" };

      const wrapper = mount(CashAdvanceDetailsModal, {
        props: {
          isOpen: true,
          record: {
            id: 201,
            userId: 10,
            requestedBy: "Juan Dela Cruz",
            purpose: "Site Inspection",
            amount: 6000,
            balance: 6000,
            date: "2026-10-01",
            dueDate: "2026-10-15",
            status: "pending",
          },
        },
        global: { stubs: baseStubs },
      });

      const roadmap = wrapper.find('[data-testid="roadmap-stepper-stub"]');
      const reportTab = wrapper.find('[data-testid="modal-tab-report"]');
      const notesSection = wrapper.find('[data-testid="modal-notes-section"]');
      const summarySection = wrapper.find('[data-testid="modal-summary-section"]');

      expect(roadmap.exists()).toBe(true);
      expect(reportTab.exists()).toBe(true);
      expect(notesSection.exists()).toBe(true);
      expect(summarySection.exists()).toBe(true);

      const Compare = Node.DOCUMENT_POSITION_FOLLOWING;
      expect(roadmap.element.compareDocumentPosition(reportTab.element) & Compare).toBeTruthy();
      expect(reportTab.element.compareDocumentPosition(notesSection.element) & Compare).toBeTruthy();
      expect(notesSection.element.compareDocumentPosition(summarySection.element) & Compare).toBeTruthy();
    }
  });

  it("renders Report Attachment, Signatures, and Audit Trail (with count) tabs and switches panels cleanly", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 202,
          userId: 10,
          requestedBy: "Maria Santos",
          purpose: "Conference Registration",
          amount: 4500,
          balance: 4500,
          date: "2026-10-05",
          dueDate: "2026-10-20",
          status: "pending",
          audit_trail: [
            { id: "a1", action_type: "SUBMITTED", label: "Submitted", actor_name: "Maria Santos", created_at: "2026-10-05T08:00:00Z" },
            { id: "a2", action_type: "VIEWED", label: "Reviewed", actor_name: "Admin User", created_at: "2026-10-06T09:00:00Z" },
          ],
        },
      },
      global: { stubs: baseStubs },
    });

    const reportTab = wrapper.find('[data-testid="modal-tab-report"]');
    const signaturesTab = wrapper.find('[data-testid="modal-tab-signatures"]');
    const auditTab = wrapper.find('[data-testid="modal-tab-audit"]');

    expect(reportTab.text()).toContain("Report Attachment");
    expect(signaturesTab.text()).toContain("Signatures");
    expect(auditTab.text()).toContain("Audit Trail");
    expect(auditTab.text()).toContain("2");
    expect(wrapper.find('[data-testid="modal-tab-receipts"]').exists()).toBe(false);

    // Default active tab is 'report' with empty state when no document exists
    expect(reportTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.find('[data-testid="modal-panel-report"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-panel-signatures"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="modal-panel-audit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="modal-panel-report"]').text()).toContain(
      "No report attachment uploaded.",
    );

    // Switch to 'signatures' -> empty state before disbursement
    await signaturesTab.trigger("click");
    expect(signaturesTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.find('[data-testid="modal-panel-report"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="modal-panel-signatures"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-panel-signatures"]').text()).toContain(
      "Signatures and payout details will appear once the cash advance is disbursed.",
    );

    // Switch to 'audit'
    await auditTab.trigger("click");
    expect(auditTab.attributes("aria-selected")).toBe("true");
    expect(wrapper.find('[data-testid="modal-panel-signatures"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="modal-panel-audit"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-panel-audit"]').text()).toContain("Maria Santos");
  });

  it("auto-selects Signatures tab when canAcknowledgeFromCurrentView is true and resets on record change", async () => {
    mockAuth.isAdmin = false;
    mockAuth.user = { id: 10, name: "Juan Dela Cruz", signature: "data:image/png;base64,sig" };

    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 203,
          userId: 10,
          purpose: "Disbursed Advance Ready To Sign",
          amount: 5000,
          balance: 5000,
          status: "disbursed",
          acknowledgedAt: null,
          signatureImage: null,
        },
      },
      global: { stubs: baseStubs },
    });

    expect(wrapper.find('[data-testid="modal-tab-signatures"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.find('[data-testid="modal-panel-signatures"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-panel-report"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "BaseSignaturePad" }).exists()).toBe(true);

    // Changing record to a pending advance resets active tab to 'report'
    await wrapper.setProps({
      record: {
        id: 204,
        userId: 10,
        purpose: "Pending Advance",
        amount: 3000,
        balance: 3000,
        status: "pending",
      },
    });

    expect(wrapper.find('[data-testid="modal-tab-report"]').attributes("aria-selected")).toBe("true");
    expect(wrapper.find('[data-testid="modal-panel-report"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="modal-panel-signatures"]').exists()).toBe(false);

    // Manually switch to audit, close modal, and reopen -> resets back to 'report'
    await wrapper.find('[data-testid="modal-tab-audit"]').trigger("click");
    expect(wrapper.find('[data-testid="modal-tab-audit"]').attributes("aria-selected")).toBe("true");
    await wrapper.setProps({ isOpen: false });
    await wrapper.setProps({ isOpen: true });
    expect(wrapper.find('[data-testid="modal-tab-report"]').attributes("aria-selected")).toBe("true");
  });

  it("always renders Reviewer Note section with adminNotes/admin_notes or italic fallback when empty", async () => {
    mockAuth.isAdmin = false;
    mockAuth.user = { id: 10, name: "Juan Dela Cruz" };

    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 205,
          userId: 10,
          purpose: "Equipment Transport",
          amount: 2500,
          balance: 2500,
          status: "pending",
        },
      },
      global: { stubs: baseStubs },
    });

    const notes = wrapper.find('[data-testid="modal-notes-section"]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain("No notes provided");

    await wrapper.setProps({
      record: {
        id: 206,
        userId: 10,
        purpose: "Equipment Transport",
        amount: 2500,
        balance: 2500,
        status: "revise",
        admin_notes: "Please attach signed itinerary breakdown.",
      },
    });

    expect(notes.text()).toContain("Please attach signed itinerary breakdown.");
    expect(notes.text()).not.toContain("No notes provided");
  });

  it("renders Summary section with Medium Date metadata, CMS contract, overdue penalties, and balances", async () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 207,
          userId: 10,
          requestedBy: "Pedro Penduko",
          purpose: "Regional Calibration Deployment",
          amount: 8000,
          balance: 8150,
          date: "2026-10-02",
          dueDate: "2026-10-16",
          contract_id: 44,
          client_name: "Acme Lab Corp",
          status: "disbursed",
          penalties: [
            { id: 1, penalty_amount: 50 },
            { id: 2, amount: 100 },
          ],
        },
      },
      global: { stubs: baseStubs },
    });

    const summary = wrapper.find('[data-testid="modal-summary-section"]');
    expect(summary.exists()).toBe(true);
    const summaryText = summary.text();
    expect(summaryText).toContain("Pedro Penduko");
    expect(summaryText).toContain("Oct 2, 2026");
    expect(summaryText).toContain("Oct 16, 2026");
    expect(summaryText).toContain("Regional Calibration Deployment");
    expect(summaryText).toContain("Acme Lab Corp (Contract #44)");
    expect(summaryText).toContain("₱8,000.00");
    expect(summaryText).toContain("Overdue Penalty");
    expect(summaryText).toContain("₱150.00");
    expect(summaryText).toContain("₱8,150.00");

    // Without penalties, Overdue Penalty row is omitted
    await wrapper.setProps({
      record: {
        id: 208,
        userId: 10,
        requestedBy: "Pedro Penduko",
        purpose: "Standard Visit",
        amount: 4000,
        balance: 4000,
        date: "2026-10-02",
        dueDate: "2026-10-16",
        status: "pending",
        penalties: [],
      },
    });

    expect(wrapper.find('[data-testid="modal-summary-section"]').text()).not.toContain(
      "Overdue Penalty",
    );
  });
});

describe("useCashAdvanceStore — Payout Normalization & Disbursement", () => {
    let fetchSpy;

    beforeEach(() => {
      setActivePinia(createPinia());
    });

    afterEach(() => {
      fetchSpy?.mockRestore();
    });

    it("normalizes payout, disbursement, approved_by/approved_at from approval_actions, granterSignature, and payoutMethod", async () => {
      const store = useCashAdvanceStore();
      fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: 101,
            user_id: 10,
            purpose: "Audit Trip",
            amount: "6000.00",
            status: "disbursed",
            created_at: "2026-11-01T08:00:00Z",
            approval_actions: [
              {
                id: 1,
                action: "revised",
                approver: { id: 2, name: "First Reviewer" },
                actioned_at: "2026-11-02T09:00:00Z",
              },
              {
                id: 2,
                action: "approved",
                approver: { id: 3, name: "Approver Elena" },
                actioned_at: "2026-11-03T10:00:00Z",
              },
            ],
            disbursement: {
              channel: "Cash",
              payout_method: "E-wallet",
              granted_by: "Cashier Mike",
              granter_signature: "data:image/png;base64,disbGranterSig",
            },
            payout: {
              payout_method: "E-wallet",
              granted_by: "Cashier Mike",
              granter_signature: "data:image/png;base64,payoutGranterSig",
              employee_signature: "data:image/png;base64,payoutEmpSig",
              acknowledged_at: "2026-11-04T11:00:00Z",
            },
          },
        ],
      });

      await store.fetchAll();
      expect(store.items).toHaveLength(1);
      const item = store.items[0];
      expect(item.payout).toBeTruthy();
      expect(item.disbursement).toBeTruthy();
      expect(item.approved_by).toBe("Approver Elena");
      expect(item.approved_at).toBe("2026-11-03T10:00:00Z");
      expect(item.granterSignature).toBe("data:image/png;base64,payoutGranterSig");
      expect(item.payoutMethod).toBe("E-wallet");
      expect(item.signatureImage).toBe("data:image/png;base64,payoutEmpSig");
      expect(item.acknowledgedAt).toBe("2026-11-04T11:00:00Z");
    });

    it("supports both legacy { channel, reference } and GrantPayoutModal payloads in disburseRequest and extracts validation errors", async () => {
      const originalCrypto = globalThis.crypto;
      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        configurable: true,
        writable: true,
      });

      try {
        const store = useCashAdvanceStore();

        // 1. New GrantPayoutModal payload
        fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              id: 55,
              user_id: 10,
              status: "disbursed",
              payout: {
                payout_method: "Other",
                payout_method_other: "GCash Corporate",
                granted_by: "Admin User",
                granter_signature: "data:image/png;base64,sig55",
              },
            },
          }),
        });

        const modalRes = await store.disburseRequest(55, {
          granted_by: "Admin User",
          payout_method: "Other",
          payout_method_other: "GCash Corporate",
          granter_signature: "data:image/png;base64,sig55",
          password: "secret",
        });

        const [, modalFetchOpts] = fetchSpy.mock.calls[0];
        expect(JSON.parse(modalFetchOpts.body)).toEqual({
          granted_by: "Admin User",
          payout_method: "Other",
          payout_method_other: "GCash Corporate",
          granter_signature: "data:image/png;base64,sig55",
          password: "secret",
        });
        expect(modalRes.payoutMethod).toBe("Other");

        // 2. Legacy { channel, reference }, password signature
        fetchSpy.mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              id: 56,
              user_id: 10,
              status: "disbursed",
              disbursement: { channel: "Bank Transfer", reference_number: "REF-56" },
            },
          }),
        });

        const legacyRes = await store.disburseRequest(
          56,
          { channel: "Bank Transfer", reference: "REF-56" },
          "legacyPass",
        );
        const [, legacyFetchOpts] = fetchSpy.mock.calls[1];
        expect(JSON.parse(legacyFetchOpts.body)).toEqual({
          channel: "Bank Transfer",
          reference: "REF-56",
          password: "legacyPass",
        });
        expect(legacyRes.payoutMethod).toBe("Bank Transfer");

        // 3. Validation error extraction (e.g. payout_method_other)
        fetchSpy.mockResolvedValueOnce({
          ok: false,
          json: async () => ({
            message: "Validation failed",
            errors: {
              payout_method_other: ["Please specify the payout method."],
            },
          }),
        });

        await expect(
          store.disburseRequest(57, {
            granted_by: "Admin User",
            payout_method: "Other",
            payout_method_other: "",
            granter_signature: "data:image/png;base64,sig57",
            password: "secret",
          }),
        ).rejects.toThrow("Please specify the payout method.");
      } finally {
        Object.defineProperty(globalThis, "crypto", {
          value: originalCrypto,
          configurable: true,
          writable: true,
        });
      }
    });
});

describe("CashAdvanceDetailsModal — Request Summary Disbursement Date", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  const baseStubs = {
    UnifiedRoadmapStepper: true,
    StatusBadge: true,
    DecisionConfirmationModal: true,
    GrantPayoutModal: true,
    SbsiReportPreviewModal: true,
    BaseModal: true,
    BaseAuditTrail: true,
    BaseSignaturePad: true,
  };

  it("replaces Request ID with Disbursement Date in Employee Request Summary", () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 16,
          userId: 99,
          purpose: "Field supplies",
          amount: 100,
          balance: 100,
          date: "2026-11-25",
          expected_disbursement_date: "2026-11-26",
          dueDate: "2026-11-27",
          status: "pending",
        },
      },
      global: { stubs: baseStubs },
    });

    const summary = wrapper.find('[data-testid="modal-summary-section"]');
    expect(summary.text()).not.toContain("Request ID");
    expect(summary.text()).not.toContain("#16");

    const items = summary.findAll('[data-testid^="summary-"]');
    expect(items.map((el) => el.attributes("data-testid"))).toEqual([
      "summary-disbursement-date",
      "summary-date-requested",
      "summary-settlement-due-date",
    ]);
    expect(wrapper.find('[data-testid="summary-disbursement-date"]').text()).toContain("Disbursement Date");
    expect(wrapper.find('[data-testid="summary-disbursement-date"]').text()).toContain("Nov 26, 2026");
  });

  it("renders Disbursement Date below Date Requested (after Settlement Due Date) in Admin Request Summary", () => {
    mockAuth.isAdmin = true;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 16,
          userId: 10,
          requestedBy: "Juan Dela Cruz",
          purpose: "Field supplies",
          amount: 100,
          balance: 100,
          date: "2026-11-25",
          expected_disbursement_date: "2026-11-26",
          dueDate: "2026-11-27",
          status: "pending",
        },
      },
      global: { stubs: baseStubs },
    });

    const summary = wrapper.find('[data-testid="modal-summary-section"]');
    const items = summary.findAll('[data-testid^="summary-"]');
    expect(items.map((el) => el.attributes("data-testid"))).toEqual([
      "summary-requestor",
      "summary-date-requested",
      "summary-settlement-due-date",
      "summary-disbursement-date",
    ]);
    expect(wrapper.find('[data-testid="summary-disbursement-date"]').text()).toContain("Disbursement Date");
    expect(wrapper.find('[data-testid="summary-disbursement-date"]').text()).toContain("Nov 26, 2026");
  });

  it("falls back to '--' when expected_disbursement_date is missing", () => {
    mockAuth.isAdmin = false;
    const wrapper = mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record: {
          id: 17,
          userId: 99,
          purpose: "Field supplies",
          amount: 100,
          balance: 100,
          date: "2026-11-25",
          dueDate: "2026-11-27",
          status: "pending",
        },
      },
      global: { stubs: baseStubs },
    });

    expect(wrapper.find('[data-testid="summary-disbursement-date"]').text()).toContain("--");
  });
});

describe("CashAdvanceDetailsModal — header Must Sign and 3-day signing countdown / penalty badges", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-26T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mountModal = (record, { isAdmin = false, userId = isAdmin ? 99 : 10 } = {}) => {
    mockAuth.isAdmin = isAdmin;
    mockAuth.user = { id: userId, name: isAdmin ? "Admin User" : "Juan Dela Cruz" };
    return mount(CashAdvanceDetailsModal, {
      props: {
        isOpen: true,
        record,
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          StatusBadge: { template: '<span data-testid="status-badge-stub" />' },
          DecisionConfirmationModal: true,
          GrantPayoutModal: true,
          SbsiReportPreviewModal: true,
          BaseModal: true,
          BaseAuditTrail: true,
          BaseSignaturePad: true,
        },
      },
    });
  };

  it("renders Must Sign then DaysLeftBadge before StatusBadge for unacknowledged employee cash advance across 3-day thresholds and PENALTY", async () => {
    const baseRecord = {
      id: 301,
      userId: 10,
      purpose: "Field Calibration",
      amount: 5000,
      balance: 5000,
      status: "disbursed",
      acknowledgedAt: null,
      signatureImage: null,
      payout: {
        granted_at: "2026-11-26T00:00:00Z",
      },
    };

    const wrapper = mountModal(baseRecord, { isAdmin: false, userId: 10 });

    const mustSign = wrapper.find('[data-testid="cash-advance-must-sign-badge"]');
    const daysLeft = wrapper.findComponent(DaysLeftBadge);
    expect(mustSign.exists()).toBe(true);
    expect(mustSign.text()).toContain("Must Sign");
    expect(daysLeft.exists()).toBe(true);
    expect(daysLeft.text()).toContain("3 days left");
    expect(daysLeft.classes()).toContain("bg-emerald-50");

    // Verify DOM order: Must Sign -> DaysLeftBadge -> StatusBadge
    const html = wrapper.html();
    const mustSignIdx = html.indexOf('data-testid="cash-advance-must-sign-badge"');
    const daysLeftIdx = html.indexOf('data-testid="days-left-badge"');
    const statusIdx = html.indexOf('data-testid="status-badge-stub"');
    expect(daysLeftIdx).toBeGreaterThan(mustSignIdx);
    expect(statusIdx).toBeGreaterThan(daysLeftIdx);

    // Day 1 -> 2 days left (amber)
    await wrapper.setProps({
      record: { ...baseRecord, payout: { granted_at: "2026-11-25T00:00:00Z" } },
    });
    expect(wrapper.findComponent(DaysLeftBadge).text()).toContain("2 days left");
    expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-amber-50");

    // Day 2 -> 1 day left (red)
    await wrapper.setProps({
      record: { ...baseRecord, payout: { granted_at: "2026-11-24T00:00:00Z" } },
    });
    expect(wrapper.findComponent(DaysLeftBadge).text()).toContain("1 day left");
    expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-red-50");

    // Day 3 -> Due today (red)
    await wrapper.setProps({
      record: { ...baseRecord, payout: { granted_at: "2026-11-23T00:00:00Z" } },
    });
    expect(wrapper.findComponent(DaysLeftBadge).text()).toContain("Due today");
    expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-red-50");

    // Day 4+ -> PENALTY (red)
    await wrapper.setProps({
      record: { ...baseRecord, payout: { granted_at: "2026-11-21T00:00:00Z" } },
    });
    expect(wrapper.findComponent(DaysLeftBadge).text()).toBe("PENALTY");
    expect(wrapper.findComponent(DaysLeftBadge).classes()).toContain("bg-red-50");
  });

  it("renders DaysLeftBadge / PENALTY without Must Sign for admin on unacknowledged disbursed cash advance", () => {
    const wrapper = mountModal(
      {
        id: 302,
        userId: 10,
        purpose: "Field Calibration",
        amount: 5000,
        balance: 5000,
        status: "disbursed",
        disbursement: {
          created_at: "2026-11-21T00:00:00Z",
        },
      },
      { isAdmin: true, userId: 99 },
    );

    expect(wrapper.find('[data-testid="cash-advance-must-sign-badge"]').exists()).toBe(false);
    expect(wrapper.findComponent(DaysLeftBadge).exists()).toBe(true);
    expect(wrapper.findComponent(DaysLeftBadge).text()).toBe("PENALTY");
  });

  it("hides Must Sign and DaysLeftBadge when acknowledged or not disbursed, and omits DaysLeftBadge if granted date is missing", () => {
    const acked = mountModal(
      {
        id: 303,
        userId: 10,
        amount: 5000,
        status: "disbursed",
        acknowledgedAt: "2026-11-26T00:00:00Z",
        payout: { granted_at: "2026-11-21T00:00:00Z" },
      },
      { isAdmin: false, userId: 10 },
    );
    expect(acked.find('[data-testid="cash-advance-must-sign-badge"]').exists()).toBe(false);
    expect(acked.findComponent(DaysLeftBadge).exists()).toBe(false);

    const pending = mountModal(
      {
        id: 304,
        userId: 10,
        amount: 5000,
        status: "approved",
        payout: { granted_at: "2026-11-21T00:00:00Z" },
      },
      { isAdmin: false, userId: 10 },
    );
    expect(pending.find('[data-testid="cash-advance-must-sign-badge"]').exists()).toBe(false);
    expect(pending.findComponent(DaysLeftBadge).exists()).toBe(false);

    const missingDate = mountModal(
      {
        id: 305,
        userId: 10,
        amount: 5000,
        status: "disbursed",
        acknowledgedAt: null,
        signatureImage: null,
      },
      { isAdmin: false, userId: 10 },
    );
    expect(missingDate.find('[data-testid="cash-advance-must-sign-badge"]').exists()).toBe(true);
    expect(missingDate.findComponent(DaysLeftBadge).exists()).toBe(false);
  });
});
