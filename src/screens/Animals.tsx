import { useMemo, useState } from 'react'
import { addDays, buildReport, today, toDay } from '../lib/calc'
import { fmtAfn, fmtNum, useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Animal, FarmData } from '../lib/types'
import { AnimalForm, ExitForm, ExpenseForm } from '../forms'
import { Card, Stat, go, useCanWrite } from '../ui'

/** Lifetime account for one animal, from the day it arrived until it left (or today). */
export function animalAccount(data: FarmData, a: Animal) {
  const end = a.status !== 'active' && a.exit_date ? a.exit_date : today()
  const r = buildReport(data, { from: a.acquired_on, to: end < a.acquired_on ? a.acquired_on : end })
  return r.animals.find((x) => x.animal.id === a.id)
}

export default function Animals() {
  const { t } = useT()
  const data = useStore((s) => s.data)
  const canWrite = useCanWrite()
  const [showGone, setShowGone] = useState(false)
  const [adding, setAdding] = useState(false)

  const rows = useMemo(() => {
    const from = addDays(today(), -29)
    const r = buildReport(data, { from, to: today() })
    const recent = new Map(r.animals.map((x) => [x.animal.id, x]))
    return data.animals
      .filter((a) => showGone || a.status === 'active')
      .sort((a, b) => (a.status === b.status ? a.tag.localeCompare(b.tag, undefined, { numeric: true }) : a.status === 'active' ? -1 : 1))
      .map((a) => ({ a, r: recent.get(a.id) }))
  }, [data, showGone])

  return (
    <div className="screen">
      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={showGone} onChange={(e) => setShowGone(e.target.checked)} /> {t('showGone')}
        </label>
        {canWrite && (
          <button className="btn primary" onClick={() => setAdding(true)}>
            + {t('addAnimal')}
          </button>
        )}
      </div>
      <p className="hint">{t('last30')}</p>
      <div className="animal-grid">
        {rows.map(({ a, r }) => (
          <button key={a.id} className={'animal-card ' + a.status} onClick={() => go('animals/' + a.id)}>
            <div className="animal-top">
              <b>{a.tag}</b>
              <span className="tag">{t(`kind_${a.kind}`)}</span>
              {a.status !== 'active' && <span className="tag warn">{t(`status_${a.status}`)}</span>}
            </div>
            {a.name && <div className="muted">{a.name}</div>}
            <div className="animal-nums">
              <span>
                {t('boughtFor')}: <b>{a.origin === 'bought' ? fmtAfn(Number(a.purchase_price_afn)) : t(`origin_${a.origin}`)}</b>
              </span>
              {r && a.kind === 'cow' && (
                <span>
                  {t('avgKg')}: <b>{fmtNum(r.avgKg, 1)} {t('kg')}</b>
                </span>
              )}
              {r && (
                <span>
                  {t('dailyCost')}: <b>{fmtAfn(r.avgDailyCost)}</b>
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
      {adding && (
        <AnimalForm
          onClose={(id) => {
            setAdding(false)
            if (id) go('animals/' + id)
          }}
        />
      )}
    </div>
  )
}

export function AnimalDetail({ id }: { id: string }) {
  const { t } = useT()
  const data = useStore((s) => s.data)
  const canWrite = useCanWrite()
  const [sheet, setSheet] = useState<null | 'edit' | 'sold' | 'dead' | 'calf' | 'expense'>(null)
  const a = data.animals.find((x) => x.id === id)
  const acc = useMemo(() => (a ? animalAccount(data, a) : undefined), [data, a])
  if (!a) {
    return (
      <div className="screen">
        <button className="btn ghost" onClick={() => go('animals')}>
          ‹ {t('back')}
        </button>
      </div>
    )
  }
  const mother = data.animals.find((x) => x.id === a.mother_id)
  const calves = data.animals.filter((x) => x.mother_id === a.id)
  const last30 = lastDaysMilk(data, a.id, 30)
  const maxL = Math.max(1, ...last30.map((d) => d.l))
  const directExpenses = data.expenses.filter((e) => e.animal_id === a.id).sort((x, y) => y.expense_date.localeCompare(x.expense_date))
  const net = acc?.net ?? 0

  return (
    <div className="screen">
      <div className="toolbar">
        <button className="btn ghost" onClick={() => go('animals')}>
          ‹ {t('back')}
        </button>
        {canWrite && (
          <button className="btn" onClick={() => setSheet('edit')}>
            {t('edit')}
          </button>
        )}
      </div>
      <div className="animal-header">
        <h1>
          {a.tag} {a.name && <small>{a.name}</small>}
        </h1>
        <div className="tags">
          <span className="tag">{t(`kind_${a.kind}`)}</span>
          {a.breed && <span className="tag">{a.breed}</span>}
          <span className={'tag ' + (a.status === 'active' ? 'ok' : 'warn')}>{t(`status_${a.status}`)}</span>
          {mother && (
            <button className="tag link" onClick={() => go('animals/' + mother.id)}>
              {t('mother')}: {mother.tag}
            </button>
          )}
        </div>
      </div>

      <Card title={t('account')}>
        <div className="stats">
          <Stat
            label={t('boughtFor')}
            value={a.origin === 'bought' ? fmtAfn(Number(a.purchase_price_afn)) : '0 ؋'}
            sub={`${t(`origin_${a.origin}`)} · ${a.acquired_on}`}
          />
          <Stat label={t('daysOnFarm')} value={fmtNum(acc?.daysOnFarm ?? 0)} />
          {a.kind === 'cow' && <Stat label={t('avgKg')} value={`${fmtNum(acc?.avgKg ?? 0, 1)} ${t('kg')}`} sub={`${t('totalMilk')}: ${fmtNum(acc?.kg ?? 0)} ${t('kg')}`} />}
          <Stat label={t('dailyCost')} value={fmtAfn(acc?.avgDailyCost ?? 0)} sub={`${t('totalCost')}: ${fmtAfn(acc?.totalCost ?? 0)}`} />
          {a.kind === 'cow' && <Stat label={t('milkValue')} value={fmtAfn(acc?.milkValue ?? 0)} />}
          {a.kind === 'cow' && acc && (
            <Stat
              label={t('milkMinusCost')}
              value={fmtAfn(acc.milkValue - acc.totalCost)}
              tone={acc.milkValue >= acc.totalCost ? 'pos' : 'neg'}
              sub={acc.daysOnFarm ? `${fmtAfn((acc.milkValue - acc.totalCost) / acc.daysOnFarm)} / ${t('perDay')}` : undefined}
            />
          )}
          {a.status === 'sold' && <Stat label={t('salePrice')} value={fmtAfn(Number(a.sale_price_afn ?? 0))} sub={a.exit_date} />}
          <Stat label={t('net')} value={fmtAfn(net)} tone={net >= 0 ? 'pos' : 'neg'} sub={t('netHelp')} />
        </div>
        {acc && (
          <p className="hint">
            {t('sharedCost')}: {fmtAfn(acc.sharedCost)} · {t('directCost')}: {fmtAfn(acc.directCost)}
          </p>
        )}
      </Card>

      {a.kind === 'cow' && (
        <Card title={t('last30')}>
          <div className="bars" role="img" aria-label={t('last30')}>
            {last30.map((d) => (
              <div key={d.date} className="bar" title={`${d.date}: ${d.l} kg`}>
                <div className="bar-fill" style={{ height: `${(d.l / maxL) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="bars-axis">
            <span>{last30[0]?.date.slice(5)}</span>
            <span>{last30[last30.length - 1]?.date.slice(5)}</span>
          </div>
        </Card>
      )}

      <Card
        title={t('calves')}
        action={
          canWrite &&
          a.kind !== 'bull' && (
            <button className="btn small" onClick={() => setSheet('calf')}>
              + {t('addCalf')}
            </button>
          )
        }
      >
        {calves.length === 0 ? (
          <p className="muted">–</p>
        ) : (
          <ul className="list">
            {calves.map((c) => (
              <li key={c.id} onClick={() => go('animals/' + c.id)}>
                <span>{c.tag}</span>
                <span className="muted">{t(`origin_${c.origin}`)}</span>
                <span className="tag">{t(`status_${c.status}`)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title={t('directCost')}
        action={
          canWrite && (
            <button className="btn small" onClick={() => setSheet('expense')}>
              + {t('addExpense')}
            </button>
          )
        }
      >
        {directExpenses.length === 0 ? (
          <p className="muted">–</p>
        ) : (
          <ul className="list">
            {directExpenses.map((e) => (
              <li key={e.id}>
                <span>{e.expense_date}</span>
                <span className="muted">
                  {t(`cat_${e.category}`)} {e.note}
                </span>
                <b>{fmtAfn(Number(e.amount_afn))}</b>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {a.notes && <Card title={t('note')}>{a.notes}</Card>}

      {canWrite && a.status === 'active' && (
        <div className="form-buttons">
          <button className="btn" onClick={() => setSheet('sold')}>
            {t('markSold')}
          </button>
          <button className="btn danger" onClick={() => setSheet('dead')}>
            {t('markDead')}
          </button>
        </div>
      )}

      {sheet === 'edit' && <AnimalForm animal={a} onClose={(nid) => (setSheet(null), nid || go('animals'))} />}
      {sheet === 'calf' && <AnimalForm motherId={a.id} onClose={() => setSheet(null)} />}
      {(sheet === 'sold' || sheet === 'dead') && <ExitForm animal={a} mode={sheet} onClose={() => setSheet(null)} />}
      {sheet === 'expense' && <ExpenseForm animalId={a.id} onClose={() => setSheet(null)} />}
    </div>
  )
}

function lastDaysMilk(data: FarmData, animalId: string, n: number) {
  const end = toDay(today())
  const m = new Map(data.milk_records.filter((r) => r.animal_id === animalId).map((r) => [r.record_date, Number(r.kg)]))
  const out: { date: string; l: number }[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today(), -i)
    if (toDay(d) <= end) out.push({ date: d, l: m.get(d) ?? 0 })
  }
  return out
}
