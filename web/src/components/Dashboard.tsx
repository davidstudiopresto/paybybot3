import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LogOut } from 'lucide-react'
import { arrondissement, Plate, plateText, vehicleType, withPayByPhone } from '@/components/signs'
import { TopBar } from '@/components/TopBar'
import { InviteButton } from '@/components/Invite'
import { DailyTickets } from '@/components/DailyTickets'
import { AccountButton } from '@/components/Account'
import { TrialBanner } from '@/components/Pricing'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'
import { HostedFooter } from '@/components/Footer'
import { CheckoutDone } from '@/components/CheckoutDone'
import { ActivateRenewal, CardGate, RenewalActions, RenewalNote, RenewalSwitch, pauseState, RiverainCard, WEEKLY_LABEL, renewalOf, runPendingRenewals } from '@/components/Riverain'
import { api, clock, remaining, type Account, type Me, type Overview, type Session } from '@/lib/api'

function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(id)
  }, [interval])
  return now
}

/** « mer. 29 oct. à 20h » (minutes only when not on the hour). */
function when(t: number) {
  const d = new Date(t)
  const day = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} à ${d.getHours()}h${d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : ''}`
}

/** When this week will be renewed: the server's next look if it is ahead, else the rule it follows (20h the day
 *  before the end, never more than 24 hours before it). */
function nextRenewal(nextCheck: string | null | undefined, expire: string) {
  const end = new Date(expire).getTime()
  const planned = nextCheck ? new Date(nextCheck).getTime() : NaN
  if (planned > Date.now() && planned <= end + 60_000) return planned
  const dayBefore = new Date(end - 86_400_000)
  dayBefore.setHours(20, 0, 0, 0)
  return Math.max(dayBefore.getTime(), end - 86_400_000 + 60_000)
}

function Ticket({
  session,
  now,
  data,
  onRefresh,
  hosted,
  demo,
  autoOpen = false,
  locked = false,
  onLogout,
  daily = false,
}: {
  session: Session
  now: number
  data: Overview
  onRefresh: () => Promise<void>
  hosted: boolean
  demo: boolean
  autoOpen?: boolean
  locked?: boolean
  onLogout?: () => void
  /** A non-resident ticket: no weekly renewal switch. */
  daily?: boolean
}) {
  const renewal = renewalOf(data, session)
  // The weekly renewal is for resident tickets only: a non-resident ticket (visitor, Handi…) shows no switch, unless
  // it is already renewed; tickets on chosen days are set up in « Tickets non-résident ».
  const renewable = (!daily && session.resident !== false) || !!renewal
  const start = new Date(session.start).getTime()
  const end = new Date(session.expire).getTime()
  const left = end - now
  const progress = Math.min(1, Math.max(0, (now - start) / (end - start || 1)))
  const soon = left < 15 * 60000

  const place = arrondissement(session.location) ?? `Zone ${session.location}`
  // A line under the switch only when something needs saying (failure, suspended, pause).
  const note = renewal && (renewal.lastError || !renewal.enabled || pauseState(renewal).paused)

  // Qonto-like: one white card, hairline dividers, a muted teal accent.
  return (
    <article className="rise overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-4">
        <span className="flex items-baseline gap-3">
          <span className="text-[1.05rem] font-medium text-ink">{withPayByPhone('PayByPhone')}</span>
          <span className="tracking-wide text-ink/50 tabular-nums">{plateText(session.plate)}</span>
        </span>
        <span className="text-sm text-ink/50">{place}</span>
      </div>

      {renewable && (
      <div className="border-t border-ink/[0.06] px-5 py-4">
        <RenewalSwitch
          ap={renewal ?? null}
          data={data}
          plate={session.plate}
          onChanged={onRefresh}
          hosted={hosted}
          demo={demo}
          autoOpen={autoOpen}
          locked={locked}
          onLogout={onLogout}
        />
        {note && (
          <p className="mt-2 text-sm text-ink/70">
            <RenewalNote ap={renewal} onChanged={onRefresh} next={session.expire} />
          </p>
        )}
        {/* Renewal on and nothing wrong: when the next week is paid, and when the last one was. */}
        {renewal && renewal.enabled && !note && (
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-ink/50">Prochain renouvellement</dt>
              <dd className="text-ink tabular-nums">{when(nextRenewal(renewal.nextCheck, session.expire))}</dd>
            </div>
            {renewal.lastPayment && (
              <div className="flex justify-between gap-4">
                <dt className="text-ink/50">Dernier paiement</dt>
                <dd className="text-ink tabular-nums">{when(new Date(renewal.lastPayment).getTime())}</dd>
              </div>
            )}
          </dl>
        )}
        {renewal && renewal.enabled && !note && (
          <p className="mt-3 flex items-center gap-2 text-sm text-[#3d7f84]">
            <svg viewBox="0 0 16 16" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3.5 8.5l3 3 6-7" />
            </svg>
            Rien à faire de votre côté.
          </p>
        )}
      </div>
      )}

      <div className="border-t border-ink/[0.06] px-5 pt-4 pb-5">
        {/* Renewal on: no countdown (nothing to watch), only when the ticket ends. Without one, the time left. */}
        {renewal && renewal.enabled && !note && <p className="mb-1 text-[0.95rem] font-medium text-ink">Ticket en cours</p>}
        {!(renewal && renewal.enabled && !note) && (
          <>
            <p className="text-sm text-ink/50">Temps restant</p>
            <p className={`mt-1 mb-2 font-heading text-[2.4rem] leading-none font-bold tracking-tight tabular-nums ${soon ? 'text-destructive' : 'text-ink'}`}>
              {remaining(left)}
            </p>
          </>
        )}
        {/* No renewal yet: the end of the ticket in red, to urge setting one up. */}
        <p className={`text-sm ${renewal || !renewable ? 'text-ink/50' : 'font-medium text-destructive'}`}>Expire {clock(session.expire)}</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden>
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ${soon ? 'bg-destructive' : 'bg-[#4e9aa0]'}`}
            style={{ width: `${(1 - progress) * 100}%` }}
          />
        </div>
        {renewal && <RenewalActions ap={renewal} onChanged={onRefresh} withStop={false} className="mt-5" />}
      </div>
    </article>
  )
}

