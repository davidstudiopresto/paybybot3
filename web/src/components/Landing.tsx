import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight, CreditCard, Link2, Plus, RefreshCw, Repeat, ShieldCheck, Trash2, type LucideIcon } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { PlanCards } from '@/components/Pricing'
import { cn } from '@/lib/utils'
import { TRY_LABEL, ui } from '@/lib/styles'
import { brandNodes, PayByBot, PayByPhone, Plate, withBrands, withPayByPhone, Wordmark } from '@/components/signs'
import { Iphone } from '@/components/ui/iphone'



/** Prunoo's four features, said only as far as PayByBot does them. */
const FEATURES: Question[] = [
  [
    'Renouvellement automatique',
    <>Votre stationnement résident est renouvelé chaque semaine, avant chaque expiration, même téléphone éteint.</>,
  ],
  [
    'Pause en 1 clic',
    <>Vous partez en vacances ? Mettez le renouvellement en pause entre deux dates, ou sans date de fin. Rien n'est payé pendant la pause.</>,
  ],
  [
    'Alertes intelligentes',
    <>En cas d'échec de paiement, vous êtes prévenu par e-mail avec la raison (carte refusée, droit résident expiré…), et vous relancez en un clic.</>,
  ],
  [
    'Support',
    <>
      Une question ? Écrivez-nous à <a href="mailto:contact@paybybot.fr">contact@paybybot.fr</a>, 7j/7.
    </>,
  ],
]

const STEP_ICONS = [Link2, RefreshCw, ShieldCheck]

const STEPS = [
  ['Connectez PayByPhone', 'Reliez votre compte PayByPhone existant.'],
  ['Activez le renouvellement', 'Choisissez votre véhicule et activez le renouvellement hebdomadaire en un clic.'],
  ['Vous êtes tranquilles', 'PayByBot veille 24/7 et renouvelle votre stationnement avant chaque expiration.'],
]

/**
 * Real users' feedback only, given with their consent: [first name and last-name initial, e.g. « Charles H. », one sentence].
 * The section stays hidden while the list is empty.
 */
const TESTIMONIALS: [string, string, string][] = [
  ['Julie M.', 'Résident Paris 6', 'J’oubliais toujours le ticket résident. Là, ça se renouvelle tout seul.'],
  ['Thomas B.', 'Résident Paris 8', 'Ma voiture bouge peu et j’oubliais de renouveler. Plus maintenant.'],
  ['Sarah L.', 'Résident Paris 17', 'Ça fait le boulot, rien à redire.'],
  ['Nicolas R.', 'Résident Paris 8', 'Mon rappel sonnait au boulot, je l’oubliais. L’automatique règle ça.'],
  ['Camille D.', 'Résident Paris 16', 'Enfin ! Depuis le temps que je voulais automatiser ce truc.'],
  ['Antoine P.', 'Résident Paris 5', 'Pris après une énième amende pour un ticket oublié. Plus jamais.'],
  ['Léa F.', 'Résident Paris 2', 'Avec mon conjoint, chacun croyait que l’autre l’avait fait. Plus maintenant.'],
  ['Marc V.', 'Résident Paris 16', 'J’ai vérifié les premières fois : le ticket était bien pris. Je laisse faire.'],
]

/** The three worries about handing over a PayByPhone password, answered where the visitor decides. */
export function TrustRow({ className }: { className?: string }) {
  const items: [LucideIcon, string][] = [
    [ShieldCheck, 'Mot de passe jamais enregistré'],
    [CreditCard, 'Paiement fait par PayByPhone'],
    [Trash2, 'Effaçable en un clic'],
  ]
  return (
    <ul className={cn('flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink/65', className)}>
      {items.map(([Icon, text]) => (
        <li key={text} className="flex items-center gap-1.5">
          <Icon className="size-4 text-eu" strokeWidth={1.75} /> {withPayByPhone(text)}
        </li>
      ))}
      <li>
        <a href="#/securite" className="text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink">
          Sécurité
        </a>
      </li>
    </ul>
  )
}

