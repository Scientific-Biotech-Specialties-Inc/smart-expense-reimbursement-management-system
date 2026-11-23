import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

const mockApiFetch = vi.fn();
const mockWithEncryptedPassword = vi.fn();

vi.mock("../utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock("../utils/crypto", () => ({
  withEncryptedPassword: (...args) => mockWithEncryptedPassword(...args),
}));

import { useCashAdvanceStore } from "./cashAdvance";
import { useLiquidationStore } from "./liquidation";
import { useReimbursementStore } from "./reimbursement";

describe("Store password-confirmed mutations", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 1 } }),
    });
    mockWithEncryptedPassword
      .mockReset()
      .mockImplementation(async (_password, payload = {}) => {
        const base = { ...payload };
        delete base.password;
        return {
          ...base,
          encryptedKey: "ek",
          iv: "iv",
          ciphertext: "ct",
        };
      });
  });

  it("encrypts password for cashAdvance mutations", async () => {
    const store = useCashAdvanceStore();

    await store.approveRequest(1, "ok", "pw1");
    await store.rejectRequest(1, "no", "reject", "pw2");
    await store.disburseRequest(1, { channel: "GCash", password: "pw3" });
    await store.deleteRequest(1, "pw4");

    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(1, "pw1", {
      comment: "ok",
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(2, "pw2", {
      comment: "no",
      action: "reject",
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(3, "pw3", {
      channel: "GCash",
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(4, "pw4");
    for (const [, init] of mockApiFetch.mock.calls) {
      const sent = JSON.parse(init.body);
      expect(sent.password).toBeUndefined();
      expect(sent.ciphertext).toBe("ct");
    }
  });

  it("encrypts password for liquidation mutations", async () => {
    const store = useLiquidationStore();

    await store.auditSettlement(1, {
      status: "approved",
      password: "pw1",
      admin_note: "good",
    });
    await store.deleteSettlement(1, "pw2");

    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(1, "pw1", {
      status: "approved",
      password: "pw1",
      admin_note: "good",
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(2, "pw2");
  });

  it("encrypts password for reimbursement mutations", async () => {
    const store = useReimbursementStore();

    await store.approve(1, "pw1", { secondaryAuditConfirmed: true });
    await store.reject(1, "fix", "pw2", "revise");
    await store.grant(1, { granted_by: 2, password: "pw3" });
    await store.deleteRequest(1, "pw4");

    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(1, "pw1", {
      secondary_audit_confirmed: true,
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(2, "pw2", {
      comment: "fix",
      action: "revise",
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(3, "pw3", {
      granted_by: 2,
      password: "pw3",
    });
    expect(mockWithEncryptedPassword).toHaveBeenNthCalledWith(4, "pw4");
  });
});
