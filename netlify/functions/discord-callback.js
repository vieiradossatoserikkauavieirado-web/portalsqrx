const crypto = require("crypto");

function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

async function discordTokenExchange(code) {
  const tokenUrl = "https://discord.com/api/oauth2/token";

  const body = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: process.env.DISCORD_REDIRECT_URI
  });

  const r = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`token_exchange_failed: ${t}`);
  }
  return r.json();
}

async function getDiscordUser(accessToken) {
  const r = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!r.ok) throw new Error("get_user_failed");
  return r.json();
}

async function getGuildMemberRoles(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  // Bot precisa estar no servidor. (Seu bot já está)
  const r = await fetch(`https://discord.com/api/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${botToken}` }
  });

  if (r.status === 404) return null; // não está no servidor
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`get_member_failed: ${t}`);
  }

  const member = await r.json();
  return member.roles || [];
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const code = url.searchParams.get("code");
    if (!code) {
      return { statusCode: 400, body: "Código OAuth ausente." };
    }

    const token = await discordTokenExchange(code);
    const user = await getDiscordUser(token.access_token);

    const roles = await getGuildMemberRoles(user.id);
    if (!roles) {
      return { statusCode: 403, body: "Você não está no servidor do Discord." };
    }

    const vipRoleId = process.env.DISCORD_VIP_ROLE_ID;
    const isVip = roles.includes(vipRoleId);

    if (!isVip) {
      return { statusCode: 403, body: "Acesso negado: você não possui o cargo VIP." };
    }

    // cria cookie vip_session (assinado) válido por 2h
    const secret = process.env.VIP_SESSION_SECRET;
    const now = Date.now();
    const payload = {
      discord_id: user.id,
      username: `${user.username}${user.discriminator && user.discriminator !== "0" ? "#" + user.discriminator : ""}`,
      iat: now,
      exp: now + 2 * 60 * 60 * 1000
    };

    const tokenSigned = sign(payload, secret);

    return {
      statusCode: 302,
      headers: {
        "Set-Cookie": [
          `vip_session=${tokenSigned}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${2 * 60 * 60}`
        ],
        Location: "/gamemodesvip.html"
      },
      body: ""
    };
  } catch (e) {
    return { statusCode: 500, body: "Erro interno no login VIP." };
  }
};
