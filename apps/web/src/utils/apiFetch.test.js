import { describe, it, expect, vi, beforeEach } from 'vitest'
import { apiFetch } from './apiFetch'

vi.mock('../stores/auth', () => ({
  useAuthStore: () => ({
    token: 'test-bearer-token',
    clearSession: vi.fn(),
    redirectToLogin: vi.fn(),
  }),
}))

describe('apiFetch Idempotency Key Injection', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
  })

  it('attaches X-Idempotency-Key with UUID format on POST request', async () => {
    await apiFetch('/api/serms/cash-advances', {
      method: 'POST',
      body: JSON.stringify({ amount: 100 }),
    })

    expect(global.fetch).toHaveBeenCalled()
    const callArgs = global.fetch.mock.calls[0]
    const headers = callArgs[1].headers

    const key = headers.get('X-Idempotency-Key')
    expect(key).toBeTruthy()
    // Verify standard UUID format (8-4-4-4-12 hex)
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  })

  it('omits X-Idempotency-Key on safe GET request', async () => {
    await apiFetch('/api/serms/cash-advances', {
      method: 'GET',
    })

    const callArgs = global.fetch.mock.calls[0]
    const headers = callArgs[1].headers

    expect(headers.has('X-Idempotency-Key')).toBe(false)
  })

  it('respects caller provided custom idempotencyKey', async () => {
    await apiFetch('/api/serms/reimbursements', {
      method: 'POST',
      idempotencyKey: 'custom-session-key-456',
      body: JSON.stringify({ amount: 50 }),
    })

    const callArgs = global.fetch.mock.calls[0]
    const headers = callArgs[1].headers

    expect(headers.get('X-Idempotency-Key')).toBe('custom-session-key-456')
  })
})