/** The cars with no ticket: plate, type, zone and the resident week's price, one card each. */
const plateKey = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
const sameCar = (a: string, b: string) => a.replace(/[^0-9a-z]/gi, '').toUpperCase() === b.replace(/[^0-9a-z]/gi, '').toUpperCase()

function IdleVehicles({ data, onChanged, hosted, demo, autoPlate, locked, onLogout }: { data: Overview; onChanged: () => void; hosted: boolean; demo?: boolean; autoPlate?: string | null; locked?: boolean; onLogout?: () => void }) {
  const key = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const [weeks, setWeeks] = useState<Record<string, number | null>>({})
  // The vehicles with the resident rate on PayByPhone (a zone in the pricing); null while looking.
  const [residents, setResidents] = useState<Set<string> | null>(null)
  useEffect(() => {
    let cancelled = false
    api.pricing().then(
      (p) => {
        if (cancelled) return
        setWeeks(Object.fromEntries((p.vehicles ?? []).map((v) => [key(v.plate), v.weekly ?? null])))
        setResidents(new Set((p.vehicles ?? []).filter((v) => v.zone).map((v) => key(v.plate))))
      },
      () => {},
    )
    return () => {
      cancelled = true
    }
  }, [data.vehicles.length])
  const renewed = new Set(data.autopilots.filter((ap) => ap.label === WEEKLY_LABEL).map((ap) => key(ap.plate)))
  const parked = new Set(data.sessions.filter((s) => new Date(s.expire).getTime() > Date.now()).map((s) => key(s.plate)))
  // Only vehicles with the resident rate get « Activer le renouvellement résident »: the others take tickets on
  // chosen days (Tickets non-résident, below).
  const isResident = (v: { plate: string; zone?: string | null }) => (residents ? residents.has(key(v.plate)) : !!v.zone)
  const cars = data.vehicles.filter((v) => isResident(v) && !renewed.has(key(v.plate)) && !parked.has(key(v.plate)))
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
              <ActivateRenewal data={data} onChanged={onChanged} hosted={hosted} demo={demo} plate={v.plate} autoOpen={!!autoPlate && key(autoPlate) === key(v.plate)} locked={!!locked && !!autoPlate && key(autoPlate) === key(v.plate)} onLogout={onLogout} />
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
  autoRenew = false,
}: {
  /** Just past the welcome page: open the renewal of the first car at once. */
  autoRenew?: boolean
  me: Me
  data: Overview | null
  onRefresh: () => Promise<void>
  onPay?: () => void
  onLogout: () => void
  onDeleted?: () => void
}) {
  const now = useNow()
  const [account, setAccount] = useState<Account | null>(null)
  const [checkoutDone, setCheckoutDone] = useState(false)
  useEffect(() => {
    // Back from Stripe Checkout: record the subscription, then show the account as it is now.
    const done = window.location.hash.match(/session_id=(cs_[A-Za-z0-9_]+)/)
    const confirm = done
      ? api.confirmCheckout(done[1]).then(
          async () => {
            history.replaceState(null, '', window.location.pathname)
            // The confirmation screen (its animation says it); the renewal chosen just before Stripe is activated now.
            setCheckoutDone(true)
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
  // The vehicles with the resident rate on PayByPhone (a zone in the pricing); null while looking.
  const [residentPlates, setResidentPlates] = useState<Set<string> | null>(null)
  useEffect(() => {
    api.pricing().then(
      (p) => setResidentPlates(new Set((p.vehicles ?? []).filter((v) => v.zone).map((v) => plateKey(v.plate)))),
      () => setResidentPlates(new Set()),
    )
  }, [me.hosted, me.demo, data?.vehicles.length])
  const sessions = data?.sessions.filter((s) => new Date(s.expire).getTime() > now) ?? []
  const renewing = !!data?.autopilots.some((ap) => ap.label === WEEKLY_LABEL)
  // Right after the welcome page, nothing renewed yet: the renewal of the car with a ticket (else the first car)
  // opens by itself, then the offer comes when it is activated.
  // Online, no offer chosen yet: PayByBot is not usable before choosing one. With a resident vehicle, its renewal
  // dialog stays open (then the offer); without one, the « Programmer un ticket » wizard does (then the offer).
  const needsOffer = !!me.hosted && !me.demo && !!account && !account.subscribed && !account.blocked
  const live = data?.sessions.filter((s) => new Date(s.expire).getTime() > Date.now()) ?? []
  const isResidentCar = (plate: string) => (residentPlates ? residentPlates.has(plateKey(plate)) : true)
  // The car whose renewal opens: a resident ticket running, else a resident car without a ticket (its card is shown).
  const residentPlate = data
    ? (live.find((s) => s.resident !== false && isResidentCar(s.plate))?.plate ??
      data.vehicles.find((v) => isResidentCar(v.plate) && !live.some((s) => sameCar(s.plate, v.plate)))?.plate ??
      null)
    : null
  const locked = needsOffer && !renewing && !!residentPlates && !!residentPlate
  // No offer yet and no resident car: the ticket wizard opens by itself, but can be closed (the page stays usable);
  // its « Activer » leads to the offer, and the server refuses any ticket without one.
  const offerDaily = needsOffer && !!data && !data.autopilots.length && !!residentPlates && !residentPlate
  const autoPlate = (autoRenew || locked) && data && !renewing ? (residentPlate ?? data.vehicles[0]?.plate ?? null) : null

  // Fresh data when coming back to the tab (it also refreshes every minute).
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && onRefresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [onRefresh])

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      {checkoutDone && (
        <CheckoutDone
          // The car whose renewal was just activated (else the first car of the account).
          vehicle={(() => {
            const key = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
            const renewed = data?.autopilots.find((ap) => ap.label === WEEKLY_LABEL)
            const car = data?.vehicles.find((v) => !renewed || key(v.plate) === key(renewed.plate)) ?? data?.vehicles[0]
            return car ? { plate: car.plate, type: car.type, zone: car.zone ?? renewed?.location ?? null } : null
          })()}
          onClose={() => setCheckoutDone(false)}
        />
      )}
      {/* No card saved on PayByPhone (removed since, Apple Pay only): PayByBot cannot pay, so it is not usable. The
          only requirement: no resident rate is needed (non-residents take tickets on chosen days). */}
      {data && !me.demo && !data.payments.some((p) => p.kind === 'card') && <CardGate />}
      <TrialBanner
        blocked={account?.blocked ?? null}
        graceEnd={account?.graceEnd ?? null}
      />
      <TopBar>
        {me.demo && (
          <span className="inline-flex h-9 items-center rounded-full bg-amber/25 px-3 text-sm font-semibold text-ink sm:h-10 sm:px-4 sm:text-[0.95rem]">
            Démo
          </span>
        )}
        {/* Inviting a friend once the account is active (offer paid on Stripe). */}
        {account?.subscribed && <InviteButton disabled={!data} />}
        <AccountButton data={data} onDeleted={onDeleted ?? onLogout} demo={me.demo} />
        <button onClick={onLogout} aria-label="Déconnexion" title="Déconnexion" className={cn(ui.pillGray, 'gap-2')}>
          <LogOut className="size-4" /> <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </TopBar>

      <main className="mx-auto w-full max-w-[34rem] flex-1 px-6 pt-12 pb-16">
        {/* Just the greeting, large: the line below says whether a ticket is running. */}
        <h1 className="rise font-heading text-[2.6rem] leading-[1.05] font-medium tracking-[-0.035em]">
          {me.firstName ? `Bonjour ${me.firstName},` : 'Bonjour,'}
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
              <Ticket
                key={s.id}
                session={s}
                now={now}
                data={data}
                onRefresh={onRefresh}
                hosted={!!me.hosted}
                demo={me.demo}
                autoOpen={!!autoPlate && sameCar(autoPlate, s.plate)}
                locked={locked}
                onLogout={onLogout}
                // Not a resident ticket (PayByPhone says so, or the car has no resident rate): tickets on chosen days.
                daily={s.resident === false || (!!residentPlates && !residentPlates.has(plateKey(s.plate)))}
              />
            ))}
          </div>
        )}

        {/* The renewal is the one action of the app: no one-off payment button. */}
        {/* The cars with neither a ticket nor a renewal: one card each, with its button. */}
        {data && <IdleVehicles data={data} onChanged={onRefresh} hosted={!!me.hosted} demo={me.demo} autoPlate={autoPlate} locked={locked} onLogout={onLogout} />}

        {/* Tickets on precise days (visitor, Handi…), for everyone. */}
        {data && (
          <DailyTickets
            data={data}
            onChanged={onRefresh}
            needsOffer={needsOffer}
            // Just past the welcome page (or no offer yet) without a resident car to renew: the wizard opens by itself.
            autoOpen={offerDaily || (autoRenew && !renewing && !!residentPlates && !residentPlate)}
            onLogout={onLogout}
          />
        )}


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
