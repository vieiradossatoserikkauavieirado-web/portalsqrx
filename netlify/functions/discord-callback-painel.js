const crypto = require("crypto")

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

function parseState(raw) {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
  } catch {
    return { returnTo: "/painelsiqueirax.html" }
  }
}

function setCookie(token) {
  // 10 min (mude se quiser)
  return `sx_painel_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600; Secure`
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

async function getGuildMember(userId) {
  const r = await fetch(
    `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  )
  if (r.status === 404) return null
  if (!r.ok) throw new Error("get_member_failed")
  return r.json()
}

exports.handler = async (event) => {
  const url = new URL(event.rawUrl)
  const code = url.searchParams.get("code")
  const stateRaw = url.searchParams.get("state") || ""
  const { returnTo } = parseState(stateRaw)

  const redirectUri = (process.env.DISCORD_PAINEL_REDIRECT_URI || "").trim().replace(/\/$/, "")
  const secret = process.env.PAINEL_SESSION_SECRET

  try {
    if (!code) return { statusCode: 302, headers: { Location: `${returnTo}?err=painellogin` }, body: "" }
    if (!redirectUri) return { statusCode: 500, body: "missing_env:DISCORD_PAINEL_REDIRECT_URI" }
    if (!secret) return { statusCode: 500, body: "missing_env:PAINEL_SESSION_SECRET" }

    const tokenData = await exchangeCodeForToken(code, redirectUri)
    const user = await getDiscordUser(tokenData.access_token)

    const member = await getGuildMember(user.id)
    if (!member) return { statusCode: 302, headers: { Location: `${returnTo}?err=notguild` }, body: "" }

    // ✅ role necessária pro painel (configure no .env)
    const roles = member.roles || []
    if (!roles.includes(process.env.DISCORD_PAINEL_ROLE_ID)) {
      return { statusCode: 302, headers: { Location: `${returnTo}?err=nopainelrole` }, body: "" }
    }

    // assina token
    const token = sign(
      { discord_id: user.id, username: user.username, exp: Date.now() + 10 * 60 * 1000 },
      secret
    )

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        Location: returnTo,
        "Cache-Control": "no-store",
      },
      body: "",
    }
  } catch {
    return { statusCode: 302, headers: { Location: `${returnTo}?err=painellogin` }, body: "" }
  }
}
