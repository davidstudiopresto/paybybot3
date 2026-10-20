import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PublicTopBar } from '@/components/TopBar'
import { api } from '@/lib/api'

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
export function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.adminStats().then(setStats, (e) => setError((e as Error).message))
  }, [])

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
      <PublicTopBar signedIn />
      <main className="mx-auto max-w-4xl px-6 pt-12 pb-20">
        <h1 className="font-heading text-[2.4rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink">Admin</h1>
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
