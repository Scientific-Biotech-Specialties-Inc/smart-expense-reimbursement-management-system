import { ref, toValue, watch } from "vue";
import { apiFetch } from "@/utils/apiFetch";
import { formatAmount } from "@/utils/formatters";

/**
 * Baseline fallback FX rates (1 unit of foreign currency -> PHP),
 * aligned with the backend currency_rates migration seeder.
 */
export const BASELINE_RATES_TO_PHP = Object.freeze({
  PHP: 1,
  USD: 58.5,
  SGD: 43.2,
  MYR: 13.1,
  BND: 43.2,
  JPY: 0.38,
  HKD: 7.5,
  THB: 1.68,
  AUD: 38.1,
  GBP: 73.8,
  EUR: 61.9,
  CAD: 41.8,
  CHF: 66.1,
  CNY: 8.1,
  KRW: 0.042,
  TWD: 1.81,
  INR: 0.69,
  AED: 15.93,
  NZD: 34.4,
});

// Singleton reactive rate map shared across the SPA so all modules stay consistent.
const ratesMap = ref({ ...BASELINE_RATES_TO_PHP });
const isLoadingRates = ref(false);
let activeFetchPromise = null;
const activeCurrencyPromises = new Map();

/**
 * Normalize a currency code to uppercase 3-letter format, defaulting to "PHP".
 */
export function normalizeCurrencyCode(code = "PHP") {
  const trimmed = String(code ?? "").trim().toUpperCase();
  return trimmed || "PHP";
}

/**
 * Return true when code represents a non-empty currency other than PHP.
 */
export function isForeignCurrency(code) {
  if (code === null || code === undefined) return false;
  const normalized = String(code).trim().toUpperCase();
  return normalized.length > 0 && normalized !== "PHP";
}

/**
 * Extract normalized FX snapshot properties from a raw API or draft receipt object.
 */
export function extractReceiptFxSnapshot(rawReceipt, fallbackCurrency = "") {
  if (!rawReceipt || typeof rawReceipt !== "object") {
    return {
      exchangeRate: null,
      exchangeRateCurrency: null,
      convertedPhpAmount: null,
      exchangeRateDate: null,
      exchangeRateSource: null,
    };
  }

  const rawRate = rawReceipt.exchangeRate ?? rawReceipt.exchange_rate;
  const parsedRate =
    rawRate !== null && rawRate !== undefined && rawRate !== ""
      ? Number(rawRate)
      : NaN;
  const exchangeRate =
    Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null;

  const rawCurrency =
    rawReceipt.exchangeRateCurrency ??
    rawReceipt.exchange_rate_currency ??
    rawReceipt.currency ??
    fallbackCurrency;
  const normalizedCurrency = String(rawCurrency ?? "").trim().toUpperCase();

  const rawConverted =
    rawReceipt.convertedPhpAmount ?? rawReceipt.converted_php_amount;
  const parsedConverted =
    rawConverted !== null && rawConverted !== undefined && rawConverted !== ""
      ? Number(rawConverted)
      : NaN;
  const convertedPhpAmount = Number.isFinite(parsedConverted)
    ? parsedConverted
    : null;

  return {
    exchangeRate,
    exchangeRateCurrency:
      exchangeRate !== null && normalizedCurrency ? normalizedCurrency : null,
    convertedPhpAmount,
    exchangeRateDate:
      rawReceipt.exchangeRateDate ?? rawReceipt.exchange_rate_date ?? null,
    exchangeRateSource:
      rawReceipt.exchangeRateSource ?? rawReceipt.exchange_rate_source ?? null,
  };
}

/**
 * Resolve a receipt's persisted exchange rate only when it matches the receipt's current currency.
 */
