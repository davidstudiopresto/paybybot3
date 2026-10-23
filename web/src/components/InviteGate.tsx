import { Mail } from 'lucide-react'
import { Home } from '@/components/Landing'
import { PayByBot } from '@/components/signs'

/** Word of mouth only: without a user's link, the home page stays blurred behind this card (no way in, not even to
 *  sign in: the link is kept on the device once opened). */
export function InviteGate({ hosted, invalid = false }: { hosted: boolean; invalid?: boolean }) {
  return (
    <div className="relative h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none blur-[6px] select-none">
        <Home hosted={hosted} />
      </div>
      <div className="absolute inset-0 grid place-items-center bg-white/40 px-6">
        <div className="rise w-full max-w-sm rounded-3xl border border-ink/10 bg-white p-7 text-center shadow-[0_24px_60px_-20px_rgb(11_16_36/0.35)]">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-eu/[0.08] text-eu">
            <Mail className="size-6" />
          </span>
          <h1 className="mt-5 font-heading text-2xl font-bold tracking-tight text-ink">Sur invitation</h1>
          <p className="mt-2 leading-relaxed text-ink/60">
            {invalid ? (
              'Ce lien d’invitation n’est pas valable.'
            ) : (
              <>
                <PayByBot /> s’ouvre pour l’instant par le bouche-à-oreille.
              </>
            )}{' '}
            Demandez son lien d’invitation à un proche qui l’utilise déjà.
          </p>
        </div>
      </div>
    </div>
  )
}
