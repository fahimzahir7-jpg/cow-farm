import { useState, type FormEvent } from 'react'
import { addDays, monthEnd, today } from './lib/calc'
import { useT } from './lib/i18n'
import { remove, save, uid, useStore } from './lib/store'
import { EXPENSE_CATEGORIES, type Animal, type CapitalEntry, type Employee, type Expense, type ExpenseCategory, type MilkSale } from './lib/types'
import { Field, Sheet, num } from './ui'

const NumInput = (p: { value: string; onChange: (v: string) => void; required?: boolean; autoFocus?: boolean }) => (
  <input type="text" inputMode="decimal" value={p.value} required={p.required} autoFocus={p.autoFocus} onChange={(e) => p.onChange(e.target.value)} />
)

function Buttons({ onCancel, onDelete }: { onCancel: () => void; onDelete?: () => void }) {
  const { t } = useT()
  return (
    <div className="form-buttons">
      {onDelete && (
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (confirm(t('confirmDelete'))) onDelete()
          }}
        >
          {t('delete')}
        </button>
      )}
      <span className="grow" />
      <button type="button" className="btn ghost" onClick={onCancel}>
        {t('cancel')}
      </button>
      <button type="submit" className="btn primary">
        {t('save')}
      </button>
    </div>
  )
}

// ---------------- milk sale ----------------
export function SaleForm({ sale, date, onClose }: { sale?: MilkSale; date?: string; onClose: () => void }) {
  const { t } = useT()
  const sales = useStore((s) => s.data.milk_sales)
  const last = [...sales].sort((a, b) => b.sale_date.localeCompare(a.sale_date))[0]
  const buyers = [...new Set(sales.map((s) => s.buyer))]
  const [f, setF] = useState({
    sale_date: sale?.sale_date ?? date ?? today(),
    buyer: sale?.buyer ?? last?.buyer ?? '',
    kg: sale ? String(sale.kg) : '',
    price: String(sale?.price_per_kg_afn ?? last?.price_per_kg_afn ?? ''),
    paid: sale?.paid ?? true,
    note: sale?.note ?? '',
  })
  const total = num(f.kg) * num(f.price)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const kg = num(f.kg)
    const price = num(f.price)
    if (!(kg >= 0) || !(price >= 0)) return
    save('milk_sales', {
      id: sale?.id ?? uid(),
      sale_date: f.sale_date,
      buyer: f.buyer.trim(),
      kg,
      price_per_kg_afn: price,
      paid: f.paid,
      note: f.note || null,
    })
    onClose()
  }
  return (
    <Sheet title={t('addSale')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('date')}>
          <input type="date" value={f.sale_date} required onChange={(e) => setF({ ...f, sale_date: e.target.value })} />
        </Field>
        <Field label={t('buyer')}>
          <input list="buyers" value={f.buyer} required onChange={(e) => setF({ ...f, buyer: e.target.value })} />
          <datalist id="buyers">
            {buyers.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </Field>
        <div className="row2">
          <Field label={t('kg')}>
            <NumInput value={f.kg} required autoFocus onChange={(v) => setF({ ...f, kg: v })} />
          </Field>
          <Field label={t('pricePerKg')}>
            <NumInput value={f.price} required onChange={(v) => setF({ ...f, price: v })} />
          </Field>
        </div>
        <div className="total-line">
          {t('amount')}: <b>{Number.isFinite(total) ? Math.round(total).toLocaleString() : '–'} ؋</b>
        </div>
        <label className="check">
          <input type="checkbox" checked={!f.paid} onChange={(e) => setF({ ...f, paid: !e.target.checked })} /> {t('unpaid')}
        </label>
        <Field label={t('note')}>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <Buttons
          onCancel={onClose}
          onDelete={
            sale &&
            (() => {
              remove('milk_sales', sale.id)
              onClose()
            })
          }
        />
      </form>
    </Sheet>
  )
}

// ---------------- expense ----------------
type Period = 'day' | 'week' | 'month' | 'custom'
const defaultPeriod = (c: ExpenseCategory): Period => (c === 'rent' || c === 'wages' || c === 'electricity' || c === 'water' ? 'month' : 'day')

