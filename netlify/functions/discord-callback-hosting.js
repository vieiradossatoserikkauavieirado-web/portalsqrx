// netlify/functions/discord-callback-hosting.js
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

/**
 * Discord OAuth callback for hosting
 * - troca `code` por access_token
 * - pega /users/@me
 * - cria sessão em sessoes_hosting (session_token, discord_id, username, avatar, created_at, expires_at)
 * - seta cookie HttpOnly e redireciona para /hosting.html?login=ok
 *
 * Ajuste env vars no Netlify antes de deployar.
 */

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI_HOSTING;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || "7", 10);
const COOKIE_NAME = "sx_hosting_session";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE || "");

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

exports.handler = async function (event) {
  try {
    // Query params
    const qs = event.queryStringParameters || {};
    const code = qs.code;
    const error = qs.error;

    if (error) {
      console.warn("Discord callback returned error:", error);
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=loginfail" },
        body: ""
      };
    }

    if (!code) {
      return {
        statusCode: 400,
        body: "Missing code"
      };
    }

    // Exchange code -> token
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(()=>null);
      console.error("Discord token exchange failed:", tokenRes.status, text);
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=loginfail" },
        body: ""
      };
    }

    const tokenJson = await tokenRes.json();
    const access_token = tokenJson.access_token;
    if (!access_token) {
      console.error("No access_token in token response:", tokenJson);
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=loginfail" },
        body: ""
      };
    }

    // Fetch user info
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!userRes.ok) {
      const t = await userRes.text().catch(()=>null);
      console.error("Discord user fetch failed:", userRes.status, t);
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=loginfail" },
        body: ""
      };
    }

    const userJson = await userRes.json();
    const discord_id = userJson.id;
    const username = (userJson.username && userJson.discriminator) ? `${userJson.username}#${userJson.discriminator}` : (userJson.username || discord_id);
    const avatar = userJson.avatar || null;

    // Create session in Supabase
    const session_token = generateToken(32);
    const created_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const payload = {
      session_token,
      discord_id,
      username,
      avatar,
      created_at,
      expires_at
    };

    const { data, error: insertErr } = await supabase
      .from("sessoes_hosting")
      .insert(payload)
      .select()
      .single();

    if (insertErr) {
      console.error("Erro ao inserir sessão no Supabase:", insertErr);
      // redireciona para página de erro de sessão
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=sessionfail" },
        body: ""
      };
    }

    // Set cookie
    const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60; // segundos
    // Em dev local talvez queira remover Secure; aqui adiciono Secure apenas em produção
    const isProd = (process.env.NODE_ENV === "production");
    const secureFlag = isProd ? "Secure; " : "";
    // SameSite=Lax permite envio em retornos GET top-level (checkout redirect)
    const cookie = `${COOKIE_NAME}=${encodeURIComponent(session_token)}; HttpOnly; Path=/; Max-Age=${maxAge}; ${secureFlag}SameSite=Lax`;

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": cookie,
        "Location": "/hosting.html?login=ok"
      },
      body: ""
    };
  } catch (err) {
    console.error("discord-callback-hosting error:", err);
    return {
      statusCode: 302,
      headers: { Location: "/hosting.html?err=loginfail" },
      body: ""
    };
  }
};