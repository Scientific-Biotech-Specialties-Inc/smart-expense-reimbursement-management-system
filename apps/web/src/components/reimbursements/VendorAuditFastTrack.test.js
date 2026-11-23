// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import DecisionConfirmationModal from "@/components/base/DecisionConfirmationModal.vue";
import ReimbursementsTable from "@/components/reimbursements/ReimbursementsTable.vue";
import { useReimbursementFilters } from "@/composables/reimbursements/useReimbursementFilters";
import { useAuthStore } from "@/stores/auth";

describe("Fast-Track & Secondary Accounting Audit Gate", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    const auth = useAuthStore();
    auth.user = { id: 1, email: "sum@sbsi.com", department: "Accounting" };
  });

  it("prioritizes pending fast-track claims and filters by Fast-Track Eligible / Needs Secondary Audit", () => {
    const store = {
      items: [
        {
          id: 10,
          description: "Unverified supplier claim",
          amount: 2500,
          status: "pending",
          created_at: "2026-11-14T12:00:00Z",
          fast_track_eligible: false,
          vendor_audit_required: true,
          receipts: [],
        },
        {
          id: 11,
          description: "Accredited supplier claim",
          amount: 1500,
          status: "pending",
          created_at: "2026-11-10T12:00:00Z",
          fast_track_eligible: true,
          vendor_audit_required: false,
          receipts: [],
        },
      ],
    };

    const {
      activeVendorFilter,
      sortedTableRows,
    } = useReimbursementFilters(store);

    // Default sort places pending Fast-Track Eligible claim first even if older
    expect(sortedTableRows.value.map((r) => r.id)).toEqual([11, 10]);

    activeVendorFilter.value = "Fast-Track Eligible";
    expect(sortedTableRows.value.map((r) => r.id)).toEqual([11]);

    activeVendorFilter.value = "Needs Secondary Audit";
    expect(sortedTableRows.value.map((r) => r.id)).toEqual([10]);
  });

  it("renders Fast-Track Eligible and Secondary Audit Required pills in ReimbursementsTable", () => {
    const wrapper = mount(ReimbursementsTable, {
      props: {
        isLoading: false,
        totalRows: 2,
        currentPage: 1,
        columns: [
          { key: "reportDescription", label: "Report Description" },
          { key: "category", label: "Category" },
          { key: "amount", label: "Amount", align: "right" },
          { key: "dateSubmitted", label: "Date Submitted" },
          { key: "displayStatus", label: "Status", align: "center" },
          { key: "action", label: "Action", align: "center" },
        ],
        rows: [
          {
            id: 1,
            reportDescription: "Fast claim",
            category: "Operations",
            amount: 1500,
            dateSubmitted: "2026-11-10",
            displayStatus: "pending",
            fastTrackEligible: true,
            vendorAuditRequired: false,
          },
          {
            id: 2,
            reportDescription: "Unverified claim",
            category: "Operations",
            amount: 2500,
            dateSubmitted: "2026-11-14",
            displayStatus: "pending",
            fastTrackEligible: false,
            vendorAuditRequired: true,
          },
        ],
      },
      global: {
        stubs: {
          StatusBadge: true,
          ActionDropdownMenu: true,
          BasePagination: true,
        },
      },
    });

    expect(wrapper.text()).toContain("Fast-Track Eligible");
    expect(wrapper.text()).toContain("Secondary Audit Required");
  });

  it("blocks Proceed on DecisionConfirmationModal until secondaryAuditConfirmed is checked", async () => {
    const wrapper = mount(DecisionConfirmationModal, {
      props: {
        isOpen: true,
        mode: "approve",
        password: "secret",
        requiresSecondaryAudit: true,
        unverifiedVendors: ["New Corner Hardware (TIN: 999-888-777-000)"],
        secondaryAuditConfirmed: false,
        secondaryAuditNote: "",
      },
      global: {
        stubs: {
          BaseModal: { template: "<div><slot /></div>" },
        },
      },
    });

    expect(wrapper.text()).toContain("Secondary Accounting Audit Required");
    expect(wrapper.text()).toContain("New Corner Hardware (TIN: 999-888-777-000)");

    const proceedBtn = wrapper.findAll("button").find((b) => b.text().includes("Proceed"));
    expect(proceedBtn.attributes("disabled")).toBeDefined();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted("update:secondaryAuditConfirmed")?.[0]).toEqual([true]);

    await wrapper.setProps({ secondaryAuditConfirmed: true });
    expect(proceedBtn.attributes("disabled")).toBeUndefined();

    await wrapper.find("textarea").setValue("Manual TIN check passed.");
    expect(wrapper.emitted("update:secondaryAuditNote")?.[0]).toEqual(["Manual TIN check passed."]);

    await proceedBtn.trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });
});
