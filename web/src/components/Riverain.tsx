import { useEffect, useState } from 'react'
import { Check, Loader2, Mail, Pause, Play, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { NoPayment } from '@/components/NoPayment'
import { Plate, ZonePlate } from '@/components/signs'
import { loadLast, saveLast } from '@/components/PayWizard'
import { cn } from '@/lib/utils'
import { choice, ui } from '@/lib/styles'
import { api, money, type Autopilot, type Money, type Overview, type Parking, type Rate } from '@/lib/api'

export const WEEKLY_LABEL = 'Riverain hebdo'
const WEEK_DAYS = 7

export const isWeekly = (ap: Autopilot) => ap.label === WEEKLY_LABEL

/** The weekly renewal of the car and zone of a ticket, if there is one. */
export const renewalOf = (data: Overview, s: { plate: string; location: string }) =>
  data.autopilots.find((ap) => isWeekly(ap) && ap.plate === s.plate && ap.location === s.location)

function pauseState(ap: Autopilot, now = Date.now()) {
  const start = ap.pausedFrom ? new Date(ap.pausedFrom).getTime() : null
  const end = ap.pausedUntil ? new Date(ap.pausedUntil).getTime() : null
  return {
    start,
    end,
    paused: start !== null && start <= now && (end === null || now < end),
    later: start !== null && start > now,
  }
}

/** One line on what the renewal of a running ticket will do. */
export function RenewalNote({ ap }: { ap: Autopilot }) {
  const { start, end, paused, later } = pauseState(ap)
  if (ap.lastError) return <span className="text-destructive">{ap.lastError}</span>
  if (paused) return <>Renouvellement en pause {end ? `jusqu'au ${dayText(end - 1)} inclus` : 'sans date de fin'}</>
  return (
    <>
      Renouvelé automatiquement
      {later && <span className="block">Pause prévue du {dayText(start!)} {end ? `au ${dayText(end - 1)}` : 'sans date de fin'}</span>}
    </>
  )
}

/** The "Gérer" link of a renewal and everything behind it: vacation pause, e-mail, stop. */
export function ManageRenewal({ ap, onChanged, demo = false }: { ap: Autopilot; onChanged: () => void; demo?: boolean }) {
  const [managing, setManaging] = useState(false)
  const [pausing, setPausing] = useState(false)

  async function resume() {
    try {
      await api.resumeAutopilot(ap.id)
      toast.success('Renouvellement repris.')
    } catch (e) {
      toast.error((e as Error).message)
    }
    onChanged()
  }

  async function editEmail() {
    const value = window.prompt(
      (demo ? "Mode démo : aucun e-mail n'est envoyé.\n\n" : '') +
        "Adresse e-mail pour recevoir une confirmation à chaque paiement et une alerte en cas de problème (laisser vide pour ne plus rien recevoir) :",
      ap.email ?? '',
    )
    if (value === null) return
    try {
      await api.setAutopilotEmail(ap.id, value.trim())
      toast.success(value.trim() ? 'Les confirmations seront envoyées à cette adresse.' : 'Vous ne recevrez plus d’e-mails.')
    } catch (e) {
      toast.error((e as Error).message)
    }
    onChanged()
  }

  async function stop() {
    await api.deleteAutopilot(ap.id)
    toast.success('Renouvellement hebdomadaire arrêté.', { description: 'Le ticket en cours reste valable.' })
    onChanged()
  }

  return (
    <>
      <button onClick={() => setManaging(true)} className={cn('shrink-0 text-sm', ui.link)}>
        Gérer
      </button>
      {pausing && <PauseDialog ap={ap} onClose={() => setPausing(false)} onDone={onChanged} />}
      {managing && (
        <ManageDialog
          ap={ap}
          onClose={() => setManaging(false)}
          onPause={() => {
            setManaging(false)
            setPausing(true)
          }}
          onResume={() => {
            setManaging(false)
            resume()
          }}
          onEmail={() => {
            setManaging(false)
            editEmail()
          }}
          onStop={() => {
            setManaging(false)
            stop()
          }}
        />
      )}
    </>
  )
}

const isResident = (r: Rate) => /r[ée]sid|riverain/i.test(`${r.name} ${r.type}`) && !r.parkingNotAllowedReason

/** Prominent dashboard card: weekly resident renewal, set up in two clicks. */
export function RiverainCard({
  data,
  onChanged,
  hosted = false,
  demo = false,
}: {
  data: Overview | null
  onChanged: () => void
  hosted?: boolean
  demo?: boolean
}) {
  const [open, setOpen] = useState(false)

  const weekly = data?.autopilots.filter(isWeekly) ?? []

  if (weekly.length && data) {
    // Renewals of a running ticket are shown on the ticket itself; only the others are listed here.
    const others = weekly.filter((ap) => !data.sessions.some((s) => s.plate === ap.plate && s.location === ap.location))
    return (
      <section className="rise">
        {others.length > 0 && (
          <ul className="mb-4 divide-y divide-border border-y border-border">
            {others.map((ap) => {
              const { paused } = pauseState(ap)
              return (
                <li key={ap.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <span className="flex items-center gap-3">
                      <Plate plate={ap.plate} size="sm" />
                      <ZonePlate zone={ap.location} />
                    </span>
                    <p className="mt-2 text-sm text-ink/60">
                      {ap.lastError || paused ? <RenewalNote ap={ap} /> : <>Paiement en cours…</>}
                    </p>
                  </div>
                  <ManageRenewal ap={ap} onChanged={onChanged} demo={demo} />
                </li>
              )
            })}
          </ul>
        )}
        <button onClick={() => setOpen(true)} className={cn('text-sm', ui.link)}>
          Renouveler un autre véhicule
        </button>
        <RiverainDialog open={open} onOpenChange={setOpen} data={data} onDone={onChanged} hosted={hosted} />
      </section>
    )
  }

  return (
    <>
      <section className="rise">
        <h2 className="font-heading text-xl font-bold">Vous êtes riverain ?</h2>
        <p className="mt-1 text-ink/60">
          {hosted
            ? 'Votre forfait résident, repayé tout seul à chaque échéance, même appareil éteint.'
            : 'Votre forfait résident, repayé tout seul à chaque échéance.'}
        </p>
        <button onClick={() => setOpen(true)} disabled={!data} className={cn('mt-5', ui.primary)}>
          Activer le renouvellement
        </button>
      </section>
      {data && <RiverainDialog open={open} onOpenChange={setOpen} data={data} onDone={onChanged} hosted={hosted} />}
    </>
  )
}

function RiverainDialog({
  open,
  onOpenChange,
  data,
  onDone,
  hosted,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Overview
  onDone: () => void
  hosted: boolean
}) {
  const [plate, setPlate] = useState('')
  const [zone, setZone] = useState('')
  const [zoneFromHistory, setZoneFromHistory] = useState(false)
  const [payment, setPayment] = useState('')
  const [rate, setRate] = useState<Rate | null>(null)
  const [quote, setQuote] = useState<{ cost: Money } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Prefill from the last payment each time the dialog opens.
  useEffect(() => {
    if (!open) return
    const last = loadLast()
    const covered = new Set(data.autopilots.filter(isWeekly).map((a) => a.plate))
    const plates = data.vehicles.map((v) => v.plate)
    setPlate(plates.find((p) => p === last.plate && !covered.has(p)) ?? plates.find((p) => !covered.has(p)) ?? plates[0] ?? '')
    // The home zone: the one where PayByPhone offers this account the resident rate. The last one-off
    // payment's zone is not used, it is rarely the home one.
    setZone('')
    setZoneFromHistory(false)
    api.residentZone().then(
      (r) => {
        if (r.zone) {
          setZone((z) => z || r.zone!)
          setZoneFromHistory(true)
        }
      },
      () => {},
    )
    setPayment(data.payments.find((p) => p.id === last.paymentAccountId)?.id ?? data.payments[0]?.id ?? '')
  }, [open, data])

  useEffect(() => {
    if (open && !payment && data.payments[0]) setPayment(data.payments[0].id)
  }, [open, data.payments, payment])

  const ready = open && plate && payment && /^\w{3,}$/.test(zone)

  // Look up the resident rate and the weekly price as soon as the zone is complete.
  useEffect(() => {
    if (!ready) {
      setRate(null)
      setQuote(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setQuote(null)
    const timer = setTimeout(async () => {
      try {
        const rates = await api.rates(zone, plate)
        const resident = rates.find(isResident)
        if (!resident) throw new Error("Aucun tarif résident pour ce véhicule dans cette zone. Vérifiez votre carte de stationnement résident dans l'application PayByPhone.")
        if (!resident.acceptedTimeUnits.includes('Days')) throw new Error("Le tarif résident de cette zone ne se paie pas à la journée.")
        const q = await api.quote(parking(resident))
        if (!cancelled) {
          setRate(resident)
          setQuote(q)
        }
      } catch (e) {
        if (!cancelled) {
          setRate(null)
          setError((e as Error).message)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zone, plate, payment])

  function parking(r: Rate): Parking {
    return { location: zone, rate: r.ratePolicyId, duration: WEEK_DAYS, unit: 'Days', plate, paymentAccountId: payment }
  }

  async function activate() {
    if (!rate) return
    setSaving(true)
    try {
      const p = parking(rate)
      await api.addAutopilot({ ...p, label: WEEKLY_LABEL }) // confirmations go to the account e-mail
      saveLast(p)
      toast.success('Renouvellement hebdomadaire activé.', {
        description: data.sessions.some((s) => s.plate === plate && s.location === zone)
          ? 'Il prendra le relais à la fin de votre ticket actuel.'
          : 'La première semaine est en cours de paiement.',
      })
      onOpenChange(false)
      setTimeout(onDone, 2500)
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const hasCurrent = data.sessions.some((s) => s.plate === plate && s.location === zone)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={ui.dialog}>
        <div className="px-6 pt-7">
          <DialogTitle className={ui.dialogTitle}>Renouvellement riverain</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">Vérifiez, puis activez. On s'occupe du reste.</DialogDescription>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <p className={ui.label}>Véhicule</p>
            <div className="flex flex-wrap gap-2">
              {data.vehicles.map((v) => (
                <button
                  key={v.plate}
                  onClick={() => setPlate(v.plate)}
                  aria-pressed={plate === v.plate}
                  className={choice(plate === v.plate, 'p-2')}
                >
                  <Plate plate={v.plate} size="sm" />
                </button>
              ))}
            </div>
          </div>

          <ZoneField
            zone={zone}
            fromHistory={zoneFromHistory}
            onZone={(z) => {
              setZone(z)
              setZoneFromHistory(false)
            }}
          />

          {!data.payments.length && <NoPayment compact onRefresh={async () => onDone()} />}

          {data.payments.length > 1 && (
            <div>
              <p className={ui.label}>Payer avec</p>
              <div className="flex flex-wrap gap-2">
                {data.payments.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPayment(p.id)}
                    className={choice(payment === p.id, 'px-3 py-2 text-sm font-bold')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl bg-muted p-4" aria-live="polite">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : loading ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Recherche du tarif résident…
              </p>
            ) : rate && quote ? (
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <Check className="size-4" />
                  <span>
                    Tarif <strong>{rate.name}</strong>, 7 jours
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Repeat className="size-4" />
                  {hasCurrent ? 'Prend le relais à la fin du ticket en cours' : 'Première semaine payée tout de suite'}
                </li>
                <li className="flex items-baseline justify-between pt-2">
                  <span className="text-muted-foreground">Chaque semaine</span>
                  <span className="font-heading text-3xl font-bold">{money(quote.cost)}</span>
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground">Indiquez votre adresse pour voir le prix.</p>
            )}
          </div>

          <button onClick={activate} disabled={!rate || !quote || saving} className={ui.primary}>
            {saving ? <Loader2 className="size-5 animate-spin" /> : <>Activer {quote ? `· ${money(quote.cost)} par semaine` : ''}</>}
          </button>
          <p className="-mt-3 text-center text-sm text-ink/50">
            {hosted
              ? "Fonctionne en ligne, même appareil éteint. Pour payer à votre place, PaybyBot garde de quoi se reconnecter à PayByPhone, chiffré, et l'efface dès que vous arrêtez."
              : 'Laissez PaybyBot ouvert sur cet ordinateur. Vous pouvez arrêter à tout moment.'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The home zone: shown when known (history, last payment), else found from the address. */
export function ZoneField({
  zone,
  fromHistory,
  onZone,
  autoFocus = true,
}: {
  zone: string
  fromHistory: boolean
  onZone: (zone: string) => void
  autoFocus?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ label: string; postcode: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = editing || !zone

  useEffect(() => {
    const q = query.trim()
    setError(null)
    if (/^\d{5}$/.test(q)) {
      setResults([{ label: `Code postal ${q}`, postcode: q }])
      return
    }
    if (q.length < 4) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const found = await api.searchAddress(q)
        if (!cancelled) setResults(found)
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (!open) {
    return (
      <div>
        <p className={ui.label}>Zone de votre domicile</p>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-3">
            <ZonePlate zone={zone} />
            {fromHistory && <span className="text-sm text-ink/50">d'après votre historique</span>}
          </span>
          <button onClick={() => setEditing(true)} className={cn('text-sm', ui.link)}>
            Changer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label htmlFor="riverain-address" className={ui.label}>
        Votre adresse de résidence
      </label>
      <div className="relative">
        <input
          id="riverain-address"
          autoComplete="street-address"
          placeholder="12 rue de Lévis, Paris"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus={autoFocus}
          className={cn(ui.field, 'h-12 pr-10 text-base')}
        />
        {searching && <Loader2 className="absolute top-3.5 right-3.5 size-5 animate-spin text-ink/30" />}
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {results.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-xl border border-ink/15" role="listbox" aria-label="Adresses trouvées">
          {results.map((r) => (
            <li key={r.label}>
              <button
                role="option"
                aria-selected={false}
                onClick={() => {
                  onZone(r.postcode)
                  setQuery('')
                  setEditing(false)
                }}
                className="flex w-full items-center justify-between gap-3 border-b border-ink/10 px-4 py-3 text-left last:border-b-0 hover:bg-muted"
              >
                <span className="w-0 flex-1 truncate">{r.label}</span>
                <span className="shrink-0 text-sm font-bold text-ink/50">{r.postcode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {zone && (
        <button onClick={() => setEditing(false)} className={cn('mt-2 text-sm', ui.link)}>
          Garder la zone {zone}
        </button>
      )}
    </div>
  )
}

function dayText(ms: number) {
  return new Date(ms).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Vacation pause: no payment between two days (Paris time), or from a day with no end yet. */
function PauseDialog({ ap, onClose, onDone }: { ap: Autopilot; onClose: () => void; onDone: () => void }) {
  const today = isoDay(new Date())
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState('')
  const [noEnd, setNoEnd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = start >= today && (noEnd || (end !== '' && end >= start))

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await api.pauseAutopilot(ap.id, start, noEnd ? null : end)
      toast.success('Pause enregistrée.', {
        description: noEnd ? 'Reprenez quand vous voulez depuis le tableau de bord.' : 'Le renouvellement reprendra tout seul.',
      })
      onClose()
      onDone()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={ui.dialog}>
        <div className="px-6 pt-7">
          <DialogTitle className={ui.dialogTitle}>Pause vacances</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">
            Aucun forfait ne sera payé pendant la pause. Un ticket déjà en cours reste valable jusqu’à sa fin.
          </DialogDescription>
        </div>
        <div className="space-y-5 p-6">
          <div className="flex items-center gap-3">
            <Plate plate={ap.plate} size="sm" />
            <ZonePlate zone={ap.location} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className={ui.label}>Premier jour</span>
              <input type="date" min={today} value={start} onChange={(e) => setStart(e.target.value)} className={cn(ui.field, 'h-12 text-base')} />
            </label>
            <label className="space-y-1.5">
              <span className={ui.label}>Dernier jour</span>
              <input
                type="date"
                min={start}
                value={end}
                disabled={noEnd}
                onChange={(e) => setEnd(e.target.value)}
                className={cn(ui.field, 'h-12 text-base disabled:opacity-40')}
              />
            </label>
          </div>
          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} className="size-5 accent-[var(--eu)]" />
            <span>Pas de date de fin pour le moment</span>
          </label>
          <p className={ui.note}>
            {noEnd
              ? `En pause à partir du ${start ? dayText(new Date(start + 'T12:00').getTime()) : '…'}, jusqu’à ce que vous repreniez.`
              : end
                ? `En pause du ${dayText(new Date(start + 'T12:00').getTime())} au ${dayText(new Date(end + 'T12:00').getTime())} inclus. Reprise automatique le lendemain.`
                : 'Choisissez le dernier jour de pause.'}
          </p>
          {error && <p role="alert" className="rounded-lg border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-destructive">{error}</p>}
          <button onClick={save} disabled={!valid || saving} className={ui.primary}>
            {saving ? <Loader2 className="size-5 animate-spin" /> : 'Mettre en pause'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The options of one renewal, behind a single "Gérer" link to keep the card quiet. */
function ManageDialog({
  ap,
  onClose,
  onPause,
  onResume,
  onEmail,
  onStop,
}: {
  ap: Autopilot
  onClose: () => void
  onPause: () => void
  onResume: () => void
  onEmail: () => void
  onStop: () => void
}) {
  const now = Date.now()
  const start = ap.pausedFrom ? new Date(ap.pausedFrom).getTime() : null
  const end = ap.pausedUntil ? new Date(ap.pausedUntil).getTime() : null
  const pauseSet = start !== null && (end === null || now < end)
  const row = 'flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-base font-bold transition hover:bg-muted'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 rounded-2xl bg-white p-2 sm:max-w-sm">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <Plate plate={ap.plate} size="sm" />
          <DialogTitle className="text-base font-bold">Renouvellement zone {ap.location}</DialogTitle>
          <DialogDescription className="sr-only">Options du renouvellement</DialogDescription>
        </div>
        {pauseSet ? (
          <button onClick={onResume} className={row}>
            <Play className="size-5" /> {start! <= now ? 'Reprendre maintenant' : 'Annuler la pause prévue'}
          </button>
        ) : (
          <button onClick={onPause} className={row}>
            <Pause className="size-5" /> Pause vacances
          </button>
        )}
        <button onClick={onEmail} className={row}>
          <Mail className="size-5" />
          <span className="min-w-0">
            Confirmations par e-mail
            <span className="block truncate text-sm font-normal text-muted-foreground">{ap.email || 'Désactivées'}</span>
          </span>
        </button>
        <button onClick={onStop} className={`${row} text-destructive hover:bg-destructive/10`}>
          <Repeat className="size-5" /> Arrêter le renouvellement
        </button>
      </DialogContent>
    </Dialog>
  )
}
