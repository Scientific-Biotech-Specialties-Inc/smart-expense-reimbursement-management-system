import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const SERMS_DEV_NONCE_PLACEHOLDER = '__SERMS_CSP_NONCE_TOKEN__'

export const PROD_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self' data:; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co; frame-src 'self' blob: https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';"

export function buildDevCsp(nonce) {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; font-src 'self' data:; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' ws://localhost:5173 ws://localhost:5002 wss://localhost:5173 wss://localhost:5002 https://*.supabase.co; frame-src 'self' blob: https://*.supabase.co; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self';`
}

function buildSecurityHeaders(csp) {
  return {
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': csp,
  }
}

export function isSuspiciousDevRequest(rawUrl = '') {
  if (!rawUrl) return false
  const lower = rawUrl.toLowerCase()
  if (
    lower.includes('..') ||
    lower.includes('%2e%2e') ||
    lower.includes('%252e') ||
    lower.includes('\\') ||
    lower.includes('%5c') ||
    lower.includes('\0') ||
    lower.includes('%00')
  ) {
    return true
  }

  const [pathname, search = ''] = rawUrl.split('?')
  if (pathname.includes('/node_modules/.vite/') && search) {
    const params = new URLSearchParams(search)
    const v = params.get('v')
    if (v !== null && !/^[a-zA-Z0-9_-]+$/.test(v)) {
      return true
    }
  }

  return false
}

function sermsSecurityDevPlugin() {
  return {
    name: 'serms-security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const nonce = crypto.randomBytes(16).toString('base64')
        const devHeaders = buildSecurityHeaders(buildDevCsp(nonce))

        for (const [key, value] of Object.entries(devHeaders)) {
          res.setHeader(key, value)
        }

        const origSetHeader = res.setHeader.bind(res)
        res.setHeader = (name, value) => {
          if (String(name).toLowerCase() === 'content-security-policy') {
            return origSetHeader(name, devHeaders['Content-Security-Policy'])
          }
          return origSetHeader(name, value)
        }

        const origWrite = res.write.bind(res)
        const origEnd = res.end.bind(res)
        const htmlChunks = []
        let interceptingHtml = false

        const isHtmlResponse = () => {
          const ct = String(res.getHeader('content-type') || '').toLowerCase()
          return ct.includes('text/html')
        }

        res.write = (chunk, encoding, cb) => {
          if (chunk && (interceptingHtml || isHtmlResponse())) {
            interceptingHtml = true
            htmlChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || 'utf8'))
            if (typeof cb === 'function') cb()
            return true
          }
          return origWrite(chunk, encoding, cb)
        }

        res.end = (chunk, encoding, cb) => {
          if (typeof chunk === 'function') {
            cb = chunk
            chunk = undefined
          }
          if (typeof encoding === 'function') {
            cb = encoding
            encoding = undefined
          }

          if (interceptingHtml || (chunk && isHtmlResponse())) {
            if (chunk) {
              htmlChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding || 'utf8'))
            }
            const html = Buffer.concat(htmlChunks).toString('utf8').replaceAll(SERMS_DEV_NONCE_PLACEHOLDER, nonce)
            const outBuf = Buffer.from(html, 'utf8')
            if (res.getHeader('content-length') !== undefined) {
              origSetHeader('Content-Length', outBuf.length)
            }
            return origEnd(outBuf, cb)
          }

          return origEnd(chunk, encoding, cb)
        }

        if (isSuspiciousDevRequest(req.url)) {
          res.statusCode = 400
          origSetHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ message: 'Invalid request path.' }))
          return
        }

        next()
      })
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_TARGET || env.VITE_API_URL || 'http://api:8000'
  const devHeaders = buildSecurityHeaders(buildDevCsp(SERMS_DEV_NONCE_PLACEHOLDER))
  const previewHeaders = buildSecurityHeaders(PROD_CSP)

  return {
    base: '/serms/',
    plugins: [vue(), sermsSecurityDevPlugin()],
    ...(command === 'serve' ? { html: { cspNonce: SERMS_DEV_NONCE_PLACEHOLDER } } : {}),
    resolve: {
      alias: {
        '@':
          typeof window === 'undefined' && import.meta.url.startsWith('file://')
            ? fileURLToPath(new URL('./src', import.meta.url))
            : path.resolve(process.cwd(), 'src')
      }
    },
    esbuild: {
      legalComments: 'none',
    },
    build: {
      minify: 'esbuild',
    },
    server: {
      host: '0.0.0.0',
      port: 5002,
      allowedHosts: true,
      cors: false,
      headers: devHeaders,
      watch: {
        usePolling: true,
        interval: 100
      },
      proxy: {
        '/api/serms': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api\/serms/, '/api')
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port: 5002,
      allowedHosts: true,
      cors: false,
      headers: previewHeaders,
    }
  }
})
