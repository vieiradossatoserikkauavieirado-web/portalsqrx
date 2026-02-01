const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(event, name) {
  const raw = event.headers.cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  const found = parts.find(p => p.startsWith(name + "="));
  return found ? decodeURIComponent(found.split("=").slice(1).join("=")) : null;
}

function planLabel(plano) {
  if (plano === "vip_30d") return "VIP Comum (30 dias) - R$ 25,00";
  if (plano === "gold_perm") return "GOLD (permanente) - R$ 50,00";
  return null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "method_not_allowed" };

    const channelId = process.env.DISCORD_VIP_CHANNEL_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (!channelId || !botToken) {
      return { statusCode: 500, body: "missing_env: DISCORD_VIP_CHANNEL_ID or DISCORD_BOT_TOKEN" };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch {}
    const plano = String(body.plano || "").trim();
    const label = planLabel(plano);
    if (!label) return { statusCode: 400, body: "invalid_plan" };

    const token = getCookie(event, "sx_painel_session");
    if (!token) return { statusCode: 401, body: "no_session" };

    const { data: sess } = await supabase
      .from("sessoes_painel")
      .select("username, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (!sess) return { statusCode: 401, body: "invalid_session" };
    if (new Date(sess.expira_em).getTime() < Date.now()) return { statusCode: 401, body: "expired" };

    const username = String(sess.username || "");
    if (!username.startsWith("discord:")) return { statusCode: 403, body: "not_discord_session" };

    const discordId = username.split("discord:")[1];
    if (!discordId) return { statusCode: 400, body: "bad_discord_id" };

    const content =
      `✅ **VIP PAGO (pendente ativação)**\n` +
      `Usuário: <@${discordId}>\n` +
      `Plano: **${label}**\n` +
      `Ativar via /setarvip`;

    const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content,
        allowed_mentions: { users: [discordId] },
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return { statusCode: 500, body: `discord_send_failed:${r.status}:${text}` };
    }

    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  } catch {
    return { statusCode: 500, body: "fail" };
  }
};
