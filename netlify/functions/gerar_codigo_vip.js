const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(event, name) {
  const raw = event.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function makeCode() {
  // SX-XXXXXX (hex)
  return "SX-" + crypto.randomBytes(3).toString("hex").toUpperCase();
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method_not_allowed" };
    }

    const sessionToken = getCookie(event, "sx_painel_session");
    if (!sessionToken) return { statusCode: 401, body: "no_session" };

    // valida sessão do seu login (tabela que você já usa)
    const { data: sess } = await supabase
      .from("sessoes_painel")
      .select("username, expira_em")
      .eq("token", sessionToken)
      .single();

    if (!sess) return { statusCode: 401, body: "invalid_session" };

    const exp = new Date(sess.expira_em).getTime();
    if (!exp || exp < Date.now()) return { statusCode: 401, body: "expired" };

    // username = "discord:ID"
    const discordId = String(sess.username || "").startsWith("discord:")
      ? String(sess.username).split(":")[1]
      : null;

    if (!discordId) return { statusCode: 401, body: "no_discord_id" };

    const { plano } = JSON.parse(event.body || "{}");

    const planos = {
      vip_30d: { valor: 2500, nome: "VIP Comum 30 dias" },
      gold_perm: { valor: 5000, nome: "VIP Gold Permanente" },
    };

    if (!planos[plano]) return { statusCode: 400, body: "bad_plano" };

    const codigo = makeCode();

    const { error } = await supabase.from("vip_codigos").insert({
      codigo,
      discord_id: discordId,
      plano,
      valor: planos[plano].valor,
      status: "pendente",
    });

    if (error) return { statusCode: 500, body: "db_fail" };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        codigo,
        plano_nome: planos[plano].nome,
        valor_reais: (planos[plano].valor / 100).toFixed(2).replace(".", ","),
      }),
    };
  } catch {
    return { statusCode: 500, body: "fail" };
  }
};