export function resolveReceiptExchangeRate(receipt) {
  if (!receipt || typeof receipt !== "object") return null;
  const currency = normalizeCurrencyCode(
    receipt.currency ?? receipt.ocrData?.currency ?? "PHP",
  );
  if (!isForeignCurrency(currency)) return 1;

  const rateCurrency =
    receipt.exchangeRateCurrency ?? receipt.exchange_rate_currency;
  if (rateCurrency && normalizeCurrencyCode(rateCurrency) !== currency) {
    return null;
  }

  const rawRate =
    receipt.exchangeRate ??
    receipt.exchange_rate ??
    receipt.ocrData?.exchange_rate ??
    receipt.ocrData?.exchangeRate;
  if (rawRate === null || rawRate === undefined || rawRate === "") {
    return null;
  }

  const numeric = Number(rawRate);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

/**
 * Clear stale FX snapshot metadata on an editable receipt after its currency changes.
 */
export function clearReceiptExchangeRateSnapshot(receipt) {
  if (!receipt || typeof receipt !== "object") return;
  receipt.exchangeRate = null;
  receipt.exchange_rate = null;
  receipt.exchangeRateCurrency = null;
  receipt.convertedPhpAmount = null;
  receipt.converted_php_amount = null;
  receipt.exchangeRateDate = null;
  receipt.exchange_rate_date = null;
  receipt.exchangeRateSource = null;
  receipt.exchange_rate_source = null;

  if (receipt.ocrData && typeof receipt.ocrData === "object") {
    receipt.ocrData.exchange_rate = null;
    receipt.ocrData.converted_php_amount = null;
    receipt.ocrData.exchange_rate_date = null;
    receipt.ocrData.exchange_rate_source = null;
  }
}

/**
 * Extract and apply currency rate entries from backend API payloads into ratesMap.
 */
function applyRatesPayload(payload) {
  if (!payload || typeof payload !== "object") return;

  const updates = {};
  const recordRate = (code, rate) => {
    const normalized = String(code ?? "").trim().toUpperCase();
    const numeric = Number(rate);
    if (/^[A-Z]{3}$/.test(normalized) && Number.isFinite(numeric) && numeric > 0) {
      updates[normalized] = numeric;
    }
  };

  const list = Array.isArray(payload.rates)
    ? payload.rates
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload)
        ? payload
        : null;

  if (list) {
    for (const entry of list) {
      if (!entry || typeof entry !== "object") continue;
      recordRate(
        entry.currency_code ?? entry.currencyCode ?? entry.code,
        entry.rate_to_php ?? entry.rateToPhp ?? entry.rate,
      );
    }
  } else if (payload.rates && typeof payload.rates === "object") {
    for (const [code, rate] of Object.entries(payload.rates)) {
      recordRate(code, rate);
    }
  }

  if (payload.rate && typeof payload.rate === "object") {
    recordRate(
      payload.rate.currency_code ?? payload.rate.currencyCode ?? payload.rate.code,
      payload.rate.rate_to_php ?? payload.rate.rateToPhp ?? payload.rate.rate,
    );
  }

  if (Object.keys(updates).length > 0) {
    ratesMap.value = { ...ratesMap.value, ...updates };
  }
}

/**
 * Fetch all cached currency rates from the backend, deduplicating concurrent requests.
 */
async function fetchRates() {
  if (activeFetchPromise) return activeFetchPromise;

  isLoadingRates.value = true;
  activeFetchPromise = (async () => {
    try {
      const response = await apiFetch("/api/serms/currencies/rates");
      if (response && response.ok) {
        const payload = await response.json();
        applyRatesPayload(payload);
      }
    } catch (error) {
      // Keep baseline/cached rates if API fails or unit test environment omits Pinia/fetch mocks.
      console.warn(
        "[useCurrencyRates] Failed to fetch currency rates; retaining fallback rates.",
        error,
      );
    } finally {
      isLoadingRates.value = false;
      activeFetchPromise = null;
    }
    return ratesMap.value;
  })();

  return activeFetchPromise;
}

/**
 * Fetch and cache a single missing 3-letter currency code on demand.
 */
async function ensureCurrencyRate(code) {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) return null;
  if (normalized === "PHP") return 1;

  const existing = Number(ratesMap.value[normalized]);
  if (Number.isFinite(existing) && existing > 0) {
    return existing;
  }

  if (activeCurrencyPromises.has(normalized)) {
    return activeCurrencyPromises.get(normalized);
  }

  const promise = (async () => {
    try {
      const response = await apiFetch(
        `/api/serms/currencies/rates?currency=${encodeURIComponent(normalized)}`,
      );
      if (response && response.ok) {
        const payload = await response.json();
        applyRatesPayload(payload);
      }
    } catch (error) {
      console.warn(
        `[useCurrencyRates] Failed to ensure currency rate for ${normalized}.`,
        error,
      );
    } finally {
      activeCurrencyPromises.delete(normalized);
    }
    const resolved = Number(ratesMap.value[normalized]);
    return Number.isFinite(resolved) && resolved > 0 ? resolved : null;
  })();

  activeCurrencyPromises.set(normalized, promise);
  return promise;
}

