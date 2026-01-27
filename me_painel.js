const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, headers) {
  const cookieHeader = headers?.cookie || headers?.Cookie || headers?.COOKIE || "";
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

exports.handler = async (event) => {
  try {
    const token = getCookie("sx_painel_session", event.headers);
    if (!token) return { statusCode: 401, body: "no_session" };

    const { data: sess, error } = await supabase
      .from("sessoes_painel")
      .select("username, role, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (error || !sess) return { statusCode: 401, body: "invalid_session" };

    const exp = new Date(sess.expira_em).getTime();
    if (!exp || Number.isNaN(exp) || exp < Date.now()) {
      return { statusCode: 401, body: "expired_session" };
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
    return { statusCode: 500, body: "internal_error" };
  }
};
