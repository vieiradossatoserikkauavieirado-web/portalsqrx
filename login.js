import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function setCookie(token) {
  return `sx_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600`
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método não permitido' }
  }

  const { username, password } = JSON.parse(event.body || {})
  if (!username || !password) {
    return { statusCode: 400, body: 'Dados inválidos' }
  }

  const { data: user } = await supabase
    .from('usuarios')
    .select('username, password, acesso_gamemodes')
    .eq('username', username.trim())
    .maybeSingle()

  if (!user || user.password !== password.trim()) {
    return { statusCode: 401, body: 'Usuário ou senha incorretos' }
  }

  if ((user.acesso_gamemodes || '').trim() !== 'permitido') {
    return { statusCode: 403, body: 'Sem permissão' }
  }

  const token = crypto.randomUUID()

  await supabase.from('sessoes').insert({
    token,
    username: user.username,
    expira_em: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  })

  return {
    statusCode: 200,
    headers: {
      'Set-Cookie': setCookie(token),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ok: true })
  }
}
