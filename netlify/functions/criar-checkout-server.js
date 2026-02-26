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
    if (event.httpMethod !== "POST")
      return { statusCode: 405 };

    const token = getCookie(event, "sx_portal_session");
    if (!token) return { statusCode: 401 };

    const { data: sess } = await supabase
      .from("sessoes_portal")
      .select("discord_id")
      .eq("token", token)
      .single();

    if (!sess) return { statusCode: 401 };

    const { plano, serverId } = JSON.parse(event.body || "{}");

    const planos = {
      weekly: { amount: 1500, desc: "Destaque 7 dias" },
      monthly: { amount: 3990, desc: "Destaque 30 dias" },
    };

    if (!planos[plano]) return { statusCode: 400 };

    const order_nsu = crypto.randomUUID();

    await supabase.from("pagamentos_servers").insert({
      order_nsu,
      discord_id: sess.discord_id,
      server_id: serverId,
      plano,
      amount: planos[plano].amount,
      status: "pendente",
    });

    const r = await fetch("https://api.infinitepay.io/invoices/public/checkout/links", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.INFINITEPAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        handle: process.env.INFINITEPAY_HANDLE,
        redirect_url: process.env.SUCCESS_URL_SERVERS,
        webhook_url: process.env.WEBHOOK_URL_SERVERS,
        order_nsu,
        items: [
          {
            quantity: 1,
            price: planos[plano].amount,
            description: planos[plano].desc,
          },
        ],
      }),
    });

    if (!r.ok) return { statusCode: 502 };

    const data = await r.json();
    const checkoutUrl = data?.url || data?.checkout_url || data?.link;

    return {
      statusCode: 200,
      body: JSON.stringify({ checkout_url: checkoutUrl }),
    };

  } catch {
    return { statusCode: 500 };
  }
};