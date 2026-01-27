const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
  // Igual ao VIP: sem Domain fixo (melhor pra Netlify + domínio)
  return `sx_painel_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600; Secure`;
}

exports.handler = async (event) => {
  const qs = event.queryStringParameters || {};
  const returnTo = (qs.return && qs.return.startsWith("/")) ? qs.return : "/painelsiqueirax.html";

  try {
    // chama o /me com o MESMO cookie do usuário
    const origin = `https://${event.headers.host}`;
    const cookie = event.headers.cookie || event.headers.Cookie || "";

    const meRes = await fetch(`${origin}/.netlify/functions/me`, {
      headers: { cookie },
      cache: "no-store"
    });

    if (!meRes.ok) {
      return { statusCode: 302, headers: { Location: "/login.html" }, body: "" };
    }

    const me = await meRes.json().catch(() => ({}));
    const username = String(me.username || "").trim();

    if (!username) {
      return { statusCode: 302, headers: { Location: "/login.html" }, body: "" };
    }

    // Permissão do painel por username (igual estilo VIP: tabela separada)
    const { data: painelUser, error: eUser } = await supabase
      .from("usuarios_painel")
      .select("username, role, ativo")
      .eq("username", username)
      .maybeSingle();

    if (eUser || !painelUser) {
      return { statusCode: 302, headers: { Location: "/loginpainel.html?err=nopainel" }, body: "" };
    }
    if (!painelUser.ativo) {
      return { statusCode: 302, headers: { Location: "/loginpainel.html?err=desativado" }, body: "" };
    }

    // Cria sessão painel
    const token = crypto.randomUUID();
    const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: eSess } = await supabase
      .from("sessoes_painel")
      .insert({ token, username: painelUser.username, role: painelUser.role || "admin", expira_em });

    if (eSess) {
      return { statusCode: 302, headers: { Location: "/loginpainel.html?err=sess" }, body: "" };
    }

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        "Cache-Control": "no-store",
        Location: returnTo
      },
      body: ""
    };
  } catch {
    return { statusCode: 302, headers: { Location: "/loginpainel.html?err=fail" }, body: "" };
  }
};
