import type { ReactNode } from 'react'
import { Wordmark } from '@/components/signs'

/** The bar on top of every page: logo, a hairline underneath, actions on the right. */
export function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-white/90 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between gap-2 px-4 sm:px-8">
        <a href="#/" aria-label="PaybyBot, accueil" className="shrink-0">
          <Wordmark />
        </a>
        {children && <nav className="flex items-center gap-2 sm:gap-2.5">{children}</nav>}
      </div>
    </header>
  )
}
