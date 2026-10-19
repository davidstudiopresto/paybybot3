import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Plate, ZonePlate } from '@/components/signs'
import { api, type Overview } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

/** "Mon compte" in the top bar: what PaybyBot reads from the PayByPhone account, nothing editable. */
export function AccountButton({ data }: { data: Overview | null }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!data} className={cn(ui.pillGray, 'gap-2')}>
        <UserRound className="size-4" /> Mon compte
      </button>
      {open && data && <AccountDialog data={data} onClose={() => setOpen(false)} />}
    </>
  )
}

function AccountDialog({ data, onClose }: { data: Overview; onClose: () => void }) {
  const [zone, setZone] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    api.residentZone().then((r) => setZone(r.zone), () => setZone(null))
  }, [])

  const [main, ...others] = data.payments
  const row = 'flex items-start justify-between gap-6 py-4'
  const label = 'shrink-0 pt-1 text-sm text-ink/55'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={ui.dialog}>
        <div className="px-6 pt-7">
          <DialogTitle className={ui.dialogTitle}>Mon compte</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">Ce que PaybyBot lit dans votre compte PayByPhone.</DialogDescription>
        </div>

        <dl className="mx-6 mt-5 divide-y divide-ink/10 border-y border-ink/10">
          <div className={row}>
            <dt className={label}>{data.vehicles.length > 1 ? 'Véhicules' : 'Véhicule'}</dt>
            <dd className="flex flex-wrap justify-end gap-2">
              {data.vehicles.length ? (
                data.vehicles.map((v) => <Plate key={v.plate} plate={v.plate} size="sm" />)
              ) : (
                <span className="text-ink/60">Aucun véhicule</span>
              )}
            </dd>
          </div>

          <div className={row}>
            <dt className={label}>Zone de résidence</dt>
            <dd className="text-right">
              {zone === undefined ? (
                <Loader2 className="size-4 animate-spin text-ink/40" />
              ) : zone ? (
                <>
                  <ZonePlate zone={zone} />
                  <span className="mt-1 block text-xs text-ink/45">tarif résident disponible</span>
                </>
              ) : (
                <span className="text-ink/60">Non trouvée</span>
              )}
            </dd>
          </div>

          <div className={row}>
            <dt className={label}>Carte</dt>
            <dd className="text-right">
              {main ? (
                <>
                  <span className="inline-flex items-center gap-2 font-medium text-ink">
                    <CreditCard className="size-4 text-ink/50" /> {main.label}
                  </span>
                  {others.length > 0 && (
                    <span className="mt-1 block text-xs text-ink/45">
                      + {others.length} autre{others.length > 1 ? 's' : ''} moyen{others.length > 1 ? 's' : ''} de paiement
                    </span>
                  )}
                </>
              ) : (
                <span className="text-ink/60">Aucune carte</span>
              )}
            </dd>
          </div>
        </dl>

        <p className="px-6 pt-4 text-sm text-ink/50">
          Ces informations viennent de PayByPhone et ne sont pas conservées par PaybyBot. Modifiez-les dans l’application
          PayByPhone.
        </p>

        <DeleteAccount />
      </DialogContent>
    </Dialog>
  )
}

/** Erase everything PaybyBot keeps for this account, then log out. The PayByPhone account is not touched. */
function DeleteAccount() {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function erase() {
    setDeleting(true)
    try {
      await api.deleteData()
      toast.success('Votre compte PaybyBot est supprimé.', { description: 'Votre compte PayByPhone, lui, reste intact.' })
      setTimeout(() => window.location.assign('/'), 1200)
    } catch (e) {
      toast.error((e as Error).message)
      setDeleting(false)
    }
  }

  return (
    <div className="mx-6 mt-6 mb-7 rounded-2xl border border-destructive/20 p-5">
      <p className="flex items-center gap-2 font-semibold text-ink">
        <Trash2 className="size-4 text-destructive" /> Supprimer mon compte
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink/60">
        Arrête tous les renouvellements et efface ce que PaybyBot garde : clé de reconnexion, détails des forfaits et
        e-mail. Les tickets en cours restent valables, et votre compte PayByPhone n’est pas touché.
      </p>
      {confirming ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={erase}
            disabled={deleting}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-destructive px-4 text-sm font-semibold text-white transition hover:bg-destructive/90 disabled:opacity-60"
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : 'Oui, tout supprimer'}
          </button>
          <button onClick={() => setConfirming(false)} disabled={deleting} className={ui.pillGray}>
            Annuler
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="mt-4 inline-flex h-10 items-center rounded-full border border-destructive/30 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/5"
        >
          Supprimer mon compte
        </button>
      )}
    </div>
  )
}
