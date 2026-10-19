import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, CreditCard, LogOut, Plus, RefreshCw, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plate, Wordmark, ZonePlate } from '@/components/signs'
import { api, clock, money, remaining, unitLabel, type Autopilot, type Me, type Overview, type Session } from '@/lib/api'

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

function Ticket({ session, now, index }: { session: Session; now: number; index: number }) {
  const start = new Date(session.start).getTime()
  const end = new Date(session.expire).getTime()
  const left = end - now
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start || 1)))
  const soon = left < 15 * 60000

  return (
    <article
      className="rise relative flex flex-col overflow-hidden rounded-2xl bg-enamel shadow-[0_1px_0_var(--border),0_18px_40px_-24px_rgb(13_24_48/0.45)] sm:flex-row"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Plate plate={session.plate} />
          <ZonePlate zone={session.location} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-[0.15em] text-muted-foreground uppercase">Temps restant</p>
          <p className={`font-heading text-5xl leading-none font-black tabular-nums ${soon ? 'text-destructive' : 'text-ink'}`}>
            {remaining(left)}
          </p>
          <p className="mt-2 text-muted-foreground">
            Valable jusqu'à <strong className="text-ink">{clock(session.expire)}</strong>
          </p>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ${soon ? 'bg-destructive' : 'bg-go'}`}
            style={{ width: `${(1 - progress) * 100}%` }}
          />
        </div>
      </div>
      {/* Ticket stub */}
      <div className="perforated relative flex items-center justify-between gap-4 border-t-2 border-dashed border-border bg-accent/60 px-6 py-4 sm:w-44 sm:flex-col sm:justify-center sm:border-t-0 sm:border-l-2">
        <span className="flex items-center gap-2 text-sm font-bold text-go">
          <span className="blink size-2.5 rounded-full bg-go" /> Payé
        </span>
        <span className="font-heading text-2xl font-black">{money(session.cost)}</span>
      </div>
    </article>
  )
}

function AutopilotRow({ ap, onDelete }: { ap: Autopilot; onDelete: () => void }) {
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-border bg-enamel p-4">
      <Plate plate={ap.plate} size="sm" />
      <ZonePlate zone={ap.location} className="scale-90" />
      <div className="min-w-0 flex-1">
        <p className="font-bold">
          {ap.label || 'Renouvellement'} · {ap.duration} {unitLabel(ap.unit, ap.duration)}
        </p>
        <p className="text-sm text-muted-foreground">
          {ap.lastError ? (
            <span className="text-destructive">{ap.lastError}</span>
          ) : ap.lastPayment ? (
            <>Dernier paiement {clock(ap.lastPayment)}</>
          ) : (
            <>Surveille la zone et repaie dès que le ticket expire.</>
          )}
        </p>
      </div>
      <Badge className="bg-go/15 text-go">Actif</Badge>
      <Button variant="ghost" size="icon-lg" onClick={onDelete} aria-label="Arrêter ce renouvellement">
        <Trash2 className="size-5" />
      </Button>
    </li>
  )
}

export function Dashboard({
  me,
  data,
  onRefresh,
  onPay,
  onLogout,
}: {
  me: Me
  data: Overview | null
  onRefresh: () => Promise<void>
  onPay: () => void
  onLogout: () => void
}) {
  const now = useNow()
  const [refreshing, setRefreshing] = useState(false)
  const sessions = data?.sessions.filter((s) => new Date(s.expire).getTime() > now) ?? []

  async function refresh() {
    setRefreshing(true)
    await onRefresh()
    setRefreshing(false)
  }

  async function removeAutopilot(id: string) {
    await api.deleteAutopilot(id)
    toast.success('Renouvellement automatique arrêté.')
    onRefresh()
  }

  return (
    <div className="grain min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Wordmark />
          <div className="flex items-center gap-2">
            {me.demo && <Badge className="bg-amber text-ink">Mode démo</Badge>}
            <span className="hidden text-sm text-muted-foreground sm:inline">{me.username}</span>
            <Button variant="ghost" size="lg" onClick={onLogout}>
              <LogOut className="size-4" /> <span className="hidden sm:inline">Déconnexion</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 pt-10 pb-24">
        {/* Hero action */}
        <section className="rise flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">Mon stationnement</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight sm:text-5xl">
              {sessions.length ? 'Vous êtes en règle.' : 'Aucun ticket en cours.'}
            </h1>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" size="icon" onClick={refresh} className="size-14 rounded-xl bg-enamel" aria-label="Actualiser">
              <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
            <Button onClick={onPay} className="h-14 rounded-xl px-6 text-lg font-bold shadow-[0_4px_0_var(--signal-deep)] active:translate-y-1 active:shadow-none">
              <Plus className="size-5" /> Payer un stationnement
            </Button>
          </div>
        </section>

        <div className="kerb my-8" aria-hidden />

        {/* Active tickets */}
        {!data ? (
          <div className="h-48 animate-pulse rounded-2xl bg-enamel/70" />
        ) : sessions.length ? (
          <div className="grid gap-5">
            {sessions.map((s, i) => (
              <Ticket key={s.id} session={s} now={now} index={i} />
            ))}
          </div>
        ) : (
          <button
            onClick={onPay}
            className="rise group flex w-full flex-col items-center gap-3 rounded-2xl border-[3px] border-dashed border-input bg-enamel/50 px-6 py-14 text-center transition hover:border-signal hover:bg-enamel"
          >
            <Clock3 className="size-10 text-muted-foreground transition group-hover:text-signal" />
            <span className="font-heading text-2xl font-extrabold">Votre voiture n'est pas couverte</span>
            <span className="max-w-md text-muted-foreground">
              Cliquez ici pour payer votre stationnement. Comptez moins d'une minute.
            </span>
          </button>
        )}

        {/* Autopilot */}
        <section className="mt-14">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-go text-white">
              <Repeat className="size-5" />
            </span>
            <div>
              <h2 className="text-2xl font-extrabold">Renouvellement automatique</h2>
              <p className="text-muted-foreground">
                L'application repaie votre ticket dès qu'il expire, tant qu'elle reste ouverte sur cet ordinateur.
              </p>
            </div>
          </div>
          {data?.autopilots.length ? (
            <ul className="mt-5 grid gap-3">
              {data.autopilots.map((ap) => (
                <AutopilotRow key={ap.id} ap={ap} onDelete={() => removeAutopilot(ap.id)} />
              ))}
            </ul>
          ) : (
            <p className="mt-5 rounded-xl bg-muted/70 px-5 py-4 text-muted-foreground">
              Aucun renouvellement programmé. Vous pourrez l'activer à la dernière étape du paiement.
            </p>
          )}
        </section>

        {/* Account details */}
        <section className="mt-14 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-enamel p-6">
            <h2 className="text-xl font-extrabold">Mes véhicules</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              {data?.vehicles.length ? (
                data.vehicles.map((v) => <Plate key={v.plate} plate={v.plate} />)
              ) : (
                <p className="text-muted-foreground">Ajoutez un véhicule dans l'application PayByPhone.</p>
              )}
            </div>
            <h2 className="mt-8 text-xl font-extrabold">Moyens de paiement</h2>
            <ul className="mt-3 space-y-2">
              {data?.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3">
                  <CreditCard className="size-5 text-signal" /> {p.label}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-enamel p-6">
            <h2 className="text-xl font-extrabold">Activité récente</h2>
            {data?.history.length ? (
              <ul className="mt-4 space-y-3">
                {data.history.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    {h.kind === 'success' ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-go" />
                    ) : (
                      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    )}
                    <span>
                      {h.message}
                      <span className="block text-sm text-muted-foreground">{clock(h.at)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-muted-foreground">Rien pour l'instant.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
