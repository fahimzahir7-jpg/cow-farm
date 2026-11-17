import type { Report, Range } from './calc'
import type { FarmData } from './types'
import type { TKey } from './i18n'
import type { PartnerBalance } from '../screens/Payouts'

type Row = (string | number | null)[]

/** Builds and downloads an Excel workbook with the report and all records for the period. */
export async function downloadExcel(data: FarmData, r: Report, range: Range, balances: PartnerBalance[], t: (k: TKey) => string) {
  const XLSX = await import('xlsx')
  const inRange = (d: string) => d >= range.from && d <= range.to
  const tagOf = (id: string | null) => data.animals.find((a) => a.id === id)?.tag ?? ''
  const nameOf = (id: string) => data.partners.find((p) => p.id === id)?.name ?? ''
  const empOf = (id: string | null) => data.employees.find((e) => e.id === id)?.name ?? ''
  const rate = Number(data.settings.afn_per_usd)
  const round = (n: number) => Math.round(n)

  const summary: Row[] = [
    [t('appName')],
    [`${t('from')} ${range.from}`, `${t('to')} ${range.to}`],
    [t('exchangeRate'), rate],
    [],
    [t('milkIncome'), round(r.milkIncome)],
    [t('animalSales'), round(r.animalSales)],
    [t('animalLosses'), -round(r.animalBookValueOut)],
    ...Object.entries(r.expensesByCategory).map(([c, v]) => [t(`cat_${c}` as TKey), -round(v)] as Row),
    [r.profit >= 0 ? t('profit') : t('loss'), round(r.profit), `${round(r.profit / rate)} USD`],
  ]

  const partners: Row[] = [
    [t('partner'), `${t('capital')} (USD)`, `${t('share')} %`, `${t('profitShare')} (AFN)`],
    ...r.partners.map((p) => [p.name, p.capitalUsd, Number(p.capitalPct.toFixed(2)), round(p.profitAfn)]),
    [],
    [t('partner'), t('profitEarned'), t('takenOut'), t('stillToTake')],
    ...balances.map((b) => [b.name, round(b.earned), round(b.taken), round(b.remaining)]),
  ]

  const cows: Row[] = [
    [t('tag'), t('kind'), t('status'), t('boughtFor'), t('daysOnFarm'), `${t('totalMilk')} (kg)`, `${t('avgKg')} (kg)`, t('milkValue'), t('sharedCost'), t('directCost'), t('dailyCost'), t('totalCost'), t('net')],
    ...r.animals.map((x) => [
      x.animal.tag,
      t(`kind_${x.animal.kind}` as TKey),
      t(`status_${x.animal.status}` as TKey),
      Number(x.animal.purchase_price_afn),
      x.daysOnFarm,
      Number(x.kg.toFixed(1)),
      Number(x.avgKg.toFixed(2)),
      round(x.milkValue),
      round(x.sharedCost),
      round(x.directCost),
      round(x.avgDailyCost),
      round(x.totalCost),
      round(x.net),
    ]),
  ]

  const expenses: Row[] = [
    [t('date'), t('category'), t('amountAfn'), t('forAnimal'), t('employee'), t('from'), t('to'), t('note')],
    ...data.expenses
      .filter((e) => inRange(e.expense_date))
      .sort((a, b) => a.expense_date.localeCompare(b.expense_date))
      .map((e) => [e.expense_date, t(`cat_${e.category}` as TKey), Number(e.amount_afn), e.animal_id ? tagOf(e.animal_id) : t('sharedAll'), empOf(e.employee_id), e.period_start, e.period_end, e.note]),
  ]

  const sales: Row[] = [
    [t('date'), t('buyer'), 'kg', t('pricePerKg'), t('amount'), t('paid'), t('note')],
    ...data.milk_sales
      .filter((s) => inRange(s.sale_date))
      .sort((a, b) => a.sale_date.localeCompare(b.sale_date))
      .map((s) => [s.sale_date, s.buyer, Number(s.kg), Number(s.price_per_kg_afn), round(Number(s.kg) * Number(s.price_per_kg_afn)), s.paid ? '✓' : '✗', s.note]),
  ]

  // Milk per cow: one row per day, one column per cow
  const cowsWithMilk = data.animals.filter((a) => data.milk_records.some((m) => m.animal_id === a.id && inRange(m.record_date)))
  const days = [...new Set(data.milk_records.filter((m) => inRange(m.record_date)).map((m) => m.record_date))].sort()
  const byKey = new Map(data.milk_records.map((m) => [m.animal_id + m.record_date, Number(m.kg)]))
  const milk: Row[] = [
    [t('date'), ...cowsWithMilk.map((a) => a.tag), t('totalKg')],
    ...days.map((d) => {
      const vals = cowsWithMilk.map((a) => byKey.get(a.id + d) ?? null)
      return [d, ...vals, vals.reduce<number>((s, v) => s + (v ?? 0), 0)]
    }),
  ]

  const payouts: Row[] = [
    [t('date'), t('partner'), t('amountAfn'), t('note')],
    ...(data.profit_withdrawals ?? [])
      .filter((w) => inRange(w.withdrawal_date))
      .sort((a, b) => a.withdrawal_date.localeCompare(b.withdrawal_date))
      .map((w) => [w.withdrawal_date, nameOf(w.partner_id), Number(w.amount_afn), w.note]),
  ]

  const capital: Row[] = [
    [t('date'), t('partner'), t('amountUsd'), t('note')],
    ...[...data.capital_entries].sort((a, b) => a.entry_date.localeCompare(b.entry_date)).map((c) => [c.entry_date, nameOf(c.partner_id), Number(c.amount_usd), c.note]),
  ]

  const wb = XLSX.utils.book_new()
  const add = (name: string, rows: Row[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    const widths = rows.reduce<number[]>((w, row) => row.map((c, i) => Math.max(w[i] ?? 8, Math.min(40, String(c ?? '').length + 2))), [])
    ws['!cols'] = widths.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  add('Summary', summary)
  add('Partners', partners)
  add('Cows', cows)
  add('Milk per cow', milk)
  add('Milk sales', sales)
  add('Expenses', expenses)
  add('Profit taken out', payouts)
  add('Capital', capital)
  XLSX.writeFile(wb, `cow-farm-${range.from}_${range.to}.xlsx`)
}
