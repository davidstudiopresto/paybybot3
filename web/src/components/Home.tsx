import { useEffect } from 'react'
import { ChevronRight } from 'lucide-react'

/** A brush stroke under the link, drawn by hand rather than a CSS underline. */
function BrushUnderline() {
  return (
    <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="absolute -bottom-2 left-0 h-3 w-full" aria-hidden>
      <path
        d="M2 8.5c18-2.6 36-3.4 54-2.6 14 .6 26 2.7 40 2.4 22-.5 44-4.3 66-4 12 .2 24 1.6 36 3.2"
        fill="none"
        stroke="#d8cbbd"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M6 10.5c26-2 52-2.2 78-.6 30 1.8 62 .4 92-2.6"
        fill="none"
        stroke="#e6dbcf"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  )
}

/** The home page: one sentence and one link, like a note on white paper. */
export function Home() {
  // Nothing else on this page: not even the chat button.
  useEffect(() => {
    document.body.classList.add('home-page')
    return () => document.body.classList.remove('home-page')
  }, [])
  return (
    <div className="flex min-h-dvh flex-col bg-white px-6 py-8 text-[#1c1b19] sm:px-12 sm:py-12">
      <header className="rise">
        {/* The logo in the page's serif, « By » in PayByBot's blue. */}
        <span className="font-serif text-[1.6rem] leading-none font-medium tracking-[-0.01em]">
          Pay<span className="text-[var(--eu)]">By</span>Bot
        </span>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16 sm:justify-start sm:pt-[18vh]">
        <h1 className="rise font-serif text-[1.95rem] leading-[1.2] font-normal tracking-[-0.012em] sm:text-[2.75rem] [animation-delay:80ms]">
          {/* Three lines on a computer; on a phone the sentence just flows. */}
          Renouvellement automatique <br className="hidden sm:block" />
          de votre stationnement résident <br className="hidden sm:block" />
          sur PayByPhone
        </h1>

        <a
          href="#/connexion"
          className="rise group mt-12 inline-flex w-fit items-center gap-1.5 font-serif text-[1.55rem] sm:text-[1.8rem] [animation-delay:160ms]"
        >
          <span className="relative">
            Se connecter
            <BrushUnderline />
          </span>
          <ChevronRight className="size-5 translate-y-[1px] transition-transform group-hover:translate-x-1" strokeWidth={1.75} />
        </a>
      </main>

      <footer className="rise flex flex-wrap gap-x-8 gap-y-2 text-[0.92rem] text-[#1c1b19]/80 [animation-delay:240ms]">
        <span>© 2026 PayByBot</span>
        <a href="#/confidentialite" className="hover:text-[#1c1b19]">
          Confidentialité
        </a>
        <a href="#/cgu" className="hover:text-[#1c1b19]">
          Conditions d’utilisation
        </a>
        <a href="#/mentions-legales" className="hover:text-[#1c1b19]">
          Mentions légales
        </a>
      </footer>
    </div>
  )
}
