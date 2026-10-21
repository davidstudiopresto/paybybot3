import { useId, type ReactNode } from 'react'
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

/** The logo mark: two arrows turning, the automatic renewal (no background), in the blue of « By ». */
export function LogoMark({ className }: { className?: string }) {
  const id = useId()
  return (
    <svg viewBox="272 272 478 478" aria-hidden className={className}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a66d1" />
          <stop offset="1" stopColor="#1d4ea3" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>
        <path d="M509.777 296.703C523.34 295.551 544.095 297.519 557.393 300.345C613.095 312.182 655.568 342.953 686.958 389.496C692.315 376.732 692.296 359.402 706.238 351.762C722.298 342.961 743.194 356.322 741.93 374.614C741.492 380.957 738.39 390.098 736.538 396.518C733.069 408.364 729.529 420.19 725.916 431.994L718.739 455.891C716.875 462.319 713.722 475.818 709.387 480.839C699.586 491.693 683.115 496.878 669.397 491.073C654.234 484.656 639.691 477.604 624.818 470.906L596.755 458.036C590.473 455.156 581.179 451.551 575.917 447.502C568.473 441.776 566.901 428.182 570.426 420.101C572.903 414.293 577.666 409.764 583.591 407.581C597.835 402.434 618.22 415.57 632.22 422.041C626.053 413.447 622.039 408.783 614.652 401.456C596.438 385.055 578.099 372.744 554.669 364.659C512.258 350.043 465.741 353.178 425.675 373.352C375.6 397.993 344.61 444.924 335.44 498.396C334.273 505.201 320.089 506.941 319.878 495.192C319.736 487.316 320.742 481.022 321.893 473.179C327.34 434.117 343.647 397.368 368.955 367.119C407.081 322.255 451.96 301.432 509.777 296.703Z" />
        <path d="M695.095 522.485C706.378 522.211 705.473 530.296 704.665 538.857C704.31 542.618 704 546.334 703.454 550.078C695.435 605.069 667.543 655.06 622.975 688.149C581.654 719.447 529.501 732.854 478.209 725.362C432.768 718.37 391.043 696.169 359.854 662.39C352.032 653.962 345.535 645.067 338.742 635.803C334.361 648.108 332.075 666.025 320.749 673.155C314.942 676.81 307.684 677.657 301.085 675.987C294.452 674.295 288.825 669.913 285.559 663.897C279.157 652.204 285.278 639.422 288.738 627.645C292.937 613.278 297.213 598.934 301.566 584.614C304.219 575.885 307.721 561.525 310.828 553.6C314.296 544.84 321.18 537.868 329.895 534.288C338.719 530.561 349.168 530.366 357.842 534.293C371.818 540.62 385.703 547.308 399.658 553.706L425.382 565.504C432.343 568.707 439.964 571.755 446.157 576.238C454.63 582.371 457.395 595.118 453.266 604.586C450.9 610.127 446.39 614.474 440.766 616.633C429.415 621.02 419.728 615.694 409.69 611.053L393.731 603.658C413.444 631.781 444.356 652.226 477.106 661.997C519.036 674.087 564.03 669.308 602.484 648.681C643.572 626.41 676.375 587.724 686.786 541.62C688.446 534.266 687.267 526.436 694.539 522.759L695.095 522.485Z" />
      </g>
    </svg>
  )
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-1.5 font-heading text-[1.4rem] leading-none font-semibold tracking-[-0.025em] text-ink">
      <LogoMark className="size-[1.25em] shrink-0" />
      <span>
        Pay
        <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">By</span>
        Bot
      </span>
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

/** PayByBot's name in running text, « by » in the wordmark's blue. */
export function PayByBot() {
  return (
    <span className="whitespace-nowrap">
      Pay
      <span className="bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] bg-clip-text text-transparent">By</span>
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
