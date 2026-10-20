import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { ArrowRight, ChevronDown, CreditCard, EyeOff, KeyRound, Lock, MapPin, Pause, Play, Plus, Power, X } from 'lucide-react'
import { Dialog, DialogClose, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { PlanCards, REASSURANCE } from '@/components/Pricing'
import { PublicTopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'


/** The 26-second loop (real demo recording): muted autoplay like a GIF; the portrait cut on phones. */
function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [mobile] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const [still] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [playing, setPlaying] = useState(!still)
  const src = mobile ? '/video/paybybot-26s-mobile' : '/video/paybybot-26s'

  useEffect(() => {
    const v = ref.current
    if (v && !still) v.play().catch(() => setPlaying(false))
  }, [still])

  const [full, setFull] = useState(false)

  function openFull() {
    ref.current?.pause() // one video at a time; the small one resumes on close
    setFull(true)
  }

  function closeFull() {
    setFull(false)
    if (playing) ref.current?.play().catch(() => {})
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
    <div className="relative w-full rounded-[23px] bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] p-[3px] shadow-[0_40px_80px_-35px_rgb(11_16_36/0.6)]">
      <video
        ref={ref}
        src={src + '.mp4'}
        poster={src + '.jpg'}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Vidéo de 26 secondes : activer le renouvellement automatique dans PaybyBot"
        className="block aspect-[4/5] w-full rounded-[20px] bg-[#0b1024] object-cover sm:aspect-video"
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Mettre la vidéo en pause' : 'Lire la vidéo'}
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
      <button
        onClick={openFull}
        className="absolute bottom-4 left-4 inline-flex h-11 items-center gap-2.5 rounded-full bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] px-5 text-[0.95rem] font-semibold text-white shadow-lg transition hover:brightness-110 sm:bottom-6 sm:left-6"
      >
        <Play className="size-4 fill-white" /> Découvrir PaybyBot · 26 s
      </button>
      {full && <FullVideo src={src} onClose={closeFull} />}
    </div>
  )
}

/** The same video, large, over a dimmed page; Échap or the cross closes it. */
function FullVideo({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        <DialogOverlay className="bg-[#0b1024]/70 supports-backdrop-filter:backdrop-blur-md" />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 grid place-items-center p-4 outline-none duration-200 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 sm:p-10">
          <DialogTitle className="sr-only">Découvrir PaybyBot</DialogTitle>
          <video
            src={src + '.mp4'}
            poster={src + '.jpg'}
            autoPlay
            controls
            playsInline
            className="max-h-[calc(100dvh-6rem)] w-full max-w-[min(100%,1530px)] rounded-[24px] bg-[#0b1024] shadow-2xl sm:w-[76vw]"
          />
          <DialogClose
            aria-label="Fermer la vidéo"
            className="fixed top-4 right-4 grid size-11 place-items-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur transition hover:bg-black/80 sm:top-6 sm:right-8"
          >
            <X className="size-5" />
          </DialogClose>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
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
  const cta = useRef<HTMLAnchorElement>(null)
  const sticky = useStickyCta(cta)
  return (
    <div className="flex min-h-dvh flex-col bg-white pb-20 lg:pb-0">
      <PublicTopBar />

      {/* Hero laid out like a product launch page: text left (573), video right (675), 64 apart at 1440. */}
      {/* On a computer it fills the window (under the 4rem top bar): « Comment ça marche » starts below the fold,
          the title and video grow with the screen, and an arrow at the bottom invites to scroll. */}
      <section className="rise relative mx-auto w-full max-w-[90rem] px-6 pt-12 sm:px-8 lg:flex lg:min-h-[calc(100dvh-4rem)] lg:max-w-[min(110rem,calc((100dvh-4rem)*1.9))] lg:items-center lg:py-20 lg:pr-[50px] lg:pl-[78px]">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[573fr_675fr] lg:gap-16">
          <div className="@container max-w-[40rem] lg:max-w-none">
            {/* Sized to its column (cqw), so « forfait de stationnement. » keeps to one line. */}
            <h1 className={cn(ui.title, 'lg:text-[clamp(2.75rem,min(9.1cqw,7.5vh),4.75rem)] lg:leading-[1.08] lg:tracking-[-0.045em]')}>
              Renouvellement automatique de votre{' '}
              <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] box-decoration-clone bg-clip-text text-transparent">
                forfait de stationnement
              </span>
              .
            </h1>
            <p className={cn(ui.subtitle, 'lg:mt-6 lg:max-w-[32rem] lg:text-[clamp(1rem,min(1.1vw,2vh),1.2rem)] lg:leading-[1.65]')}>
              Votre forfait résident PayByPhone est repayé à chaque échéance. Plus d'oubli, plus d'amende.
            </p>
            <a
              ref={cta}
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
          </div>
          <DemoVideo />
        </div>
        <button
          type="button"
          onClick={() => document.getElementById('comment')?.scrollIntoView({ behavior: 'smooth' })}
          className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-1 text-sm font-medium text-ink/45 transition hover:text-eu lg:flex"
        >
          Comment ça marche
          <ChevronDown className="size-5 motion-safe:animate-[nudge_1.8s_ease-in-out_infinite]" />
        </button>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 sm:px-8">

        <section id="comment" className="mt-24 scroll-mt-20 lg:mt-36">
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

        <section id="prix" className="mt-24 lg:mt-36">
          <h2 className="text-center font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
            Un prix simple.
          </h2>
          <p className="mx-auto mt-4 max-w-[34rem] text-center text-[1.05rem] text-ink/60 lg:text-lg">{REASSURANCE}</p>
          <div className="mx-auto mt-12 max-w-3xl">
            <PlanCards signedIn={false} />
          </div>
        </section>

        <Testimonials />

        <section id="faq" className="mt-24 lg:mt-36">
          <FaqTitle as="h2" />
          <Faq className="mt-10 lg:mt-14" />
        </section>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={hosted} />

      {/* Phones: the main action stays at hand once the hero button has scrolled away. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition duration-300 lg:hidden',
          sticky ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
        )}
        aria-hidden={!sticky}
      >
        <a href="#/inscription" tabIndex={sticky ? 0 : -1} className={cn('h-12 text-base', ui.primary)}>
          Essayer gratuitement <ArrowRight className="size-5" />
        </a>
      </div>
    </div>
  )
}

/** True once the given element has scrolled above the viewport. */
function useStickyCta(ref: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || !('IntersectionObserver' in window)) return
    const io = new IntersectionObserver(([e]) => setPast(!e.isIntersecting && e.boundingClientRect.top < 0))
    io.observe(el)
    return () => io.disconnect()
  }, [ref])
  return past
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
