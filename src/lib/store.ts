import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { useSyncExternalStore } from 'react'
import type { FarmData, Profile, Settings } from './types'
import { fromDay, monthEnd, toDay, today } from './calc'

/**
 * Local-first store.
 *  - All farm data is small, so it is loaded whole and cached in localStorage.
 *  - Every change is applied locally at once and queued in an outbox.
 *  - The outbox is sent to Supabase whenever the phone is online.
 * Without Supabase settings the app runs in demo mode on this device only.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const demoMode = !supabase

type Table = 'profit_withdrawals' | 'employees' | 'partners' | 'capital_entries' | 'animals' | 'milk_records' | 'milk_sales' | 'expenses' | 'settings'

interface Op {
  opId: string
  table: Table
  kind: 'upsert' | 'delete'
  row: Record<string, unknown>
  at: number
}

interface State {
  data: FarmData
  profile: Profile | null
  outbox: Op[]
  online: boolean
  syncing: boolean
  lastSync: number | null
  error: string | null
  loaded: boolean
}

const DEFAULT_SETTINGS: Settings = {
  id: 1,
  afn_per_usd: 70,
  calf_share: 0.5,
  rate_updated_at: null,
}

const emptyData = (): FarmData => ({
  profit_withdrawals: [],
  employees: [],
  partners: [],
  capital_entries: [],
  settings: { ...DEFAULT_SETTINGS },
  animals: [],
  milk_records: [],
  milk_sales: [],
  expenses: [],
})

const LS_KEY = 'cowfarm.v1'

function loadLocal(): Partial<State> {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  return {}
}

const local = loadLocal()
let state: State = {
  data: local.data ?? emptyData(),
  profile: local.profile ?? null,
  outbox: local.outbox ?? [],
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  lastSync: local.lastSync ?? null,
  error: null,
  loaded: !!local.data,
}

if (demoMode && !local.data) {
  state.data = demoSeed()
  state.profile = { id: 'demo', full_name: 'Demo', role: 'admin', language: 'en' }
  state.loaded = true
}

const listeners = new Set<() => void>()
function set(patch: Partial<State>) {
  state = { ...state, ...patch }
  try {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify({ data: state.data, profile: state.profile, outbox: state.outbox, lastSync: state.lastSync }),
    )
  } catch {
    /* storage full or blocked */
  }
  listeners.forEach((l) => l())
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => sel(state),
  )
}
export const getState = () => state

export function uid() {
  return crypto.randomUUID()
}

// ---------- writes ----------

function applyLocal(data: FarmData, op: Op): FarmData {
  if (op.table === 'settings') {
    return { ...data, settings: { ...data.settings, ...(op.row as Partial<Settings>) } }
  }
  const list = data[op.table] as unknown as { id: string }[]
  const id = op.row.id as string
  let next: { id: string }[]
  if (op.kind === 'delete') next = list.filter((r) => r.id !== id)
  else {
    const i = list.findIndex((r) => r.id === id)
    next = i >= 0 ? list.map((r, j) => (j === i ? { ...r, ...op.row } : r)) : [...list, op.row as unknown as { id: string }]
  }
  return { ...data, [op.table]: next }
}

export function save<T extends { id: string }>(table: Exclude<Table, 'settings'>, row: T) {
  queue({ opId: uid(), table, kind: 'upsert', row: { ...row }, at: Date.now() })
}
export function remove(table: Exclude<Table, 'settings'>, id: string) {
  queue({ opId: uid(), table, kind: 'delete', row: { id }, at: Date.now() })
}
export function saveSettings(patch: Partial<Settings>) {
  queue({ opId: uid(), table: 'settings', kind: 'upsert', row: { id: 1, ...patch }, at: Date.now() })
}

/** Milk is unique per cow per day: replace any existing record for that day. */
export function saveMilk(animal_id: string, record_date: string, kg: number | null) {
  const existing = state.data.milk_records.find((m) => m.animal_id === animal_id && m.record_date === record_date)
  if (kg === null || Number.isNaN(kg)) {
    if (existing) remove('milk_records', existing.id)
    return
  }
  save('milk_records', { id: existing?.id ?? uid(), animal_id, record_date, kg })
}

function queue(op: Op) {
  set({
    data: applyLocal(state.data, op),
    outbox: demoMode ? [] : [...state.outbox, op],
  })
  void sync()
}

// ---------- sync ----------

let syncing: Promise<void> | null = null