/**
 * Resolve the PHP multiplier for a given currency code, honoring an explicit positive override rate.
 */
function getRateToPhp(code = "PHP", overrideRate = null) {
  if (!isForeignCurrency(code)) return 1;

  const normalized = normalizeCurrencyCode(code);
  if (
    overrideRate !== null &&
    overrideRate !== undefined &&
    overrideRate !== ""
  ) {
    const override = Number(overrideRate);
    if (Number.isFinite(override) && override > 0) {
      return override;
    }
  }

  const mapped = Number(ratesMap.value[normalized]);
  return Number.isFinite(mapped) && mapped > 0 ? mapped : null;
}

/**
 * Convert an amount in `code` to PHP rounded to 2 decimal places, or null if the rate is unavailable.
 */
function getConvertedPhpAmount(amount, code = "PHP", overrideRate = null) {
  const numericAmount = Number(amount || 0);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;

  if (!isForeignCurrency(code)) {
    return Number(safeAmount.toFixed(2));
  }

  const rate = getRateToPhp(code, overrideRate);
  if (rate === null) return null;

  return Number((safeAmount * rate).toFixed(2));
}

/**
 * Build a read-only conversion caption for foreign currency receipts, or empty string for PHP.
 */
function formatPhpConversionLabel(amount, code = "PHP", overrideRate = null) {
  if (!isForeignCurrency(code)) return "";

  const normalized = normalizeCurrencyCode(code);
  const rate = getRateToPhp(normalized, overrideRate);
  if (rate === null) {
    return `Conversion rate unavailable for ${normalized}`;
  }

  const converted = getConvertedPhpAmount(amount, normalized, rate);
  return `≈ ${formatAmount(converted, "PHP")} PHP (1 ${normalized} = ${formatAmount(rate, "PHP")})`;
}

/**
 * Sum a list of receipts into PHP using each receipt's currency and locked/live FX rate.
 */
function sumReceiptsPhpAmount(receiptList = [], amountGetter = null) {
  if (!Array.isArray(receiptList)) return 0;

  const total = receiptList.reduce((acc, receipt) => {
    if (!receipt) return acc;
    const rawAmount = amountGetter
      ? amountGetter(receipt)
      : (receipt.amount ?? receipt.total_amount ?? receipt.ocrData?.amount ?? 0);
    const currency = receipt.currency ?? receipt.ocrData?.currency ?? "PHP";
    const converted = getConvertedPhpAmount(
      rawAmount,
      currency,
      resolveReceiptExchangeRate(receipt),
    );
    const fallbackAmount = Number(rawAmount) || 0;
    return acc + (converted ?? fallbackAmount);
  }, 0);

  return Number(total.toFixed(2));
}

/**
 * Watch a reactive receipt list for user currency edits, clearing stale FX snapshots and fetching missing rates.
 */
export function useReceiptCurrencyWatcher(receiptsSource) {
  let prevCurrencyByReceipt = new WeakMap();

  watch(
    () =>
      (toValue(receiptsSource) || []).map((receipt) => [
        receipt,
        String(receipt?.currency ?? "").trim().toUpperCase(),
      ]),
    (entries) => {
      const nextMap = new WeakMap();
      for (const [receipt, nextCode] of entries) {
        if (!receipt || typeof receipt !== "object") continue;
        const hadPrev = prevCurrencyByReceipt.has(receipt);
        const prevCode = prevCurrencyByReceipt.get(receipt);

        if (hadPrev && prevCode !== nextCode) {
          clearReceiptExchangeRateSnapshot(receipt);
          if (receipt.ocrData && typeof receipt.ocrData === "object") {
            receipt.ocrData.currency = receipt.currency;
          }
        }

        if (isForeignCurrency(nextCode)) {
          ensureCurrencyRate(nextCode);
        }

        nextMap.set(receipt, nextCode);
      }
      prevCurrencyByReceipt = nextMap;
    },
    { immediate: true },
  );
}

/**
 * Singleton composable for FX rates and PHP conversion helpers across SERMS.
 */
export function useCurrencyRates() {
  return {
    ratesMap,
    isLoadingRates,
    fetchRates,
    ensureCurrencyRate,
    isForeignCurrency,
    getRateToPhp,
    getConvertedPhpAmount,
    formatPhpConversionLabel,
    sumReceiptsPhpAmount,
  };
}
