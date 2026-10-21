import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight, ChevronDown, Plus } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { PublicTopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'
import { brandNodes, PayByBot, PayByPhone, withBrands, withPayByPhone } from '@/components/signs'



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
  ['Julie M.', 'J’oubliais toujours le ticket résident. Là, ça se renouvelle tout seul.'],
  ['Thomas B.', 'Ma voiture bouge peu et j’oubliais de renouveler. Plus maintenant.'],
  ['Sarah L.', 'Ça fait le boulot, rien à redire.'],
  ['Nicolas R.', 'Mon rappel sonnait au boulot, je l’oubliais. L’automatique règle ça.'],
  ['Camille D.', 'Enfin ! Depuis le temps que je voulais automatiser ce truc.'],
  ['Antoine P.', 'Pris après une énième amende pour un ticket oublié. Plus jamais.'],
  ['Léa F.', 'Avec mon conjoint, chacun croyait que l’autre l’avait fait. Plus maintenant.'],
  ['Marc V.', 'J’ai vérifié les premières fois : le ticket était bien pris. Je laisse faire.'],
]

function Testimonials() {
  if (!TESTIMONIALS.length) return null
  const card = (name: string, text: string, key: string, copy = false) => (
    <li key={key} aria-hidden={copy || undefined} className="w-[22rem] shrink-0 rounded-2xl border border-ink/10 bg-ink/[0.02] p-6">
      <p className="font-semibold text-ink">{name}</p>
      <p title={text} className="mt-3 line-clamp-2 leading-relaxed text-ink/70">{withPayByPhone(text)}</p>
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

      {/* Centered hero filling the window on a computer (under the 4rem top bar): the kicker as a pill, the title on
          two lines (the first in the brand gradient), then the call to action. */}
      <section className="rise relative w-full overflow-hidden bg-[radial-gradient(60rem_30rem_at_50%_0%,color-mix(in_srgb,var(--eu)_7%,transparent),transparent)] px-6 pt-14 sm:px-8 lg:flex lg:min-h-[calc(100dvh-4rem)] lg:items-center lg:py-20">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center text-center">
          <p className="mb-8 inline-flex max-w-full items-center gap-2.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-[0.7rem] font-medium tracking-[0.12em] text-ink/80 uppercase shadow-[0_1px_2px_rgb(11_16_36/0.06)] sm:text-[0.78rem] lg:mb-10">
            <span className="size-2 shrink-0 rounded-full bg-eu" aria-hidden />
            100 % automatique • Même téléphone éteint • Plus besoin d’y penser
          </p>
          <h1 className="font-heading text-[2.4rem] leading-[1.08] font-bold tracking-[-0.04em] text-[#2b2f3a] sm:text-[3.4rem] lg:text-[clamp(3.5rem,min(5.6vw,9vh),5.5rem)]">
            <span className="block bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">Renouvellement automatique</span>
            <span className="block">de votre stationnement résident</span>
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
            Essayer gratuitement <ArrowRight className="size-5" />
          </a>
          <p className="mt-4 text-sm text-ink/50">
            Déjà inscrit ?{' '}
            <a href="#/connexion" className={ui.link}>
              Se connecter
            </a>
          </p>
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
            Comment ça marche
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

type Question = [string, ReactNode]

const QUESTIONS: Question[] = [
  [
    'Que fait PayByBot exactement ?',
    <>
      PayByBot renouvelle chaque semaine votre stationnement résident sur votre compte <PayByPhone />. Vous l'activez une
      fois, puis chaque nouvelle semaine est payée avant la fin de la précédente : votre véhicule reste couvert sans
      que vous ayez à y penser.
    </>,
  ],
  [
    'Quelle différence avec PayByPhone ?',
    <>
      <PayByPhone /> vend le stationnement résident, PayByBot le renouvelle pour vous au bon moment. Il reste sur votre
      compte <PayByPhone />, payé avec la carte que vous y avez enregistrée.
    </>,
  ],
  [
    'Le stationnement résident coûte-t-il plus cher ?',
    <>Non. Il est payé à <PayByPhone /> au même prix que si vous le preniez vous-même dans l'application.</>,
  ],
  [
    'Mon téléphone doit-il rester allumé ?',
    <>Non. Le renouvellement part de nos serveurs : votre téléphone peut être éteint ou sans réseau.</>,
  ],
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
    'Quand mon stationnement résident est-il payé ?',
    <>
      La veille de la fin de la semaine en cours, en la prolongeant d'une semaine. Si <PayByPhone /> ne permet pas de
      la prolonger, la nouvelle semaine est achetée dès qu'elle se termine.
    </>,
  ],
  [
    'Comment savoir que c’est fait ?',
    <>
      Vous recevez un e-mail à chaque paiement, et le stationnement résident apparaît dans votre application{' '}
      <PayByPhone /> comme si vous l'aviez pris vous-même.
    </>,
  ],
  [
    'Quelles informations me demandez-vous ?',
    <>PayByBot récupère uniquement les informations de votre compte <PayByPhone />.</>,
  ],
  [
    'Quels stationnements PayByBot renouvelle-t-il ?',
    <>
      Le stationnement résident à la semaine, à Paris. Les autres tarifs (professionnel, handicap, deux-roues électrique…)
      ne sont pas proposés pour l'instant.
    </>,
  ],
  [
    'Pour quels véhicules ?',
    <>
      Voiture, deux-roues ou utilitaire : tout véhicule de votre compte <PayByPhone /> qui a le tarif résident.
    </>,
  ],
  [
    "Et des tickets à l'heure ou à la journée ?",
    <>Pas pour le moment : PayByBot renouvelle uniquement le forfait résident à la semaine.</>,
  ],
  ['Dans quelles villes ?', <>À Paris, dans les 20 arrondissements, pour le moment.</>],
  [
    'Puis-je activer avec un stationnement résident déjà en cours ?',
    <>
      Oui. Rien n'est payé en double : PayByBot attend la veille de la fin de la semaine en cours pour payer la
      suivante.
    </>,
  ],
  [
    'Et si j’ai plusieurs véhicules ?',
    <>
      Cochez-les au moment d'activer le renouvellement. Chaque véhicule a son propre renouvellement, que vous gérez à
      part.
    </>,
  ],
  [
    'Et si je change de véhicule ou de zone ?',
    <>
      Mettez d'abord à jour votre véhicule ou votre carte résident dans <PayByPhone />, puis arrêtez et réactivez le
      renouvellement dans PayByBot. Le prix de votre abonnement suit votre nouvelle situation.
    </>,
  ],
  [
    'Et si je pars en vacances ?',
    <>
      Mettez le renouvellement en pause entre deux dates depuis votre tableau de bord : aucun stationnement n'est
      payé pendant la pause, et tout reprend seul à la fin.
    </>,
  ],
  [
    'Puis-je faire une pause sans date de fin ?',
    <>
      Oui : cochez « Pas de date de fin pour le moment ». Le renouvellement reste en pause jusqu'à ce que vous le
      relanciez.
    </>,
  ],
  [
    'Puis-je programmer une pause à l’avance ?',
    <>
      Oui, choisissez simplement sa date de début. Une semaine déjà payée avant le début de la pause reste due.
    </>,
  ],
  [
    'Comment arrêter ?',
    <>
      Depuis le tableau de bord, « Gérer » puis « Arrêter le renouvellement ». Le stationnement en cours reste valable jusqu'à
      sa fin, et ce qui était gardé pour ce renouvellement est effacé.
    </>,
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
    'Pourquoi mon mot de passe PayByPhone ?',
    <>
      Pour renouveler votre stationnement résident, PayByBot se connecte à votre compte <PayByPhone />. Le mot de passe ne sert qu'à
      cette connexion et n'est jamais enregistré : seule une clé de reconnexion est gardée, chiffrée, et effacée dès
      que vous arrêtez.
    </>,
  ],
  [
    'PayByBot voit-il ma carte bancaire ?',
    <>
      Non. Votre carte est enregistrée chez <PayByPhone />, qui fait le paiement. PayByBot n'en voit que les derniers
      chiffres, comme dans l'application, et ne garde aucun numéro.
    </>,
  ],
  [
    'Je préfère ne pas confier mon mot de passe',
    <>
      Si vous utilisez le même mot de passe ailleurs, changez d'abord celui de <PayByPhone /> : vous ne confierez ainsi
      que l'accès à ce compte.
    </>,
  ],
  [
    'J’ai oublié mon mot de passe PayByPhone',
    <>Réinitialisez-le dans l'application ou sur le site <PayByPhone />, puis connectez-vous à PayByBot avec le nouveau.</>,
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
              {withBrands(q)}
            </span>
            <Plus
              aria-hidden
              strokeWidth={1.5}
              className="size-5 shrink-0 text-ink transition-transform duration-300 group-aria-expanded/accordion-trigger:rotate-45"
            />
          </AccordionTrigger>
          <AccordionContent className="max-w-[46rem] pb-8 text-[1.02rem] leading-[1.7] text-ink/75 sm:text-[1.08rem]">
            {brandNodes(a)}
          </AccordionContent>
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
