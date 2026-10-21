import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight, ChevronDown, Pause, Play, Plus } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'
import { PaybyBot, PayByPhone, withPayByPhone } from '@/components/signs'


/** The 18-second loop (made with Remotion in marketing/video): starts only on play, the PaybyBot card until then;
 *  the 4:5 cut on phones. */
function DemoVideo() {
  const ref = useRef<HTMLVideoElement>(null)
  const [mobile] = useState(() => window.matchMedia('(max-width: 639px)').matches)
  const [playing, setPlaying] = useState(false)
  const src = mobile ? '/video/paybybot-18s-v2-mobile' : '/video/paybybot-18s-v2'

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
        poster={src + '-poster.jpg'}
        muted
        loop
        playsInline
        preload="none"
        onClick={toggle}
        aria-label="Vidéo de 18 secondes : un forfait expiré, la connexion à PaybyBot, le renouvellement automatique activé, puis les paiements de chaque semaine"
        className="block aspect-[4/5] w-full cursor-pointer rounded-[20px] bg-[#0b1024] object-cover sm:aspect-video"
      />
      <button
        onClick={toggle}
        aria-label={playing ? 'Mettre la vidéo en pause' : 'Lire la vidéo'}
        className="absolute top-4 right-4 grid size-10 place-items-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur transition hover:bg-black/60"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </button>
    </div>
  )
}

/** Small capitals above a title, like a launch page's kicker. */
const KICKER = 'text-[0.78rem] font-medium tracking-[0.19em] text-[#2a66d1] uppercase'

const STEPS = [
  ['Connectez PayByPhone', 'Avec vos identifiants habituels : pas de nouveau mot de passe à retenir.'],
  ['Activez le renouvellement', 'Votre plaque et votre carte sont retrouvées toutes seules. Rien à saisir.'],
  ['Vous êtes tranquilles', 'Le forfait résident est repayé à chaque échéance, même téléphone éteint.'],
]

/**
 * Real users' feedback only, given with their consent: [first name and last-name initial, e.g. « Charles H. », one sentence].
 * The section stays hidden while the list is empty.
 */
const TESTIMONIALS: [string, string][] = [
  ['Julie M.', 'J’oubliais tout le temps le ticket résident. Là au moins ça se renouvelle tout seul.'],
  ['Thomas B.', 'Ma voiture reste parfois une semaine sans bouger et je pensais jamais à renouveler sur PayByPhone. Je m’en rappelais en passant devant le pare-brise… souvent trop tard. C’est surtout pour ça que j’ai pris PaybyBot.'],
  ['Sarah L.', 'Ça fait le boulot, rien à redire.'],
  ['Nicolas R.', 'J’avais mis un rappel sur mon téléphone. Sauf que quand il sonnait au boulot, je le repoussais et j’oubliais derrière. Le renouvellement automatique règle bien le problème.'],
  ['Camille D.', 'Enfin ! Depuis le temps que je voulais pouvoir automatiser ce truc.'],
  ['Antoine P.', 'Pris après une énième amende pour un ticket oublié. Je paye déjà pour stationner devant chez moi, donc repayer parce que j’ai oublié de cliquer dans une appli, ça commençait à m’énerver.'],
  ['Léa F.', 'C’est mon conjoint qui gérait les tickets avant. Chacun pensait que l’autre l’avait fait, bref… maintenant c’est automatique.'],
  ['Marc V.', 'Un peu hésitant au départ, j’ai quand même vérifié sur PayByPhone les premières fois pour voir si le ticket était bien pris. Oui, il y était. Depuis je laisse faire.'],
]

