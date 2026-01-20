const { createClient } = require('@supabase/supabase-js')
const crypto = require('crypto')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function setCookie(token) {
  // Ajuste SameSite/Domain se necessário depois
  return `sx_vip_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600; Secure`
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Método não permitido' }
  }

  const { username, password } = JSON.parse(event.body || '{}')
  const u = (username || '').trim()
  const p = (password || '').trim()
  if (!u || !p) return { statusCode: 400, body: 'Dados inválidos' }

  // 1) Banidos
  const { data: banido, error: eBan } = await supabase
    .from('banidos')
    .select('username, motivo')
    .eq('username', u)
    .maybeSingle()

  if (eBan) return { statusCode: 500, body: 'Erro ao verificar banidos' }
  if (banido) {
    return { statusCode: 403, body: `Banido: ${banido.motivo || 'Sem motivo informado'}` }
  }

  // 2) Usuário VIP
  const { data: user, error: eUser } = await supabase
    .from('usuariovip')
    .select('username, password, acesso_gamemodes')
    .eq('username', u)
    .maybeSingle()

  if (eUser || !user || (user.password || '').trim() !== p) {
    return { statusCode: 401, body: 'Usuário ou senha incorretos.' }
  }

  // (opcional) permissão
  if ((user.acesso_gamemodes || '').trim() !== 'permitido') {
    return { statusCode: 403, body: 'Sem permissão VIP.' }
  }

  // 3) Sessão VIP
  const token = crypto.randomUUID()
  const { error: eSess } = await supabase.from('sessoes_vip').insert({
    token,
    username: user.username,
    expira_em: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  })

  if (eSess) {
    return { statusCode: 500, body: 'Erro ao criar sessão VIP (tabela sessoes_vip)' }
  }

  return {
    statusCode: 200,
    headers: { 'Set-Cookie': setCookie(token) },
    body: 'ok'
  }
}
