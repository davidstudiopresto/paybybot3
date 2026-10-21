import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUp, Loader2, X } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type Bubble = { from: 'us' | 'you'; text: string }

const HELLO = 'Bonjour ! Une question sur PayByBot ? Écrivez-nous ici : nous vous répondons dans les plus brefs délais.'

/** « Contact » in the top bar: a small chat-like window whose message is e-mailed to us. */
export function ContactLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} className={className} aria-expanded={open}>
        Contact
      </button>
      {open && createPortal(<ContactWindow onClose={close} />, document.body)}
    </>
  )
}

function ContactWindow({ onClose }: { onClose: () => void }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([{ from: 'us', text: HELLO }])
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('') // hidden: only bots fill it
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const text = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    text.current?.focus()
    // Signed in: the account e-mail, so there is nothing to type.
    api.account().then((a) => a.email && setEmail((e) => e || a.email), () => {})
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' }) // in braces: Chrome's scrollIntoView returns a promise now
  }, [bubbles, error])

  const validEmail = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(email.trim())

  async function send() {
    if (sending) return
    if (!message.trim()) return text.current?.focus()
    if (!validEmail) return setError('Indiquez votre e-mail pour recevoir la réponse.')
    setSending(true)
    setError(null)
    const sent = message.trim()
    try {
      await api.contact({ email: email.trim(), message: sent, website })
      setBubbles((b) => [
        ...b,
        { from: 'you', text: sent },
        { from: 'us', text: `Message bien reçu. Nous vous répondrons à ${email.trim()}.` },
      ])
      setMessage('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Contact"
      className="fixed right-4 bottom-4 z-50 flex max-h-[min(34rem,calc(100dvh-2rem))] w-[min(23rem,calc(100vw-2rem))] animate-in flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_24px_60px_-12px_rgba(11,16,36,0.35)] duration-200 fade-in-0 slide-in-from-bottom-3"
    >
      <div className="flex items-center gap-3 bg-[linear-gradient(110deg,#0b1024_0%,#1d2a6b_60%,#1d4ea3_100%)] px-4 py-3.5 text-white">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white">
          <img src="/favicon.svg" alt="" className="size-5" />
        </span>
        <span className="min-w-0 flex-1 font-heading text-[0.98rem] leading-tight font-semibold">Contact PayByBot</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid size-8 place-items-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <X className="size-4.5" />
        </button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto bg-[#f6f7fb] px-3.5 py-4">
        {bubbles.map((b, i) => (
          <p
            key={i}
            className={cn(
              'max-w-[85%] animate-in px-3.5 py-2.5 text-[0.93rem] leading-relaxed whitespace-pre-line duration-300 fade-in-0 slide-in-from-bottom-1',
              b.from === 'us'
                ? 'rounded-2xl rounded-bl-md bg-white text-ink shadow-[0_1px_2px_rgba(17,17,17,0.06)]'
                : 'ml-auto rounded-2xl rounded-br-md bg-[linear-gradient(135deg,#2a66d1,#1d4ea3)] text-white',
            )}
          >
            {b.text}
          </p>
        ))}
        {error && <p className="px-1 text-sm text-destructive">{error}</p>}
        <div ref={end} />
      </div>

      <form
        className="border-t border-ink/8 bg-white p-2.5"
        onSubmit={(e) => {
          e.preventDefault()
          send()
        }}
      >
        <input
          type="email"
          autoComplete="email"
          placeholder="Votre e-mail"
          aria-label="Votre e-mail"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          className="mb-2 h-9 w-full rounded-lg bg-ink/[0.04] px-3 text-sm text-ink outline-none placeholder:text-ink/40 focus:bg-ink/[0.06]"
        />
        <input
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          name="website"
          className="absolute -left-[9999px] size-px opacity-0"
        />
        <div className="flex items-end gap-2 rounded-xl border border-ink/12 bg-white py-1.5 pr-1.5 pl-3 transition focus-within:border-eu/50 focus-within:shadow-[0_0_0_3px_rgba(29,78,163,0.12)]">
          <textarea
            ref={text}
            rows={1}
            value={message}
            maxLength={3000}
            placeholder="Écrivez votre message…"
            aria-label="Votre message"
            onChange={(e) => {
              setMessage(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[0.95rem] text-ink outline-none placeholder:text-ink/40"
          />
          <button
            type="submit"
            disabled={sending || !message.trim()}
            aria-label="Envoyer"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-[linear-gradient(135deg,#2a66d1,#1d4ea3)] text-white transition hover:brightness-110 disabled:opacity-35"
          >
            {sending ? <Loader2 className="size-4.5 animate-spin" /> : <ArrowUp className="size-4.5" strokeWidth={2.4} />}
          </button>
        </div>
      </form>
    </div>
  )
}
