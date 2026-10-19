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
      <span className={cn('flex flex-col items-center justify-end bg-signal pb-0.5 text-white', size === 'sm' ? 'w-4' : 'w-6')}>
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

/** Enamel street-name plate (blue field, green frame) used to show a zone. */
export function ZonePlate({ zone, className }: { zone: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex flex-col items-center rounded-md border-[3px] border-go bg-signal-deep px-3 py-1 text-white shadow-[inset_0_0_0_2px_#fff3]',
        className,
      )}
    >
      <span className="text-[9px] font-bold tracking-[0.25em] uppercase opacity-80">Zone</span>
      <span className="font-heading text-lg leading-none font-extrabold tracking-wide">{zone}</span>
    </span>
  )
}

/** The blue square "P" parking sign, used as the logo. */
export function ParkingSign({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-11 place-items-center rounded-[10px] bg-signal font-heading text-[28px] leading-none font-black text-white shadow-[inset_0_0_0_3px_var(--signal),inset_0_0_0_5px_#fff]',
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
    <span className="flex items-center gap-3">
      <ParkingSign />
      <span className="font-heading text-2xl leading-none font-black tracking-tight">
        paybybot<span className="text-signal">3</span>
      </span>
    </span>
  )
}
