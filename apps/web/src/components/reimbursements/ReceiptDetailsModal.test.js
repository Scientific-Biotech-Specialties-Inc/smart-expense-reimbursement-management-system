// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ReceiptDetailsModal from "./ReceiptDetailsModal.vue";

const authState = {
  isAdmin: true,
  user: { id: "admin-1", name: "Admin User" },
};

vi.mock("@/stores/auth", () => ({
  useAuthStore: () => authState,
}));

describe("ReceiptDetailsModal — Action Button Sizing Guardrails", () => {
  it("renders decision buttons intrinsically without flex-1 and with justify-end", () => {
    const wrapper = mount(ReceiptDetailsModal, {
      props: {
        isOpen: true,
        receipt: {
          id: 99,
          status: "pending",
          vendor_name: "Office Depot",
          total_amount: 1200,
          vat_classification: "vat",
          user_id: "user-2",
        },
      },
      global: {
        stubs: {
          BaseReceiptDetailModal: {
            template: `<div><slot name="actions" /></div>`,
          },
        },
      },
    });

    const rejectBtn = wrapper.findAll("button").find((b) => b.text().includes("Reject"));
    const approveBtn = wrapper.findAll("button").find((b) => b.text().includes("Approve"));

    expect(rejectBtn).toBeDefined();
    expect(approveBtn).toBeDefined();

    expect(rejectBtn.classes()).not.toContain("flex-1");
    expect(approveBtn.classes()).not.toContain("flex-1");

    const container = rejectBtn.element.parentElement;
    expect(container.classList.contains("justify-end")).toBe(true);
  });
});
