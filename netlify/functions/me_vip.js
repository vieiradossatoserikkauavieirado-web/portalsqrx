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
  const token = getCookie("sx_session", event.headers);
  if (!token) return { statusCode: 401, body: "Não autorizado" };

  const { data: sess, error } = await supabase
    .from("sessoes")
    .select("username, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !sess) return { statusCode: 401, body: "Não autorizado" };

  if (new Date(sess.expira_em).getTime() < Date.now()) {
    return { statusCode: 401, body: "Sessão expirada" };
  }

  // ✅ verifica VIP (ajuste o nome da tabela se for outro)
  const { data: vipUser, error: eVip } = await supabase
    .from("usuariovip")
    .select("username")
    .eq("username", sess.username)
    .maybeSingle();

  if (eVip) return { statusCode: 500, body: "Erro ao verificar VIP" };

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ username: sess.username, vip: !!vipUser }),
  };
};
