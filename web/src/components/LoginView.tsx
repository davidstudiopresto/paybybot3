import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { RemotePanel } from '@/components/RemoteScene'
import { CARD_NOTE, ResidentRequired } from '@/components/Riverain'
import { PayByBot, PayByPhone, withPayByPhone } from '@/components/signs'
import { storedInvite } from '@/lib/invite'
import { api, ApiError, isPending, type Me } from '@/lib/api'
import { useTurnstile } from '@/lib/turnstile'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'
import { emailProblem, frenchDigits, phoneProblem } from '@/lib/validate'

/** PayByBot is for Paris residents: French numbers only (calling code and flag stripes). */
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

/** PayByPhone's own page to reset its password (a code is sent to the phone number). */
const PAYBYPHONE_PASSWORD_RESET = 'https://m.paybyphone.com/#/passwordReset'

/** On Android, the PayByPhone app when it is installed (its home screen: PayByPhone offers no link to its own
 *  « mot de passe oublié »), else the web page. On iPhone the app cannot be opened from a link: the web page. */
const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
const PASSWORD_RESET_LINK = IS_ANDROID
  ? 'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.paybyphone;' +
    `S.browser_fallback_url=${encodeURIComponent(PAYBYPHONE_PASSWORD_RESET)};end`
  : PAYBYPHONE_PASSWORD_RESET

/** "06 12 34 56 78" + France -> "+33612345678"; a number typed with its + prefix is kept as is. */
function phoneUsername(national: string, code: string) {
  const digits = frenchDigits(national)
  if (digits) return '+' + code + digits
  const raw = national.trim()
  if (raw.startsWith('+')) return '+' + raw.replace(/\D/g, '')
  return '+' + code + raw.replace(/\D/g, '').replace(/^0/, '')
}

type Field = 'phone' | 'email' | 'signupEmail'

const fieldBox =
  'flex h-14 items-center rounded-xl border border-ink/20 bg-white transition focus-within:border-eu focus-within:ring-3 focus-within:ring-eu/15 overflow-hidden'

