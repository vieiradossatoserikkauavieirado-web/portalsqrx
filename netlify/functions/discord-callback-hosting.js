const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
  return `sx_hosting_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400; Secure`;
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

exports.handler = async (event) => {
  try {
    const required = [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_REDIRECT_URI",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    for (const k of required) {
      if (!process.env[k]) {
        return {
          statusCode: 302,
          headers: { Location: "/hosting.html?err=loginfail" },
          body: "",
        };
      }
    }

    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");

    if (!code) {
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=loginfail" },
        body: "",
      };
    }

    const tokenData = await exchangeCodeForToken(code);
    const user = await getDiscordUser(tokenData.access_token);

    const token = crypto.randomUUID();

    const { error } = await supabase.from("sessoes_hosting").insert({
      token,
      discord_id: user.id,
      username: user.username,
      avatar: user.avatar || null,
      expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error) {
      console.error(error);
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=loginfail" },
        body: "",
      };
    }

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        Location: "/hosting.html?login=ok",
      },
      body: "",
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 302,
      headers: { Location: "/hosting.html?err=loginfail" },
      body: "",
    };
  }
};