/** The dashboard as it looks once the renewal runs, in a phone (an illustration, not a real account). */
function PhoneDemo({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('relative mx-auto w-[16rem] sm:w-[18rem]', className)}>
      <div className="relative">
        <Iphone />
        {/* The screen's place in the mockup (433 × 882, screen at 21.25 / 19.25, 389.5 × 843.5). */}
        <div className="absolute overflow-hidden bg-white text-left" style={{ left: '4.91%', top: '2.18%', width: '89.95%', height: '95.64%', borderRadius: '14.3% / 6.6%' }}>
          <div className="flex h-full flex-col px-4 pt-12 text-[0.7rem]">
            <p className="font-heading text-[0.95rem] font-semibold"><Wordmark /></p>
            <p className="mt-5 text-ink/50">Bonjour,</p>
            <p className="font-heading text-[1.15rem] leading-tight font-semibold text-ink">1 ticket en cours</p>
            <div className="mt-3 rounded-xl border border-ink/10 p-3 shadow-[0_6px_16px_-10px_rgb(11_16_36/0.25)]">
              <div className="flex items-center gap-2">
                <Plate plate="AB-123-CD" size="sm" />
                <span className="font-semibold text-ink">Paris 5e</span>
              </div>
              <p className="mt-2 text-ink/55">Valable encore 4 jours</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full w-[58%] rounded-full bg-eu" />
              </div>
              <p className="mt-2.5 flex items-center gap-1.5 text-ink/70">
                <Repeat className="size-3 text-eu" /> Renouvelé automatiquement
              </p>
            </div>
            <div className="mt-3 rounded-xl bg-eu/[0.06] p-3">
              <p className="font-semibold text-ink">Forfait renouvelé</p>
              <p className="mt-0.5 text-ink/60">Une nouvelle semaine a été payée sur <PayByPhone />.</p>
            </div>
          </div>
        </div>
      </div>
      {/* The phone's lower half fades into the page. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-white to-transparent" />
    </div>
  )
}

/** « +0 » rising to « +100 » once on screen (at once when motion is reduced). */
function CountUp({ to, className }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return setValue(to)
    let frame = 0
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / 1600)
        setValue(Math.round(to * (1 - (1 - t) ** 3)))
        if (t < 1) frame = requestAnimationFrame(step)
      }
      frame = requestAnimationFrame(step)
    }, { threshold: 0.6 })
    observer.observe(el)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [to])
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      +{value}
    </span>
  )
}

/** Off until real users' reviews and a real count replace the examples above (see TESTIMONIALS). */
const SHOW_TESTIMONIALS = false

