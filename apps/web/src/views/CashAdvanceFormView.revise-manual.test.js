// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "77" }, query: {} }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  onBeforeRouteLeave: vi.fn(),
}));

import SbsiReportDocumentEditor from "@/components/base/SbsiReportDocumentEditor.vue";
import CashAdvanceFormView from "./CashAdvanceFormView.vue";

describe("CashAdvanceFormView & SbsiReportDocumentEditor — manual-mode and report_file_path revise guards", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function mockAdvanceFetch(advanceOverrides = {}) {
    const baseAdvance = {
      id: 77,
      status: "revise",
      purpose: "Client Onboarding",
      amount: 5000,
      expected_disbursement_date: "2026-10-15",
      expected_liquidation_date: "2026-10-25",
      report_template_data: {
        type: "cash-advance",
        date: "2026-10-12",
        recipientName: "Lourdes C. Roxas",
        salutation: "Dear Ms. Roxas,",
        subject: "OPERATIONAL CASH ADVANCE REQUEST",
        purpose: "Client Onboarding",
        disbursementDate: "2026-10-15",
        liquidationDeadline: "2026-10-25",
        breakdownItems: [{ description: "Flights", amount: 5000 }],
        totalAmount: 5000,
        signatoryName: "Juan Dela Cruz",
      },
      document: null,
      report_file_path: null,
      ...advanceOverrides,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        const u = String(url);
        if (u.includes("/cash-advances/77")) {
          return new Response(JSON.stringify(baseAdvance), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  }

  it("SbsiReportDocumentEditor does not overwrite manual modelValue on mount and switches to manual when async reportFile arrives", async () => {
    const manualOnly = mount(SbsiReportDocumentEditor, {
      props: {
        type: "liquidation",
        modelValue: { mode: "manual" },
        reportFile: { name: "manual.pdf", path: "liquidations/manual.pdf" },
        purpose: "Field Trip",
        totalAmount: 5000,
      },
      global: { stubs: { BaseSignaturePad: true } },
    });
    await nextTick();
    expect(manualOnly.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(manualOnly.emitted("update:modelValue")).toBeUndefined();

    // Async hydration: starts with null modelValue & null reportFile, then receives manual reportFile
    const asyncHydrated = mount(SbsiReportDocumentEditor, {
      props: {
        type: "cash-advance",
        modelValue: null,
        reportFile: null,
        purpose: "Field Trip",
        totalAmount: 5000,
      },
      global: { stubs: { BaseSignaturePad: true } },
    });
    await nextTick();
    expect(asyncHydrated.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("false");

    await asyncHydrated.setProps({
      modelValue: null,
      reportFile: { name: "manual-async.pdf", file_path: "cash-advances/manual-async.pdf" },
    });
    await nextTick();

    expect(asyncHydrated.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(asyncHydrated.find('[data-testid="manual-file-name"]').text()).toContain("manual-async.pdf");
    expect(asyncHydrated.emitted("update:mode")?.slice(-1)[0]).toEqual(["manual"]);
  });

  it("manual-mode revise with data.document { file_name, file_path } stays disabled, toggles on purpose edit/revert, and blocks Manual->Template->Manual without upload", async () => {
    mockAdvanceFetch({
      report_template_data: null,
      document: { file_name: "manual-old.pdf", file_path: "cash-advances/manual-old.pdf" },
    });

    const wrapper = mount(CashAdvanceFormView, {
      props: { id: "77" },
      global: { stubs: { BaseSignaturePad: true } },
    });
    await flushPromises();
    await nextTick();
    await nextTick();

    const submitBtn = wrapper.find("#submit-advance-btn");
    expect(submitBtn.exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.find('[data-testid="manual-file-name"]').text()).toContain("manual-old.pdf");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Edit purpose -> enables submit
    const purposeEl = wrapper.find("#ca-purpose");
    expect(purposeEl.exists()).toBe(true);
    await purposeEl.setValue("Updated Onboarding Purpose");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Revert purpose -> re-disables submit
    await purposeEl.setValue("Client Onboarding");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Switch Manual -> Template -> Manual without uploading a new file -> stays disabled
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await nextTick();
    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });

  it("template-mode revise with data.report_file_path (no data.document) + report_template_data blocks Manual without file and re-disables on Template return", async () => {
    mockAdvanceFetch({
      document: null,
      report_file_path: "cash-advances/generated-template.pdf",
    });

    const wrapper = mount(CashAdvanceFormView, {
      props: { id: "77" },
      global: { stubs: { BaseSignaturePad: true } },
    });
    await flushPromises();
    await nextTick();
    await nextTick();

    const submitBtn = wrapper.find("#submit-advance-btn");
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Template -> Manual without uploading file stays disabled
    await wrapper.find('[data-testid="mode-manual"]').trigger("click");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeDefined();

    // Upload replacement file -> enables
    const fileInput = wrapper.find('[data-testid="manual-file-input"]');
    const manualFile = new File(["manual"], "replacement.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput.element, "files", { value: [manualFile], configurable: true });
    await fileInput.trigger("change");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeUndefined();

    // Switch back to Template -> clears attachment and re-disables
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await nextTick();
    expect(submitBtn.attributes("disabled")).toBeDefined();
  });
});
