const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
  // 1 hora
  return `sx_vip_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=3600; Secure`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
  });

  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await r.text();
  if (!r.ok) {
    // não mostra secrets, só o status + resposta do Discord
    throw new Error(`token_exchange_failed:${r.status}:${text}`);
  }
  return JSON.parse(text);
}

async function getDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`get_user_failed:${r.status}:${text}`);
  return JSON.parse(text);
}

async function getGuildMember(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  const r = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${botToken}` },
  });

  const text = await r.text();

  if (r.status === 404) return null; // não está no servidor
  if (!r.ok) throw new Error(`get_member_failed:${r.status}:${text}`);

  return JSON.parse(text);
}

exports.handler = async (event) => {
  try {
    // checa env básico
    const required = [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_REDIRECT_URI",
      "DISCORD_GUILD_ID",
      "DISCORD_VIP_ROLE_ID",
      "DISCORD_BOT_TOKEN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];
    for (const k of required) {
      if (!process.env[k]) return { statusCode: 500, body: `missing_env:${k}` };
    }

    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");
    if (!code) return { statusCode: 400, body: "missing_code" };

    // 1) troca code por token
    const tokenData = await exchangeCodeForToken(code);

    // 2) pega usuário
    const user = await getDiscordUser(tokenData.access_token);

    // 3) busca membro no servidor e cargos
    const member = await getGuildMember(user.id);
    if (!member) return { statusCode: 403, body: "not_in_guild" };

    const roles = member.roles || [];
    if (!roles.includes(process.env.DISCORD_VIP_ROLE_ID)) {
      return { statusCode: 403, body: "no_vip_role" };
    }

    // 4) cria sessão no Supabase
    const token = crypto.randomUUID();
    const payload = {
      token,
      username: `discord:${user.id}`,
      expira_em: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };

    const { error } = await supabase.from("sessoes_vip").insert(payload);
    if (error) {
      // retorna motivo do supabase (sem segredo)
      return { statusCode: 500, body: `supabase_insert_failed:${error.message}` };
    }

    // 5) cookie + redirect
    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        Location: "/gamemodesvip.html",
      },
      body: "",
    };
  } catch (e) {
    // mostra motivo (pra você ver sem logs)
    return { statusCode: 500, body: `internal_error:${String(e.message || e)}` };
  }
};