export function sync(): Promise<void> {
  if (!supabase || !state.profile) return Promise.resolve()
  if (syncing) return syncing
  syncing = (async () => {
    set({ syncing: true, error: null })
    try {
      await flush()
      await pull()
      set({ lastSync: Date.now(), online: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      set({ error: msg, online: navigator.onLine })
    } finally {
      set({ syncing: false })
      syncing = null
    }
  })()
  return syncing
}

async function flush() {
  while (state.outbox.length) {
    const op = state.outbox[0]
    let error: { message: string; code?: string } | null = null
    if (op.kind === 'delete') {
      ;({ error } = await supabase!.from(op.table).delete().eq('id', op.row.id as string))
    } else if (op.table === 'milk_records') {
      ;({ error } = await supabase!.from(op.table).upsert(op.row, { onConflict: 'animal_id,record_date' }))
    } else if (op.table === 'settings') {
      ;({ error } = await supabase!.from('settings').update(op.row).eq('id', 1))
    } else {
      ;({ error } = await supabase!.from(op.table).upsert(op.row))
    }
    if (error) {
      // Network problems: stop and retry later. Data problems: drop the op so the queue is not stuck.
      if (!error.code || error.message.includes('Failed to fetch')) throw new Error(error.message)
      console.warn('Dropped change rejected by server', op, error)
      set({ error: error.message })
    }
    set({ outbox: state.outbox.slice(1) })
  }
}

async function pull() {
  const tables = ['profit_withdrawals', 'employees', 'partners', 'capital_entries', 'animals', 'milk_records', 'milk_sales', 'expenses'] as const
  const res = await Promise.all([
    ...tables.map((t) => fetchAll(t)),
    supabase!.from('settings').select('*').eq('id', 1).single(),
  ])
  const settingsRes = res[tables.length] as { data: Settings | null; error: unknown }
  if (settingsRes.error) throw settingsRes.error
  if (state.outbox.length) return // new local edits arrived meanwhile; next sync will pull
  const data = emptyData()
  tables.forEach((t, i) => {
    ;(data as unknown as Record<string, unknown>)[t] = res[i]
  })
  data.settings = settingsRes.data ?? DEFAULT_SETTINGS
  set({ data, loaded: true })
}

async function fetchAll(table: string) {
  const out: unknown[] = []
  const page = 1000
  for (let fromRow = 0; ; fromRow += page) {
    const { data, error } = await supabase!.from(table).select('*').range(fromRow, fromRow + page - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return out
}

// ---------- exchange rate ----------

/**
 * Refreshes the AFN per USD rate once a day from a free public rates feed
 * (open.er-api.com, updated daily from central bank and market sources).
 * Any logged-in user's phone can do it; the database only accepts sane values.
 */
export async function refreshRate(force = false) {
  const s = state.data.settings
  const age = s.rate_updated_at ? Date.now() - Date.parse(s.rate_updated_at) : Infinity
  if (!force && age < 20 * 3600_000) return
  if (typeof navigator !== 'undefined' && !navigator.onLine) return
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    const json = await res.json()
    const rate = Number(json?.rates?.AFN)
    if (!(rate > 20 && rate < 500)) return
    const rounded = Math.round(rate * 100) / 100
    const at = new Date().toISOString()
    if (supabase) {
      const { error } = await supabase.rpc('set_exchange_rate', { rate: rounded })
      if (error) return
    }
    set({ data: { ...state.data, settings: { ...state.data.settings, afn_per_usd: rounded, rate_updated_at: at } } })
  } catch {
    /* offline or feed down: keep the last rate */
  }
}

// ---------- auth ----------

/** Users log in with a short username; it maps to username@cowfarm.app in Supabase Auth. */
export const usernameToEmail = (u: string) => (u.includes('@') ? u.trim() : `${u.trim().toLowerCase()}@cowfarm.app`)

export async function login(username: string, password: string) {
  if (!supabase) return
  const { data, error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password })
  if (error) throw error
  await loadProfile(data.user.id)
}

export async function loadProfile(userId: string) {
  const { data, error } = await supabase!.from('profiles').select('*').eq('id', userId).single()
  if (error || !data) throw new Error('This account has no farm profile yet. Ask the admin to add you.')
  set({ profile: data as Profile })
  await sync()
}

export async function changePassword(pw: string) {
  if (!supabase) return
  const { error } = await supabase.auth.updateUser({ password: pw })
  if (error) throw error
}

export async function logout() {
  if (supabase) await supabase.auth.signOut()
  if (state.outbox.length && !confirm('Some changes are not uploaded yet. Log out anyway and lose them?')) return
  localStorage.removeItem(LS_KEY)
  set({ profile: null, data: emptyData(), outbox: [], loaded: false })
}

export function resetDemo() {
  localStorage.removeItem(LS_KEY)
  set({ data: demoSeed(), outbox: [] })
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    set({ online: true })
    void sync()
  })
  window.addEventListener('offline', () => set({ online: false }))
  setInterval(() => {
    if (state.outbox.length && navigator.onLine) void sync()
    void refreshRate()
  }, 30_000)
  setTimeout(() => void refreshRate(), 3000)
  if (supabase) {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void loadProfile(data.session.user.id).catch(() => {
          /* offline: keep cached profile */
        })
      } else if (state.profile) {
        set({ profile: null })
      }
    })
  }
}

