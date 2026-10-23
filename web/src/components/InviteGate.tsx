import { Home } from '@/components/Landing'

/** Private access: without the shared link, the home page stays blurred with only the name in the middle. */
export function InviteGate({ hosted }: { hosted: boolean; invalid?: boolean }) {
  return (
    <div className="relative h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none blur-[16px] select-none">
        <Home hosted={hosted} />
      </div>
      <div className="absolute inset-0 grid place-items-center bg-white/60">
        <h1 className="rise font-heading text-[3rem] leading-none font-semibold tracking-[-0.03em] text-ink sm:text-[4rem]">
          Pay
          <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">By</span>
          Bot
        </h1>
      </div>
    </div>
  )
}
