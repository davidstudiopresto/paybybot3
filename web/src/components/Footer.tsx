import { cn } from '@/lib/utils'

const REPO_URL = 'https://github.com/davidstudiopresto/paybybot3/tree/web-interface'

/** Shown on the online version only: who hosts it and where the code is. */
export function HostedFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-muted-foreground', className)}>
      <span className="inline-flex items-center gap-1.5">
        <svg viewBox="0 0 76 65" className="size-3" aria-hidden>
          <path d="M37.5 0 75 65H0z" fill="currentColor" />
        </svg>
        Hébergé sur Vercel
      </span>
      <span aria-hidden>·</span>
      <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-ink hover:underline">
        Projet open source
      </a>
      <span aria-hidden>·</span>
      <span>Service non officiel, indépendant de PayByPhone</span>
    </footer>
  )
}
