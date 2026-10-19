import type { ReactNode } from 'react'
import { Wordmark } from '@/components/signs'
import { cn } from '@/lib/utils'
import { ui } from '@/lib/styles'

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

const navLink = 'hidden px-2 text-[0.95rem] font-medium text-ink/70 transition hover:text-ink sm:inline'

/** The same top bar on every public page (home, FAQ, security, legal, login, sign-up): nothing moves. */
export function PublicTopBar({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <TopBar>
      <a href="#/faq" className={navLink}>
        FAQ
      </a>
      <a href="#/securite" className={navLink}>
        Sécurité
      </a>
      <a href="#/demo" className={cn(navLink, 'mr-2')}>
        Démo
      </a>
      {signedIn ? (
        <a href="#/" className={ui.pillBlue}>
          Mon tableau de bord
        </a>
      ) : (
        <>
          <a href="#/connexion" className={ui.pillGray}>
            Se connecter
          </a>
          <a href="#/inscription" className={ui.pillBlue}>
            S'inscrire
          </a>
        </>
      )}
    </TopBar>
  )
}
