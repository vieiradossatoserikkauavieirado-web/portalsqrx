const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function discordSend(content) {
  await fetch(
    `https://discord.com/api/v10/channels/${process.env.LOG_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    }
  );
}

exports.handler = async (event) => {
  try {
    const p = JSON.parse(event.body || "{}");

    const orderNsu = p.order_nsu;
    const paidAmount = p.paid_amount ?? null;

    if (!orderNsu || !paidAmount)
      return { statusCode: 200 };

    const { data: pg } = await supabase
      .from("pagamentos_servers")
      .select("*")
      .eq("order_nsu", orderNsu)
      .single();

    if (!pg) return { statusCode: 404 };

    if (pg.status === "pago")
      return { statusCode: 200 };

    await supabase
      .from("pagamentos_servers")
      .update({
        status: "pago",
        paid_amount: paidAmount,
        paid_at: new Date().toISOString(),
      })
      .eq("order_nsu", orderNsu);

    // 🔥 ATIVAR PREMIUM
    const days = pg.plano === "monthly" ? 30 : 7;

    const premiumData = {
      serverId: pg.server_id,
      ownerId: pg.discord_id,
      plan: pg.plano,
      isActive: true,
      expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
      createdAt: Date.now()
    };

    await fetch(
      `https://discord.com/api/v10/channels/${process.env.DB_PREMIUM_CHANNEL_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "```json\n" + JSON.stringify(premiumData, null, 2) + "\n```"
        }),
      }
    );

    await discordSend(
      `🔥 Destaque ativado!\n👤 <@${pg.discord_id}>\n🖥️ Servidor: ${pg.server_id}\n💰 R$ ${(paidAmount / 100).toFixed(2)}`
    );

    return { statusCode: 200 };

  } catch {
    return { statusCode: 500 };
  }
};