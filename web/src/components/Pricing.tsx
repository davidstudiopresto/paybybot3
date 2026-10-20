import { useState } from 'react'
import { Check, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

export type Plan = 'monthly' | 'yearly'

const PLANS: { id: Plan; name: string; price: string; per: string; note: string; popular?: boolean }[] = [
  { id: 'monthly', name: 'Mensuel', price: '9,50 €', per: '/ mois', note: 'Sans engagement' },
  { id: 'yearly', name: 'Annuel', price: '91,20 €', per: '/ an', note: 'Soit 7,60 € par mois', popular: true },
]

const INCLUDED = [
  'Renouvellement automatique du forfait résident',
  'Pause vacances',
  'Confirmation par e-mail à chaque paiement',
  'Annulable à tout moment',
]

/** The two plans side by side; the yearly one is put forward. */
export function PlanCards({ signedIn }: { signedIn: boolean }) {
  const [busy, setBusy] = useState<Plan | null>(null)

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
      {PLANS.map((p) => (
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

function PlansDialog({ onClose, text }: { onClose: () => void; text: string }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-2xl bg-white p-6 sm:max-w-2xl sm:p-8">
        <DialogTitle className={ui.dialogTitle}>Choisir mon offre</DialogTitle>
        <DialogDescription className="mt-1 mb-8 text-ink/60">{text}</DialogDescription>
        <PlanCards signedIn />
      </DialogContent>
    </Dialog>
  )
}
