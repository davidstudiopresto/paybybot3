import { useEffect, useMemo, useState } from 'react'
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

/** Time left on a ticket: « 2 j 4 h », « 3 h 20 min », « 12 min »; null once it has ended. */
function left(iso: string, now: number) {
  const m = Math.floor((new Date(iso).getTime() - now) / 60000)
  if (m <= 0) return null
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return d ? `${d} j ${h} h` : h ? `${h} h ${m % 60} min` : `${m % 60} min`
}

/** One row per vehicle (or per client when PayByPhone could not be read). */
type Row = {
  plate: string | null
  name: string
  email: string
  created: string
  offer: 'Annuel' | 'Mensuel' | 'Sans offre'
  price: string
  ticket: 'En cours' | 'Aucun' | 'Illisible'
  expire: string | null
  left: string | null
  /** ok: subscribed and covered; alert: subscribed and no time left (a real problem); none: no offer running. */
  status: 'ok' | 'alert' | 'none'
}

const STATUS_TEXT = { ok: 'OK', alert: 'Problème', none: 'Sans offre' } as const
const COLUMNS: { key: keyof Row; label: string; choices?: string[] }[] = [
  { key: 'plate', label: 'Véhicule' },
  { key: 'name', label: 'Client' },
  { key: 'email', label: 'E-mail' },
  { key: 'created', label: 'Inscrit le' },
  { key: 'offer', label: 'Offre', choices: ['Annuel', 'Mensuel', 'Sans offre'] },
  { key: 'ticket', label: 'Ticket', choices: ['En cours', 'Aucun', 'Illisible'] },
  { key: 'left', label: 'Expire' },
  { key: 'status', label: 'État', choices: ['OK', 'Problème', 'Sans offre'] },
]

function rowsOf(clients: AdminClient[], now: number): Row[] {
  return clients.flatMap((c) => {
    const base = {
      name: c.name || '—',
      email: c.email || '—',
      created: new Date(c.created).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }),
      offer: (c.subscribed ? (c.plan === 'yearly' ? 'Annuel' : 'Mensuel') : 'Sans offre') as Row['offer'],
      price: c.price != null ? `${euros(c.price)} / ${c.plan === 'yearly' ? 'an' : 'mois'}` : '',
    }
    if (c.vehicles === null) return [{ ...base, plate: null, ticket: 'Illisible', expire: null, left: null, status: c.subscribed ? 'alert' : 'none' } as Row]
    return c.vehicles.map((v) => {
      const rest = v.expire ? left(v.expire, now) : null
      return {
        ...base,
        plate: v.plate,
        ticket: rest ? 'En cours' : 'Aucun',
        expire: rest ? v.expire : null,
        left: rest,
        status: !c.subscribed ? 'none' : rest ? 'ok' : 'alert',
      } as Row
    })
  })
}

/** The text a column is filtered on. */
const cell = (r: Row, key: keyof Row) => (key === 'status' ? STATUS_TEXT[r.status] : key === 'left' ? (r.expire ? `${ends(r.expire)} ${r.left}` : '') : String(r[key] ?? ''))

function VehicleTable({ clients }: { clients: AdminClient[] }) {
  const [filters, setFilters] = useState<Partial<Record<keyof Row, string>>>({})
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  // Problems first, then covered vehicles, then those without an offer.
  const rows = useMemo(() => {
    const order = { alert: 0, ok: 1, none: 2 }
    return rowsOf(clients, now).sort((a, b) => order[a.status] - order[b.status])
  }, [clients, now])
  const shown = rows.filter((r) =>
    COLUMNS.every(({ key, choices }) => {
      const f = filters[key]
      if (!f) return true
      return choices ? cell(r, key) === f : cell(r, key).toLowerCase().includes(f.toLowerCase())
    }),
  )
  const alerts = rows.filter((r) => r.status === 'alert').length
  const vehicles = rows.filter((r) => r.plate).length
  const field = 'mt-2 h-8 w-full min-w-0 rounded-lg border border-ink/10 bg-white px-2 text-xs font-normal text-ink outline-none focus:border-eu'

  return (
    <>
      <p className="mt-2 text-sm text-ink/55">
        {vehicles} véhicule{vehicles > 1 ? 's' : ''}
        {alerts > 0 && <span className="font-semibold text-destructive"> · {alerts} sans ticket alors que l’abonnement est actif</span>}
        {shown.length !== rows.length && <> · {shown.length} ligne{shown.length > 1 ? 's' : ''} affichée{shown.length > 1 ? 's' : ''}</>}
      </p>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-ink/10 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink/[0.03] align-top text-ink/55">
            <tr>
              {COLUMNS.map(({ key, label, choices }) => (
                <th key={key} className={`px-3 py-3 font-medium ${choices ? 'min-w-[7.5rem]' : ''}`}>
                  {label}
                  {choices ? (
                    <select value={filters[key] ?? ''} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })} className={field} aria-label={`Filtrer : ${label}`}>
                      <option value="">Tous</option>
                      {choices.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={filters[key] ?? ''} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })} placeholder="Filtrer" className={field} aria-label={`Filtrer : ${label}`} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className={`border-t border-ink/10 ${r.status === 'alert' ? 'bg-destructive/[0.04]' : ''}`}>
                <td className="px-3 py-3 whitespace-nowrap">{r.plate ? <Plate plate={r.plate} size="sm" /> : <span className="text-ink/40">—</span>}</td>
                <td className="px-3 py-3 font-semibold text-ink">{r.name}</td>
                <td className="px-3 py-3 text-ink/70">{r.email}</td>
                <td className="px-3 py-3 whitespace-nowrap text-ink/70 tabular-nums">{r.created}</td>
                <td className="px-3 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.offer === 'Sans offre' ? 'bg-ink/[0.06] text-ink/60' : 'bg-[#e7f6ec] text-[#14703a]'}`}
                  >
                    {r.offer}
                  </span>
                  {r.price && <span className="mt-1 block text-xs whitespace-nowrap text-ink/60 tabular-nums">{r.price}</span>}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  {r.ticket === 'En cours' ? (
                    <span className="text-[#14703a]">En cours</span>
                  ) : r.ticket === 'Aucun' ? (
                    <span className="text-ink/50">Aucun</span>
                  ) : (
                    <span className="text-ink/40">PayByPhone illisible</span>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap tabular-nums">
                  {r.expire ? (
                    <>
                      <span className="text-ink">{ends(r.expire)}</span>
                      <span className="block text-xs text-ink/55">reste {r.left}</span>
                    </>
                  ) : (
                    <span className="text-ink/40">—</span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <span
                    title={STATUS_TEXT[r.status]}
                    className={`grid size-6 place-items-center rounded-full text-xs font-bold text-white ${
                      r.status === 'ok' ? 'bg-[#1f9d55]' : r.status === 'alert' ? 'bg-destructive' : 'bg-ink/15'
                    }`}
                  >
                    {r.status === 'ok' ? '✓' : r.status === 'alert' ? '!' : ''}
                  </span>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-6 text-center text-ink/50">
                  Aucun véhicule ne correspond aux filtres.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

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
      <main className="mx-auto max-w-6xl px-6 pt-12 pb-20">
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
            {clients && clients.length > 0 && <VehicleTable clients={clients} />}
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
