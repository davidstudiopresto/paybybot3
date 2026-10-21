import { useEffect, useState } from 'react'
import { Loader2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { arrondissement, PayByPhone, Plate, ZonePlate } from '@/components/signs'
import { api, type Account, type Overview, type PricedVehicle } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

/** "Mon compte" in the top bar: what PaybyBot reads from the PayByPhone account, the home zone and e-mail. */
export function AccountButton({
  data,
  onDeleted,
  demo = false,
}: {
  data: Overview | null
  onDeleted: () => void
  demo?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!data} className={cn(ui.pillGray, 'gap-2')}>
        <UserRound className="size-4" /> Mon compte
      </button>
      {open && data && <AccountDialog data={data} onClose={() => setOpen(false)} onDeleted={onDeleted} demo={demo} />}
    </>
  )
}

function AccountDialog({
  data,
  onClose,
  onDeleted,
  demo,
}: {
  data: Overview
  onClose: () => void
  onDeleted: () => void
  demo: boolean
}) {
  const [email, setEmail] = useState<string | undefined>(undefined)
  const [deleting, setDeleting] = useState(false)
  const [account, setAccount] = useState<Account | null | undefined>(undefined)
  // Only the « riverain » vehicles, each with the arrondissement PayByPhone gives it the resident rate in (never
  // typed); undefined: looking.
  const [vehicles, setVehicles] = useState<PricedVehicle[] | undefined>(undefined)
  useEffect(() => {
    api.pricing().then((p) => setVehicles(p.vehicles ?? []), () => setVehicles([]))
  }, [])

  async function openPortal() {
    try {
      window.location.assign((await api.billingPortal()).url)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    api.account().then(
      (a) => {
        setEmail(a.email)
        setAccount(a)
      },
      () => {
        setEmail('')
        setAccount(null)
      },
    )
  }, [])

  const row = 'flex items-start justify-between gap-6 py-4'
  const label = 'shrink-0 pt-1 text-sm text-ink/55'

  if (deleting) return <DeleteConfirm onCancel={() => setDeleting(false)} onDeleted={onDeleted} />

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={ui.dialog}>
        <div className="px-6 pt-7">
          <DialogTitle className={ui.dialogTitle}>Mon compte</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">
            Ce que PaybyBot lit dans votre compte <PayByPhone />.
          </DialogDescription>
        </div>

        <dl className="mx-6 mt-5 divide-y divide-ink/10 border-y border-ink/10">
          <div className={row}>
            <dt className={label}>{vehicles && vehicles.length > 1 ? 'Véhicules riverains' : 'Véhicule riverain'}</dt>
            <dd className="flex flex-col items-end gap-2">
              {vehicles === undefined ? (
                <span className="inline-block h-5 w-32 animate-pulse rounded bg-ink/10" />
              ) : vehicles.length ? (
                vehicles.map((v) => (
                  <span key={v.plate} className="flex flex-wrap items-center justify-end gap-2">
                    <Plate plate={v.plate} size="sm" />
                    {arrondissement(v.zone) && <span className="text-sm font-semibold text-ink">{arrondissement(v.zone)}</span>}
                    <ZonePlate zone={v.zone} />
                  </span>
                ))
              ) : (
                <span className="text-right text-ink/60">
                  {data.vehicles.length ? 'Aucun véhicule au tarif résident' : 'Aucun véhicule'}
                </span>
              )}
            </dd>
          </div>

          {!demo && (
            <div className={row}>
              <dt className={label}>Abonnement</dt>
              <dd className="text-right">
                {account === undefined ? (
                  <Loader2 className="ml-auto size-4 animate-spin text-ink/40" />
                ) : account?.plan ? (
                  <span className="flex items-center gap-3">
                    <span className="font-medium text-ink">{account.plan === 'yearly' ? 'Annuel' : 'Mensuel'}</span>
                    <button onClick={openPortal} className={cn('text-sm', ui.link)}>
                      Gérer
                    </button>
                  </span>
                ) : (
                  <span className="flex flex-col items-end gap-1">
                    {account?.trialEnd && (
                      <span className="text-ink/60">
                        Mois offert jusqu’au{' '}
                        {new Date(account.trialEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}
                      </span>
                    )}
                    <a href="#/tarifs" onClick={onClose} className={cn('text-sm', ui.link)}>
                      Choisir mon offre
                    </a>
                  </span>
                )}
              </dd>
            </div>
          )}

          <div className={row}>
            <dt className={label}>E-mail</dt>
            <dd className="min-w-0 truncate text-right font-medium text-ink">
              {email === undefined ? <Loader2 className="ml-auto size-4 animate-spin text-ink/40" /> : email || '—'}
            </dd>
          </div>

        </dl>

        <p className="px-6 pt-4 text-sm text-ink/50">
          Vos véhicules sont synchronisés avec votre compte <PayByPhone />. Pour en ajouter ou en modifier un,
          rendez-vous dans l'application <PayByPhone />.
        </p>

        <div className={cn('px-6 pb-7', demo ? 'pt-2' : 'pt-6')}>
          {!demo && (
            <button
              onClick={() => setDeleting(true)}
              className="inline-flex h-10 items-center rounded-full border border-destructive/30 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/5"
            >
              Supprimer mon compte
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Validation before erasing everything PaybyBot keeps; a confirmation e-mail follows. */
function DeleteConfirm({ onCancel, onDeleted }: { onCancel: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false)

  async function erase() {
    setBusy(true)
    try {
      await api.deleteData()
      toast.success('Votre compte PaybyBot est supprimé.', {
        description: 'Une confirmation vous est envoyée par e-mail.',
      })
      onDeleted() // straight back to the home page, without reloading
    } catch (e) {
      toast.error((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onCancel()}>
      <DialogContent className={ui.dialog}>
        <div className="p-6 pt-7">
          <DialogTitle className={ui.dialogTitle}>Supprimer votre compte ?</DialogTitle>
          <DialogDescription className="mt-2 leading-relaxed text-ink/65">
            Tout ce que PaybyBot garde est effacé, et votre compte <PayByPhone /> n’est pas touché. Vous recevrez une
            confirmation par e-mail.
          </DialogDescription>
          <p role="note" className="mt-4 rounded-xl bg-amber/20 px-4 py-3 text-sm leading-relaxed text-ink">
            Votre forfait en cours reste valable jusqu’à sa fin, au plus tard en fin de semaine. Ensuite, votre
            stationnement ne sera plus ni renouvelé ni prolongé.
          </p>
          <div className="mt-7 grid gap-3">
            <button
              onClick={erase}
              disabled={busy}
              className="flex h-14 w-full items-center justify-center rounded-xl bg-destructive text-lg font-bold text-white transition hover:bg-destructive/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-5 animate-spin" /> : 'Supprimer définitivement'}
            </button>
            <button onClick={onCancel} disabled={busy} className={ui.primaryGray}>
              Annuler
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
