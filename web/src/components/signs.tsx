import { cn } from '@/lib/utils'

/** French licence plate: white field, blue EU band with the country letter. */
export function Plate({ plate, size = 'md', className }: { plate: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const formatted = /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(plate)
    ? `${plate.slice(0, 2)}-${plate.slice(2, 5)}-${plate.slice(5)}`
    : plate
  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-[6px] border-2 border-ink bg-white font-heading font-extrabold tracking-[0.06em] text-ink shadow-[0_2px_0_var(--ink)]',
        size === 'sm' && 'h-7 text-sm',
        size === 'md' && 'h-10 text-xl',
        size === 'lg' && 'h-14 text-3xl',
        className,
      )}
    >
      <span className={cn('flex flex-col items-center justify-end bg-eu pb-0.5 text-white', size === 'sm' ? 'w-4' : 'w-6')}>
        <svg viewBox="0 0 20 20" className={size === 'sm' ? 'size-2.5' : 'size-3.5'} aria-hidden>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <circle key={i} cx={10 + 7 * Math.cos(a)} cy={10 + 7 * Math.sin(a)} r="1.3" fill="#f2b705" />
          })}
        </svg>
        <span className={cn('leading-none font-bold', size === 'sm' ? 'text-[8px]' : 'text-[11px]')}>F</span>
      </span>
      <span className={cn('flex items-center leading-none', size === 'sm' ? 'px-1.5' : 'px-3')}>{formatted}</span>
    </span>
  )
}

/** Parking zone, shown as a quiet label next to the plate. */
export function ZonePlate({ zone, className }: { zone: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 text-ink', className)}>
      <span className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Zone</span>
      <span className="font-heading text-base font-bold tabular-nums">{zone}</span>
    </span>
  )
}

/** The blue square "P" parking sign, used as the logo. */
export function ParkingSign({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-11 place-items-center rounded-[10px] bg-eu font-heading text-[28px] leading-none font-black text-white shadow-[inset_0_0_0_3px_var(--eu),inset_0_0_0_5px_#fff]',
        className,
      )}
      aria-hidden
    >
      <span className="translate-y-[2px]">P</span>
    </span>
  )
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <ParkingSign className="size-9 rounded-[8px] text-[22px]" />
      <span className="font-heading text-xl font-black tracking-tight">paybybot</span>
    </span>
  )
}

/** Large dashboard action, used side by side so the main actions share one size. */
export function ActionTile({
  tone,
  icon,
  eyebrow,
  title,
  text,
  cta,
  onClick,
  disabled,
  delay = 0,
}: {
  tone: 'signal' | 'go'
  icon: React.ReactNode
  eyebrow: string
  title: string
  text: string
  cta: string
  onClick: () => void
  disabled?: boolean
  delay?: number
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        'rise group relative flex h-full w-full flex-col items-start gap-4 overflow-hidden rounded-2xl p-6 text-left text-white transition active:translate-y-1 active:shadow-none disabled:opacity-60 sm:p-7',
        tone === 'signal' ? 'bg-signal shadow-[0_5px_0_var(--signal-deep)]' : 'bg-go shadow-[0_5px_0_#145236]',
      )}
    >
      <span className="absolute -top-10 -right-10 size-44 rounded-full border-[14px] border-white/10" aria-hidden />
      <span
        className={cn(
          'grid size-14 shrink-0 place-items-center rounded-2xl bg-white [&_svg]:size-7',
          tone === 'signal'
            ? 'text-signal shadow-[inset_0_0_0_3px_var(--signal),inset_0_0_0_5px_#fff]'
            : 'text-go shadow-[inset_0_0_0_3px_var(--go),inset_0_0_0_5px_#fff]',
        )}
      >
        {icon}
      </span>
      <span className="relative">
        <span className="text-sm font-bold tracking-[0.2em] text-white/75 uppercase">{eyebrow}</span>
        <span className="mt-1 block font-heading text-2xl leading-tight font-black sm:text-[1.7rem]">{title}</span>
        <span className="mt-2 block text-white/85">{text}</span>
      </span>
      <span
        className={cn(
          'relative mt-auto flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-bold transition group-hover:gap-3',
          tone === 'signal' ? 'text-signal' : 'text-go',
        )}
      >
        {cta} <span aria-hidden>→</span>
      </span>
    </button>
  )
}
