// netlify/functions/notify-renewal.js
const { createClient } = require("@supabase/supabase-js");

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return json(500, {
        ok: false,
        error: "SUPABASE_ENV_MISSING"
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = JSON.parse(event.body || "{}");

    const hostLogin = body.host || null;
    const discordId = body.discord_id || null;
    const plan = body.plan || null;
    const tx = body.tx || null;
    const amount = body.amount || null;

    // =============================
    // Buscar host
    // =============================

    let { data: host, error: hostErr } = await supabase
      .from("hostings_estoque")
      .select("*")
      .eq("login_host", hostLogin)
      .maybeSingle();

    if (hostErr) {
      return json(500, { ok: false, error: hostErr.message });
    }

    if (!host && discordId) {
      const { data } = await supabase
        .from("hostings_estoque")
        .select("*")
        .eq("cliente_discord_id", String(discordId))
        .limit(1);

      host = Array.isArray(data) && data.length ? data[0] : null;
    }

    if (!host) {
      return json(404, {
        ok: false,
        error: "HOST_NOT_FOUND"
      });
    }

    // =============================
    // Calcular novo vencimento
    // =============================

    const agora = new Date();
    let base = host.data_vencimento ? new Date(host.data_vencimento) : agora;
    if (base < agora) base = agora;

    const novoVenc = new Date(base);
    novoVenc.setDate(novoVenc.getDate() + 30);

    // =============================
    // Registrar renovação (sem updated_at)
    // =============================

    await supabase.from("renovacoes").insert({
      discord_id: String(host.cliente_discord_id || discordId || ""),
      host_id: host.id,
      login_host: host.login_host,
      plano: plan || host.plano,
      valor: amount || null,
      tx_ref: tx || null,
      status: "concluida",
      created_at: new Date().toISOString()
    });

    // =============================
    // Atualizar host (SEM updated_at)
    // =============================

    const { data: updatedHost, error: updateErr } = await supabase
      .from("hostings_estoque")
      .update({
        data_vencimento: novoVenc.toISOString(),
        status: "em_uso"
      })
      .eq("id", host.id)
      .select()
      .single();

    if (updateErr) {
      return json(500, { ok: false, error: updateErr.message });
    }

    return json(200, {
      ok: true,
      message: "Renovação registrada com sucesso",
      host: updatedHost,
      novo_vencimento: novoVenc.toISOString()
    });

  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};