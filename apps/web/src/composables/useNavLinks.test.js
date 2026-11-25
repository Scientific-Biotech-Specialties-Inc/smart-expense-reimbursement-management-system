import { describe, expect, it } from "vitest";
import { buildNavLinks } from "./useNavLinks";

describe("buildNavLinks", () => {
  it("includes My Expense and Penalties for every authenticated user", () => {
    const links = buildNavLinks();
    expect(links.some((l) => l.name === "My Expense" && l.to === "/my-expense")).toBe(true);
    expect(links.some((l) => l.name === "Penalties" && l.to === "/penalties")).toBe(true);
  });

  it("places Payout directly below Cash Advances for employee users", () => {
    const links = buildNavLinks();
    expect(links.map((l) => l.name).filter(Boolean)).toEqual([
      "Dashboard",
      "Reimbursements",
      "Cash Advances",
      "Payout",
      "Liquidations",
      "My Expense",
      "Penalties",
    ]);
  });

  it("includes Penalty Management under Administration when isAdmin is true", () => {
    const links = buildNavLinks(true);
    expect(links.some((l) => l.header === "Administration")).toBe(true);
    expect(
      links.some((l) => l.name === "Penalty Management" && l.to === "/admin/penalties"),
    ).toBe(true);
  });
});
