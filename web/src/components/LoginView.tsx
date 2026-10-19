import { useState } from 'react'
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { HostedFooter } from '@/components/Footer'
import { Plate, Wordmark } from '@/components/signs'
import { api, type Me } from '@/lib/api'

export function LoginView({ onLogin, hosted }: { onLogin: (me: Me) => void; hosted: boolean }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(u = username, p = password) {
    setError(null)
    setLoading(true)
    try {
      onLogin(await api.login(u, p))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grain grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* The big blue road sign */}
      <section className="relative flex flex-col justify-between overflow-hidden bg-signal px-5 pt-6 pb-7 text-white sm:p-12 lg:p-16">
        <div className="absolute -right-24 -bottom-24 size-[28rem] rounded-[4rem] border-[18px] border-white/10" aria-hidden />
        <div className="absolute -right-6 bottom-16 hidden font-heading text-[22rem] leading-none font-black text-white/[0.06] select-none sm:block" aria-hidden>
          P
        </div>
        <div className="rise relative [&_span]:text-white [&_.bg-signal]:shadow-[inset_0_0_0_3px_var(--signal),inset_0_0_0_5px_#fff]">
          <Wordmark />
        </div>
        <div className="relative my-5 max-w-xl sm:my-14">
          <h1 className="rise font-heading text-[2.6rem] leading-[0.95] font-black tracking-tight sm:text-6xl" style={{ animationDelay: '80ms' }}>
            Garez-vous.
            <br />
            <span className="text-amber">On s'occupe du ticket.</span>
          </h1>
          <p className="rise mt-6 hidden max-w-md text-lg text-white/85 sm:block" style={{ animationDelay: '160ms' }}>
            Payez votre stationnement PayByPhone en quelques clics, et laissez l'application le renouveler toute seule
            pour ne plus jamais prendre d'amende.
          </p>
        </div>
        <div className="rise relative flex flex-wrap items-center gap-3 text-sm text-white/80 sm:gap-4" style={{ animationDelay: '240ms' }}>
          <Plate plate="AB123CD" size="sm" className="hidden sm:inline-flex" />
          <span className="flex items-center gap-2">
            <LockKeyhole className="size-4" /> {hosted ? "Votre mot de passe n'est jamais enregistré." : 'Vos identifiants restent sur cet ordinateur.'}
          </span>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-start justify-center px-5 pt-6 pb-10 sm:items-center sm:p-12">
        <form
          className="rise w-full max-w-md"
          style={{ animationDelay: '120ms' }}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="hidden text-sm font-bold tracking-[0.2em] text-signal uppercase sm:block">Connexion</p>
          <h2 className="text-2xl font-extrabold tracking-tight sm:mt-2 sm:text-3xl">Votre compte PayByPhone</h2>
          <p className="mt-2 text-muted-foreground">
            Les mêmes identifiants que dans l'application PayByPhone de votre téléphone.
          </p>

          <div className="mt-5 space-y-4 sm:mt-8 sm:space-y-5">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-base">Téléphone ou e-mail</Label>
              <Input
                id="username"
                autoComplete="username"
                placeholder="06 12 34 56 78"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-14 bg-enamel text-lg"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-base">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 bg-enamel pr-14 text-lg"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  aria-pressed={showPassword}
                  title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="absolute inset-y-0 right-1.5 my-auto grid size-11 place-items-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-ink focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-lg border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-6 h-14 w-full rounded-xl text-lg font-bold sm:mt-7">
            {loading ? <Loader2 className="size-5 animate-spin" /> : <>Se connecter <ArrowRight className="size-5" /></>}
          </Button>

          <div className="my-8 flex items-center gap-4 text-sm text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => submit('demo', 'demo')}
            className="h-14 w-full rounded-xl border-2 border-dashed bg-transparent text-base"
          >
            <Sparkles className="size-5 text-signal" /> Essayer sans compte (démo)
          </Button>
          <p className="mt-3 text-center text-sm text-muted-foreground">
            La démo utilise de fausses données : aucun paiement réel.
          </p>
          {hosted && <HostedFooter className="mt-10" />}
        </form>
      </section>
    </div>
  )
}
