const fetch = require("node-fetch");

async function fetchAllMessages(channelId, max = 2000) {
  const headers = {
    Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`
  };

  let all = [];
  let before = null;

  while (all.length < max) {
    const url = new URL(
      `https://discord.com/api/v10/channels/${channelId}/messages`
    );
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

function parseJson(content) {
  try {
    // Extrai bloco ```json ... ```
    const match = content.match(/```json\s*([\s\S]*?)\s*```/i);
    let jsonText = match ? match[1].trim() : content.trim();

    // fallback: pega do primeiro { até último }
    const fallback = jsonText.match(/\{[\s\S]*\}/);
    if (fallback) jsonText = fallback[0];

    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  try {
    const token = event.headers.cookie?.match(/sx_portal_session=([^;]+)/)?.[1];
    if (!token) {
      return { statusCode: 401 };
    }

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

    if (!data) {
      return { statusCode: 401 };
    }

    // Buscar TODOS servidores
    const msgs = await fetchAllMessages(
      process.env.DB_CHANNEL_ID,
      2000
    );

    // Buscar TODOS premium
    const premiumMsgs = await fetchAllMessages(
      process.env.DB_PREMIUM_CHANNEL_ID,
      2000
    );

    // Map premium ativos
    const premiumMap = new Map();

    for (const m of premiumMsgs) {
      const p = parseJson(m.content);
      if (!p) continue;

      const exp =
        typeof p.expiresAt === "number"
          ? p.expiresAt
          : Date.parse(p.expiresAt);

      if (p.isActive && exp && exp > Date.now()) {
        premiumMap.set(p.serverId, exp);
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

  } catch (err) {
    console.error("server_my_list error:", err);
    return { statusCode: 500 };
  }
};