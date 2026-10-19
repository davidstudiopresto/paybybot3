import { useEffect, useState } from 'react'
import { CreditCard, LogOut, Plus, RefreshCw, SquareParking } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ActionTile, Plate, Wordmark, ZonePlate } from '@/components/signs'
import { ExtendDialog } from '@/components/Extend'
import { HostedFooter } from '@/components/Footer'
import { RiverainCard } from '@/components/Riverain'
import { clock, money, remaining, type Me, type Overview, type Session } from '@/lib/api'

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

function Ticket({
  session,
  now,
  index,
  data,
  onRefresh,
}: {
  session: Session
  now: number
  index: number
  data: Overview
  onRefresh: () => Promise<void>
}) {
  const [extending, setExtending] = useState(false)
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
      <div className="perforated relative flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t-2 border-dashed border-border bg-accent/60 px-6 py-4 sm:w-44 sm:flex-col sm:flex-nowrap sm:justify-center sm:border-t-0 sm:border-l-2">
        <span className="flex items-center gap-2 text-sm font-bold text-go">
          <span className="blink size-2.5 rounded-full bg-go" /> Payé
        </span>
        <span className="font-heading text-2xl font-black">{money(session.cost)}</span>
        <Button onClick={() => setExtending(true)} className="h-12 w-full rounded-xl px-4 font-bold sm:h-11 sm:w-auto">
          <Plus className="size-4" /> Prolonger
        </Button>
      </div>
      <ExtendDialog session={session} data={data} open={extending} onOpenChange={setExtending} onDone={onRefresh} />
    </article>
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
          <Button variant="outline" size="lg" onClick={refresh} className="h-12 self-start rounded-xl bg-enamel px-4 sm:self-auto">
            <RefreshCw className={`size-5 ${refreshing ? 'animate-spin' : ''}`} /> Actualiser
          </Button>
        </section>

        {/* The two main actions, same size side by side */}
        <section className="mt-8 grid gap-5 md:grid-cols-2">
          <ActionTile
            tone="signal"
            icon={<SquareParking />}
            eyebrow="Ponctuel"
            title="Payer un stationnement"
            text="Choisissez la zone, le tarif et la durée. Le prix exact s'affiche avant de payer."
            cta="Payer"
            onClick={onPay}
            disabled={!data}
          />
          <RiverainCard data={data} onChanged={onRefresh} hosted={!!me.hosted} demo={me.demo} />
        </section>

        <div className="kerb my-8" aria-hidden />

        {/* Active tickets */}
        {!data ? (
          <div className="h-48 animate-pulse rounded-2xl bg-enamel/70" />
        ) : sessions.length ? (
          <div className="grid gap-5">
            {sessions.map((s, i) => (
              <Ticket key={s.id} session={s} now={now} index={i} data={data} onRefresh={onRefresh} />
            ))}
          </div>
        ) : (
          <p className="rise rounded-2xl bg-muted/70 px-6 py-5 text-lg text-muted-foreground">
            Aucune voiture n'est couverte en ce moment.
          </p>
        )}

        {/* Account details */}
        <section className="mt-14">
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
        </section>
        <HostedFooter className="mt-14" hosted={!!me.hosted} />
      </main>
    </div>
  )
}
