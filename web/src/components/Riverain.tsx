import { useEffect, useState, type ReactNode } from 'react'
import { Check, Loader2, Mail, Pause, Play, Repeat, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { NoPayment } from '@/components/NoPayment'
import { arrondissement, Plate, withPayByPhone, ZonePlate } from '@/components/signs'
import { loadLast, saveLast } from '@/components/PayWizard'
import { PlansDialog } from '@/components/Pricing'
import { ShinyButton } from '@/components/ui/shiny-button'
import { cn } from '@/lib/utils'
import { choice, ui } from '@/lib/styles'
import { api, clock, money, type Account, type Activation, type Autopilot, type Money, type Overview, type Parking, type Rate } from '@/lib/api'

export const WEEKLY_LABEL = 'Riverain hebdo'

/** The renewals chosen just before leaving for Stripe, activated on the way back (kept one hour). */
const PENDING_KEY = 'pbb-pending-renewals'

function savePending(items: Parking[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ at: Date.now(), items }))
  } catch {
    // no storage: the renewal is simply activated again by hand after the payment page
  }
}

function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // nothing to clear
  }
}


/** What the activation did for a car, as the e-mail says it, with who pays when a payment fails. */
export function activationToast(activation: Activation, plate?: string) {
  if (activation.failed) {
    // The reason is long: it stays under the vehicle, with « Réessayer ».
    toast.error(plate ? `${plate} : ${activation.title}` : activation.title, {
      description: 'La raison est affichée sous votre véhicule.',
      duration: 10_000,
    })
    return
  }
  toast.success(plate ? `${plate} : ${activation.title}` : activation.title, {
    description: (
      <>
        {activation.text}
        <span className="mt-1.5 block font-medium">{activation.payYourself}</span>
      </>
    ),
    duration: 15_000,
  })
}

/** Back from Stripe with a subscription: activate the renewals chosen before leaving. */
export async function runPendingRenewals(): Promise<{ done: number; failed: string[]; shown: number }> {
  let items: Parking[] = []
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null')
    if (saved && Date.now() - saved.at < 3_600_000 && Array.isArray(saved.items)) items = saved.items
  } catch {
    // unreadable: nothing pending
  }
  clearPending()
  const failed: string[] = []
  let shown = 0
  for (const p of items) {
    try {
      const { activation } = await api.addAutopilot({ ...p, label: WEEKLY_LABEL })
      saveLast(p)
      if (activation) {
        activationToast(activation, items.length > 1 ? p.plate : undefined)
        shown += 1
      }
    } catch (e) {
      failed.push(`${p.plate} : ${(e as Error).message}`)
    }
  }
  return { done: items.length - failed.length, failed, shown }
}
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
/** Relaunch a suspended or failed renewal: the server tries the payment right away and answers with the outcome. */
async function relaunch(ap: Autopilot, onChanged: () => void) {
  const waiting = toast.loading('Relance en cours…', { description: 'PayByBot vérifie votre compte PayByPhone et paie si besoin.' })
  try {
    const after = await api.resumeAutopilot(ap.id)
    if (after.lastError) toast.error('Renouvellement non effectué', { id: waiting, description: 'La raison est affichée sous votre véhicule.', duration: 8000 })
    else if (after.lastPayment) toast.success('Forfait renouvelé.', { id: waiting })
    else toast.success('Renouvellement relancé.', { id: waiting, description: 'Un ticket est déjà en cours : il prendra le relais à sa fin.' })
  } catch (e) {
    toast.error((e as Error).message, { id: waiting })
  }
  onChanged()
}

function RetryButton({ ap, onChanged }: { ap: Autopilot; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async () => {
        setBusy(true)
        await relaunch(ap, onChanged)
        setBusy(false)
      }}
      disabled={busy}
      className="mt-2 inline-flex items-center gap-1.5 rounded-[10px] bg-ink/[0.06] px-3 py-1.5 text-sm font-semibold text-ink transition hover:bg-ink/[0.1] disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />} Réessayer
    </button>
  )
}

