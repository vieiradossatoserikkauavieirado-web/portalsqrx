const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
  // Igual VIP (sem Domain fixo)
  return `sx_painel_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600; Secure`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Método não permitido" };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

  const username = (body.username || "").trim();
  const password = (body.password || "").trim();
  if (!username || !password) {
    return { statusCode: 400, body: "Dados inválidos" };
  }

  // Usuário do painel
  const { data: user, error: eUser } = await supabase
    .from("usuarios_painel")
    .select("username, password, role, ativo")
    .eq("username", username)
    .maybeSingle();

  if (eUser || !user) {
    return { statusCode: 401, body: "Usuário ou senha incorretos." };
  }
  if (!user.ativo) {
    return { statusCode: 403, body: "Conta desativada." };
  }
  if ((user.password || "").trim() !== password) {
    return { statusCode: 401, body: "Usuário ou senha incorretos." };
  }

  // Sessão do painel
  const token = crypto.randomUUID();
  const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error: eSess } = await supabase.from("sessoes_painel").insert({
    token,
    username: user.username,
    role: user.role || "admin",
    expira_em,
  });

  if (eSess) {
    return { statusCode: 500, body: "Erro ao criar sessão painel (sessoes_painel)" };
  }

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": setCookie(token),
      "Cache-Control": "no-store",
      "Content-Type": "text/plain",
    },
    body: "ok",
  };
};
