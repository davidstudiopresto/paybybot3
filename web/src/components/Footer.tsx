import { cn } from '@/lib/utils'

const REPO_URL = 'https://github.com/davidstudiopresto/paybybot3/tree/web-interface'
const LINKS = [
  ['#/securite', 'Sécurité et données'],
  ['#/confidentialite', 'Confidentialité'],
  ['#/cgu', "Conditions d'utilisation"],
  ['#/mentions-legales', 'Mentions légales'],
]

/** Legal links everywhere; on the online version, also who hosts it. */
export function HostedFooter({ className, hosted = true }: { className?: string; hosted?: boolean }) {
  return (
    <footer className={cn('space-y-2 text-center text-sm text-muted-foreground', className)}>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="Informations">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className="underline-offset-4 hover:text-ink hover:underline">
            {label}
          </a>
        ))}
      </nav>
      <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {hosted && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <svg viewBox="0 0 76 65" className="size-3" aria-hidden>
                <path d="M37.5 0 75 65H0z" fill="currentColor" />
              </svg>
              Hébergé sur Vercel, à Paris
            </span>
            <span aria-hidden>·</span>
          </>
        )}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
          Projet open source
        </a>
        <span aria-hidden>·</span>
        <span>Service non officiel, indépendant de PayByPhone</span>
      </p>
    </footer>
  )
}