// ---------- demo data ----------

function demoSeed(): FarmData {
  const d = emptyData()
  const haji = { id: uid(), name: 'Haji Zahir' }
  const ala = { id: uid(), name: 'Alawodin' }
  d.partners = [haji, ala]
  d.settings = { ...DEFAULT_SETTINGS }
  const worker = { id: uid(), name: 'Gul Agha', job: 'Farm worker', monthly_salary_afn: 12000, start_date: '2026-09-01', active: true }
  d.employees = [worker]
  d.profit_withdrawals = [
    { id: uid(), partner_id: haji.id, withdrawal_date: '2026-11-05', amount_afn: 20000, note: 'Cash to Haji' },
  ]
  d.capital_entries = [
    { id: uid(), partner_id: haji.id, entry_date: '2026-09-01', amount_usd: 12000, note: 'Initial investment' },
    { id: uid(), partner_id: ala.id, entry_date: '2026-09-01', amount_usd: 12000, note: 'Initial investment' },
    { id: uid(), partner_id: haji.id, entry_date: '2026-10-15', amount_usd: 3000, note: 'Added capital' },
  ]
  const cow = (tag: string, price: number, on: string, breed: string) => ({
    id: uid(),
    tag,
    name: null,
    kind: 'cow' as const,
    sex: 'f' as const,
    breed,
    mother_id: null,
    origin: 'bought' as const,
    acquired_on: on,
    purchase_price_afn: price,
    birth_date: null,
    status: 'active' as const,
    exit_date: null,
    sale_price_afn: null,
    buyer: null,
    notes: null,
  })
  const c1 = cow('C-01', 95000, '2026-09-02', 'Holstein cross')
  const c2 = cow('C-02', 88000, '2026-09-02', 'Local')
  const c3 = cow('C-03', 120000, '2026-09-10', 'Jersey cross')
  const c4 = cow('C-04', 105000, '2026-10-20', 'Holstein cross')
  const calf = {
    ...cow('C-03-K1', 0, '2026-09-10', 'Jersey cross'),
    kind: 'calf' as const,
    sex: 'm' as const,
    mother_id: c3.id,
    origin: 'came_with_mother' as const,
  }
  d.animals = [c1, c2, c3, c4, calf]
  const start = toDay('2026-09-02')
  const end = toDay(today())
  const base: Record<string, number> = { [c1.id]: 11, [c2.id]: 7, [c3.id]: 9, [c4.id]: 12 }
  for (let day = start; day <= end; day++) {
    const date = fromDay(day)
    let total = 0
    for (const c of [c1, c2, c3, c4]) {
      if (toDay(c.acquired_on) > day) continue
      const l = Math.round((base[c.id] + Math.sin(day + base[c.id]) * 1.5) * 2) / 2
      total += l
      d.milk_records.push({ id: uid(), animal_id: c.id, record_date: date, kg: l })
    }
    d.milk_sales.push({
      id: uid(),
      sale_date: date,
      buyer: day % 2 ? 'Karimi shop' : 'Bazaar dairy',
      kg: total,
      price_per_kg_afn: 40,
      paid: true,
      note: null,
    })
    if (day % 7 === 0) {
      d.expenses.push({ id: uid(), expense_date: date, category: 'feed', amount_afn: 4500, animal_id: null, employee_id: null, period_start: date, period_end: fromDay(day + 6), note: 'Weekly feed' })
    }
  }
  for (const m of ['2026-09-01', '2026-10-01', '2026-11-01']) {
    d.expenses.push({ id: uid(), expense_date: m, category: 'rent', amount_afn: 15000, animal_id: null, employee_id: null, period_start: m, period_end: monthEnd(m), note: null })
    d.expenses.push({ id: uid(), expense_date: m, category: 'wages', amount_afn: 12000, animal_id: null, employee_id: worker.id, period_start: m, period_end: monthEnd(m), note: 'Worker salary' })
    d.expenses.push({ id: uid(), expense_date: m, category: 'electricity', amount_afn: 2500, animal_id: null, employee_id: null, period_start: m, period_end: monthEnd(m), note: null })
  }
  d.expenses.push({ id: uid(), expense_date: '2026-10-05', category: 'vet', amount_afn: 3000, animal_id: c2.id, employee_id: null, period_start: '2026-10-05', period_end: '2026-10-05', note: 'Injection' })
  return d
}

