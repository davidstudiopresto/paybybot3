import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'

/** Cloudflare Turnstile: an invisible human check before sign-up and logins, online only (the server says if it is on). */
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

let siteKey: Promise<string | null> | null = null
let script: Promise<Turnstile> | null = null

function loadScript() {
  return (script ??= new Promise<Turnstile>((resolve, reject) => {
    const el = document.createElement('script')
    el.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    el.async = true
    el.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    el.onerror = () => {
      script = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(el)
  }))
}

const UNAVAILABLE = "La vérification anti-robot n'a pas pu se charger. Vérifiez votre connexion et rechargez la page."

/**
 * `box` goes on an empty element in the form: it stays empty unless Cloudflare needs a click.
 * `token()` gives a fresh single-use token ("" when the check is off) and readies the next one.
 */
export function useTurnstile() {
  const box = useRef<HTMLDivElement>(null)
  const widget = useRef<{ t: Turnstile; id: string } | null>(null)
  const current = useRef<string | null>(null)
  const waiting = useRef<((token: string) => void)[]>([])
  const [enabled, setEnabled] = useState(false)
  const [failed, setFailedState] = useState(false)
  const broken = useRef(false)
  const setFailed = (value: boolean) => {
    broken.current = value
    setFailedState(value)
  }

  useEffect(() => {
    let cancelled = false
    ;(siteKey ??= api.config().then((c) => c.turnstileSiteKey ?? null, () => null)).then(async (key) => {
      if (!key || cancelled) return
      setEnabled(true)
      try {
        const t = await loadScript()
        if (cancelled || !box.current) return
        const id = t.render(box.current, {
          sitekey: key,
          appearance: 'interaction-only',
          theme: 'light',
          language: 'fr',
          size: 'flexible',
          callback: (token: string) => {
            current.current = token
            setFailed(false)
            waiting.current.splice(0).forEach((resolve) => resolve(token))
          },
          'expired-callback': () => (current.current = null),
          'error-callback': () => {
            setFailed(true)
            return false // Cloudflare retries by itself
          },
        })
        widget.current = { t, id }
      } catch {
        if (!cancelled) setFailed(true)
      }
    })
    return () => {
      cancelled = true
      if (widget.current) widget.current.t.remove(widget.current.id)
      widget.current = null
    }
  }, [])

  const token = useCallback(async () => {
    if (!enabled) return ''
    if (broken.current && !current.current) throw new Error(UNAVAILABLE)
    const value =
      current.current ??
      (await new Promise<string>((resolve, reject) => {
        waiting.current.push(resolve)
        setTimeout(() => reject(new Error(UNAVAILABLE)), 30000)
      }))
    current.current = null // single use: the next submit waits for a new one
    if (widget.current) widget.current.t.reset(widget.current.id)
    return value
  }, [enabled])

  return { box, token, failed: failed ? UNAVAILABLE : null }
}
