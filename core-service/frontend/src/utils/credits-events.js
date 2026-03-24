export const CREDITS_CHANGED_EVENT = 'mindplus-credits-changed'

export function emitCreditsChanged(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CREDITS_CHANGED_EVENT, { detail }))
}
