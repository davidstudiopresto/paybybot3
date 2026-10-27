import { useEffect, useState } from 'react'
import { Plate } from '@/components/signs'
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
export type AdminClient = {
  name: string | null
  email: string | null
  created: string
  plan: string | null
  subscribed: boolean
  /** The subscription in cents, per month (monthly) or per year (yearly). */
  price: number | null
  /** Each vehicle on PayByPhone with its running ticket's end (null: none); null if PayByPhone could not be read. */
  vehicles: { plate: string; expire: string | null }[] | null
  renewals: number
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
const ends = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(':', 'h')

export function AdminPage(_: { signedIn?: boolean }) {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [clients, setClients] = useState<AdminClient[] | null>(null)

  function load() {
    setError(null)
    api.adminStats().then(
      (s) => {
        setStats(s)
        setNeedsLogin(false)
        api.adminClients().then(setClients, () => setClients([]))
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
      <div className="min-h-dvh bg-background">
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

  return (
    <div className="min-h-dvh bg-background">
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


            <h2 className="mt-12 text-sm font-semibold text-ink/55">Clients{clients ? ` (${clients.length})` : ''}</h2>
            {clients && clients.length === 0 && <p className="mt-3 text-ink/50">Aucun client pour l’instant.</p>}
            {clients && clients.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10">
                <table className="w-full text-left text-sm">
                  <thead className="bg-ink/[0.03] text-ink/55">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nom</th>
                      <th className="px-4 py-3 font-medium">E-mail</th>
                      <th className="px-4 py-3 font-medium">Inscrit le</th>
                      <th className="px-4 py-3 font-medium">Offre</th>
                      <th className="px-4 py-3 font-medium">Véhicules et stationnement</th>
                      <th className="px-4 py-3 text-right font-medium">Renouvellements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c, i) => (
                      <tr key={i} className="border-t border-ink/10">
                        <td className="px-4 py-3 font-semibold text-ink">{c.name || '—'}</td>
                        <td className="px-4 py-3 text-ink/70">{c.email || '—'}</td>
                        <td className="px-4 py-3 text-ink/70 tabular-nums">
                          {new Date(c.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-4 py-3">
                          {c.subscribed ? (
                            <span className="rounded-full bg-[#e7f6ec] px-2 py-0.5 text-xs font-semibold text-[#14703a]">
                              {c.plan === 'yearly' ? 'Annuel' : 'Mensuel'}
                            </span>
                          ) : (
                            <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 text-xs font-semibold text-ink/60">Sans offre</span>
                          )}
                          {c.price != null && (
                            <span className="mt-1 block text-xs whitespace-nowrap text-ink/60 tabular-nums">
                              {euros(c.price)} / {c.plan === 'yearly' ? 'an' : 'mois'}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {c.vehicles === null ? (
                            <span className="text-ink/40">PayByPhone illisible</span>
                          ) : (
                            <>
                              <span className="font-semibold text-ink">
                                {c.vehicles.length} véhicule{c.vehicles.length > 1 ? 's' : ''}
                              </span>
                              <ul className="mt-1 space-y-0.5 text-xs">
                                {c.vehicles.map((v) => (
                                  <li key={v.plate} className="whitespace-nowrap">
                                    <Plate plate={v.plate} size="sm" />{' '}
                                    {v.expire ? (
                                      <span className="text-[#14703a]">· en cours, jusqu’au {ends(v.expire)}</span>
                                    ) : (
                                      <span className="text-destructive">· aucun ticket</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{c.renewals}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
        {/* The place of Cloudflare's box kept from the start: nothing moves when it shows up. */}
        {human.enabled && <div ref={human.box} className="mt-4 h-[65px]" />}
        {(error || human.failed) && <p className={`mt-4 ${ui.error}`}>{error || human.failed}</p>}
        <button type="submit" disabled={busy} className={`mt-6 ${ui.primary}`}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}
