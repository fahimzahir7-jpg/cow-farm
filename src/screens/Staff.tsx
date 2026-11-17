import { useState } from 'react'
import { today } from '../lib/calc'
import { fmtAfn, useT } from '../lib/i18n'
import { useStore } from '../lib/store'
import type { Employee } from '../lib/types'
import { EmployeeForm, ExpenseForm } from '../forms'
import { Card, useCanWrite } from '../ui'

/** Salary accounts: each staff member, what they are owed per month, and what has been paid. */
export default function Staff() {
  const { t } = useT()
  const employees = useStore((s) => s.data.employees)
  const expenses = useStore((s) => s.data.expenses)
  const canWrite = useCanWrite()
  const [sheet, setSheet] = useState<null | { kind: 'emp'; emp?: Employee } | { kind: 'pay'; emp: Employee }>(null)
  const month = today().slice(0, 7)

  const rows = [...employees]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
    .map((e) => {
      const pays = expenses.filter((x) => x.employee_id === e.id).sort((a, b) => b.expense_date.localeCompare(a.expense_date))
      const total = pays.reduce((s, x) => s + Number(x.amount_afn), 0)
      const thisMonth = pays.filter((x) => x.expense_date.startsWith(month)).reduce((s, x) => s + Number(x.amount_afn), 0)
      return { e, pays, total, thisMonth }
    })

  return (
    <>
      <div className="toolbar">
        <span className="hint">{t('staffHelp')}</span>
        {canWrite && (
          <button className="btn primary" onClick={() => setSheet({ kind: 'emp' })}>
            + {t('addEmployee')}
          </button>
        )}
      </div>
      {rows.length === 0 && <p className="muted">–</p>}
      {rows.map(({ e, pays, total, thisMonth }) => (
        <Card
          key={e.id}
          title={
            <>
              {e.name}
              {e.job && <span className="tag">{e.job}</span>}
              {!e.active && <span className="tag warn">{t('leftJob')}</span>}
            </>
          }
          action={
            canWrite && (
              <button className="btn small ghost" onClick={() => setSheet({ kind: 'emp', emp: e })}>
                {t('edit')}
              </button>
            )
          }
        >
          <div className="stats">
            <div className="stat">
              <div className="stat-label">{t('monthlySalary')}</div>
              <div className="stat-value">{fmtAfn(Number(e.monthly_salary_afn))}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('paidThisMonth')}</div>
              <div className={'stat-value ' + (thisMonth >= Number(e.monthly_salary_afn) ? 'pos' : 'neg')}>{fmtAfn(thisMonth)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">{t('paidTotal')}</div>
              <div className="stat-value">{fmtAfn(total)}</div>
              <div className="stat-sub">
                {t('startDate')}: {e.start_date}
              </div>
            </div>
          </div>
          {pays.length > 0 && (
            <ul className="list compact">
              {pays.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <span>
                    <span className="muted small">{p.expense_date}</span> {p.note}
                  </span>
                  <b>{fmtAfn(Number(p.amount_afn))}</b>
                </li>
              ))}
            </ul>
          )}
          {canWrite && e.active && (
            <button className="btn block" style={{ marginTop: 10 }} onClick={() => setSheet({ kind: 'pay', emp: e })}>
              {t('paySalary')}
            </button>
          )}
        </Card>
      ))}
      {sheet?.kind === 'emp' && <EmployeeForm employee={sheet.emp} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'pay' && <ExpenseForm employeeId={sheet.emp.id} onClose={() => setSheet(null)} />}
    </>
  )
}
