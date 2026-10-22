import type { ReactNode } from 'react'
import { ArrowRight, Building2, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { HostedFooter } from '@/components/Footer'
import { LEGAL_PAGES, LEGAL_UPDATED, PUBLISHER } from '@/components/Legal'
import { PublicTopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'

/** Small uppercase label above a section title. */
function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={cn('text-xs font-semibold tracking-[0.18em] uppercase', dark ? 'text-white/55' : 'text-eu')}>{children}</p>
  )
}

const sectionTitle = 'mt-3 font-heading text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-ink sm:text-[2.5rem]'

const PRACTICE = [
  [Lock, 'Chiffrement', 'AES-128 avec signature HMAC-SHA256, une clé distincte par usage. HTTPS imposé partout (HSTS).'],
  [Building2, 'Hébergement en UE', 'Application et base de données hébergées à Paris, dans l’Union européenne.'],
  [KeyRound, 'Zéro mot de passe stocké', 'Seul un jeton de connexion chiffré est utilisé, effacé au bout de 24 h au plus.'],
  [ShieldCheck, 'Accès verrouillé', 'Base de données fermée, tentatives de connexion limitées, requêtes d’autres sites refusées.'],
] as const

const FRAMEWORK: { title: string; icon: typeof Lock; rows: [string, ReactNode][] }[] = [
  {
    title: 'Chiffrement',
    icon: Lock,
    rows: [
      ['Algorithme', 'AES-128-CBC + HMAC-SHA256'],
      ['Clés', 'Une par usage, rotation possible'],
      ['Transport', 'HTTPS (TLS), HSTS 2 ans'],
      ['Mots de passe', 'Jamais stockés'],
    ],
  },
  {
    title: 'RGPD',
    icon: ShieldCheck,
    rows: [
      ['Responsable', `${PUBLISHER.name}, Paris`],
      ['Hébergement', 'Union européenne (Paris)'],
      ['Droits garantis', 'Accès, rectification, effacement, portabilité'],
      ['Réclamation', 'Auprès de la CNIL'],
    ],
  },
]

const SUBPROCESSORS = [
  ['Vercel', 'Hébergement de l’application', 'Paris (UE)', 'ISO 27001, SOC 2'],
  ['Supabase', 'Base de données des renouvellements', 'Paris (UE)', 'SOC 2'],
  ['Resend', 'E-mails de confirmation', 'Irlande (UE)', 'SOC 2'],
]

/** The security page, laid out like a trust page: seal, practice, framework, sub-processors, then the details. */
export function SecurityPage({ hosted, signedIn = false }: { hosted: boolean; signedIn?: boolean }) {
  return (
    <div className="min-h-dvh bg-white">
      <PublicTopBar signedIn={signedIn} />

      <header className="mx-auto max-w-6xl px-6 pt-16 sm:px-8 lg:pt-24">
        <h1 className="rise font-heading text-[2.4rem] leading-[1.05] font-medium tracking-[-0.035em] text-ink sm:text-[3.4rem]">
          Sécurité et données
        </h1>
        <p className="mt-4 max-w-[38rem] text-[1.05rem] text-ink/60 sm:text-lg">
          Votre mot de passe n’est jamais stocké. Vos données sont chiffrées, hébergées à Paris, et effacées dès que vous
          arrêtez.
        </p>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 sm:px-8">
        <section className="pt-16">
          <Eyebrow>Protection des données</Eyebrow>
          <h2 className={sectionTitle}>La sécurité, concrètement.</h2>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PRACTICE.map(([Icon, title, text]) => (
              <li key={title} className="rounded-2xl border border-ink/10 p-6">
                <span className="grid size-10 place-items-center rounded-xl bg-eu/[0.08] text-eu">
                  <Icon className="size-5" />
                </span>
                <strong className="mt-5 block text-lg font-semibold text-ink">{title}</strong>
                <span className="mt-2 block text-[0.95rem] leading-relaxed text-ink/60">{text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-20">
          <Eyebrow>Un cadre clair</Eyebrow>
          <h2 className={sectionTitle}>Conformité</h2>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {FRAMEWORK.map(({ title, icon: Icon, rows }) => (
              <div key={title} className="rounded-2xl border border-ink/10 bg-ink/[0.015] p-6 sm:p-8">
                <p className="flex items-center gap-3 font-heading text-xl font-semibold text-ink">
                  <Icon className="size-5 text-eu" /> {title}
                </p>
                <dl className="mt-6 divide-y divide-ink/10 border-t border-ink/10">
                  {rows.map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-6 py-3.5 text-[0.95rem]">
                      <dt className="text-ink/55">{k}</dt>
                      <dd className="text-right font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-20">
          <Eyebrow>Notre écosystème</Eyebrow>
          <h2 className={sectionTitle}>Sous-traitants</h2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-ink/10">
            <table className="w-full min-w-[40rem] text-left text-[0.95rem]">
              <thead className="bg-ink/[0.03] text-sm text-ink/55">
                <tr>
                  {['Sous-traitant', 'Rôle', 'Localisation', 'Certifications'].map((h) => (
                    <th key={h} className="px-5 py-3.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {SUBPROCESSORS.map(([name, role, where, certs]) => (
                  <tr key={name}>
                    <td className="px-5 py-4 font-semibold text-ink">{name}</td>
                    <td className="px-5 py-4 text-ink/70">{role}</td>
                    <td className="px-5 py-4 text-ink/70">{where}</td>
                    <td className="px-5 py-4 text-ink/70">{certs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-ink/45">Certifications détenues par chaque prestataire.</p>
        </section>


        <section className="mt-20 flex flex-col gap-6 rounded-3xl border border-ink/10 bg-ink/[0.02] p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
          <div>
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">Une question sur la sécurité ?</h2>
            <p className="mt-2 max-w-[32rem] text-ink/60">
              Pour toute question sur la sécurité ou la protection de vos données, écrivez-nous.
            </p>
          </div>
          <a
            href={`mailto:${PUBLISHER.email}`}
            className="inline-flex items-center gap-3 self-start font-semibold text-eu sm:self-center"
          >
            {PUBLISHER.email}
            <span className="grid size-11 place-items-center rounded-full border border-eu/40">
              <ArrowRight className="size-5" />
            </span>
          </a>
        </section>

        <nav className="mt-16 flex flex-wrap gap-2" aria-label="Pages d'information">
          {LEGAL_PAGES.map((p) => (
            <a
              key={p.id}
              href={`#/${p.id}`}
              aria-current={p.id === 'securite' ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm font-semibold transition',
                p.id === 'securite' ? 'border-eu bg-eu text-white' : 'border-ink/15 text-ink/70 hover:border-ink/40',
              )}
            >
              {p.label}
            </a>
          ))}
        </nav>
        <p className="mt-4 text-sm text-ink/45">Mise à jour : {LEGAL_UPDATED}</p>
        <HostedFooter className="mt-12" hosted={hosted} />
      </main>
    </div>
  )
}
