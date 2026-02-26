// netlify/functions/server_submit.js

export default async (req) => {
  // CORS básico (ajuste se quiser restringir origem)
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Netlify envia body como string
    const body = JSON.parse(req.body || "{}");

    const serverId = body.serverId || body.server_id;
    const name = body.name;
    const discordId = body.discordId || body.discord_id;
    const ip = body.ip;
    const port = body.port;
    const logo = body.logo || null;

    // serverData é o JSON "oficial" que você quer persistir no Discord DB
    // Se não vier pronto, montamos a partir dos campos básicos
    const serverData = body.serverData || body.server_data || {
      serverId,
      ownerId: discordId,
      name,
      ip,
      port,
      logo,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    if (!serverId || !name || !discordId || !ip || !port) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing required fields",
          required: ["serverId", "name", "discordId", "ip", "port"],
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const DB_CHANNEL_ID = process.env.DB_CHANNEL_ID;
    const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_LOGS_ID || process.env.LOG_CHANNEL_ID; // compat
    const TOKEN = process.env.DISCORD_BOT_TOKEN;

    if (!DB_CHANNEL_ID || !TOKEN) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Missing env vars",
          missing: [
            !DB_CHANNEL_ID ? "DB_CHANNEL_ID" : null,
            !TOKEN ? "DISCORD_BOT_TOKEN" : null,
          ].filter(Boolean),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const discordPostMessage = async ({ channelId, content, filename, fileText }) => {
      const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

      // Se tiver file, manda multipart (payload_json + files[0])
      if (filename && typeof fileText === "string") {
        const form = new FormData();
        form.append("payload_json", JSON.stringify({ content }));

        form.append(
          "files[0]",
          new Blob([fileText], { type: "application/json" }),
          filename
        );

        const r = await fetch(url, {
          method: "POST",
          headers: { Authorization: `Bot ${TOKEN}` },
          body: form,
        });

        const txt = await r.text();
        if (!r.ok) {
          throw new Error(`Discord POST failed (${r.status}): ${txt}`);
        }
        return JSON.parse(txt);
      }

      // Sem file, manda JSON normal
      const r = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bot ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content }),
      });

      const txt = await r.text();
      if (!r.ok) {
        throw new Error(`Discord POST failed (${r.status}): ${txt}`);
      }
      return JSON.parse(txt);
    };

    // 1) Envia pro canal DB (com arquivo JSON)
    const dbContent =
`📥 Novo servidor cadastrado (PENDING)
ID: ${serverId}
Nome: ${name}
Owner: <@${discordId}>
IP: ${ip}:${port}`;

    const jsonText = JSON.stringify(serverData, null, 2);

    const dbMsg = await discordPostMessage({
      channelId: DB_CHANNEL_ID,
      content: dbContent,
      filename: `server-${serverId}.json`,
      fileText: jsonText,
    });

    // 2) Envia log (se tiver canal de logs configurado)
    if (LOG_CHANNEL_ID) {
      const logContent =
`🧾 LOG: server_submit
Servidor enviado para análise ✅
ID: ${serverId}
Nome: ${name}
Owner: <@${discordId}>
DB msgId: ${dbMsg?.id || "n/a"}
Hora: ${new Date().toISOString()}`;

      // log sem arquivo (curto)
      try {
        await discordPostMessage({
          channelId: LOG_CHANNEL_ID,
          content: logContent,
        });
      } catch (e) {
        // não falha a request por erro de log
        console.error("Failed to write log channel:", e?.message || e);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Servidor enviado para análise!",
        discord_message_id: dbMsg?.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("server_submit error:", e?.message || e);

    return new Response(
      JSON.stringify({
        ok: false,
        error: "server_submit failed",
        details: e?.message || String(e),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};