export function RenewalNote({ ap, onChanged }: { ap: Autopilot; onChanged?: () => void }) {
  const { start, end, paused, later } = pauseState(ap)
  if (ap.lastError)
    return (
      <>
        <span className="text-destructive">{ap.lastError}</span>
        {onChanged && <span className="block"><RetryButton ap={ap} onChanged={onChanged} /></span>}
      </>
    )
  if (!ap.enabled) return <span className="text-destructive">Renouvellement suspendu : vérifiez dans l'application PayByPhone, puis relancez-le depuis « Gérer ».</span>
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
    if (ap.enabled) {
      try {
        await api.resumeAutopilot(ap.id)
        toast.success('Renouvellement repris.')
      } catch (e) {
        toast.error((e as Error).message)
      }
      return onChanged()
    }
    // Relaunch: the server tries the payment right away and answers with the outcome (up to about a minute).
    await relaunch(ap, onChanged)
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
const isTwoWheels = (text: string) => /2\s*roues|deux[\s-]*roues|moto|scooter|two[\s-]*wheel/i.test(text)

/** The resident rate for this vehicle: Paris has one for cars and one for motorbikes ("2 roues - Résident"). */
function residentRateFor(rates: Rate[], vehicleType?: string) {
  const residents = rates.filter(isResident)
  const moto = isTwoWheels(vehicleType ?? '')
  return residents.find((r) => isTwoWheels(`${r.name} ${r.type}`) === moto) ?? (moto ? residents[0] : undefined)
}

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

  // « Renouveler un autre véhicule » only while a riverain vehicle is not renewed yet.
  const key = (plate: string) => plate.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const renewed = weekly.map((ap) => key(ap.plate)).sort().join(',')
  const [another, setAnother] = useState(false)
  useEffect(() => {
    if (!weekly.length || !data) return
    const covered = new Set(renewed.split(','))
    if (data.vehicles.every((v) => covered.has(key(v.plate)))) return setAnother(false) // nothing else at all
    let cancelled = false
    api.pricing().then(
      (p) => !cancelled && setAnother((p.vehicles ?? []).some((v) => !covered.has(key(v.plate)))),
      () => !cancelled && setAnother(false),
    )
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renewed, data?.vehicles.length])

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
                      {ap.lastError || paused || !ap.enabled ? <RenewalNote ap={ap} onChanged={onChanged} /> : <>Paiement en cours…</>}
                    </p>
                  </div>
                  <ManageRenewal ap={ap} onChanged={onChanged} demo={demo} />
                </li>
              )
            })}
          </ul>
        )}
        {another && (
          <button onClick={() => setOpen(true)} className={cn('text-sm', ui.link)}>
            Renouveler un autre véhicule
          </button>
        )}
        <RiverainDialog open={open} onOpenChange={setOpen} data={data} onDone={onChanged} hosted={hosted} demo={demo} />
      </section>
    )
  }

  return (
    <>
      <section className="rise">
        <ShinyButton onClick={() => setOpen(true)} disabled={!data} className="flex h-14 w-full items-center justify-center rounded-xl border border-eu/30 bg-eu/[0.07] px-6 text-lg font-bold text-eu hover:bg-eu/[0.1] disabled:opacity-50">
          Activer le renouvellement résident
        </ShinyButton>
      </section>
      {data && <RiverainDialog open={open} onOpenChange={setOpen} data={data} onDone={onChanged} hosted={hosted} demo={demo} />}
    </>
  )
}

type Found = { rate: Rate | null; quote: Quote | null; error: string | null }
type Quote = { cost: Money | null; afterCurrent?: boolean; currentExpire?: string | null; priceSource?: 'history' | 'paris' | null }

/** A two-wheeler, from its PayByPhone type (never a SUV). */
function isTwoWheeler(data: Overview, plate: string) {
  const key = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const type = data.vehicles.find((v) => key(v.plate) === key(plate))?.type ?? ''
  return /2\s*roues|deux[\s-]*roues|moto|scooter|two[\s-]*wheel/i.test(type)
}

