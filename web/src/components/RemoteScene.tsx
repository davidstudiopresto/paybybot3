import { useId } from 'react'

/**
 * Qonto-like side scene: one flat white card with a hairline border on light grey, a muted teal accent, an outlined
 * hand cursor. The hand turns on « Renouvellement auto », the ticket about to end gets 7 days, then the paid weeks
 * pile up. One 8-second loop, CSS only (still with reduced motion).
 */
const TEAL = '#4e9aa0'
const INK = '#1c1b19'
const LINE = '#e3e3e3'
const RED = '#741b11' // the site's red: little time left

export function RemoteScene({ className }: { className?: string }) {
  const c = `rs-${useId().replace(/:/g, '')}` // class prefix: several scenes never share keyframes
  return (
    <svg viewBox="320 20 230 360" className={className} role="img" aria-label="La télécommande PayByBot renouvelle le ticket résident sans y penser">
      <style>{`
        .${c} * { transform-box: fill-box; }
        .${c}-hand { animation: ${c}-hand 8s cubic-bezier(.4,0,.2,1) infinite; }
        .${c}-btn { transform-origin: center; animation: ${c}-press 8s ease-in-out infinite; }
        .${c}-halo { transform-origin: center; opacity: 0; animation: ${c}-halo 8s ease-out infinite; }
        .${c}-sig { stroke-dasharray: 260; stroke-dashoffset: 260; animation: ${c}-sig 8s ease-in-out infinite; }
        .${c}-dot { offset-path: path('M 150 150 C 230 90, 300 90, 352 140'); opacity: 0; animation: ${c}-travel 8s ease-in-out infinite; }
        .${c}-before { animation: ${c}-before 8s linear infinite; }
        .${c}-after { opacity: 0; animation: ${c}-after 8s linear infinite; }
        .${c}-fill { transform-origin: 0% 50%; animation: ${c}-fill 8s cubic-bezier(.4,0,.2,1) infinite, ${c}-tint 8s linear infinite; }
        .${c}-urgent { animation: ${c}-pulse 1s ease-in-out infinite; }
        .${c}-note { opacity: 0; transform-origin: 50% 0%; }
        .${c}-on { opacity: 0; animation: ${c}-on 8s ease-in-out infinite; }
        .${c}-knob { animation: ${c}-knob 8s ease-in-out infinite; }
        .${c}-r1 { animation: ${c}-r1 8s ease-out infinite; }
        .${c}-r2 { animation: ${c}-r2 8s ease-out infinite; }
        .${c}-r3 { animation: ${c}-r3 8s ease-out infinite; }
        @keyframes ${c}-hand { 0%,10% { transform: translate(70px, 60px); opacity: 0 } 16% { opacity: 1 } 24%,28% { transform: translate(0,0) } 30% { transform: translate(2px,3px) } 34% { transform: translate(0,0) } 44%,100% { transform: translate(70px, 60px); opacity: 0 } }
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
        @keyframes ${c}-r1 { 0%,41% { opacity: 0; transform: translateY(-16px) } 46%,58% { opacity: 1; transform: translateY(0) scale(1) } 63%,74% { opacity: .55; transform: translateY(14px) scale(.93) } 79%,95% { opacity: .25; transform: translateY(28px) scale(.86) } 100% { opacity: 0; transform: translateY(28px) scale(.86) } }
        @keyframes ${c}-r2 { 0%,57% { opacity: 0; transform: translateY(-16px) } 62%,74% { opacity: 1; transform: translateY(0) scale(1) } 79%,95% { opacity: .55; transform: translateY(14px) scale(.93) } 100% { opacity: 0; transform: translateY(14px) scale(.93) } }
        @keyframes ${c}-r3 { 0%,73% { opacity: 0; transform: translateY(-16px) } 78%,95% { opacity: 1; transform: translateY(0) scale(1) } 100% { opacity: 0; transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .${c} * { animation: none !important; } .${c}-before { opacity: 0 } .${c}-after, .${c}-r3, .${c}-on { opacity: 1 } .${c}-knob { transform: translateX(14px) } }
      `}</style>

      <defs>
        <filter id={`${c}-shadow`} x="-20%" y="-40%" width="140%" height="200%">
          <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0b1024" floodOpacity=".12" />
        </filter>
      </defs>
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
        {/* « Forfait renouvelé » notices piling up, as in the video: the newest in front, the older ones step back */}
        {[
          ['lun. 27 oct.', 'r1'],
          ['lun. 3 nov.', 'r2'],
          ['lun. 10 nov.', 'r3'],
        ].map(([day, k]) => (
          <g key={k} className={`${c}-note ${c}-${k}`}>
            <rect x="350" y="252" width="170" height="44" rx="11" fill="#fff" stroke={LINE} strokeWidth="1.2" filter={`url(#${c}-shadow)`} />
            <circle cx="371" cy="274" r="11" fill="#e3f5e9" />
            <path d="M366 274 l3.5 3.5 l6.5 -7" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <text x="389" y="270" fontSize="11" fontWeight="700" fill={INK}>
              Forfait renouvelé
            </text>
            <text x="389" y="285" fontSize="10" fill={INK} opacity=".55">
              {day} · 9,00 €
            </text>
          </g>
        ))}

        {/* the outlined pointing hand, as on Qonto */}
        <g className={`${c}-hand`} transform="translate(0 0)">
          <g transform="translate(491 111)">
            <path
              d="M6 0 c 3.5 0 6 2.5 6 6 v 20 c 1.5 -1.5 3.5 -2.2 5.5 -2 c 3 .3 5 2.6 5 5.6 c 1.5 -1.2 3.4 -1.8 5.4 -1.4 c 2.7 .5 4.6 2.8 4.6 5.6 c 1.4 -.8 3 -1.1 4.6 -.7 c 2.6 .6 4.4 3 4.4 5.7 v 13 c 0 11 -9 20 -20 20 h -9 c -6 0 -11.6 -3 -15 -8 l -12 -18 c -1.8 -2.7 -1.1 -6.3 1.6 -8.1 c 2.5 -1.7 5.9 -1.2 7.8 1.2 l 1.6 2 v -37 c 0 -3.5 2.5 -6 6 -6 z"
              fill="#fff"
              stroke={INK}
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="M18.5 36 v 9 M29 36 v 9 M40 38 v 7" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </svg>
  )
}

