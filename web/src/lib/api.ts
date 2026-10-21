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
  email?: string
  pausedFrom?: string | null
  pausedUntil?: string | null
}
export type HistoryItem = { at: string; kind: 'success' | 'error'; message: string }
export type Overview = {
  vehicles: Vehicle[]
  payments: PaymentMethod[]
  sessions: Session[]
  autopilots: Autopilot[]
  history: HistoryItem[]
}
/** Sign-up waiting for the 6-digit code sent to the e-mail. */
export type SignupPending = { pending: true; email: string }
export const isPending = (x: Me | SignupPending): x is SignupPending => 'pending' in x

/** The PaybyBot account: e-mail given at sign-up, home zone added by hand. */
export type Account = {
  email: string
  zone: string | null
  trialEnd?: string | null
  plan?: string | null
  /** 'grace': a charge was refused, renewals go on until graceEnd. Renewals stop while blocked: 'unpaid' (still not
   *  paid after the grace week) or 'trialOver' (no subscription). */
  blocked?: 'grace' | 'unpaid' | 'trialOver' | null
  graceEnd?: string | null
  /** A subscription is running: needed to activate a renewal, even during the free month. */
  subscribed?: boolean
}
export type Me = { username: string; demo: boolean; hosted?: boolean; firstName?: string | null }

/** The account's prices in cents: per month twice its weekly resident ticket, 20 % off per year (zone null: unknown). */
export type Pricing = {
  zone: string | null
  weekly: number | null
  monthly: number | null
  yearly: number | null
  /** Resident status active on PayByPhone in the home zone (null while the zone is unknown). */
  resident?: boolean | null
  /** The « riverain » vehicles (a resident rate in the home zone), one price each. */
  vehicles?: PricedVehicle[]
  /** Plates the subscription is for: those with a renewal (the first vehicle while none has). */
  billed?: string[]
}
export type PricedVehicle = {
  plate: string
  type?: string | null
  zone: string // the arrondissement PayByPhone gives it the resident rate in (never typed)
  weekly: number
  monthly: number
  yearly: number
  renewed: boolean
}

export class ApiError extends Error {
  status: number
  data: Record<string, unknown> // details sent with the error (e.g. how many vehicles)
  constructor(status: number, message: string, data: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.data = data
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
    throw new ApiError(0, "L'application PaybyBot ne répond plus. Est-elle toujours lancée ?")
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body.detail
    if (detail && typeof detail === 'object' && typeof detail.message === 'string') throw new ApiError(res.status, detail.message, detail)
    throw new ApiError(res.status, typeof detail === 'string' ? detail : 'Erreur inattendue.')
  }
  return res.json()
}

// The history lookup is slow-ish and asked twice at signup (loading screen, then setup): done once per login.
let zoneLookup: Promise<{ zone: string | null; manual?: boolean }> | null = null
export const forgetZoneLookup = () => {
  zoneLookup = null
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })

export const api = {
  config: () => request<{ hosted: boolean; turnstileSiteKey?: string | null; build?: string | null }>('/api/config'),
  me: () => request<Me>('/api/me'),
  login: (
    username: string,
    password: string,
    accepted = false,
    signup?: { email: string },
    remember = false,
    turnstile = '',
  ) =>
    post<Me | SignupPending>('/api/login', {
      username,
      password,
      accepted,
      remember,
      turnstile,
      ...(signup ? { signup: true, ...signup } : {}),
    }),
  account: () => request<Account>('/api/account'),
  updateAccount: (patch: Partial<Account>) =>
    request<Account>('/api/account', { method: 'PUT', body: JSON.stringify(patch) }),
  logout: () => post('/api/logout'),
  checkout: (plan: 'monthly' | 'yearly') => post<{ url: string }>('/api/billing/checkout', { plan }),
  confirmCheckout: (session_id: string) => post<{ plan: string }>('/api/billing/confirm', { session_id }),
  billingPortal: () => post<{ url: string }>('/api/billing/portal'),
  unlock: () => post<{ url: string }>('/api/billing/unlock'),
  pricing: () => request<Pricing>('/api/pricing'),
  residentStatus: () => request<{ zone: string | null; resident: boolean | null }>('/api/resident-status'),
  adminLogin: (email: string, password: string, turnstile = '') =>
    post('/api/admin/login', { email, password, turnstile }),
  adminLogout: () => post('/api/admin/logout'),
  adminStats: () => request<import('@/components/Admin').AdminStats>('/api/admin/stats'),
  signupCheck: (username: string) => post<{ exists: boolean }>('/api/signup/check', { username }),
  verifySignup: (code: string) => post<Me>('/api/signup/verify', { code }),
  resendSignupCode: () => post<SignupPending>('/api/signup/resend'),
  deleteData: () => request('/api/me/data', { method: 'DELETE' }),
  overview: () => request<Overview>('/api/overview'),
  /** Home zone guessed from the PayByPhone history (null if none). */
  residentZone: () => (zoneLookup ??= request<{ zone: string | null; manual?: boolean }>('/api/resident-zone').catch(() => ({ zone: null, manual: false }))),
  rates: (location: string, plate: string) =>
    request<Rate[]>(`/api/rates?${new URLSearchParams({ location, plate })}`),
  lastRate: (location: string, plate: string) =>
    request<{ rate: string | null; inZone: boolean }>(`/api/last-rate?${new URLSearchParams({ location, plate })}`),
  quote: (p: Parking & { sessionId?: string; renewal?: boolean }) =>
    post<{ cost: Money; start: string; expire: string; afterCurrent?: boolean; currentExpire?: string | null; priceSource?: 'history' | 'paris' | null }>('/api/quote', p),
  extend: (p: Parking & { sessionId: string }) => post<{ ok: true; expire: string; cost: Money }>('/api/extend', p),
  pay: (p: Parking) => post<{ ok: true; expire: string; cost: Money }>('/api/pay', p),
  addAutopilot: (p: Parking & { label: string; email?: string }) => post<Autopilot>('/api/autopilots', p),
  pauseAutopilot: (id: string, start: string, end: string | null) =>
    post<Autopilot>(`/api/autopilots/${id}/pause`, { start, end }),
  renewalCheck: (p: Parking) => post<{ ok: true; paid: boolean; expire?: string }>('/api/renewal-check', p),
  resumeAutopilot: (id: string) => request<Autopilot>(`/api/autopilots/${id}/pause`, { method: 'DELETE' }),
  setAutopilotEmail: (id: string, email: string) =>
    request<Autopilot>(`/api/autopilots/${id}/email`, { method: 'PUT', body: JSON.stringify({ email }) }),
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

function dayAndTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const time = `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  const day =
    d.toDateString() === today.toDateString()
      ? null
      : d.toDateString() === tomorrow.toDateString()
        ? 'demain'
        : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  return { day, time }
}

/** "aujourd'hui à 21h56", "demain à 21h56", "le lundi 26 octobre à 21h56". */
export function clock(iso: string) {
  const { day, time } = dayAndTime(iso)
  if (!day) return `aujourd'hui à ${time}`
  return day === 'demain' ? `demain à ${time}` : `le ${day} à ${time}`
}

/** "jusqu'à 21h56", "jusqu'à demain 21h56", "jusqu'au lundi 26 octobre, 21h56". */
export function until(iso: string) {
  const { day, time } = dayAndTime(iso)
  if (!day) return `jusqu'à ${time}`
  return day === 'demain' ? `jusqu'à demain ${time}` : `jusqu'au ${day}, ${time}`
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
