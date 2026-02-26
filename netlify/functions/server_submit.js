// netlify/functions/server_submit.js

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function discordSend({ token, channelId, content }) {
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;

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

function makeServerId() {
  // no mesmo estilo do seu exemplo: srv_<timestamp>_<rand>
  const ts = Date.now();
  const rnd = Math.floor(1000 + Math.random() * 9000);
  return `srv_${ts}_${rnd}`;
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

    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, error: "Body inválido (JSON)" }),
      };
    }

    // ✅ campos do seu frontend
    const name = (body.name || "").trim();
    const discord = (body.discord || "").trim(); // ex: @SiqueiraX ✓ (igual seu exemplo)
    const ip = (body.ip || "").trim();           // opcional
    const logoUrl = (body.logoUrl || "").trim(); // opcional

    // ✅ mínimo obrigatório (pra não virar 400 “do nada”)
    if (!name || !discord) {
      return {
        statusCode: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "Campos obrigatórios faltando",
          required: ["name", "discord"],
          received: { name: !!name, discord: !!discord, ip: !!ip, logoUrl: !!logoUrl },
        }),
      };
    }

    const TOKEN = process.env.DISCORD_BOT_TOKEN;
    const DB_CHANNEL_ID = process.env.DB_CHANNEL_ID;
    const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_LOGS_ID || process.env.LOG_CHANNEL_ID;

    if (!TOKEN || !DB_CHANNEL_ID) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "ENV faltando no Netlify",
          missing: [
            !TOKEN ? "DISCORD_BOT_TOKEN" : null,
            !DB_CHANNEL_ID ? "DB_CHANNEL_ID" : null,
          ].filter(Boolean),
        }),
      };
    }

    const serverId = makeServerId();

    // ✅ mensagem exatamente no formato que você mostrou
    const dbContent =
`📥 Novo servidor cadastrado
ID: ${serverId}
Nome: ${name}
Owner: ${discord}`;

    // Envia pro "banco" (canal DB)
    const dbMsg = await discordSend({
      token: TOKEN,
      channelId: DB_CHANNEL_ID,
      content: dbContent,
    });

    // Log (se existir canal)
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
        await discordSend({ token: TOKEN, channelId: LOG_CHANNEL_ID, content: logContent });
      } catch (e) {
        // não derruba o fluxo por falha no log
        console.log("LOG CHANNEL FAILED:", e?.message || String(e));
      }
    }

    // (Opcional) você pode salvar ip/logoUrl depois quando for padronizar JSON
    return {
      statusCode: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, serverId, discord_message_id: dbMsg?.id }),
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