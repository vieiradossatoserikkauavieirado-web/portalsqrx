// netlify/functions/discord-callback-ia.js
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const VIP_GOLD_ROLE_ID = "1465103020617633997";

function setCookie(token) {
  // Se quiser tornar isso configurável por env:
  // const dom = process.env.COOKIE_DOMAIN ? `; Domain=${process.env.COOKIE_DOMAIN}` : "";
  // return `sx_ia_session=${token}; HttpOnly; Path=/${dom}; SameSite=Lax; Max-Age=3600; Secure`;

  return `sx_ia_session=${token}; HttpOnly; Path=/; Domain=.portalsiqueirax.com.br; SameSite=Lax; Max-Age=3600; Secure`;
}

async function exchangeCodeForToken(code) {
  const redirectUri = (process.env.DISCORD_IA_REDIRECT_URI || "").trim();

  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const r = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`token_exchange_failed:${r.status}:${text}`);
  }

  return r.json();
}

async function getDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`get_user_failed:${r.status}:${text}`);
  }

  return r.json();
}

async function getGuildMember(userId) {
  const r = await fetch(
    `https://discord.com/api/v10/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  );

  if (r.status === 404) return null;
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`get_member_failed:${r.status}:${text}`);
  }

  return r.json();
}

function safeParseReturnTo(stateRaw) {
  let returnTo = "/ia.html";
  if (!stateRaw) return returnTo;

  try {
    const json = Buffer.from(String(stateRaw), "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (parsed?.returnTo && String(parsed.returnTo).startsWith("/")) {
      returnTo = parsed.returnTo;
    }
  } catch {}
  return returnTo;
}

exports.handler = async (event) => {
  try {
    const required = [
      "DISCORD_CLIENT_ID",
      "DISCORD_CLIENT_SECRET",
      "DISCORD_IA_REDIRECT_URI",
      "DISCORD_GUILD_ID",
      "DISCORD_BOT_TOKEN",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ];

    for (const k of required) {
      if (!process.env[k]) {
        console.error("missing env:", k);
        return {
          statusCode: 302,
          headers: { Location: "/loginia.html?err=missing_env" },
          body: "",
        };
      }
    }

    const qs = event.queryStringParameters || {};
    const code = qs.code;
    const stateRaw = qs.state || "";

    if (!code) {
      console.error("dc_code: missing ?code. rawUrl=", event.rawUrl || "");
      return {
        statusCode: 302,
        headers: { Location: "/loginia.html?err=dc_code" },
        body: "",
      };
    }

    const returnTo = safeParseReturnTo(stateRaw);

    // 1) troca code por token
    const tokenData = await exchangeCodeForToken(code);

    // 2) pega usuário
    const user = await getDiscordUser(tokenData.access_token);

    // 3) pega membro + cargos
    const member = await getGuildMember(user.id);
    if (!member) {
      return {
        statusCode: 302,
        headers: { Location: "/loginia.html?err=not_in_guild" },
        body: "",
      };
    }

    const roles = Array.isArray(member.roles) ? member.roles : [];
    if (!roles.includes(VIP_GOLD_ROLE_ID)) {
      return {
        statusCode: 302,
        headers: { Location: "/loginia.html?err=no_role" },
        body: "",
      };
    }

    // 4) cria sessão
    const token = crypto.randomUUID();
    const expira_em = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error } = await supabase.from("sessoes_ia").insert({
      token,
      username: `discord:${user.id}`,
      plan: "VIP GOLD",
      expira_em,
    });

    if (error) {
      // ✅ ISSO AQUI VAI TE DIZER O MOTIVO REAL NO NETLIFY LOG
      console.error("SUPABASE INSERT ERROR sessoes_ia:", error);

      // ✅ (opcional) mostra o motivo na URL do login
      const why = encodeURIComponent(error.message || "unknown");
      return {
        statusCode: 302,
        headers: { Location: `/loginia.html?err=sess&why=${why}` },
        body: "",
      };
    }

    // 5) cookie + redirect
    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": setCookie(token),
        "Cache-Control": "no-store",
        Location: returnTo,
      },
      body: "",
    };
  } catch (err) {
    console.error("discord-callback-ia error:", err?.message || err);
    return {
      statusCode: 302,
      headers: { Location: "/loginia.html?err=dc_fail" },
      body: "",
    };
  }
};
