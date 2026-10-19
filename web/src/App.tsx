import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Dashboard } from '@/components/Dashboard'
import { LoginView } from '@/components/LoginView'
import { FaqView, Landing } from '@/components/Landing'
import { PayWizard } from '@/components/PayWizard'
import { SecurityPage } from '@/components/SecurityPage'
import { legalPageFromHash, LegalView, type LegalPage } from '@/components/Legal'
import { Wordmark } from '@/components/signs'
import { api, ApiError, forgetZoneLookup, type Me, type Overview } from '@/lib/api'

type Route = 'faq' | 'connexion' | 'inscription' | 'demo' | null

function routeFromHash(hash: string): Route {
  const id = hash.replace(/^#\/?/, '')
  return id === 'faq' || id === 'connexion' || id === 'inscription' || id === 'demo' ? id : null
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [data, setData] = useState<Overview | null>(null)
  const [paying, setPaying] = useState(false)
  const [hosted, setHosted] = useState(false)
  const [legal, setLegal] = useState<LegalPage | null>(() => legalPageFromHash(window.location.hash))
  const [route, setRoute] = useState(() => routeFromHash(window.location.hash))
  // Right after "S'inscrire": open the renewal setup on the dashboard.
  const [onboarding, setOnboarding] = useState(false)
  const [zoneReady, setZoneReady] = useState(true)

  useEffect(() => {
    const onHash = () => {
      setLegal(legalPageFromHash(window.location.hash))
      setRoute(routeFromHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // "Démo" link on the home page: open the demo account directly.
  useEffect(() => {
    if (route !== 'demo' || me === undefined) return
    history.replaceState(null, '', window.location.pathname)
    setRoute(null)
    if (me === null) api.login('demo', 'demo').then((m) => setMe(m as Me), (e) => toast.error((e as Error).message))
  }, [route, me])

  useEffect(() => {
    api.me().then(setMe, () => setMe(null))
    api.config().then((c) => setHosted(c.hosted), () => {})
  }, [])

  const refresh = useCallback(async () => {
    try {
      setData(await api.overview())
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null)
      else toast.error((e as Error).message)
    }
  }, [])

  useEffect(() => {
    if (!me) return
    refresh()
    const id = setInterval(refresh, 60_000)
    return () => clearInterval(id)
  }, [me, refresh])

  async function logout() {
    await api.logout().catch(() => {})
    setData(null)
    setOnboarding(false)
    forgetZoneLookup()
    setMe(null)
  }

  return (
    <>
      <Toaster />
      {legal ? (
        legal === 'securite' ? <SecurityPage hosted={hosted} signedIn={!!me} /> : <LegalView page={legal} hosted={hosted} signedIn={!!me} />
      ) : me === undefined ? (
        <div className="grid min-h-dvh place-items-center">
          <span className="animate-pulse">
            <Wordmark />
          </span>
        </div>
      ) : route === 'faq' ? (
        <FaqView hosted={hosted} signedIn={!!me} />
      ) : me === null ? (
        route === 'connexion' || route === 'inscription' ? (
          <LoginView
            signup={route === 'inscription'}
            hosted={hosted}
            onLogin={(m) => {
              forgetZoneLookup()
              if (route === 'inscription') {
                setOnboarding(true)
                setZoneReady(false)
                // Long enough to read the message, even when PayByPhone answers fast.
                Promise.all([api.residentZone(), new Promise((r) => setTimeout(r, 2500))]).finally(() => setZoneReady(true))
              }
              history.replaceState(null, '', window.location.pathname)
              setRoute(null)
              setMe(m)
            }}
          />
        ) : (
          <Landing hosted={hosted} />
        )
      ) : onboarding && (!data || !zoneReady) ? (
        <div className="grid min-h-dvh place-items-center bg-white px-6">
          <div className="rise flex flex-col items-center gap-6 text-center">
            <span className="animate-pulse">
            <Wordmark />
          </span>
            <p className="max-w-64 text-lg text-ink/70">Récupération de vos paramètres PayByPhone…</p>
          </div>
        </div>
      ) : (
        <>
          <Dashboard
            onDeleted={() => {
              history.replaceState(null, '', window.location.pathname)
              setRoute(null)
              setData(null)
              setOnboarding(false)
              forgetZoneLookup()
              setMe(null)
            }}
            me={me}
            data={data}
            onRefresh={refresh}
            onPay={() => setPaying(true)}
            onLogout={logout}
          />
          {paying && data && (
            <PayWizard
              data={data}
              demo={me.demo}
              onRefresh={refresh}
              onClose={() => setPaying(false)}
              onPaid={() => {
                setPaying(false)
                refresh()
              }}
            />
          )}
        </>
      )}
    </>
  )
}
