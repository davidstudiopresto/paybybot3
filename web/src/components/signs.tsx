import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** French licence plate: white field, blue EU band with the country letter. */
export function Plate({ plate, size = 'md', className }: { plate: string; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const formatted = /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(plate)
    ? `${plate.slice(0, 2)}-${plate.slice(2, 5)}-${plate.slice(5)}`
    : plate
  return (
    <span
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-[6px] border-2 border-ink bg-white font-plate font-extrabold tracking-[0.06em] text-ink shadow-[0_2px_0_var(--ink)]',
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

/** PayByPhone's vehicle type in plain French: « Voiture », « Deux-roues », « Utilitaire »; null when unknown. */
export function vehicleType(type?: string | null) {
  if (!type) return null
  if (/moto|motor|scooter|two|2\s*roues|deux|bike|cycle/i.test(type)) return 'Deux-roues'
  if (/truck|van|utilit|commercial|lorry/i.test(type)) return 'Utilitaire'
  if (/car|auto|voiture|passenger/i.test(type)) return 'Voiture'
  return null
}

/** A plate with its vehicle type underneath, when PayByPhone gives it. */
export function VehiclePlate({ plate, type }: { plate: string; type?: string | null }) {
  const kind = vehicleType(type)
  return (
    <span className="inline-flex flex-col items-center gap-1">
      <Plate plate={plate} size="sm" />
      {kind && <span className="text-xs font-medium text-ink/55">{kind}</span>}
    </span>
  )
}

/** Paris resident zones are numbered like the postcode: 75017 -> « Paris 17e », 75001 -> « Paris 1er ». */
export function arrondissement(zone: string) {
  const m = zone.match(/^75(0(\d{2})|116)$/)
  if (!m) return null
  const n = m[1] === '116' ? 16 : Number(m[2])
  return n >= 1 && n <= 20 ? `Paris ${n === 1 ? '1er' : `${n}e`}` : null
}

/** Parking zone, shown as a quiet label next to the plate. */
export function ZonePlate({ zone, className }: { zone: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 text-ink', className)}>
      <span className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Zone</span>
      <span className="font-plate text-base font-bold tabular-nums">{zone}</span>
    </span>
  )
}

/** The blue square "P" parking sign, used as the logo. */
export function ParkingSign({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'grid size-11 place-items-center rounded-[10px] bg-eu font-plate text-[28px] leading-none font-black text-white shadow-[inset_0_0_0_3px_var(--eu),inset_0_0_0_5px_#fff]',
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
    <span className="font-heading text-[1.4rem] leading-none font-semibold tracking-[-0.025em] text-ink">
      Pay
      <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">by</span>
      Bot
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

/** PaybyBot's name in running text, « by » in the wordmark's blue. */
export function PaybyBot() {
  return (
    <span className="whitespace-nowrap">
      Pay
      <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">by</span>
      Bot
    </span>
  )
}

/** PayByPhone's name as its logo writes it: « By » in its green. */
export function PayByPhone() {
  return (
    <span className="whitespace-nowrap">
      Pay<span className="text-[#64be38]">By</span>Phone
    </span>
  )
}

/** A text with each « PayByPhone » shown as above. */
export function withPayByPhone(text: string): ReactNode {
  return text.split('PayByPhone').flatMap((part, i) => (i ? [<PayByPhone key={i} />, part] : [part]))
}
