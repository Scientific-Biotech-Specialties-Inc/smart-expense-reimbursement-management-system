// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";

const { apiFetchMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
}));

vi.mock("@/utils/apiFetch", () => ({
  apiFetch: (...args) => apiFetchMock(...args),
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  useRoute: () => ({ query: {}, params: {} }),
  onBeforeRouteLeave: vi.fn(),
}));

import {
  BASELINE_RATES_TO_PHP,
  useCurrencyRates,
  resolveReceiptExchangeRate,
  clearReceiptExchangeRateSnapshot,
  extractReceiptFxSnapshot,
} from "./useCurrencyRates";
import { buildPrefilledReceiptDraft } from "@/utils/receiptUtils";
import { useReceiptStore } from "@/stores/receipts";
import ScannedReceiptsList from "@/components/reimbursements/ScannedReceiptsList.vue";
import BaseReceiptDetailModal from "@/components/base/BaseReceiptDetailModal.vue";
import LiquidationReceiptModal from "@/components/liquidations/LiquidationReceiptModal.vue";
import LiquidationSettlementForm from "@/components/liquidations/LiquidationSettlementForm.vue";
import ReimbursementFormView from "@/views/ReimbursementFormView.vue";
import LiquidationsView from "@/views/LiquidationsView.vue";
import ReceiptUploadModal from "@/components/expenses/ReceiptUploadModal.vue";