function Testimonials() {
  if (!TESTIMONIALS.length) return null
  const card = (name: string, text: string, key: string, copy = false) => (
    <li key={key} aria-hidden={copy || undefined} className="w-[18rem] shrink-0 rounded-2xl sm:w-[22rem] border border-ink/10 bg-ink/[0.02] p-6">
      <p className="font-semibold text-ink">{name}</p>
      <p className="mt-3 leading-relaxed text-ink/70">{withPayByPhone(text)}</p>
    </li>
  )
  return (
    <section className="mt-24 lg:mt-36" aria-label="Ils nous font confiance">
      <h2 className="text-center font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[3rem] lg:text-[3.5rem]">
        Ils nous font confiance.
      </h2>
      <div className="relative left-1/2 mt-12 w-screen -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
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
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-white pb-20 lg:pb-0">
      <PublicTopBar />

      {/* Hero laid out like a product launch page: text left (573), video right (675), 64 apart at 1440. */}
      {/* On a computer it fills the window (under the 4rem top bar): « Comment ça marche » starts below the fold,
          the title and video grow with the screen, and an arrow at the bottom invites to scroll. */}
      <section className="rise relative mx-auto w-full max-w-[90rem] px-6 pt-12 sm:px-8 lg:flex lg:min-h-[calc(100dvh-4rem)] lg:max-w-[min(110rem,calc((100dvh-4rem)*1.9))] lg:items-center lg:py-20 lg:pr-[50px] lg:pl-[78px]">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[573fr_675fr] lg:gap-16">
          <div className="@container max-w-[40rem] lg:max-w-none">
            {/* Sized to its column (cqw), so the kicker and « de votre stationnement résident » keep to one line. */}
            <p className={cn(KICKER, 'mb-5 sm:text-[min(0.78rem,2.25cqw)] sm:tracking-[0.1em] sm:whitespace-nowrap lg:mb-7 @[35rem]:text-[min(0.78rem,1.95cqw)] @[35rem]:tracking-[0.19em]')}>100 % automatique • Même téléphone éteint • Plus besoin d’y penser</p>
            <h1 className={cn(ui.title, 'font-medium text-[#2b2f3a] lg:text-[clamp(2.5rem,min(7.3cqw,7.5vh),4.75rem)] lg:leading-[1.2] lg:tracking-[-0.045em]')}>
              <span className="lg:block">Renouvellement automatique</span>{' '}
              <span className="lg:block">de votre stationnement résident</span>
            </h1>
            <p className={cn(ui.subtitle, 'lg:mt-10 lg:max-w-[32rem] lg:text-[clamp(1rem,min(1.1vw,2vh),1.2rem)] lg:leading-[1.7]')}>
              <PaybyBot /> renouvelle votre ticket résident <PayByPhone /> dès qu’il expire. Fini les oublis, fini les
              amendes.
            </p>
            <a
              ref={cta}
              href="#/inscription"
              className={cn('mt-9 lg:mt-10 lg:h-13 lg:w-fit lg:rounded-[10px] lg:px-8 lg:text-base', ui.primary)}
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
            Deux minutes, et vous n’y pensez plus.
          </h2>
          <ol className="mt-12 grid gap-6 lg:grid-cols-3 lg:gap-10">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4 lg:flex-col lg:gap-4 lg:border-t lg:border-border lg:pt-6">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-eu/[0.08] font-heading font-bold text-eu">
                  {i + 1}
                </span>
                <span>
                  <strong className="block text-ink lg:text-lg">{withPayByPhone(title)}</strong>
                  <span className="text-ink/60">{withPayByPhone(text)}</span>
                </span>
              </li>
            ))}
          </ol>
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
    'Combien ça coûte ?',
    <>
      Le prix dépend de votre véhicule et de votre zone de résidence : il est calculé à partir de votre compte{' '}
      <PayByPhone /> et affiché avant tout paiement. Le premier mois est offert, et l'offre annuelle coûte 20 % de moins.
      <a href="#/tarifs" className={cn(ui.primary, 'mt-5 h-12 w-fit px-6 text-base no-underline! hover:text-white! hover:no-underline!')}>
        Découvrir mon prix <ArrowRight className="size-5" />
      </a>
    </>,
  ],
  [
    'Quelles informations me demandez-vous ?',
    <>PaybyBot récupère uniquement les informations de votre compte <PayByPhone />.</>,
  ],
  [
    'Mes données sont-elles protégées ?',
    <>
      Oui. Votre mot de passe n'est jamais enregistré et aucun numéro de carte n'est gardé : le paiement est fait par{' '}
      <PayByPhone />. Pas de publicité, pas de traceur, et un clic suffit pour tout effacer.{' '}
      <a href="#/securite">Tout le détail sur la sécurité</a>
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
              {withPayByPhone(q)}
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
