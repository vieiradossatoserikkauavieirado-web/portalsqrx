const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

/**
 * Lê cookie pelo nome
 */
function getCookie(event, name) {
  const raw =
    event.headers.cookie ||
    event.headers.Cookie ||
    ""

  if (!raw) return null

  const cookies = raw.split(";").map(c => c.trim())
  for (const c of cookies) {
    if (!c.startsWith(name + "=")) continue
    return c.substring(name.length + 1)
  }
  return null
}

exports.handler = async (event) => {
  try {
    /* ===============================
       1. Lê cookie de sessão
    =============================== */
    const token = getCookie(event, "sx_vip_session")
    if (!token) {
      return {
        statusCode: 401,
        body: "no_session"
      }
    }

    /* ===============================
       2. Busca sessão no Supabase
    =============================== */
    const { data: sess, error } = await supabase
      .from("sessoes_vip")
      .select("token, username, expira_em")
      .eq("token", token)
      .limit(1)
      .maybeSingle()

    if (error || !sess) {
      return {
        statusCode: 401,
        body: "invalid_session"
      }
    }

    /* ===============================
       3. Verifica expiração
    =============================== */
    const exp = new Date(sess.expira_em).getTime()
    if (!exp || Number.isNaN(exp) || Date.now() > exp) {
      return {
        statusCode: 401,
        body: "expired_session"
      }
    }

    /* ===============================
       4. OK — sessão válida
    =============================== */
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        // evita cache agressivo
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        vip: true,
        username: sess.username
      })
    }

  } catch (err) {
    console.error("me_vip error:", err)

    return {
      statusCode: 500,
      body: "internal_error"
    }
  }
}
