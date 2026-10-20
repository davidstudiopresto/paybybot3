import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { withPayByPhone } from '@/components/signs'
import { api, ApiError, isPending, type Me } from '@/lib/api'
import { useTurnstile } from '@/lib/turnstile'
import { cn } from '@/lib/utils'

/** PaybyBot is for Paris residents: French numbers only (calling code and flag stripes). */
const COUNTRIES = [
  { id: 'FR', name: 'France', code: '33', placeholder: '6 12 34 56 78', flag: ['v', '#0055a4', '#ffffff', '#ef4135'] },
] as const

function Flag({ flag }: { flag: readonly string[] }) {
  const [dir, a, b, c] = flag
  return (
    <svg viewBox="0 0 30 20" className="h-4 w-6 rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden>
      {dir === 'v' ? (
        <>
          <rect width="10" height="20" fill={a} />
          <rect x="10" width="10" height="20" fill={b} />
          <rect x="20" width="10" height="20" fill={c} />
        </>
      ) : (
        <>
          <rect width="30" height="7" fill={a} />
          <rect y="6.67" width="30" height="6.67" fill={b} />
          <rect y="13.33" width="30" height="6.67" fill={c} />
        </>
      )}
    </svg>
  )
}

/** "06 12 34 56 78" + France -> "+33612345678"; a number typed with its + prefix is kept as is. */
function phoneUsername(national: string, code: string) {
  const raw = national.trim()
  if (raw.startsWith('+')) return '+' + raw.replace(/\D/g, '')
  return '+' + code + raw.replace(/\D/g, '').replace(/^0/, '')
}

const fieldBox =
  'flex h-14 items-center rounded-xl border border-ink/20 bg-white transition focus-within:border-eu focus-within:ring-3 focus-within:ring-eu/15'

