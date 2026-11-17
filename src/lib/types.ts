export type Role = 'admin' | 'manager' | 'viewer'
export type Lang = 'en' | 'fa' | 'ps'

export interface Profile {
  id: string
  full_name: string
  role: Role
  language: string
}

export interface Partner {
  id: string
  name: string
}

export interface CapitalEntry {
  id: string
  partner_id: string
  entry_date: string
  amount_usd: number
  note: string | null
}

export interface Settings {
  id: 1
  afn_per_usd: number
  calf_share: number
  rate_updated_at: string | null
}

export type AnimalKind = 'cow' | 'calf' | 'bull'
export type AnimalOrigin = 'bought' | 'came_with_mother' | 'born_on_farm'
export type AnimalStatus = 'active' | 'sold' | 'dead'

export interface Animal {
  id: string
  tag: string
  name: string | null
  kind: AnimalKind
  sex: 'f' | 'm' | null
  breed: string | null
  mother_id: string | null
  origin: AnimalOrigin
  acquired_on: string
  purchase_price_afn: number
  birth_date: string | null
  status: AnimalStatus
  exit_date: string | null
  sale_price_afn: number | null
  buyer: string | null
  notes: string | null
}

export interface MilkRecord {
  id: string
  animal_id: string
  record_date: string
  kg: number
}

export interface MilkSale {
  id: string
  sale_date: string
  buyer: string
  kg: number
  price_per_kg_afn: number
  paid: boolean
  note: string | null
}

export const EXPENSE_CATEGORIES = [
  'feed',
  'rent',
  'wages',
  'electricity',
  'water',
  'vet',
  'transport',
  'repairs',
  'other',
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface Expense {
  id: string
  expense_date: string
  category: ExpenseCategory
  amount_afn: number
  animal_id: string | null
  employee_id: string | null
  period_start: string
  period_end: string
  note: string | null
}

/** A person paid by the farm. Salary payments are 'wages' expenses linked by employee_id. */
export interface Employee {
  id: string
  name: string
  job: string | null
  monthly_salary_afn: number
  start_date: string
  active: boolean
}

export interface FarmData {
  employees: Employee[]
  partners: Partner[]
  capital_entries: CapitalEntry[]
  settings: Settings
  animals: Animal[]
  milk_records: MilkRecord[]
  milk_sales: MilkSale[]
  expenses: Expense[]
}

export type TableName = Exclude<keyof FarmData, 'settings'> | 'settings'
