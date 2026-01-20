import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function handler() {
  const { data, error } = await supabase
    .from('totalusuarios')
    .select('total')

  if (error) {
    return { statusCode: 500, body: 'Erro ao buscar dados' }
  }

  const total = (data || []).reduce((s, r) => s + (r.total || 0), 0)

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ total })
  }
}
