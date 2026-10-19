import { cn } from '@/lib/utils'

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
      {hosted && (
        <p className="flex items-center justify-center gap-1.5">
          <svg viewBox="0 0 76 65" className="size-3" aria-hidden>
            <path d="M37.5 0 75 65H0z" fill="currentColor" />
          </svg>
          Hébergé sur Vercel, à Paris
        </p>
      )}
    </footer>
  )
}
