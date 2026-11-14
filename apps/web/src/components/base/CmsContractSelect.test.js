// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CmsContractSelect from "./CmsContractSelect.vue";

const mockApiFetch = vi.fn();
vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

describe("CmsContractSelect", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads contracts and emits selected contract_id and client_name", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        available: true,
        data: [
          {
            contract_id: 10,
            contract_code: "CTR-ABC123",
            client_name: "Acme Biotech Corp",
            category: "Service Agreement",
          },
        ],
      }),
    });

    const wrapper = mount(CmsContractSelect, {
      props: { contractId: null, clientName: "" },
    });
    await flushPromises();

    const select = wrapper.find("#cms-contract-select");
    expect(select.text()).toContain("CTR-ABC123 — Acme Biotech Corp");

    await select.setValue("10");
    expect(wrapper.emitted("update:contractId")?.[0]).toEqual([10]);
    expect(wrapper.emitted("update:clientName")?.[0]).toEqual(["Acme Biotech Corp"]);
  });

  it("shows fallback message cleanly when CMS is unavailable", async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ available: false, data: [] }),
    });

    const wrapper = mount(CmsContractSelect);
    await flushPromises();

    expect(wrapper.text()).toContain("CMS contract catalog is currently unavailable");
  });
});
