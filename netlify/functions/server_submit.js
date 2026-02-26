// netlify/functions/server_submit.js

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function parseIpAndPort(ipRaw) {
  const ip = (ipRaw || "").trim();

  // aceita "1.2.3.4:7777" ou "1.2.3.4"
  if (ip.includes(":")) {
    const [host, portStr] = ip.split(":");
    const port = Number(portStr);
    return { host: (host || "").trim(), port: Number.isFinite(port) ? port : 7777 };
  }

  return { host: ip, port: 7777 };
}

async function discordPostMessage({ token, channelId, content, filename, fileText }) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

  // Se tiver arquivo, manda multipart/form-data (evita limite 2000 chars)
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
      headers: { Authorization: `Bot ${token}` },
      body: form,
    });

    const txt = await r.text();
    if (!r.ok) throw new Error(`Discord POST failed (${r.status}): ${txt}`);
    return JSON.parse(txt);
  }

  // Sem arquivo, JSON normal
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });

  const txt = await r.text();
  if (!r.ok) throw new Error(`Discord POST failed (${r.status}): ${txt}`);
  return JSON.parse(txt);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: corsHeaders, body: "" };
    }

    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Method not allowed" }),
      };
    }

    const body = JSON.parse(event.body || "{}");

    // ✅ Campos vindos do seu servidores.html
    const name = (body.name || "").trim();
    const ipRaw = (body.ip || "").trim();
    const discord = (body.discord || "").trim(); // pode ser ID, @, tag, etc
    const logoUrl = (body.logoUrl || "").trim();

    if (!name || !ipRaw || !discord) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Missing required fields",
          required: ["name", "ip", "discord"],
        }),
      };
    }

    const { host, port } = parseIpAndPort(ipRaw);

    // IDs / token
    const TOKEN = process.env.DISCORD_BOT_TOKEN;
    const DB_CHANNEL_ID = process.env.DB_CHANNEL_ID;
    const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_LOGS_ID || process.env.LOG_CHANNEL_ID;

    if (!TOKEN || !DB_CHANNEL_ID) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Missing env vars",
          missing: [
            !TOKEN ? "DISCORD_BOT_TOKEN" : null,
            !DB_CHANNEL_ID ? "DB_CHANNEL_ID" : null,
          ].filter(Boolean),
        }),
      };
    }

    // serverId simples e estável (sem libs)
    const serverId = `srv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

    // JSON “banco” (igual sua arquitetura)
    const serverData = {
      serverId,
      ownerId: discord,     // ⚠️ aqui vai o que você mandou no form
      name,
      ip: host,
      port,
      logo: logoUrl || null,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const dbContent =
`📥 Novo servidor cadastrado (PENDING)
ID: ${serverId}
Nome: ${name}
Owner: ${discord}
IP: ${host}:${port}`;

    const jsonText = JSON.stringify(serverData, null, 2);

    // Envia pro canal DB
    const dbMsg = await discordPostMessage({
      token: TOKEN,
      channelId: DB_CHANNEL_ID,
      content: dbContent,
      filename: `server-${serverId}.json`,
      fileText: jsonText,
    });

    // Log (se canal configurado)
    if (LOG_CHANNEL_ID) {
      const logContent =
`🧾 LOG: server_submit
✅ Servidor enviado para análise
ID: ${serverId}
Nome: ${name}
Owner: ${discord}
DB msgId: ${dbMsg?.id || "n/a"}
Hora: ${new Date().toISOString()}`;

      try {
        await discordPostMessage({
          token: TOKEN,
          channelId: LOG_CHANNEL_ID,
          content: logContent,
        });
      } catch (e) {
        console.log("LOG CHANNEL FAILED:", e?.message || String(e));
      }
    }

    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        message: "Servidor enviado para análise!",
        serverId,
        discord_message_id: dbMsg?.id,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: "server_submit failed",
        details: e?.message || String(e),
      }),
    };
  }
};