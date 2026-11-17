import { useMemo, useState, type FormEvent } from 'react'
import { buildReport, today } from '../lib/calc'
import { fmtAfn, fmtUsd, useT } from '../lib/i18n'
import { remove, save, uid, useStore } from '../lib/store'
import type { FarmData, ProfitWithdrawal } from '../lib/types'
import { Card, Field, Sheet, num, useCanWrite } from '../ui'

export interface PartnerBalance {
  partnerId: string
  name: string
  earned: number
  taken: number
  remaining: number
}

/** All-time profit share of each partner, minus what they have already taken out. */
export function partnerBalances(data: FarmData, firstDate: string): PartnerBalance[] {
  const r = buildReport(data, { from: firstDate, to: today() })
  return r.partners.map((p) => {
    const taken = (data.profit_withdrawals ?? []).filter((w) => w.partner_id === p.partnerId).reduce((s, w) => s + Number(w.amount_afn), 0)
    return { partnerId: p.partnerId, name: p.name, earned: p.profitAfn, taken, remaining: p.profitAfn - taken }
  })
}

export default function Payouts({ firstDate }: { firstDate: string }) {
  const { t } = useT()
  const data = useStore((s) => s.data)
  const canWrite = useCanWrite()
  const [sheet, setSheet] = useState<null | { w?: ProfitWithdrawal }>(null)
  const rows = useMemo(() => partnerBalances(data, firstDate), [data, firstDate])
  const rate = Number(data.settings.afn_per_usd)
  const list = [...(data.profit_withdrawals ?? [])].sort((a, b) => b.withdrawal_date.localeCompare(a.withdrawal_date))
  const nameOf = (id: string) => data.partners.find((p) => p.id === id)?.name ?? '?'

  return (
    <Card
      title={t('profitTakeOut')}
      action={
        canWrite && (
          <button className="btn small primary" onClick={() => setSheet({})}>
            + {t('takeOutProfit')}
          </button>
        )
      }
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('partner')}</th>
              <th>{t('profitEarned')}</th>
              <th>{t('takenOut')}</th>
              <th>{t('stillToTake')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partnerId}>
                <td>{r.name}</td>
                <td>{fmtAfn(r.earned)}</td>
                <td>{fmtAfn(r.taken)}</td>
                <td className={r.remaining >= 0 ? 'pos' : 'neg'}>
                  {fmtAfn(r.remaining)}
                  <div className="muted small">{fmtUsd(r.remaining / rate)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{t('takeOutHelp')}</p>
      {list.length > 0 && (
        <ul className="list">
          {list.map((w) => (
            <li key={w.id} onClick={() => canWrite && setSheet({ w })}>
              <span>
                <span className="muted small">{w.withdrawal_date}</span> {nameOf(w.partner_id)}
              </span>
              <span className="muted">{w.note}</span>
              <b>{fmtAfn(Number(w.amount_afn))}</b>
            </li>
          ))}
        </ul>
      )}
      {sheet && <WithdrawalForm w={sheet.w} onClose={() => setSheet(null)} />}
    </Card>
  )
}

function WithdrawalForm({ w, onClose }: { w?: ProfitWithdrawal; onClose: () => void }) {
  const { t } = useT()
  const partners = useStore((s) => s.data.partners)
  const [f, setF] = useState({
    partner_id: w?.partner_id ?? partners[0]?.id ?? '',
    withdrawal_date: w?.withdrawal_date ?? today(),
    amount: w ? String(w.amount_afn) : '',
    note: w?.note ?? '',
  })
  const [confirmDel, setConfirmDel] = useState(false)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = num(f.amount)
    if (!(amount > 0)) return
    save('profit_withdrawals', { id: w?.id ?? uid(), partner_id: f.partner_id, withdrawal_date: f.withdrawal_date, amount_afn: amount, note: f.note || null })
    onClose()
  }
  return (
    <Sheet title={t('takeOutProfit')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('partner')}>
          <select id="wd-partner" value={f.partner_id} onChange={(e) => setF({ ...f, partner_id: e.target.value })}>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row2">
          <Field label={t('date')}>
            <input id="wd-date" type="date" value={f.withdrawal_date} required onChange={(e) => setF({ ...f, withdrawal_date: e.target.value })} />
          </Field>
          <Field label={t('amountAfn')}>
            <input id="wd-amount" type="text" inputMode="decimal" value={f.amount} required autoFocus={!w} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        </div>
        <Field label={t('note')}>
          <input id="wd-note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <div className="form-buttons">
          {w &&
            (confirmDel ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  remove('profit_withdrawals', w.id)
                  onClose()
                }}
              >
                {t('confirmDelete')}
              </button>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirmDel(true)}>
                {t('delete')}
              </button>
            ))}
          <span className="grow" />
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('cancel')}
          </button>
          <button type="submit" className="btn primary">
            {t('save')}
          </button>
        </div>
      </form>
    </Sheet>
  )
}
