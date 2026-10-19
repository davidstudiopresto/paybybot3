import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, CreditCard, Loader2, Minus, Plus, Repeat, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NoPayment } from '@/components/NoPayment'
import { Plate, ZonePlate } from '@/components/signs'
import { cn } from '@/lib/utils'
import { api, clock, money, unitLabel, type Money, type Overview, type Parking, type Rate, type Unit } from '@/lib/api'

const STEPS = ['Voiture', 'Zone', 'Tarif', 'Durée', 'Paiement', 'Confirmer'] as const
const PRESETS: Record<Unit, number[]> = { Days: [1, 2, 3, 7], Hours: [1, 2, 3, 4], Minutes: [15, 30, 45, 60] }
const LAST_KEY = 'paybybot3:last'

export function loadLast(): Partial<Parking> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) || '{}')
  } catch {
    return {}
  }
}

export function saveLast(p: Parking) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(p))
  } catch {
    /* private window: not remembering is fine */
  }
}

function Choice({ selected, onClick, children, disabled }: { selected: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'relative flex min-h-20 w-full items-center gap-4 rounded-2xl border-[3px] bg-enamel p-5 text-left transition',
        selected ? 'border-signal shadow-[0_0_0_4px_var(--accent)]' : 'border-border hover:border-input',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
      {selected && (
        <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-signal text-white">
          <Check className="size-4" strokeWidth={3} />
        </span>
      )}
    </button>
  )
}

