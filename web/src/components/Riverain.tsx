import { useEffect, useState } from 'react'
import { ArrowRight, CalendarSync, Check, Home, Loader2, Repeat } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Plate, ZonePlate } from '@/components/signs'
import { loadLast, saveLast } from '@/components/PayWizard'
import { cn } from '@/lib/utils'
import { api, clock, money, type Autopilot, type Money, type Overview, type Parking, type Rate } from '@/lib/api'

export const WEEKLY_LABEL = 'Riverain hebdo'
const WEEK_DAYS = 7

export const isWeekly = (ap: Autopilot) => ap.label === WEEKLY_LABEL

const isResident = (r: Rate) => /r[ée]sid|riverain/i.test(`${r.name} ${r.type}`) && !r.parkingNotAllowedReason

/** Prominent dashboard card: weekly resident renewal, set up in two clicks. */
export function RiverainCard({ data, onChanged }: { data: Overview | null; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const weekly = data?.autopilots.filter(isWeekly) ?? []

  if (weekly.length) {
    return (
      <section className="rise mt-8 flex flex-wrap items-center gap-4 rounded-2xl border-[3px] border-go bg-go/[0.07] p-5">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-go text-white">
          <CalendarSync className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-xl font-extrabold">Forfait riverain renouvelé chaque semaine</p>
          {weekly.map((ap) => {
            const current = data?.sessions.find((s) => s.plate === ap.plate && s.location === ap.location)
            return (
              <p key={ap.id} className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                <Plate plate={ap.plate} size="sm" /> zone {ap.location} ·{' '}
                {ap.lastError ? (
                  <span className="text-destructive">{ap.lastError}</span>
                ) : current ? (
                  <>prochain renouvellement {clock(current.expire)}</>
                ) : (
                  <>paiement en cours…</>
                )}
              </p>
            )
          })}
        </div>
        <Button variant="outline" onClick={() => setOpen(true)} className="h-11 rounded-xl bg-enamel">
          Ajouter une voiture
        </Button>
        {data && <RiverainDialog open={open} onOpenChange={setOpen} data={data} onDone={onChanged} />}
      </section>
    )
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!data}
        className="rise group relative mt-8 flex w-full flex-col gap-5 overflow-hidden rounded-2xl bg-go p-6 text-left text-white shadow-[0_5px_0_#145236] transition active:translate-y-1 active:shadow-none sm:flex-row sm:items-center sm:p-7"
        style={{ animationDelay: '80ms' }}
      >
        <span className="absolute -top-10 -right-10 size-44 rounded-full border-[14px] border-white/10" aria-hidden />
        <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white text-go shadow-[inset_0_0_0_3px_var(--go),inset_0_0_0_5px_#fff]">
          <Home className="size-8" />
        </span>
        <span className="relative flex-1">
          <span className="text-sm font-bold tracking-[0.2em] text-white/75 uppercase">Vous êtes riverain ?</span>
          <span className="mt-1 block font-heading text-2xl leading-tight font-black sm:text-3xl">
            Renouvellement automatique chaque semaine
          </span>
          <span className="mt-1 block text-white/85">
            Votre forfait résident de 7 jours est repayé tout seul à son expiration. Plus jamais d'oubli.
          </span>
        </span>
        <span className="relative flex items-center gap-2 self-start rounded-xl bg-white px-5 py-3 font-bold text-go transition group-hover:gap-3 sm:self-center">
          Activer <ArrowRight className="size-5" />
        </span>
      </button>
      {data && <RiverainDialog open={open} onOpenChange={setOpen} data={data} onDone={onChanged} />}
    </>
  )
}

function RiverainDialog({
  open,
  onOpenChange,
  data,
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: Overview
  onDone: () => void
}) {
  const [plate, setPlate] = useState('')
  const [zone, setZone] = useState('')
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
    setZone(last.location ?? '')
    setPayment(data.payments.find((p) => p.id === last.paymentAccountId)?.id ?? data.payments[0]?.id ?? '')
  }, [open, data])

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
        if (!resident) throw new Error("Aucun tarif résident pour cette voiture dans cette zone. Vérifiez votre carte de stationnement résident dans l'application PayByPhone.")
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
      await api.addAutopilot({ ...p, label: WEEKLY_LABEL })
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
      <DialogContent className="gap-0 overflow-hidden rounded-2xl bg-enamel p-0 sm:max-w-lg">
        <div className="bg-go px-6 pt-6 pb-5 text-white">
          <DialogTitle className="flex items-center gap-2 text-2xl font-black">
            <CalendarSync className="size-6" /> Riverain, chaque semaine
          </DialogTitle>
          <DialogDescription className="mt-1 text-base text-white/85">
            Vérifiez, puis activez. On s'occupe du reste.
          </DialogDescription>
        </div>

        <div className="space-y-6 p-6">
          <div>
            <p className="mb-2 text-sm font-bold text-muted-foreground">Voiture</p>
            <div className="flex flex-wrap gap-2">
              {data.vehicles.map((v) => (
                <button
                  key={v.plate}
                  onClick={() => setPlate(v.plate)}
                  aria-pressed={plate === v.plate}
                  className={cn('rounded-xl border-[3px] p-1.5 transition', plate === v.plate ? 'border-go' : 'border-transparent opacity-55 hover:opacity-100')}
                >
                  <Plate plate={v.plate} />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="riverain-zone" className="mb-2 block text-sm font-bold text-muted-foreground">
              Zone de votre domicile <span className="font-normal">(à Paris, votre code postal)</span>
            </label>
            <div className="flex items-center gap-4">
              <Input
                id="riverain-zone"
                inputMode="numeric"
                placeholder="75015"
                value={zone}
                onChange={(e) => setZone(e.target.value.replace(/\s/g, ''))}
                autoFocus={!zone}
                className="h-14 max-w-44 bg-white text-center font-heading text-2xl font-black tracking-[0.12em]"
              />
              {zone.length >= 3 && <ZonePlate zone={zone} />}
            </div>
          </div>

          {data.payments.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-bold text-muted-foreground">Payer avec</p>
              <div className="flex flex-wrap gap-2">
                {data.payments.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPayment(p.id)}
                    className={cn('rounded-lg border-2 px-3 py-2 text-sm font-bold', payment === p.id ? 'border-go bg-go/10 text-go' : 'border-border')}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="rounded-xl bg-muted/70 p-4" aria-live="polite">
            {error ? (
              <p className="text-destructive">{error}</p>
            ) : loading ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Recherche du tarif résident…
              </p>
            ) : rate && quote ? (
              <ul className="space-y-1.5">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-go" />
                  <span>
                    Tarif <strong>{rate.name}</strong>, 7 jours
                  </span>
                </li>
                <li className="flex items-center gap-2">
                  <Repeat className="size-4 text-go" />
                  {hasCurrent ? 'Prend le relais à la fin du ticket en cours' : 'Première semaine payée tout de suite'}
                </li>
                <li className="flex items-baseline justify-between pt-2">
                  <span className="text-muted-foreground">Chaque semaine</span>
                  <span className="font-heading text-3xl font-black">{money(quote.cost)}</span>
                </li>
              </ul>
            ) : (
              <p className="text-muted-foreground">Tapez le numéro de zone pour voir le prix.</p>
            )}
          </div>

          <Button
            onClick={activate}
            disabled={!rate || !quote || saving}
            className="h-14 w-full rounded-xl bg-go text-lg font-bold shadow-[0_4px_0_#145236] hover:bg-go/90 active:translate-y-1 active:shadow-none"
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : <>Activer le renouvellement {quote ? `· ${money(quote.cost)}/semaine` : ''}</>}
          </Button>
          <p className="-mt-3 text-center text-sm text-muted-foreground">
            Laissez paybybot3 ouvert sur cet ordinateur. Vous pouvez arrêter à tout moment.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
