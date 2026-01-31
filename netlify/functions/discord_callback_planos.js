const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
  return `sx_painel_session=${token}; HttpOnly; Path=/; Domain=.portalsiqueirax.com.br; SameSite=Lax; Max-Age=3600; Secure`;
}

const REDIRECT_URI = (
  process.env.DISCORD_PLANOS_REDIRECT_URI ||
  process.env.DISCORD_PAINEL_REDIRECT_URI ||
  process.env.DISCORD_REDIRECT_URI ||
  ""
).trim();

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
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
    `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}`,
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
    const required = [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_GUILD_ID",
      "DISCORD_BOT_TOKEN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    for (const k of required) {
      if (!process.env[k]) {
        return {
          statusCode: 302,
          headers: { Location: "/loginplanos.html?err=missing_env" },
          body: "",
        };
      }
    }

    if (!REDIRECT_URI) {
      return {
        statusCode: 302,
        headers: { Location: "/loginplanos.html?err=missing_redirect" },
        body: "",
      };
    }

    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");
    if (!code) {
      return {
        statusCode: 302,
        headers: { Location: "/loginplanos.html?err=dc_code" },
        body: "",
      };
    }

    const stateRaw = url.searchParams.get("state") || "";
    let returnTo = "/planos.html";
    try {
      const parsed = JSON.parse(
        Buffer.from(stateRaw, "base64url").toString("utf8")
      );
      if (parsed?.returnTo && String(parsed.returnTo).startsWith("/")) {
        returnTo = parsed.returnTo;
      }
    } catch {}

    const tokenData = await exchangeCodeForToken(code);
    const user = await getDiscordUser(tokenData.access_token);

    const member = await getGuildMember(user.id);
    if (!member) {
      return {
        statusCode: 302,
        headers: { Location: "/loginplanos.html?err=not_in_guild" },
        body: "",
      };
    }

    const token = crypto.randomUUID();
    const { error } = await supabase.from("sessoes_painel").insert({
      token,
      username: `discord:${user.id}`,
      role: "planos",
      expira_em: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      return {
        statusCode: 302,
        headers: { Location: "/loginplanos.html?err=sess" },
        body: "",
      };
    }

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        Location: returnTo,
      },
      body: "",
    };
  } catch {
    return {
      statusCode: 302,
      headers: { Location: "/loginplanos.html?err=dc_fail" },
      body: "",
    };
  }
};
