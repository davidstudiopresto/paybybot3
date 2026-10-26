import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { ChevronRight } from 'lucide-react'
import { arrondissement, Plate, vehicleType, withPayByPhone } from '@/components/signs'
import { TopBar } from '@/components/TopBar'
import { InviteButton } from '@/components/Invite'
import { DailyTickets, isDaily, ruleState, when as whenAt } from '@/components/DailyTickets'
import { AccountButton } from '@/components/Account'
import { PlansDialog, TrialBanner } from '@/components/Pricing'
import { ui } from '@/lib/styles'
import { HostedFooter } from '@/components/Footer'
import { CheckoutDone } from '@/components/CheckoutDone'
import { ActivateRenewal, CardGate, OpeningSwitch, RenewalActions, RenewalNote, RenewalSwitch, pauseState, RiverainCard, WEEKLY_LABEL, renewalOf, runPendingRenewals } from '@/components/Riverain'
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
  // `daily` already weighs PayByPhone's rate type, the ticket's length and the car: a resident ticket is renewable.
  const renewable = !daily || !!renewal
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
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-4">
        <span className="flex items-center gap-3">
          <span className="text-[1.05rem] font-medium text-ink">{withPayByPhone('PayByPhone')}</span>
          <Plate plate={session.plate} size="sm" />
        </span>
        {/* A discreet word on the kind of ticket: resident (renewed each week) or not. */}
        <span className="text-sm text-ink/50">{daily ? place : `Ticket résident · ${place}`}</span>
      </div>

      {/* « Renouvellement auto » is for resident tickets only: a non-resident ticket card has no switch (tickets on
          chosen days or dates are programmed below, with « Programmer un ticket »). */}
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

      <div className="border-t border-ink/[0.06] px-5 pt-3.5 pb-4">
        {/* Renewal on: no countdown (nothing to watch), only when the ticket ends. Without one, the time left. */}
        {renewal && renewal.enabled && !note && <p className="mb-1 text-[0.95rem] font-medium text-ink">Ticket en cours</p>}
        {!(renewal && renewal.enabled && !note) && (
          <>
            <p className="text-sm text-ink/50">Temps restant</p>
            <p className={`mt-1 mb-2 font-heading text-[2.1rem] leading-none font-bold tracking-tight tabular-nums ${soon ? 'text-destructive' : 'text-ink'}`}>
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
        {/* Nothing will follow this ticket (no renewal, no programmed ticket for the car): said under it. */}
        {!renewal && !data.autopilots.some((ap) => ap.enabled && sameCar(ap.plate, session.plate)) && (
          <p className="mt-3 text-sm text-ink/55">Ce ticket ne sera pas renouvelé.</p>
        )}
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
    <div className="mt-5 space-y-3">
      {cars.map((v) => {
        const week = weeks[key(v.plate)]
        const place = v.zone ? arrondissement(v.zone) : null
        return (
          <div key={v.plate} className="flex flex-col items-center rounded-2xl border border-border p-5 text-center">
            <Plate plate={v.plate} />
            <span className="mt-3 rounded-full bg-[#4e9aa0]/12 px-2.5 py-1 text-xs font-medium text-[#3d7f84]">Résident</span>
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
            {/* « Renouvellement auto » switch, off: turning it on opens the renewal setup (same as the ticket card). */}
            <div className="mt-4 w-full border-t border-ink/[0.06] pt-4 text-left">
              <ActivateRenewal
                data={data}
                onChanged={onChanged}
                hosted={hosted}
                demo={demo}
                plate={v.plate}
                autoOpen={!!autoPlate && key(autoPlate) === key(v.plate)}
                locked={!!locked && !!autoPlate && key(autoPlate) === key(v.plate)}
                onLogout={onLogout}
                trigger={(open, isOpen) => <OpeningSwitch open={open} isOpen={isOpen} />}
              />
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
            // The renewal or ticket chosen just before Stripe is activated now. The « Votre stationnement est
            // désormais automatisé » screen only when one really was: paid from the banner or « Mon compte » with
            // nothing set up yet, a short word says the account is active and what to do next.
            const { done: renewed, failed, shown } = await runPendingRenewals()
            if (renewed) {
              setCheckoutDone(true)
              if (!shown)
                toast.success(renewed > 1 ? `Renouvellement activé pour ${renewed} véhicules.` : 'Renouvellement activé.')
              onRefresh()
            } else if (!failed.length) {
              toast.success('Votre compte est activé.', {
                description: 'Activez maintenant le renouvellement de votre véhicule ou programmez un ticket.',
              })
            }
            if (failed.length) toast.error(failed.join('\n'))
          },
          (e) => toast.error((e as Error).message),
        )
      : Promise.resolve()
    confirm.then(() => api.account().then(setAccount, () => {}))
  }, [])
  // The vehicles with the resident rate on PayByPhone (a zone in the pricing); null while looking.
  const [pricedResidents, setResidentPlates] = useState<Set<string> | null>(null)
  useEffect(() => {
    api.pricing().then(
      // Zones not looked up (PayByPhone busy) or no answer: unknown, never taken for « no resident car ».
      (p) =>
        setResidentPlates(
          (p as { zonesKnown?: boolean }).zonesKnown === false
            ? null
            : new Set((p.vehicles ?? []).filter((v) => v.zone).map((v) => plateKey(v.plate))),
        ),
      () => setResidentPlates(null),
    )
  }, [me.hosted, me.demo, data?.vehicles.length])
  const sessions = data?.sessions.filter((s) => new Date(s.expire).getTime() > now) ?? []
  // The soonest ticket a programmed day will take, to say when the car is next covered when none runs now.
  const nextPlanned =
    data?.autopilots
      .filter((ap) => isDaily(ap) && ap.enabled)
      .map((ap) => ruleState(ap).next)
      .filter((t): t is Date => !!t)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null
  // The cars PayByPhone gives the resident rate (checked by the server, zone by zone). A ticket's length says
  // nothing: a non-resident ticket can last several days.
  // A car with a resident ticket running is resident too, whatever the pricing says (or when it is unknown).
  const residentTickets = (data?.sessions ?? [])
    .filter((s) => s.resident === true && new Date(s.expire).getTime() > Date.now())
    .map((s) => plateKey(s.plate))
  const residentPlates =
    pricedResidents || residentTickets.length ? new Set([...(pricedResidents ?? []), ...residentTickets]) : null
  const renewing = !!data?.autopilots.some((ap) => ap.label === WEEKLY_LABEL)
  // Right after the welcome page, nothing renewed yet: the renewal of the car with a ticket (else the first car)
  // opens by itself, then the offer comes when it is activated.
  // Online, no offer chosen yet: PayByBot is not usable before choosing one. With a resident vehicle, its renewal
  // dialog stays open (then the offer); without one, the « Programmer un ticket » wizard does (then the offer).
  const needsOffer = !!me.hosted && !me.demo && !!account && !account.subscribed && !account.blocked
  const [offerOpen, setOfferOpen] = useState(false) // « Activer mon compte »: the offer screen
  const live = data?.sessions.filter((s) => new Date(s.expire).getTime() > Date.now()) ?? []
  const isResidentCar = (plate: string) => (residentPlates ? residentPlates.has(plateKey(plate)) : true)
  // The car whose renewal opens: a resident ticket running, else a resident car without a ticket (its card is shown),
  // else a car known to have the resident rate even if PayByPhone does not call its running ticket « resident » (its
  // ticket card shows « Ticket résident » and the renewal switch: that is the one to open, never the ticket wizard).
  const knownResident = (plate: string) => !!residentPlates?.has(plateKey(plate))
  const residentPlate = data
    ? (live.find((s) => s.resident !== false && isResidentCar(s.plate))?.plate ??
      data.vehicles.find((v) => isResidentCar(v.plate) && !live.some((s) => sameCar(s.plate, v.plate)))?.plate ??
      live.find((s) => knownResident(s.plate))?.plate ??
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
            const renewed = data?.autopilots.find((ap) => ap.label === WEEKLY_LABEL) ?? data?.autopilots.at(-1) // or the ticket just programmed
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
      {/* No offer chosen yet: a thin light blue bar (the logo's blue) across the top, the way to activate the account. */}
      {needsOffer && (
        <button
          type="button"
          onClick={() => setOfferOpen(true)}
          className="group flex w-full items-center justify-center gap-1.5 bg-[#e3efff] px-4 py-2 text-sm font-semibold text-[#1f55e6] transition hover:bg-[#d4e6ff]"
        >
          Activer mon compte
          <span className="font-normal text-[#1f55e6]/70">
            {/* Account re-created during its free month: only the days left of the first one, not a new month. */}
            {(() => {
              const left = account?.trialEnd ? Math.ceil((new Date(account.trialEnd).getTime() - Date.now()) / 86_400_000) : 0
              return left > 0 ? `· ${left} jour${left > 1 ? 's' : ''} offert${left > 1 ? 's' : ''}` : '· 1er mois offert'
            })()}
          </span>
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}
      {/* Free month running: the same light blue bar, with the days left. */}
      {!needsOffer && !me.demo && account?.subscribed && !account.blocked && account.trialEnd &&
        new Date(account.trialEnd).getTime() > Date.now() && (() => {
          const days = Math.ceil((new Date(account.trialEnd).getTime() - Date.now()) / 86_400_000)
          return (
            <div className="flex w-full items-center justify-center gap-1.5 bg-[#e3efff] px-4 py-2 text-sm font-semibold text-[#1f55e6]">
              Période d’essai gratuite
              <span className="font-normal text-[#1f55e6]/70">
                · {days} jour{days > 1 ? 's' : ''} restant{days > 1 ? 's' : ''}
              </span>
            </div>
          )
        })()}
      {offerOpen && <PlansDialog onClose={() => setOfferOpen(false)} />}
      <TopBar>
        {me.demo && (
          <span className="inline-flex h-9 items-center rounded-full bg-amber/25 px-3 text-sm font-semibold text-ink sm:h-10 sm:px-4 sm:text-[0.95rem]">
            Démo
          </span>
        )}
        {/* Inviting a friend: always offered to a signed-in account (word of mouth is the only way in). */}
        {!me.demo && <InviteButton disabled={!data} />}
        <AccountButton data={data} onDeleted={onDeleted ?? onLogout} demo={me.demo} />
        <button onClick={onLogout} className={ui.navText}>
          Déconnexion
        </button>
      </TopBar>

      <main className="mx-auto w-full max-w-[34rem] flex-1 px-6 pt-6 pb-6">
        {/* Just the greeting, large: the line below says whether a ticket is running. */}
        <h1 className="rise font-heading text-[2.6rem] leading-[1.05] font-medium tracking-[-0.035em]">
          {me.firstName ? `Bonjour ${me.firstName},` : 'Bonjour,'}
        </h1>
        <p className="mt-3 text-[1.05rem] text-ink/60">
          {!data
            ? withPayByPhone('Chargement de votre compte PayByPhone.')
            : !data.autopilots.some((ap) => ap.enabled && !ruleState(ap).finished)
              ? // Nothing automated (a finished one-off ticket does not count): say it plainly.
                "Votre stationnement n'est pas encore automatisé."
            : sessions.length
              ? sessions.length > 1
                ? `${sessions.length} tickets en cours.`
                : 'Votre ticket en cours :'
              : nextPlanned
                ? `Aucun ticket en cours : le prochain est prévu ${whenAt(nextPlanned)}.`
                : "Aucun véhicule n'est couvert en ce moment."}
        </p>

        {data && sessions.length > 0 && (
          <div className="mt-5 space-y-3">
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
                // A resident ticket only when PayByPhone says so, or when the car has the resident rate (checked by
                // the server with PayByPhone). Anything else is a non-resident ticket, whatever its length.
                daily={!(s.resident === true || !!residentPlates?.has(plateKey(s.plate)))}
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
            residentPlates={residentPlates}
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

      <HostedFooter className="px-6 pb-5" hosted={!!me.hosted} />
    </div>
  )
}

/** PayByPhone's vehicle type, in French (unknown: as given). */
function vehicleTypeLabel(type?: string) {
  if (!type) return null
  return vehicleType(type) ?? type
}
