import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Infinity as Endless, LogOut } from 'lucide-react'
import { arrondissement, Plate, vehicleType, ZonePlate, withPayByPhone } from '@/components/signs'
import { TopBar } from '@/components/TopBar'
import { AccountButton } from '@/components/Account'
import { TrialBanner } from '@/components/Pricing'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'
import { HostedFooter } from '@/components/Footer'
import { ActivateRenewal, CardGate, RenewalActions, RenewalNote, ResidentGate, RiverainCard, WEEKLY_LABEL, renewalOf, runPendingRenewals } from '@/components/Riverain'
import { api, clock, remaining, type Account, type Me, type Overview, type Session } from '@/lib/api'

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
  data,
  onRefresh,
  hosted,
  demo,
}: {
  session: Session
  now: number
  data: Overview
  onRefresh: () => Promise<void>
  hosted: boolean
  demo: boolean
}) {
  const renewal = renewalOf(data, session)
  const start = new Date(session.start).getTime()
  const end = new Date(session.expire).getTime()
  const left = end - now
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start || 1)))
  const soon = left < 15 * 60000

  return (
    <article className="rise rounded-2xl border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <Plate plate={session.plate} size="sm" />
          <ZonePlate zone={session.location} />
        </span>
      </div>
      <p className="mt-5 text-sm text-ink/55">Temps restant</p>
      <p className={`mt-1 font-heading text-[2.6rem] leading-none font-bold tracking-tight tabular-nums ${soon ? 'text-destructive' : 'text-ink'}`}>
        {remaining(left)}
      </p>
      {/* No renewal yet: the end of the ticket in red, to urge setting one up. */}
      <p className={`mt-2 ${renewal ? 'text-muted-foreground' : 'font-medium text-destructive'}`}>Expire {clock(session.expire)}</p>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${soon ? 'bg-destructive' : 'bg-eu'}`}
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>
      {renewal && (
        <div className="mt-4 flex items-start justify-between gap-4">
          <p className="flex gap-2 text-sm text-ink/70">
            <Endless className="mt-0.5 size-4 shrink-0 text-eu" strokeWidth={2.25} />
            <span>
              <RenewalNote ap={renewal} onChanged={onRefresh} next={session.expire} />
            </span>
          </p>
        </div>
      )}
      {renewal && <RenewalActions ap={renewal} onChanged={onRefresh} className="mt-4" />}
      {!renewal && (
        <div className="mt-5">
          <ActivateRenewal data={data} onChanged={onRefresh} hosted={hosted} demo={demo} plate={session.plate} label="Automatiser le renouvellement" />
        </div>
      )}
    </article>
  )
}

/** The cars with no ticket: plate, type, zone and the resident week's price, one card each. */
function IdleVehicles({ data, onChanged, hosted, demo }: { data: Overview; onChanged: () => void; hosted: boolean; demo?: boolean }) {
  const key = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const [weeks, setWeeks] = useState<Record<string, number | null>>({})
  useEffect(() => {
    let cancelled = false
    api.pricing().then(
      (p) => !cancelled && setWeeks(Object.fromEntries((p.vehicles ?? []).map((v) => [key(v.plate), v.weekly ?? null]))),
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [data.vehicles.length])
  const renewed = new Set(data.autopilots.filter((ap) => ap.label === WEEKLY_LABEL).map((ap) => key(ap.plate)))
  const parked = new Set(data.sessions.filter((s) => new Date(s.expire).getTime() > Date.now()).map((s) => key(s.plate)))
  const cars = data.vehicles.filter((v) => !renewed.has(key(v.plate)) && !parked.has(key(v.plate)))
  if (!cars.length) return null
  const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
  return (
    <div className="mt-6 space-y-3">
      {cars.map((v) => {
        const week = weeks[key(v.plate)]
        const place = v.zone ? arrondissement(v.zone) : null
        return (
          <div key={v.plate} className="rounded-2xl border border-border p-5">
            <Plate plate={v.plate} />
            <dl className="mt-4 space-y-1 text-[0.95rem] text-ink/60">
              {vehicleTypeLabel(v.type) && (
                <div>
                  <dt className="inline">Véhicule : </dt>
                  <dd className="inline text-ink">{vehicleTypeLabel(v.type)}</dd>
                </div>
              )}
              {v.zone && (
                <div>
                  <dt className="inline">Zone : </dt>
                  <dd className="inline text-ink">{place ? `${place} (${v.zone})` : v.zone}</dd>
                </div>
              )}
              {week != null && (
                <div>
                  <dt className="inline">Abonnement résident : </dt>
                  <dd className="inline text-ink">{euros(week)} / semaine</dd>
                </div>
              )}
            </dl>
            <div className="mt-5">
              <ActivateRenewal data={data} onChanged={onChanged} hosted={hosted} demo={demo} plate={v.plate} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function Dashboard({
  me,
  data,
  onRefresh,
  onLogout,
  onDeleted,
}: {
  me: Me
  data: Overview | null
  onRefresh: () => Promise<void>
  onPay?: () => void
  onLogout: () => void
  onDeleted?: () => void
}) {
  const now = useNow()
  const [account, setAccount] = useState<Account | null>(null)
  useEffect(() => {
    // Back from Stripe Checkout: record the subscription, then show the account as it is now.
    const done = window.location.hash.match(/session_id=(cs_[A-Za-z0-9_]+)/)
    const confirm = done
      ? api.confirmCheckout(done[1]).then(
          async (r) => {
            history.replaceState(null, '', window.location.pathname)
            const offer = `Offre ${r.plan === 'yearly' ? 'annuelle' : 'mensuelle'} activée.`
            // The renewal chosen just before Stripe is activated now.
            toast.success(offer, { description: "Rien n'est prélevé avant la fin de votre mois offert." })
            const { done: renewed, failed, shown } = await runPendingRenewals()
            if (renewed) {
              if (!shown)
                toast.success(renewed > 1 ? `Renouvellement activé pour ${renewed} véhicules.` : 'Renouvellement activé.')
              onRefresh()
            }
            if (failed.length) toast.error(failed.join('\n'))
          },
          (e) => toast.error((e as Error).message),
        )
      : Promise.resolve()
    confirm.then(() => api.account().then(setAccount, () => {}))
  }, [])
  // Resident status on PayByPhone: without it, nothing to renew (and no subscription).
  const [resident, setResident] = useState<{ zone: string | null; resident: boolean | null } | null>(null)
  const checkResident = useCallback(() => {
    if (!me.demo) api.residentStatus().then(setResident, () => {})
  }, [me.demo])
  useEffect(checkResident, [checkResident])
  const sessions = data?.sessions.filter((s) => new Date(s.expire).getTime() > now) ?? []
  const renewing = !!data?.autopilots.some((ap) => ap.label === WEEKLY_LABEL)

  // Fresh data when coming back to the tab (it also refreshes every minute).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && onRefresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [onRefresh])

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {/* No resident rate on PayByPhone: PayByBot is not usable, the page stays blurred behind the notice. */}
      {resident?.resident === false && !me.demo ? (
        <ResidentGate zone={resident.zone} vehicles={data?.vehicles.length} onChecked={setResident} />
      ) : (
        // No card saved on PayByPhone (removed since, Apple Pay only): PayByBot cannot pay, so it is not usable.
        data && !me.demo && !data.payments.some((p) => p.kind === 'card') && <CardGate />
      )}
      <TrialBanner
        trialEnd={account?.trialEnd ?? null}
        plan={account?.plan ?? null}
        blocked={account?.blocked ?? null}
        graceEnd={account?.graceEnd ?? null}
      />
      <TopBar>
        {me.demo && (
          <span className="inline-flex h-9 items-center rounded-full bg-amber/25 px-3 text-sm font-semibold text-ink sm:h-10 sm:px-4 sm:text-[0.95rem]">
            Démo
          </span>
        )}
        <AccountButton data={data} onDeleted={onDeleted ?? onLogout} demo={me.demo} />
        <button onClick={onLogout} aria-label="Déconnexion" title="Déconnexion" className={cn(ui.pillGray, 'gap-2')}>
          <LogOut className="size-4" /> <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </TopBar>

      <main className="mx-auto w-full max-w-[34rem] flex-1 px-6 pt-12 pb-16">
        <p className="rise text-lg text-ink/60">{me.firstName ? `Bonjour ${me.firstName},` : 'Bonjour,'}</p>
        <h1 className="rise mt-1 font-heading text-[2.6rem] leading-[1.05] font-medium tracking-[-0.035em]">
          {!data ? '…' : sessions.length ? 'Vous êtes en règle.' : 'Aucun ticket en cours.'}
        </h1>
        <p className="mt-3 text-[1.05rem] text-ink/60">
          {!data
            ? withPayByPhone('Chargement de votre compte PayByPhone.')
            : sessions.length
              ? sessions.length > 1
                ? `${sessions.length} tickets en cours.`
                : 'Votre ticket en cours :'
              : "Aucun véhicule n'est couvert en ce moment."}
        </p>

        {data && sessions.length > 0 && (
          <div className="mt-6 space-y-3">
            {sessions.map((s) => (
              <Ticket key={s.id} session={s} now={now} data={data} onRefresh={onRefresh} hosted={!!me.hosted} demo={me.demo} />
            ))}
          </div>
        )}

        {/* The renewal is the one action of the app: no one-off payment button. */}
        {/* The cars with neither a ticket nor a renewal: one card each, with its button. */}
        {data && <IdleVehicles data={data} onChanged={onRefresh} hosted={!!me.hosted} demo={me.demo} />}

        {/* Every car's card has its own button: this block only lists renewals without a ticket (or offers one
            when PayByPhone lists no car). */}
        {(renewing || !data?.vehicles.length) && (
          <div className={renewing ? 'mt-6' : 'mt-10 border-t border-border pt-8'}>
            <RiverainCard data={data} onChanged={onRefresh} hosted={!!me.hosted} demo={me.demo} />
          </div>
        )}
      </main>

      <HostedFooter className="px-6 pb-8" hosted={!!me.hosted} />
    </div>
  )
}

/** PayByPhone's vehicle type, in French (unknown: as given). */
function vehicleTypeLabel(type?: string) {
  if (!type) return null
  return vehicleType(type) ?? type
}