/** A hand-drawn beige brush stroke, under a few words. */
function BrushStroke({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 14" preserveAspectRatio="none" className={className} aria-hidden>
      <path
        d="M2 8.5c18-2.6 36-3.4 54-2.6 14 .6 26 2.7 40 2.4 22-.5 44-4.3 66-4 12 .2 24 1.6 36 3.2"
        fill="none"
        stroke="#d8cbbd"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path d="M6 10.5c26-2 52-2.2 78-.6 30 1.8 62 .4 92-2.6" fill="none" stroke="#e6dbcf" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}

/** The scene with Qonto's caption: a small kicker and a strong two-line sentence, on light grey. */
export function RemotePanel({ className }: { className?: string }) {
  return (
    <div className={className} style={{ background: '#f4f4f4' }}>
      <div className="flex h-full flex-col items-center justify-center px-10 py-16 text-center">
        {/* The promise first, above the scene, underlined by a hand-drawn brush stroke (Instinct-like). */}
        <p className="relative mb-9 font-heading text-[1.6rem] font-semibold tracking-[-0.02em] text-ink">
          <span className="relative z-10">Fini les FPS&nbsp;!</span>
          <BrushStroke className="absolute bottom-[0.02em] left-[-3%] h-[0.55em] w-[106%]" />
        </p>
        <RemoteScene className="h-[min(52vh,24rem)] w-auto max-w-full" />
        <p className="mt-12 max-w-[30rem] font-heading text-[2rem] leading-[1.1] font-medium tracking-[-0.035em] text-ink">
          Renouvelez votre ticket résident sans y penser
        </p>
      </div>
    </div>
  )
}
