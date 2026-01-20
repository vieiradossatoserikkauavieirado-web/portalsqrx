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

  const { username, password } = JSON.parse(event.body || '{}')
  const u = (username || '').trim()
  const p = (password || '').trim()

  if (!u || !p) return { statusCode: 400, body: 'Dados inválidos' }

  const { data: user, error } = await supabase
    .from('usuarios')
    .select('username, password, acesso_gamemodes')
    .eq('username', u)
    .maybeSingle()

  if (error) return { statusCode: 500, body: 'Erro consulta usuários' }
  if (!user) return { statusCode: 401, body: 'Usuário não encontrado' }

  // compara senha exatamente (do jeito que está no seu banco hoje)
  if ((user.password || '').trim() !== p) {
    return { statusCode: 401, body: 'Senha incorreta' }
  }

  const acesso = (user.acesso_gamemodes || '').trim().toLowerCase()
  if (acesso !== 'permitido') {
    return { statusCode: 403, body: `Sem permissão (acesso_gamemodes="${user.acesso_gamemodes}")` }
  }

  const token = crypto.randomUUID()

  await supabase.from('sessoes').insert({
    token,
    username: user.username,
    expira_em: new Date(Date.now() + 1000 * 60 * 60).toISOString()
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
