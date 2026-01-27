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

function clearCookie() {
  // apaga cookie do painel
  return `sx_painel_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure`;
}

exports.handler = async (event) => {
  try {
    const token = getCookie("sx_painel_session", event.headers);

    // tenta remover do banco (se tiver token)
    if (token) {
      await supabase
        .from("sessoes_painel")
        .delete()
        .eq("token", token);
    }

    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": clearCookie(),
        "Cache-Control": "no-store",
        "Content-Type": "text/plain",
      },
      body: "ok",
    };
  } catch {
    // mesmo se der erro, tenta limpar cookie
    return {
      statusCode: 200,
      headers: {
        "Set-Cookie": clearCookie(),
        "Cache-Control": "no-store",
        "Content-Type": "text/plain",
      },
      body: "ok",
    };
  }
};
