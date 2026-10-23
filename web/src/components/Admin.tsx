import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ui } from '@/lib/styles'
import { ApiError } from '@/lib/api'
import { TopBar } from '@/components/TopBar'
import { api } from '@/lib/api'
import { useTurnstile } from '@/lib/turnstile'

export type AdminStats = {
  accounts: number
  accounts_7d: number
  accounts_30d: number
  renewals: number
  renewals_active: number
  renewals_paused: number
  renewals_error: number
  paid_7d: number
  signups_by_day: { day: string; count: number }[]
}

/** The owner's page: a few counts, nothing else. */
export function AdminPage(_: { signedIn?: boolean }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)

  function load() {
    setError(null)
    api.adminStats().then(
      (s) => {
        setStats(s)
        setNeedsLogin(false)
      },
      (e) => {
        if (e instanceof ApiError && e.status === 401) setNeedsLogin(true)
        else setError((e as Error).message)
      },
    )
  }

  useEffect(load, [])

  async function logout() {
    await api.adminLogout().catch(() => {})
    setStats(null)
    setNeedsLogin(true)
  }

  if (needsLogin) {
    return (
      <div className="min-h-dvh bg-white">
        <TopBar />
        <AdminLoginForm onDone={load} />
      </div>
    )
  }

  const tiles: [string, number | undefined][] = [
    ['Inscrits', stats?.accounts],
    ['Inscrits, 7 jours', stats?.accounts_7d],
    ['Inscrits, 30 jours', stats?.accounts_30d],
    ['Renouvellements actifs', stats?.renewals_active],
    ['En pause', stats?.renewals_paused],
    ['En erreur', stats?.renewals_error],
    ['Payés, 7 jours', stats?.paid_7d],
    ['Renouvellements au total', stats?.renewals],
  ]
  const max = Math.max(1, ...(stats?.signups_by_day.map((d) => d.count) ?? [1]))

  return (
    <div className="min-h-dvh bg-white">
      <TopBar />
      <main className="mx-auto max-w-4xl px-6 pt-12 pb-20">
        <div className="flex items-center justify-between gap-4">
          <h1 className="font-heading text-[2.4rem] leading-[1.05] font-medium tracking-[-0.035em] text-ink">Admin</h1>
          {stats && (
            <button onClick={logout} className={ui.pillGray}>
              Se déconnecter
            </button>
          )}
        </div>
        {error ? (
          <p className="mt-6 rounded-xl bg-destructive/8 px-4 py-3 text-destructive">{error}</p>
        ) : !stats ? (
          <Loader2 className="mt-8 size-6 animate-spin text-ink/40" />
        ) : (
          <>
            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-4">
              {tiles.map(([label, value]) => (
                <div key={label} className="bg-white p-5">
                  <dt className="text-sm text-ink/55">{label}</dt>
                  <dd className="mt-1 font-heading text-3xl font-semibold tabular-nums text-ink">{value ?? '—'}</dd>
                </div>
              ))}
            </dl>

            <h2 className="mt-12 text-sm font-semibold text-ink/55">Inscriptions, 14 derniers jours</h2>
            {stats.signups_by_day.length ? (
              <ul className="mt-3 space-y-1.5">
                {stats.signups_by_day.map((d) => (
                  <li key={d.day} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-3 text-sm">
                    <span className="text-ink/60 tabular-nums">
                      {new Date(d.day + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                    <span className="h-2 rounded-full bg-eu" style={{ width: `${(d.count / max) * 100}%` }} />
                    <span className="text-right font-semibold tabular-nums">{d.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-ink/50">Aucune inscription sur la période.</p>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function AdminLoginForm({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const human = useTurnstile()

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await api.adminLogin(email.trim(), password, await human.token())
      setPassword('')
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex justify-center px-6 pt-[12vh] pb-12">
      <form
        className="w-full max-w-[24rem]"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h1 className="font-heading text-[2.2rem] leading-[1.05] font-medium tracking-[-0.035em] text-ink">Admin</h1>
        <div className="mt-8 space-y-3">
          <input
            type="email"
            autoComplete="username"
            placeholder="E-mail"
            aria-label="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className={ui.field}
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Mot de passe"
            aria-label="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className={ui.field}
          />
        </div>
        <div ref={human.box} className="mt-4 empty:hidden" />
        {(error || human.failed) && <p className={`mt-4 ${ui.error}`}>{error || human.failed}</p>}
        <button type="submit" disabled={busy} className={`mt-6 ${ui.primary}`}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}
