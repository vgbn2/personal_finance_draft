// supabase/functions/risk-alert/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { record, old_record, type, table, schema } = await req.json()

  console.log(`[RISK-ALERT] Triggered for ${table} in ${schema}`)

  if (record && record.status === 'risk_rejected') {
    const message = `🚨 HIGH PRIORITY RISK ALERT\n` +
                    `Order Rejected: ${record.side.toUpperCase()} ${record.quantity} ${record.instrument_id}\n` +
                    `Reason: ${record.metadata?.reason || 'Unknown risk violation'}\n` +
                    `Timestamp: ${record.timestamp}`

    console.log(message)

    // Here you would integrate with Slack, Discord, or Email
    // Example: 
    // await fetch(Deno.env.get('DISCORD_WEBHOOK_URL'), {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ content: message })
    // })
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { "Content-Type": "application/json" } },
  )
})
