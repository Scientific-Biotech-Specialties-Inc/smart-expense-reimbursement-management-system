// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  getRequiredActionLabel,
  hasPendingSignOff,
} from "./requestActionIndicator";

describe("getRequiredActionLabel & hasPendingSignOff", () => {
  describe("reimbursement", () => {
    it("returns owner action labels for revise and unacknowledged granted payout, and null otherwise", () => {
      const ctx = { isAdmin: false, currentUserId: 10 };

      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "revise" }, "reimbursement", ctx),
      ).toBe("Edit & resubmit request");
      expect(
        getRequiredActionLabel(
          {
            user_id: 10,
            displayStatus: "granted",
            payout: { acknowledged_at: null, employee_signature: null },
          },
          "reimbursement",
          ctx,
        ),
      ).toBe("Sign to acknowledge payout");

      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "pending" }, "reimbursement", ctx),
      ).toBeNull();
      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "approved" }, "reimbursement", ctx),
      ).toBeNull();
      expect(
        hasPendingSignOff({ user_id: 10, displayStatus: "pending" }, "reimbursement", ctx),
      ).toBe(false);
    });

    it("returns admin action labels for pending/approved/processing on other users' claims and respects self-approval rules", () => {
      const ctx = { isAdmin: true, currentUserId: 99 };

      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "pending" }, "reimbursement", ctx),
      ).toBe("Review & approve claim");
      expect(
        getRequiredActionLabel({ user_id: 10, status: "submitted" }, "reimbursement", ctx),
      ).toBe("Review & approve claim");
      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "processing" }, "reimbursement", ctx),
      ).toBe("Review & approve claim");
      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "approved" }, "reimbursement", ctx),
      ).toBe("Grant payout");

      expect(
        getRequiredActionLabel({ user_id: 10, displayStatus: "revise" }, "reimbursement", ctx),
      ).toBeNull();
      expect(
        getRequiredActionLabel({ user_id: 99, displayStatus: "pending" }, "reimbursement", ctx),
      ).toBeNull();
      expect(
        getRequiredActionLabel({ user_id: 99, displayStatus: "revise" }, "reimbursement", ctx),
      ).toBe("Edit & resubmit request");
    });
  });

  describe("cash_advance", () => {
    it("returns owner action labels for revise and unacknowledged disbursed advance", () => {
      const ctx = { isAdmin: false, currentUserId: 10 };

      expect(
        getRequiredActionLabel({ userId: 10, status: "revise" }, "cash_advance", ctx),
      ).toBe("Edit & resubmit request");
      expect(
        getRequiredActionLabel({ userId: 10, status: "disbursed" }, "cash_advance", ctx),
      ).toBe("Sign to acknowledge receipt");
      expect(
        getRequiredActionLabel({ userId: 10, status: "signed" }, "cash_advance", ctx),
      ).toBeNull();
    });

    it("returns admin action labels for pending and approved advances", () => {
      const ctx = { isAdmin: true, currentUserId: 99 };

      expect(
        getRequiredActionLabel({ userId: 10, status: "pending" }, "cash_advance", ctx),
      ).toBe("Review & approve request");
      expect(
        getRequiredActionLabel({ userId: 10, status: "approved" }, "cash_advance", ctx),
      ).toBe("Disburse funds");
      expect(
        getRequiredActionLabel({ userId: 99, status: "approved" }, "cash_advance", ctx),
      ).toBeNull();
      expect(
        getRequiredActionLabel({ userId: 99, status: "disbursed" }, "cash_advance", ctx),
      ).toBe("Sign to acknowledge receipt");
    });
  });

  describe("liquidation and liquidation_advance", () => {
    it("returns review label for admin liquidation table and revise label for owner", () => {
      const ctx = { isAdmin: true, currentUserId: 99 };

      for (const status of ["Pending", "Under Review", "Incomplete", "Overdue", "Overpayment"]) {
        expect(
          getRequiredActionLabel({ requestorId: 10, status }, "liquidation", ctx),
        ).toBe("Review & settle liquidation");
      }
      expect(
        getRequiredActionLabel({ requestorId: 10, status: "Liquidated" }, "liquidation", ctx),
      ).toBeNull();
      expect(
        getRequiredActionLabel({ requestorId: 99, status: "Pending" }, "liquidation", ctx),
      ).toBeNull();
      expect(
        getRequiredActionLabel({ requestorId: 99, status: "Revise" }, "liquidation", ctx),
      ).toBe("Edit & resubmit liquidation");
    });

    it("returns specific employee action labels on liquidation advances table", () => {
      const ctx = { isAdmin: false, currentUserId: 10 };

      expect(
        getRequiredActionLabel({ userId: 10, status: "disbursed" }, "liquidation_advance", ctx),
      ).toBe("Sign to acknowledge receipt");
      expect(
        getRequiredActionLabel({ userId: 10, status: "revise" }, "liquidation_advance", ctx),
      ).toBe("Edit & resubmit liquidation");
      for (const status of ["signed", "incomplete", "overdue", "overpayment", "under-review"]) {
        expect(
          getRequiredActionLabel({ userId: 10, status }, "liquidation_advance", ctx),
        ).toBeNull();
      }
    });
  });

  describe("payout", () => {
    it("returns sign-to-acknowledge label for employees on unacknowledged payouts and null for admins", () => {
      expect(
        getRequiredActionLabel(
          { acknowledgementStatus: "awaiting-acknowledgement" },
          "payout",
          { isAdmin: false, currentUserId: 10 },
        ),
      ).toBe("Sign to acknowledge payout");
      expect(
        getRequiredActionLabel(
          { acknowledgementStatus: "awaiting-acknowledgement" },
          "payout",
          { isAdmin: true, currentUserId: 99 },
        ),
      ).toBeNull();
    });
  });
});
