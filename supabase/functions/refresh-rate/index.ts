// Daily AFN per USD refresh from open.er-api.com (free, updated daily).
// Called by pg_cron; protected by the same token as the daily backup.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: token } = await db.rpc('backup_token')
  if (!token || req.headers.get('x-backup-token') !== token) return new Response('forbidden', { status: 403 })

  const res = await fetch('https://open.er-api.com/v6/latest/USD')
  const json = await res.json()
  const rate = Number(json?.rates?.AFN)
  if (!(rate > 20 && rate < 500)) return new Response(`bad rate ${rate}`, { status: 502 })
  const rounded = Math.round(rate * 100) / 100
  const { error } = await db.from('settings').update({ afn_per_usd: rounded, rate_updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return new Response(error.message, { status: 500 })
  return new Response(JSON.stringify({ afn_per_usd: rounded }), { headers: { 'Content-Type': 'application/json' } })
})
