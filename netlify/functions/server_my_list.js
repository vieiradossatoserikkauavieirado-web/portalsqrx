async function fetchMessages(channelId) {
  const r = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
    { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } }
  );
  if (!r.ok) return [];
  return r.json();
}

function parseJson(content) {
  try {
    return JSON.parse(content.replace(/```json|```/g, "").trim());
  } catch { return null; }
}

exports.handler = async (event) => {
  try {
    const token = event.headers.cookie?.match(/sx_portal_session=([^;]+)/)?.[1];
    if (!token) return { statusCode: 401 };

    // validar sessão no supabase
    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data } = await supabase
      .from("sessoes_portal")
      .select("discord_id")
      .eq("token", token)
      .maybeSingle();

    if (!data) return { statusCode: 401 };

    const msgs = await fetchMessages(process.env.DB_CHANNEL_ID);
    const premiumMsgs = await fetchMessages(process.env.DB_PREMIUM_CHANNEL_ID);

    const premiumMap = new Map();
    for (const m of premiumMsgs) {
      const p = parseJson(m.content);
      if (p && p.isActive && p.expiresAt > Date.now()) {
        premiumMap.set(p.serverId, p.expiresAt);
      }
    }

    const servers = [];
    for (const m of msgs) {
      const s = parseJson(m.content);
      if (!s) continue;
      if (s.ownerId === data.discord_id) {
        servers.push({
          ...s,
          isPremium: premiumMap.has(s.serverId),
          expiresAt: premiumMap.get(s.serverId) || null
        });
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ items: servers })
    };

  } catch {
    return { statusCode: 500 };
  }
};