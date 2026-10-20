import { Loading } from '@/components/Loading'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Dashboard } from '@/components/Dashboard'
import { LoginView } from '@/components/LoginView'
import { FaqView, Landing } from '@/components/Landing'
import { PayWizard } from '@/components/PayWizard'
import { SecurityPage } from '@/components/SecurityPage'
import { AdminPage } from '@/components/Admin'
import { PricingPage } from '@/components/Pricing'
import { legalPageFromHash, LegalView, type LegalPage } from '@/components/Legal'
import { NotFoundPage } from '@/components/NotFound'
import { PayByPhone } from '@/components/signs'
import { api, ApiError, forgetZoneLookup, type Me, type Overview } from '@/lib/api'

type Route = 'faq' | 'tarifs' | 'connexion' | 'inscription' | 'demo' | 'admin' | null

function routeFromHash(hash: string): Route {
  const id = hash.replace(/^#\/?/, '')
  return id === 'faq' || id === 'tarifs' || id === 'connexion' || id === 'inscription' || id === 'demo' || id === 'admin'
    ? id
    : null
}

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const shown = useRef(false) // the dashboard is on screen: errors are toasts, not the loading screen
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

  // Back from the e-mail's « Débloquer mon compte » once Stripe has taken the payment.
  useEffect(() => {
    if (window.location.hash !== '#/debloque') return
    history.replaceState(null, '', window.location.pathname)
    toast.success('Compte débloqué : le renouvellement reprend.')
  }, [])

  useEffect(() => {
    api.me().then(setMe, () => setMe(null))
    api.config().then((c) => setHosted(c.hosted), () => {})
  }, [])

  // A page left open across an update keeps running the old app: reload it once a new version is online.
  useEffect(() => {
    const mine = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.src.split('/assets/')[1]
    if (!mine) return // dev server
    const check = () =>
      api.config().then(
        (c) => {
          if (!c.build || c.build === mine) return
          try {
            if (sessionStorage.getItem('pbb-build') === c.build) return // already reloaded for it: no loop
            sessionStorage.setItem('pbb-build', c.build)
          } catch {
            return
          }
          window.location.reload()
        },
        () => {},
      )
    const onVisible = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onVisible)
    const id = setInterval(check, 5 * 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    shown.current = !!data
  }, [data])

  const refresh = useCallback(async () => {
    try {
      setData(await api.overview())
      setLoadError(null)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMe(null)
      else {
        // Nothing shown yet: the loading screen says it and offers to retry; otherwise a toast is enough.
        const message = (e as Error).message || 'Impossible de charger votre compte.'
        setLoadError(message)
        if (shown.current) toast.error(message)
      }
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
      {!['/', '/index.html'].includes(window.location.pathname) ? (
        <NotFoundPage hosted={hosted} />
      ) : legal ? (
        legal === 'securite' ? <SecurityPage hosted={hosted} signedIn={!!me} /> : <LegalView page={legal} hosted={hosted} signedIn={!!me} />
      ) : me === undefined ? (
        <Loading />
      ) : route === 'admin' ? (
        <AdminPage signedIn={!!me} />
      ) : route === 'tarifs' ? (
        <PricingPage hosted={hosted} signedIn={!!me} />
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
      ) : (onboarding && (!data || !zoneReady)) || !data ? (
        <Loading
          label={onboarding ? <>Récupération de vos paramètres <PayByPhone />…</> : <>Chargement de votre compte <PayByPhone />…</>}
          error={loadError}
          onLogout={logout}
          onRetry={() => {
            setLoadError(null)
            refresh()
          }}
        />
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
