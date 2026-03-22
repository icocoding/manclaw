export const MANCLAW_SERVICE_CHANGED_EVENT = 'manclaw:service-changed'

export interface ServiceChangedDetail {
  serviceId: string
}

export function emitServiceChanged(detail: ServiceChangedDetail): void {
  window.dispatchEvent(new CustomEvent<ServiceChangedDetail>(MANCLAW_SERVICE_CHANGED_EVENT, { detail }))
}

export function onServiceChanged(handler: (detail: ServiceChangedDetail) => void): () => void {
  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<ServiceChangedDetail>
    if (customEvent.detail?.serviceId?.trim()) {
      handler(customEvent.detail)
    }
  }

  window.addEventListener(MANCLAW_SERVICE_CHANGED_EVENT, listener)
  return () => {
    window.removeEventListener(MANCLAW_SERVICE_CHANGED_EVENT, listener)
  }
}
