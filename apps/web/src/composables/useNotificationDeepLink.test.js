// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nextTick } from "vue";
import { useNotificationDeepLink } from "./useNotificationDeepLink";

const mockApiFetch = vi.fn();
const mockAddToast = vi.fn();
const mockReplace = vi.fn();
const mockRoute = { query: {} };

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ addToast: mockAddToast }),
}));

vi.mock("vue-router", () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ replace: mockReplace }),
}));

describe("useNotificationDeepLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRoute.query = {};
  });

  it("shows access-denied error toast and blocks opening when API returns 403", async () => {
    mockRoute.query = { view: "42" };
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ message: "Forbidden." }),
    });

    const onOpenRecord = vi.fn();
    const { checkDeepLink } = useNotificationDeepLink({
      verifyUrl: (id) => `/api/serms/reimbursements/${id}`,
      onOpenRecord,
    });

    await checkDeepLink();
    await nextTick();

    expect(onOpenRecord).not.toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "error",
        message: "Access denied. You do not have permission to view this record.",
      }),
    );
  });

  it("calls onOpenRecord and cleans up query param when record access succeeds with 200 OK", async () => {
    mockRoute.query = { view: "10" };
    const fakeRecord = { id: 10, amount: 2500 };
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: fakeRecord }),
    });

    const onOpenRecord = vi.fn();
    const { checkDeepLink } = useNotificationDeepLink({
      verifyUrl: (id) => `/api/serms/reimbursements/${id}`,
      onOpenRecord,
    });

    await checkDeepLink();
    await nextTick();

    expect(onOpenRecord).toHaveBeenCalledWith(fakeRecord, "10");
    expect(mockReplace).toHaveBeenCalledWith({ query: {} });
  });
});
