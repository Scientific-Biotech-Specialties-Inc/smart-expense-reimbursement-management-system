import { ref, watch } from "vue";

const STORAGE_KEY = "serms_ocr_mock_mode";

const shared = ref(false);
let initialized = false;

function readStored() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStored(value) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value ? "1" : "0");
  } catch {
    // Storage unavailable (SSR/tests) — keep in-memory value only.
  }
}

export function useOcrMode() {
  if (!initialized) {
    shared.value = readStored();
    initialized = true;
  }

  function setMockMode(value) {
    shared.value = Boolean(value);
    writeStored(shared.value);
  }

  function toggleMockMode() {
    setMockMode(!shared.value);
  }

  watch(shared, (next) => writeStored(next));

  return {
    isMockOcr: shared,
    setMockMode,
    toggleMockMode,
  };
}
