const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function sendDiscordMessage(content) {
  const channelId = process.env.DISCORD_ALERT_CHANNEL_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!channelId || !botToken) return;

  await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bot ${botToken}`,
    },
    body: JSON.stringify({ content }),
  });
}

async function entregarHosting(compra) {
  const { data: host, error: findError } = await supabase
    .from("hostings_estoque")
    .select("*")
    .eq("status", "disponivel")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (findError) {
    throw new Error(`stock_lookup_failed:${findError.message}`);
  }

  if (!host) {
    return { ok: false, reason: "sem_estoque" };
  }

  const { error: updateHostError } = await supabase
    .from("hostings_estoque")
    .update({
      status: "em_uso",
      cliente_discord_id: compra.discord_id,
      cliente_username: compra.username,
      plano: compra.plano,
      payment_id: compra.payment_id,
      entregue_em: new Date().toISOString(),
    })
    .eq("id", host.id)
    .eq("status", "disponivel");

  if (updateHostError) {
    throw new Error(`stock_update_failed:${updateHostError.message}`);
  }

  const { error: updateCompraError } = await supabase
    .from("compras_hosting")
    .update({
      status: "entregue",
      hosting_id: host.id,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", compra.id);

  if (updateCompraError) {
    throw new Error(`order_update_failed:${updateCompraError.message}`);
  }

  return {
    ok: true,
    host,
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method_not_allowed" };
    }

    const payload = JSON.parse(event.body || "{}");
    const payment = payload.payment;

    if (!payment || !payment.id) {
      return { statusCode: 200, body: "ignored" };
    }

    const status = payment.status;
    if (status !== "RECEIVED" && status !== "CONFIRMED") {
      return { statusCode: 200, body: "ignored_status" };
    }

    const { data: compra, error } = await supabase
      .from("compras_hosting")
      .select("*")
      .eq("payment_id", payment.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return { statusCode: 500, body: "db_error" };
    }

    if (!compra) {
      return { statusCode: 200, body: "purchase_not_found" };
    }

    if (compra.status === "entregue") {
      return { statusCode: 200, body: "already_delivered" };
    }

    if (compra.status !== "pago") {
      await supabase
        .from("compras_hosting")
        .update({
          status: "pago",
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", compra.id);
    }

    const resultado = await entregarHosting(compra);

    if (!resultado.ok && resultado.reason === "sem_estoque") {
      await supabase
        .from("compras_hosting")
        .update({
          status: "aguardando_estoque",
          aprovado_em: new Date().toISOString(),
        })
        .eq("id", compra.id);

      const cargoId = process.env.DISCORD_ALERT_ROLE_ID;
      const msg =
        `<@&${cargoId}> por favor crie mais hosting, tem cliente aguardando.\n` +
        `Cliente: <@${compra.discord_id}>`;

      await sendDiscordMessage(msg);

      return {
        statusCode: 200,
        body: "no_stock_notified",
      };
    }

    const entregue = resultado.host;

    const dmText =
      `Sua hosting foi entregue com sucesso.\n\n` +
      `Plano: ${compra.plano}\n` +
      `Login: ${entregue.login_host}\n` +
      `Senha: ${entregue.senha_host}`;

    await sendDiscordMessage(
      `Hosting entregue para <@${compra.discord_id}>.\n` +
      `Plano: ${compra.plano}\n` +
      `Login: \`${entregue.login_host}\`\n` +
      `Senha: \`${entregue.senha_host}\`\n\n` +
      `Envie isso ao cliente por DM se quiser.`
    );

    return {
      statusCode: 200,
      body: dmText,
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: `internal_error:${err.message}`,
    };
  }
};