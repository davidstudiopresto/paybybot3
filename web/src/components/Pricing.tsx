import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Lock, Sparkles, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { toast } from 'sonner'
import { Dialog, DialogClose, DialogDescription, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { Horodateur } from '@/components/Horodateur'
import { NoResidentStatus, ZoneField } from '@/components/Riverain'
import { Wordmark } from '@/components/signs'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { api, forgetZoneLookup, type Pricing } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

export type Plan = 'monthly' | 'yearly'

const PLANS: { id: Plan; name: string; popular?: boolean }[] = [
  { id: 'monthly', name: 'Mensuel' },
  { id: 'yearly', name: 'Annuel', popular: true },
]

const euros = (cents: number) => (cents / 100).toFixed(2).replace('.', ',') + ' €'
const EXAMPLE_WEEK = 900 // a 9,00 € resident week, for the public explanation

/** What a plan shows: the account's own price when known, else the rule with an example. */
function planText(id: Plan, pricing?: Pricing | null) {
  const week = pricing?.weekly
  if (week) {
    return id === 'monthly'
      ? { price: euros(2 * week), per: '/ mois', note: `2 × votre forfait résident de ${euros(week)}` }
      : { price: euros(Math.round(24 * week * 0.8)), per: '/ an', note: `Soit ${euros(Math.round(2 * week * 0.8))} par mois` }
  }
  return id === 'monthly'
    ? { price: '2 ×', per: 'votre forfait / mois', note: `Votre forfait résident hebdomadaire, deux fois par mois. Ex. : ${euros(2 * EXAMPLE_WEEK)} pour un forfait à ${euros(EXAMPLE_WEEK)}.` }
    : { price: '-20 %', per: 'à l’année', note: `Le mensuel sur 12 mois, avec 20 % de moins. Ex. : ${euros(Math.round(24 * EXAMPLE_WEEK * 0.8))} par an.` }
}

/** The signed-in account's prices (null while loading). */
function usePricing(enabled: boolean) {
  const [pricing, setPricing] = useState<Pricing | null>(null)
  const load = useCallback(() => {
    if (!enabled) return
    setPricing(null)
    api.pricing().then(setPricing, () => setPricing({ zone: null, weekly: null, monthly: null, yearly: null }))
  }, [enabled])
  useEffect(load, [load])
  return [pricing, load] as const
}

const INCLUDED = [
  'Renouvellement automatique du forfait résident',
  'Pause vacances',
  'Confirmation par e-mail à chaque paiement',
  'Annulable à tout moment',
]

/** The two plans side by side; the yearly one is put forward. */
export function PlanCards({ signedIn }: { signedIn: boolean }) {
  const [busy, setBusy] = useState<Plan | null>(null)
  const [pricing] = usePricing(signedIn)

  async function choose(plan: Plan) {
    if (!signedIn) {
      window.location.hash = '#/inscription'
      return
    }
    setBusy(plan)
    try {
      const { url } = await api.checkout(plan)
      window.location.assign(url)
    } catch (e) {
      toast((e as Error).message)
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {PLANS.map((plan) => ({ ...plan, ...planText(plan.id, pricing) })).map((p) => (
        <div
          key={p.id}
          className={cn(
            'relative flex flex-col rounded-2xl border p-6 sm:p-7',
            p.popular ? 'border-eu ring-1 ring-eu' : 'border-ink/10',
          )}
        >
          {p.popular && (
            <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] px-3 py-1 text-xs font-semibold text-white">
              <Sparkles className="size-3.5" /> Plus populaire
            </span>
          )}
          <p className="flex items-center justify-between font-semibold text-ink">
            {p.name}
            {p.popular && <span className="rounded-full bg-eu/[0.08] px-2 py-0.5 text-xs font-semibold text-eu">-20 %</span>}
          </p>
          <p className="mt-4 font-heading text-[2.6rem] leading-none font-semibold tracking-tight text-ink">
            {p.price} <span className="text-base font-normal text-ink/50">{p.per}</span>
          </p>
          <p className="mt-2 text-sm text-ink/55">{p.note}</p>
          <ul className="mt-6 space-y-2 text-[0.95rem] text-ink/70">
            {INCLUDED.map((x) => (
              <li key={x} className="flex items-start gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-eu" /> {x}
              </li>
            ))}
          </ul>
          <button
            onClick={() => choose(p.id)}
            disabled={busy !== null}
            className={cn('mt-7', p.popular ? ui.primary : ui.primaryGray)}
          >
            {busy === p.id ? (
              <Loader2 className="size-5 animate-spin" />
            ) : signedIn ? (
              p.popular ? 'Choisir l’annuel' : 'Choisir le mensuel'
            ) : (
              'Commencer mon mois offert'
            )}
          </button>
        </div>
      ))}
    </div>
  )
}


/** Public pricing page (#/tarifs). */
export function PricingPage({ hosted, signedIn = false }: { hosted: boolean; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicTopBar signedIn={signedIn} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pt-16 pb-20 lg:pt-24">
        <h1 className="rise text-center font-heading text-[2.4rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3.4rem]">
          Tarifs.
        </h1>
        <div className="mt-12">
          <PlanCards signedIn={signedIn} />
        </div>
        <p className="mt-8 text-center text-sm text-ink/50">
          Un seul oubli coûte plus cher que 3 mois de PaybyBot. Prix TTC, sans engagement.
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
}: {
  trialEnd: string | null
  plan: string | null
  blocked?: 'unpaid' | 'trialOver' | null
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  // Failed charge: straight to the invoice to pay. No subscription: choose a plan.
  async function unlock() {
    if (blocked !== 'unpaid') return setOpen(true)
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
            {blocked === 'unpaid' ? 'Paiement refusé : compte bloqué.' : 'Mois offert terminé : compte bloqué.'}{' '}
            <span className="font-normal text-white/80">Le prochain renouvellement ne sera pas payé.</span>
          </span>
          <button
            onClick={unlock}
            disabled={busy}
            className="inline-flex items-center rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-white/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : 'Débloquer mon compte'}
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

/** Full-page paywall: the offer and the way to pay on the left, the parking meter on the right. */
function PlansDialog({ onClose, text }: { onClose: () => void; text: string }) {
  const [plan, setPlan] = useState<Plan>('yearly')
  const [busy, setBusy] = useState(false)
  const [pricing, reload] = usePricing(true)
  const locked = pricing?.resident === false

  // The price depends on the home zone: without one, the arrondissement is asked right here.
  async function saveZone(zone: string) {
    try {
      await api.updateAccount({ zone })
      forgetZoneLookup()
      reload()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  async function pay() {
    setBusy(true)
    try {
      window.location.assign((await api.checkout(plan)).url)
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
                {pricing && !pricing.weekly && !locked && (
                  <div className="rounded-2xl border border-ink/10 p-4">
                    <p className="mb-3 text-sm text-ink/60">
                      Votre prix dépend de votre forfait résident : indiquez votre arrondissement.
                    </p>
                    <ZoneField zone="" fromHistory={false} onZone={saveZone} />
                  </div>
                )}
                {!pricing && <div className="h-40 animate-pulse rounded-2xl bg-ink/[0.05]" />}
                {(pricing?.weekly != null || locked) && [...PLANS].reverse().map((plan) => ({ ...plan, ...planText(plan.id, pricing) })).map((p) => (
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
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center rounded-full border-2',
                        plan === p.id ? 'border-eu' : 'border-ink/25',
                      )}
                    >
                      {plan === p.id && <span className="size-2.5 rounded-full bg-eu" />}
                    </span>
                    <span className="flex-1">
                      <span className="flex items-center gap-2 font-semibold text-ink">
                        {p.name}
                        {p.popular && (
                          <span className="rounded-full bg-eu/[0.08] px-2 py-0.5 text-xs font-semibold text-eu">-20 %</span>
                        )}
                      </span>
                      <span className="block text-sm text-ink/55">{p.note}</span>
                    </span>
                    <span className="text-right">
                      <span className="font-heading text-xl font-semibold text-ink">{p.price}</span>{' '}
                      <span className="text-sm text-ink/50">{p.per}</span>
                    </span>
                  </button>
                ))}
              </div>

              <ul className="mt-6 grid gap-2 text-[0.95rem] text-ink/70 sm:grid-cols-2">
                {INCLUDED.map((x) => (
                  <li key={x} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-eu" /> {x}
                  </li>
                ))}
              </ul>

              <button onClick={pay} disabled={busy || !pricing?.weekly} className={cn('mt-8', ui.primary)}>
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
