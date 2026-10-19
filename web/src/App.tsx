import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Toaster } from '@/components/ui/sonner'
import { Dashboard } from '@/components/Dashboard'
import { LoginView } from '@/components/LoginView'
import { PayWizard } from '@/components/PayWizard'
import { ParkingSign } from '@/components/signs'
import { api, ApiError, type Me, type Overview } from '@/lib/api'

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [data, setData] = useState<Overview | null>(null)
  const [paying, setPaying] = useState(false)

  useEffect(() => {
    api.me().then(setMe, () => setMe(null))
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
    setMe(null)
  }

  return (
    <>
      <Toaster />
      {me === undefined ? (
        <div className="grid min-h-dvh place-items-center">
          <ParkingSign className="animate-pulse" />
        </div>
      ) : me === null ? (
        <LoginView onLogin={setMe} />
      ) : (
        <>
          <Dashboard me={me} data={data} onRefresh={refresh} onPay={() => setPaying(true)} onLogout={logout} />
          {paying && data && (
            <PayWizard
              data={data}
              demo={me.demo}
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
