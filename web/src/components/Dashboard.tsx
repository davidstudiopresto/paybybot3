import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LogOut, Repeat } from 'lucide-react'
import { Plate, ZonePlate, withPayByPhone } from '@/components/signs'
import { TopBar } from '@/components/TopBar'
import { AccountButton } from '@/components/Account'
import { TrialBanner } from '@/components/Pricing'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'
import { HostedFooter } from '@/components/Footer'
import { CardGate, ManageRenewal, RenewalNote, ResidentGate, RiverainCard, WEEKLY_LABEL, renewalOf, runPendingRenewals } from '@/components/Riverain'
import { api, money, remaining, until, type Account, type Me, type Overview, type Session } from '@/lib/api'

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
  demo,
}: {
  session: Session
  now: number
  data: Overview
  onRefresh: () => Promise<void>
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
        <span className="text-sm text-muted-foreground">{money(session.cost)}</span>
      </div>
      <p className={`mt-5 font-heading text-[2.6rem] leading-none font-bold tracking-tight tabular-nums ${soon ? 'text-destructive' : 'text-ink'}`}>
        {remaining(left)}
      </p>
      <p className="mt-2 text-muted-foreground">{until(session.expire)}</p>
      <div className="mt-5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${soon ? 'bg-destructive' : 'bg-eu'}`}
          style={{ width: `${(1 - progress) * 100}%` }}
        />
      </div>
      {renewal && (
        <div className="mt-4 flex items-start justify-between gap-4">
          <p className="flex gap-2 text-sm text-ink/70">
            <Repeat className="mt-0.5 size-4 shrink-0 text-eu" />
            <span>
              <RenewalNote ap={renewal} />
            </span>
          </p>
          <ManageRenewal ap={renewal} onChanged={onRefresh} demo={demo} />
        </div>
      )}
    </article>
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
            const { done: renewed, failed } = await runPendingRenewals()
            if (renewed) {
              toast.success(renewed > 1 ? `Renouvellement activé pour ${renewed} véhicules.` : 'Renouvellement activé.', {
                description: offer + " Rien n'est prélevé avant la fin de votre mois offert.",
              })
              onRefresh()
            } else toast.success(offer)
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
      {/* No resident rate on PayByPhone: PaybyBot is not usable, the page stays blurred behind the notice. */}
      {resident?.resident === false && !me.demo ? (
        <ResidentGate zone={resident.zone} vehicles={data?.vehicles.length} onChecked={setResident} />
      ) : (
        // No card saved on PayByPhone (removed since, Apple Pay only): PaybyBot cannot pay, so it is not usable.
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
        <h1 className="rise mt-1 font-heading text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em]">
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
              <Ticket key={s.id} session={s} now={now} data={data} onRefresh={onRefresh} demo={me.demo} />
            ))}
          </div>
        )}

        {/* The renewal is the one action of the app: no one-off payment button. */}
        <div className={renewing ? 'mt-6' : 'mt-10 border-t border-border pt-8'}>
          <RiverainCard data={data} onChanged={onRefresh} hosted={!!me.hosted} demo={me.demo} />
        </div>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={!!me.hosted} />
    </div>
  )
}
