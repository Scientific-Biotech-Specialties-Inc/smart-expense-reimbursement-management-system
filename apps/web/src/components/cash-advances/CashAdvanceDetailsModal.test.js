// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CashAdvanceDetailsModal from "./CashAdvanceDetailsModal.vue";
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

    expect(wrapper.text()).toContain("Audit Trail");
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

  it("displays payout metadata, granter signature, and synchronized employee signature in Admin and Employee views", () => {
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
    });
});
