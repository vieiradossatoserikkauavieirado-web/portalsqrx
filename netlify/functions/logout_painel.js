const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getCookie(event, name) {
  const raw = event.headers.cookie || event.headers.Cookie || ""
  const parts = raw.split(";").map(s => s.trim())
  for (const p of parts) {
    const [k, ...v] = p.split("=")
    if (k === name) return v.join("=")
  }
  return null
}

exports.handler = async (event) => {
  const token = getCookie(event, "sx_painel_session")

  if (token) {
    try { await supabase.from("sessoes_painel").delete().eq("token", token) } catch {}
  }

  const clear =
    "sx_painel_session=; Path=/; Domain=.portalsiqueirax.com.br; HttpOnly; SameSite=Lax; Secure; Max-Age=0"

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": clear,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain"
    },
    body: "ok"
  }
}
