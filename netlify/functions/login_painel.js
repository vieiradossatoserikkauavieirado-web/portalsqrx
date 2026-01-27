const { createClient } = require("@supabase/supabase-js")
const crypto = require("crypto")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// ✅ cookie do painel (com Domain fixo)
function setCookie(token) {
  return `sx_painel_session=${token}; HttpOnly; Path=/; Domain=.portalsiqueirax.com.br; SameSite=Lax; Max-Age=3600; Secure`
}

// ✅ headers padrão (no-store + credenciais)
function baseHeaders(origin) {
  const h = {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain",
  }

  // (opcional) se tiver origin, libera só o seu domínio
  // Isso não atrapalha mesmo-domain e ajuda quando o navegador manda Origin
  if (origin) {
    h["Access-Control-Allow-Origin"] = origin
    h["Access-Control-Allow-Credentials"] = "true"
    h["Vary"] = "Origin"
  }

  return h
}

exports.handler = async (event) => {
  const origin = event.headers.origin || ""

  // ✅ preflight (se acontecer)
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        ...baseHeaders(origin),
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    }
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: baseHeaders(origin), body: "Método não permitido" }
  }

  let body
  try { body = JSON.parse(event.body || "{}") } catch { body = {} }

  const username = (body.username || "").trim()
  const password = (body.password || "").trim()
  if (!username || !password) {
    return { statusCode: 400, headers: baseHeaders(origin), body: "Dados inválidos" }
  }

  const { data: user, error: eUser } = await supabase
    .from("usuarios_painel")
    .select("username, password, role, ativo")
    .eq("username", username)
    .maybeSingle()

  if (eUser || !user) {
    return { statusCode: 401, headers: baseHeaders(origin), body: "Usuário ou senha incorretos." }
  }
  if (!user.ativo) {
    return { statusCode: 403, headers: baseHeaders(origin), body: "Conta desativada." }
  }
  if ((user.password || "").trim() !== password) {
    return { statusCode: 401, headers: baseHeaders(origin), body: "Usuário ou senha incorretos." }
  }

  const token = crypto.randomUUID()
  const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const { error: eSess } = await supabase.from("sessoes_painel").insert({
    token,
    username: user.username,
    role: user.role || "admin",
    expira_em
  })

  if (eSess) {
    return { statusCode: 500, headers: baseHeaders(origin), body: "Erro ao criar sessão painel (sessoes_painel)" }
  }

  return {
    statusCode: 200,
    headers: {
      ...baseHeaders(origin),
      "Set-Cookie": setCookie(token),
    },
    body: "ok"
  }
}
