import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Car, Check, CreditCard, Loader2, MapPin, Minus, Phone, Ticket, UserRound } from 'lucide-react'
import { Horodateur } from '@/components/Horodateur'
import { arrondissement, PayByPhone, Plate, Wordmark, ZonePlate } from '@/components/signs'
import { api, mainPlateOf, until, type Me, type Overview } from '@/lib/api'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

/** +33612345678 -> +33 6 12 34 56 78 (other formats are shown as they are). */
function phoneText(username: string) {
  const m = username.match(/^\+33(\d)(\d{2})(\d{2})(\d{2})(\d{2})$/)
  return m ? `+33 ${m.slice(1).join(' ')}` : username
}

function Row({
  icon,
  label,
  children,
  delay,
  found = true,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
  delay: number
  found?: boolean
}) {
  return (
    <li className="rise flex items-start gap-4 py-4" style={{ animationDelay: `${delay}ms` }}>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-eu/[0.08] text-eu">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink/55">{label}</p>
        <div className="mt-1 text-ink">{children}</div>
      </div>
      {found ? (
        <span className="mt-2.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#e7f6ec] text-[#1a9a4a]">
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="mt-2.5 grid size-6 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-ink/40">
          <Minus className="size-3.5" strokeWidth={3} />
        </span>
      )}
    </li>
  )
}

/** First sign-in: everything PaybyBot found in the PayByPhone account, so the user can check it is right. */
export function Welcome({ me, data, onContinue }: { me: Me; data: Overview; onContinue: () => void }) {
  const [zone, setZone] = useState<string | null | undefined>(undefined)
  const [manual, setManual] = useState(false)
  const [main, setMain] = useState<string | null>(() => mainPlateOf(null, data.vehicles))
  const [saving, setSaving] = useState(false)

  // The main vehicle is kept on the account: shown on the dashboard, preselected for the renewal.
  async function confirm() {
    setSaving(true)
    if (main) await api.updateAccount({ mainPlate: main }).catch(() => {})
    onContinue()
  }
  useEffect(() => {
    api.residentZone().then(
      (r) => {
        setZone(r.zone)
        setManual(!!r.manual)
      },
      () => setZone(null),
    )
  }, [])

  const step = 140
  let i = 0
  const next = () => ++i * step

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1.05fr_1fr]">
      <div className="flex flex-col px-6 pt-5 pb-10 sm:px-10 lg:px-[clamp(2.5rem,7vw,7rem)]">
        <Wordmark />
        <div className="mx-auto w-full max-w-lg lg:my-auto lg:py-10">
          <h1 className={cn(ui.title, 'rise mt-10 lg:mt-0')}>
            Bienvenue{me.firstName ? `, ${me.firstName}` : ''}.
          </h1>
          <p className={cn(ui.subtitle, 'rise')}>
            Voici ce que PaybyBot a retrouvé dans votre compte <PayByPhone />. Vérifiez que tout est juste.
          </p>

          <ul className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
            <Row icon={<Phone className="size-5" />} label="Compte PayByPhone" delay={next()}>
              <span className="font-semibold tabular-nums">{phoneText(me.username)}</span>
              <span className="ml-2 text-sm text-ink/55">connecté</span>
            </Row>
            {me.firstName && (
              <Row icon={<UserRound className="size-5" />} label="Titulaire" delay={next()}>
                <span className="font-semibold">{me.firstName}</span>
              </Row>
            )}
            <Row
              icon={<Car className="size-5" />}
              label={data.vehicles.length > 1 ? `${data.vehicles.length} véhicules` : 'Véhicule'}
              delay={next()}
              found={data.vehicles.length > 0}
            >
              {data.vehicles.length > 1 ? (
                <>
                  <span className="block text-sm font-semibold text-ink">Choisissez votre véhicule principal :</span>
                  <span role="radiogroup" aria-label="Véhicule principal" className="mt-2 flex flex-wrap gap-2">
                    {data.vehicles.map((v) => (
                      <button
                        key={v.plate}
                        role="radio"
                        aria-checked={v.plate === main}
                        onClick={() => setMain(v.plate)}
                        className={cn(
                          'rounded-xl border-2 p-1.5 transition',
                          v.plate === main ? 'border-eu bg-eu/[0.05]' : 'border-ink/10 hover:border-ink/25',
                        )}
                      >
                        <Plate plate={v.plate} size="sm" />
                      </button>
                    ))}
                  </span>
                </>
              ) : data.vehicles.length ? (
                <span className="flex flex-wrap gap-2 pt-0.5">
                  <Plate plate={data.vehicles[0].plate} size="sm" />
                </span>
              ) : (
                <span className="text-ink/60">Aucun véhicule : ajoutez-le dans l’application PayByPhone.</span>
              )}
            </Row>
            <Row
              icon={<CreditCard className="size-5" />}
              label={data.payments.length > 1 ? 'Moyens de paiement' : 'Moyen de paiement'}
              delay={next()}
              found={data.payments.length > 0}
            >
              {data.payments.length ? (
                <span className="flex flex-col gap-0.5 font-semibold">
                  {data.payments.map((p) => (
                    <span key={p.id}>{p.label}</span>
                  ))}
                </span>
              ) : (
                <span className="text-ink/60">Aucune carte : ajoutez-en une dans l’application PayByPhone.</span>
              )}
            </Row>
            <Row icon={<MapPin className="size-5" />} label="Zone de résidence" delay={next()} found={zone !== null}>
              {zone === undefined ? (
                <span className="inline-block h-5 w-24 animate-pulse rounded bg-ink/10" />
              ) : zone ? (
                <span className="flex flex-wrap items-baseline gap-x-3">
                  {arrondissement(zone) && <span className="font-semibold">{arrondissement(zone)}</span>}
                  <ZonePlate zone={zone} />
                  <span className="text-sm text-ink/55">{manual ? 'indiquée par vous' : 'trouvée dans votre historique'}</span>
                </span>
              ) : (
                <span className="text-ink/60">Pas dans votre historique : vous indiquerez votre adresse à l’étape suivante.</span>
              )}
            </Row>
            {data.sessions.length > 0 && (
              <Row icon={<Ticket className="size-5" />} label="Ticket en cours" delay={next()}>
                {data.sessions.map((s) => (
                  <span key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Plate plate={s.plate} size="sm" />
                    <span className="text-ink/70">{until(s.expire)}</span>
                  </span>
                ))}
              </Row>
            )}
          </ul>

          <p className="rise mt-5 text-sm leading-relaxed text-ink/55" style={{ animationDelay: `${next()}ms` }}>
            Rien n’a été modifié dans votre compte <PayByPhone />, et votre mot de passe n’est pas enregistré. Un véhicule
            ou une carte à changer ? Faites-le dans l’application <PayByPhone /> : PaybyBot suit automatiquement.
          </p>

          <button
            onClick={confirm}
            disabled={saving}
            className={cn('rise mt-8', ui.primary)}
            style={{ animationDelay: `${next()}ms` }}
          >
            {saving ? <Loader2 className="size-5 animate-spin" /> : <>C’est bien moi, continuer <ArrowRight className="size-5" /></>}
          </button>
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden bg-[radial-gradient(70%_60%_at_50%_45%,#e6ecfb_0%,#f4f6fb_60%,#f7f8fb_100%)] lg:flex">
        <Horodateur className="w-[min(72%,28rem)] drop-shadow-[0_30px_40px_rgb(29_42_107/0.12)]" />
      </div>
    </div>
  )
}
