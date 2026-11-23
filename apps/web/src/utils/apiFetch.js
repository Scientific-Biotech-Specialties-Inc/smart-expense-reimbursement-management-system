import { useAuthStore } from '../stores/auth'

/**
 * A wrapper around the native fetch API that automatically adds the Authorization header
 * and globally intercepts 401 Unauthorized responses to log the user out.
 *
 * @param {string} url - The URL to fetch.
 * @param {RequestInit} [options={}] - Fetch options.
 * @returns {Promise<Response>} - The fetch response.
 */
export async function apiFetch(url, options = {}) {
  const authStore = useAuthStore()
  
  const headers = new Headers(options.headers || {})

  const method = (options.method || 'GET').toUpperCase()
  const isMutatingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

  if (isMutatingMethod && !headers.has('X-Idempotency-Key')) {
    const customKey =
      options.idempotencyKey ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : null)
    if (customKey) {
      headers.set('X-Idempotency-Key', customKey)
    }
  }

  if (authStore.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${authStore.token}`)
  }
  
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }
  
  if (options.body && !(options.body instanceof FormData)) {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
  }

  const fetchOptions = {
    credentials: 'include',
    ...options,
    headers,
  }

  const response = await fetch(url, fetchOptions)

  if (response.status === 401) {
    authStore.clearSession()
    authStore.redirectToLogin(
      window.location.pathname + window.location.search,
      "Session expired. Please log in again."
    )
    throw new Error('Unauthorized')
  }

  return response
}