describe("useCurrencyRates", () => {
  const mountedWrappers = [];

  beforeEach(() => {
    setActivePinia(createPinia());
    apiFetchMock.mockReset();
    apiFetchMock.mockImplementation(async (url = "") => {
      if (String(url).includes("/currencies/rates")) {
        return {
          ok: true,
          json: async () => ({
            base: "PHP",
            rates: Object.entries(BASELINE_RATES_TO_PHP).map(
              ([currency_code, rate_to_php]) => ({
                currency_code,
                rate_to_php,
              }),
            ),
          }),
        };
      }
      if (String(url).includes("/categories")) {
        return {
          ok: true,
          json: async () => ({ data: [{ id: 1, name: "Meals" }] }),
        };
      }
      return {
        ok: true,
        json: async () => [],
      };
    });
    useCurrencyRates().ratesMap.value = { ...BASELINE_RATES_TO_PHP };
  });

  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop().unmount();
    }
    document.body.innerHTML = "";
  });

  it("exposes baseline fallback rates matching backend seeder", () => {
    expect(BASELINE_RATES_TO_PHP.PHP).toBe(1);
    expect(BASELINE_RATES_TO_PHP.USD).toBe(58.5);
    expect(BASELINE_RATES_TO_PHP.SGD).toBe(43.2);
    expect(BASELINE_RATES_TO_PHP.EUR).toBe(61.9);
    expect(BASELINE_RATES_TO_PHP.NZD).toBe(34.4);
  });

  it("detects foreign currencies accurately via isForeignCurrency", () => {
    const { isForeignCurrency } = useCurrencyRates();

    expect(isForeignCurrency("PHP")).toBe(false);
    expect(isForeignCurrency("php")).toBe(false);
    expect(isForeignCurrency(" PHP ")).toBe(false);
    expect(isForeignCurrency("")).toBe(false);
    expect(isForeignCurrency(null)).toBe(false);
    expect(isForeignCurrency(undefined)).toBe(false);

    expect(isForeignCurrency("USD")).toBe(true);
    expect(isForeignCurrency(" usd ")).toBe(true);
    expect(isForeignCurrency("JPY")).toBe(true);
  });

  it("resolves getRateToPhp using PHP=1, explicit positive overrideRate, or baseline rates", () => {
    const { getRateToPhp } = useCurrencyRates();

    expect(getRateToPhp("PHP")).toBe(1);
    expect(getRateToPhp("PHP", 99)).toBe(1);
    expect(getRateToPhp("USD")).toBe(58.5);
    expect(getRateToPhp("usd", 59.25)).toBe(59.25);
    expect(getRateToPhp("USD", 0)).toBe(58.5);
    expect(getRateToPhp("ZZZ")).toBeNull();
  });

  it("converts amounts to PHP via getConvertedPhpAmount and returns null for unknown currencies", () => {
    const { getConvertedPhpAmount } = useCurrencyRates();

    expect(getConvertedPhpAmount(1000, "PHP")).toBe(1000);
    expect(getConvertedPhpAmount("125.456", "PHP")).toBe(125.46);
    expect(getConvertedPhpAmount(50, "USD")).toBe(2925);
    expect(getConvertedPhpAmount(50, "USD", 60)).toBe(3000);
    expect(getConvertedPhpAmount(100, "JPY")).toBe(38);
    expect(getConvertedPhpAmount("", "USD")).toBe(0);
    expect(getConvertedPhpAmount(50, "ZZZ")).toBeNull();
  });

  it("formats human-readable PHP conversion labels via formatPhpConversionLabel", () => {
    const { formatPhpConversionLabel } = useCurrencyRates();

    expect(formatPhpConversionLabel(500, "PHP")).toBe("");
    expect(formatPhpConversionLabel(500, "")).toBe("");
    expect(formatPhpConversionLabel(50, "USD")).toBe(
      "≈ ₱2,925.00 PHP (1 USD = ₱58.50)",
    );
    expect(formatPhpConversionLabel(10, "SGD", 44)).toBe(
      "≈ ₱440.00 PHP (1 SGD = ₱44.00)",
    );
    expect(formatPhpConversionLabel(50, "ZZZ")).toBe(
      "Conversion rate unavailable for ZZZ",
    );
  });

  it("deduplicates concurrent fetchRates calls and updates rates from API response", async () => {
    let resolveFetch;
    apiFetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );

    const { fetchRates, getRateToPhp } = useCurrencyRates();
    const p1 = fetchRates();
    const p2 = fetchRates();

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(apiFetchMock).toHaveBeenCalledWith("/api/serms/currencies/rates");

    resolveFetch({
      ok: true,
      json: async () => ({
        base: "PHP",
        rates: [
          { currency_code: "USD", rate_to_php: "59.100000" },
          { currency_code: "NOK", rate_to_php: "5.450000" },
        ],
      }),
    });

    await Promise.all([p1, p2]);
    expect(getRateToPhp("USD")).toBe(59.1);
    expect(getRateToPhp("NOK")).toBe(5.45);
  });

  it("silently retains baseline/cached rates when fetchRates fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("Network offline"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { fetchRates, getRateToPhp } = useCurrencyRates();
    await expect(fetchRates()).resolves.toBeDefined();
    expect(getRateToPhp("SGD")).toBe(43.2);

    warnSpy.mockRestore();
  });

  it("fetches missing 3-letter currency via ensureCurrencyRate and skips already-known codes", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        base: "PHP",
        rates: [{ currency_code: "SEK", rate_to_php: "5.620000" }],
      }),
    });

    const { ensureCurrencyRate, getRateToPhp, getConvertedPhpAmount } =
      useCurrencyRates();

    const sgdRate = await ensureCurrencyRate("SGD");
    expect(sgdRate).toBe(43.2);
    expect(apiFetchMock).not.toHaveBeenCalled();

    const sekRate = await ensureCurrencyRate("sek");
    expect(sekRate).toBe(5.62);
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/currencies/rates?currency=SEK",
    );
    expect(getRateToPhp("SEK")).toBe(5.62);
    expect(getConvertedPhpAmount(100, "SEK")).toBe(562);
  });

  it("sums mixed-currency receipts into PHP accurately using locked or live rates", () => {
    const { sumReceiptsPhpAmount } = useCurrencyRates();

    const mixedReceipts = [
      { amount: 1000, currency: "PHP" },
      { amount: 50, currency: "USD", exchangeRate: 58.5, exchangeRateCurrency: "USD" },
      { amount: 10, currency: "SGD" },
      { amount: 10, currency: "SGD", exchangeRate: 1, exchangeRateCurrency: "PHP" },
    ];

    expect(sumReceiptsPhpAmount(mixedReceipts)).toBe(4789);
  });

  it("clears stale exchange rate snapshot cleanly when currency changes", () => {
    const receipt = {
      currency: "USD",
      exchangeRate: 58.5,
      exchangeRateCurrency: "USD",
      convertedPhpAmount: 2925,
      exchangeRateDate: "2026-11-22",
      exchangeRateSource: "open.er-api.com",
      ocrData: {
        exchange_rate: 58.5,
        converted_php_amount: 2925,
      },
    };

    expect(resolveReceiptExchangeRate(receipt)).toBe(58.5);
    receipt.currency = "SGD";
    expect(resolveReceiptExchangeRate(receipt)).toBeNull();

    clearReceiptExchangeRateSnapshot(receipt);
    expect(receipt.exchangeRate).toBeNull();
    expect(receipt.convertedPhpAmount).toBeNull();
    expect(receipt.exchangeRateDate).toBeNull();
    expect(receipt.exchangeRateSource).toBeNull();
    expect(receipt.ocrData.exchange_rate).toBeNull();
  });

  it("extracts snake_case and camelCase FX snapshot fields consistently via extractReceiptFxSnapshot", () => {
    expect(
      extractReceiptFxSnapshot({
        currency: "usd",
        exchange_rate: "58.500000",
        converted_php_amount: "2925.00",
        exchange_rate_date: "2026-11-22",
        exchange_rate_source: "open.er-api.com",
      }),
    ).toEqual({
      exchangeRate: 58.5,
      exchangeRateCurrency: "USD",
      convertedPhpAmount: 2925,
      exchangeRateDate: "2026-11-22",
      exchangeRateSource: "open.er-api.com",
    });

    expect(extractReceiptFxSnapshot(null)).toEqual({
      exchangeRate: null,
      exchangeRateCurrency: null,
      convertedPhpAmount: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
    });
  });

  it("preserves FX snapshot columns in receiptUtils.buildPrefilledReceiptDraft and useReceiptStore", async () => {
    const draft = buildPrefilledReceiptDraft({
      id: 10,
      receiptData: {
        total_amount: 50,
        currency: "USD",
        exchange_rate: "58.500000",
        converted_php_amount: "2925.00",
        exchange_rate_date: "2026-11-22",
        exchange_rate_source: "open.er-api.com",
      },
    });
    expect(draft.exchangeRate).toBe(58.5);
    expect(draft.exchangeRateCurrency).toBe("USD");
    expect(draft.convertedPhpAmount).toBe(2925);
    expect(draft.exchangeRateDate).toBe("2026-11-22");
    expect(draft.exchangeRateSource).toBe("open.er-api.com");

    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          {
            id: 77,
            file_path: "receipts/usd.jpg",
            file_type: "image/jpeg",
            file_size_bytes: 1024,
            file_hash: "fx-hash",
            transaction_date: "2026-11-22",
            created_at: "2026-11-22T00:00:00Z",
            total_amount: 50,
            vat_amount: 0,
            currency: "USD",
            exchange_rate: "58.500000",
            converted_php_amount: "2925.00",
            exchange_rate_date: "2026-11-22",
            exchange_rate_source: "open.er-api.com",
            status: "processed",
            vendor_name: "AWS",
            invoice_number: "INV-AWS-1",
            items: [],
          },
        ],
        meta: { current_page: 1, last_page: 1, per_page: 10, total: 1, from: 1, to: 1 },
      }),
    });

    const store = useReceiptStore();
    await store.fetchAll();
    expect(store.receipts[0].currency).toBe("USD");
    expect(store.receipts[0].exchangeRate).toBe(58.5);
    expect(store.receipts[0].convertedPhpAmount).toBe(2925);
    expect(store.receipts[0].exchangeRateDate).toBe("2026-11-22");
    expect(store.receipts[0].exchangeRateSource).toBe("open.er-api.com");
  });

  it("renders read-only PHP conversion badge in ScannedReceiptsList and clears stale snapshot on currency change", async () => {
    apiFetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        base: "PHP",
        rates: [{ currency_code: "SEK", rate_to_php: "5.500000" }],
      }),
    });

    const receiptsRef = ref([
      {
        id: "r-usd",
        fileName: "aws.pdf",
        amount: "50",
        subtotal: "50.00",
        tax: "0.00",
        vatClassification: "non-vat",
        currency: "USD",
        exchangeRate: 59.0,
        exchangeRateCurrency: "USD",
        items: [],
      },
    ]);

    const wrapper = mount(ScannedReceiptsList, {
      props: {
        receipts: receiptsRef.value,
        categories: [{ id: 1, name: "Software" }],
      },
    });
    mountedWrappers.push(wrapper);

    const badge = wrapper.find('[data-testid="receipt-php-conversion-badge"]');
    expect(badge.exists()).toBe(true);
    expect(badge.text()).toContain("≈ ₱2,950.00 PHP (1 USD = ₱59.00)");

    // Switch currency from USD -> SEK (unknown in baseline, triggers ensureCurrencyRate)
    receiptsRef.value[0].currency = "SEK";
    await flushPromises();
    await nextTick();

    expect(receiptsRef.value[0].exchangeRate).toBeNull();
    expect(apiFetchMock).toHaveBeenCalledWith(
      "/api/serms/currencies/rates?currency=SEK",
    );
    expect(wrapper.find('[data-testid="receipt-php-conversion-badge"]').text()).toContain(
      "≈ ₱275.00 PHP (1 SEK = ₱5.50)",
    );

    // Switch back to PHP -> badge disappears
    receiptsRef.value[0].currency = "PHP";
    await nextTick();
    expect(wrapper.find('[data-testid="receipt-php-conversion-badge"]').exists()).toBe(false);
  });

  it("renders read-only PHP conversion badge in BaseReceiptDetailModal and forwards foreign currency in LiquidationReceiptModal", async () => {
    const modalWrapper = mount(LiquidationReceiptModal, {
      props: {
        isOpen: true,
        receipt: {
          id: 501,
          merchantName: "Cloud Vendor",
          invoiceNumber: "INV-501",
          transactionDate: "2026-11-22",
          currency: "USD",
          exchangeRate: 58.5,
          amount: 50,
          vat: 0,
          decision: "accepted",
          filePath: "receipts/501.jpg",
          items: [],
        },
        getFileUrl: (p) => `https://cdn.example.com/${p}`,
      },
      global: {
        stubs: {
          BaseReceiptImage: true,
          ImagePreviewModal: true,
          StatusBadge: true,
        },
      },
    });
    mountedWrappers.push(modalWrapper);
    await flushPromises();
    await nextTick();

    const detailModal = modalWrapper.findComponent(BaseReceiptDetailModal);
    expect(detailModal.exists()).toBe(true);
    expect(detailModal.props("receipt").currency).toBe("USD");
    expect(document.body.textContent).toContain("$50.00");
    expect(document.body.textContent).toContain("≈ ₱2,925.00 PHP (1 USD = ₱58.50)");
  });

  it("preserves FX snapshot in ReceiptUploadModal edit mode and clears stale rate on currency change", async () => {
    const wrapper = mount(ReceiptUploadModal, {
      props: {
        modelValue: true,
        categories: [{ id: 1, name: "Meals" }],
        receiptToEdit: {
          id: "RCPT-2026-501",
          dbId: 501,
          status: "processed",
          invoiceNumber: "INV-501",
          date: "2026-11-22",
          tin: "123-456-789-000",
          vendorName: "Vendor",
          location: "Makati",
          categoryId: 1,
          vatClassification: "non-vat",
          currency: "USD",
          exchangeRate: 59.5,
          exchangeRateCurrency: "USD",
          convertedPhpAmount: 2975,
          amount: 50,
          subtotal: 50,
          vatAmount: 0,
          items: [],
        },
      },
      global: {
        stubs: {
          ConfirmModal: true,
          SegmentedReceiptUpload: true,
          ReceiptQualityRejectionModal: true,
          ReceiptImagePreview: true,
        },
      },
    });
    mountedWrappers.push(wrapper);
    await flushPromises();
    await nextTick();

    expect(wrapper.vm.editReceipts[0].exchangeRate).toBe(59.5);
    expect(wrapper.text()).toContain("≈ ₱2,975.00 PHP (1 USD = ₱59.50)");

    wrapper.vm.editReceipts[0].currency = "SGD";
    await flushPromises();
    await nextTick();

    expect(wrapper.vm.editReceipts[0].exchangeRate).toBeNull();
    expect(wrapper.text()).toContain("≈ ₱2,160.00 PHP (1 SGD = ₱43.20)");
  });

  it("displays original currency and PHP conversion caption on LiquidationSettlementForm view cards", () => {
    const wrapper = mount(LiquidationSettlementForm, {
      props: {
        selectedAdvance: {
          id: 1,
          purpose: "Intl Travel",
          balance: 5000,
          amount: 5000,
          status: "signed",
          acknowledgedAt: "2026-11-01",
        },
        disabled: true,
        receipts: [
          {
            id: 901,
            merchantName: "Hotel Tokyo",
            amount: 10000,
            currency: "JPY",
            exchangeRate: 0.38,
            status: "pending",
          },
        ],
        existingLiquidation: { id: 10, status: "pending", receipts: [] },
      },
      global: {
        stubs: {
          UnifiedRoadmapStepper: true,
          FileUpload: true,
          ReceiptImagePreview: true,
          StatusBadge: true,
          BaseReceiptDetailModal: true,
          SbsiReportDocumentEditor: true,
          BaseAuditTrail: true,
        },
      },
    });
    mountedWrappers.push(wrapper);

    expect(wrapper.text()).toContain("¥10,000.00");
    expect(
      wrapper.find('[data-testid="liquidation-card-php-conversion"]').text(),
    ).toContain("≈ ₱3,800.00 PHP (1 JPY = ₱0.38)");
  });

  it("keeps ReimbursementFormView summaryCurrency in PHP and sums mixed-currency receipts into PHP", async () => {
    const wrapper = mount(ReimbursementFormView, {
      props: {
        forwardedReceipts: [
          {
            id: 1,
            fileName: "r1.jpg",
            amount: 1000,
            currency: "PHP",
            date: "2026-11-22",
            categoryId: 1,
            eventType: "Client Meeting",
          },
          {
            id: 2,
            fileName: "r2.jpg",
            amount: 50,
            currency: "USD",
            exchangeRate: 58.5,
            exchangeRateCurrency: "USD",
            date: "2026-11-22",
            categoryId: 1,
            eventType: "Client Meeting",
          },
        ],
      },
      global: {
        stubs: {
          ReimbursementFormHeader: true,
          ReceiptsManagementHeader: true,
          ScannedReceiptsList: true,
          MetaAndAttachments: true,
          SegmentedReceiptUpload: true,
          ConfirmModal: true,
          ReceiptQualityRejectionModal: true,
        },
      },
    });
    mountedWrappers.push(wrapper);
    await flushPromises();

    expect(wrapper.vm.summaryCurrency).toBe("PHP");
    expect(wrapper.vm.totalAmount).toBe(3925);
    expect(wrapper.text()).toContain("₱3,925.00");
  });

  it("converts mixed-currency receipts to PHP in LiquidationsView totalExpenseAmount and acceptedReceiptTotal", async () => {
    const wrapper = mount(LiquidationsView, {
      global: {
        stubs: {
          BaseKpiGrid: true,
          BaseUtilityToolbar: true,
          LiquidationTable: true,
          LiquidationReviewModal: true,
          LiquidationReceiptModal: true,
          DecisionConfirmationModal: true,
          DeleteConfirmModal: true,
          BaseModal: true,
          LiquidationSettlementForm: true,
          ConfirmModal: true,
        },
      },
    });
    mountedWrappers.push(wrapper);
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith("/api/serms/currencies/rates");

    wrapper.vm.receipts = [
      { id: 1, amount: 1000, currency: "PHP", ocrData: { amount: 1000 } },
      {
        id: 2,
        amount: 50,
        currency: "USD",
        exchangeRate: 58.5,
        exchangeRateCurrency: "USD",
        ocrData: { amount: 50 },
      },
    ];
    await nextTick();
    expect(wrapper.vm.totalExpenseAmount).toBe(3925);

    const acceptedTotal = wrapper.vm.acceptedReceiptTotal(
      {},
      [
        { id: 1, amount: 50, currency: "USD", exchangeRate: 58.5, decision: "accepted" },
        { id: 2, amount: 100, currency: "SGD", decision: "rejected" },
        { id: 3, amount: 100, currency: "PHP", decision: "accepted" },
      ],
    );
    expect(acceptedTotal).toBe(3025);
  });
});
