const { createClient } = require("@supabase/supabase-js")
const crypto = require("crypto")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function parseState(raw) {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
  } catch {
    return { returnTo: "/painelsiqueirax.html" }
  }
}

function setCookie(token) {
  return `sx_painel_session=${token}; HttpOnly; Path=/; Domain=.portalsiqueirax.com.br; SameSite=Lax; Max-Age=3600; Secure`
}

async function exchangeCodeForToken(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  })

  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  if (!r.ok) throw new Error("token_exchange_failed")
  return r.json()
}

async function getDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!r.ok) throw new Error("get_user_failed")
  return r.json()
}

exports.handler = async (event) => {
  const url = new URL(event.rawUrl)
  const code = url.searchParams.get("code")
  const stateRaw = url.searchParams.get("state") || ""
  const { returnTo } = parseState(stateRaw)

  const redirectUri = (process.env.DISCORD_PAINEL_REDIRECT_URI || "").trim().replace(/\/$/, "")

  try {
    if (!code) {
      return { statusCode: 302, headers: { Location: `/loginpainel.html?err=dc_code` }, body: "" }
    }
    if (!redirectUri) {
      return { statusCode: 500, body: "missing_env:DISCORD_PAINEL_REDIRECT_URI" }
    }

    // 1) Discord OAuth
    const tokenData = await exchangeCodeForToken(code, redirectUri)
    const user = await getDiscordUser(tokenData.access_token)

    const discord_id = String(user.id || "")
    const username = String(user.username || "usuario")

    if (!discord_id) {
      return { statusCode: 302, headers: { Location: `/loginpainel.html?err=dc_user` }, body: "" }
    }

    // 2) Autoriza no Supabase (precisa estar em usuarios_painel)
    //    => você vai salvar discord_id nessa tabela
    const { data: painelUser, error: eUser } = await supabase
      .from("usuarios_painel")
      .select("discord_id, username, role, ativo")
      .eq("discord_id", discord_id)
      .maybeSingle()

    if (eUser || !painelUser) {
      return { statusCode: 302, headers: { Location: `/loginpainel.html?err=nopainel` }, body: "" }
    }
    if (!painelUser.ativo) {
      return { statusCode: 302, headers: { Location: `/loginpainel.html?err=desativado` }, body: "" }
    }

    // 3) Cria sessão no Supabase (sessoes_painel)
    const token = crypto.randomUUID()
    const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const { error: eSess } = await supabase.from("sessoes_painel").insert({
      token,
      username: painelUser.username || username,
      role: painelUser.role || "admin",
      expira_em
    })

    if (eSess) {
      return { statusCode: 302, headers: { Location: `/loginpainel.html?err=sessao` }, body: "" }
    }

    // 4) Seta cookie e volta
    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        Location: returnTo || "/painelsiqueirax.html",
        "Cache-Control": "no-store",
      },
      body: "",
    }
  } catch {
    return { statusCode: 302, headers: { Location: `/loginpainel.html?err=dc_fail` }, body: "" }
  }
}
