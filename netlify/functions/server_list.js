async function fetchAllMessages(channelId, max = 2000) {
  const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
  let all = [];
  let before = null;

  while (all.length < max) {
    const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const r = await fetch(url.toString(), { headers });
    if (!r.ok) break;

    const batch = await r.json();
    if (!batch.length) break;

    all.push(...batch);
    before = batch[batch.length - 1].id;
  }

  return all;
}

function parseJsonFromMessage(content) {
  try {
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i);
    let jsonText = match ? match[1].trim() : content.trim();

    const fallback = jsonText.match(/\{[\s\S]*\}/);
    if (fallback) jsonText = fallback[0];

    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  try {
    const limit =
      parseInt(new URL(event.rawUrl).searchParams.get("limit")) || 5;

    const dbMessages = await fetchAllMessages(process.env.DB_CHANNEL_ID, 3000);
    const premiumMessages = await fetchAllMessages(process.env.DB_PREMIUM_CHANNEL_ID, 3000);

    const servers = [];
    const premiumMap = new Map();

    // premium ativos
    for (const msg of premiumMessages) {
      const data = parseJsonFromMessage(msg.content);
      if (!data || !data.serverId) continue;

      const exp =
        typeof data.expiresAt === "number"
          ? data.expiresAt
          : Date.parse(data.expiresAt);

      if (data.isActive && exp && exp > Date.now()) {
        premiumMap.set(data.serverId, exp);
      }
    }

    // servidores aprovados
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

    // ordenar: premium primeiro, depois votos
    servers.sort((a, b) => {
      if (a.isPremium !== b.isPremium) return (b.isPremium ? 1 : 0) - (a.isPremium ? 1 : 0);
      return (b.votes || 0) - (a.votes || 0);
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
  } catch (err) {
    console.error("server_list error:", err);
    return { statusCode: 500, body: "internal_error" };
  }
};