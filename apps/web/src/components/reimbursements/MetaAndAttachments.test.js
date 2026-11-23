// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import MetaAndAttachments from "./MetaAndAttachments.vue";

describe("MetaAndAttachments", () => {
  it("renders optional comments textarea and relays update:userComment on input", async () => {
    const wrapper = mount(MetaAndAttachments, {
      props: {
        reportFile: null,
        userComment: "Initial note",
      },
    });

    const textarea = wrapper.find("textarea#reimbursement-user-comment");
    expect(textarea.exists()).toBe(true);
    expect(textarea.element.value).toBe("Initial note");
    expect(wrapper.text()).toContain("Comments / Notes (Optional)");
    expect(wrapper.text()).toContain("12 / 1000");

    await textarea.setValue("Updated comment for admin");
    expect(wrapper.emitted("update:userComment")).toBeTruthy();
    expect(wrapper.emitted("update:userComment")[0]).toEqual(["Updated comment for admin"]);
  });

  it("renders report attachment card and comments card with appropriate stacking contexts", () => {
    const wrapper = mount(MetaAndAttachments, {
      props: {
        reportFile: null,
      },
    });

    const cards = wrapper.findAll("section.card");
    expect(cards.length).toBe(2);

    // Report section (first card) must have z-20
    expect(cards[0].classes()).toContain("z-20");

    // Comments section (second card) must have z-10
    expect(cards[1].classes()).toContain("z-10");
  });

  it("renders attached report file details and allows removal", async () => {
    const fakeFile = new File(["dummy content"], "activity-report.pdf", {
      type: "application/pdf",
    });

    const wrapper = mount(MetaAndAttachments, {
      props: {
        reportFile: fakeFile,
      },
    });

    expect(wrapper.text()).toContain("activity-report.pdf");

    const removeBtn = wrapper.find("button[aria-label='Remove report attachment']");
    expect(removeBtn.exists()).toBe(true);

    await removeBtn.trigger("click");
    expect(wrapper.emitted("update:reportFile")).toBeTruthy();
    expect(wrapper.emitted("update:reportFile")[0]).toEqual([null]);
  });

  it("handles stubbed SbsiReportDocumentEditor @update:mode transitions without DOM clicks", async () => {
    const StubEditor = {
      name: "SbsiReportDocumentEditor",
      props: ["modelValue", "reportFile"],
      emits: ["update:modelValue", "update:reportFile", "update:purpose", "update:mode"],
      template: `<div data-testid="stub-editor">
        <button data-testid="emit-template" @click="$emit('update:mode', 'template')">T</button>
        <button data-testid="emit-manual" @click="$emit('update:mode', 'manual')">M</button>
      </div>`,
    };

    const file = new File(["pdf"], "manual.pdf", { type: "application/pdf" });
    const wrapper = mount(MetaAndAttachments, {
      props: {
        reportFile: file,
        reportTemplateData: { mode: "manual" },
      },
      global: {
        stubs: { SbsiReportDocumentEditor: StubEditor },
      },
    });

    await wrapper.find('[data-testid="emit-template"]').trigger("click");
    expect(wrapper.emitted("update:isManualMode")).toContainEqual([false]);
    expect(wrapper.emitted("update:reportFile")).toContainEqual([null]);
    expect(wrapper.emitted("update:reportTemplateData")).toBeTruthy();

    await wrapper.find('[data-testid="emit-manual"]').trigger("click");
    expect(wrapper.emitted("update:isManualMode")).toContainEqual([true]);
    const latestTemplateEmit = wrapper.emitted("update:reportTemplateData")?.slice(-1)[0]?.[0];
    expect(latestTemplateEmit?.mode).toBe("manual");
  });

  it("emits update:reportFile(null) when switching from server string reportFile manual mode to template", async () => {
    const wrapper = mount(MetaAndAttachments, {
      props: {
        reportFile: "reports/existing.pdf",
        reportTemplateData: null,
      },
      global: {
        stubs: { BaseSignaturePad: true },
      },
    });
    await nextTick();

    expect(wrapper.find('[data-testid="mode-manual"]').attributes("aria-pressed")).toBe("true");
    await wrapper.find('[data-testid="mode-template"]').trigger("click");
    await nextTick();

    expect(wrapper.emitted("update:isManualMode")).toContainEqual([false]);
    expect(wrapper.emitted("update:reportFile")).toContainEqual([null]);
  });

  it("embeds TsTicketSelect alongside CmsContractSelect and relays update:ticketId and update:ticketNumber", async () => {
    const TsTicketSelectStub = {
      name: "TsTicketSelect",
      props: ["ticketId", "ticketNumber"],
      emits: ["update:ticketId", "update:ticketNumber"],
      template: `<div data-testid="ts-ticket-select-stub">
        <button data-testid="pick-ticket" @click="$emit('update:ticketId', 42); $emit('update:ticketNumber', 'TKT-0042')">Pick</button>
      </div>`,
    };

    const wrapper = mount(MetaAndAttachments, {
      props: {
        reportFile: null,
        ticketId: 10,
        ticketNumber: "TKT-0010",
      },
      global: {
        stubs: {
          SbsiReportDocumentEditor: true,
          CmsContractSelect: true,
          TsTicketSelect: TsTicketSelectStub,
        },
      },
    });

    const ticketComp = wrapper.findComponent(TsTicketSelectStub);
    expect(ticketComp.exists()).toBe(true);
    expect(ticketComp.props("ticketId")).toBe(10);
    expect(ticketComp.props("ticketNumber")).toBe("TKT-0010");

    await wrapper.find('[data-testid="pick-ticket"]').trigger("click");
    expect(wrapper.emitted("update:ticketId")?.[0]).toEqual([42]);
    expect(wrapper.emitted("update:ticketNumber")?.[0]).toEqual(["TKT-0042"]);
  });
});
