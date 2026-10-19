import { useEffect, useState } from 'react'
import { CreditCard, Loader2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ZoneField } from '@/components/Riverain'
import { Plate, ZonePlate } from '@/components/signs'
import { api, forgetZoneLookup, type Overview } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

/** "Mon compte" in the top bar: what PaybyBot reads from the PayByPhone account, the home zone and e-mail. */
export function AccountButton({ data, onDeleted }: { data: Overview | null; onDeleted: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)} disabled={!data} className={cn(ui.pillGray, 'gap-2')}>
        <UserRound className="size-4" /> Mon compte
      </button>
      {open && data && <AccountDialog data={data} onClose={() => setOpen(false)} onDeleted={onDeleted} />}
    </>
  )
}

function AccountDialog({ data, onClose, onDeleted }: { data: Overview; onClose: () => void; onDeleted: () => void }) {
  const [zone, setZone] = useState<string | null | undefined>(undefined)
  const [email, setEmail] = useState<string | undefined>(undefined)
  const [editingZone, setEditingZone] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    api.residentZone().then((r) => setZone(r.zone), () => setZone(null))
    api.account().then((a) => setEmail(a.email), () => setEmail(''))
  }, [])

  async function saveZone(z: string) {
    try {
      await api.updateAccount({ zone: z })
      forgetZoneLookup() // the resident setup picks it up from now on
      setZone(z)
      setEditingZone(false)
      toast.success(`Zone ${z} enregistrée.`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const [main, ...others] = data.payments
  const row = 'flex items-start justify-between gap-6 py-4'
  const label = 'shrink-0 pt-1 text-sm text-ink/55'

  if (deleting) return <DeleteConfirm onCancel={() => setDeleting(false)} onDeleted={onDeleted} />

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

          <div className="py-4">
            <div className="flex items-start justify-between gap-6">
              <dt className={label}>Zone de résidence</dt>
              <dd className="text-right">
                {zone === undefined ? (
                  <Loader2 className="size-4 animate-spin text-ink/40" />
                ) : editingZone ? null : zone ? (
                  <span className="flex items-center gap-3">
                    <ZonePlate zone={zone} />
                    <button onClick={() => setEditingZone(true)} className={cn('text-sm', ui.link)}>
                      Changer
                    </button>
                  </span>
                ) : (
                  <button onClick={() => setEditingZone(true)} className={cn('text-sm', ui.link)}>
                    Ajouter
                  </button>
                )}
              </dd>
            </div>
            {editingZone && (
              <div className="mt-3">
                <ZoneField zone="" fromHistory={false} onZone={saveZone} />
                <button onClick={() => setEditingZone(false)} className={cn('mt-2 text-sm', ui.link)}>
                  Annuler
                </button>
              </div>
            )}
          </div>

          <div className={row}>
            <dt className={label}>E-mail</dt>
            <dd className="min-w-0 truncate text-right font-medium text-ink">
              {email === undefined ? <Loader2 className="ml-auto size-4 animate-spin text-ink/40" /> : email || '—'}
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
          Véhicules et carte viennent de PayByPhone : modifiez-les dans son application.
        </p>

        <div className="px-6 pt-6 pb-7">
          <button
            onClick={() => setDeleting(true)}
            className="inline-flex h-10 items-center rounded-full border border-destructive/30 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/5"
          >
            Supprimer mon compte
          </button>
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
      toast.success('Votre compte PaybyBot est supprimé.', { description: 'Une confirmation vous est envoyée par e-mail.' })
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
            Tout ce que PaybyBot garde est effacé, et votre compte PayByPhone n’est pas touché. Vous recevrez une
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
