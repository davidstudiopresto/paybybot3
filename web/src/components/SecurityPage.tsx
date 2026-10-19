import type { ReactNode } from 'react'
import { ArrowRight, Building2, KeyRound, Lock, ShieldCheck } from 'lucide-react'
import { HostedFooter } from '@/components/Footer'
import { LEGAL_PAGES, LEGAL_UPDATED, PUBLISHER, SecurityDetails } from '@/components/Legal'
import { TopBar } from '@/components/TopBar'
import { cn } from '@/lib/utils'

/** Small uppercase label above a section title. */
function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p className={cn('text-xs font-semibold tracking-[0.18em] uppercase', dark ? 'text-white/55' : 'text-eu')}>{children}</p>
  )
}

const sectionTitle = 'mt-3 font-heading text-[2rem] leading-[1.08] font-semibold tracking-[-0.03em] text-ink sm:text-[2.5rem]'

/** Hero emblem: what protects the data, drawn like a seal (no certification is claimed). */
function Emblem() {
  return (
    <div className="relative mx-auto mt-12 grid w-full max-w-[34rem] grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8" aria-hidden>
      <div className="space-y-6 text-right text-[0.7rem] font-semibold tracking-[0.14em] text-white/50 uppercase">
        <p>Chiffrement</p>
        <p>Transport</p>
      </div>
      <div className="relative grid size-36 place-items-center sm:size-44">
        <div className="absolute inset-0 rounded-full border border-white/15" />
        <div className="absolute inset-3 rounded-full border border-white/25" />
        <div className="absolute inset-0 -m-6 rounded-[2rem] border border-dashed border-white/10" />
        <div className="text-center">
          <Lock className="mx-auto size-6 text-white/80" strokeWidth={1.5} />
          <p className="mt-2 font-heading text-2xl font-semibold tracking-tight text-white sm:text-3xl">AES</p>
          <p className="text-[0.7rem] tracking-[0.2em] text-white/60 uppercase">+ HMAC</p>
        </div>
      </div>
      <div className="space-y-6 text-[0.7rem] font-semibold tracking-[0.14em] text-white/50 uppercase">
        <p>Clés séparées</p>
        <p>HTTPS · HSTS</p>
      </div>
    </div>
  )
}

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
  ['Géoplateforme (IGN)', 'Recherche d’adresse', 'France', 'Service public'],
]

/** The security page, laid out like a trust page: seal, practice, framework, sub-processors, then the details. */
export function SecurityPage({ hosted }: { hosted: boolean }) {
  return (
    <div className="min-h-dvh bg-white">
      <TopBar>
        <a href="#/connexion" className="inline-flex h-9 items-center rounded-full bg-ink/[0.06] px-3 text-sm font-semibold whitespace-nowrap text-ink transition hover:bg-ink/[0.1] sm:h-10 sm:px-4 sm:text-[0.95rem]">
          Se connecter
        </a>
      </TopBar>

      <section className="bg-[#0d1830] px-6 pt-16 pb-20 text-center sm:pt-20">
        <Eyebrow dark>La confiance se construit</Eyebrow>
        <h1 className="mt-4 font-heading text-[2.4rem] leading-[1.05] font-semibold tracking-[-0.035em] text-white sm:text-[3.4rem]">
          Sécurité et données
        </h1>
        <p className="mx-auto mt-4 max-w-[34rem] text-[1.05rem] text-white/65 sm:text-lg">
          Votre mot de passe n’est jamais stocké. Vos données sont chiffrées, hébergées à Paris, et effacées dès que vous
          arrêtez.
        </p>
        <Emblem />
        <p className="mt-12 inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-sm text-white/80">
          <ShieldCheck className="size-4" /> Conçu selon les principes du RGPD
        </p>
      </section>

      <main className="mx-auto max-w-6xl px-6 pb-20 sm:px-8">
        <section className="pt-20">
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

        <section className="pt-20">
          <Eyebrow>Transparence</Eyebrow>
          <h2 className={sectionTitle}>Le détail, sans rien cacher.</h2>
          <div className="max-w-3xl">
            <SecurityDetails />
          </div>
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
