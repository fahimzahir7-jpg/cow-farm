import { useMemo, useState } from 'react'
import { addDays, buildReport, cashPosition, monthEnd, monthStart, today, type Range } from '../lib/calc'
import { fmtAfn, fmtNum, fmtUsd, useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import { Card, Field, Stat, downloadCsv, go } from '../ui'

type Preset = 'thisMonth' | 'lastMonth' | 'allTime' | 'custom'

export default function Reports() {
  const { t } = useT()
  const data = useStore((s) => s.data)
  const [preset, setPreset] = useState<Preset>('thisMonth')
  const firstDate = useMemo(() => {
    const ds = [...data.animals.map((a) => a.acquired_on), ...data.capital_entries.map((c) => c.entry_date), ...data.expenses.map((e) => e.period_start)]
    return ds.sort()[0] ?? today()
  }, [data])
  const [custom, setCustom] = useState<Range>({ from: monthStart(today()), to: today() })
  const range: Range =
    preset === 'thisMonth'
      ? { from: monthStart(today()), to: today() }
      : preset === 'lastMonth'
        ? { from: monthStart(addDays(monthStart(today()), -1)), to: monthEnd(addDays(monthStart(today()), -1)) }
        : preset === 'allTime'
          ? { from: firstDate, to: today() }
          : custom
  const r = useMemo(() => buildReport(data, range), [data, range.from, range.to]) // eslint-disable-line react-hooks/exhaustive-deps
  const cash = useMemo(() => cashPosition(data), [data])
  const rate = Number(data.settings.afn_per_usd)
  const usd = (afn: number) => fmtUsd(afn / rate)

  const exportCsv = () =>
    downloadCsv(`cows-${range.from}-${range.to}.csv`, [
      ['tag', 'kind', 'status', 'purchase_price_afn', 'days_on_farm', 'kg', 'avg_kg_per_day', 'milk_value_afn', 'shared_cost_afn', 'own_cost_afn', 'cost_per_day_afn', 'net_afn'],
      ...r.animals.map((x) => [
        x.animal.tag,
        x.animal.kind,
        x.animal.status,
        x.animal.purchase_price_afn,
        x.daysOnFarm,
        x.kg.toFixed(1),
        x.avgKg.toFixed(2),
        Math.round(x.milkValue),
        Math.round(x.sharedCost),
        Math.round(x.directCost),
        Math.round(x.avgDailyCost),
        Math.round(x.net),
      ]),
    ])

  return (
    <div className="screen">
      <div className="segmented">
        {(['thisMonth', 'lastMonth', 'allTime'] as const).map((p) => (
          <button key={p} className={preset === p ? 'on' : ''} onClick={() => setPreset(p)}>
            {t(p)}
          </button>
        ))}
        <button className={preset === 'custom' ? 'on' : ''} onClick={() => setPreset('custom')}>
          …
        </button>
      </div>
      {preset === 'custom' && (
        <div className="row2">
          <Field label={t('from')}>
            <input type="date" value={custom.from} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
          </Field>
          <Field label={t('to')}>
            <input type="date" value={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
          </Field>
        </div>
      )}
      <p className="hint">
        {range.from} → {range.to}
      </p>

      <Card>
        <div className="stats">
          <Stat label={r.profit >= 0 ? t('profit') : t('loss')} value={fmtAfn(r.profit)} sub={usd(r.profit)} tone={r.profit >= 0 ? 'pos' : 'neg'} />
          <Stat label={t('milkIncome')} value={fmtAfn(r.milkIncome)} sub={`${fmtNum(r.milkKgSold)} ${t('kg')} · ${t('avgPrice')} ${fmtNum(r.avgPricePerKg, 1)}`} />
          <Stat label={t('totalExpenses')} value={fmtAfn(r.totalExpenses)} sub={usd(r.totalExpenses)} />
          <Stat label={t('headcount')} value={`${r.headcount.cows} ${t('kind_cow')}`} sub={`${r.headcount.calves} ${t('kind_calf')}${r.headcount.bulls ? ` · ${r.headcount.bulls} ${t('kind_bull')}` : ''}`} />
        </div>
      </Card>

      <Card title={t('partners')}>
        <table className="table">
          <thead>
            <tr>
              <th>{t('partner')}</th>
              <th>{t('capital')}</th>
              <th>{t('share')}</th>
              <th>{t('profitShare')}</th>
            </tr>
          </thead>
          <tbody>
            {r.partners.map((p) => (
              <tr key={p.partnerId}>
                <td>{p.name}</td>
                <td>{fmtUsd(p.capitalUsd)}</td>
                <td>{fmtNum(p.capitalPct, 1)}%</td>
                <td className={p.profitAfn >= 0 ? 'pos' : 'neg'}>
                  {fmtAfn(p.profitAfn)}
                  <div className="muted small">{usd(p.profitAfn)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">{t('splitHelp')}</p>
      </Card>

      <Card title={t('income') + ' / ' + t('expenses')}>
        <ul className="list compact">
          <li>
            <span>{t('milkIncome')}</span>
            <b className="pos">{fmtAfn(r.milkIncome)}</b>
          </li>
          {r.animalSales > 0 && (
            <li>
              <span>{t('animalSales')}</span>
              <b className="pos">{fmtAfn(r.animalSales)}</b>
            </li>
          )}
          {r.animalBookValueOut > 0 && (
            <li>
              <span>{t('animalLosses')}</span>
              <b className="neg">−{fmtAfn(r.animalBookValueOut)}</b>
            </li>
          )}
          {Object.entries(r.expensesByCategory)
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => (
              <li key={c}>
                <span>{t(`cat_${c}` as 'cat_other')}</span>
                <b className="neg">−{fmtAfn(v)}</b>
              </li>
            ))}
          <li className="total">
            <span>{r.profit >= 0 ? t('profit') : t('loss')}</span>
            <b className={r.profit >= 0 ? 'pos' : 'neg'}>{fmtAfn(r.profit)}</b>
          </li>
        </ul>
        {r.unallocatedShared > 0 && (
          <p className="hint">
            {t('unallocated')}: {fmtAfn(r.unallocatedShared)}
          </p>
        )}
      </Card>

      <Card title={t('perAnimal')} action={<button className="btn small ghost" onClick={exportCsv}>{t('exportCsv')}</button>}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('tag')}</th>
                <th>{t('avgKg')}</th>
                <th>{t('milkValue')}</th>
                <th>{t('dailyCost')}</th>
                <th>{t('totalCost')}</th>
              </tr>
            </thead>
            <tbody>
              {r.animals
                .sort((a, b) => a.animal.tag.localeCompare(b.animal.tag, undefined, { numeric: true }))
                .map((x) => (
                  <tr key={x.animal.id} onClick={() => go('animals/' + x.animal.id)} className="clickable">
                    <td>
                      <b>{x.animal.tag}</b>
                      <div className="muted small">{t(`kind_${x.animal.kind}`)}</div>
                    </td>
                    <td>{x.animal.kind === 'cow' ? `${fmtNum(x.avgKg, 1)} ${t('kg')}` : '–'}</td>
                    <td>{x.animal.kind === 'cow' ? fmtAfn(x.milkValue) : '–'}</td>
                    <td>{fmtAfn(x.avgDailyCost)}</td>
                    <td>{fmtAfn(x.totalCost)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={t('cash')}>
        <ul className="list compact">
          <li>
            <span>{t('capital')}</span>
            <b>
              {fmtUsd(cash.capitalUsd)} <span className="muted small">({fmtAfn(cash.capitalAfn)})</span>
            </b>
          </li>
          <li>
            <span>+ {t('milkIncome')}</span>
            <b>{fmtAfn(cash.milk)}</b>
          </li>
          <li>
            <span>+ {t('animalSales')}</span>
            <b>{fmtAfn(cash.sales)}</b>
          </li>
          <li>
            <span>− {t('boughtFor')}</span>
            <b>{fmtAfn(cash.purchases)}</b>
          </li>
          <li>
            <span>− {t('totalExpenses')}</span>
            <b>{fmtAfn(cash.expenses)}</b>
          </li>
          <li className="total">
            <span>{t('cash')}</span>
            <b>
              {fmtAfn(cash.cash)} <span className="muted small">{usd(cash.cash)}</span>
            </b>
          </li>
        </ul>
        {cash.unpaid > 0 && (
          <p className="hint warn-text">
            {t('unpaid')}: {fmtAfn(cash.unpaid)}
          </p>
        )}
      </Card>
    </div>
  )
}
