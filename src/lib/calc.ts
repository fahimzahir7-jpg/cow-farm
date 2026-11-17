import type { Animal, FarmData } from './types'

// ---- date helpers (all dates are YYYY-MM-DD strings, treated as UTC days) ----
const DAY = 86_400_000
export const toDay = (s: string) => Math.floor(Date.parse(s + 'T00:00:00Z') / DAY)
export const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
export const today = () => {
  const d = new Date()
  return fromDay(Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / DAY))
}
export const addDays = (s: string, n: number) => fromDay(toDay(s) + n)
export const monthStart = (s: string) => s.slice(0, 8) + '01'
export const monthEnd = (s: string) => {
  const [y, m] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export interface Range {
  from: string
  to: string
}

/** Last day the animal is counted on the farm (inclusive), or null if still there. */
const lastDay = (a: Animal) => (a.status === 'active' || !a.exit_date ? null : toDay(a.exit_date) - 1)

export const onFarm = (a: Animal, day: number) => {
  if (toDay(a.acquired_on) > day) return false
  const last = lastDay(a)
  return last === null || day <= last
}

export const animalWeight = (a: Animal, calfShare: number) => (a.kind === 'calf' ? calfShare : 1)

export interface AnimalAccount {
  animal: Animal
  daysOnFarm: number
  sharedCost: number
  directCost: number
  totalCost: number
  avgDailyCost: number
  kg: number
  milkDays: number
  avgKg: number
  milkValue: number
  /** milk value + sale price - purchase price - costs */
  net: number
}

export interface PartnerShare {
  partnerId: string
  name: string
  capitalUsd: number
  capitalPct: number
  profitAfn: number
}

export interface Report {
  range: Range
  milkKgRecorded: number
  milkKgSold: number
  milkIncome: number
  avgPricePerKg: number
  animalSales: number
  animalBookValueOut: number
  expensesByCategory: Record<string, number>
  totalExpenses: number
  unallocatedShared: number
  profit: number
  partners: PartnerShare[]
  animals: AnimalAccount[]
  headcount: { cows: number; calves: number; bulls: number }
}

/**
 * Builds the full report for a date range.
 *
 * Rules:
 *  - Shared expenses (no animal) are spread evenly over the days of their period,
 *    then split each day across the animals on the farm that day by weight
 *    (cow/bull = 1, calf = settings.calf_share).
 *  - Each cow's milk is valued at the average sale price per litre for the range.
 *  - Profit = milk sales + animal sale prices - purchase price of animals that left
 *    (sold or died) - expenses. Buying an animal is not a loss; it becomes one only
 *    if it dies or is sold for less than it cost.
 *  - Each day's profit is split by the partners' capital as of that day. Anyone paid
 *    for work (including a partner) is paid through a staff salary account, which is
 *    an expense like any other.
 */
export function buildReport(data: FarmData, range: Range): Report {
  const from = toDay(range.from)
  const to = toDay(range.to)
  const { settings } = data
  const calfShare = Number(settings.calf_share)

  const acc = new Map<string, AnimalAccount>()
  for (const a of data.animals) {
    acc.set(a.id, {
      animal: a,
      daysOnFarm: 0,
      sharedCost: 0,
      directCost: 0,
      totalCost: 0,
      avgDailyCost: 0,
      kg: 0,
      milkDays: 0,
      avgKg: 0,
      milkValue: 0,
      net: 0,
    })
  }

  // Daily profit buckets (index = day - from)
  const n = Math.max(0, to - from + 1)
  const daily = new Float64Array(n)

  // Animals present each day and their total weight
  const present: { a: Animal; w: number }[][] = []
  const totalW = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const day = from + i
    const list: { a: Animal; w: number }[] = []
    let w = 0
    for (const a of data.animals) {
      if (onFarm(a, day)) {
        const aw = animalWeight(a, calfShare)
        list.push({ a, w: aw })
        w += aw
        acc.get(a.id)!.daysOnFarm++
      }
    }
    present.push(list)
    totalW[i] = w
  }

  // Expenses
  const expensesByCategory: Record<string, number> = {}
  let totalExpenses = 0
  let unallocatedShared = 0
  for (const e of data.expenses) {
    const ps = toDay(e.period_start)
    const pe = toDay(e.period_end)
    const perDay = Number(e.amount_afn) / (pe - ps + 1)
    const s = Math.max(ps, from)
    const t = Math.min(pe, to)
    if (s > t) continue
    for (let day = s; day <= t; day++) {
      const i = day - from
      daily[i] -= perDay
      totalExpenses += perDay
      expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + perDay
      if (e.animal_id && acc.has(e.animal_id)) {
        acc.get(e.animal_id)!.directCost += perDay
      } else if (totalW[i] > 0) {
        for (const { a, w } of present[i]) acc.get(a.id)!.sharedCost += (perDay * w) / totalW[i]
      } else {
        unallocatedShared += perDay
      }
    }
  }

  // Milk sales
  let milkIncome = 0
  let milkKgSold = 0
  for (const s of data.milk_sales) {
    const d = toDay(s.sale_date)
    if (d < from || d > to) continue
    const amt = Number(s.kg) * Number(s.price_per_kg_afn)
    milkIncome += amt
    milkKgSold += Number(s.kg)
    daily[d - from] += amt
  }
  const avgPricePerKg = milkKgSold > 0 ? milkIncome / milkKgSold : lastKnownPrice(data)

  // Milk records
  let milkKgRecorded = 0
  for (const m of data.milk_records) {
    const d = toDay(m.record_date)
    if (d < from || d > to) continue
    const a = acc.get(m.animal_id)
    if (!a) continue
    a.kg += Number(m.kg)
    a.milkDays++
    milkKgRecorded += Number(m.kg)
  }

  // Animals leaving (sold / died)
  let animalSales = 0
  let animalBookValueOut = 0
  for (const a of data.animals) {
    if (a.status === 'active' || !a.exit_date) continue
    const d = toDay(a.exit_date)
    if (d < from || d > to) continue
    const sale = a.status === 'sold' ? Number(a.sale_price_afn ?? 0) : 0
    const book = Number(a.purchase_price_afn)
    animalSales += sale
    animalBookValueOut += book
    daily[d - from] += sale - book
  }

  // Finish per-animal accounts
  for (const x of acc.values()) {
    x.totalCost = x.sharedCost + x.directCost
    x.avgDailyCost = x.daysOnFarm ? x.totalCost / x.daysOnFarm : 0
    x.avgKg = x.milkDays ? x.kg / x.milkDays : 0
    x.milkValue = x.kg * avgPricePerKg
    const a = x.animal
    const left = a.status !== 'active' && a.exit_date && toDay(a.exit_date) >= from && toDay(a.exit_date) <= to
    const sale = left && a.status === 'sold' ? Number(a.sale_price_afn ?? 0) : 0
    const bought = toDay(a.acquired_on) >= from && toDay(a.acquired_on) <= to ? Number(a.purchase_price_afn) : 0
    x.net = x.milkValue + sale - bought - x.totalCost
  }

  // Partner split
  const partners = splitProfit(data, from, daily)

  const profit = daily.reduce((s, v) => s + v, 0)

  const headcount = { cows: 0, calves: 0, bulls: 0 }
  for (const { a } of present[n - 1] ?? []) {
    if (a.kind === 'cow') headcount.cows++
    else if (a.kind === 'calf') headcount.calves++
    else headcount.bulls++
  }

  return {
    range,
    milkKgRecorded,
    milkKgSold,
    milkIncome,
    avgPricePerKg,
    animalSales,
    animalBookValueOut,
    expensesByCategory,
    totalExpenses,
    unallocatedShared,
    profit,
    partners,
    animals: [...acc.values()].filter((x) => x.daysOnFarm > 0 || x.kg > 0),
    headcount,
  }
}

