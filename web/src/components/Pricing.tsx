import { useCallback, useEffect, useState } from 'react'
import { Bike, Car, CarFront, Check, Loader2, Lock, Sparkles, X, type LucideIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { toast } from 'sonner'
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { Horodateur } from '@/components/Horodateur'
import { NoResidentStatus } from '@/components/Riverain'
import { PayByPhone, Plate, Wordmark } from '@/components/signs'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { api, type Pricing } from '@/lib/api'
import { cn } from '@/lib/utils'
import { TRY_LABEL, ui } from '@/lib/styles'

export type Plan = 'monthly' | 'yearly'

const PLANS: { id: Plan; name: string; popular?: boolean }[] = [
  { id: 'yearly', name: 'Annuel', popular: true },
  { id: 'monthly', name: 'Mensuel' },
]

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
const yearOf = (monthly: number) => Math.round(monthly * 12 * 0.8)

/** The grid, by vehicle type and Paris zone (the server's MONTHLY_PRICES). */
const GRID: [string, number, number][] = [
  ['Voiture', 990, 690],
  ['Deux-roues', 690, 490],
]

/** The signed-in account's prices (null while loading). */
function usePricing(enabled: boolean) {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const load = useCallback(() => {
    if (!enabled) return
    setPricing(null)
    api.pricing().then(setPricing, () => setPricing({ zone: null, monthly: null, yearly: null }))
  }, [enabled])
  useEffect(load, [load])
  return [pricing, load] as const
}

/** The price by vehicle type and zone, per month or per year. */
function PriceGrid({ plan, className }: { plan: Plan; className?: string }) {
  const price = (m: number) => (plan === 'monthly' ? euros(m) : euros(yearOf(m)))
  const per = plan === 'monthly' ? '/ mois' : '/ an'
  return (
    <table className={cn('w-full text-left text-[0.95rem]', className)}>
      <thead>
        <tr className="text-sm text-ink/50">
          <th className="pb-3 text-left text-xs font-normal sm:hidden">{plan === 'monthly' ? 'Par mois' : 'Par an'}</th>
          <th className="hidden pb-3 font-normal sm:table-cell" />
          <th className="pb-3 text-center font-normal">
            Zone 1 <span className="block text-xs">arr. 1 à 11</span>
          </th>
          <th className="pb-3 text-center font-normal">
            Zone 2 <span className="block text-xs">arr. 12 à 20</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {GRID.map(([name, z1, z2]) => (
          <tr key={name} className="border-t border-ink/10">
            <td className="py-3 font-semibold text-ink">{name}</td>
            <td className="py-3 text-center text-ink tabular-nums">{price(z1)} <span className="hidden text-ink/50 sm:inline">{per}</span></td>
            <td className="py-3 text-center text-ink tabular-nums">{price(z2)} <span className="hidden text-ink/50 sm:inline">{per}</span></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** One price per « riverain » vehicle (plate), and what the subscription covers. */
function VehiclePrices({ plan, pricing, className }: { plan: Plan; pricing: Pricing | null; className?: string }) {
  const vehicles = pricing?.vehicles ?? []
  if (vehicles.length < 2) return null
  const billed = pricing?.billed?.length ?? 1
  return (
    <div className={className}>
      <ul className="space-y-1.5">
        {vehicles.map((v) => (
          <li key={v.plate} className="flex items-center justify-between gap-3 text-sm">
            <Plate plate={v.plate} size="sm" />
            <span className="text-ink/70 tabular-nums">
              {plan === 'monthly' ? `${euros(v.monthly)} / mois` : `${euros(v.yearly)} / an`}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-relaxed text-ink/50">
        Prix par véhicule. Le total est celui de {billed > 1 ? `vos ${billed} véhicules renouvelés` : 'votre véhicule renouvelé'} :
        vous ne payez que les véhicules dont le renouvellement est activé.
      </p>
    </div>
  )
}

/** What a plan shows with the account's own price. */
function planText(id: Plan, pricing: Pricing) {
  return id === 'monthly'
    ? { price: euros(pricing.monthly!), per: '/ mois', note: 'Sans engagement' }
    : { price: euros(pricing.yearly!), per: '/ an', note: `Soit ${euros(Math.round(pricing.yearly! / 12))} par mois` }
}

const INCLUDED = [
  'Renouvellement automatique du forfait résident',
  'Pause vacances',
  'Confirmation par e-mail à chaque paiement',
  'Annulable à tout moment',
]

/** One card, a Mensuel / Annuel switch on top (the yearly one with its 20 % off): the account's own price once signed
 *  in, else the grid. */
export function PlanCards({ signedIn }: { signedIn: boolean }) {
  const [plan, setPlan] = useState<Plan>('monthly')
  const [busy, setBusy] = useState(false)
  const [pricing] = usePricing(signedIn)
  const own = signedIn && pricing?.monthly != null && pricing.yearly != null ? pricing : null

  async function choose() {
    if (!signedIn) {
      window.location.hash = '#/inscription'
      return
    }
    setBusy(true)
    try {
      const { url } = await api.checkout(plan)
      window.location.assign(url)
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <>
      {signedIn && pricing?.resident === false && <NoResidentStatus zone={pricing.zone} className="mb-6" />}
      <div role="radiogroup" aria-label="Offre" className="mx-auto mb-6 flex w-fit rounded-full bg-ink/[0.06] p-1">
        {(['monthly', 'yearly'] as Plan[]).map((id) => (
          <button
            key={id}
            role="radio"
            aria-checked={plan === id}
            onClick={() => setPlan(id)}
            className={cn(
              'flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition',
              plan === id ? 'bg-white text-ink shadow-[0_1px_3px_rgb(11_16_36/0.12)]' : 'text-ink/55 hover:text-ink',
            )}
          >
            {id === 'monthly' ? 'Mensuel' : 'Annuel'}
            {id === 'yearly' && <span className="rounded-full bg-eu/[0.1] px-2 py-0.5 text-xs text-eu">-20 %</span>}
          </button>
        ))}
      </div>
      {signedIn && !pricing ? (
        <div className="mx-auto h-96 max-w-xl animate-pulse rounded-2xl bg-ink/[0.05]" />
      ) : (
        <div className="mx-auto flex max-w-xl flex-col rounded-2xl border border-eu p-6 ring-1 ring-eu sm:p-7">
          {own ? (
            <>
              <p className="font-heading text-[2.6rem] leading-none font-semibold tracking-tight text-ink">
                {planText(plan, own).price} <span className="text-base font-normal text-ink/50">{planText(plan, own).per}</span>
              </p>
              <p className="mt-2 text-sm text-ink/55">{planText(plan, own).note}</p>
              <VehiclePrices plan={plan} pricing={own} className="mt-5 border-t border-ink/10 pt-4" />
            </>
          ) : (
            <>
              <PriceGrid plan={plan} />
              <p className="mt-2 text-sm text-ink/55">
                {plan === 'yearly' ? 'Payé une fois par an, 20 % de moins que le mensuel.' : 'Sans engagement.'}
              </p>
            </>
          )}
          <ul className="mt-6 space-y-2 text-[0.95rem] text-ink/70">
            {INCLUDED.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-eu" /> {x}
              </li>
            ))}
          </ul>
          <button onClick={choose} disabled={busy} className={cn('mt-7', ui.primary)}>
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : signedIn ? (
              plan === 'yearly' ? 'Choisir l’annuel' : 'Choisir le mensuel'
            ) : (
              TRY_LABEL
            )}
          </button>
        </div>
      )}
      <FinesNote className="mx-auto mt-8 max-w-xl" />
    </>
  )
}

/** What one forgotten ticket costs, to compare with the price above. */
const FINES: [LucideIcon, string, string][] = [
  [Bike, 'Scooter', '87,50 €'],
  [Car, 'Voiture', '125 €'],
  [CarFront, 'SUV', '275 €'],
]

function FinesNote({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-ink/10 px-5 py-5 text-center', className)}>
      <p className="font-heading text-lg font-medium tracking-[-0.02em] text-ink">Bon à savoir : montant des amendes à Paris (majorées)</p>
      <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 text-[0.95rem] text-ink/60">
        {FINES.map(([Icon, name, amount]) => (
          <li key={name} className="flex items-center gap-2">
            <Icon className="size-4 text-eu" strokeWidth={1.75} /> {name}{' '}
            <span className="text-ink tabular-nums">{amount}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}


/** Pricing page (#/tarifs), once signed in: the account's own two plans (signed out, App shows the sign-up). */
export function PricingPage({ hosted, signedIn = false }: { hosted: boolean; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicTopBar signedIn={signedIn} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 pt-16 pb-20 lg:pt-24">
        <h1 className="rise text-center font-heading text-[2rem] leading-[1.05] font-medium tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
          {signedIn ? 'Vos tarifs' : 'Tarifs'}
        </h1>
        <p className="mx-auto mt-4 max-w-[32rem] text-center text-[1.05rem] text-ink/60 sm:text-lg">
          Un prix par véhicule résident, selon son type et sa zone.
        </p>
        <div className="mt-12">
          <PlanCards signedIn={signedIn} />
        </div>
        <p className="mt-8 text-center text-sm text-ink/50">
          Un seul oubli coûte plus cher que 3 mois de PayByBot. Prix TTC, sans engagement.
        </p>
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}

/** Dashboard banner: days left in the free month; a click opens the plans. */
export function TrialBanner({
  trialEnd,
  plan,
  blocked = null,
  graceEnd = null,
}: {
  trialEnd: string | null
  plan: string | null
  blocked?: 'grace' | 'unpaid' | 'trialOver' | null
  graceEnd?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Failed charge: straight to the invoice to pay. No subscription: choose a plan.
  const refused = blocked === 'grace' || blocked === 'unpaid'
  async function unlock() {
    if (!refused) return setOpen(true)
    setBusy(true)
    try {
      window.location.assign((await api.unlock()).url)
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  if (blocked) {
    return (
      <>
        <div
          role="alert"
          className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-[linear-gradient(90deg,#5c0f12_0%,#9b1c1f_100%)] px-4 py-2.5 text-sm text-white"
        >
          <span className="font-semibold">
            {blocked === 'grace'
              ? 'Paiement refusé.'
              : blocked === 'unpaid'
                ? 'Paiement refusé : renouvellement arrêté.'
                : 'Mois offert terminé : compte bloqué.'}{' '}
            <span className="font-normal text-white/80">
              {blocked === 'grace'
                ? `Vos renouvellements continuent jusqu'au ${graceDay(graceEnd)}, mettez à jour votre carte d'ici là.`
                : 'Le prochain renouvellement ne sera pas payé.'}
            </span>
          </span>
          <button
            onClick={unlock}
            disabled={busy}
            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-white/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : refused ? 'Se régulariser' : 'Débloquer mon compte'}
          </button>
        </div>
        {open && (
          <PlansDialog onClose={() => setOpen(false)} text="Le renouvellement reprend dès que le paiement est fait." />
        )}
      </>
    )
  }

  if (plan || !trialEnd) return null
  const left = Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 86_400_000)
  const ending = left <= 5
  const text =
    left <= 0
      ? 'Votre mois offert est terminé.'
      : `Mois offert : encore ${left} jour${left > 1 ? 's' : ''}.`
  return (
    <>
      <div className="flex w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 bg-[linear-gradient(90deg,#0b1024_0%,#1d2a6b_45%,#4b2f86_100%)] px-4 py-2.5 text-sm text-white">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-white/80" />
          <span className={left <= 0 ? 'font-semibold text-[#ffb4b4]' : ending ? 'font-semibold' : ''}>{text}</span>
        </span>
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-white/90"
        >
          Choisir mon offre
        </button>
      </div>
      {open && <PlansDialog onClose={() => setOpen(false)} text="Sans engagement." />}
    </>
  )
}

/** « mardi 28 octobre » for the end of the grace week. */
function graceDay(iso: string | null) {
  if (!iso) return 'la fin de la semaine'
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
}

/** Full-page paywall: the offer and the way to pay on the left, the parking meter on the right. onPay runs just
 *  before leaving for Stripe. */
export function PlansDialog({ onClose, text, onPay }: { onClose: () => void; text: string; onPay?: () => void }) {
  const [plan, setPlan] = useState<Plan>('yearly')
  const [busy, setBusy] = useState(false)
  const [pricing] = usePricing(true)
  const locked = pricing?.resident === false

  async function pay() {
    setBusy(true)
    try {
      const { url } = await api.checkout(plan)
      onPay?.()
      window.location.assign(url)
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogPortal>
        <DialogPrimitive.Popup className="fixed inset-0 z-50 grid overflow-y-auto bg-white outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 lg:grid-cols-2">
          <div className="flex flex-col px-6 pt-5 pb-10 sm:px-10 lg:px-[clamp(2.5rem,8vw,8rem)]">
            <div className="flex items-center justify-between">
              <Wordmark />
              <DialogClose
                aria-label="Fermer"
                disabled={busy}
                className="grid size-10 place-items-center rounded-full bg-ink/[0.06] text-ink transition hover:bg-ink/[0.1]"
              >
                <X className="size-5" />
              </DialogClose>
            </div>
            <Horodateur className={cn('mx-auto mt-6 h-44 lg:hidden', locked && 'opacity-50 grayscale')} />
            <div className="mx-auto w-full max-w-md lg:my-auto lg:pt-10">
              <DialogTitle className={cn(ui.title, 'mt-6 lg:mt-0')}>Choisissez votre offre</DialogTitle>
              <DialogDescription className={ui.subtitle}>{text}</DialogDescription>

              {locked && <NoResidentStatus zone={pricing.zone} className="mt-8" />}
              {/* No resident status on PayByPhone: the offer stays visible but greyed and out of reach. */}
              <div
                aria-hidden={locked || undefined}
                className={cn(locked && 'pointer-events-none select-none opacity-50 blur-[2px] grayscale')}
              >
              <div role="radiogroup" aria-label="Offre" className="mt-8 space-y-3">
                {pricing && pricing.monthly == null && !locked && (
                  <p className="rounded-2xl border border-ink/10 p-4 text-sm text-ink/60">
                    Votre prix n’a pas pu être calculé avec <PayByPhone /> pour le moment. Réessayez dans quelques minutes.
                  </p>
                )}
                {!pricing && <div className="h-40 animate-pulse rounded-2xl bg-ink/[0.05]" />}
                {pricing?.monthly != null && pricing.yearly != null &&
                  PLANS.map((p) => ({ ...p, ...planText(p.id, pricing) })).map((p) => (
                    <button
                      key={p.id}
                      role="radio"
                      aria-checked={plan === p.id}
                      onClick={() => setPlan(p.id)}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition',
                        plan === p.id ? 'border-eu bg-eu/[0.04] ring-1 ring-eu' : 'border-ink/15 hover:border-ink/30',
                      )}
                    >
                      <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-2', plan === p.id ? 'border-eu' : 'border-ink/25')}>
                        {plan === p.id && <span className="size-2.5 rounded-full bg-eu" />}
                      </span>
                      <span className="flex-1">
                        <span className="flex items-center gap-2 font-semibold text-ink">
                          {p.name}
                          {p.popular && <span className="rounded-full bg-eu/[0.08] px-2 py-0.5 text-xs font-semibold text-eu">-20 %</span>}
                        </span>
                        <span className="block text-sm text-ink/55">{p.note}</span>
                      </span>
                      <span className="text-right">
                        <span className="font-heading text-xl font-semibold text-ink">{p.price}</span>{' '}
                        <span className="text-sm text-ink/50">{p.per}</span>
                      </span>
                    </button>
                  ))}
                {locked && <PriceGrid plan={plan} className="rounded-2xl border border-ink/10 p-4" />}
              </div>

              <VehiclePrices plan={plan} pricing={pricing} className="mt-5 rounded-2xl bg-ink/[0.03] p-4" />
              <ul className="mt-6 grid gap-2 text-[0.95rem] text-ink/70 sm:grid-cols-2">
                {INCLUDED.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-eu" /> {x}
                  </li>
                ))}
              </ul>

              <button onClick={pay} disabled={busy || pricing?.monthly == null} className={cn('mt-8', ui.primary)}>
                {busy ? <Loader2 className="size-5 animate-spin" /> : 'Continuer vers le paiement'}
              </button>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-sm text-ink/50">
                <Lock className="size-3.5" /> Paiement sécurisé par Stripe. Sans engagement.
              </p>
              </div>
            </div>
          </div>

          <div className="relative hidden items-center justify-center overflow-hidden bg-[radial-gradient(70%_60%_at_50%_45%,#e6ecfb_0%,#f4f6fb_60%,#f7f8fb_100%)] lg:flex">
            <Horodateur
              className={cn(
                'w-[min(78%,30rem)] drop-shadow-[0_30px_40px_rgb(29_42_107/0.12)]',
                locked && 'opacity-50 grayscale',
              )}
            />
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}
