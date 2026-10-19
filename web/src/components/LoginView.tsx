import { useState } from 'react'
import { ArrowRight, Loader2, LockKeyhole, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plate, Wordmark } from '@/components/signs'
import { api, type Me } from '@/lib/api'

export function LoginView({ onLogin }: { onLogin: (me: Me) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      <section className="relative flex flex-col justify-between overflow-hidden bg-signal p-8 text-white sm:p-12 lg:p-16">
        <div className="absolute -right-24 -bottom-24 size-[28rem] rounded-[4rem] border-[18px] border-white/10" aria-hidden />
        <div className="absolute -right-6 bottom-16 font-heading text-[22rem] leading-none font-black text-white/[0.06] select-none" aria-hidden>
          P
        </div>
        <div className="rise relative [&_span]:text-white [&_.bg-signal]:shadow-[inset_0_0_0_3px_var(--signal),inset_0_0_0_5px_#fff]">
          <Wordmark />
        </div>
        <div className="relative my-14 max-w-xl">
          <h1 className="rise font-heading text-5xl leading-[0.95] font-black tracking-tight sm:text-6xl" style={{ animationDelay: '80ms' }}>
            Garez-vous.
            <br />
            <span className="text-amber">On s'occupe du ticket.</span>
          </h1>
          <p className="rise mt-6 max-w-md text-lg text-white/85" style={{ animationDelay: '160ms' }}>
            Payez votre stationnement PayByPhone en quelques clics, et laissez l'application le renouveler toute seule
            pour ne plus jamais prendre d'amende.
          </p>
        </div>
        <div className="rise relative flex flex-wrap items-center gap-4 text-sm text-white/80" style={{ animationDelay: '240ms' }}>
          <Plate plate="AB123CD" size="sm" />
          <span className="flex items-center gap-2">
            <LockKeyhole className="size-4" /> Vos identifiants restent sur cet ordinateur.
          </span>
        </div>
      </section>

      {/* Form */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <form
          className="rise w-full max-w-md"
          style={{ animationDelay: '120ms' }}
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">Connexion</p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight">Votre compte PayByPhone</h2>
          <p className="mt-2 text-muted-foreground">
            Les mêmes identifiants que dans l'application PayByPhone de votre téléphone.
          </p>

          <div className="mt-8 space-y-5">
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
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-14 bg-enamel text-lg"
                required
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-5 rounded-lg border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-7 h-14 w-full rounded-xl text-lg font-bold">
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
        </form>
      </section>
    </div>
  )
}
