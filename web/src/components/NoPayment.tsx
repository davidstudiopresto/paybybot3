import { useState } from 'react'
import { CreditCard, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Shown when the PayByPhone account has no saved payment method we can use. */
export function NoPayment({ onRefresh, compact = false }: { onRefresh: () => Promise<void>; compact?: boolean }) {
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    await onRefresh()
    setChecking(false)
  }

  return (
    <div className={compact ? 'rounded-xl border-2 border-dashed border-amber bg-amber/10 p-4' : 'rounded-2xl border-[3px] border-dashed border-amber bg-amber/10 p-6'}>
      <div className="flex items-start gap-4">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-xl bg-enamel text-ink">
          <CreditCard className="size-6" />
          <span className="absolute h-0.5 w-9 rotate-45 rounded bg-destructive" aria-hidden />
        </span>
        <div>
          <p className={compact ? 'font-heading text-lg font-extrabold' : 'font-heading text-2xl font-extrabold'}>
            Aucune carte enregistrée sur PayByPhone
          </p>
          <p className="mt-1 text-muted-foreground">
            Pour payer d'ici, ajoutez d'abord une carte bancaire à votre compte PayByPhone : dans l'application, menu{' '}
            <strong className="text-ink">Compte → Moyens de paiement</strong>, ou sur le site PayByPhone.
          </p>
          {!compact && (
            <p className="mt-2 text-sm text-muted-foreground">
              Apple Pay et Google Pay ne fonctionnent que sur le téléphone : ils ne sont pas utilisables ici.
            </p>
          )}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={check} disabled={checking} className="h-12 rounded-xl px-5 font-bold">
          {checking ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />} J'ai ajouté une carte
        </Button>
        <Button
          variant="outline"
          className="h-12 rounded-xl bg-enamel px-5"
          render={<a href="https://m.paybyphone.com" target="_blank" rel="noreferrer" />}
        >
          Ouvrir PayByPhone <ExternalLink className="size-4" />
        </Button>
      </div>
    </div>
  )
}
