const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
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

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`token_exchange_failed:${r.status}:${text}`);
  }

  return r.json();
}

async function getDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(`get_user_failed:${r.status}:${text}`);
  }

  return r.json();
}

async function getGuildMember(userId) {
  const r = await fetch(
    `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}`,
    {
      headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
    }
  );

  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`get_member_failed:${r.status}:${text}`);
  }

  return r.json();
}

exports.handler = async (event) => {
  try {
    // valida envs essenciais
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
      if (!process.env[k]) {
        return {
          statusCode: 302,
          headers: { Location: "/login.vip.html?err=loginfail" },
          body: "",
        };
      }
    }

    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");
    if (!code) {
      return {
        statusCode: 302,
        headers: { Location: "/login.vip.html?err=loginfail" },
        body: "",
      };
    }

    // 1) OAuth
    const tokenData = await exchangeCodeForToken(code);

    // 2) usuário
    const user = await getDiscordUser(tokenData.access_token);

    // 3) membro + cargos
    const member = await getGuildMember(user.id);
    if (!member) {
      return {
        statusCode: 302,
        headers: { Location: "/login.vip.html?err=loginfail" },
        body: "",
      };
    }

    const roles = member.roles || [];
    if (!roles.includes(process.env.DISCORD_VIP_ROLE_ID)) {
      return {
        statusCode: 302,
        headers: { Location: "/login.vip.html?err=novip" },
        body: "",
      };
    }

    // 4) cria sessão VIP
    const token = crypto.randomUUID();
    const { error } = await supabase.from("sessoes_vip").insert({
      token,
      username: `discord:${user.id}`,
      expira_em: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      return {
        statusCode: 302,
        headers: { Location: "/login.vip.html?err=loginfail" },
        body: "",
      };
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
  } catch {
    return {
      statusCode: 302,
      headers: { Location: "/login.vip.html?err=loginfail" },
      body: "",
    };
  }
};
