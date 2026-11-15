import { computed, ref, toValue } from "vue";

/**
 * Normalize a request status string for case-insensitive matching.
 *
 * @param {string | null | undefined} status
 * @returns {string}
 */
export function normalizeRevisionStatus(status) {
  return String(status || "")
    .toLowerCase()
    .trim()
    .replace(/[\s/_-]+/g, "-");
}

/**
 * Whether the given status requires admin revision before resubmission.
 *
 * @param {string | null | undefined} status
 * @returns {boolean}
 */
export function isRevisionStatus(status) {
  return normalizeRevisionStatus(status) === "revise";
}

export function isManualReportTemplate(templateData) {
  return (
    Boolean(templateData) &&
    typeof templateData === "object" &&
    String(templateData.mode || "").trim().toLowerCase() === "manual"
  );
}

function isFileLike(val) {
  return typeof File !== "undefined" && val instanceof File;
}

/**
 * Produce a deterministic descriptor for file attachments (File upload, stored path, or ref object).
 * Distinguishes new File uploads from existing string paths even if the filename matches.
 *
 * @param {File | string | object | Array | null | undefined} file
 * @returns {unknown}
 */
export function serializeFileAttachment(file) {
  if (file === null || file === undefined || file === "") return null;
  if (Array.isArray(file)) return file.map(serializeFileAttachment);
  if (isFileLike(file)) {
    return {
      __type: "file",
      name: file.name || "",
      size: Number(file.size || 0),
      lastModified: Number(file.lastModified || 0),
      mime: file.type || "",
    };
  }
  if (typeof file === "object") {
    return {
      __type: "ref",
      name: file.name || file.fileName || "",
      path: file.file_path ?? file.filePath ?? null,
      isExisting: Boolean(file.isExisting),
    };
  }
  return {
    __type: "path",
    path: String(file),
  };
}

function normalizeNumberField(val) {
  if (val === "" || val === null || val === undefined) return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : String(val);
}

/**
 * Normalize a list of scanned/manual receipt objects into a canonical snapshot structure.
 *
 * @param {Array<object> | null | undefined} receipts
 * @returns {Array<object>}
 */
export function serializeReceiptList(receipts) {
  if (!Array.isArray(receipts)) return [];
  return receipts.map((r) => {
    const discountType =
      !r?.discountType || String(r.discountType).toLowerCase() === "none"
        ? ""
        : String(r.discountType).toLowerCase();
    const rawDiscountAmount = normalizeNumberField(r?.discountAmount);
    const discountAmount =
      !discountType && (rawDiscountAmount === null || rawDiscountAmount === 0)
        ? null
        : rawDiscountAmount;

    return {
      id: r?.id ?? null,
      name: r?.name ?? "",
      fileName: r?.fileName ?? "",
      merchantName: r?.merchantName ?? "",
      date: r?.date ?? "",
      tin: r?.tin ?? "",
      invoiceNumber: r?.invoiceNumber ?? "",
      location: r?.location ?? "",
      currency: r?.currency ?? "",
      vatClassification: String(r?.vatClassification ?? "").toLowerCase(),
      category: r?.category ?? "",
      categoryId: r?.categoryId ?? null,
      eventType: r?.eventType ?? "",
      discountType,
      discountAmount,
      subtotal: normalizeNumberField(r?.subtotal),
      tax: normalizeNumberField(r?.tax),
      amount: normalizeNumberField(r?.amount),
      filePath: r?.filePath ?? null,
      rawFile: serializeFileAttachment(r?.file ?? r?.rawFile ?? null),
      items: Array.isArray(r?.items)
        ? r.items.map((item) => ({
            name: item?.name ?? "",
            qty: normalizeNumberField(item?.qty),
            price: normalizeNumberField(item?.price),
          }))
        : [],
    };
  });
}

/**
 * Strip UI-only internal metadata flags (such as descriptionEdited) from report template data
 * so reverting an edited breakdown description matches its original baseline.
 *
 * @param {object | null | undefined} templateData
 * @returns {object | null}
 */
export function serializeTemplateData(templateData) {
  if (!templateData || typeof templateData !== "object") {
    return templateData ?? null;
  }
  const cloned = { ...templateData };
  if (Array.isArray(cloned.breakdownItems)) {
    cloned.breakdownItems = cloned.breakdownItems.map((item) => {
      if (!item || typeof item !== "object") return item;
      const { descriptionEdited: _ignored, ...rest } = item;
      return rest;
    });
  }
  return cloned;
}

/**
 * Recursively convert any value into a deterministic JSON-serializable value with sorted keys.
 *
 * @param {unknown} val
 * @returns {unknown}
 */
export function canonicalizeSnapshot(val) {
  if (val === null || val === undefined) return null;
  if (isFileLike(val)) return serializeFileAttachment(val);
  if (Array.isArray(val)) return val.map(canonicalizeSnapshot);
  if (typeof val === "object") {
    const out = {};
    for (const key of Object.keys(val).sort()) {
      const prop = val[key];
      if (prop !== undefined) {
        out[key] = canonicalizeSnapshot(prop);
      }
    }
    return out;
  }
  return val;
}

/**
 * Track baseline vs current snapshot to keep submit/update buttons disabled in "revise" mode
 * until at least one field, receipt, or attachment actually changes.
 *
 * @param {object} options
 * @param {import("vue").MaybeRefOrGetter<boolean>} options.isRevise
 * @param {() => unknown} options.getSnapshot
 * @returns {{
 *   baselineSnapshot: import("vue").Ref<string | null>,
 *   hasBaseline: import("vue").ComputedRef<boolean>,
 *   isDirtyFromBaseline: import("vue").ComputedRef<boolean>,
 *   hasRevisionChanges: import("vue").ComputedRef<boolean>,
 *   isRevisionUnchanged: import("vue").ComputedRef<boolean>,
 *   captureBaseline: () => void,
 *   clearBaseline: () => void,
 * }}
 */
export function useRevisionGuard({ isRevise, getSnapshot }) {
  const baselineSnapshot = ref(null);
  const isReviseMode = computed(() => Boolean(toValue(isRevise)));
  const hasBaseline = computed(() => baselineSnapshot.value !== null);

  const currentSnapshot = computed(() =>
    JSON.stringify(canonicalizeSnapshot(getSnapshot())),
  );

  const isDirtyFromBaseline = computed(
    () =>
      baselineSnapshot.value !== null &&
      currentSnapshot.value !== baselineSnapshot.value,
  );

  const hasRevisionChanges = computed(() => {
    if (!isReviseMode.value) return true;
    if (baselineSnapshot.value === null) return false;
    return currentSnapshot.value !== baselineSnapshot.value;
  });

  const isRevisionUnchanged = computed(
    () => isReviseMode.value && !hasRevisionChanges.value,
  );

  function captureBaseline() {
    baselineSnapshot.value = JSON.stringify(canonicalizeSnapshot(getSnapshot()));
  }

  function clearBaseline() {
    baselineSnapshot.value = null;
  }

  return {
    baselineSnapshot,
    hasBaseline,
    isDirtyFromBaseline,
    hasRevisionChanges,
    isRevisionUnchanged,
    captureBaseline,
    clearBaseline,
  };
}
