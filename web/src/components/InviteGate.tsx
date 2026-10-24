import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { Home } from '@/components/Landing'
import { LogoMark, PayByBot } from '@/components/signs'
import { cn } from '@/lib/utils'

/** The logo, large, and the one rule: PayByBot opens through a user's link only. */
function GateMessage({ invalid = false, welcomed = false }: { invalid?: boolean; welcomed?: boolean }) {
  return (
    <div className="flex max-w-xl flex-col items-center px-6 text-center">
      <span className="inline-flex items-center gap-3 font-heading text-[2.6rem] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[3.2rem]">
        <LogoMark className="size-12 sm:size-14" />
        <span>
          Pay
          <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">By</span>
          Bot
        </span>
      </span>
      <p className="mt-8 font-heading text-[1.5rem] leading-[1.15] font-medium tracking-[-0.025em] text-ink sm:text-[1.8rem]">
        Fonctionne uniquement sur parrainage
      </p>
      <p className="mt-3 text-[1.05rem] leading-relaxed text-ink/60">
        {welcomed ? (
          <span className="inline-flex items-center gap-2 font-medium text-[#3d7f84]">
            <Check className="size-5" /> Lien de parrainage reconnu, bienvenue.
          </span>
        ) : invalid ? (
          'Ce lien de parrainage n’est pas valable. Demandez le sien à un proche qui utilise déjà PayByBot.'
        ) : (
          <>
            Demandez son lien à un proche qui utilise déjà <PayByBot />.
          </>
        )}
      </p>
    </div>
  )
}

/** Public link (no valid code): the home page stays blurred behind the logo and the rule, no way in. */
export function InviteGate({ hosted, invalid = false }: { hosted: boolean; invalid?: boolean }) {
  return (
    <div className="relative h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none blur-[18px] select-none">
        <Home hosted={hosted} />
      </div>
      <div className="rise absolute inset-0 grid place-items-center bg-white/70">
        <GateMessage invalid={invalid} />
      </div>
    </div>
  )
}

/** Private link (a valid code, just opened): the same screen over the real site, which then lifts away. */
export function InviteCurtain() {
  const [phase, setPhase] = useState<'shown' | 'lifting' | 'gone'>('shown')
  useEffect(() => {
    const lift = setTimeout(() => setPhase('lifting'), 1600)
    const gone = setTimeout(() => setPhase('gone'), 1600 + 900)
    return () => {
      clearTimeout(lift)
      clearTimeout(gone)
    }
  }, [])
  if (phase === 'gone') return null
  return (
    <div
      aria-hidden={phase === 'lifting'}
      className={cn(
        'fixed inset-0 z-[60] grid place-items-center bg-white/80 backdrop-blur-[18px] transition-transform duration-[900ms] ease-[cubic-bezier(.7,0,.2,1)] motion-reduce:transition-none',
        phase === 'lifting' && '-translate-y-full',
      )}
    >
      <GateMessage welcomed />
    </div>
  )
}
