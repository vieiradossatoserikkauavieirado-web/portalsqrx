const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getCookie(name, cookieHeader) {
  if (!cookieHeader) return null
  const parts = cookieHeader.split(';').map(s => s.trim())
  const found = parts.find(p => p.startsWith(name + '='))
  return found ? decodeURIComponent(found.split('=')[1]) : null
}

exports.handler = async (event) => {
  const token = getCookie('sx_session', event.headers.cookie)
  if (!token) return { statusCode: 401, body: 'Não autorizado' }

  const { data: sess } = await supabase
    .from('sessoes')
    .select('username, expira_em')
    .eq('token', token)
    .maybeSingle()

  if (!sess) return { statusCode: 401, body: 'Não autorizado' }
  if (new Date(sess.expira_em).getTime() < Date.now()) {
    return { statusCode: 401, body: 'Sessão expirada' }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: sess.username })
  }
}
