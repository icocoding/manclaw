import type { ApiResponse } from '@manclaw/shared'

import { getStoredAccessToken } from './access-token'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.trim() || ''

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {})
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const accessToken = typeof window === 'undefined' ? undefined : getStoredAccessToken()
  if (accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...init,
  })

  const payload = (await response.json()) as ApiResponse<T>

  if (!response.ok || !payload.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? `Request failed: ${response.status}`)
  }

  return payload.data
}

export { API_BASE_URL }