function RiverainDialog({
  open,
  onOpenChange,
  data,
  onDone,
  hosted,
  demo = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Overview
  onDone: () => void
  hosted: boolean
  demo?: boolean
}) {
  const [plates, setPlates] = useState<string[] | null>(null) // the « riverain » vehicles (null: looking)
  const plateKey = (p: string) => p.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const [selected, setSelected] = useState<string[]>([])
  const [zones, setZones] = useState<Record<string, string>>({}) // each riverain vehicle's arrondissement, from PayByPhone
  const [payment, setPayment] = useState('')
  const [suvs, setSuvs] = useState<string[]>([]) // plates ticked as SUV (plate keys)
  const [found, setFound] = useState<Record<string, Found>>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The bank asks to confirm every payment: trying again would only send it another request.
  const cardRefused = !!error && /3-D Secure|banque a refusé/.test(error)
  // Online, a renewal needs a subscription, chosen on Stripe even during the free month (nothing charged before
  // it ends): without one, « Activer » opens the offer choice first.
  const [account, setAccount] = useState<Account | null>(null)
  const [paywall, setPaywall] = useState(false)
  useEffect(() => {
    if (open && hosted && !demo) api.account().then(setAccount, () => {})
  }, [open, hosted, demo])

  const covered = new Set(data.autopilots.filter(isWeekly).map((a) => a.plate))
  // Renewals pay with a saved card only (PayPal or the phone bill are not offered for them).
  // Expired cards would be refused: never offered.
  const allCards = data.payments.filter((p) => p.kind === 'card')
  const cards = allCards.filter((p) => !p.expired)

  // Each time the dialog opens: the riverain vehicles not renewed yet (all ticked), each with the arrondissement
  // PayByPhone gives it the resident rate in (never typed), and the card.
  useEffect(() => {
    if (!open) return
    const last = loadLast()
    api.account().then((a) => setSuvs(a.suvPlates ?? []), () => {})
    setError(null)
    setFound({})
    setPlates(null)
    api.pricing().then(
      (p) => {
        const riverain = (p.vehicles ?? []).filter((v) => v.zone)
        setZones(Object.fromEntries(riverain.map((v) => [v.plate, v.zone])))
        setPlates(riverain.map((v) => v.plate))
        setSelected(riverain.map((v) => v.plate).filter((x) => !covered.has(x)))
      },
      (e) => {
        setPlates([])
        setError((e as Error).message)
      },
    )
    setPayment(cards.find((p) => p.id === last.paymentAccountId)?.id ?? cards[0]?.id ?? '')
    // Then the card PayByPhone was last paid with, when there is a choice.
    if (cards.length > 1)
      api.lastCard().then(
        (r) => r.paymentAccountId && cards.some((p) => p.id === r.paymentAccountId) && setPayment(r.paymentAccountId),
        () => {},
      )
    // Only when it opens: a refresh of the account behind it must not wipe the price or a message on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && !payment && cards[0]) setPayment(cards[0].id)
  }, [open, cards, payment])

  const ready = open && selected.length > 0 && payment

  // For each ticked vehicle: its resident rate and the price of a week, in its own arrondissement.
  useEffect(() => {
    if (!ready) {
      setFound({})
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      const results = await Promise.all(
        selected.map(async (plate): Promise<[string, Found]> => {
          try {
            const rates = await api.rates(zones[plate], plate)
            const resident = residentRateFor(rates, data.vehicles.find((v) => v.plate === plate)?.type)
            if (!resident) throw new Error('Pas de tarif résident pour ce véhicule dans cette zone.')
            if (!resident.acceptedTimeUnits.includes('Days')) throw new Error('Le tarif résident de cette zone ne se paie pas à la journée.')
            const quote = await api.quote({ ...parking(resident, plate), renewal: true })
            return [plate, { rate: resident, quote, error: null }]
          } catch (e) {
            return [plate, { rate: null, quote: null, error: (e as Error).message }]
          }
        }),
      )
      if (!cancelled) {
        setFound(Object.fromEntries(results))
        setLoading(false)
      }
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected.join(','), payment])

  function parking(r: Rate, plate: string): Parking {
    return { location: zones[plate], rate: r.ratePolicyId, duration: WEEK_DAYS, unit: 'Days', plate, paymentAccountId: payment }
  }

  const samePlate = (a: string, b: string) => a.replace(/[^0-9a-z]/gi, '').toUpperCase() === b.replace(/[^0-9a-z]/gi, '').toUpperCase()
  const runningFor = (plate: string) =>
    !!found[plate]?.quote?.afterCurrent || data.sessions.some((s) => samePlate(s.plate, plate) && new Date(s.expire).getTime() > Date.now())
  const ok = selected.filter((plate) => found[plate]?.rate && found[plate]?.quote)

  function toggle(plate: string) {
    setSelected((list) => (list.includes(plate) ? list.filter((x) => x !== plate) : [...list, plate]))
  }

  async function activate() {
    if (!ok.length) return
    if (account && !account.subscribed && !account.blocked) {
      // No subscription yet: the offer screen first. The renewal is activated on the way back from Stripe, and
      // that is when the first payment (or the extension) happens.
      setPaywall(true)
      return
    }
    setSaving(true)
    setError(null)
    const failed: string[] = []
    let shown = 0
    for (const plate of ok) {
      try {
        const p = parking(found[plate].rate!, plate)
        // Confirmations go to the account e-mail; online, the answer says what was paid and when the next is.
        const { activation } = await api.addAutopilot({ ...p, label: WEEKLY_LABEL })
        saveLast(p)
        if (activation) {
          activationToast(activation, ok.length > 1 ? plate : undefined)
          shown += 1
        }
      } catch (e) {
        failed.push(`${plate} : ${(e as Error).message}`)
      }
    }
    setSaving(false)
    const done = ok.length - failed.length
    if (done) {
      if (!shown)
        toast.success(done > 1 ? `Renouvellement activé pour ${done} véhicules.` : 'Renouvellement hebdomadaire activé.', {
          description: ok.some(runningFor)
            ? 'Chaque renouvellement prend le relais à la fin du ticket en cours.'
            : 'La première semaine est en cours de paiement.',
        })
      setTimeout(onDone, 2500)
      onDone()
    }
    if (failed.length) setError(failed.join('\n'))
    else onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={ui.dialog}>
        <div className="px-6 pt-7">
          <DialogTitle className={ui.dialogTitle}>Renouvellement résident</DialogTitle>
          <DialogDescription className="mt-1 text-ink/60">
            Choisissez les véhicules à renouveler, vérifiez, puis activez. On s'occupe du reste.
          </DialogDescription>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <p className={ui.label}>{plates && plates.length > 1 ? 'Véhicules résidents' : 'Véhicule résident'}</p>
            {plates === null ? (
              <div className="h-12 animate-pulse rounded-xl bg-ink/[0.05]" />
            ) : (
              <div className="flex flex-wrap gap-2">
                {plates.map((plate) =>
                  covered.has(plate) ? (
                    <span key={plate} className="inline-flex flex-col items-center gap-1 rounded-xl border border-ink/10 p-2 opacity-60">
                      <Plate plate={plate} size="sm" />
                      <span className="text-xs text-ink/55">Déjà renouvelé</span>
                    </span>
                  ) : (
                    <button
                      key={plate}
                      onClick={() => toggle(plate)}
                      aria-pressed={selected.includes(plate)}
                      className={choice(selected.includes(plate), 'flex items-center gap-2 p-2')}
                    >
                      <span
                        className={cn(
                          'grid size-5 place-items-center rounded-md border',
                          selected.includes(plate) ? 'border-eu bg-eu text-white' : 'border-ink/25',
                        )}
                      >
                        {selected.includes(plate) && <Check className="size-3.5" strokeWidth={3} />}
                      </span>
                      <Plate plate={plate} size="sm" />
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* PayByPhone does not say which cars are SUVs: the user ticks it, the SUV price then applies. */}
          {selected.some((p) => !isTwoWheeler(data, p)) && (
            <div className="space-y-2">
              {selected
                .filter((p) => !isTwoWheeler(data, p))
                .map((p) => {
                  const on = suvs.includes(plateKey(p))
                  return (
                    <label key={p} className="flex cursor-pointer items-center gap-3 text-sm text-ink/70">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={async (e) => {
                          const next = e.target.checked
                          setSuvs((list) => (next ? [...list, plateKey(p)] : list.filter((x) => x !== plateKey(p))))
                          try {
                            await api.setSuv(p, next)
                          } catch (err) {
                            toast.error((err as Error).message)
                          }
                        }}
                        className="size-4 accent-[var(--eu)]"
                      />
                      <span>
                        {selected.length > 1 ? <><Plate plate={p} size="sm" /> </> : null}
                        Mon véhicule est un SUV <span className="text-ink/45">(tarif SUV : 14,90 € ou 9,90 €/mois selon la zone)</span>
                      </span>
                    </label>
                  )
                })}
            </div>
          )}

          {!allCards.length && <NoPayment compact onRefresh={async () => onDone()} />}
          {allCards.length > 0 && !cards.length && (
            <p role="alert" className="rounded-xl border-l-4 border-destructive bg-destructive/8 px-4 py-3 text-sm text-destructive">
              {allCards.length > 1 ? "Les cartes" : "La carte"} de votre compte PayByPhone {allCards.length > 1 ? 'ont' : 'a'} expiré (
              {allCards.map((p) => p.label.split('—').pop()!.trim()).join(', ')}). Ajoutez votre nouvelle carte dans l'application PayByPhone, puis rouvrez cette fenêtre.
            </p>
          )}

          {cards.length > 1 && (
            <div>
              <p className={ui.label}>Payer avec</p>
              <div className="flex flex-wrap gap-2">
                {cards.map((p) => (
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

          {/* Summary: one line per ticked vehicle */}
          <div className="rounded-xl bg-muted p-4" aria-live="polite">
            {!selected.length ? (
              <p className="text-muted-foreground">Cochez au moins un véhicule.</p>
            ) : loading ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Recherche du tarif résident…
              </p>
            ) : (
              <ul className="space-y-3">
                {selected.map((plate) => {
                  const f = found[plate]
                  return (
                    <li key={plate} className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <Plate plate={plate} size="sm" />
                          {zones[plate] && <ZonePlate zone={zones[plate]} />}
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {f?.error ? (
                            <span className="text-destructive">{f.error}</span>
                          ) : f?.rate ? (
                            <>
                              <Repeat className="mr-1 inline size-3.5" />
                              {runningFor(plate)
                                ? f.quote?.currentExpire
                                  ? `Rien à payer maintenant : prend le relais ${clock(f.quote.currentExpire)}`
                                  : 'Rien à payer maintenant : prend le relais à la fin du ticket en cours'
                                : 'Première semaine payée tout de suite'}
                            </>
                          ) : null}
                        </span>
                      </span>
                      {f?.quote?.cost ? (
                        <span className="shrink-0 text-right">
                          <span className="font-heading text-xl font-bold">{money(f.quote.cost)}</span>
                          <span className="block text-xs text-muted-foreground">par semaine</span>
                        </span>
                      ) : f?.rate ? (
                        <span className="shrink-0 text-right text-xs text-muted-foreground">Prix PayByPhone du tarif résident</span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {error && (
            <p role="alert" className="rounded-xl border-l-4 border-destructive bg-destructive/8 px-4 py-3 text-sm whitespace-pre-line text-destructive">
              {error}
              {cardRefused && cards.length > 1 && (
                <span className="mt-2 block font-semibold">Vous pouvez aussi choisir votre autre carte ci-dessus, puis réessayer.</span>
              )}
            </p>
          )}

          {/* After a refusal: retry on purpose (once the card is checked or changed in PayByPhone, or with the other
              card chosen above), never by accident. */}
          <button
            onClick={() => {
              setError(null)
              activate()
            }}
            disabled={!ok.length || loading || saving}
            className={ui.primary}
          >
            {cardRefused ? (
              <>
                <RotateCw className="size-5" /> Réessayer
              </>
            ) : saving ? (
              <Loader2 className="size-5 animate-spin" />
            ) : ok.length > 1 ? (
              `Activer le renouvellement pour ${ok.length} véhicules`
            ) : (
              'Activer le renouvellement automatique'
            )}
          </button>
          <p className="-mt-3 text-center text-sm text-ink/50">
            {hosted
              ? withPayByPhone("Fonctionne en ligne, même appareil éteint. Pour payer à votre place, PayByBot garde de quoi se reconnecter à PayByPhone, chiffré, et l'efface dès que vous arrêtez.")
              : 'Laissez PayByBot ouvert sur cet ordinateur. Vous pouvez arrêter à tout moment.'}
          </p>
        </div>
      </DialogContent>
      {paywall && (
        <PlansDialog
          text="Rien n'est prélevé avant la fin de votre mois offert. Le renouvellement s'active dès votre retour."
          onPay={() => savePending(ok.map((plate) => parking(found[plate].rate!, plate)))}
          onClose={() => {
            clearPending()
            setPaywall(false)
          }}
        />
      )}
    </Dialog>
  )
}

/** PayByPhone offers no resident rate to the account in its home zone: say it, and what to do. */
export function NoResidentStatus({ zone, className }: { zone: string | null; className?: string }) {
  const where = zone ? arrondissement(zone) ?? `la zone ${zone}` : null
  return (
    <div role="status" className={cn('rounded-2xl border border-amber/60 bg-amber/10 p-4 text-left', className)}>
      <p className="font-semibold text-ink">Tarif résident requis sur {withPayByPhone('PayByPhone')}</p>
      <p className="mt-1 text-sm leading-relaxed text-ink/70">
        Aucun tarif résident n’a été trouvé pour vos véhicules{where ? ` (${where})` : ''}. Effectuez votre demande de
        stationnement résident, puis revenez une fois le tarif actif dans votre application {withPayByPhone('PayByPhone')}.
      </p>
    </div>
  )
}

/** Paris arrondissements and their resident zone number on PayByPhone (the postcode). */
const ARRONDISSEMENTS = Array.from({ length: 20 }, (_, i) => ({
  label: i === 0 ? '1er' : `${i + 1}e`,
  zone: `750${String(i + 1).padStart(2, '0')}`,
}))

/** « 17 », « 17e », « Paris 17 » or « 75017 » -> the matching arrondissements, as they are typed. */
function matchArrondissements(query: string) {
  const digits = query.replace(/\D/g, '')
  if (!digits) return []
  if (digits.startsWith('75')) return ARRONDISSEMENTS.filter((a) => a.zone.startsWith(digits)).slice(0, 6)
  const n = digits.replace(/^0+/, '')
  return n ? ARRONDISSEMENTS.filter((a) => String(Number(a.zone.slice(3))).startsWith(n)).slice(0, 6) : []
}

/** The home zone: shown when known (history, account), else typed: suggestions appear as you type. */
export function ZoneField({
  zone,
  fromHistory,
  onZone,
}: {
  zone: string
  fromHistory: boolean
  onZone: (zone: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [query, setQuery] = useState('')
  const open = editing || !zone
  const matches = matchArrondissements(query)

  function choose(z: string) {
    onZone(z)
    setQuery('')
    setEditing(false)
  }

  if (!open) {
    return (
      <div>
        <p className={ui.label}>Arrondissement de résidence</p>
        <div className="flex items-center justify-between gap-4">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {arrondissement(zone) && <span className="font-semibold text-ink">{arrondissement(zone)}</span>}
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
      <label htmlFor="riverain-arrondissement" className={ui.label}>
        Votre arrondissement de résidence
      </label>
      <input
        id="riverain-arrondissement"
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls="riverain-arrondissements"
        autoComplete="off"
        inputMode="numeric"
        placeholder="Ex. : 17 ou 75017"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) {
            e.preventDefault()
            choose(matches[0].zone)
          }
        }}
        autoFocus
        className={cn(ui.field, 'h-12 text-base')}
      />
      {matches.length > 0 && (
        <ul
          id="riverain-arrondissements"
          role="listbox"
          aria-label="Arrondissements"
          className="mt-2 overflow-hidden rounded-xl border border-ink/15"
        >
          {matches.map((a) => (
            <li key={a.zone}>
              <button
                role="option"
                aria-selected={false}
                onClick={() => choose(a.zone)}
                className="flex w-full items-center justify-between gap-3 border-b border-ink/10 px-4 py-3 text-left last:border-b-0 hover:bg-muted"
              >
                <span className="font-semibold text-ink">Paris {a.label}</span>
                <span className="text-sm font-bold text-ink/50 tabular-nums">{a.zone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query.trim() && !matches.length && (
        <p className="mt-2 text-sm text-ink/55">Tapez un arrondissement de Paris, de 1 à 20.</p>
      )}
      {zone && (
        <button onClick={() => setEditing(false)} className={cn('mt-2 text-sm', ui.link)}>
          Garder {arrondissement(zone) ?? `la zone ${zone}`}
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
  const row = 'flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-base font-normal transition hover:bg-muted'
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="gap-0 rounded-2xl bg-white p-2 sm:max-w-sm">
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <Plate plate={ap.plate} size="sm" />
          <DialogTitle className="text-base font-normal">Renouvellement zone {ap.location}</DialogTitle>
          <DialogDescription className="sr-only">Options du renouvellement</DialogDescription>
        </div>
        {!ap.enabled ? (
          <button onClick={onResume} className={row}>
            <Play className="size-5" /> Relancer le renouvellement
          </button>
        ) : pauseSet ? (
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
        <button onClick={onStop} className={`${row} font-bold text-destructive hover:bg-destructive/10`}>
          <Repeat className="size-5" /> Arrêter le renouvellement
        </button>
      </DialogContent>
    </Dialog>
  )
}

export type ResidentStatus = { zone: string | null; resident: boolean | null }

/**
 * No resident rate on PayByPhone: PayByBot cannot be used. Full screen over the blurred page, with a way to check
 * again once the rate is granted, to correct the arrondissement, or to leave.
 */
export function ResidentGate({
  zone,
  vehicles,
  onChecked,
}: {
  zone: string | null
  vehicles?: number
  onChecked: (status: ResidentStatus) => void
}) {
  const [checking, setChecking] = useState(false)

  async function check() {
    setChecking(true)
    try {
      const status = await api.residentStatus()
      if (status.resident === false) toast('Toujours aucun tarif résident sur votre compte PayByPhone.')
      onChecked(status)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setChecking(false)
    }
  }

  async function logout() {
    await api.logout().catch(() => {})
    window.location.assign('/')
  }

  return (
    <ResidentRequired zone={zone} vehicles={vehicles}>
      <button onClick={check} disabled={checking} className={cn('mt-7', ui.primary)}>
        {checking ? <Loader2 className="size-5 animate-spin" /> : 'J’ai le tarif résident, vérifier à nouveau'}
      </button>
      <p className="mt-5 text-center text-sm">
        <button onClick={logout} className={ui.link}>
          Se déconnecter
        </button>
      </p>
    </ResidentRequired>
  )
}

/** Full screen over the blurred page: PayByBot needs a vehicle with the resident rate; what to do, then the actions. */
/** Full screen over the blurred page: what PayByBot needs and what to do, then the actions (children). */
function FullScreenNotice({ title, intro, steps, children }: { title: string; intro: ReactNode; steps: string[]; children: ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-screen-notice-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-white/60 p-4 backdrop-blur-md sm:p-6"
    >
      <div className="rise w-full max-w-lg rounded-3xl border border-ink/10 bg-white p-7 shadow-[0_40px_80px_-30px_rgb(11_16_36/0.35)] sm:p-9">
        <span className="grid size-12 place-items-center rounded-2xl bg-eu font-heading text-2xl font-bold text-white">P</span>
        <h2 id="full-screen-notice-title" className="mt-5 font-heading text-[1.9rem] leading-[1.1] font-semibold tracking-[-0.03em] text-ink">
          {title}
        </h2>
        <p className="mt-3 leading-relaxed text-ink/70">{intro}</p>
        <ol className="mt-5 space-y-2.5 text-[0.95rem] leading-relaxed text-ink/80">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-eu/[0.08] text-sm font-bold text-eu">
                {i + 1}
              </span>
              <span>{withPayByPhone(step)}</span>
            </li>
          ))}
        </ol>
        {children}
      </div>
    </div>
  )
}

/** PayByBot needs a vehicle with the resident rate. */
export function ResidentRequired({
  zone = null,
  vehicles = 2,
  children,
}: {
  zone?: string | null
  vehicles?: number // one: « votre véhicule », else the plural
  children: ReactNode
}) {
  const where = zone ? arrondissement(zone) ?? `la zone ${zone}` : null
  return (
    <FullScreenNotice
      title="Stationnement résident requis"
      intro={
        <>
          Pour accéder aux services PayByBot,{' '}
          {vehicles === 1 ? 'votre véhicule doit' : 'au moins un de vos véhicules doit'} bénéficier du tarif résident sur
          votre compte {withPayByPhone('PayByPhone')}
          {where ? ` (${where})` : ''}.{' '}
          {vehicles === 1 ? 'Ce n’est pas le cas pour le moment.' : 'Ce n’est le cas d’aucun d’entre eux pour le moment.'}
        </>
      }
      steps={[
        'Faites votre demande de stationnement résident pour obtenir le forfait résident.',
        'Vérifiez que le tarif résident apparaît dans votre application PayByPhone.',
        'Revenez ici : l’accès à PayByBot s’ouvre dès que le tarif résident est actif.',
      ]}
    >
      {children}
    </FullScreenNotice>
  )
}

/** Sign-up: PayByBot pays with a card saved on PayByPhone. */
export const CARD_NOTE = 'Une carte bancaire enregistrée dans PayByPhone est nécessaire.'

/** PayByBot pays with a card saved on PayByPhone. */
export function CardRequired({ children }: { children: ReactNode }) {
  return (
    <FullScreenNotice
      title="Carte bancaire requise"
      intro={
        <>
          Pour renouveler votre forfait automatiquement, PayByBot paie avec une carte bancaire enregistrée sur votre compte{' '}
          {withPayByPhone('PayByPhone')}. Aucune carte n’y est enregistrée pour le moment. Apple Pay et Google Pay ne
          permettent pas le paiement automatique : ils demandent une validation sur votre téléphone à chaque paiement.
        </>
      }
      steps={[
        'Ouvrez l’application PayByPhone, rubrique Moyens de paiement.',
        'Ajoutez une carte bancaire.',
        'Revenez ici : l’accès à PayByBot s’ouvre dès que la carte est enregistrée.',
      ]}
    >
      {children}
    </FullScreenNotice>
  )
}

/** Signed in without a saved card: PayByBot is not usable until one is added (the page reloads to check). */
export function CardGate() {
  async function logout() {
    await api.logout().catch(() => {})
    window.location.assign('/')
  }
  return (
    <CardRequired>
      <button onClick={() => window.location.reload()} className={cn('mt-7', ui.primary)}>
        J’ai ajouté une carte, vérifier à nouveau
      </button>
      <p className="mt-5 text-center text-sm">
        <button onClick={logout} className={ui.link}>
          Se déconnecter
        </button>
      </p>
    </CardRequired>
  )
}
