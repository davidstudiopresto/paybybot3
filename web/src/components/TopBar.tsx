import type { ReactNode } from 'react'
import { Wordmark } from '@/components/signs'
import { TRY_LABEL, ui } from '@/lib/styles'

/** The bar on top of every page: logo on the left, links in the middle (if any), actions on the right. */
export function TopBar({ center, children }: { center?: ReactNode; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink/10 bg-white/90 backdrop-blur-md">
      <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-8">
        <a href="#/" aria-label="PayByBot, accueil" className="shrink-0 justify-self-start">
          <Wordmark />
        </a>
        <nav className="flex items-center gap-1 sm:gap-3" aria-label="Pages">
          {center}
        </nav>
        {children ? <div className="flex items-center gap-2 justify-self-end sm:gap-2.5">{children}</div> : <span />}
      </div>
    </header>
  )
}

const navLink = 'hidden px-2 text-[0.95rem] font-medium text-ink/70 transition hover:text-ink sm:inline'

/** The same top bar on every public page (home, FAQ, security, legal, login, sign-up): nothing moves. */
export function PublicTopBar({ signedIn = false }: { signedIn?: boolean }) {
  return (
    <TopBar
      center={
        <>
          <a href="#/tarifs" className={navLink}>
            Tarifs
          </a>
          <a href="#/faq" className={navLink}>
            FAQ
          </a>
          <a href="#/securite" className={navLink}>
            Sécurité
          </a>
          <a href="#/demo" className={navLink}>
            Démo
          </a>
        </>
      }
    >
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
            <span className="hidden sm:inline">{TRY_LABEL}</span>
            <span className="sm:hidden">S'inscrire</span>
          </a>
        </>
      )}
    </TopBar>
  )
}
