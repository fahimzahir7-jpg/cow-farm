import { useState } from 'react'
import { monthStart, today } from '../lib/calc'
import { fmtAfn, fmtNum, useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Expense, MilkSale } from '../lib/types'
import { ExpenseForm, SaleForm } from '../forms'
import Staff from './Staff'
import { Card, downloadCsv, useCanWrite } from '../ui'

export default function Money() {
  const { t } = useT()
  const data = useStore((s) => s.data)
  const canWrite = useCanWrite()
  const [tab, setTab] = useState<'expenses' | 'sales' | 'staff'>('expenses')
  const [month, setMonth] = useState(today().slice(0, 7))
  const [sheet, setSheet] = useState<null | { kind: 'sale'; sale?: MilkSale } | { kind: 'expense'; expense?: Expense }>(null)
  const months = [...new Set([today().slice(0, 7), ...data.expenses.map((e) => e.expense_date.slice(0, 7)), ...data.milk_sales.map((s) => s.sale_date.slice(0, 7))])].sort().reverse()
  const tagOf = (id: string | null) => data.animals.find((a) => a.id === id)?.tag

  const expenses = data.expenses.filter((e) => e.expense_date.startsWith(month)).sort((a, b) => b.expense_date.localeCompare(a.expense_date))
  const sales = data.milk_sales.filter((s) => s.sale_date.startsWith(month)).sort((a, b) => b.sale_date.localeCompare(a.sale_date))
  const expTotal = expenses.reduce((s, e) => s + Number(e.amount_afn), 0)
  const saleTotal = sales.reduce((s, x) => s + Number(x.kg) * Number(x.price_per_kg_afn), 0)
  const unpaid = sales.filter((s) => !s.paid)

  const exportCsv = () => {
    if (tab === 'expenses')
      downloadCsv(`expenses-${month}.csv`, [
        ['date', 'category', 'amount_afn', 'cow', 'period_start', 'period_end', 'note'],
        ...expenses.map((e) => [e.expense_date, e.category, e.amount_afn, tagOf(e.animal_id) ?? 'shared', e.period_start, e.period_end, e.note]),
      ])
    else
      downloadCsv(`milk-sales-${month}.csv`, [
        ['date', 'buyer', 'kg', 'price_per_kg_afn', 'amount_afn', 'paid', 'note'],
        ...sales.map((s) => [s.sale_date, s.buyer, s.kg, s.price_per_kg_afn, Number(s.kg) * Number(s.price_per_kg_afn), s.paid ? 'yes' : 'no', s.note]),
      ])
  }

  const seg = (
    <div className="segmented">
      {(['expenses', 'sales', 'staff'] as const).map((x) => (
        <button key={x} className={tab === x ? 'on' : ''} onClick={() => setTab(x)}>
          {t(x === 'sales' ? 'milkSales' : x)}
        </button>
      ))}
    </div>
  )
  if (tab === 'staff')
    return (
      <div className="screen">
        {seg}
        <Staff />
      </div>
    )

  return (
    <div className="screen">
      {seg}
      <div className="toolbar">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        {canWrite && (
          <button className="btn primary" onClick={() => setSheet(tab === 'expenses' ? { kind: 'expense' } : { kind: 'sale' })}>
            + {tab === 'expenses' ? t('addExpense') : t('addSale')}
          </button>
        )}
      </div>

      {tab === 'expenses' ? (
        <Card title={`${t('totalExpenses')}: ${fmtAfn(expTotal)}`} action={<button className="btn small ghost" onClick={exportCsv}>{t('exportCsv')}</button>}>
          <ul className="list">
            {expenses.map((e) => (
              <li key={e.id} onClick={() => canWrite && setSheet({ kind: 'expense', expense: e })}>
                <span>
                  <span className="muted small">{e.expense_date.slice(5)}</span> {t(`cat_${e.category}`)}
                </span>
                <span className="muted">
                  {e.animal_id ? tagOf(e.animal_id) : t('sharedAll')}
                  {e.note ? ` · ${e.note}` : ''}
                </span>
                <b>{fmtAfn(Number(e.amount_afn))}</b>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card title={`${t('milkIncome')}: ${fmtAfn(saleTotal)}`} action={<button className="btn small ghost" onClick={exportCsv}>{t('exportCsv')}</button>}>
          {unpaid.length > 0 && (
            <p className="hint warn-text">
              {t('unpaid')}: {fmtAfn(unpaid.reduce((s, x) => s + Number(x.kg) * Number(x.price_per_kg_afn), 0))}
            </p>
          )}
          <ul className="list">
            {sales.map((s) => (
              <li key={s.id} onClick={() => canWrite && setSheet({ kind: 'sale', sale: s })}>
                <span>
                  <span className="muted small">{s.sale_date.slice(5)}</span> {s.buyer}
                  {!s.paid && <span className="tag warn">{t('unpaid')}</span>}
                </span>
                <span className="muted">
                  {fmtNum(Number(s.kg), 1)} {t('kg')} × {fmtNum(Number(s.price_per_kg_afn))}
                </span>
                <b>{fmtAfn(Number(s.kg) * Number(s.price_per_kg_afn))}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {sheet?.kind === 'sale' && <SaleForm sale={sheet.sale} date={month === today().slice(0, 7) ? today() : monthStart(month + '-01')} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'expense' && <ExpenseForm expense={sheet.expense} date={month === today().slice(0, 7) ? today() : month + '-01'} onClose={() => setSheet(null)} />}
    </div>
  )
}
