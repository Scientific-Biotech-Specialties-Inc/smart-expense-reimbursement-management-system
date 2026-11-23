import { watch } from "vue";
import * as vueRouter from "vue-router";
import { apiFetch } from "@/utils/apiFetch";
import { useToast } from "@/composables/useToast";

export function useNotificationDeepLink({
  verifyUrl,
  onOpenRecord,
  queryKey = "view",
}) {
  let route = null;
  let router = null;

  try {
    route = typeof vueRouter.useRoute === "function" ? vueRouter.useRoute() : null;
  } catch {
    route = null;
  }

  try {
    router = typeof vueRouter.useRouter === "function" ? vueRouter.useRouter() : null;
  } catch {
    router = null;
  }

  const { addToast } = useToast();

  function clearQueryParam() {
    if (!route?.query || !(queryKey in route.query)) return;
    const nextQuery = { ...route.query };
    delete nextQuery[queryKey];
    if (router?.replace) {
      router.replace({ query: nextQuery });
    }
  }

  async function checkDeepLink() {
    const rawId = route?.query?.[queryKey];
    if (!rawId) return;

    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    clearQueryParam();

    try {
      const res = await apiFetch(verifyUrl(id));
      if (res.status === 403) {
        addToast({
          message: "Access denied. You do not have permission to view this record.",
          type: "error",
        });
        return;
      }
      if (!res.ok) {
        addToast({
          message: "Unable to open the requested record.",
          type: "error",
        });
        return;
      }
      const payload = await res.json();
      const record = payload?.data ?? payload;
      await onOpenRecord(record, id);
    } catch {
      addToast({
        message: "Access denied. You do not have permission to view this record.",
        type: "error",
      });
    }
  }

  if (route) {
    watch(
      () => route.query?.[queryKey],
      (val) => {
        if (val) {
          checkDeepLink();
        }
      },
    );
  }

  return { checkDeepLink };
}
