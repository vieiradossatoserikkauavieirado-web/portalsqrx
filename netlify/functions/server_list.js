const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const limit = parseInt(new URL(event.rawUrl).searchParams.get("limit")) || 5;

    // 1) Premium ativo vem do SUPABASE (fonte de verdade)
    const { data: premiums, error: pErr } = await supabase
      .from("pagamentos_servers")
      .select("server_id, expires_at")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());

    if (pErr) console.log("premium supabase error:", pErr);

    const premiumMap = new Map(); // serverId -> expiresMs
    for (const row of premiums || []) {
      const sid = row.server_id;
      const expMs = Date.parse(row.expires_at);
      if (!sid || !Number.isFinite(expMs)) continue;
      const prev = premiumMap.get(sid);
      if (!prev || expMs > prev) premiumMap.set(sid, expMs);
    }

    // 2) Servidores aprovados continuam vindo do DISCORD DB
    const dbMessages = await fetchAllMessages(process.env.DB_CHANNEL_ID, 3000);

    const servers = [];
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

    // premium primeiro, depois votos
    servers.sort((a, b) => {
      if (a.isPremium !== b.isPremium) return (b.isPremium ? 1 : 0) - (a.isPremium ? 1 : 0);
      return (b.votes || 0) - (a.votes || 0);
    });

    const result = servers.slice(0, limit).map((s, i) => ({ ...s, position: i + 1 }));

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
    return { statusCode: 500, body: "internal_error" };
  }
};