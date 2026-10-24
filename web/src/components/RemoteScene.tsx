import { useId } from 'react'

/**
 * Qonto-like side scene: one flat white card with a hairline border on light grey, a muted teal accent, an outlined
 * no cursor: « Renouvellement auto » turns itself on, the ticket about to end gets 7 days, then the paid weeks
 * pile up. One 8-second loop, CSS only (still with reduced motion).
 */
const TEAL = '#4e9aa0'
const INK = '#1c1b19'
const LINE = '#e3e3e3'
const RED = '#741b11' // the site's red: little time left

export function RemoteScene({ className }: { className?: string }) {
  const c = `rs-${useId().replace(/:/g, '')}` // class prefix: several scenes never share keyframes
  return (
    <svg viewBox="320 20 230 360" className={className} role="img" aria-label="La télécommande PayByBot renouvelle le ticket sans y penser">
      <style>{`
        .${c} * { transform-box: fill-box; }
        .${c}-btn { transform-origin: center; animation: ${c}-press 8s ease-in-out infinite; }
        .${c}-halo { transform-origin: center; opacity: 0; animation: ${c}-halo 8s ease-out infinite; }
        .${c}-sig { stroke-dasharray: 260; stroke-dashoffset: 260; animation: ${c}-sig 8s ease-in-out infinite; }
        .${c}-dot { offset-path: path('M 150 150 C 230 90, 300 90, 352 140'); opacity: 0; animation: ${c}-travel 8s ease-in-out infinite; }
        .${c}-before { animation: ${c}-before 8s linear infinite; }
        .${c}-after { opacity: 0; animation: ${c}-after 8s linear infinite; }
        .${c}-fill { transform-origin: 0% 50%; animation: ${c}-fill 8s cubic-bezier(.4,0,.2,1) infinite, ${c}-tint 8s linear infinite; }
        .${c}-urgent { animation: ${c}-pulse 1s ease-in-out infinite; }
        .${c}-row { opacity: 0; }
        .${c}-on { opacity: 0; animation: ${c}-on 8s ease-in-out infinite; }
        .${c}-knob { animation: ${c}-knob 8s ease-in-out infinite; }
        .${c}-r1 { animation: ${c}-r1 8s ease-out infinite; }
        .${c}-r2 { animation: ${c}-r2 8s ease-out infinite; }
        .${c}-r3 { animation: ${c}-r3 8s ease-out infinite; }
        @keyframes ${c}-press { 0%,28% { transform: scale(1) } 30% { transform: scale(.9) } 34%,100% { transform: scale(1) } }
        @keyframes ${c}-halo { 0%,29% { opacity: 0; transform: scale(1) } 31% { opacity: 1 } 44%,100% { opacity: 0; transform: scale(1.6) } }
        @keyframes ${c}-sig { 0%,30% { stroke-dashoffset: 260 } 48% { stroke-dashoffset: 0 } 90% { stroke-dashoffset: 0; opacity: 1 } 100% { stroke-dashoffset: 0; opacity: 0 } }
        @keyframes ${c}-travel { 0%,30% { offset-distance: 0%; opacity: 0 } 32% { opacity: 1 } 48% { offset-distance: 100%; opacity: 1 } 52%,100% { offset-distance: 100%; opacity: 0 } }
        @keyframes ${c}-before { 0%,35% { opacity: 1 } 38%,100% { opacity: 0 } }
        @keyframes ${c}-after { 0%,35% { opacity: 0 } 39%,94% { opacity: 1 } 99%,100% { opacity: 0 } }
        @keyframes ${c}-fill { 0% { transform: scaleX(.12) } 34% { transform: scaleX(.05) } 44%,94% { transform: scaleX(1) } 100% { transform: scaleX(.12) } }
        @keyframes ${c}-tint { 0%,35% { fill: #741b11 } 38%,100% { fill: #4e9aa0 } }
        @keyframes ${c}-pulse { 0%,100% { opacity: 1 } 50% { opacity: .55 } }
        @keyframes ${c}-on { 0%,30% { opacity: 0 } 34%,95% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes ${c}-knob { 0%,30% { transform: translateX(0) } 34%,95% { transform: translateX(14px) } 100% { transform: translateX(0) } }
        @keyframes ${c}-r1 { 0%,42% { opacity: 0 } 47%,95% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes ${c}-r2 { 0%,58% { opacity: 0 } 63%,95% { opacity: 1 } 100% { opacity: 0 } }
        @keyframes ${c}-r3 { 0%,74% { opacity: 0 } 79%,95% { opacity: 1 } 100% { opacity: 0 } }
        @media (prefers-reduced-motion: reduce) { .${c} * { animation: none !important; } .${c}-before { opacity: 0 } .${c}-after, .${c}-row, .${c}-on { opacity: 1 } .${c}-knob { transform: translateX(14px) } }
      `}</style>

      <g className={c} fontFamily="Figtree Variable, sans-serif">
        {/* the ticket card: PayByPhone's name, the plate, time left, then the weeks paid piling up */}
        <rect x="340" y="40" width="190" height="320" rx="10" fill="#fff" stroke={LINE} strokeWidth="1.5" />
        <text x="358" y="70" fontWeight="500" fontSize="15" fill={INK}>
          Pay<tspan fill="#64be38">By</tspan>Phone
        </text>
        <text x="512" y="70" textAnchor="end" fontSize="12" fill={INK} opacity=".55">
          AB-123-CD
        </text>
        <line x1="358" x2="512" y1="86" y2="86" stroke="#f0f0f0" strokeWidth="1" />
        {/* the « Renouvellement auto » switch: the one thing to do */}
        <text x="358" y="113" fontSize="12" fill={INK}>
          Renouvellement auto
        </text>
        <rect x="482" y="101" width="30" height="16" rx="8" fill="#e3e3e3" />
        <rect x="482" y="101" width="30" height="16" rx="8" fill={TEAL} className={`${c}-on`} />
        <circle cx="490" cy="109" r="6" fill="#fff" className={`${c}-knob`} />
        <line x1="358" x2="512" y1="128" y2="128" stroke="#f0f0f0" strokeWidth="1" />
        <text x="358" y="150" fontSize="11" fill={INK} opacity=".5">
          Temps restant
        </text>
        <g className={`${c}-before`}>
          <text x="358" y="180" fontWeight="700" fontSize="26" fill={RED} className={`${c}-urgent`}>
            0 h 12
          </text>
        </g>
        <g className={`${c}-after`}>
          <text x="358" y="180" fontWeight="700" fontSize="26" fill={INK}>
            7 jours
          </text>
        </g>
        <rect x="358" y="194" width="154" height="6" rx="3" fill="#f0f0f0" />
        <rect x="358" y="194" width="154" height="6" rx="3" fill={TEAL} className={`${c}-fill`} />
        <line x1="358" x2="512" y1="216" y2="216" stroke="#f0f0f0" strokeWidth="1" />
        <text x="358" y="238" fontSize="11" fill={INK} opacity=".5">
          Tickets payés
        </text>
        {/* one row per week, added one under the other: the renewal goes on, week after week */}
        {[
          ['Sem. du 20 oct.', 'r1'],
          ['Sem. du 27 oct.', 'r2'],
          ['Sem. du 3 nov.', 'r3'],
        ].map(([week, k], i) => (
          <g key={k} className={`${c}-row ${c}-${k}`} transform={`translate(0 ${252 + i * 34})`}>
            <rect x="352" y="0" width="166" height="28" rx="8" fill="#f7f7f7" />
            <circle cx="368" cy="14" r="8" fill="#fff" stroke={TEAL} strokeWidth="1.5" />
            <path d="M364.5 14 l2.5 2.5 l5 -5.5" fill="none" stroke={TEAL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <text x="382" y="18" fontSize="11" fill={INK}>
              {week}
            </text>
            <text x="510" y="18" textAnchor="end" fontSize="11" fill={INK} opacity=".55">
              9,00 €
            </text>
          </g>
        ))}

      </g>
    </svg>
  )
}

/** The scene with Qonto's caption: a small kicker and a strong two-line sentence, on light grey. */
export function RemotePanel({ className }: { className?: string }) {
  return (
    <div className={className} style={{ background: '#f4f4f4' }}>
      <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
        {/* The promise first, above the scene. */}
        <p className="relative mb-9 font-heading text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">
          <span className="relative z-10">Fini les FPS&nbsp;!</span>
        </p>
        <RemoteScene className="h-[min(58vh,27rem)] w-auto max-w-full" />
        <p className="mt-12 max-w-[30rem] font-heading text-[2rem] leading-[1.1] font-medium tracking-[-0.035em] text-ink">
          Renouvelez votre ticket sans y penser
        </p>
      </div>
    </div>
  )
}