export function ExpenseForm({
  expense,
  date,
  animalId,
  employeeId,
  onClose,
}: {
  expense?: Expense
  date?: string
  animalId?: string
  employeeId?: string
  onClose: () => void
}) {
  const { t } = useT()
  const animals = useStore((s) => s.data.animals)
  const employees = useStore((s) => s.data.employees)
  const startEmp = employees.find((x) => x.id === employeeId)
  const startCat: ExpenseCategory = expense?.category ?? (employeeId ? 'wages' : 'feed')
  const [f, setF] = useState({
    expense_date: expense?.expense_date ?? date ?? today(),
    category: startCat,
    amount: expense ? String(expense.amount_afn) : startEmp ? String(startEmp.monthly_salary_afn) : '',
    animal_id: expense?.animal_id ?? animalId ?? '',
    employee_id: expense?.employee_id ?? employeeId ?? '',
    period: (expense
      ? expense.period_start === expense.period_end
        ? 'day'
        : 'custom'
      : animalId
        ? 'day'
        : defaultPeriod(startCat)) as Period,
    period_start: expense?.period_start ?? date ?? today(),
    period_end: expense?.period_end ?? date ?? today(),
    note: expense?.note ?? '',
  })
  const range = (): [string, string] => {
    const d = f.expense_date
    switch (f.period) {
      case 'day':
        return [d, d]
      case 'week':
        return [d, addDays(d, 6)]
      case 'month':
        return [d.slice(0, 8) + '01', monthEnd(d)]
      default:
        return [f.period_start, f.period_end < f.period_start ? f.period_start : f.period_end]
    }
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = num(f.amount)
    if (!(amount >= 0)) return
    const [ps, pe] = range()
    save('expenses', {
      id: expense?.id ?? uid(),
      expense_date: f.expense_date,
      category: f.category,
      amount_afn: amount,
      animal_id: f.animal_id || null,
      employee_id: f.category === 'wages' ? f.employee_id || null : null,
      period_start: ps,
      period_end: pe,
      note: f.note || null,
    })
    onClose()
  }
  const [ps, pe] = range()
  return (
    <Sheet title={t('addExpense')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('date')}>
          <input type="date" value={f.expense_date} required onChange={(e) => setF({ ...f, expense_date: e.target.value })} />
        </Field>
        <Field label={t('category')}>
          <div className="chips">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                type="button"
                key={c}
                className={'chip ' + (f.category === c ? 'on' : '')}
                onClick={() => setF({ ...f, category: c, period: expense || f.animal_id ? f.period : defaultPeriod(c) })}
              >
                {t(`cat_${c}`)}
              </button>
            ))}
          </div>
        </Field>
        {f.category === 'wages' && (
          <Field label={t('employee')}>
            <select
              value={f.employee_id}
              onChange={(e) => {
                const emp = employees.find((x) => x.id === e.target.value)
                setF({ ...f, employee_id: e.target.value, amount: f.amount || (emp ? String(emp.monthly_salary_afn) : '') })
              }}
            >
              <option value="">–</option>
              {employees
                .filter((x) => x.active || x.id === f.employee_id)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <Field label={t('amountAfn')}>
          <NumInput value={f.amount} required autoFocus={!expense && !employeeId} onChange={(v) => setF({ ...f, amount: v })} />
        </Field>
        <Field label={t('forAnimal')}>
          <select value={f.animal_id} onChange={(e) => setF({ ...f, animal_id: e.target.value })}>
            <option value="">{t('sharedAll')}</option>
            {animals
              .filter((a) => a.status === 'active' || a.id === f.animal_id)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.tag} {a.name ? `· ${a.name}` : ''}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t('coversPeriod')} hint={ps === pe ? ps : `${ps} → ${pe}`}>
          <select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as Period })}>
            <option value="day">{t('oneDay')}</option>
            <option value="week">{t('oneWeek')}</option>
            <option value="month">{t('oneMonth')}</option>
            <option value="custom">{t('customPeriod')}</option>
          </select>
        </Field>
        {f.period === 'custom' && (
          <div className="row2">
            <Field label={t('from')}>
              <input type="date" value={f.period_start} onChange={(e) => setF({ ...f, period_start: e.target.value })} />
            </Field>
            <Field label={t('to')}>
              <input type="date" value={f.period_end} onChange={(e) => setF({ ...f, period_end: e.target.value })} />
            </Field>
          </div>
        )}
        <Field label={t('note')}>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <Buttons
          onCancel={onClose}
          onDelete={
            expense &&
            (() => {
              remove('expenses', expense.id)
              onClose()
            })
          }
        />
      </form>
    </Sheet>
  )
}

