async function fetchMessages(channelId) {
  const r = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=100`,
    {
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
      }
    }
  );

  if (!r.ok) return [];

  return r.json();
}

function parseJsonFromMessage(content) {
  try {
    const cleaned = content.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  try {
    const limit = parseInt(new URL(event.rawUrl).searchParams.get("limit")) || 5;

    const dbMessages = await fetchMessages(process.env.DB_CHANNEL_ID);
    const premiumMessages = await fetchMessages(process.env.DB_PREMIUM_CHANNEL_ID);

    const servers = [];
    const premiumMap = new Map();

    // parse premium
    for (const msg of premiumMessages) {
      const data = parseJsonFromMessage(msg.content);
      if (!data || !data.serverId) continue;

      if (data.isActive && data.expiresAt > Date.now()) {
        premiumMap.set(data.serverId, true);
      }
    }

    // parse servers
    for (const msg of dbMessages) {
      const data = parseJsonFromMessage(msg.content);
      if (!data || data.status !== "approved") continue;

      servers.push({
        serverId: data.serverId,
        name: data.name,
        ip: data.ip,
        logoUrl: data.logoUrl,
        discord: data.discord,
        votes: data.votes || 0,
        isPremium: premiumMap.has(data.serverId)
      });
    }

    // ordenar
    servers.sort((a, b) => {
      if (a.isPremium !== b.isPremium)
        return b.isPremium - a.isPremium;
      return b.votes - a.votes;
    });

    const result = servers.slice(0, limit).map((s, i) => ({
      ...s,
      position: i + 1
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: result })
    };

  } catch {
    return { statusCode: 500, body: "internal_error" };
  }
};