function lastKnownPrice(data: FarmData) {
  const s = [...data.milk_sales].sort((a, b) => b.sale_date.localeCompare(a.sale_date))[0]
  return s ? Number(s.price_per_kg_afn) : 0
}

/** Capital (USD) per partner as of a day. */
export function capitalAsOf(data: FarmData, day: number) {
  const m = new Map<string, number>()
  for (const p of data.partners) m.set(p.id, 0)
  for (const c of data.capital_entries) {
    if (toDay(c.entry_date) <= day) m.set(c.partner_id, (m.get(c.partner_id) ?? 0) + Number(c.amount_usd))
  }
  return m
}

function splitProfit(data: FarmData, from: number, daily: Float64Array): PartnerShare[] {
  const out = new Map<string, PartnerShare>()
  for (const p of data.partners) {
    out.set(p.id, { partnerId: p.id, name: p.name, capitalUsd: 0, capitalPct: 0, profitAfn: 0 })
  }

  // Capital changes rarely, so walk day by day but recompute only when needed.
  const changeDays = [...new Set(data.capital_entries.map((c) => toDay(c.entry_date)))].sort((a, b) => a - b)
  let cap = capitalAsOf(data, from)
  let capTotal = [...cap.values()].reduce((s, v) => s + v, 0)
  let ci = changeDays.findIndex((d) => d > from)
  if (ci < 0) ci = changeDays.length

  for (let i = 0; i < daily.length; i++) {
    const day = from + i
    while (ci < changeDays.length && changeDays[ci] <= day) {
      cap = capitalAsOf(data, day)
      capTotal = [...cap.values()].reduce((s, v) => s + v, 0)
      ci++
    }
    const p = daily[i]
    if (capTotal <= 0) continue
    for (const [pid, c] of cap) {
      const row = out.get(pid)
      if (row) row.profitAfn += (p * c) / capTotal
    }
  }

  const end = from + daily.length - 1
  const capEnd = capitalAsOf(data, end)
  const capEndTotal = [...capEnd.values()].reduce((s, v) => s + v, 0)
  for (const row of out.values()) {
    row.capitalUsd = capEnd.get(row.partnerId) ?? 0
    row.capitalPct = capEndTotal ? (row.capitalUsd / capEndTotal) * 100 : 0
  }
  return [...out.values()]
}

/** Overall cash position since the start, in AFN. Capital converted at the current rate. */
export function cashPosition(data: FarmData) {
  const rate = Number(data.settings.afn_per_usd)
  const capitalUsd = data.capital_entries.reduce((s, c) => s + Number(c.amount_usd), 0)
  const milk = data.milk_sales.filter((s) => s.paid).reduce((s, x) => s + Number(x.kg) * Number(x.price_per_kg_afn), 0)
  const unpaid = data.milk_sales.filter((s) => !s.paid).reduce((s, x) => s + Number(x.kg) * Number(x.price_per_kg_afn), 0)
  const sales = data.animals.reduce((s, a) => s + (a.status === 'sold' ? Number(a.sale_price_afn ?? 0) : 0), 0)
  const purchases = data.animals.reduce((s, a) => s + Number(a.purchase_price_afn), 0)
  const expenses = data.expenses.reduce((s, e) => s + Number(e.amount_afn), 0)
  const capitalAfn = capitalUsd * rate
  return {
    capitalUsd,
    capitalAfn,
    milk,
    unpaid,
    sales,
    purchases,
    expenses,
    cash: capitalAfn + milk + sales - purchases - expenses,
  }
}