// ---------------- animal ----------------
export function AnimalForm({ animal, motherId, onClose }: { animal?: Animal; motherId?: string; onClose: (id?: string) => void }) {
  const { t } = useT()
  const animals = useStore((s) => s.data.animals)
  const mother = animals.find((a) => a.id === (animal?.mother_id ?? motherId))
  const isCalf = !!motherId
  const [f, setF] = useState({
    tag: animal?.tag ?? (mother ? `${mother.tag}-K${animals.filter((a) => a.mother_id === mother.id).length + 1}` : nextTag(animals)),
    name: animal?.name ?? '',
    kind: animal?.kind ?? (isCalf ? 'calf' : 'cow'),
    sex: animal?.sex ?? (isCalf ? '' : 'f'),
    breed: animal?.breed ?? mother?.breed ?? '',
    mother_id: animal?.mother_id ?? motherId ?? '',
    origin: animal?.origin ?? (isCalf ? 'came_with_mother' : 'bought'),
    acquired_on: animal?.acquired_on ?? (mother && mother.acquired_on > today() ? mother.acquired_on : today()),
    price: animal ? String(animal.purchase_price_afn) : isCalf ? '0' : '',
    birth_date: animal?.birth_date ?? '',
    notes: animal?.notes ?? '',
  })
  const dup = animals.some((a) => a.status === 'active' && a.id !== animal?.id && a.tag.toLowerCase() === f.tag.trim().toLowerCase())
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const price = f.origin === 'bought' ? num(f.price) : 0
    if (!(price >= 0) || dup) return
    const id = animal?.id ?? uid()
    save('animals', {
      ...(animal ?? { status: 'active', exit_date: null, sale_price_afn: null, buyer: null }),
      id,
      tag: f.tag.trim(),
      name: f.name || null,
      kind: f.kind,
      sex: (f.sex || null) as Animal['sex'],
      breed: f.breed || null,
      mother_id: f.mother_id || null,
      origin: f.origin,
      acquired_on: f.acquired_on,
      purchase_price_afn: price,
      birth_date: f.birth_date || null,
      notes: f.notes || null,
    } as Animal)
    onClose(id)
  }
  return (
    <Sheet title={animal ? `${t('edit')} ${animal.tag}` : isCalf ? t('addCalf') : t('addAnimal')} onClose={() => onClose()}>
      <form onSubmit={submit}>
        <div className="row2">
          <Field label={t('tag')} hint={dup ? '⚠ ' + f.tag + ' already used' : undefined}>
            <input value={f.tag} required onChange={(e) => setF({ ...f, tag: e.target.value })} />
          </Field>
          <Field label={t('name')}>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
        </div>
        <div className="row2">
          <Field label={t('kind')}>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Animal['kind'] })}>
              <option value="cow">{t('kind_cow')}</option>
              <option value="calf">{t('kind_calf')}</option>
              <option value="bull">{t('kind_bull')}</option>
            </select>
          </Field>
          <Field label={t('sex')}>
            <select value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value as 'f' | 'm' | '' })}>
              <option value="">–</option>
              <option value="f">{t('female')}</option>
              <option value="m">{t('male')}</option>
            </select>
          </Field>
        </div>
        <Field label={t('origin')}>
          <select value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value as Animal['origin'] })}>
            <option value="bought">{t('origin_bought')}</option>
            <option value="came_with_mother">{t('origin_came_with_mother')}</option>
            <option value="born_on_farm">{t('origin_born_on_farm')}</option>
          </select>
        </Field>
        {f.origin !== 'bought' && (
          <Field label={t('mother')}>
            <select value={f.mother_id} onChange={(e) => setF({ ...f, mother_id: e.target.value })}>
              <option value="">–</option>
              {animals
                .filter((a) => a.id !== animal?.id && a.kind !== 'bull')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.tag}
                  </option>
                ))}
            </select>
          </Field>
        )}
        <div className="row2">
          <Field label={t('acquiredOn')}>
            <input type="date" value={f.acquired_on} required onChange={(e) => setF({ ...f, acquired_on: e.target.value })} />
          </Field>
          {f.origin === 'bought' && (
            <Field label={t('purchasePrice')}>
              <NumInput value={f.price} required onChange={(v) => setF({ ...f, price: v })} />
            </Field>
          )}
        </div>
        <Field label={t('breed')}>
          <input value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} />
        </Field>
        <Field label={t('note')}>
          <textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
        <Buttons
          onCancel={() => onClose()}
          onDelete={
            animal &&
            (() => {
              remove('animals', animal.id)
              onClose()
            })
          }
        />
      </form>
    </Sheet>
  )
}

function nextTag(animals: Animal[]) {
  let n = 1
  for (const a of animals) {
    const m = /^C-(\d+)$/.exec(a.tag)
    if (m) n = Math.max(n, Number(m[1]) + 1)
  }
  return `C-${String(n).padStart(2, '0')}`
}

