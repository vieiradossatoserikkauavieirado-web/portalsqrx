const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(event, name) {
  const raw = event.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method_not_allowed" };
    }

    const sessionToken = getCookie(event, "sx_painel_session");
    if (!sessionToken) return { statusCode: 401, body: "no_session" };

    // sessão do seu login Discord (você já grava em sessoes_painel)
    const { data: sess, error: eSess } = await supabase
      .from("sessoes_painel")
      .select("username, expira_em")
      .eq("token", sessionToken)
      .single();

    if (eSess || !sess) return { statusCode: 401, body: "invalid_session" };

    // username = "discord:ID"
    const discordId = String(sess.username || "").startsWith("discord:")
      ? String(sess.username).split(":")[1]
      : null;

    if (!discordId) return { statusCode: 401, body: "no_discord_id" };

    const { plano } = JSON.parse(event.body || "{}");

    const planos = {
      vip_30d: { amount: 2500, desc: "VIP Comum 30 dias" },
      gold_perm: { amount: 5000, desc: "VIP Gold Permanente" },
    };

    if (!planos[plano]) return { statusCode: 400, body: "bad_plano" };

    const order_nsu = crypto.randomUUID();
    const amount = planos[plano].amount;

    // salva pendente no Supabase
    const { error: eIns } = await supabase.from("pagamentos_vip").insert({
      order_nsu,
      discord_id: discordId,
      plano,
      amount,
      status: "pendente",
    });

    if (eIns) return { statusCode: 500, body: "db_insert_fail" };

    // cria link de checkout na InfinitePay
    const r = await fetch("https://api.infinitepay.io/invoices/public/checkout/links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INFINITEPAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: process.env.INFINITEPAY_HANDLE,
        redirect_url: process.env.SUCCESS_URL,
        webhook_url: process.env.WEBHOOK_URL,
        order_nsu,
        items: [
          {
            quantity: 1,
            price: amount,
            description: planos[plano].desc,
          },
        ],
      }),
    });

    if (!r.ok) {
      const text = await r.text();
      return { statusCode: 502, body: `infinitepay_fail:${r.status}:${text}` };
    }

    const data = await r.json();

    // retorno: normalmente vem um link/URL do checkout
    const checkoutUrl = data?.url || data?.checkout_url || data?.link || null;
    if (!checkoutUrl) return { statusCode: 502, body: "missing_checkout_url" };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkout_url: checkoutUrl }),
    };
  } catch (err) {
    return { statusCode: 500, body: "criar_checkout_fail" };
  }
};