export function LoginView({
  onLogin,
  hosted,
  signup = false,
  title,
}: {
  onLogin: (me: Me) => void
  hosted: boolean
  signup?: boolean
  title?: ReactNode // instead of « Inscription » / « Connexion à PayByBot » (the Tarifs page asks to sign up)
}) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone') // PayByPhone identifier: phone number by default
  const country = 'FR'
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [invalid, setInvalid] = useState<Set<Field>>(new Set())
  const fixed = (f: Field) => setInvalid((x) => (x.has(f) ? new Set([...x].filter((y) => y !== f)) : x))
  const box = (f: Field) => cn(fieldBox, invalid.has(f) && 'border-destructive ring-3 ring-destructive/15 focus-within:border-destructive focus-within:ring-destructive/15')
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountExists, setAccountExists] = useState(false)
  const [noAccount, setNoAccount] = useState(false)
  const [noResident, setNoResident] = useState<number | null>(null) // sign-up refused: how many vehicles the account has
  const [loading, setLoading] = useState<'login' | 'demo' | null>(null)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const human = useTurnstile()
  const EXISTS = 'Un compte PayByBot existe déjà pour ce compte PayByPhone.'

  // Sign-up: say right away, once the number is typed, that it is already signed up.
  useEffect(() => {
    // « Se connecter » from the banner switches this same form to sign-in: the number stays, the banner goes.
    if (!signup) {
      setAccountExists(false)
      setError(null)
      return
    }
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
    // A number or an e-mail that cannot be right is not sent (PayByPhone would refuse it, or the e-mails get lost).
    const typed = (mode === 'phone' ? phone : email).trim().toLowerCase()
    if (!demo && typed !== 'demo') {
      // No message: the field that cannot be right is framed in red, until it is changed.
      const bad = new Set<Field>()
      if (mode === 'phone' && phoneProblem(phone)) bad.add('phone')
      if (mode === 'phone' && signup && emailProblem(signupEmail)) bad.add('signupEmail')
      if (mode === 'email' && emailProblem(email)) bad.add('email')
      setInvalid(bad)
      if (bad.size) return
    }
    setLoading(demo ? 'demo' : 'login')
    try {
      const username = demo ? 'demo' : mode === 'phone' ? phoneUsername(phone, selected.code) : email.trim()
      // Clicking "Se connecter" is the acceptance of the terms and privacy policy, stated right above it.
      const result = await api.login(
        username,
        demo ? 'demo' : password,
        !demo,
        // Signed up by e-mail: that address is also the contact one (no second field).
        signup && !demo ? { email: (mode === 'email' ? email : signupEmail).trim(), invite: storedInvite() ?? '' } : undefined,
        !signup && !demo && remember,
        demo ? '' : await human.token(),
      )
      if (isPending(result)) setCodeSentTo(result.email)
      else onLogin(result)
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        setNoResident(typeof e.data.vehicles === 'number' ? e.data.vehicles : 2)
        return
      }
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
      {noResident !== null && (
        <ResidentRequired vehicles={noResident}>
          <button
            onClick={() => {
              setNoResident(null)
              submit()
            }}
            className={cn('mt-7', ui.primary)}
          >
            J’ai le tarif résident, réessayer
          </button>
          <p className="mt-5 text-center text-sm">
            <a href="#/" onClick={() => setNoResident(null)} className={link}>
              Retour à l’accueil
            </a>
          </p>
        </ResidentRequired>
      )}
      <PublicTopBar />

      {/* On a computer, like Qonto: the form on the left, the animated scene on the right. */}
      <div className="flex flex-1 lg:grid lg:grid-cols-2">
      <div className="flex flex-1 flex-col">
      <main className="flex flex-1 items-start justify-center px-6 pt-[12vh] pb-12 sm:items-center lg:pb-4 sm:pt-0">
        <form
          className="rise w-full max-w-[26rem]"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <h1
            className={cn(
              'font-heading leading-[1.05] font-medium tracking-[-0.035em] text-ink',
              title || signup ? 'text-[2rem] sm:text-[2.2rem]' : 'text-[2.6rem]',
            )}
          >
            {title ?? (signup ? <>Inscrivez-vous avec vos identifiants <PayByPhone /></> : <>Connexion à <PayByBot /></>)}
          </h1>
          {/* Sign-up: the title says it all, no line under it. */}
          {!signup && (
            <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/60">
              {withPayByPhone('Avec votre compte PayByPhone.')}{' '}
              {hosted ? 'Mot de passe jamais enregistré.' : 'Vos identifiants restent sur cet ordinateur.'}{' '}
              <a href="#/securite" target="_blank" rel="noopener" className={link}>
                En savoir plus
              </a>
            </p>
          )}

          <div className="mt-9 space-y-3 lg:mt-6">
            <div role="radiogroup" aria-label="Identifiant PayByPhone" className="flex rounded-xl bg-ink/[0.05] p-1">
              {(
                [
                  ['phone', 'Téléphone'],
                  ['email', 'E-mail'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  onClick={() => {
                    setMode(id)
                    setError(null)
                    setInvalid(new Set())
                  }}
                  className={cn(
                    'h-10 flex-1 rounded-lg text-[0.95rem] font-semibold transition',
                    mode === id ? 'bg-white text-ink shadow-[0_1px_3px_rgb(11_16_36/0.12)]' : 'text-ink/55 hover:text-ink',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === 'phone' ? (
              <div className={box('phone')}>
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
                  placeholder="Numéro PayByPhone"
                  value={phone}
                  onChange={(e) => (setPhone(e.target.value), fixed('phone'))}
                  aria-label="Numéro de téléphone"
                  aria-invalid={invalid.has('phone') || undefined}
                  required
                  className="h-full min-w-0 flex-1 bg-transparent px-2 text-lg text-ink tabular-nums outline-none placeholder:text-ink/30"
                />
              </div>
            ) : (
              <div className={box('email')}>
                <input
                  id="username"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="E-mail du compte PayByPhone"
                  aria-label="E-mail du compte PayByPhone"
                  aria-invalid={invalid.has('email') || undefined}
                  value={email}
                  onChange={(e) => (setEmail(e.target.value), fixed('email'))}
                  required
                  className="h-full min-w-0 flex-1 bg-transparent px-4 text-lg text-ink outline-none placeholder:text-ink/30"
                />
              </div>
            )}
            {/* Sign-up by phone: the e-mail comes right under the number. */}
            {signup && mode === 'phone' && (
              <div className={box('signupEmail')}>
                <input
                  id="signup-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Votre e-mail"
                  value={signupEmail}
                  onChange={(e) => (setSignupEmail(e.target.value), fixed('signupEmail'))}
                  aria-label="E-mail"
                  aria-invalid={invalid.has('signupEmail') || undefined}
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

            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-1">
              {!signup && (
                <label className="flex cursor-pointer items-center gap-3 text-[0.95rem] text-ink/70">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="size-5 accent-[var(--eu)]"
                  />
                  Se souvenir de moi
                </label>
              )}
              {/* The password is PayByPhone's: only PayByPhone can reset it. */}
              <a
                href={PASSWORD_RESET_LINK}
                target={IS_ANDROID ? undefined : '_blank'}
                rel="noopener noreferrer"
                className={cn('ml-auto text-[0.95rem]', link)}
              >
                Mot de passe oublié ?
              </a>
            </div>

          </div>
          {signup && mode === 'email' && (
            <p className="mt-2 text-sm text-ink/50">Cette adresse reçoit aussi les confirmations de paiement et les alertes. Gardée chiffrée.</p>
          )}
          {signup && <p className="mt-4 text-sm leading-relaxed text-ink/50">{withPayByPhone(CARD_NOTE)}</p>}


          {signup && (
            <label className="mt-6 lg:mt-4 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-ink/70">
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
          )}

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
            className="mt-7 lg:mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] text-lg font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
          >
            {loading === 'login' ? <Loader2 className="size-5 animate-spin" /> : <>{signup ? 'Continuer' : 'Se connecter'} <ArrowRight className="size-5" /></>}
          </button>
          {/* Cloudflare's check runs unseen; its box only shows here when it needs a click. */}
          <div ref={human.box} className="mt-4 empty:hidden" />
          {human.enabled && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-ink/40">
              <Lock className="size-3" /> Connexion protégée par Cloudflare
            </p>
          )}

          <p className="mt-6 lg:mt-4 text-center text-sm text-ink/50">
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

        </form>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={hosted} linksOnly={signup} />
      </div>
      <RemotePanel className="hidden lg:block" />
      </div>
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
          <h1 className="font-heading text-[2.6rem] leading-[1.05] font-medium tracking-[-0.035em] text-ink">
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
      <HostedFooter className="px-6 pb-8" hosted={hosted} linksOnly />
    </div>
  )
}