function Testimonials() {
  if (!SHOW_TESTIMONIALS || !TESTIMONIALS.length) return null
  const card = (name: string, place: string, text: string, key: string, copy = false) => (
    <li key={key} aria-hidden={copy || undefined} className="w-[22rem] shrink-0 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
      <p className="font-semibold text-ink">{name}</p>
      {place && <p className="text-sm text-ink/50">{place}</p>}
      <p title={text} className="mt-3 line-clamp-2 leading-relaxed text-ink/70">{withPayByPhone(text)}</p>
    </li>
  )
  return (
    <section className="flex flex-col justify-center pt-10 pb-24 lg:min-h-[calc(85dvh-4rem)] lg:pt-12 lg:pb-20" aria-label="Ils nous font confiance">
      <h2 className="text-center font-heading text-[2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
        Ils nous font confiance.
      </h2>
      <p className="mt-5 text-center text-lg text-ink/60">
        <CountUp to={100} className="font-heading text-2xl font-semibold text-eu" /> résidents parisiens utilisent PayByBot
      </p>
      <div className="relative left-1/2 mt-16 w-screen lg:mt-24 -translate-x-1/2 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_15%,#000_85%,transparent)]">
        <ul className="marquee flex w-max gap-4">
          {TESTIMONIALS.map(([name, place, text], i) => card(name, place, text, 'a' + i))}
          {TESTIMONIALS.map(([name, place, text], i) => card(name, place, text, 'b' + i, true))}
        </ul>
      </div>
      <a
        href="#/inscription"
        className={cn('mx-auto mt-14 w-full shadow-[0_14px_30px_-12px_var(--eu)] sm:w-fit sm:px-10 lg:mt-20 lg:h-14 lg:rounded-[12px] lg:text-lg', ui.primary)}
      >
        {TRY_LABEL} <ArrowRight className="size-5" />
      </a>
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

      {/* Centered hero filling the window on a computer (under the 4rem top bar): the kicker as a pill, the title on
          two lines (the first in the brand gradient), then the call to action. */}
      <section className="rise relative w-full overflow-hidden bg-[radial-gradient(60rem_30rem_at_50%_0%,color-mix(in_srgb,var(--eu)_7%,transparent),transparent)] px-6 pt-14 sm:px-8 lg:pt-20">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center text-center">
          <h1 className="font-heading text-[2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
            <span className="block bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">Renouvellement automatique</span>
            <span className="block">de votre stationnement résident</span>
            <span className="block">sur <PayByPhone /></span>
          </h1>
          <p className="mt-6 max-w-[36rem] text-[1.05rem] leading-relaxed text-ink/60 lg:mt-8 lg:text-[1.2rem] lg:leading-[1.6]">
            <PayByBot /> renouvelle votre stationnement résident sur <PayByPhone />, sans interruption. Zéro oubli, zéro
            amende.
          </p>
          <a
            ref={cta}
            href="#/inscription"
            className={cn('mt-10 w-full sm:px-10 shadow-[0_14px_30px_-12px_var(--eu)] sm:w-fit lg:mt-12 lg:h-14 lg:rounded-[12px] lg:px-10 lg:text-lg', ui.primary)}
          >
            {TRY_LABEL} <ArrowRight className="size-5" />
          </a>
          <p className="mt-4 text-sm text-ink/55">Sans carte bancaire · Sans engagement</p>
          <p className="mt-1 text-sm text-ink/55">
            Une amende : jusqu’à 125 €. <PayByBot /> : dès 4,90 €/mois.
          </p>
          <TrustRow className="mt-8" />
          <PhoneDemo className="mt-14 lg:mt-16" />
        </div>
      </section>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 sm:px-8">

        {/* Almost a full screen on a computer: three centered steps, each an icon in a ring with its number,
            joined by a thin line. */}
        <section id="comment" className="flex scroll-mt-16 flex-col justify-center pt-24 pb-10 lg:min-h-[calc(85dvh-4rem)] lg:pt-20 lg:pb-12">
          <h2 className="text-center font-heading text-[2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
            Comment ça marche
          </h2>
          <ol className="relative mt-16 grid gap-14 lg:mt-24 lg:grid-cols-3 lg:gap-12">
            <span aria-hidden className="absolute top-10 right-[16.7%] left-[16.7%] hidden h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--eu)_25%,transparent)_15%,color-mix(in_srgb,var(--eu)_25%,transparent)_85%,transparent)] lg:block" />
            {STEPS.map(([title, text], i) => {
              const Icon = STEP_ICONS[i]
              return (
                <li key={title} className="relative flex flex-col items-center text-center">
                  <span className="relative grid size-20 place-items-center rounded-full border border-eu/15 bg-white text-eu shadow-[0_10px_30px_-12px_color-mix(in_srgb,var(--eu)_45%,transparent)]">
                    <Icon className="size-8" strokeWidth={1.75} />
                    <span className="absolute -top-1.5 -right-1.5 grid size-8 place-items-center rounded-full bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] font-heading text-sm font-bold text-white ring-4 ring-white">
                      {i + 1}
                    </span>
                  </span>
                  <strong className="mt-8 block font-heading text-xl font-semibold tracking-[-0.02em] text-ink lg:text-2xl">{withPayByPhone(title)}</strong>
                  <span className="mt-3 max-w-[22rem] text-[1.05rem] leading-relaxed text-ink/60 lg:text-lg">{withPayByPhone(text)}</span>
                </li>
              )
            })}
          </ol>
        </section>


        <section id="fonctionnalites" className="scroll-mt-16 py-10 lg:py-12">
          <h2 className="text-center font-heading text-[2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
            Fonctionnalités
          </h2>
          <Rows items={FEATURES} openFirst className="mt-12 lg:mt-16" />
        </section>

        <Testimonials />

        <section id="tarifs" className="scroll-mt-16 py-12 lg:py-16">
          <h2 className="text-center font-heading text-[2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
            Tarifs
          </h2>
          <p className="mx-auto mt-4 max-w-[32rem] text-center text-[1.05rem] text-ink/60 sm:text-lg">
            Un prix par véhicule résident, selon son type et sa zone.
          </p>
          <div className="mt-12">
            <PlanCards signedIn={false} />
          </div>
        </section>

        <section id="faq" className="mt-24 lg:mt-36">
          <FaqTitle as="h2" />
          <Faq className="mt-10 lg:mt-14" />
        </section>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={hosted} />

      {/* Phones: the main action stays at hand once the hero button has scrolled away. */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-white/90 pr-20 pl-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md transition duration-300 lg:hidden',
          sticky ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0',
        )}
        aria-hidden={!sticky}
      >
        <a href="#/inscription" tabIndex={sticky ? 0 : -1} className={cn('h-12 text-base', ui.primary)}>
          {TRY_LABEL} <ArrowRight className="size-5" />
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

type Question = [string, ReactNode]

const QUESTIONS: Question[] = [
  [
    'Comment fonctionne PayByBot ?',
    <>
      Vous connectez votre compte <PayByPhone /> et activez le renouvellement. Chaque semaine, votre stationnement
      résident est repris avant la fin de la précédente, même téléphone éteint.
    </>,
  ],
  [
    'Le stationnement coûte-t-il plus cher ?',
    <>Non. Il est payé à <PayByPhone />, avec votre carte, au même prix que dans l'application.</>,
  ],
  [
    'Pour quels véhicules et quels stationnements ?',
    <>
      Voiture, deux-roues ou utilitaire ayant le tarif résident à Paris. Les autres tarifs (PMR, professionnel,
      électrique…) ne sont pas encore proposés.
    </>,
  ],
  [
    'Combien coûte l’abonnement ?',
    <>
      Voiture : 9,90 €/mois en zone 1 (arr. 1 à 11), 6,90 € en zone 2 (arr. 12 à 20). Deux-roues : 6,90 € et 4,90 €. À l'année : 20 % de remise. Premier mois offert.
      <a href="#/tarifs" className={cn(ui.primary, 'mt-5 h-12 w-fit px-6 text-base no-underline! hover:text-white! hover:no-underline!')}>
        Découvrir mon prix <ArrowRight className="size-5" />
      </a>
    </>,
  ],
  [
    'Mes identifiants PayByPhone sont-ils protégés ?',
    <>
      Oui. Votre mot de passe n'est jamais enregistré, ni votre numéro de carte : seule une clé de reconnexion chiffrée
      est gardée, et effacée dès que vous arrêtez. <a href="#/securite">Tout le détail sur la sécurité</a>
    </>,
  ],
  [
    'Comment savoir que c’est fait ?',
    <>Un e-mail à chaque paiement, et le ticket apparaît dans votre application <PayByPhone />.</>,
  ],
  [
    'Que se passe-t-il si le renouvellement échoue ?',
    <>
      Vous êtes prévenu par e-mail avec la raison (carte refusée, droit résident expiré…), et vous relancez en un clic
      une fois le problème réglé.
    </>,
  ],
  [
    'Puis-je faire une pause pendant mes vacances ?',
    <>Oui, entre deux dates ou sans date de fin, depuis votre tableau de bord. Rien n'est payé pendant la pause.</>,
  ],
  [
    'Puis-je arrêter à tout moment ?',
    <>Oui, sans engagement, en un clic. Le ticket en cours reste valable jusqu'à sa fin.</>,
  ],
]

const FAQ_TITLE = 'Questions fréquentes.'

function FaqTitle({ as: Tag = 'h1' }: { as?: 'h1' | 'h2' }) {
  return (
    <Tag className="text-center font-heading text-[2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem] lg:text-[3rem]">
      {FAQ_TITLE}
    </Tag>
  )
}

/** One row per item, a hairline between them, "+" turning into "×" when open; one open at a time, its title in bold. */
function Rows({ items, className, openFirst = false }: { items: Question[]; className?: string; openFirst?: boolean }) {
  return (
    <Accordion defaultValue={openFirst ? [items[0][0]] : []} className={cn('border-t border-ink/12', className)}>
      {items.map(([q, a]) => (
        <AccordionItem key={q} value={q} className="border-b border-ink/12 not-last:border-b">
          <AccordionTrigger className="group/q items-center gap-6 rounded-none py-6 text-[1.05rem] font-normal text-ink/70 transition-colors hover:text-ink hover:no-underline focus-visible:ring-0 aria-expanded:font-semibold aria-expanded:text-ink sm:text-[1.15rem] **:data-[slot=accordion-trigger-icon]:hidden">
            <span>{withBrands(q)}</span>
            <Plus
              aria-hidden
              strokeWidth={1.5}
              className="size-5 shrink-0 text-ink transition-transform duration-300 group-aria-expanded/accordion-trigger:rotate-45"
            />
          </AccordionTrigger>
          <AccordionContent className="max-w-[46rem] pb-8 text-[1.02rem] leading-[1.7] text-ink/60 sm:text-[1.08rem]">
            {brandNodes(a)}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

function Faq({ className }: { className?: string }) {
  return <Rows items={QUESTIONS} className={className} />
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
          {TRY_LABEL} <ArrowRight className="size-5" />
        </a>
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}