export function LoginView({
  onLogin,
  hosted,
  signup = false,
  title,
}: {
  onLogin: (me: Me) => void
  hosted: boolean
  signup?: boolean
  title?: ReactNode // instead of « Inscription » / « Connexion à PaybyBot » (the Tarifs page asks to sign up)
}) {
  const mode = 'phone' as 'phone' | 'email' // login by phone number only
  const country = 'FR'
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountExists, setAccountExists] = useState(false)
  const [noAccount, setNoAccount] = useState(false)
  const [loading, setLoading] = useState<'login' | 'demo' | null>(null)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const human = useTurnstile()
  const EXISTS = 'Un compte PaybyBot existe déjà pour ce compte PayByPhone.'

  // Sign-up: say right away, once the number is typed, that it is already signed up.
  useEffect(() => {
    if (!signup) return
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 9) {
      setAccountExists(false)
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { exists } = await api.signupCheck(phoneUsername(phone, selected.code))
        if (cancelled) return
        setAccountExists(exists)
        
      } catch {
        // the final check at "Continuer" still applies
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signup, phone, country])
  const selected = COUNTRIES.find((c) => c.id === country) ?? COUNTRIES[0]
  const link = 'text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink'

  async function submit(demo = false) {
    setError(null)
    setAccountExists(false)
    setNoAccount(false)
    setLoading(demo ? 'demo' : 'login')
    try {
      const username = demo ? 'demo' : mode === 'phone' ? phoneUsername(phone, selected.code) : email.trim()
      // Clicking "Se connecter" is the acceptance of the terms and privacy policy, stated right above it.
      const result = await api.login(
        username,
        demo ? 'demo' : password,
        !demo,
        signup && !demo ? { email: signupEmail.trim() } : undefined,
        !signup && !demo && remember,
        demo ? '' : await human.token(),
      )
      if (isPending(result)) setCodeSentTo(result.email)
      else onLogin(result)
    } catch (e) {
      setError((e as Error).message)
      setAccountExists(e instanceof ApiError && e.status === 409)
      setNoAccount(e instanceof ApiError && e.status === 404)
    } finally {
      setLoading(null)
    }
  }

  if (codeSentTo) {
    return <CodeStep email={codeSentTo} hosted={hosted} onLogin={onLogin} onBack={() => setCodeSentTo(null)} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicTopBar />

      <main className="flex flex-1 items-start justify-center px-6 pt-[12vh] pb-12 sm:items-center sm:pt-0">
        <form
          className="rise w-full max-w-[26rem]"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <h1
            className={cn(
              'font-heading leading-[1.05] font-semibold tracking-[-0.035em] text-ink',
              title ? 'text-[2rem] sm:text-[2.2rem]' : 'text-[2.6rem]',
            )}
          >
            {title ?? (signup ? 'Inscription' : 'Connexion à PaybyBot')}
          </h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/60">
            {withPayByPhone(signup ? 'Avec votre compte PayByPhone : pas de nouveau mot de passe à retenir.' : 'Avec votre compte PayByPhone.')}{' '}
            {hosted ? 'Mot de passe jamais enregistré.' : 'Vos identifiants restent sur cet ordinateur.'}{' '}
            <a href="#/securite" target="_blank" rel="noopener" className={link}>
              En savoir plus
            </a>
          </p>

          <div className="mt-9 space-y-3">
            {mode === 'phone' ? (
              <div className={fieldBox}>
                <span className="flex h-full shrink-0 items-center border-r border-ink/10 pr-3 pl-4" title="Numéro français">
                  <span className="sr-only">France</span>
                  <Flag flag={selected.flag} />
                </span>
                <span className="pl-3 text-lg text-ink/45 tabular-nums">+{selected.code}</span>
                <input
                  id="username"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder={selected.placeholder}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-label="Numéro de téléphone"
                  required
                  className="h-full min-w-0 flex-1 bg-transparent px-2 text-lg text-ink tabular-nums outline-none placeholder:text-ink/30"
                />
              </div>
            ) : (
              <div className={fieldBox}>
                <input
                  id="username"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="Adresse e-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg text-ink outline-none placeholder:text-ink/30"
                />
              </div>
            )}
            {accountExists && (
              <p role="alert" className="rounded-xl bg-destructive/8 px-4 py-3 text-destructive">
                {withPayByPhone(EXISTS)}{' '}
                <a href="#/connexion" className="font-bold underline underline-offset-[3px]">
                  Se connecter
                </a>
              </p>
            )}


            <div className={fieldBox}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Mot de passe PayByPhone"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-label="Mot de passe"
                required
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg text-ink outline-none placeholder:text-ink/30"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={showPassword}
                className="mr-1.5 grid size-11 shrink-0 place-items-center rounded-lg text-ink/40 transition hover:text-ink focus-visible:ring-3 focus-visible:ring-ink/10 focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>

            {!signup && (
              <label className="flex cursor-pointer items-center gap-3 pt-1 text-[0.95rem] text-ink/70">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="size-5 accent-[var(--eu)]"
                />
                Se souvenir de moi
              </label>
            )}

            {signup && (
              <div className={fieldBox}>
                <input
                  id="signup-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Votre e-mail"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  aria-label="E-mail"
                  required
                  className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg text-ink outline-none placeholder:text-ink/30"
                />
              </div>
            )}
          </div>
          {signup && (
            <p className="mt-2 text-sm text-ink/50">Pour les confirmations de paiement et les alertes. Gardé chiffré.</p>
          )}


          {signup ? (
            <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink/70">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                required
                className="mt-0.5 size-5 shrink-0 accent-[var(--eu)]"
              />
              <span>
                J'accepte les{' '}
                <a href="#/cgu" target="_blank" rel="noopener" className={link}>
                  conditions d'utilisation
                </a>{' '}
                et la{' '}
                <a href="#/confidentialite" target="_blank" rel="noopener" className={link}>
                  politique de confidentialité
                </a>
                .
              </span>
            </label>
          ) : (
            <p className="mt-6 text-sm leading-relaxed text-ink/50">
              En cliquant sur « Se connecter », j'accepte les{' '}
              <a href="#/cgu" target="_blank" rel="noopener" className={link}>
                conditions d'utilisation
              </a>{' '}
              et la{' '}
              <a href="#/confidentialite" target="_blank" rel="noopener" className={link}>
                politique de confidentialité
              </a>
              .
            </p>
          )}

          <div ref={human.box} className="mt-5 empty:hidden" />
          {human.failed && !error && (
            <p role="alert" className="mt-5 rounded-xl bg-destructive/8 px-4 py-3 text-destructive">
              {human.failed}
            </p>
          )}

          {error && !accountExists && (
            <p role="alert" className="mt-5 rounded-xl bg-destructive/8 px-4 py-3 text-destructive">
              {withPayByPhone(error)}
              {noAccount && (
                <>
                  {' '}
                  <a href="#/inscription" className="font-bold underline underline-offset-[3px]">
                    S'inscrire
                  </a>
                </>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={loading !== null || (signup && (!accepted || accountExists))}
            className="mt-7 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] text-lg font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {loading === 'login' ? <Loader2 className="size-5 animate-spin" /> : <>{signup ? 'Continuer' : 'Se connecter'} <ArrowRight className="size-5" /></>}
          </button>

          <p className="mt-6 text-center text-sm text-ink/50">
            {signup ? (
              <>
                Déjà inscrit ?{' '}
                <a href="#/connexion" className={link}>
                  Se connecter
                </a>
              </>
            ) : (
              <>
                Pas encore inscrit ?{' '}
                <a href="#/inscription" className={link}>
                  S'inscrire
                </a>
              </>
            )}
          </p>

          <p className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-ink/50">
            <button type="button" onClick={() => submit(true)} disabled={loading !== null} className={link}>
              {loading === 'demo' ? 'Ouverture…' : 'Essayer la démo, sans compte'}
            </button>
          </p>
        </form>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}


/** Sign-up, last step: the 6-digit code sent to the e-mail. */
function CodeStep({
  email,
  hosted,
  onLogin,
  onBack,
}: {
  email: string
  hosted: boolean
  onLogin: (me: Me) => void
  onBack: () => void
}) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [wait, setWait] = useState(30)
  const [sentTo, setSentTo] = useState(email)
  const link = 'text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink disabled:no-underline disabled:opacity-50'

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])

  async function check(value = code) {
    setChecking(true)
    setError(null)
    try {
      onLogin(await api.verifySignup(value))
    } catch (e) {
      setError((e as Error).message)
      setChecking(false)
    }
  }

  async function resend() {
    setError(null)
    try {
      const r = await api.resendSignupCode()
      setSentTo(r.email)
      setWait(30)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicTopBar />
      <main className="flex flex-1 items-start justify-center px-6 pt-[12vh] pb-12 sm:items-center sm:pt-0">
        <form
          className="rise w-full max-w-[26rem]"
          onSubmit={(e) => {
            e.preventDefault()
            check()
          }}
        >
          <h1 className="font-heading text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink">
            Vérifiez votre e-mail
          </h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/60">
            Nous avons envoyé un code à 6 chiffres à <strong className="font-semibold text-ink">{sentTo}</strong>.
            Saisissez-le pour finir votre inscription.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Code à 6 chiffres"
            placeholder="123 456"
            value={code}
            maxLength={7}
            autoFocus
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(digits)
              if (digits.length === 6 && !checking) check(digits)
            }}
            className="mt-8 h-16 w-full rounded-xl border border-ink/20 bg-white text-center font-heading text-3xl font-semibold tracking-[0.4em] text-ink tabular-nums outline-none placeholder:text-ink/20 focus:border-eu focus:ring-3 focus:ring-eu/15"
          />
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-destructive/8 px-4 py-3 text-destructive">
              {withPayByPhone(error)}
            </p>
          )}
          <button
            type="submit"
            disabled={code.length !== 6 || checking}
            className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] text-lg font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {checking ? <Loader2 className="size-5 animate-spin" /> : 'Valider'}
          </button>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-ink/50">
            <button type="button" onClick={resend} disabled={wait > 0} className={link}>
              {wait > 0 ? `Renvoyer le code (${wait} s)` : 'Renvoyer le code'}
            </button>
            <span aria-hidden>·</span>
            <button type="button" onClick={onBack} className={link}>
              Modifier l’e-mail
            </button>
          </p>
          <p className="mt-4 text-center text-sm text-ink/45">Pensez à regarder dans vos courriers indésirables.</p>
        </form>
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}
