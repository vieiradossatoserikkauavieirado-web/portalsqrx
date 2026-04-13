const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PLANOS = {
  barato: { nome: "Plano Barato", valor: 8.59 },
  bom: { nome: "Plano Bom", valor: 16.0 },
  otimo: { nome: "Plano Ótimo", valor: 33.0 },
};

function getCookie(name, headers) {
  const cookieHeader =
    headers?.cookie || headers?.Cookie || headers?.COOKIE || "";
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function getSession(event) {
  const token = getCookie("sx_hosting_session", event.headers);
  if (!token) return null;

  const { data: sess, error } = await supabase
    .from("sessoes_hosting")
    .select("discord_id, username, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !sess) return null;
  if (new Date(sess.expira_em).getTime() < Date.now()) return null;

  return sess;
}

async function criarClienteAsaas({ name, externalReference }) {
  const r = await fetch(`${process.env.ASAAS_BASE_URL}/customers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY,
    },
    body: JSON.stringify({
      name,
      externalReference,
      notificationDisabled: false,
    }),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(`asaas_customer_error:${JSON.stringify(data)}`);
  }

  return data;
}

async function criarPagamentoPix({ customer, value, description, externalReference }) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 1);

  const r = await fetch(`${process.env.ASAAS_BASE_URL}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      access_token: process.env.ASAAS_API_KEY,
    },
    body: JSON.stringify({
      customer,
      billingType: "PIX",
      value,
      dueDate: dueDate.toISOString().slice(0, 10),
      description,
      externalReference,
    }),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(`asaas_payment_error:${JSON.stringify(data)}`);
  }

  return data;
}

async function getPixQrCode(paymentId) {
  const r = await fetch(
    `${process.env.ASAAS_BASE_URL}/payments/${paymentId}/pixQrCode`,
    {
      headers: {
        access_token: process.env.ASAAS_API_KEY,
      },
    }
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(`asaas_pix_qrcode_error:${JSON.stringify(data)}`);
  }

  return data;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "method_not_allowed" }),
      };
    }

    const session = await getSession(event);
    if (!session) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "not_authenticated" }),
      };
    }

    const body = JSON.parse(event.body || "{}");
    const planoKey = String(body.plano || "").toLowerCase();

    if (!PLANOS[planoKey]) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "invalid_plan" }),
      };
    }

    const plano = PLANOS[planoKey];
    const externalReference = `hosting:${session.discord_id}:${Date.now()}`;

    const customer = await criarClienteAsaas({
      name: session.username,
      externalReference: session.discord_id,
    });

    const payment = await criarPagamentoPix({
      customer: customer.id,
      value: plano.valor,
      description: `Hosting SX - ${plano.nome}`,
      externalReference,
    });

    const pix = await getPixQrCode(payment.id);

    const { error } = await supabase.from("compras_hosting").insert({
      discord_id: session.discord_id,
      username: session.username,
      plano: plano.nome,
      valor: plano.valor,
      status: "pendente",
      payment_id: payment.id,
      asaas_customer_id: customer.id,
    });

    if (error) {
      console.error(error);
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "db_insert_failed" }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        ok: true,
        plano: plano.nome,
        valor: plano.valor,
        payment_id: payment.id,
        pix_code: pix.payload,
        pix_qr_base64: pix.encodedImage,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "internal_error",
        message: err.message,
      }),
    };
  }
};