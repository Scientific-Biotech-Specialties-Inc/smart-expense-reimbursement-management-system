import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { encryptPayload } from "../utils/crypto";

/**
 * Resolve an endpoint or path against the configured Auth Module URL.
 * Normalizes leading/trailing slashes and handles relative bases cleanly
 * to avoid protocol-relative URLs (e.g. "//logout" -> "http://logout/").
 *
 * @param {string} path - Target path on the auth module (e.g. "/login", "/logout")
 * @returns {string} Fully resolved URL or absolute path
 */
export function resolveAuthModuleUrl(path = "") {
  const rawBase = (import.meta.env.VITE_AUTH_MODULE_URL || "").trim();
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  // If empty or set to root path "/", resolve against current window origin
  if (!rawBase || rawBase === "/") {
    return typeof window !== "undefined" && window.location?.origin
      ? `${window.location.origin}${cleanPath}`
      : cleanPath;
  }

  // If accessed from a remote hostname (such as Cloudflare Tunnel or port-forwarded domain)
  // but rawBase is configured with localhost/127.0.0.1, dynamically adapt to current origin
  if (
    typeof window !== "undefined" &&
    window.location?.hostname &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    (rawBase.includes("localhost") || rawBase.includes("127.0.0.1"))
  ) {
    return `${window.location.origin}${cleanPath}`;
  }

  // If base starts with http:// or https://
  if (rawBase.startsWith("http://") || rawBase.startsWith("https://")) {
    const cleanBase = rawBase.replace(/\/+$/, "");
    return `${cleanBase}${cleanPath}`;
  }

  // Relative path base without scheme (e.g. "/auth")
  const cleanBase = rawBase.replace(/^\/+|\/+$/g, "");
  return typeof window !== "undefined" && window.location?.origin
    ? `${window.location.origin}/${cleanBase}${cleanPath}`
    : `/${cleanBase}${cleanPath}`;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref(null);
  const token = ref(localStorage.getItem("serms_token") || null);

  const isAuthenticated = computed(() => !!user.value);
  const isAdmin = computed(() => user.value?.is_admin === true);

  /**
   * Persist a JWT token received from the auth callback.
   * @param {string} newToken — the JWT token to store
   */
  function setToken(newToken) {
    token.value = newToken;
    localStorage.setItem("serms_token", newToken);
  }

  /**
   * Restore session from localStorage on app boot.
   * If a token exists but no user profile is cached, attempt to fetch it.
   */
  function restoreSession() {
    const stored = localStorage.getItem("serms_user");
    if (stored) {
      user.value = JSON.parse(stored);
    }
  }

  /**
   * Redirect the browser to the capstone-auth-module's login page.
   * The auth module will redirect back to /auth/callback?token=JWT after login.
   *
   * @param {string} [redirectPath] — the SERMS path to return to after login
   * @param {string} [errorMessage] — an optional error message to show on the login page
   */
  function redirectToLogin(redirectPath = "/dashboard", errorMessage = null) {
    const baseUrl = import.meta.env.BASE_URL || "/";
    const callbackPath = `${baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl}/auth/callback`;
    const callbackUrl = `${window.location.origin}${callbackPath}`;
    const baseLoginUrl = resolveAuthModuleUrl("/login");
    let loginUrl = `${baseLoginUrl}?redirect_uri=${encodeURIComponent(callbackUrl)}&state=${encodeURIComponent(redirectPath)}`;

    if (errorMessage) {
      loginUrl += `&error=${encodeURIComponent(errorMessage)}`;
    }

    window.location.href = loginUrl;
  }

  /**
   * Handle the callback from the capstone-auth-module.
   * Fetches the user profile from the SERMS API proxy.
   *
   * @returns {Promise<object>} — the user profile
   */
  async function handleCallback() {
    const profile = await fetchProfile();
    return profile;
  }

  /**
   * Fetch the authenticated user's profile from the SERMS API,
   * which proxies the request to the capstone-auth-module's /api/me endpoint.
   *
   * @returns {Promise<object>} — the user profile
   */
  async function fetchProfile() {
    const headers = {
      Accept: "application/json",
    };
    if (token.value) {
      headers["Authorization"] = `Bearer ${token.value}`;
    }

    const response = await fetch("/api/serms/auth/me", {
      headers,
      credentials: "include",
    });

    if (!response.ok) {
      // Token is invalid or expired — clear session
      clearSession();
      // Ensure redirect path is relative to the router base
      const baseUrl = import.meta.env.BASE_URL || "/";
      let currentPath = window.location.pathname;
      if (baseUrl !== "/" && currentPath.startsWith(baseUrl)) {
        currentPath = "/" + currentPath.slice(baseUrl.length);
      }
      redirectToLogin(currentPath + window.location.search, "Session expired. Please log in again.");
      throw new Error(
        "Failed to fetch user profile. Session may have expired.",
      );
    }

    const data = await response.json();
    user.value = data;
    localStorage.setItem("serms_user", JSON.stringify(user.value));
    return user.value;
  }

  /**
   * Log the user out: clear local state, then redirect to the
   * capstone-auth-module's logout endpoint to invalidate the token server-side.
   */
  function logout() {
    clearSession();

    // Redirect to auth module to clear server-side session.
    // We intentionally omit redirect_uri so it stays on the login screen and displays a success toast.
    const logoutUrl = resolveAuthModuleUrl("/logout");
    window.location.href = logoutUrl;
  }

  /**
   * Clear all local auth state without redirecting.
   */
  function clearSession() {
    user.value = null;
    token.value = null;
    localStorage.removeItem("serms_user");
    localStorage.removeItem("serms_token");
  }

  /**
   * Verify the user's password against the auth module.
   *
   * @param {string} password - The password to verify
   * @returns {Promise<boolean>} - True if verified, false otherwise
   */
  async function verifyPassword(password) {
    try {
      // Encrypt the password client-side (AES-256-GCM + RSA-OAEP wrapper) before
      // transmission, per SDD §5 / AGENTS.md payload-privacy requirement.
      const envelope = await encryptPayload(password);

      const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
      };
      if (token.value) {
        headers["Authorization"] = `Bearer ${token.value}`;
      }

      const response = await fetch(`/api/serms/auth/verify-password`, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(envelope),
      });

      // 422 (invalid) or any non-2xx → "Invalid password." toast (handled by caller).
      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.valid === true;
    } catch (error) {
      console.error("Password verification failed:", error);
      return false;
    }
  }

  return {
    user,
    isAuthenticated,
    isAdmin,
    token,
    setToken,
    restoreSession,
    redirectToLogin,
    handleCallback,
    fetchProfile,
    logout,
    clearSession,
    verifyPassword,
  };
});
