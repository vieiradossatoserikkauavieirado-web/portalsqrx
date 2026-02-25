const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function setCookie(token) {
  return `sx_portal_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400; Secure`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI_PORTAL,
  });

  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!r.ok) throw new Error("token_exchange_failed");
  return r.json();
}

async function getDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) throw new Error("get_user_failed");
  return r.json();
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // 👈 agora usamos state

    let redirectTo = state || "/index.html";

    // garante que vai ser caminho absoluto (evita /functions/index.html)
    if (!redirectTo.startsWith("/") && !redirectTo.startsWith("http")) {
    redirectTo = "/" + redirectTo;
    }

    // opcional: segurança (evita open redirect)
    if (redirectTo.startsWith("http")) {
    redirectTo = "/index.html";
    }

    if (!code) {
      return {
        statusCode: 302,
        headers: { Location: "/loginportal.html?err=loginfail" },
      };
    }

    const tokenData = await exchangeCodeForToken(code);
    const user = await getDiscordUser(tokenData.access_token);

    const token = crypto.randomUUID();

    await supabase.from("sessoes_portal").insert({
      token,
      discord_id: user.id,
      username: user.username,
      expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        Location: redirectTo,
      },
    };

  } catch (err) {
    return {
      statusCode: 302,
      headers: { Location: "/loginportal.html?err=loginfail" },
    };
  }
};