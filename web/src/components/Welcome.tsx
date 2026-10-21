import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Car, Check, CreditCard, Minus, Phone, Ticket, UserRound } from 'lucide-react'
import { Horodateur } from '@/components/Horodateur'
import { CardGate, ResidentGate, type ResidentStatus } from '@/components/Riverain'
import { arrondissement, PayByPhone, Plate, withPayByPhone, Wordmark, ZonePlate } from '@/components/signs'
import { api, until, type Me, type Overview, type PricedVehicle } from '@/lib/api'
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
  // The « riverain » vehicles, each with the arrondissement PayByPhone gives it the resident rate in (found on
  // PayByPhone, never typed); undefined: looking. None at all: PaybyBot cannot be used (resident notice).
  const [status, setStatus] = useState<ResidentStatus | null>(null)
  const [vehicles, setVehicles] = useState<PricedVehicle[] | undefined>(undefined)
  useEffect(() => {
    api.pricing().then(
      (p) => {
        setVehicles(p.vehicles ?? [])
        if (!me.demo) setStatus({ zone: p.zone, resident: p.vehicles?.length ? true : (p.resident ?? false) })
      },
      () => setVehicles([]),
    )
  }, [me.demo])

  // PaybyBot pays with a card saved on PayByPhone: without one it cannot be used.
  const cards = data.payments.filter((p) => p.kind === 'card')

  const step = 140
  let i = 0
  const next = () => ++i * step

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[1.05fr_1fr]">
      {status?.resident === false ? (
        <ResidentGate zone={status.zone} vehicles={data.vehicles.length} onChecked={setStatus} />
      ) : (
        !cards.length && !me.demo && <CardGate />
      )}
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
              label={vehicles && vehicles.length > 1 ? `${vehicles.length} véhicules résidents` : 'Véhicule résident'}
              delay={next()}
              found={!!vehicles?.length}
            >
              {vehicles === undefined ? (
                <span className="inline-block h-5 w-40 animate-pulse rounded bg-ink/10" />
              ) : vehicles.length ? (
                <span className="flex flex-col gap-2 pt-0.5">
                  {vehicles.map((v) => (
                    <span key={v.plate} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Plate plate={v.plate} size="sm" />
                      {arrondissement(v.zone) && <span className="font-semibold">{arrondissement(v.zone)}</span>}
                      <ZonePlate zone={v.zone} />
                    </span>
                  ))}
                  <span className="text-sm text-ink/55">Arrondissement trouvé sur votre compte <PayByPhone /></span>
                </span>
              ) : (
                <span className="text-ink/60">
                  {data.vehicles.length
                    ? 'Aucun véhicule au tarif résident.'
                    : withPayByPhone('Aucun véhicule : ajoutez-le dans l’application PayByPhone.')}
                </span>
              )}
            </Row>
            <Row
              icon={<CreditCard className="size-5" />}
              label={cards.length > 1 ? 'Cartes bancaires' : 'Carte bancaire'}
              delay={next()}
              found={cards.length > 0}
            >
              {cards.length ? (
                <>
                  <span className="flex flex-col gap-0.5 font-semibold">
                    {cards.map((p) => (
                      <span key={p.id}>{p.label}</span>
                    ))}
                  </span>
                  <span className="mt-1 block text-sm text-ink/55">
                    Utilisée pour vos renouvellements. Apple Pay et Google Pay ne permettent pas le paiement automatique.
                  </span>
                </>
              ) : (
                <span className="text-ink/60">{withPayByPhone('Aucune carte : ajoutez-en une dans l’application PayByPhone.')}</span>
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
            onClick={onContinue}
            disabled={!vehicles?.length || status?.resident === false || !cards.length}
            className={cn('rise mt-8', ui.primary)}
            style={{ animationDelay: `${next()}ms` }}
          >
            C’est bien moi, continuer <ArrowRight className="size-5" />
          </button>
        </div>
      </div>

      <div className="relative hidden items-center justify-center overflow-hidden bg-[radial-gradient(70%_60%_at_50%_45%,#e6ecfb_0%,#f4f6fb_60%,#f7f8fb_100%)] lg:flex">
        <Horodateur className="w-[min(72%,28rem)] drop-shadow-[0_30px_40px_rgb(29_42_107/0.12)]" />
      </div>
    </div>
  )
}
