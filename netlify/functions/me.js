const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, headers) {
  // Netlify pode mandar como cookie ou Cookie
  const cookieHeader = headers?.cookie || headers?.Cookie || headers?.COOKIE || "";
  if (!cookieHeader) return null;

  // parse robusto: pega exatamente name=...
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

exports.handler = async (event) => {
  try {
    const token = getCookie("sx_session", event.headers);
    if (!token) return { statusCode: 401, body: "Não autorizado (sem cookie)" };

    const { data: sess, error: eSess } = await supabase
      .from("sessoes")
      .select("username, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (eSess || !sess) return { statusCode: 401, body: "Não autorizado (sessão inválida)" };

    if (new Date(sess.expira_em).getTime() < Date.now()) {
      return { statusCode: 401, body: "Sessão expirada" };
    }

    // VIP (se você usa isso no painel)
    const { data: vipUser, error: eVip } = await supabase
      .from("usuariosvip") // confirme o nome exato da tabela
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
  } catch (err) {
    return { statusCode: 500, body: "Erro interno no /me" };
  }
};