export function ExitForm({ animal, mode, onClose }: { animal: Animal; mode: 'sold' | 'dead'; onClose: () => void }) {
  const { t } = useT()
  const [f, setF] = useState({ date: today(), price: '', buyer: '' })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const price = mode === 'sold' ? num(f.price) : null
    if (mode === 'sold' && !(price! >= 0)) return
    save('animals', { ...animal, status: mode, exit_date: f.date, sale_price_afn: price, buyer: f.buyer || null })
    onClose()
  }
  return (
    <Sheet title={`${animal.tag}: ${mode === 'sold' ? t('markSold') : t('markDead')}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('exitDate')}>
          <input type="date" value={f.date} required onChange={(e) => setF({ ...f, date: e.target.value })} />
        </Field>
        {mode === 'sold' && (
          <>
            <Field label={t('salePrice')}>
              <NumInput value={f.price} required autoFocus onChange={(v) => setF({ ...f, price: v })} />
            </Field>
            <Field label={t('buyer')}>
              <input value={f.buyer} onChange={(e) => setF({ ...f, buyer: e.target.value })} />
            </Field>
          </>
        )}
        <Buttons onCancel={onClose} />
      </form>
    </Sheet>
  )
}

// ---------------- capital ----------------
export function CapitalForm({ entry, onClose }: { entry?: CapitalEntry; onClose: () => void }) {
  const { t } = useT()
  const partners = useStore((s) => s.data.partners)
  const [f, setF] = useState({
    partner_id: entry?.partner_id ?? partners[0]?.id ?? '',
    entry_date: entry?.entry_date ?? today(),
    amount: entry ? String(entry.amount_usd) : '',
    note: entry?.note ?? '',
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const amount = num(f.amount)
    if (!Number.isFinite(amount)) return
    save('capital_entries', {
      id: entry?.id ?? uid(),
      partner_id: f.partner_id,
      entry_date: f.entry_date,
      amount_usd: amount,
      note: f.note || null,
    })
    onClose()
  }
  return (
    <Sheet title={t('addCapital')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('partner')}>
          <select value={f.partner_id} onChange={(e) => setF({ ...f, partner_id: e.target.value })}>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="row2">
          <Field label={t('date')}>
            <input type="date" value={f.entry_date} required onChange={(e) => setF({ ...f, entry_date: e.target.value })} />
          </Field>
          <Field label={t('amountUsd')} hint={t('withdrawalHint')}>
            <NumInput value={f.amount} required autoFocus onChange={(v) => setF({ ...f, amount: v })} />
          </Field>
        </div>
        <Field label={t('note')}>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
        <Buttons
          onCancel={onClose}
          onDelete={
            entry &&
            (() => {
              remove('capital_entries', entry.id)
              onClose()
            })
          }
        />
      </form>
    </Sheet>
  )
}

// ---------------- staff ----------------
export function EmployeeForm({ employee, onClose }: { employee?: Employee; onClose: () => void }) {
  const { t } = useT()
  const [f, setF] = useState({
    name: employee?.name ?? '',
    job: employee?.job ?? '',
    salary: employee ? String(employee.monthly_salary_afn) : '',
    start_date: employee?.start_date ?? today(),
    active: employee?.active ?? true,
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const salary = num(f.salary)
    if (!(salary >= 0)) return
    save('employees', {
      id: employee?.id ?? uid(),
      name: f.name.trim(),
      job: f.job || null,
      monthly_salary_afn: salary,
      start_date: f.start_date,
      active: f.active,
    })
    onClose()
  }
  return (
    <Sheet title={employee ? `${t('edit')} ${employee.name}` : t('addEmployee')} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label={t('name')}>
          <input value={f.name} required autoFocus={!employee} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label={t('job')}>
          <input value={f.job} onChange={(e) => setF({ ...f, job: e.target.value })} />
        </Field>
        <div className="row2">
          <Field label={t('monthlySalary')}>
            <NumInput value={f.salary} required onChange={(v) => setF({ ...f, salary: v })} />
          </Field>
          <Field label={t('startDate')}>
            <input type="date" value={f.start_date} required onChange={(e) => setF({ ...f, start_date: e.target.value })} />
          </Field>
        </div>
        {employee && (
          <label className="check">
            <input type="checkbox" checked={!f.active} onChange={(e) => setF({ ...f, active: !e.target.checked })} /> {t('leftJob')}
          </label>
        )}
        <Buttons onCancel={onClose} />
      </form>
    </Sheet>
  )
}
