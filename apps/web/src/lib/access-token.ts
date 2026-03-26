const ACCESS_TOKEN_STORAGE_KEY = 'manclaw.access-token'

function readTokenFromHash(): string | undefined {
  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
  const params = new URLSearchParams(hash)
  const token = params.get('token')?.trim()
  return token || undefined
}

function readTokenFromQuery(): string | undefined {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')?.trim()
  return token || undefined
}

export function getStoredAccessToken(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const token = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)?.trim()
  return token || undefined
}

export function storeAccessToken(token: string): void {
  if (typeof window === 'undefined') {
    return
  }

  const normalized = token.trim()
  if (!normalized) {
    return
  }

  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, normalized)
}

export function syncAccessTokenFromLocation(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const token = readTokenFromQuery() ?? readTokenFromHash()
  if (!token) {
    return getStoredAccessToken()
  }

  storeAccessToken(token)

  const searchParams = new URLSearchParams(window.location.search)
  searchParams.delete('token')
  const hashParams = new URLSearchParams(window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash)
  hashParams.delete('token')

  const nextSearch = searchParams.toString()
  const nextHash = hashParams.toString()
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${nextHash ? `#${nextHash}` : ''}`
  window.history.replaceState(null, '', nextUrl)

  return token
}
