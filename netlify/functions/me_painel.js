const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(event, name) {
  const raw = event.headers.cookie || event.headers.Cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  for (const p of parts) {
    const [k, ...v] = p.split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const token = getCookie(event, "sx_painel_session");
    if (!token) {
      return { statusCode: 401, headers: { "Cache-Control": "no-store" }, body: "no_session" };
    }

    const { data: sess, error } = await supabase
      .from("sessoes_painel")
      .select("token, username, role, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (error || !sess) {
      return { statusCode: 401, headers: { "Cache-Control": "no-store" }, body: "invalid_session" };
    }

    const exp = new Date(sess.expira_em).getTime();
    if (Number.isNaN(exp) || Date.now() > exp) {
      return { statusCode: 401, headers: { "Cache-Control": "no-store" }, body: "expired_session" };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ ok: true, username: sess.username, role: sess.role }),
    };
  } catch {
    return { statusCode: 500, headers: { "Cache-Control": "no-store" }, body: "internal_error" };
  }
};
