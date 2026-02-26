// netlify/functions/server_list.js
const { createClient } = require("@supabase/supabase-js");

// (Opcional) mantém supabase inicializado caso você use em outras rotas,
// mas aqui NÃO é usado como fonte de premium.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllMessages(channelId, max = 2000) {
  if (!channelId) throw new Error("missing_channel_id");

  const headers = { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` };
  let all = [];
  let before = null;

  while (all.length < max) {
    const url = new URL(`https://discord.com/api/v10/channels/${channelId}/messages`);
    url.searchParams.set("limit", "100");
    if (before) url.searchParams.set("before", before);

    const r = await fetch(url.toString(), { headers });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      console.error("discord fetch error:", r.status, txt);
      break;
    }

    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    all.push(...batch);
    before = batch[batch.length - 1].id;
  }

  return all;
}

function parseJsonFromMessage(content) {
  try {
    if (typeof content !== "string") return null;

    // tenta pegar bloco ```json ... ```
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i);
    let jsonText = match ? match[1].trim() : content.trim();

    // fallback: pega primeiro {...}
    const fallback = jsonText.match(/\{[\s\S]*\}/);
    if (fallback) jsonText = fallback[0];

    const obj = JSON.parse(jsonText);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

function toMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

exports.handler = async (event) => {
  try {
    const url = new URL(event.rawUrl);
    const limit = Math.max(1, Math.min(200, parseInt(url.searchParams.get("limit") || "5", 10)));

    const DB_CHANNEL_ID = process.env.DB_CHANNEL_ID;
    const DB_PREMIUM_CHANNEL_ID = process.env.DB_PREMIUM_CHANNEL_ID;

    // 1) PREMIUM vem do DISCORD DB premium (DB_PREMIUM_CHANNEL_ID)
    const premiumMessages = await fetchAllMessages(DB_PREMIUM_CHANNEL_ID, 3000);

    const nowMs = Date.now();
    const premiumMap = new Map(); // server_id -> expiresMs (mantém maior)

    for (const msg of premiumMessages) {
      const p = parseJsonFromMessage(msg.content);
      if (!p) continue;

      // formato premium que você mostrou
      if (p.type !== "premium_server") continue;
      if (p.status !== "active") continue;

      const sid = p.server_id || p.serverId;
      if (!sid) continue;

      const expMs = toMs(p.expires_at);
      if (!expMs || expMs <= nowMs) continue;

      const prev = premiumMap.get(sid);
      if (!prev || expMs > prev) premiumMap.set(sid, expMs);
    }

    // 2) SERVIDORES aprovados vêm do DISCORD DB normal (DB_CHANNEL_ID)
    const dbMessages = await fetchAllMessages(DB_CHANNEL_ID, 3000);

    // dedupe: mantém o registro mais novo por serverId (updatedAt / createdAt)
    const byServerId = new Map();

    for (const msg of dbMessages) {
      const data = parseJsonFromMessage(msg.content);
      if (!data || data.status !== "approved") continue;

      const sid = data.serverId || data.server_id;
      if (!sid) continue;

      const updatedAt = Number.isFinite(Number(data.updatedAt)) ? Number(data.updatedAt) : 0;
      const createdAt = Number.isFinite(Number(data.createdAt)) ? Number(data.createdAt) : 0;
      const stamp = Math.max(updatedAt, createdAt);

      const prev = byServerId.get(sid);
      if (!prev || stamp > prev._stamp) {
        byServerId.set(sid, {
          serverId: sid,
          name: data.name || "",
          ip: data.ip || "",
          logoUrl: data.logoUrl || "",
          discord: data.discord || "",
          votes: Number.isFinite(Number(data.votes)) ? Number(data.votes) : 0,
          _stamp: stamp
        });
      }
    }

    const servers = [];
    for (const s of byServerId.values()) {
      const expMs = premiumMap.get(s.serverId) || null;

      servers.push({
        serverId: s.serverId,
        name: s.name,
        ip: s.ip,
        logoUrl: s.logoUrl,
        discord: s.discord,
        votes: s.votes,
        isPremium: expMs != null,
        premiumExpiresAt: expMs ? new Date(expMs).toISOString() : null
      });
    }

    // premium primeiro, depois votos
    servers.sort((a, b) => {
      if (a.isPremium !== b.isPremium) return b.isPremium ? 1 : -1; // true vem antes
      return (b.votes || 0) - (a.votes || 0);
    });

    const result = servers.slice(0, limit).map((s, i) => ({ ...s, position: i + 1 }));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({ items: result })
    };
  } catch (err) {
    console.error("server_list error:", err);
    return { statusCode: 500, body: "internal_error" };
  }
};