const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(event, name) {
  const raw = event.headers.cookie || event.headers.Cookie || event.headers.COOKIE || "";
  if (!raw) return null;

  const parts = raw.split(";").map(s => s.trim());
  for (const p of parts) {
    const [k, ...v] = p.split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function extractDiscordId(username) {
  // espera "discord:1234567890"
  const u = String(username || "").trim();
  if (!u) return "";
  const m = u.match(/^discord:(\d+)$/);
  return m ? m[1] : "";
}

async function getGuildMember(userId) {
  const guildId = (process.env.DISCORD_GUILD_ID || "").trim();
  const botToken = (process.env.DISCORD_BOT_TOKEN || "").trim();

  const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (r.status === 404) return null; // não está no servidor
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`get_member_failed:${r.status}:${text}`);
  }

  return r.json();
}

exports.handler = async (event) => {
  try {
    // valida envs essenciais pra checar cargo
    const required = [
      "DISCORD_GUILD_ID",
      "DISCORD_BOT_TOKEN",
      "DISCORD_VIP_ROLE_ID",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];
    for (const k of required) {
      if (!process.env[k]) {
        return { statusCode: 500, body: "missing_env:" + k };
      }
    }

    // 1) cookie
    const token = getCookie(event, "sx_vip_session");
    if (!token) return { statusCode: 401, body: "no_session" };

    // 2) sessão no supabase
    const { data: sess, error } = await supabase
      .from("sessoes_vip")
      .select("token, username, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (error || !sess) {
      return { statusCode: 401, body: "invalid_session" };
    }

    const exp = new Date(sess.expira_em).getTime();
    if (Number.isNaN(exp) || Date.now() > exp) {
      // opcional: limpa sessão expirada
      await supabase.from("sessoes_vip").delete().eq("token", token);
      return { statusCode: 401, body: "expired_session" };
    }

    // 3) extrai discord id salvo na sessão
    const discordId = extractDiscordId(sess.username);
    if (!discordId) {
      // se você quiser, pode manter compatível com sessões antigas
      return { statusCode: 401, body: "no_discord_id_in_session" };
    }

    // 4) checa cargo VIP no servidor
    const member = await getGuildMember(discordId);
    if (!member) {
      // saiu do servidor -> perde acesso
      await supabase.from("sessoes_vip").delete().eq("token", token);
      return { statusCode: 401, body: "not_in_guild" };
    }

    const roles = Array.isArray(member.roles) ? member.roles : [];
    const vipRoleId = String(process.env.DISCORD_VIP_ROLE_ID).trim();

    if (!roles.includes(vipRoleId)) {
      // não tem mais o cargo -> perde acesso
      await supabase.from("sessoes_vip").delete().eq("token", token);
      return { statusCode: 401, body: "no_vip_role" };
    }

    // 5) ok
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        vip: true,
        username: sess.username,
        discord_id: discordId,
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: "internal_error" };
  }
};
