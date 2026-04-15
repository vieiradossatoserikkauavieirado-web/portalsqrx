// netlify/functions/discord-callback-hosting.js
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI = process.env.DISCORD_REDIRECT_HOSTING;
const SESSION_TTL_DAYS = parseInt(process.env.SESSION_TTL_DAYS || "7", 10);
const COOKIE_NAME = "sx_hosting_session";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error("Supabase env missing");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

function generateToken(len = 48) {
  return crypto.randomBytes(len).toString("hex");
}

exports.handler = async function (event) {
  const params = event.queryStringParameters || {};
  const code = params.code;
  const error = params.error;

  if (error) {
    return {
      statusCode: 302,
      headers: { Location: "/hosting.html?err=loginfail" },
      body: ""
    };
  }
  if (!code) {
    return {
      statusCode: 400,
      body: "missing code"
    };
  }

  try {
    // 1) exchange code por token no Discord
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!tokenRes.ok) throw new Error("discord token exchange failed");
    const tokenJson = await tokenRes.json();
    const access_token = tokenJson.access_token;

    // 2) pega dados do usuário
    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` }
    });
    if (!userRes.ok) throw new Error("discord user fetch failed");
    const userJson = await userRes.json();
    const discord_id = userJson.id;
    const username = `${userJson.username}#${userJson.discriminator}`;
    const avatar = userJson.avatar || null;

    // 3) cria sessão no Supabase
    const session_token = generateToken(32);
    const created_at = new Date().toISOString();
    const expires_at = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { data, error: insertErr } = await supabase
      .from("sessoes_hosting")
      .insert({
        session_token,
        discord_id,
        discord_username: username,
        discord_avatar: avatar,
        created_at,
        expires_at
      })
      .select()
      .single();

    if (insertErr) {
      console.error("Erro insert session:", insertErr);
      // mesmo em erro, podemos redirecionar com falha
      return {
        statusCode: 302,
        headers: { Location: "/hosting.html?err=sessionfail" },
        body: ""
      };
    }

    // 4) set-Cookie e redireciona para pagina de planos (ou onde quiser)
    // Cookie settings:
    // - HttpOnly: evita JS ler
    // - Secure: true em produção https
    // - SameSite=Lax: permite incluir cookie em navegacoes top-level GET (retorno de checkout)
    // - Max-Age ou Expires: alinhado com expires_at
    const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60; // em segundos
    const cookie = `${COOKIE_NAME}=${encodeURIComponent(session_token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": cookie,
        Location: "/hosting.html?login=ok"
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