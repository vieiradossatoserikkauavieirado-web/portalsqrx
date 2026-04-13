const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildCookie(token) {
  return [
    `sx_hosting_session=${token}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    "Max-Age=86400",
    "Secure",
  ].join("; ");
}

async function exchangeCodeForToken(code) {
  const redirectUri = (process.env.DISCORD_REDIRECT_URI_HOSTING || "")
    .trim()
    .replace(/\/$/, "");

  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`token_exchange_failed:${response.status}:${text}`);
  }

  return response.json();
}

async function getDiscordUser(accessToken) {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`get_user_failed:${response.status}:${text}`);
  }

  return response.json();
}

exports.handler = async (event) => {
  try {
    const requiredEnv = [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_REDIRECT_URI_HOSTING",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    for (const key of requiredEnv) {
      if (!process.env[key]) {
        return {
          statusCode: 302,
          headers: {
            Location: "/hosting.html?err=missingenv",
            "Cache-Control": "no-store",
          },
          body: "",
        };
      }
    }

    const rawUrl =
      event.rawUrl ||
      `https://${event.headers.host}${event.path}${event.rawQuery ? `?${event.rawQuery}` : ""}`;

    const url = new URL(rawUrl);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      return {
        statusCode: 302,
        headers: {
          Location: "/hosting.html?err=loginfail",
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }

    const tokenData = await exchangeCodeForToken(code);
    const user = await getDiscordUser(tokenData.access_token);

    if (!user?.id || !user?.username) {
      return {
        statusCode: 302,
        headers: {
          Location: "/hosting.html?err=invaliddiscorduser",
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }

    const token = crypto.randomUUID();
    const expiraEm = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await supabase.from("sessoes_hosting").insert({
      token,
      discord_id: user.id,
      username: user.username,
      avatar: user.avatar || null,
      expira_em: expiraEm,
    });

    if (insertError) {
      console.error("supabase insert sessoes_hosting error:", insertError);

      return {
        statusCode: 302,
        headers: {
          Location: "/hosting.html?err=sessionfail",
          "Cache-Control": "no-store",
        },
        body: "",
      };
    }

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": buildCookie(token),
        Location: "/hosting.html?login=ok",
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch (err) {
    console.error("discord-callback-hosting error:", err);

    return {
      statusCode: 302,
      headers: {
        Location: "/hosting.html?err=loginfail",
        "Cache-Control": "no-store",
      },
      body: "",
    };
  }
};