export function PayWizard({
  data,
  demo,
  onClose,
  onPaid,
  onRefresh,
}: {
  data: Overview
  demo: boolean
  onClose: () => void
  onPaid: () => void
  onRefresh: () => Promise<void>
}) {
  const last = useMemo(loadLast, [])
  const [step, setStep] = useState(0)
  const [plate, setPlate] = useState(
    data.vehicles.find((v) => v.plate === last.plate)?.plate ?? data.vehicles[0]?.plate ?? '',
  )
  const [location, setLocation] = useState(last.location ?? '')
  const [rates, setRates] = useState<Rate[]>([])
  const [rate, setRate] = useState<Rate | null>(null)
  const [unit, setUnit] = useState<Unit>('Days')
  const [duration, setDuration] = useState(1)
  const [payment, setPayment] = useState(
    data.payments.find((p) => p.id === last.paymentAccountId)?.id ?? data.payments[0]?.id ?? '',
  )
  const [quote, setQuote] = useState<{ cost: Money; expire: string } | null>(null)
  const [autopilot, setAutopilot] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ expire: string; cost: Money } | null>(null)

  useEffect(() => {
    if (!payment && data.payments[0]) setPayment(data.payments[0].id)
  }, [data.payments, payment])

  const parking: Parking = { location: location.trim(), rate: rate?.ratePolicyId ?? '', duration, unit, plate, paymentAccountId: payment }

  // Fetch the exact price when reaching the last step.
  useEffect(() => {
    if (step !== 5) return
    setQuote(null)
    setError(null)
    api.quote(parking).then(setQuote, (e) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  function pickRate(r: Rate) {
    setRate(r)
    const u = r.acceptedTimeUnits.includes(unit)
      ? unit
      : r.acceptedTimeUnits.includes('Hours')
        ? 'Hours'
        : r.acceptedTimeUnits[0] ?? 'Days'
    setUnit(u)
    setDuration(PRESETS[u][0])
  }

  async function next() {
    setError(null)
    if (step === 1) {
      setBusy(true)
      try {
        const found = await api.rates(parking.location, plate)
        if (!found.length) throw new Error("Aucun tarif trouvé pour cette zone. Vérifiez le numéro affiché sur l'horodateur.")
        setRates(found)
        const remembered = found.find((r) => r.ratePolicyId === last.rate && !r.parkingNotAllowedReason)
        pickRate(remembered ?? found.find((r) => !r.parkingNotAllowedReason) ?? found[0])
        if (remembered && last.unit && remembered.acceptedTimeUnits.includes(last.unit)) {
          setUnit(last.unit)
          setDuration(last.duration ?? PRESETS[last.unit][0])
        }
      } catch (e) {
        setError((e as Error).message)
        return
      } finally {
        setBusy(false)
      }
    }
    setStep((s) => s + 1)
  }

  async function pay() {
    setBusy(true)
    setError(null)
    try {
      const res = await api.pay(parking)
      saveLast(parking)
      if (autopilot) await api.addAutopilot({ ...parking, label: rate?.name ?? '' })
      setDone(res)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const canContinue = [
    !!plate,
    /^\w{3,}$/.test(location.trim()),
    !!rate && !rate.parkingNotAllowedReason,
    duration > 0,
    !!payment,
    !!quote,
  ][step]

  if (done) {
    return (
      <div className="grain fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-paper p-6">
        <div className="rise flex max-w-md flex-col items-center text-center">
          <span className="grid size-24 place-items-center rounded-full bg-go text-white shadow-[0_0_0_12px_rgb(31_122_77/0.15)]">
            <Check className="size-12" strokeWidth={3} />
          </span>
          <h1 className="mt-8 text-4xl font-black">{demo ? 'Paiement simulé' : "C'est payé !"}</h1>
          {demo && (
            <p className="mt-3 rounded-xl bg-amber/25 px-4 py-2 font-bold text-ink">
              Mode démo : rien n'a été payé ni envoyé à PayByPhone.
            </p>
          )}
          <p className="mt-3 text-lg text-muted-foreground">
            Votre voiture <Plate plate={plate} size="sm" className="mx-1 align-middle" /> est en règle jusqu'à{' '}
            <strong className="text-ink">{clock(done.expire)}</strong>.
          </p>
          {autopilot && (
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-go/10 px-4 py-3 text-go">
              <Repeat className="size-5" /> Le ticket sera renouvelé automatiquement.
            </p>
          )}
          <Button onClick={onPaid} className="mt-10 h-14 w-full rounded-xl text-lg font-bold">
            Retour à l'accueil
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="grain fixed inset-0 z-50 flex flex-col overflow-y-auto bg-paper">
      <header className="sticky top-0 z-10 border-b border-border/70 bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-4 px-5 py-4">
          <Button variant="ghost" size="icon-lg" onClick={onClose} aria-label="Annuler">
            <X className="size-6" />
          </Button>
          <ol className="flex flex-1 gap-1.5" aria-label="Étapes">
            {STEPS.map((label, i) => (
              <li key={label} className="flex-1" aria-current={i === step ? 'step' : undefined}>
                <span className={cn('block h-2 rounded-full transition-colors', i <= step ? 'bg-signal' : 'bg-border')} />
                <span className={cn('mt-1.5 hidden text-xs font-bold sm:block', i === step ? 'text-signal' : 'text-muted-foreground')}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <main key={step} className="rise mx-auto w-full max-w-2xl flex-1 px-5 pt-10 pb-36">
        <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">
          Étape {step + 1} sur {STEPS.length}
        </p>

        {step === 0 && (
          <>
            <h1 className="mt-2 text-4xl font-black">Quelle voiture ?</h1>
            <div className="mt-8 grid gap-3">
              {data.vehicles.map((v) => (
                <Choice key={v.plate} selected={plate === v.plate} onClick={() => setPlate(v.plate)}>
                  <Plate plate={v.plate} size="lg" />
                </Choice>
              ))}
              {!data.vehicles.length && (
                <p className="text-muted-foreground">Aucun véhicule : ajoutez-en un dans l'application PayByPhone.</p>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="mt-2 text-4xl font-black">Où êtes-vous garé ?</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Tapez le <strong className="text-ink">numéro de zone</strong> affiché sur l'horodateur ou les panneaux. À Paris,
              c'est le code postal de la rue (par exemple <strong className="text-ink">75015</strong>).
            </p>
            <div className="mt-8 flex items-center gap-5">
              <Input
                autoFocus
                inputMode="numeric"
                placeholder="75015"
                value={location}
                onChange={(e) => setLocation(e.target.value.replace(/\s/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && canContinue && next()}
                className="h-20 max-w-60 bg-enamel text-center font-heading text-4xl font-black tracking-[0.15em]"
                aria-label="Numéro de zone"
              />
              {location.trim() && <ZonePlate zone={location.trim()} className="scale-125" />}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="mt-2 text-4xl font-black">Quel tarif ?</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              Si vous habitez le quartier et avez une carte résident, choisissez <strong className="text-ink">Résident</strong>.
            </p>
            <div className="mt-8 grid gap-3">
              {rates.map((r) => (
                <Choice
                  key={r.ratePolicyId}
                  selected={rate?.ratePolicyId === r.ratePolicyId}
                  onClick={() => pickRate(r)}
                  disabled={!!r.parkingNotAllowedReason}
                >
                  <span>
                    <span className="block font-heading text-2xl font-extrabold">{r.name}</span>
                    <span className="text-muted-foreground">
                      {r.parkingNotAllowedReason ?? `Par ${r.acceptedTimeUnits.map((u) => unitLabel(u, 1)).join(', ')}`}
                    </span>
                  </span>
                </Choice>
              ))}
            </div>
          </>
        )}

        {step === 3 && rate && (
          <>
            <h1 className="mt-2 text-4xl font-black">Pour combien de temps ?</h1>
            {rate.acceptedTimeUnits.length > 1 && (
              <div className="mt-8 inline-flex rounded-xl bg-muted p-1.5">
                {rate.acceptedTimeUnits.map((u) => (
                  <button
                    key={u}
                    onClick={() => {
                      setUnit(u)
                      setDuration(PRESETS[u][0])
                    }}
                    className={cn('rounded-lg px-5 py-2.5 font-bold capitalize transition', unit === u ? 'bg-enamel text-signal shadow' : 'text-muted-foreground')}
                  >
                    {unitLabel(u, 2)}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-8 flex items-center justify-center gap-6 rounded-2xl bg-enamel py-10">
              <Button variant="outline" className="size-16 rounded-full" onClick={() => setDuration((d) => Math.max(1, d - (unit === 'Minutes' ? 15 : 1)))} aria-label="Moins">
                <Minus className="size-6" />
              </Button>
              <p className="min-w-44 text-center">
                <span className="block font-heading text-7xl leading-none font-black tabular-nums">{duration}</span>
                <span className="text-xl text-muted-foreground">{unitLabel(unit, duration)}</span>
              </p>
              <Button variant="outline" className="size-16 rounded-full" onClick={() => setDuration((d) => d + (unit === 'Minutes' ? 15 : 1))} aria-label="Plus">
                <Plus className="size-6" />
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {PRESETS[unit].map((n) => (
                <button
                  key={n}
                  onClick={() => setDuration(n)}
                  className={cn('rounded-xl border-2 py-3 font-bold transition', duration === n ? 'border-signal bg-accent text-signal' : 'border-border bg-enamel')}
                >
                  {n} {unit === 'Minutes' ? 'min' : unit === 'Hours' ? 'h' : 'j'}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="mt-2 text-4xl font-black">Comment payer ?</h1>
            <p className="mt-3 text-lg text-muted-foreground">Les moyens de paiement enregistrés dans votre compte PayByPhone.</p>
            {!data.payments.length && (
              <div className="mt-8">
                <NoPayment onRefresh={onRefresh} />
              </div>
            )}
            <div className="mt-8 grid gap-3">
              {data.payments.map((p) => (
                <Choice key={p.id} selected={payment === p.id} onClick={() => setPayment(p.id)}>
                  <CreditCard className="size-7 text-signal" />
                  <span className="text-xl font-bold">{p.label}</span>
                </Choice>
              ))}
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="mt-2 text-4xl font-black">On vérifie ?</h1>
            <div className="mt-8 overflow-hidden rounded-2xl bg-enamel shadow-[0_18px_40px_-24px_rgb(13_24_48/0.45)]">
              <div className="flex flex-wrap items-center gap-3 border-b-2 border-dashed border-border p-6">
                <Plate plate={plate} />
                <ZonePlate zone={parking.location} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 p-6 text-lg">
                <dt className="text-muted-foreground">Tarif</dt>
                <dd className="text-right font-bold">{rate?.name}</dd>
                <dt className="text-muted-foreground">Durée</dt>
                <dd className="text-right font-bold">
                  {duration} {unitLabel(unit, duration)}
                </dd>
                <dt className="text-muted-foreground">Fin</dt>
                <dd className="text-right font-bold">{quote ? clock(quote.expire) : '…'}</dd>
                <dt className="text-muted-foreground">Paiement</dt>
                <dd className="text-right font-bold">{data.payments.find((p) => p.id === payment)?.label}</dd>
              </dl>
              <div className="flex items-center justify-between bg-ink px-6 py-5 text-white">
                <span className="text-lg">Total</span>
                <span className="font-heading text-4xl font-black">{quote ? money(quote.cost) : <Loader2 className="size-7 animate-spin" />}</span>
              </div>
            </div>

            <label className="mt-6 flex cursor-pointer items-start gap-4 rounded-2xl border-[3px] border-border bg-enamel p-5 has-[:checked]:border-go">
              <input type="checkbox" checked={autopilot} onChange={(e) => setAutopilot(e.target.checked)} className="mt-1 size-6 accent-[var(--go)]" />
              <span>
                <span className="flex items-center gap-2 text-lg font-bold">
                  <Repeat className="size-5 text-go" /> Renouveler automatiquement
                </span>
                <span className="text-muted-foreground">
                  Quand ce ticket expire, l'application en repaie un identique. Laissez-la ouverte sur cet ordinateur.
                </span>
              </span>
            </label>
          </>
        )}

        {busy && step === 5 && (
          <p className="mt-6 rounded-lg bg-accent px-4 py-3 text-accent-foreground">
            Paiement envoyé. On attend que PayByPhone confirme le stationnement, cela peut prendre jusqu'à une minute.
            Ne fermez pas cette page.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-6 rounded-lg border-l-4 border-destructive bg-destructive/10 px-4 py-3 text-destructive">
            {error}
          </p>
        )}
      </main>

      <footer className="fixed inset-x-0 bottom-0 border-t border-border/70 bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-3 px-5 py-4">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="h-14 rounded-xl bg-enamel px-5 text-lg">
              <ArrowLeft className="size-5" /> Retour
            </Button>
          )}
          {step < 5 ? (
            <Button onClick={next} disabled={!canContinue || busy} className="h-14 flex-1 rounded-xl text-lg font-bold">
              {busy ? <Loader2 className="size-5 animate-spin" /> : <>Continuer <ArrowRight className="size-5" /></>}
            </Button>
          ) : (
            <Button
              onClick={pay}
              disabled={!canContinue || busy}
              className="h-14 flex-1 rounded-xl bg-go text-lg font-bold shadow-[0_4px_0_#145236] hover:bg-go/90 active:translate-y-1 active:shadow-none"
            >
              {busy ? (
                <>
                  <Loader2 className="size-5 animate-spin" /> Confirmation par PayByPhone…
                </>
              ) : (
                <>Payer {quote ? money(quote.cost) : ''}</>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  )
}
