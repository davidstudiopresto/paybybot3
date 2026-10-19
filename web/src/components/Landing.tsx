import type { ReactNode } from 'react'
import { ArrowRight, Repeat } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { HostedFooter } from '@/components/Footer'
import { Plate, Wordmark, ZonePlate } from '@/components/signs'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

/** Header of the public pages: logo back home, then "Se connecter" and "S'inscrire". */
function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-3 px-5 pt-6 sm:px-8 sm:pt-8">
      <a href="#/" aria-label="paybybot, accueil" className="shrink-0">
        <Wordmark />
      </a>
      <nav className="flex items-center gap-4 sm:gap-5" aria-label="Compte">
        <a href="#/connexion" className={cn('text-[0.95rem] whitespace-nowrap', ui.link)}>
          Se connecter
        </a>
        <a
          href="#/inscription"
          className="flex h-10 items-center rounded-xl bg-eu px-3.5 text-[0.95rem] font-bold whitespace-nowrap text-white transition hover:bg-eu/90 sm:px-4"
        >
          S'inscrire
        </a>
      </nav>
    </header>
  )
}

const STEPS = [
  ['Connectez PayByPhone', 'Avec vos identifiants habituels. Pas de nouveau compte, pas de nouveau mot de passe.'],
  ['Vérifiez', 'Voiture, zone et carte sont retrouvées dans votre compte PayByPhone. Ajoutez un e-mail si vous voulez.'],
  ["C'est tout", 'Le forfait résident est repayé à chaque échéance, même téléphone éteint.'],
]

/** Public home page: one message, the automatic renewal. */
export function Landing({ hosted }: { hosted: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[34rem] flex-1 px-6 pt-[12vh] pb-20">
        <section className="rise">
          <h1 className={ui.title}>Votre forfait riverain se renouvelle tout seul.</h1>
          <p className={ui.subtitle}>
            paybybot repaie votre forfait résident PayByPhone à chaque échéance. Plus d'oubli, plus d'amende.
          </p>

          {/* What it looks like once set up */}
          <div className="mt-9 rounded-2xl border border-border p-5" aria-hidden>
            <span className="flex items-center gap-3">
              <Plate plate="AB123CD" size="sm" />
              <ZonePlate zone="75017" />
            </span>
            <p className="mt-4 flex items-center gap-2 text-ink/70">
              <Repeat className="size-4 text-eu" /> Renouvelé automatiquement chaque semaine
            </p>
          </div>

          <a href="#/inscription" className={cn('mt-8', ui.primary)}>
            S'inscrire <ArrowRight className="size-5" />
          </a>
          <p className="mt-4 text-center text-sm text-ink/50">
            Déjà inscrit ?{' '}
            <a href="#/connexion" className={ui.link}>
              Se connecter
            </a>
          </p>
        </section>

        <section className="mt-20">
          <h2 className="font-heading text-xl font-bold">Comment ça marche</h2>
          <ol className="mt-5 space-y-5">
            {STEPS.map(([title, text], i) => (
              <li key={title} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-eu/[0.08] font-heading font-bold text-eu">
                  {i + 1}
                </span>
                <span>
                  <strong className="block text-ink">{title}</strong>
                  <span className="text-ink/60">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16">
          <h2 className="font-heading text-xl font-bold">Questions fréquentes</h2>
          <Faq className="mt-3" limit={4} />
          <a href="#/faq" className={cn('mt-4 inline-block text-sm', ui.link)}>
            Toutes les questions
          </a>
        </section>
      </main>

      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}

const QUESTIONS: [string, ReactNode][] = [
  [
    "Quelle différence entre s'inscrire et se connecter ?",
    <>
      Aucune pour vos identifiants : paybybot n'a pas de compte à lui, vous entrez ceux de PayByPhone dans les deux cas.
      « S'inscrire » vous guide ensuite pour activer le renouvellement (voiture, zone, e-mail). « Se connecter » ouvre
      directement votre tableau de bord.
    </>,
  ],
  [
    'Quelles informations me demandez-vous ?',
    <>
      Rien de ce que PayByPhone sait déjà : votre numéro, vos voitures et votre carte viennent de votre compte, et votre
      zone de votre historique de stationnement. Il ne reste qu'un e-mail, facultatif, pour les confirmations. Si votre
      zone est introuvable, on vous demande votre adresse, seulement pour la retrouver : elle n'est pas conservée.
    </>,
  ],
  [
    'Pourquoi mes identifiants PayByPhone ?',
    <>
      Pour payer à votre place, paybybot passe par votre compte PayByPhone, comme l'application. Votre mot de passe
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
      Vous recevez un e-mail (si vous en avez donné un) et le tableau de bord vous le signale. Dans le doute, paybybot ne
      repaie jamais à l'aveugle : vous ne payez pas deux fois.
    </>,
  ],
  [
    'Est-ce un service officiel de PayByPhone ?',
    <>Non. paybybot est un service indépendant, édité par Studio Presto, qui utilise votre compte PayByPhone.</>,
  ],
]

function Faq({ className, limit }: { className?: string; limit?: number }) {
  return (
    <Accordion className={cn('border-y border-border', className)}>
      {QUESTIONS.slice(0, limit).map(([q, a]) => (
        <AccordionItem key={q} value={q} className="border-border">
          <AccordionTrigger className="py-4 text-base font-bold text-ink hover:no-underline">{q}</AccordionTrigger>
          <AccordionContent className="pb-4 text-[0.98rem] leading-relaxed text-ink/70">{a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

export function FaqView({ hosted }: { hosted: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[34rem] flex-1 px-6 pt-14 pb-20">
        <h1 className={cn('rise', ui.title)}>Questions fréquentes</h1>
        <Faq className="mt-8" />
        <a href="#/inscription" className={cn('mt-10', ui.primary)}>
          S'inscrire <ArrowRight className="size-5" />
        </a>
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}
