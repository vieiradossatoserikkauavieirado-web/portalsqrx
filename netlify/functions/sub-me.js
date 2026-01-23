const crypto = require("crypto");

function getCookie(event, name) {
  const raw = event.headers.cookie || event.headers.Cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  for (const p of parts) {
    const [k, ...v] = p.split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function verify(token, secret) {
  if (!token || !token.includes(".")) return null;

  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig !== expected) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!payload.discord_id) return null;
  if (!payload.exp || Date.now() > payload.exp) return null;

  return payload;
}

async function getMemberRoles(discordId) {
  const r = await fetch(
    `https://discord.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members/${discordId}`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  );

  if (r.status === 404) return null;
  if (!r.ok) return null;

  const m = await r.json();
  return m.roles || [];
}

exports.handler = async (event) => {
  try {
    const t = getCookie(event, "sx_sub_session");
    const payload = verify(t, process.env.SUB_SESSION_SECRET);
    if (!payload) return { statusCode: 401, body: "no_sub_session" };

    // ✅ checagem REALTIME no Discord
    const roles = await getMemberRoles(payload.discord_id);
    if (!roles) return { statusCode: 401, body: "not_in_guild" };

    if (!roles.includes(process.env.DISCORD_SUB_ROLE_ID)) {
      return { statusCode: 401, body: "no_sub_role" };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ ok: true })
    };
  } catch {
    return { statusCode: 500, body: "internal_error" };
  }
};
