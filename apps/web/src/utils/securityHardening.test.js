// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import viteConfigFactory, { isSuspiciousDevRequest } from '../../vite.config.js'
import AuthCallbackView from '../views/AuthCallbackView.vue'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '../..')

const mockReplace = vi.fn()
const mockHandleCallback = vi.fn()
const mockSetToken = vi.fn()
const mockRedirectToLogin = vi.fn()
let mockRouteQuery = {}

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useRoute: () => ({ query: mockRouteQuery }),
}))

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    setToken: mockSetToken,
    handleCallback: mockHandleCallback,
    redirectToLogin: mockRedirectToLogin,
  }),
}))

describe('SERMS Frontend Security Hardening', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockRouteQuery = {}
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('disables permissive CORS and sets strict CSP without unsafe-inline, wildcards, or missing form-action', () => {
    const config = viteConfigFactory({ command: 'serve', mode: 'development' })
    const buildConfig = viteConfigFactory({ command: 'build', mode: 'production' })

    expect(config.server.cors).toBe(false)
    expect(config.preview.cors).toBe(false)
    expect(config.html?.cspNonce).toBeTruthy()
    expect(buildConfig.html?.cspNonce).toBeUndefined()

    for (const headers of [config.server.headers, config.preview.headers]) {
      expect(headers['X-Frame-Options']).toBe('SAMEORIGIN')
      expect(headers['X-Content-Type-Options']).toBe('nosniff')
      expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()')
      const csp = headers['Content-Security-Policy']
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'self'")
      expect(csp).toContain("form-action 'self'")
      expect(csp).not.toContain('unsafe-inline')
      expect(csp).not.toContain('unsafe-eval')
      expect(csp).not.toMatch(/\bwss?:(?!\/\/)/)
      expect(csp).not.toContain('fonts.googleapis.com')
    }
  })

  it('rejects path traversal probes and suspicious ?v= query parameters in Vite dev middleware', () => {
    expect(
      isSuspiciousDevRequest('/serms/node_modules/.vite/deps/class-variance-authority.js?v=%2Fclass-variance-authority.js')
    ).toBe(true)
    expect(isSuspiciousDevRequest('/serms/../../../etc/passwd')).toBe(true)
    expect(isSuspiciousDevRequest('/serms/%2e%2e/secret')).toBe(true)
    expect(isSuspiciousDevRequest('/serms/file%00.js')).toBe(true)

    expect(isSuspiciousDevRequest('/serms/node_modules/.vite/deps/pinia.js?v=4d63a7ca')).toBe(false)
    expect(isSuspiciousDevRequest('/serms/src/main.js')).toBe(false)
    expect(isSuspiciousDevRequest('/serms/auth/callback?state=/serms/dashboard')).toBe(false)
  })

  it('self-hosts fonts without external CDN links lacking SRI attributes', () => {
    const indexHtml = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8')
    const indexCss = fs.readFileSync(path.join(webRoot, 'src/assets/index.css'), 'utf8')
    const fontsCss = fs.readFileSync(path.join(webRoot, 'src/assets/fonts.css'), 'utf8')

    expect(indexHtml).not.toContain('fonts.googleapis.com')
    expect(indexHtml).not.toContain('fonts.gstatic.com')
    expect(indexCss).not.toContain('fonts.googleapis.com')
    expect(indexCss).toContain('@import "./fonts.css"')
    expect(fontsCss).toContain('./fonts/poppins-latin-400.woff2')
    expect(fs.existsSync(path.join(webRoot, 'src/assets/fonts/poppins-latin-400.woff2'))).toBe(true)
  })

  it('strips sensitive ?token= from the browser URL immediately in AuthCallbackView', async () => {
    window.history.replaceState({}, '', '/serms/auth/callback?token=secret-jwt-value&state=/dashboard')
    mockRouteQuery = { token: 'secret-jwt-value', state: '/dashboard' }

    let hrefDuringCallback = ''
    mockHandleCallback.mockImplementation(async () => {
      hrefDuringCallback = window.location.href
      return { id: 1 }
    })

    mount(AuthCallbackView)
    await flushPromises()

    expect(mockSetToken).toHaveBeenCalledWith('secret-jwt-value')
    expect(hrefDuringCallback).not.toContain('secret-jwt-value')
    expect(hrefDuringCallback).not.toContain('token=')
    expect(mockReplace).toHaveBeenCalledWith('/dashboard')
  })

  it('hardens SERMS nginx configs with server_tokens off and security headers', () => {
    const repoRoot = path.resolve(webRoot, '../..')
    for (const relPath of ['nginx/nginx.conf', 'nginx-proxy.conf', 'apps/web/nginx.conf']) {
      const conf = fs.readFileSync(path.join(repoRoot, relPath), 'utf8')
      expect(conf).toContain('server_tokens off;')
      expect(conf).toContain('X-Frame-Options "SAMEORIGIN"')
      expect(conf).toContain('X-Content-Type-Options "nosniff"')
      expect(conf).toContain('Content-Security-Policy')
      expect(conf).toContain("form-action 'self'")
      expect(conf).not.toContain('fonts.googleapis.com')
      expect(conf).not.toContain('unsafe-inline')
      expect(conf).not.toContain('unsafe-eval')
      expect(conf).not.toMatch(/\bwss?:(?!\/\/)/)
    }
  })
})
