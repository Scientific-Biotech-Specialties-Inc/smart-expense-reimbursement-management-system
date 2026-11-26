<template>
  <div class="min-h-screen flex items-center justify-center bg-[#f8f9fa]">
    <div class="flex flex-col items-center gap-5">
      <div class="w-12 h-12 border-[3px] border-[#6366f1] border-t-transparent border-r-transparent rounded-full animate-spin opacity-80"></div>
      <p class="text-[15px] font-medium text-slate-600">
        Loading Smart Expense Reimbursement Management System...
      </p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

onMounted(async () => {
  let redirectPath = route.query.state || '/dashboard'
  const baseUrl = import.meta.env.BASE_URL || '/';
  if (baseUrl !== '/' && redirectPath.startsWith(baseUrl)) {
    redirectPath = '/' + redirectPath.slice(baseUrl.length);
  }
  const message = route.query.message

  if (message) {
    redirectPath += (redirectPath.includes('?') ? '&' : '?') + 'message=' + encodeURIComponent(message)
  }

  const token = route.query.token
  if (token) {
    auth.setToken(Array.isArray(token) ? token[0] : token)
    // Strip sensitive token from the browser URL immediately before async calls.
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const cleanUrl = new URL(window.location.href)
      cleanUrl.searchParams.delete('token')
      window.history.replaceState(window.history.state, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash)
    }
  }

  try {
    await auth.handleCallback()
    router.replace(redirectPath)
  } catch (e) {
    auth.redirectToLogin(redirectPath, e.message || 'Authentication failed.')
  }
})
</script>
