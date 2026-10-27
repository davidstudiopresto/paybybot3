import { HostedFooter } from '@/components/Footer'
import { PayByBot, PayByPhone } from '@/components/signs'
import { PublicTopBar } from '@/components/TopBar'
import { TRY_LABEL, ui } from '@/lib/styles'
import { cn } from '@/lib/utils'

const STEPS = [
  [
    'Connectez votre compte PayByPhone',
    <>
      Avec le numéro et le mot de passe de votre compte <PayByPhone />. Votre mot de passe n’est jamais enregistré : <PayByBot />{' '}
      retrouve seul vos véhicules, votre zone résidentielle et votre carte bancaire.
    </>,
  ],
  [
    'Activez le renouvellement',
    <>
      Un interrupteur par véhicule. <PayByBot /> vérifie d’abord que votre tarif résident est actif et que votre carte peut payer.
    </>,
  ],
  [
    'Votre ticket se renouvelle chaque semaine',
    <>
      La veille de la fin du ticket en cours, la semaine suivante est payée sur <PayByPhone />, au tarif habituel, avec votre
      carte. Un e-mail confirme chaque paiement.
    </>,
  ],
] as const

const CONTROL = [
  ['Pause', 'Mettez le renouvellement en pause pendant vos vacances : il reprend seul à la date choisie.'],
  ['Arrêt', 'Coupez l’interrupteur à tout moment. Le ticket en cours reste valable jusqu’à sa fin.'],
  ['Alerte', 'Si un paiement échoue (carte expirée, refus de la banque), vous êtes prévenu par e-mail avec la cause.'],
] as const

/** « Comment ça marche », in the top bar: three numbered steps and what stays in the user's hands, text only. */
export function HowPage({ hosted, signedIn = false }: { hosted: boolean; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-ink">
      <PublicTopBar signedIn={signedIn} />
      <main className="mx-auto w-full max-w-[40rem] flex-1 px-6 pt-16 pb-20 sm:pt-20">
        <h1 className={ui.title}>Comment ça marche</h1>
        <p className={ui.subtitle}>
          Trois étapes, une seule fois. Ensuite, <PayByBot /> s’occupe de votre stationnement résident.
        </p>

        <ol className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex items-baseline gap-6 py-7">
              {/* On the title's baseline: the number and the title read as one line. */}
              <span className="w-6 shrink-0 font-heading text-[1.6rem] leading-snug font-medium text-eu tabular-nums">{i + 1}</span>
              <div>
                <h2 className="font-heading text-[1.2rem] leading-snug font-semibold tracking-[-0.01em]">{title}</h2>
                <p className="mt-2 leading-relaxed text-ink/65">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="mt-14 text-sm font-semibold text-ink/50">Vous gardez la main</h2>
        <dl className="mt-4 space-y-3">
          {CONTROL.map(([term, text]) => (
            <div key={term} className="leading-relaxed">
              <dt className="inline font-semibold">{term}. </dt>
              <dd className="inline text-ink/65">{text}</dd>
            </div>
          ))}
        </dl>

        {!signedIn && (
          <a href="#/inscription" className={cn(ui.primary, 'mt-14 h-12 w-full text-base sm:w-fit sm:px-8')}>
            {TRY_LABEL}
          </a>
        )}
      </main>
      <HostedFooter className="px-6 pb-8" hosted={hosted} />
    </div>
  )
}
