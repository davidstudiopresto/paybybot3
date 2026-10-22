/** Word of mouth: the site opens through a user's link (?i=<code>), kept on this device for the sign-up. */
const KEY = 'pbb_invite'

/** Reads ?i= from the address (then removes it), else the code kept from an earlier visit. */
export function captureInvite(): string | null {
  const url = new URL(window.location.href)
  const fromLink = url.searchParams.get('i')
  if (fromLink) {
    try {
      localStorage.setItem(KEY, fromLink)
    } catch {
      // private window: the code still works for this visit
    }
    url.searchParams.delete('i')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    return fromLink
  }
  return storedInvite()
}

export function storedInvite(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // nothing kept
  }
}
