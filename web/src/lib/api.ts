export type Money = { amount: number; currency: string }

export type Vehicle = { plate: string; country?: string; type?: string }
export type PaymentMethod = { id: string; label: string; kind: 'card' | 'phone' | 'paypal' }
export type Session = {
  id: string
  location: string
  plate: string
  start: string
  expire: string
  rate: string
  cost?: Money
}
export type Unit = 'Days' | 'Hours' | 'Minutes'
export type Rate = {
  name: string
  type: string
  ratePolicyId: string
  acceptedTimeUnits: Unit[]
  parkingNotAllowedReason: string | null
}
export type Parking = {
  location: string
  rate: string
  duration: number
  unit: Unit
  plate: string
  paymentAccountId: string
}
export type Autopilot = Parking & {
  id: string
  label: string
  enabled: boolean
  lastCheck: string | null
  lastPayment: string | null
  lastError: string | null
}
export type HistoryItem = { at: string; kind: 'success' | 'error'; message: string }
export type Overview = {
  vehicles: Vehicle[]
  payments: PaymentMethod[]
  sessions: Session[]
  autopilots: Autopilot[]
  history: HistoryItem[]
}
export type Me = { username: string; demo: boolean }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      credentials: 'same-origin',
    })
  } catch {
    throw new ApiError(0, "L'application paybybot ne répond plus. Est-elle toujours lancée ?")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, typeof body.detail === 'string' ? body.detail : 'Erreur inattendue.')
  }
  return res.json()
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const api = {
  me: () => request<Me>('/api/me'),
  login: (username: string, password: string) => post<Me>('/api/login', { username, password }),
  logout: () => post('/api/logout'),
  overview: () => request<Overview>('/api/overview'),
  rates: (location: string, plate: string) =>
    request<Rate[]>(`/api/rates?${new URLSearchParams({ location, plate })}`),
  quote: (p: Parking & { sessionId?: string }) => post<{ cost: Money; start: string; expire: string }>('/api/quote', p),
  extend: (p: Parking & { sessionId: string }) => post<{ ok: true; expire: string; cost: Money }>('/api/extend', p),
  pay: (p: Parking) => post<{ ok: true; expire: string; cost: Money }>('/api/pay', p),
  addAutopilot: (p: Parking & { label: string }) => post<Autopilot>('/api/autopilots', p),
  deleteAutopilot: (id: string) => request(`/api/autopilots/${id}`, { method: 'DELETE' }),
}

export const UNIT_LABEL: Record<Unit, [string, string]> = {
  Days: ['jour', 'jours'],
  Hours: ['heure', 'heures'],
  Minutes: ['minute', 'minutes'],
}

export function unitLabel(unit: Unit, n: number) {
  return UNIT_LABEL[unit][n > 1 ? 1 : 0]
}

export function money(m?: Money | null) {
  if (!m) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: m.currency || 'EUR' }).format(m.amount)
}

export function clock(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === today.toDateString()) return `aujourd'hui à ${time}`
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (d.toDateString() === tomorrow.toDateString()) return `demain à ${time}`
  return `le ${d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })} à ${time}`
}

export function remaining(ms: number) {
  if (ms <= 0) return 'terminé'
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d) return `${d} j ${h} h`
  if (h) return `${h} h ${String(m).padStart(2, '0')}`
  return `${Math.max(m, 1)} min`
}
