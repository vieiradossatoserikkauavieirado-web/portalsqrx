async function fetchAllMessages(channelId, max = 2000) {
  const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
  let all = [];
  let before = null;

  while (all.length < max) {
    const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    if (!r.ok) {
  console.log("fetchAllMessages fail", channelId, r.status);
  break;
}
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

function toMillis(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

exports.handler = async (event) => {
  try {
    const limit = parseInt(new URL(event.rawUrl).searchParams.get("limit")) || 5;

    const dbMessages = await fetchAllMessages(process.env.DB_CHANNEL_ID, 3000);
    const premiumMessages = await fetchAllMessages(process.env.DB_PREMIUM_CHANNEL_ID, 3000);

    const servers = [];
    const premiumMap = new Map(); // serverId -> expiresMs

    // premium ativos (suporta payload antigo/novo)
    for (const msg of premiumMessages) {
      const data = parseJsonFromMessage(msg.content);
      if (!data) continue;

      const sid = data.serverId || data.server_id;
      if (!sid) continue;

      const expMs =
        toMillis(data.expiresAt) ??
        toMillis(data.expires_at);

      if (!expMs || expMs <= Date.now()) continue;

      // aceita: status active OU isActive true (mantém compatibilidade)
      const active =
        data.status ? data.status === "active" : !!data.isActive;

      if (!active) continue;

      const prev = premiumMap.get(sid);
      if (!prev || expMs > prev) premiumMap.set(sid, expMs);
    }

    // servidores aprovados
    for (const msg of dbMessages) {
      const data = parseJsonFromMessage(msg.content);
      if (!data || data.status !== "approved") continue;

      const sid = data.serverId || data.server_id;
      if (!sid) continue;

      servers.push({
        serverId: sid,
        name: data.name,
        ip: data.ip,
        logoUrl: data.logoUrl,
        discord: data.discord,
        votes: data.votes || 0,
        isPremium: premiumMap.has(sid),
        premiumExpiresAt: premiumMap.get(sid) || null
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
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ items: result })
    };
  } catch (err) {
  console.error("server_list error:", err);
  return {
    statusCode: 500,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify({
      error: "internal_error",
      message: err?.message || String(err),
      stack: err?.stack || null
    })
  };
}
  
};



