const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, headers) {
  const cookieHeader = headers?.cookie || "";
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getUserFromSession(event) {
  const token = getCookie("sx_portal_session", event.headers);
  if (!token) return null;

  const { data } = await supabase
    .from("sessoes_portal")
    .select("discord_id, username, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  if (new Date(data.expira_em).getTime() < Date.now()) return null;

  return data;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST")
      return { statusCode: 405 };

    const user = await getUserFromSession(event);
    if (!user)
      return { statusCode: 401, body: "not_logged" };

    const body = JSON.parse(event.body || "{}");

    const { name, ip, discord, logoUrl } = body;

    if (!name || !ip)
      return { statusCode: 400, body: "invalid_fields" };

    const serverId = `srv_${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    const serverData = {
      serverId,
      ownerId: user.discord_id,
      name,
      ip,
      discord: discord || "",
      logoUrl: logoUrl || "",
      status: "pending",
      votes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    // envia pro canal DB
    await fetch(`https://discord.com/api/v10/channels/${process.env.DB_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: "```json\n" + JSON.stringify(serverData, null, 2) + "\n```"
      })
    });

    // envia log
    await fetch(`https://discord.com/api/v10/channels/${process.env.LOG_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: `📥 Novo servidor cadastrado\nID: ${serverId}\nNome: ${name}\nOwner: <@${user.discord_id}>`
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    return { statusCode: 500, body: "internal_error" };
  }
};