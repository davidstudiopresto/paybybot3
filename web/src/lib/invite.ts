/** Word of mouth: the site opens through a user's link (?i=<code>), kept on this device for the sign-up. */
const KEY = 'pbb_invite'

let fromLinkNow = false

/** This visit came through a link (?i=…) not opened yet in this tab: the welcome curtain is shown (once per tab,
 *  not again on each reload). */
export function openedFromLink(): boolean {
  return fromLinkNow
}

/** Reads ?i= from the address, else the code kept from an earlier visit. The code stays in the address: copied
 *  from the address bar, reopened from the history or from an app's in-app browser, the link keeps working. */
let captured: string | null | undefined

export function captureInvite(): string | null {
  if (captured !== undefined) return captured // read once per page: a second call must not hide the curtain
  captured = readInvite()
  return captured
}

function readInvite(): string | null {
  const fromLink = new URL(window.location.href).searchParams.get('i')
  if (fromLink) {
    try {
      localStorage.setItem(KEY, fromLink)
    } catch {
      // private window: the code still works, it is in the address
    }
    try {
      fromLinkNow = sessionStorage.getItem('pbb_curtain') !== fromLink
      sessionStorage.setItem('pbb_curtain', fromLink)
    } catch {
      fromLinkNow = true
    }
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

/** This device has been signed in before: the site stays open to sign in again (signing up still needs a link). */
const MEMBER = 'pbb_member'

export function markMember() {
  try {
    localStorage.setItem(MEMBER, '1')
  } catch {
    // private window: nothing kept
  }
}

export function isMember(): boolean {
  try {
    return localStorage.getItem(MEMBER) === '1'
  } catch {
    return false
  }
}
