import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { NoPayment } from '@/components/NoPayment'
import { PlansDialog } from '@/components/Pricing'
import { clearPending, RenewalActions, savePending, type PendingRenewal } from '@/components/Riverain'
import { arrondissement, PayByPhone, Plate, withPayByPhone } from '@/components/signs'
import { api, ApiError, unitLabel, type Autopilot, type Money, type Overview, type Rate, type Unit } from '@/lib/api'
import { ui } from '@/lib/styles'
import { cn } from '@/lib/utils'

/**
 * Tickets on precise days (visitor, Handi, pro…), for people without a resident rate or for other needs: a ticket
 * taken automatically on the chosen days at the chosen time. The server already runs these (days + start).
 */

export const DAILY_LABEL = 'Jours précis'
const DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
/** A Paris zone (75001 to 75020, 75116): Sundays and holidays free, visitors 6 h at most. Anywhere else PayByPhone
 *  works, every day can be chosen and PayByPhone itself says what it accepts. */
const isParis = (zone: string | null | undefined) => /^75(0\d\d|116)$/.test(zone ?? '')

/** « Du lundi au samedi », « Lundi, mercredi et vendredi ». */
function daysText(days: number[]) {
  const d = [...days].sort()
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1)
  if (d.length > 2 && d[d.length - 1] - d[0] === d.length - 1) return `Du ${DAY_NAMES[d[0]]} au ${DAY_NAMES[d[d.length - 1]]}`
  const names = d.map((i) => DAY_NAMES[i])
  return cap(names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`)
}

/** When the ticket ends: « 15 h », or « le lendemain 9 h » for a day ticket (or one running past midnight). */
function endText(start: string, duration: number, unit: Unit) {
  const minutes = unit === 'Days' ? duration * 24 * 60 : unit === 'Hours' ? duration * 60 : duration
  const [h, m] = start.split(':').map(Number)
  const days = Math.floor((h * 60 + m + minutes) / (24 * 60))
  return `${days === 1 ? 'le lendemain ' : days > 1 ? `${days} jours après, ` : ''}${hourText(start, minutes)}`
}

/** « 9 h », « 14 h 30 »: the start time, plus some minutes when given (the ticket's end). */
function hourText(start: string, plusMinutes = 0) {
  const [h, m] = start.split(':').map(Number)
  const t = (h * 60 + m + plusMinutes) % (24 * 60)
  const mm = t % 60
  return `${Math.floor(t / 60)} h${mm ? ` ${String(mm).padStart(2, '0')}` : ''}`
} // 0 = Monday … 6 = Sunday (never picked in Paris: Sundays and holidays are free)
const TEAL = 'bg-[#4e9aa0]'

// In PayByPhone's own currency (euros, pounds, dollars…), French style.
const euros = (m?: Money | null) =>
  m ? new Intl.NumberFormat('fr-FR', { style: 'currency', currency: m.currency || 'EUR' }).format(m.amount) : '—'
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
function nextTicket(days: number[], start: string, after?: Date | null) {
  const [h, m] = start.split(':').map(Number)
  // Renewing a running ticket: not before it ends (the next one follows on from it).
  const from = Math.max(Date.now(), after ? after.getTime() - 60_000 : 0)
  const d = new Date(from)
  for (let i = 0; i < 15; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, h, m)
    const wd = (day.getDay() + 6) % 7
    if (days.includes(wd) && day.getTime() > from) return day
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
/** Every day there is paid parking: Monday to Saturday in Paris (Sundays free), all week elsewhere. */
const everyDay = (ap: Autopilot) => {
  const d = daysOf(ap)
  return isParis(ap.location) ? [0, 1, 2, 3, 4, 5].every((x) => d.includes(x)) : d.length === 7
}

function DailyCard({ ap, onChanged }: { ap: Autopilot; onChanged: () => void }) {
  const next = ap.enabled ? nextTicket(daysOf(ap), startOf(ap)) : null
  return (
    <article className="rise overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 pt-5 pb-4">
        <span className="flex items-center gap-3">
          <span className="text-[1.05rem] font-medium text-ink">
            <PayByPhone />
          </span>
          <Plate plate={ap.plate} size="sm" />
        </span>
        <span className="text-sm text-ink/50">{arrondissement(ap.location) ?? `Zone ${ap.location}`}</span>
      </div>
      <div className="border-t border-ink/[0.06] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-ink">
            Ticket de {lengthText(Number(ap.duration), ap.unit)}
            {everyDay(ap) ? (isParis(ap.location) ? ', chaque jour sauf dimanche et jours fériés' : ', chaque jour') : ''}
          </span>
          <span className={cn('relative h-6 w-11 rounded-full', ap.enabled ? TEAL : 'bg-ink/15')} aria-label={ap.enabled ? 'Actif' : 'Arrêté'}>
            <span className={cn('absolute top-1 size-4 rounded-full bg-white transition-all', ap.enabled ? 'right-1' : 'left-1')} />
          </span>
        </div>
        {/* The days, unless it is every day (then said in words above). */}
        {!everyDay(ap) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {DAYS.map((d, i) => (i === 6 && isParis(ap.location) && !daysOf(ap).includes(6) ? null :
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
        )}
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
    <section id="tickets-programmes" className="rise mt-10 scroll-mt-20">
      {/* No ticket programmed yet: a card that says what it is. Its button is blue when it is the one thing to do
          (nothing automated, no resident car), grey next to a resident renewal. Once one exists, a small button. */}
      {!daily.length ? (
        <div className="rounded-2xl border border-ink/10 bg-white p-6">
          <p className="font-heading text-[1.35rem] leading-tight font-medium tracking-[-0.02em] text-ink">Programmez vos tickets (non-résidents)</p>
          <p className="mt-2 leading-relaxed text-ink/60">
            {withPayByPhone('PayByBot les prend pour vous sur PayByPhone, les jours choisis et à l’heure voulue.')} Vous n’avez plus à y penser.
          </p>
          <button
            onClick={() => setOpen(true)}
            className={cn(
              'mt-5',
              !data.autopilots.some((ap) => ap.enabled) &&
                !data.vehicles.some((v) => v.zone)
                ? ui.primary
                : ui.primaryGray,
            )}
          >
            <Plus className="size-5" /> Programmer un ticket
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-4">
          <button onClick={() => setOpen(true)} className={cn(ui.pillGray, 'gap-1.5')}>
            <Plus className="size-4" /> Programmer un ticket
          </button>
        </div>
      )}
      {daily.length ? (
        <div className="mt-3 space-y-3">
          {daily.map((ap) => (
            <DailyCard key={ap.id} ap={ap} onChanged={onChanged} />
          ))}
        </div>
      ) : null}
      {open && (
        <DailyWizard data={data} onClose={() => setOpen(false)} onDone={onChanged} needsOffer={needsOffer} locked={locked} onLogout={onLogout} />
      )}
    </section>
  )
}

const PARIS_ARRONDISSEMENTS = Array.from({ length: 20 }, (_, i) => `750${String(i + 1).padStart(2, '0')}`)

/** Every PayByPhone zone number in France, from PayByPhone's own list of towns: loaded once, on demand. */
let frZones: Promise<string[]> | null = null
const loadFrZones = () => (frZones ??= import('@/lib/zones-fr.json').then((m) => m.default as string[]))

/** The zone field with a list of suggestions under it, scrolling, appearing as soon as something is typed and
 *  narrowing with each character: the zones already used on PayByPhone first (its history), then the Paris
 *  arrondissements, then every PayByPhone zone number in France. */
function ZoneInput({ value, onChange }: { value: string; onChange: (zone: string) => void }) {
  const [recent, setRecent] = useState<string[]>([])
  const [france, setFrance] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  useEffect(() => {
    api.recentZones().then(setRecent, () => {})
    loadFrZones().then(setFrance, () => {})
  }, [])
  const q = value.trim().toLowerCase()
  const label = (z: string) => arrondissement(z) ?? z
  // By the start of the number; a Paris arrondissement also by its name (« Paris 17 », « 17e »).
  const matches = (z: string) =>
    !q || z.toLowerCase().startsWith(q) || (!!arrondissement(z) && label(z).toLowerCase().replace('er', '').includes(q.replace('er', '')))
  const items = useMemo(() => {
    const seen = new Set<string>()
    const take = (z: string, used: boolean) => (seen.has(z) || z === value || !matches(z) ? [] : (seen.add(z), [{ zone: z, used }]))
    return [
      ...recent.flatMap((z) => take(z, true)),
      ...PARIS_ARRONDISSEMENTS.flatMap((z) => take(z, false)),
      ...france.flatMap((z) => take(z, false)),
    ].slice(0, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, recent, france, value])
  // Only once something is typed, narrowing as the postcode grows: nothing shows on an empty field.
  const shown = open && q.length > 0 && items.length > 0

  function pick(zone: string) {
    onChange(zone)
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value.replace(/[^0-9A-Za-z ]/g, '').slice(0, 12))
          setOpen(true)
          setActive(0)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)} // a click on a suggestion lands first
        onKeyDown={(e) => {
          if (!shown) return
          if (e.key === 'ArrowDown') (e.preventDefault(), setActive((a) => Math.min(items.length - 1, a + 1)))
          else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((a) => Math.max(0, a - 1)))
          else if (e.key === 'Enter') (e.preventDefault(), pick(items[active].zone))
          else if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Numéro de zone ou code postal"
        role="combobox"
        aria-expanded={shown}
        aria-controls="zone-suggestions"
        aria-autocomplete="list"
        className={ui.field}
      />
      {shown && (
        <ul
          id="zone-suggestions"
          role="listbox"
          className="mt-1.5 max-h-56 overflow-y-auto rounded-xl border border-ink/10 bg-white p-1 shadow-[0_18px_40px_-18px_rgb(11_16_36/0.25)]"
        >
          {items.map((x, i) => (
            <li
              key={x.zone}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => (e.preventDefault(), pick(x.zone))}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[0.95rem]', i === active && 'bg-ink/[0.05]')}
            >
              <span className="text-ink tabular-nums">{label(x.zone)}</span>
              <span className="flex shrink-0 items-center gap-2 text-sm text-ink/45 tabular-nums">
                {x.used && <span className="rounded-full bg-[#4e9aa0]/12 px-2 py-0.5 text-xs font-medium text-[#3d7f84]">Déjà utilisée</span>}
                {arrondissement(x.zone) && x.zone}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Four steps, like the rest of the app: vehicle and zone, the ticket, its time and days, then check and activate. */
export function DailyWizard({
  data,
  onClose,
  onDone,
  needsOffer,
  locked = false,
  onLogout,
  initialPlate,
  initialZone,
  initialTicket,
}: {
  data: Overview
  onClose: () => void
  onDone: () => void
  needsOffer: boolean
  locked?: boolean
  onLogout?: () => void
  /** Opened from a running ticket: its vehicle and zone, already filled in. */
  initialPlate?: string
  initialZone?: string
  /** Opened from a running ticket's « Renouvellement auto »: its rate, start and end, to take the same ticket again. */
  initialTicket?: { rate: string; start: string; expire: string }
}) {
  const [step, setStep] = useState(1)
  const [plate, setPlate] = useState(
    data.vehicles.find((v) => initialPlate && keyOf(v.plate) === keyOf(initialPlate))?.plate ?? data.vehicles[0]?.plate ?? '',
  )
  // The vehicle's usual zone by default: its resident zone, else the zone of its ticket running now.
  const zoneFor = (p: string) =>
    data.vehicles.find((v) => keyOf(v.plate) === keyOf(p))?.zone ??
    data.sessions.find((x) => keyOf(x.plate) === keyOf(p) && new Date(x.expire).getTime() > Date.now())?.location ??
    ''
  const [zone, setZone] = useState(initialZone ?? zoneFor(plate))
  const defaultZone = useRef(zone)
  useEffect(() => {
    // Another vehicle picked: its own zone, unless the user typed one.
    if (zone && zone !== defaultZone.current) return
    const z = zoneFor(plate)
    defaultZone.current = z
    setZone(z)
  }, [plate]) // eslint-disable-line react-hooks/exhaustive-deps
  const [rates, setRates] = useState<Rate[] | null>(null)
  const [looking, setLooking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rateId, setRateId] = useState<string | null>(null)
  const [cmis, setCmis] = useState(false) // « je suis titulaire de la carte CMI-S »: required for the Handi ticket
  const [duration, setDuration] = useState(6)
  const [unit, setUnit] = useState<Unit>('Hours')
  const [over, setOver] = useState(false)
  // Renewing a running ticket: the next one is taken by default at the time this one ends (not when it began).
  const chainStart = initialTicket
    ? (() => {
        const end = new Date(initialTicket.expire)
        return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
      })()
    : null
  const [start, setStart] = useState(chainStart ?? '09:00')
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5])
  const [cost, setCost] = useState<Money | null | undefined>(undefined)
  const cards = data.payments.filter((p) => p.kind === 'card' && !p.expired)
  const [payment, setPayment] = useState(cards[0]?.id ?? '')
  const [saving, setSaving] = useState(false)
  // Online, no offer chosen yet: the offer screen first, as for the weekly renewal; the ticket is programmed on the
  // way back from Stripe (nothing is charged before the end of the free month).
  const [paywall, setPaywall] = useState(false)

  const paris = isParis(zone)
  const place = paris ? arrondissement(zone) : null
  // The visitor rate comes as « léger » and « lourd »: PayByPhone does not know the weight, so one question instead.
  const usable = useMemo(() => (rates ?? []).filter((r) => !r.parkingNotAllowedReason && !resident(r)), [rates])
  const hasWeight = usable.some(light) && usable.some(heavy)
  const handiRate = usable.find(handi) ?? null
  const effective = usable.find((r) => r.ratePolicyId === rateId) ?? null
  // One question, every answer with its price: the CMI-S card first (always shown), then the visitor rates by weight.
  const options = [...(handiRate ? [handiRate] : []), ...usable.filter((r) => !handi(r)).sort((a, b) => Number(heavy(a)) - Number(heavy(b)))]
  // PayByPhone gives no maximum stay with its rates: a day when the rate sells days; for visitors, Paris' 6 hours,
  // elsewhere up to 24 hours (PayByPhone's quote refuses a longer stay than the zone allows).
  // The units offered per rate: Handi in days only, visitors in minutes or hours; each capped at the rate's maximum.
  const unitsOf = (r: Rate): Unit[] => (handi(r) ? ['Days'] : r.acceptedTimeUnits.filter((u) => u !== 'Days'))
  const MAX: Record<Unit, number> = paris ? { Days: 1, Hours: 6, Minutes: 360 } : { Days: 1, Hours: 24, Minutes: 1440 }
  const maxStay = (r: Rate) => (r.acceptedTimeUnits.includes('Days') ? '1\u00a0jour' : paris ? '6\u00a0h' : null)
  const optionText = (r: Rate): [string, string] => {
    const stay = maxStay(r)
    const max = stay ? `${stay} maximum` : r.acceptedTimeUnits.includes('Days') ? 'À la journée' : 'À l’heure'
    return handi(r)
      ? ['Carte handicapé (CMI-S)', max]
      : hasWeight && light(r)
        ? ['Visiteur · véhicule léger', `Moins de 1,6 t · ${max}`]
        : hasWeight && heavy(r)
          ? ['Visiteur · véhicule lourd', `Plus de 1,6 t · ${max}`]
          : [rateLabel(r.name), max]
  }

  // The zone check and the rates, asked together while the user types (a pause of 350 ms on a full number): on
  // « Suivant » they are usually already there, no wait.
  const ahead = useRef<{ key: string; p: Promise<[boolean, Rate[] | Error]> } | null>(null)
  const lookUp = (z: string, pl: string) =>
    Promise.all([
      api.zone(z).then((r) => r.found, () => true), // PayByPhone silent on the zone: the rates will tell
      api.rates(z, pl).then((r) => r, (e) => e as Error),
    ])
  useEffect(() => {
    if (!plate || !/^[0-9A-Za-z]{5,12}$/.test(zone)) return // a whole number (5 characters at least): no call per keystroke
    const key = `${zone}|${plate}`
    const t = setTimeout(() => {
      if (ahead.current?.key !== key) ahead.current = { key, p: lookUp(zone, plate) }
    }, 350)
    return () => clearTimeout(t)
  }, [zone, plate]) // eslint-disable-line react-hooks/exhaustive-deps

  async function findRates() {
    setLooking(true)
    setError(null)
    try {
      const key = `${zone}|${plate}`
      if (ahead.current?.key !== key) ahead.current = { key, p: lookUp(zone, plate) }
      const [found, answer] = await ahead.current.p
      // PayByBot works in France: a number PayByPhone does not know there stops here, with a clear word.
      if (!found) {
        ahead.current = null
        setError('Cette zone n’existe pas chez PayByPhone en France. Vérifiez le numéro sur le panneau ou l’horodateur.')
        return
      }
      if (answer instanceof Error) {
        ahead.current = null // asked again on the next try
        throw answer
      }
      const list = answer
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
    // Paris Handi: taken at 5 h, before 9 h, the day's ticket covers the whole paid day (elsewhere the user says when).
    // Renewing a running ticket: the time it ends, whatever rate is picked (Paris Handi: 5 h, before paid hours).
    setStart(handi(effective) && paris ? '05:00' : (chainStart ?? '09:00'))
  }, [effective?.ratePolicyId]) // eslint-disable-line react-hooks/exhaustive-deps

  // From a running ticket: its rates looked up at once, its rate chosen, its start time and length taken again, and
  // straight to the days (the Handi ticket stops at step 2 for the CMI-S attestation).
  const preset = useRef(initialTicket ?? null)
  // The running ticket being renewed: the next one is not taken before it ends.
  const chainFrom = initialTicket ? new Date(initialTicket.expire) : null
  useEffect(() => {
    if (preset.current && plate && zone) findRates()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = preset.current
    if (!t || !rates) return
    const same = usable.find((r) => r.ratePolicyId === String(t.rate))
    setDays(paris ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]) // renewed every day (Paris: Sundays are free)
    if (!same) return void (preset.current = null) // its rate not offered here: chosen at step 2 (start still its end)
    if (rateId !== same.ratePolicyId) return setRateId(same.ratePolicyId)
    if (!effective) return
    const begin = new Date(t.start)
    const minutes = Math.round((new Date(t.expire).getTime() - begin.getTime()) / 60000)
    const units = unitsOf(effective)
    if (!units.includes('Days') && minutes > 0) {
      const u: Unit = minutes % 60 === 0 && units.includes('Hours') ? 'Hours' : units.includes('Minutes') ? 'Minutes' : 'Hours'
      const n = u === 'Hours' ? Math.max(1, Math.round(minutes / 60)) : minutes
      setUnit(u)
      setDuration(Math.min(MAX[u], n))
    }
    preset.current = null
    setStep(handi(effective) ? 2 : 3)
  }, [rates, rateId, effective?.ratePolicyId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    ...(handi(effective!) ? { cmis: true } : {}),
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
      toast.success(chainFrom ? 'Renouvellement activé.' : 'Ticket programmé.', {
        description: `Prochain ticket ${when(nextTicket(days, start, chainFrom)!)}.`,
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

  const steps = ['Véhicule et zone', 'Votre ticket', initialTicket ? 'Horaires' : 'Horaires et jours', 'Vérifier et activer']

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && !locked && onClose()}>
      <DialogContent className={ui.dialog} showCloseButton={!locked}>
        <div className="px-6 pt-7">
          <p className="text-xs font-medium tracking-wide text-ink/45 uppercase">
            Étape {step} sur {steps.length} · {steps[step - 1]}
          </p>
          <DialogTitle className={cn(ui.dialogTitle, 'mt-1')}>{initialTicket ? 'Renouveler ce ticket' : 'Programmer un ticket'}</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">
            {initialTicket ? 'Repris automatiquement chaque jour, à l’heure voulue.' : 'Pris automatiquement les jours choisis, à l’heure voulue.'}
          </DialogDescription>
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
                <ZoneInput value={zone} onChange={setZone} />
                <p className="mt-2 text-sm text-ink/50">
                  {place ? `✓ ${place}` : withPayByPhone('Le numéro de zone PayByPhone, indiqué sur le panneau ou l’horodateur.')}
                </p>
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
                  {!handiRate && options.length > 0 && paris && (
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
                    {withPayByPhone('PayByPhone ne connaît pas le poids du véhicule : choisissez le tarif qui lui correspond.')}
                  </p>
                )}
              </div>
              {effective && handi(effective) && (
                // PayByPhone does not check the card: the user states it, kept with the ticket.
                <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-ink/[0.03] px-4 py-3 text-sm leading-relaxed text-ink/80">
                  <input type="checkbox" checked={cmis} onChange={(e) => setCmis(e.target.checked)} className="mt-1 size-4 shrink-0 accent-[#4e9aa0]" />
                  <span>
                    Je suis titulaire d’une carte mobilité inclusion mention stationnement (CMI-S) et je la place derrière le
                    pare-brise. Sans elle, ce ticket gratuit ne me couvre pas.
                  </span>
                </label>
              )}
            </>
          )}

          {step === 3 && effective && (
            <>
              {/* Handi: nothing to set but the days; a day's ticket taken at 5 h, before the paid hours */}
              {!(handi(effective) && paris) && (
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
                      {!chainFrom && (
                        <>
                          Fin du ticket : <span className="font-medium text-ink tabular-nums">{endText(start, duration, unit)}</span>
                        </>
                      )}
                      {chainFrom && (
                        <span className="block">Le ticket en cours se termine {when(chainFrom)}.</span>
                      )}
                      {chainFrom && nextTicket(days, start, chainFrom) && (
                        <span className="mt-1 block font-medium text-[#3d7f84]">
                          Nouveau ticket : {when(nextTicket(days, start, chainFrom)!)} → {endText(start, duration, unit)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )}
              {/* Renewing a running ticket: no days to pick (taken again every day); a new ticket: the days chosen. */}
              {chainFrom ? null : (
              <div>
                  <p className={ui.label}>Jours</p>
                  {/* A week strip, same cards as the tickets above; in Paris Sunday is shown but free, so never picked */}
                  <div className="grid grid-cols-7 gap-1.5">
                    {(paris ? DAYS.slice(0, 6) : DAYS).map((d, i) => {
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
                    {paris && (
                      <div className="flex h-14 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink/10 text-sm text-ink/30">
                        Dim
                        <span className="text-[0.65rem] leading-none">gratuit</span>
                      </div>
                    )}
                  </div>
                  {handi(effective) && paris && (
                    <p className="mt-3 text-sm text-ink/70">Le ticket Handi d’une journée est pris automatiquement à 5 h, chaque jour choisi.</p>
                  )}
                  {paris && <p className="mt-2 text-xs text-ink/45">À Paris, le dimanche et les jours fériés sont gratuits : aucun ticket n’est pris.</p>}
                </div>
              )}
              <div className="rounded-xl bg-ink/[0.03] px-4 py-3 text-sm">
                {/* Renewing a running ticket (every day, no days counted): the price of a day. A new ticket: the total of
                    the days ticked, each week, and one ticket's price under it. */}
                {chainFrom ? (
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-ink/55">Prix par jour</span>
                    <span className="text-base font-semibold text-ink tabular-nums">
                      {cost === undefined ? <Loader2 className="inline size-4 animate-spin text-ink/40" /> : euros(cost ?? { amount: 0, currency: 'EUR' })}
                    </span>
                  </div>
                ) : (
                <>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-ink/55">
                    Par semaine ({days.length} jour{days.length > 1 ? 's' : ''})
                  </span>
                  <span className="text-base font-semibold text-ink tabular-nums">
                    {cost === undefined ? (
                      <Loader2 className="inline size-4 animate-spin text-ink/40" />
                    ) : (
                      euros({ amount: (cost?.amount ?? 0) * days.length, currency: cost?.currency ?? 'EUR' })
                    )}
                  </span>
                </div>
                <div className="mt-1 flex justify-between gap-4">
                  <span className="text-ink/45">Prix d’un ticket</span>
                  <span className="text-ink/60 tabular-nums">
                    {/* No price from PayByPhone (a free ticket, e.g. Handi): 0 €, not a dash. */}
                    {cost === undefined ? '…' : euros(cost ?? { amount: 0, currency: 'EUR' })}
                  </span>
                </div>
                </>
                )}
                <p className="mt-2 text-xs text-ink/45">{withPayByPhone('Payé à PayByPhone au tarif habituel, à chaque ticket.')}</p>
              </div>
            </>
          )}

          {step === 4 && effective && (
            <>
              <dl className="divide-y divide-ink/[0.06] rounded-xl border border-ink/10 text-sm">
                {[
                  ['Véhicule', <Plate key="p" plate={plate} size="sm" />],
                  ['Zone', place ?? `Zone ${zone}`],
                  ['Ticket', optionText(effective)[0]],
                  ['Jours', chainFrom ? (paris ? 'Chaque jour, sauf dimanche et jours fériés' : 'Chaque jour') : daysText(days)],
                  ['Horaire', handi(effective) && paris ? 'Toute la journée' : `${hourText(start)} → ${endText(start, duration, unit)}`],
                  [
                    'Prix',
                    handi(effective)
                      ? 'Gratuit'
                      : !cost
                        ? '—'
                        : chainFrom
                          ? `${euros(cost)} par jour`
                          : `${euros({ amount: cost.amount * days.length, currency: cost.currency })} par semaine (${euros(cost)} × ${days.length})`,
                  ],
                ].map(([k, v]) => (
                  <div key={String(k)} className="flex items-center justify-between gap-4 px-4 py-2.5">
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
              {nextTicket(days, start, chainFrom) && (
                <p className="rounded-xl bg-[#e7f6ec] px-4 py-3 text-sm text-[#14703a]">
                  {chainFrom ? 'Prochain ticket' : 'Premier ticket'} {when(nextTicket(days, start, chainFrom)!)}
                  {chainFrom && Math.abs(nextTicket(days, start, chainFrom)!.getTime() - chainFrom.getTime()) < 120_000 ? ', dès la fin du ticket en cours' : ''}. Un e-mail à chaque ticket, et une alerte si {withPayByPhone('PayByPhone')} refuse.
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
              <button onClick={findRates} disabled={!plate || !zone || looking} className={cn(ui.primary, 'flex-[2]')}>
                {looking ? <Loader2 className="size-5 animate-spin" /> : 'Suivant'}
              </button>
            )}
            {step === 2 && (
              <button onClick={() => setStep(3)} disabled={!effective || (handi(effective) && !cmis)} className={cn(ui.primary, 'flex-[2]')}>
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
          plates={[plate]}
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
