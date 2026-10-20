import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, CreditCard, EyeOff, KeyRound, Lock, MapPin, Pause, Play, Plus, Power, ShieldCheck } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'


/** Under the main button: three facts the security and pricing pages back up. */
const TRUST = [
  [ShieldCheck, 'Paiement Stripe'],
  [MapPin, 'Hébergé en France'],
  [Power, 'Sans engagement'],
] as const

/** The 23-second loop (real demo recording): muted autoplay like a GIF; the portrait cut on phones. */
function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [mobile] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [playing, setPlaying] = useState(!still)
  const src = mobile ? '/video/paybybot-23s-mobile' : '/video/paybybot-23s'

  useEffect(() => {
    const v = ref.current
    if (v && !still) v.play().catch(() => setPlaying(false))
  }, [still])

  function restart() {
    const v = ref.current
    if (!v) return
    v.currentTime = 0
    v.play().then(() => setPlaying(true), () => {})
  }

  function toggle() {
    const v = ref.current
    if (!v) return
    if (v.paused) v.play().then(() => setPlaying(true), () => {})
    else {
      v.pause()
      setPlaying(false)
    }
  }

  return (
    <div className="relative w-full">
      <video
        ref={ref}
        src={src + '.mp4'}
        poster={src + '.jpg'}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Vidéo de 23 secondes : activer le renouvellement automatique dans PaybyBot"
        className="block aspect-[4/5] w-full rounded-[20px] bg-[#0b1024] object-cover shadow-[0_40px_80px_-35px_rgb(11_16_36/0.6)] sm:aspect-video"
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Mettre la vidéo en pause' : 'Lire la vidéo'}
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button
        onClick={restart}
        className="absolute bottom-4 left-4 inline-flex h-11 items-center gap-2.5 rounded-full bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] px-5 text-[0.95rem] font-semibold text-white shadow-lg transition hover:brightness-110 sm:bottom-6 sm:left-6"
      >
        <Play className="size-4 fill-white" /> Découvrir PaybyBot · 23 s
      </button>
    </div>
  )
}

const STEPS = [
  ['Connectez PayByPhone', 'Avec vos identifiants habituels : pas de nouveau mot de passe à retenir.'],
  ['Vérifiez', 'Véhicule et carte sont retrouvés dans votre compte PayByPhone. Vous indiquez votre adresse et confirmez votre e-mail.'],
  ["C'est tout", 'Le forfait résident est repayé à chaque échéance, même téléphone éteint.'],
]

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

/**
 * Real users' feedback only, given with their consent: [first name and last name, short quote].
 * The section stays hidden while the list is empty.
 */
const TESTIMONIALS: [string, string][] = []

function Testimonials() {
  if (!TESTIMONIALS.length) return null
  const card = (name: string, text: string, key: string, copy = false) => (
    <li key={key} aria-hidden={copy || undefined} className="w-[22rem] shrink-0 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
      <p className="font-semibold text-ink">{name}</p>
      <p className="mt-3 leading-relaxed text-ink/70">{text}</p>
    </li>
  )
  return (
    <section className="mt-24 lg:mt-36" aria-label="Retour Utilisateurs">
      <h2 className="text-center font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
        Retour Utilisateurs
      </h2>
      <div className="relative mt-12 -mx-6 overflow-hidden sm:-mx-8 [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
        <ul className="marquee flex w-max gap-4">
          {TESTIMONIALS.map(([name, text], i) => card(name, text, 'a' + i))}
          {TESTIMONIALS.map(([name, text], i) => card(name, text, 'b' + i, true))}
        </ul>
      </div>
    </section>
  )
}

/** Public home page: one message, the automatic renewal. */
export function Landing({ hosted }: { hosted: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicTopBar />

      {/* Hero laid out like a product launch page: kicker on top, text left (573), video right (675), 64 apart at 1440. */}
      <section className="rise mx-auto w-full max-w-[90rem] px-6 pt-12 sm:px-8 lg:pt-16 lg:pr-[50px] lg:pl-[78px]">
        <p className="text-center text-[13px] font-semibold tracking-[0.25em] text-eu uppercase">Stationnement résident automatisé</p>
        <div className="mt-8 grid items-center gap-12 lg:mt-6 lg:grid-cols-[573fr_675fr] lg:gap-16">
          <div className="max-w-[40rem]">
            <h1 className={cn(ui.title, 'lg:text-[3.42rem] lg:leading-[1.08] lg:tracking-[-0.045em]')}>
              Renouvellement automatique de votre ticket de stationnement.
            </h1>
            <p className={cn(ui.subtitle, 'lg:mt-6 lg:max-w-[30rem] lg:text-base lg:leading-[1.65]')}>
              Votre forfait résident PayByPhone est repayé à chaque échéance. Plus d'oubli, plus d'amende.
            </p>
            <a
              href="#/inscription"
              className={cn('mt-9 lg:mt-7 lg:h-12 lg:w-fit lg:rounded-full lg:px-8 lg:text-base', ui.primary)}
            >
              Essayer gratuitement <ArrowRight className="size-5" />
            </a>
            <p className="mt-4 text-center text-sm text-ink/50 lg:text-left">
              Déjà inscrit ?{' '}
              <a href="#/connexion" className={ui.link}>
                Se connecter
              </a>
            </p>
            <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink/55 lg:mt-6 lg:justify-start">
              {TRUST.map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-1.5">
                  <Icon className="size-4 text-eu" /> {text}
                </li>
              ))}
            </ul>
          </div>
          <DemoVideo />
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 sm:px-8">

        <section className="mt-24 lg:mt-36">
          <h2 className="text-center font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
            Comment ça marche.
          </h2>
          <ol className="mt-12 grid gap-6 lg:grid-cols-3 lg:gap-10">
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

        <Testimonials />

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
      Rien de ce que PayByPhone sait déjà : votre numéro, vos véhicules et votre carte viennent de votre compte. On vous
      demande seulement votre e-mail, pour les confirmations, et votre adresse de résidence, pour trouver votre zone :
      l'adresse n'est pas conservée, seule la zone l'est.
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

export function FaqView({ hosted, signedIn = false }: { hosted: boolean; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <PublicTopBar signedIn={signedIn} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pt-16 pb-24 sm:px-8 lg:pt-24">
        <div className="rise">
          <FaqTitle />
        </div>
        <Faq className="mt-10 lg:mt-14" />
        <a href="#/inscription" className={cn('mx-auto mt-14 max-w-sm', ui.primary)}>
          Essayer gratuitement <ArrowRight className="size-5" />
        </a>
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}
