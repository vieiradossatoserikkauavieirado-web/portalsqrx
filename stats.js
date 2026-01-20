import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler() {
  const { data } = await supabase.from('totalusuarios').select('total')
  const total = (data || []).reduce((a, b) => a + (b.total || 0), 0)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ total })
  }
}
