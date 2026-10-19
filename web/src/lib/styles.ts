import { cn } from '@/lib/utils'

/** The few building blocks of the minimal look (blue accent), shared by every screen. */
export const ui = {
  /** The one main action of a screen. */
  primary:
    'flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] text-lg font-bold text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50',
  /** Top bar buttons: a grey pill and a blue one (slight gradient). */
  pillGray:
    'inline-flex h-9 items-center rounded-full bg-ink/[0.06] px-3 text-sm sm:h-10 sm:px-4 sm:text-[0.95rem] font-semibold whitespace-nowrap text-ink transition hover:bg-ink/[0.1]',
  pillBlue:
    'inline-flex h-9 items-center rounded-full bg-[linear-gradient(90deg,var(--eu)_0%,#2a66d1_100%)] px-3 text-sm font-semibold whitespace-nowrap text-white sm:h-10 sm:px-4 sm:text-[0.95rem] transition hover:brightness-110',
  /** A secondary action, outlined. */
  secondary:
    'flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-eu/30 bg-white font-bold text-eu transition hover:border-eu disabled:opacity-50',
  /** Small text actions. */
  link: 'font-bold text-ink underline decoration-ink/30 underline-offset-[3px] hover:decoration-ink',
  /** Text inputs. */
  field:
    'h-14 w-full rounded-xl border border-ink/20 bg-white px-4 text-lg text-ink outline-none transition placeholder:text-ink/30 focus:border-eu focus:ring-3 focus:ring-eu/15',
  /** Field label. */
  label: 'mb-2 block text-sm font-bold text-ink/60',
  title: 'font-heading text-[2.2rem] leading-[1.05] font-semibold tracking-[-0.035em] text-ink sm:text-[2.6rem]',
  subtitle: 'mt-3 text-[1.05rem] leading-relaxed text-ink/60',
  /** Dialog content shell and its plain header. */
  dialog: 'max-h-[calc(100dvh-1.5rem)] gap-0 overflow-y-auto rounded-2xl bg-white p-0 sm:max-w-md',
  dialogTitle: 'font-heading text-2xl font-bold tracking-tight text-ink',
  error: 'rounded-xl bg-destructive/8 px-4 py-3 text-destructive',
  note: 'rounded-xl bg-muted px-4 py-3 text-ink/70',
}

/** A selectable option (card, chip): hairline border, paybybot blue when selected. */
export function choice(selected: boolean, extra?: string) {
  return cn(
    'rounded-xl border bg-white text-left transition',
    selected ? 'border-eu bg-eu/[0.04] ring-1 ring-eu' : 'border-ink/15 hover:border-ink/40',
    extra,
  )
}
