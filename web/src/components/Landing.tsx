import type { ReactNode } from 'react'
import { ArrowRight, CreditCard, EyeOff, KeyRound, Lock, MapPin, Plus, Power, Repeat, ShieldCheck } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { Plate, ZonePlate } from '@/components/signs'
import { TopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

/** Header of the public pages: logo back home, then "Se connecter" and "S'inscrire". */
function SiteHeader() {
  return (
    <TopBar>
      <a href="#/connexion" className={ui.pillGray}>
        Se connecter
      </a>
      <a href="#/inscription" className={ui.pillBlue}>
        S'inscrire
      </a>
    </TopBar>
  )
}

const STEPS = [
  ['Connectez PayByPhone', 'Avec vos identifiants habituels. Pas de nouveau compte, pas de nouveau mot de passe.'],
  ['Vérifiez', 'Véhicule, zone et carte sont retrouvées dans votre compte PayByPhone. Ajoutez un e-mail si vous voulez.'],
  ["C'est tout", 'Le forfait résident est repayé à chaque échéance, même téléphone éteint.'],
]

/** What the dashboard looks like once the renewal runs: a ticket that renews itself. */
function Preview() {
  return (
    <div className="relative mx-auto w-full max-w-[28rem]" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-eu/[0.05] sm:-inset-10" />
      <div className="rounded-2xl border border-border bg-white p-6 shadow-[0_24px_60px_-28px_rgb(30_42_94/0.35)]">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-3">
            <Plate plate="AB123CD" size="sm" />
            <ZonePlate zone="75017" />
          </span>
          <span className="text-sm text-muted-foreground">9,00 €</span>
        </div>
        <p className="mt-6 font-heading text-[2.8rem] leading-none font-bold tracking-tight tabular-nums">6 j 23 h</p>
        <p className="mt-2 text-muted-foreground">jusqu'au lundi 26 octobre, 9h00</p>
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-[97%] rounded-full bg-eu" />
        </div>
        <p className="mt-5 flex items-center gap-2 text-sm text-ink/70">
          <Repeat className="size-4 text-eu" /> Renouvelé automatiquement à la fin
        </p>
      </div>
      <p className="mt-5 text-center text-sm text-ink/45">Votre tableau de bord, une fois inscrit</p>
    </div>
  )
}

const GUARANTEES = [
  [Lock, 'Mot de passe jamais enregistré', 'Il sert seulement à vous connecter à PayByPhone. Il n’est écrit nulle part.'],
  [CreditCard, 'Aucun numéro de carte', 'Le paiement est fait par PayByPhone, avec la carte de votre compte, au même tarif que dans l’application.'],
  [KeyRound, 'Tout est chiffré', 'Le peu qui est gardé pour le renouvellement est chiffré, avec une clé différente pour chaque usage.'],
  [MapPin, 'Hébergé à Paris', 'Serveurs et base de données en France, dans l’Union européenne.'],
  [EyeOff, 'Aucun traceur', 'Ni publicité, ni revente de données, ni outil de mesure d’audience.'],
  [Power, 'Vous gardez la main', 'Vos tickets restent dans l’application PayByPhone. Un clic pour tout arrêter et tout effacer.'],
] as const

/** What makes PaybyBot safe to hand a PayByPhone login to: only claims the security page backs up. */
function Security() {
  return (
    <section className="mt-24 lg:mt-36">
      <h2 className="text-center font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
        Vos données, protégées.
      </h2>
      <p className="mx-auto mt-4 max-w-[36rem] text-center text-[1.05rem] text-ink/60 lg:text-lg">
        PaybyBot agit sur votre compte PayByPhone sans jamais garder votre mot de passe ni votre carte.
      </p>
      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-ink/10 bg-ink/10 sm:grid-cols-2 lg:grid-cols-3">
        {GUARANTEES.map(([Icon, title, text]) => (
          <li key={title} className="bg-white p-6 lg:p-8">
            <span className="grid size-10 place-items-center rounded-full bg-eu/[0.08] text-eu">
              <Icon className="size-5" />
            </span>
            <strong className="mt-4 block text-lg font-semibold text-ink">{title}</strong>
            <span className="mt-1 block text-ink/60">{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-ink/55 sm:flex-row sm:justify-center sm:gap-4">
        <span>Édité par Studio Presto, société française basée à Paris.</span>
        <a href="#/securite" className={ui.link}>
          Tout le détail sur la sécurité
        </a>
      </p>
    </section>
  )
}

/** Public home page: one message, the automatic renewal. */
export function Landing({ hosted }: { hosted: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-[10vh] pb-24 sm:px-8 lg:pt-[14vh]">
        <section className="rise grid items-center gap-12 lg:grid-cols-[1.45fr_1fr] lg:gap-16">
          <div className="max-w-[40rem]">
            <h1 className={cn(ui.title, 'lg:text-[3.3rem] lg:leading-[1.05]')}>Renouvellement automatique de votre ticket de stationnement.</h1>
            <p className={cn(ui.subtitle, 'lg:mt-5 lg:text-xl')}>
              Votre forfait résident PayByPhone est repayé à chaque échéance. Plus d'oubli, plus d'amende.
            </p>
            <a href="#/inscription" className={cn('mt-9 lg:max-w-sm', ui.primary)}>
              S'inscrire <ArrowRight className="size-5" />
            </a>
            <p className="mt-4 text-center text-sm text-ink/50 lg:max-w-sm">
              Déjà inscrit ?{' '}
              <a href="#/connexion" className={ui.link}>
                Se connecter
              </a>
            </p>
            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink/65" aria-label="Garanties">
              {['Mot de passe jamais enregistré', 'Hébergé à Paris', 'Aucun traceur'].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-eu" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <Preview />
        </section>

        <section className="mt-24 lg:mt-36">
          <h2 className="font-heading text-xl font-bold lg:text-2xl">Comment ça marche</h2>
          <ol className="mt-6 grid gap-6 lg:mt-8 lg:grid-cols-3 lg:gap-10">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4 lg:flex-col lg:gap-4 lg:border-t lg:border-border lg:pt-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-eu/[0.08] font-heading font-bold text-eu">
                  {i + 1}
                </span>
                <span>
                  <strong className="block text-ink lg:text-lg">{title}</strong>
                  <span className="text-ink/60">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <Security />

        <section id="faq" className="mt-24 lg:mt-36">
          <FaqTitle as="h2" />
          <Faq className="mt-10 lg:mt-14" />
        </section>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}

const QUESTIONS: [string, ReactNode][] = [
  [
    'Quelles informations me demandez-vous ?',
    <>
      Rien de ce que PayByPhone sait déjà : votre numéro, vos véhicules et votre carte viennent de votre compte, et votre
      zone de votre historique de stationnement. Il ne reste qu'un e-mail, facultatif, pour les confirmations. Si votre
      zone est introuvable, on vous demande votre adresse, seulement pour la retrouver : elle n'est pas conservée.
    </>,
  ],
  [
    'Pourquoi mes identifiants PayByPhone ?',
    <>
      Pour payer à votre place, PaybyBot passe par votre compte PayByPhone, comme l'application. Votre mot de passe
      n'est jamais enregistré : seule une clé de reconnexion est gardée, chiffrée, et effacée dès que vous arrêtez.{' '}
      <a href="#/securite">Sécurité et données</a>
    </>,
  ],
  [
    'Et si je pars en vacances ?',
    <>Mettez le renouvellement en pause entre deux dates : aucun forfait n'est payé, il reprend tout seul au retour.</>,
  ],
  [
    'Comment arrêter ?',
    <>
      Depuis le tableau de bord, « Gérer » puis « Arrêter le renouvellement ». Le ticket en cours reste valable jusqu'à
      sa fin, et ce qui était gardé pour ce renouvellement est effacé.
    </>,
  ],
  [
    'Et si un paiement échoue ?',
    <>
      Vous recevez un e-mail (si vous en avez donné un) et le tableau de bord vous le signale. Dans le doute, PaybyBot ne
      repaie jamais à l'aveugle : vous ne payez pas deux fois.
    </>,
  ],
  [
    'Est-ce un service officiel de PayByPhone ?',
    <>Non. PaybyBot est un service indépendant, édité par Studio Presto, qui utilise votre compte PayByPhone.</>,
  ],
]

const FAQ_TITLE = 'Questions fréquentes.'

function FaqTitle({ as: Tag = 'h1' }: { as?: 'h1' | 'h2' }) {
  return (
    <Tag className="text-center font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
      {FAQ_TITLE}
    </Tag>
  )
}

/** One question per line, a hairline between them, "+" turning into "×" when open. */
function Faq({ className }: { className?: string }) {
  return (
    <Accordion className={cn('border-t border-ink/12', className)}>
      {QUESTIONS.map(([q, a]) => (
        <AccordionItem key={q} value={q} className="border-b border-ink/12 not-last:border-b">
          <AccordionTrigger className="group/q items-center gap-6 rounded-none py-6 text-[1.05rem] font-normal text-ink hover:no-underline focus-visible:ring-0 sm:text-[1.15rem] **:data-[slot=accordion-trigger-icon]:hidden">
            <span className="underline-offset-[6px] decoration-ink/60 group-hover/q:underline group-aria-expanded/accordion-trigger:underline">
              {q}
            </span>
            <Plus
              aria-hidden
              strokeWidth={1.5}
              className="size-5 shrink-0 text-ink transition-transform duration-300 group-aria-expanded/accordion-trigger:rotate-45"
            />
          </AccordionTrigger>
          <AccordionContent className="max-w-[46rem] pb-8 text-[1.02rem] leading-[1.7] text-ink/75 sm:text-[1.08rem]">{a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export function FaqView({ hosted }: { hosted: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-16 pb-24 sm:px-8 lg:pt-24">
        <div className="rise">
          <FaqTitle />
        </div>
        <Faq className="mt-10 lg:mt-14" />
        <a href="#/inscription" className={cn('mx-auto mt-14 max-w-sm', ui.primary)}>
          S'inscrire <ArrowRight className="size-5" />
        </a>
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}
