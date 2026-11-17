// Daily backup: exports every table to an Excel workbook and emails it.
// Called once a day by pg_cron (see supabase/migrations/0003_daily_backup.sql).
// Needs the RESEND_API_KEY secret; recipients are settings.backup_emails in the app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'
import * as XLSX from 'npm:xlsx@0.18.5'

const TABLES = [
  'partners',
  'capital_entries',
  'profit_withdrawals',
  'animals',
  'milk_records',
  'milk_sales',
  'expenses',
  'employees',
  'settings',
] as const

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: token } = await db.rpc('backup_token')
  if (!token || req.headers.get('x-backup-token') !== token) return new Response('forbidden', { status: 403 })

  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return new Response('RESEND_API_KEY not set', { status: 500 })

  const { data: settings } = await db.from('settings').select('backup_emails').eq('id', 1).single()
  const to: string[] = settings?.backup_emails ?? []
  if (!to.length) return new Response('no backup_emails set', { status: 400 })

  const wb = XLSX.utils.book_new()
  const counts: string[] = []
  for (const t of TABLES) {
    const rows: Record<string, unknown>[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from(t).select('*').range(from, from + 999)
      if (error) return new Response(`${t}: ${error.message}`, { status: 500 })
      rows.push(...(data ?? []))
      if (!data || data.length < 1000) break
    }
    counts.push(`${t}: ${rows.length}`)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ empty: '' }]), t.slice(0, 31))
  }
  const file = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
  const date = new Date().toISOString().slice(0, 10)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Cow Farm Backup <onboarding@resend.dev>',
      to,
      subject: `Cow farm backup ${date}`,
      text: `Daily backup of all cow farm records (${date}).\n\n${counts.join('\n')}\n\nThe attached Excel file holds every table.`,
      attachments: [{ filename: `cow-farm-backup-${date}.xlsx`, content: file }],
    }),
  })
  const body = await res.text()
  return new Response(body, { status: res.ok ? 200 : 502 })
})
