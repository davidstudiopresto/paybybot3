import { cn } from '@/lib/utils'

const LINKS = [
  ['#/securite', 'Sécurité et données'],
  ['#/confidentialite', 'Confidentialité'],
  ['#/cgu', "Conditions d'utilisation"],
  ['#/mentions-legales', 'Mentions légales'],
]

/** Legal links everywhere. */
export function HostedFooter({ className }: { className?: string; hosted?: boolean }) {
  return (
    <footer className={cn('space-y-2 text-center text-sm text-muted-foreground', className)}>
      <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1" aria-label="Informations">
        {LINKS.map(([href, label]) => (
          <a key={href} href={href} className="underline-offset-4 hover:text-ink hover:underline">
            {label}
          </a>
        ))}
      </nav>
      <p>© PayByBot 2026</p>
    </footer>
  )
}
