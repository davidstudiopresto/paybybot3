import { useEffect, useMemo, useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { NoPayment } from '@/components/NoPayment'
import { PlansDialog } from '@/components/Pricing'
import { clearPending, RenewalActions, savePending, type PendingRenewal } from '@/components/Riverain'
import { arrondissement, PayByPhone, Plate, plateText, withPayByPhone } from '@/components/signs'
import { api, ApiError, unitLabel, type Autopilot, type Money, type Overview, type Rate, type Unit } from '@/lib/api'
import { ui } from '@/lib/styles'
import { cn } from '@/lib/utils'

/**
 * Tickets on precise days (visitor, Handi, pro…), for people without a resident rate or for other needs: a ticket
 * taken automatically on the chosen days at the chosen time. The server already runs these (days + start).
 */

export const DAILY_LABEL = 'Jours précis'
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']

/** « Du lundi au samedi », « Lundi, mercredi et vendredi ». */
function daysText(days: number[]) {
  const d = [...days].sort()
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1)
  if (d.length > 2 && d[d.length - 1] - d[0] === d.length - 1) return `Du ${DAY_NAMES[d[0]]} au ${DAY_NAMES[d[d.length - 1]]}`
  const names = d.map((i) => DAY_NAMES[i])
  return cap(names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`)
}

/** « 9 h », « 14 h 30 »: the start time, plus some minutes when given (the ticket's end). */
function hourText(start: string, plusMinutes = 0) {
  const [h, m] = start.split(':').map(Number)
  const t = (h * 60 + m + plusMinutes) % (24 * 60)
  const mm = t % 60
  return `${Math.floor(t / 60)} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`
} // 0 = Monday … 5 = Saturday; Sundays and holidays are free
const TEAL = 'bg-[#4e9aa0]'

const euros = (m?: Money | null) => (m ? m.amount.toFixed(2).replace('.', ',') + ' €' : '—')
const keyOf = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
const isDaily = (ap: Autopilot) => !!(ap as Autopilot & { days?: number[] }).days?.length
const daysOf = (ap: Autopilot) => (ap as Autopilot & { days?: number[] }).days ?? []
const startOf = (ap: Autopilot) => (ap as Autopilot & { start?: string | null }).start ?? '09:00'
const heavy = (r: Rate) => /lourd/i.test(r.name)
const light = (r: Rate) => /l[ée]ger/i.test(r.name)
const handi = (r: Rate) => /handi/i.test(`${r.name} ${r.type}`)
const resident = (r: Rate) => /r[ée]sident/i.test(`${r.name} ${r.type}`)

/** « 6 h », « 1 jour », « 360 min ». */
function lengthText(duration: number, unit: Unit) {
  if (unit === 'Days') return `${duration} jour${duration > 1 ? 's' : ''}`
  if (unit === 'Hours') return `${duration} h`
  return duration % 60 === 0 ? `${duration / 60} h` : `${duration} min`
}

/** The next ticket of a precise-days rule (Paris ≈ the browser's time): the next chosen day at the start time. */
function nextTicket(days: number[], start: string) {
  const [h, m] = start.split(':').map(Number)
  const d = new Date()
  for (let i = 0; i < 14; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, h, m)
    const wd = (day.getDay() + 6) % 7
    if (days.includes(wd) && day.getTime() > Date.now()) return day
  }
  return null
}

function when(t: Date) {
  const day = t.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
  return `${day} à ${t.getHours()}h${t.getMinutes() ? String(t.getMinutes()).padStart(2, '0') : ''}`
}

/** The rate's name without PayByPhone's zone suffix: « Visiteur - Véhicule léger - 75012-75020 » → « Visiteur ». */
function rateLabel(name: string) {
  const base = name.split(' - ')[0]
  return /visiteur/i.test(base) ? 'Visiteur' : base
}

/** One automatic ticket on precise days, in the style of the ticket card. */
function DailyCard({ ap, onChanged }: { ap: Autopilot; onChanged: () => void }) {
  const next = ap.enabled ? nextTicket(daysOf(ap), startOf(ap)) : null
  return (
    <article className="rise overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-4">
        <span className="flex items-baseline gap-3">
          <span className="text-[1.05rem] font-medium text-ink">
            <PayByPhone />
          </span>
          <span className="tracking-wide text-ink/50 tabular-nums">{plateText(ap.plate)}</span>
        </span>
        <span className="text-sm text-ink/50">{arrondissement(ap.location) ?? `Zone ${ap.location}`}</span>
      </div>
      <div className="border-t border-ink/[0.06] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-ink">Ticket {lengthText(Number(ap.duration), ap.unit)}, jours précis</span>
          <span className={cn('relative h-6 w-11 rounded-full', ap.enabled ? TEAL : 'bg-ink/15')} aria-label={ap.enabled ? 'Actif' : 'Arrêté'}>
            <span className={cn('absolute top-1 size-4 rounded-full bg-white transition-all', ap.enabled ? 'right-1' : 'left-1')} />
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (
            <span
              key={d}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-xs',
                daysOf(ap).includes(i) ? 'bg-[#4e9aa0]/15 font-medium text-[#3d7f84]' : 'bg-ink/[0.04] text-ink/35',
              )}
            >
              {d}
            </span>
          ))}
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-ink/50">Heure de prise</dt>
            <dd className="text-ink tabular-nums">{startOf(ap).replace(':', 'h')}</dd>
          </div>
          {next && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink/50">Prochain ticket</dt>
              <dd className="text-ink tabular-nums">{when(next)}</dd>
            </div>
          )}
          {ap.lastPayment && (
            <div className="flex justify-between gap-4">
              <dt className="text-ink/50">Dernier ticket</dt>
              <dd className="text-ink tabular-nums">{when(new Date(ap.lastPayment))}</dd>
            </div>
          )}
        </dl>
        {ap.lastError && <p className="mt-3 text-sm text-destructive">{ap.lastError}</p>}
      </div>
      <div className="border-t border-ink/[0.06] px-5 pt-4 pb-5">
        <RenewalActions ap={ap} onChanged={onChanged} />
      </div>
    </article>
  )
}

/** The section of the dashboard: the precise-days tickets and the way to add one. */
export function DailyTickets({
  data,
  onChanged,
  needsOffer = false,
  locked = false,
  autoOpen = false,
  onLogout,
}: {
  data: Overview
  onChanged: () => void
  /** Online, no offer chosen yet: activating leads to the offer screen first. */
  needsOffer?: boolean
  /** Online, no offer and no resident vehicle: the wizard opens by itself and stays open (then the offer). */
  locked?: boolean
  /** Just past the welcome page (no resident car): open the wizard once, closable. */
  autoOpen?: boolean
  onLogout?: () => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (locked || autoOpen) setOpen(true)
  }, [locked, autoOpen])
  const daily = data.autopilots.filter(isDaily)
  return (
    <section className="rise mt-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm text-ink/50">Tickets non-résident</h2>
        <button onClick={() => setOpen(true)} className={cn(ui.pillGray, 'gap-1.5')}>
          <Plus className="size-4" /> Programmer un ticket
        </button>
      </div>
      {daily.length ? (
        <div className="mt-3 space-y-3">
          {daily.map((ap) => (
            <DailyCard key={ap.id} ap={ap} onChanged={onChanged} />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl border border-dashed border-ink/15 px-5 py-4 text-sm leading-relaxed text-ink/55">
          Pas de tarif résident, ou besoin d’un ticket visiteur certains jours ? {withPayByPhone('PayByBot le prend sur PayByPhone')} à l’heure voulue, chaque
          jour choisi.
        </p>
      )}
      {open && (
        <DailyWizard data={data} onClose={() => setOpen(false)} onDone={onChanged} needsOffer={needsOffer} locked={locked} onLogout={onLogout} />
      )}
    </section>
  )
}

/** Four steps, like the rest of the app: vehicle and zone, the ticket, its time and days, then check and activate. */
function DailyWizard({
  data,
  onClose,
  onDone,
  needsOffer,
  locked,
  onLogout,
}: {
  data: Overview
  onClose: () => void
  onDone: () => void
  needsOffer: boolean
  locked: boolean
  onLogout?: () => void
}) {
  const [step, setStep] = useState(1)
  const [plate, setPlate] = useState(data.vehicles[0]?.plate ?? '')
  const [zone, setZone] = useState('')
  const [rates, setRates] = useState<Rate[] | null>(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateId, setRateId] = useState<string | null>(null)
  const [duration, setDuration] = useState(6)
  const [unit, setUnit] = useState<Unit>('Hours')
  const [over, setOver] = useState(false)
  const [start, setStart] = useState('09:00')
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5])
  const [cost, setCost] = useState<Money | null | undefined>(undefined)
  const cards = data.payments.filter((p) => p.kind === 'card' && !p.expired)
  const [payment, setPayment] = useState(cards[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  // Online, no offer chosen yet: the offer screen first, as for the weekly renewal; the ticket is programmed on the
  // way back from Stripe (nothing is charged before the end of the free month).
  const [paywall, setPaywall] = useState(false)

  const place = /^\d{5}$/.test(zone) ? arrondissement(zone) : null
  // The visitor rate comes as « léger » and « lourd »: PayByPhone does not know the weight, so one question instead.
  const usable = useMemo(() => (rates ?? []).filter((r) => !r.parkingNotAllowedReason && !resident(r)), [rates])
  const hasWeight = usable.some(light) && usable.some(heavy)
  const handiRate = usable.find(handi) ?? null
  const effective = usable.find((r) => r.ratePolicyId === rateId) ?? null
  // One question, every answer with its price: the CMI-S card first (always shown), then the visitor rates by weight.
  const options = [...(handiRate ? [handiRate] : []), ...usable.filter((r) => !handi(r)).sort((a, b) => Number(heavy(a)) - Number(heavy(b)))]
  // PayByPhone gives no maximum stay with its rates: a day when the rate sells days, else Paris' 6 hours for visitors.
  // The units offered per rate: Handi in days only, visitors in minutes or hours; each capped at the rate's maximum.
  const unitsOf = (r: Rate): Unit[] => (handi(r) ? ['Days'] : r.acceptedTimeUnits.filter((u) => u !== 'Days'))
  const MAX: Record<Unit, number> = { Days: 1, Hours: 6, Minutes: 360 }
  const maxStay = (r: Rate) => (r.acceptedTimeUnits.includes('Days') ? '1\u00a0jour' : '6\u00a0h')
  const optionText = (r: Rate): [string, string] => {
    const max = `${maxStay(r)} maximum`
    return handi(r)
      ? ['Carte handicapé (CMI-S)', max]
      : hasWeight && light(r)
        ? ['Visiteur · véhicule léger', `Moins de 1,6 t · ${max}`]
        : hasWeight && heavy(r)
          ? ['Visiteur · véhicule lourd', `Plus de 1,6 t · ${max}`]
          : [rateLabel(r.name), max]
  }

  async function findRates() {
    setLooking(true)
    setError(null)
    try {
      const list = await api.rates(zone, plate)
      setRates(list)
      const first = list.filter((r) => !r.parkingNotAllowedReason && !resident(r))
      setRateId((first.find(handi) ?? first[0])?.ratePolicyId ?? null)
      setStep(2)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLooking(false)
    }
  }

  // Duration preset to what the rate allows: a day when it sells days, else 6 hours (Paris visitors' maximum).
  useEffect(() => {
    if (!effective) return
    const units = unitsOf(effective)
    const u: Unit = units.includes('Hours') ? 'Hours' : (units[0] ?? 'Days')
    setUnit(u)
    setDuration(MAX[u])
    setOver(false)
    setStart(handi(effective) ? '05:00' : '09:00') // Handi: taken before 9 h, the day's ticket covers the whole paid day
  }, [effective?.ratePolicyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Every option's price for its own preset length (a day, or 6 hours), so each answer shows what it costs.
  const [prices, setPrices] = useState<Record<string, Money | null>>({})
  useEffect(() => {
    if (step !== 2 || !payment || !usable.length) return
    let cancelled = false
    setPrices({})
    for (const r of usable) {
      const days = r.acceptedTimeUnits.includes('Days')
      api
        .quote({
          location: zone,
          rate: r.ratePolicyId,
          duration: days ? 1 : 6,
          unit: days ? 'Days' : 'Hours',
          plate,
          paymentAccountId: payment,
        })
        .then(
          (q) => q.cost,
          () => null,
        )
        .then((c) => !cancelled && setPrices((p) => ({ ...p, [r.ratePolicyId]: c })))
    }
    return () => {
      cancelled = true
    }
  }, [step, usable, zone, plate, payment])

  // The price of one ticket, from PayByPhone.
  useEffect(() => {
    if (step < 2 || !effective || !payment) return
    let cancelled = false
    setCost(undefined)
    api
      .quote({
        location: zone,
        rate: effective.ratePolicyId,
        duration,
        unit,
        plate,
        paymentAccountId: payment,
      })
      .then(
        (q) => !cancelled && setCost(q.cost),
        () => !cancelled && setCost(null),
      )
    return () => {
      cancelled = true
    }
  }, [step, effective?.ratePolicyId, duration, unit, zone, plate, payment]) // eslint-disable-line react-hooks/exhaustive-deps

  const rule = (): PendingRenewal => ({
    location: zone,
    rate: effective!.ratePolicyId,
    duration,
    unit,
    plate,
    paymentAccountId: payment,
    label: DAILY_LABEL,
    days,
    start,
  })

  async function activate() {
    if (!effective) return
    if (needsOffer) {
      setPaywall(true)
      return
    }
    setSaving(true)
    try {
      await api.addAutopilot(rule() as Parameters<typeof api.addAutopilot>[0])
      toast.success('Ticket programmé.', {
        description: `Prochain ticket ${when(nextTicket(days, start)!)}.`,
      })
      onDone()
      onClose()
    } catch (e) {
      // No subscription yet (the account had not loaded): the offer screen.
      if (e instanceof ApiError && e.status === 402 && /offre/.test(e.message)) setPaywall(true)
      else toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const steps = ['Véhicule et zone', 'Votre ticket', 'Horaires et jours', 'Vérifier et activer']

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && !locked && onClose()}>
      <DialogContent className={ui.dialog} showCloseButton={!locked}>
        <div className="px-6 pt-7">
          <p className="text-xs font-medium tracking-wide text-ink/45 uppercase">
            Étape {step} sur {steps.length} · {steps[step - 1]}
          </p>
          <DialogTitle className={cn(ui.dialogTitle, 'mt-1')}>Programmer un ticket</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">Pris automatiquement les jours choisis, à l’heure voulue.</DialogDescription>
          <div className="mt-5 grid grid-cols-4 gap-1.5" aria-hidden>
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={cn('h-1 rounded-full', n <= step ? TEAL : 'bg-ink/[0.08]')} />
            ))}
          </div>
        </div>

        <div className="space-y-6 p-6">
          {step === 1 && (
            <>
              <div>
                <p className={ui.label}>Véhicule</p>
                <div className="flex flex-wrap gap-2">
                  {data.vehicles.map((v) => (
                    <button
                      key={v.plate}
                      onClick={() => setPlate(v.plate)}
                      aria-pressed={keyOf(plate) === keyOf(v.plate)}
                      className={cn(
                        'rounded-xl border p-2 transition',
                        keyOf(plate) === keyOf(v.plate)
                          ? 'border-[#4e9aa0] bg-[#4e9aa0]/[0.08] ring-1 ring-[#4e9aa0]'
                          : 'border-ink/15 opacity-70 hover:opacity-100',
                      )}
                    >
                      <Plate plate={v.plate} size="sm" />
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className={ui.label}>Où vous garez-vous ?</p>
                <input
                  value={zone}
                  onChange={(e) => setZone(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  inputMode="numeric"
                  placeholder="Code postal, ex. 75016"
                  className={ui.field}
                />
                <p className="mt-2 text-sm text-ink/50">{place ? `✓ ${place}` : 'À Paris, le code postal de l’arrondissement suffit.'}</p>
              </div>
              {error && <p className={ui.error}>{error}</p>}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <p className={ui.label}>Quel ticket prendre ?</p>
                <div className="space-y-2">
                  {options.map((r) => {
                    const [title, hint] = optionText(r)
                    const price = prices[r.ratePolicyId]
                    return (
                      <button
                        key={r.ratePolicyId}
                        onClick={() => setRateId(r.ratePolicyId)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition',
                          rateId === r.ratePolicyId ? 'border-[#4e9aa0] bg-[#4e9aa0]/[0.06]' : 'border-ink/15 hover:border-ink/30',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-ink">{title}</span>
                          <span className="block text-sm text-ink/50">{hint}</span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="block text-sm font-medium text-ink">
                            {handi(r) ? 'Gratuit' : price === undefined ? <Loader2 className="inline size-3.5 animate-spin text-ink/40" /> : euros(price)}
                          </span>
                          {!handi(r) && <span className="block text-xs text-ink/45">par jour</span>}
                        </span>
                      </button>
                    )
                  })}
                  {!handiRate && options.length > 0 && (
                    // No Handi rate offered here by PayByPhone: shown anyway, greyed, so the option is not forgotten.
                    <div className="flex w-full items-center gap-3 rounded-xl border border-dashed border-ink/15 px-4 py-3 text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-ink/45">Carte handicapé (CMI-S)</span>
                        <span className="block text-sm text-ink/45">
                          {withPayByPhone('PayByPhone ne le propose pas pour ce véhicule dans cette zone.')}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-ink/45">Gratuit</span>
                    </div>
                  )}
                  {!options.length && <p className="text-sm text-ink/55">Aucun ticket disponible pour ce véhicule dans cette zone.</p>}
                </div>
                {hasWeight && (
                  <p className="mt-2 text-xs text-ink/45">
                    {withPayByPhone('PayByPhone ne connaît pas le poids du véhicule : à Paris, le tarif visiteur est trois fois plus cher au-delà de 1,6 t.')}
                  </p>
                )}
              </div>
            </>
          )}

          {step === 3 && effective && (
            <>
              {/* Handi: nothing to set but the days; a day's ticket taken at 5 h, before the paid hours */}
              {!handi(effective) && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className={ui.label}>Durée du ticket</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX[unit]}
                        value={duration}
                        onChange={(e) => {
                          const n = Math.max(1, Math.round(Number(e.target.value) || 1))
                          setOver(n > MAX[unit]) // brought back to the maximum, with a discreet word below
                          setDuration(Math.min(MAX[unit], n))
                        }}
                        className={cn(ui.field, 'w-16 shrink-0 px-0 text-center tabular-nums')}
                      />
                      {/* Units side by side, like the option cards: one tap, no drop-down */}
                      <div className="flex min-w-0 flex-1 rounded-xl bg-ink/[0.05] p-1">
                        {(effective ? unitsOf(effective) : [unit]).map((u) => (
                          <button
                            key={u}
                            type="button"
                            onClick={() => {
                              setUnit(u)
                              setDuration(MAX[u])
                            }}
                            className={cn(
                              'min-w-0 flex-1 rounded-lg px-2 text-sm transition',
                              unit === u ? 'bg-white font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink/50 hover:text-ink/70',
                            )}
                          >
                            {u === 'Minutes' ? 'min' : unitLabel(u, duration)}
                          </button>
                        ))}
                      </div>
                    </div>
                    {over && (
                      <p className="mt-2 text-xs text-[#741b11]/80">
                        {MAX[unit]} {unitLabel(unit, MAX[unit])} maximum pour ce tarif.
                      </p>
                    )}
                  </div>
                  <div>
                    <p className={ui.label}>Heure de prise</p>
                    <input type="time" value={start} onChange={(e) => setStart(e.target.value || '09:00')} className={ui.field} />
                    <p className="mt-2 text-xs text-ink/45">
                      Fin du ticket : <span className="font-medium text-ink tabular-nums">{hourText(start, unit === 'Hours' ? duration * 60 : duration)}</span>
                    </p>
                  </div>
                </div>
              )}
              <div>
                <p className={ui.label}>Jours</p>
                {/* A week strip, same cards as the tickets above; Sunday shown but free, so never picked */}
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = days.includes(i)
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDays((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i].sort()))}
                        className={cn(
                          'flex h-14 flex-col items-center justify-center gap-1 rounded-xl border text-sm transition',
                          on ? 'border-[#4e9aa0] bg-[#4e9aa0]/[0.06] font-medium text-ink' : 'border-ink/15 text-ink/45 hover:border-ink/30',
                        )}
                      >
                        {d}
                        <span className={cn('grid size-4 place-items-center rounded-full', on ? 'bg-[#4e9aa0] text-white' : 'border border-ink/20')}>
                          {on && <Check className="size-3" strokeWidth={3} />}
                        </span>
                      </button>
                    )
                  })}
                  <div className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink/10 text-sm text-ink/30">
                    Dim
                    <span className="text-[0.65rem] leading-none">gratuit</span>
                  </div>
                </div>
                {handi(effective) && (
                  <p className="mt-3 text-sm text-ink/70">Le ticket Handi d’une journée est pris automatiquement à 5 h, chaque jour choisi.</p>
                )}
                <p className="mt-2 text-xs text-ink/45">Le dimanche et les jours fériés sont gratuits : aucun ticket n’est pris.</p>
              </div>
              <div className="rounded-xl bg-ink/[0.03] px-4 py-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-ink/55">Prix d’un ticket</span>
                  <span className="font-medium text-ink tabular-nums">
                    {cost === undefined ? <Loader2 className="inline size-4 animate-spin text-ink/40" /> : euros(cost)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-ink/45">{withPayByPhone('Payé à PayByPhone au tarif habituel, à chaque ticket.')}</p>
              </div>
            </>
          )}

          {step === 4 && effective && (
            <>
              <dl className="divide-y divide-ink/[0.06] rounded-xl border border-ink/10 text-sm">
                {[
                  ['Véhicule', plateText(plate)],
                  ['Zone', place ?? `Zone ${zone}`],
                  ['Ticket', optionText(effective)[0]],
                  ['Jours', daysText(days)],
                  ['Horaire', handi(effective) ? 'Toute la journée' : `${hourText(start)} → ${hourText(start, unit === 'Hours' ? duration * 60 : duration)}`],
                  ['Prix', handi(effective) ? 'Gratuit' : cost ? `${euros(cost)} par jour` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                    <dt className="text-ink/55">{k}</dt>
                    <dd className="text-right text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              {!cards.length ? (
                <NoPayment compact onRefresh={async () => onDone()} />
              ) : (
                cards.length > 1 && (
                  <div>
                    <p className={ui.label}>Payer avec</p>
                    <div className="flex flex-wrap gap-2">
                      {cards.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setPayment(p.id)}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-sm font-semibold',
                            payment === p.id ? 'border-[#4e9aa0] bg-[#4e9aa0]/[0.06]' : 'border-ink/15',
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )}
              {nextTicket(days, start) && (
                <p className="rounded-xl bg-[#e7f6ec] px-4 py-3 text-sm text-[#14703a]">
                  Premier ticket {when(nextTicket(days, start)!)}. Un e-mail à chaque ticket, et une alerte si {withPayByPhone('PayByPhone')} refuse.
                </p>
              )}
            </>
          )}

          <div className="flex gap-3 pt-1">
            {step > 1 && (
              <button onClick={() => setStep(step - 1)} className={cn(ui.primaryGray, 'w-auto flex-1')}>
                Précédent
              </button>
            )}
            {step === 1 && (
              <button onClick={findRates} disabled={!plate || zone.length !== 5 || looking} className={cn(ui.primary, 'flex-[2]')}>
                {looking ? <Loader2 className="size-5 animate-spin" /> : 'Suivant'}
              </button>
            )}
            {step === 2 && (
              <button onClick={() => setStep(3)} disabled={!effective} className={cn(ui.primary, 'flex-[2]')}>
                Suivant
              </button>
            )}
            {step === 3 && (
              <button onClick={() => setStep(4)} disabled={!effective || !days.length} className={cn(ui.primary, 'flex-[2]')}>
                Suivant
              </button>
            )}
            {step === 4 && (
              <button onClick={activate} disabled={saving || !payment || !effective} className={cn(ui.primary, 'flex-[2]')}>
                {saving ? <Loader2 className="size-5 animate-spin" /> : 'Activer'}
              </button>
            )}
          </div>
          {locked && onLogout && (
            <button onClick={onLogout} className={cn('mx-auto mt-4 block text-sm', ui.link)}>
              Se déconnecter
            </button>
          )}
        </div>
      </DialogContent>
      {paywall && (
        <PlansDialog
          onPay={() => savePending([rule()])}
          onClose={() => {
            clearPending()
            setPaywall(false)
          }}
        />
      )}
    </Dialog>
  )
}
