const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function getCookie(event, name) {
  const raw = event.headers.cookie || ""
  const parts = raw.split(";").map(s => s.trim())
  const found = parts.find(p => p.startsWith(name + "="))
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null
}

exports.handler = async (event) => {
  try {
    const token = getCookie(event, "sx_painel_session")
    if (!token) return { statusCode: 401, body: "no_session" }

    const { data, error } = await supabase
      .from("sessoes_painel")
      .select("username, role, expira_em")
      .eq("token", token)
      .maybeSingle()

    if (error || !data) return { statusCode: 401, body: "invalid_session" }
    if (new Date(data.expira_em).getTime() < Date.now()) return { statusCode: 401, body: "expired" }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify(data),
    }
  } catch {
    return { statusCode: 500, body: "fail" }
  }
}
