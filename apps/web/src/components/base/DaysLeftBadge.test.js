// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import DaysLeftBadge from "./DaysLeftBadge.vue";

describe("DaysLeftBadge", () => {
  beforeEach(() => {
    // Pin time to 2026-10-21 00:00:00
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-21T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders 'x days left' with progress bar when due date is in the future", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-26T00:00:00Z", // 5 days left
        startDate: "2026-10-19T00:00:00Z", // 7-day total duration, 2 elapsed
      },
    });

    expect(wrapper.text()).toContain("5 days left");
    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.exists()).toBe(true);
    // 2 of 7 elapsed -> Math.round((2 / 7) * 100) = 29%
    expect(progressbar.attributes("aria-valuenow")).toBe("29");
  });

  it("renders with green styling when way longer than deadline (> 10 days left)", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-11-20T00:00:00Z", // 30 days left
        startDate: "2026-10-10T00:00:00Z",
      },
    });

    expect(wrapper.text()).toContain("30 days left");
    expect(wrapper.classes()).toContain("bg-emerald-50");
    expect(wrapper.classes()).toContain("text-emerald-700");
    expect(wrapper.classes()).toContain("border-emerald-200");

    const track = wrapper.find('[role="progressbar"]');
    expect(track.classes()).toContain("bg-emerald-200");

    const fill = track.find("div");
    expect(fill.classes()).toContain("bg-emerald-600");
  });

  it("renders with yellow styling when in the middle (4 to 10 days left)", () => {
    const wrapper10Days = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-31T00:00:00Z", // 10 days left
        startDate: "2026-10-11T00:00:00Z",
      },
    });

    expect(wrapper10Days.text()).toContain("10 days left");
    expect(wrapper10Days.classes()).toContain("bg-amber-50");
    expect(wrapper10Days.classes()).toContain("text-amber-700");
    expect(wrapper10Days.classes()).toContain("border-amber-200");

    const track10 = wrapper10Days.find('[role="progressbar"]');
    expect(track10.classes()).toContain("bg-amber-200");
    expect(track10.find("div").classes()).toContain("bg-amber-500");

    const wrapper4Days = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-25T00:00:00Z", // 4 days left
        startDate: "2026-10-15T00:00:00Z",
      },
    });

    expect(wrapper4Days.text()).toContain("4 days left");
    expect(wrapper4Days.classes()).toContain("bg-amber-50");
  });

  it("renders with red styling when close to deadline (<= 3 days left)", () => {
    const wrapper3Days = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-24T00:00:00Z", // 3 days left
        startDate: "2026-10-17T00:00:00Z",
      },
    });

    expect(wrapper3Days.text()).toContain("3 days left");
    expect(wrapper3Days.classes()).toContain("bg-red-50");
    expect(wrapper3Days.classes()).toContain("text-red-700");
    expect(wrapper3Days.classes()).toContain("border-red-200");

    const track = wrapper3Days.find('[role="progressbar"]');
    expect(track.classes()).toContain("bg-red-200");
    expect(track.find("div").classes()).toContain("bg-red-600");

    const wrapper1Day = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-22T00:00:00Z", // 1 day left
        startDate: "2026-10-15T00:00:00Z",
      },
    });

    expect(wrapper1Day.text()).toContain("1 day left");
    expect(wrapper1Day.classes()).toContain("bg-red-50");
  });

  it("renders 'Due today' with 100% progress and red styling on the due date", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-21T00:00:00Z", // 0 days diff
        startDate: "2026-10-14T00:00:00Z",
      },
    });

    expect(wrapper.text()).toContain("Due today");
    expect(wrapper.classes()).toContain("bg-red-50");
    expect(wrapper.classes()).toContain("text-red-700");
    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.exists()).toBe(true);
    expect(progressbar.attributes("aria-valuenow")).toBe("100");
  });

  it("renders grace period countdown (7 down to 1) during days 1 to 7 past due", () => {
    const day1Past = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-20T00:00:00Z", // 1 day past due -> 7 grace days left
        startDate: "2026-10-13T00:00:00Z",
      },
    });
    expect(day1Past.text()).toContain("7 grace days left");
    expect(day1Past.classes()).toContain("bg-red-50");
    expect(day1Past.find('[role="progressbar"]').attributes("aria-valuenow")).toBe("100");

    const day7Past = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-14T00:00:00Z", // 7 days past due -> 1 grace day left
        startDate: "2026-10-07T00:00:00Z",
      },
    });
    expect(day7Past.text()).toContain("1 grace day left");
    expect(day7Past.classes()).toContain("bg-red-50");
    expect(day7Past.find('[role="progressbar"]').attributes("aria-valuenow")).toBe("100");
  });

  it("renders 'PENALTY' with alert icon and no progress bar once past the 7-day grace period", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-13T00:00:00Z", // 8 days past due
        status: "disbursed",
      },
    });

    expect(wrapper.text()).toBe("PENALTY");
    expect(wrapper.classes()).toContain("bg-red-50");
    expect(wrapper.classes()).toContain("text-red-700");
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="days-left-penalty-icon"]').exists()).toBe(true);
  });

  it("renders 'PENALTY' with no progress bar when status is overdue", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-15T00:00:00Z",
        status: "overdue",
      },
    });

    expect(wrapper.text()).toBe("PENALTY");
    expect(wrapper.classes()).toContain("bg-red-50");
    expect(wrapper.classes()).toContain("text-red-700");
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="days-left-penalty-icon"]').exists()).toBe(true);
  });

  it("renders 'PENALTY' when isOverdue prop is true", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-30T00:00:00Z",
        isOverdue: true,
      },
    });

    expect(wrapper.text()).toBe("PENALTY");
    expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="days-left-penalty-icon"]').exists()).toBe(true);
  });

  it("renders 'Closed' instead of 'PENALTY' for past-due liquidated, settled, or rejected records without penalties", () => {
    for (const status of ["liquidated", "settled", "rejected"]) {
      const wrapper = mount(DaysLeftBadge, {
        props: {
          dueDate: "2026-10-01T00:00:00Z", // 20 days past due
          status,
        },
      });
      expect(wrapper.text()).toBe("Closed");
      expect(wrapper.text()).not.toContain("PENALTY");
      expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    }
  });

  it("renders 'Under review' instead of 'PENALTY' for past-due pending, under-review, or approved records without penalties", () => {
    for (const status of ["pending", "under-review", "approved"]) {
      const wrapper = mount(DaysLeftBadge, {
        props: {
          dueDate: "2026-10-01T00:00:00Z", // 20 days past due
          status,
        },
      });
      expect(wrapper.text()).toBe("Under review");
      expect(wrapper.text()).not.toContain("PENALTY");
      expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
    }
  });

  it("still renders when status is liquidated, settled, or rejected as long as dueDate exists", () => {
    const wrapperLiquidated = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-25T00:00:00Z",
        status: "liquidated",
      },
    });
    expect(wrapperLiquidated.find('[data-testid="days-left-badge"]').exists()).toBe(true);

    const wrapperSettled = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-25T00:00:00Z",
        status: "settled",
      },
    });
    expect(wrapperSettled.find('[data-testid="days-left-badge"]').exists()).toBe(true);

    const wrapperRejected = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-25T00:00:00Z",
        status: "rejected",
      },
    });
    expect(wrapperRejected.find('[data-testid="days-left-badge"]').exists()).toBe(true);
  });

  it("falls back to 7 days duration when startDate is omitted", () => {
    const wrapper = mount(DaysLeftBadge, {
      props: {
        dueDate: "2026-10-25T00:00:00Z", // 4 days left
      },
    });

    expect(wrapper.text()).toContain("4 days left");
    // 7 - 4 = 3 elapsed -> Math.round((3 / 7) * 100) = 43%
    const progressbar = wrapper.find('[role="progressbar"]');
    expect(progressbar.attributes("aria-valuenow")).toBe("43");
  });
});
