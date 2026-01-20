const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, cookieHeader) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  const found = parts.find((p) => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=")[1]) : null;
}

exports.handler = async (event) => {
  const token = getCookie("sx_session", event.headers.cookie);
  if (!token) return { statusCode: 401, body: "Não autorizado" };

  const { data: sess, error: eSess } = await supabase
    .from("sessoes")
    .select("username, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (eSess || !sess) return { statusCode: 401, body: "Não autorizado" };
  if (new Date(sess.expira_em).getTime() < Date.now()) {
    return { statusCode: 401, body: "Sessão expirada" };
  }

  // ✅ Verifica se username existe na tabela VIP
  const { data: vipUser, error: eVip } = await supabase
    .from("usuariosvip") // <-- sua tabela VIP
    .select("username")
    .eq("username", sess.username)
    .maybeSingle();

  if (eVip) {
    return { statusCode: 500, body: "Erro ao verificar VIP" };
  }

  const isVip = !!vipUser;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: sess.username, vip: isVip }),
  };
};
