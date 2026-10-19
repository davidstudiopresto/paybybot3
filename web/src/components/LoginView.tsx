import { useState } from 'react'
import { ArrowRight, ChevronDown, Eye, EyeOff, Loader2 } from 'lucide-react'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { ZoneField } from '@/components/Riverain'
import { api, ApiError, type Me } from '@/lib/api'

/** Countries where PayByPhone is used, with their calling code and flag stripes. */
const COUNTRIES = [
  { id: 'FR', name: 'France', code: '33', placeholder: '6 12 34 56 78', flag: ['v', '#0055a4', '#ffffff', '#ef4135'] },
  { id: 'BE', name: 'Belgique', code: '32', placeholder: '470 12 34 56', flag: ['v', '#000000', '#fdda24', '#ef3340'] },
  { id: 'CH', name: 'Suisse', code: '41', placeholder: '78 123 45 67', flag: ['ch'] },
  { id: 'LU', name: 'Luxembourg', code: '352', placeholder: '621 123 456', flag: ['h', '#ed2939', '#ffffff', '#00a1de'] },
  { id: 'DE', name: 'Allemagne', code: '49', placeholder: '1512 3456789', flag: ['h', '#000000', '#dd0000', '#ffce00'] },
  { id: 'IT', name: 'Italie', code: '39', placeholder: '312 345 6789', flag: ['v', '#009246', '#ffffff', '#ce2b37'] },
  { id: 'NL', name: 'Pays-Bas', code: '31', placeholder: '6 12345678', flag: ['h', '#ae1c28', '#ffffff', '#21468b'] },
] as const

function Flag({ flag }: { flag: readonly string[] }) {
  if (flag[0] === 'ch') {
    return (
      <svg viewBox="0 0 30 20" className="h-4 w-6 rounded-[3px] shadow-[0_0_0_1px_rgb(0_0_0/0.08)]" aria-hidden>
        <rect width="30" height="20" fill="#da291c" />
        <rect x="13" y="4" width="4" height="12" fill="#fff" />
        <rect x="9" y="8" width="12" height="4" fill="#fff" />
      </svg>
    )
  }
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

export function LoginView({ onLogin, hosted, signup = false }: { onLogin: (me: Me) => void; hosted: boolean; signup?: boolean }) {
  const [mode, setMode] = useState<'phone' | 'email'>('phone')
  const [country, setCountry] = useState<(typeof COUNTRIES)[number]['id']>('FR')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupZone, setSignupZone] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountExists, setAccountExists] = useState(false)
  const [loading, setLoading] = useState<'login' | 'demo' | null>(null)
  const selected = COUNTRIES.find((c) => c.id === country) ?? COUNTRIES[0]
  const link = 'text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink'

  async function submit(demo = false) {
    setError(null)
    setAccountExists(false)
    setLoading(demo ? 'demo' : 'login')
    try {
      const username = demo ? 'demo' : mode === 'phone' ? phoneUsername(phone, selected.code) : email.trim()
      // Clicking "Se connecter" is the acceptance of the terms and privacy policy, stated right above it.
      onLogin(
        await api.login(username, demo ? 'demo' : password, !demo, signup && !demo ? { email: signupEmail.trim(), zone: signupZone } : undefined),
      )
    } catch (e) {
      setError((e as Error).message)
      setAccountExists(e instanceof ApiError && e.status === 409)
    } finally {
      setLoading(null)
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
            submit()
          }}
        >
          <h1 className="font-heading text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink">
            {signup ? 'Inscription' : 'Connexion à PaybyBot'}
          </h1>
          <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/60">
            {signup ? 'Avec votre compte PayByPhone : pas de nouveau mot de passe à retenir.' : 'Avec votre compte PayByPhone.'}{' '}
            {hosted ? 'Aucune donnée conservée, mot de passe jamais enregistré.' : 'Vos identifiants restent sur cet ordinateur.'}{' '}
            <a href="#/securite" target="_blank" rel="noopener" className={link}>
              En savoir plus
            </a>
          </p>

          <div className="mt-9 space-y-3">
            {mode === 'phone' ? (
              <div className={fieldBox}>
                <label className="relative flex h-full shrink-0 items-center gap-1.5 border-r border-ink/10 pr-3 pl-4">
                  <span className="sr-only">Pays</span>
                  <Flag flag={selected.flag} />
                  <ChevronDown className="size-4 text-ink/40" />
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value as typeof country)}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    aria-label="Pays du numéro"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (+{c.code})
                      </option>
                    ))}
                  </select>
                </label>
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
            <>
              <p className="mt-2 text-sm text-ink/50">Pour les confirmations de paiement et les alertes. Gardé chiffré.</p>
              <div className="mt-6">
                <ZoneField zone={signupZone} fromHistory={false} onZone={setSignupZone} autoFocus={false} />
              </div>
            </>
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

          {error && (
            <p role="alert" className="mt-5 rounded-xl bg-destructive/8 px-4 py-3 text-destructive">
              {error}
              {accountExists && (
                <>
                  {' '}
                  <a href="#/connexion" className="font-bold underline underline-offset-[3px]">
                    Se connecter
                  </a>
                </>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={loading !== null || (signup && (!accepted || !signupZone))}
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
            <button type="button" onClick={() => setMode((m) => (m === 'phone' ? 'email' : 'phone'))} className={link}>
              {mode === 'phone' ? 'Utiliser un e-mail' : 'Utiliser un numéro'}
            </button>
            <span aria-hidden>·</span>
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

