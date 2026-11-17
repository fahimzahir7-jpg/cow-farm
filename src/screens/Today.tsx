import { useState } from 'react'
import { addDays, onFarm, toDay, today } from '../lib/calc'
import { fmtAfn, fmtNum, useT } from '../lib/i18n'
import { saveMilk, useStore } from '../lib/store'
import type { Expense, MilkSale } from '../lib/types'
import { ExpenseForm, SaleForm } from '../forms'
import { Card, num, useCanWrite } from '../ui'

export default function Today() {
  const { t } = useT()
  const [date, setDate] = useState(today())
  const data = useStore((s) => s.data)
  const canWrite = useCanWrite()
  const [sheet, setSheet] = useState<null | { kind: 'sale'; sale?: MilkSale } | { kind: 'expense'; expense?: Expense }>(null)

  const day = toDay(date)
  const cows = data.animals.filter((a) => a.kind === 'cow' && a.sex !== 'm' && onFarm(a, day)).sort((a, b) => a.tag.localeCompare(b.tag, undefined, { numeric: true }))
  const milk = new Map(data.milk_records.filter((m) => m.record_date === date).map((m) => [m.animal_id, m]))
  const total = cows.reduce((s, c) => s + Number(milk.get(c.id)?.kg ?? 0), 0)
  const sales = data.milk_sales.filter((s) => s.sale_date === date)
  const soldKg = sales.reduce((s, x) => s + Number(x.kg), 0)
  const expenses = data.expenses.filter((e) => e.expense_date === date)

  return (
    <div className="screen">
      <div className="date-bar">
        <button className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="previous day">
          ‹
        </button>
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button className="icon-btn" disabled={date >= today()} onClick={() => setDate(addDays(date, 1))} aria-label="next day">
          ›
        </button>
      </div>

      <Card title={t('milkToday')} action={<span className="pill">{fmtNum(total, 1)} {t('kg')}</span>}>
        {cows.length === 0 && <p className="muted">{t('noCows')}</p>}
        <div className="milk-list">
          {cows.map((c) => (
            <MilkRow
              key={c.id + date}
              label={c.tag}
              unit={t('kg')}
              sub={c.name}
              value={milk.get(c.id)?.kg}
              disabled={!canWrite}
              onSave={(v) => saveMilk(c.id, date, v)}
            />
          ))}
        </div>
      </Card>

      <Card
        title={t('milkSales')}
        action={
          canWrite && (
            <button className="btn small primary" onClick={() => setSheet({ kind: 'sale' })}>
              + {t('addSale')}
            </button>
          )
        }
      >
        {sales.length === 0 ? (
          <p className="muted">–</p>
        ) : (
          <ul className="list">
            {sales.map((s) => (
              <li key={s.id} onClick={() => canWrite && setSheet({ kind: 'sale', sale: s })}>
                <span>
                  {s.buyer}
                  {!s.paid && <span className="tag warn">{t('unpaid')}</span>}
                </span>
                <span className="muted">
                  {fmtNum(Number(s.kg), 1)} {t('kg')} × {fmtNum(Number(s.price_per_kg_afn))}
                </span>
                <b>{fmtAfn(Number(s.kg) * Number(s.price_per_kg_afn))}</b>
              </li>
            ))}
          </ul>
        )}
        {total > 0 && Math.abs(total - soldKg) > 0.01 && (
          <p className="hint">
            {t('totalKg')}: {fmtNum(total, 1)} · {t('milkSales')}: {fmtNum(soldKg, 1)}
          </p>
        )}
      </Card>

      <Card
        title={t('expenses')}
        action={
          canWrite && (
            <button className="btn small primary" onClick={() => setSheet({ kind: 'expense' })}>
              + {t('addExpense')}
            </button>
          )
        }
      >
        {expenses.length === 0 ? (
          <p className="muted">–</p>
        ) : (
          <ul className="list">
            {expenses.map((e) => (
              <li key={e.id} onClick={() => canWrite && setSheet({ kind: 'expense', expense: e })}>
                <span>{t(`cat_${e.category}`)}</span>
                <span className="muted">{e.note}</span>
                <b>{fmtAfn(Number(e.amount_afn))}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sheet?.kind === 'sale' && (
        <SaleForm sale={sheet.sale} date={date} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'expense' && <ExpenseForm expense={sheet.expense} date={date} onClose={() => setSheet(null)} />}
    </div>
  )
}

function MilkRow(p: { label: string; unit: string; sub: string | null; value: number | undefined; disabled: boolean; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(p.value == null ? '' : String(p.value))
  const [flash, setFlash] = useState(false)
  const commit = () => {
    const n = v.trim() === '' ? null : num(v)
    if (n !== null && !(n >= 0)) return
    if ((n ?? undefined) === (p.value == null ? undefined : Number(p.value))) return
    p.onSave(n)
    setFlash(true)
    setTimeout(() => setFlash(false), 900)
  }
  return (
    <label className={'milk-row ' + (flash ? 'flash' : '')}>
      <span className="milk-tag">
        {p.label}
        {p.sub && <small>{p.sub}</small>}
      </span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="0"
        value={v}
        disabled={p.disabled}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit()
            const inputs = [...document.querySelectorAll<HTMLInputElement>('.milk-row input')]
            const i = inputs.indexOf(e.currentTarget)
            inputs[i + 1]?.focus()
          }
        }}
      />
      <span className="unit">{p.unit}</span>
    </label>
  )
}
