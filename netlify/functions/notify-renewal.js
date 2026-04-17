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
        error: "SUPABASE_ENV_MISSING",
        message: "Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Netlify."
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const body = JSON.parse(event.body || "{}");
    const hostLogin = body.host || body.login_host || null;
    const discordId = body.discord_id || body.discordId || null;
    const plan = body.plan || body.plano || null;
    const tx = body.tx || null;
    const amount = body.amount || null;

    let host = null;

    if (hostLogin) {
      const { data, error } = await supabase
        .from("hostings_estoque")
        .select("*")
        .eq("login_host", hostLogin)
        .limit(1)
        .maybeSingle();

      if (error) return json(500, { ok: false, error: error.message });
      host = data || null;
    }

    if (!host && discordId) {
      const query = supabase
        .from("hostings_estoque")
        .select("*")
        .eq("cliente_discord_id", String(discordId))
        .order("id", { ascending: false })
        .limit(1);

      const { data, error } = await query.maybeSingle();
      if (error) return json(500, { ok: false, error: error.message });
      host = data || null;
    }

    if (!host) {
      return json(404, { ok: false, error: "HOST_NOT_FOUND" });
    }

    const agora = new Date();
    let base = host.data_vencimento ? new Date(host.data_vencimento) : agora;
    if (base < agora) base = agora;

    const novoVenc = new Date(base);
    novoVenc.setDate(novoVenc.getDate() + 30);

    const renovPayload = {
      discord_id: String(host.cliente_discord_id || discordId || ""),
      host_id: host.id,
      login_host: host.login_host || host.login,
      plano: plan || host.plano,
      valor: amount || null,
      status: "concluida",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: renovacao, error: renovErr } = await supabase
      .from("renovacoes")
      .insert(renovPayload)
      .select()
      .single();

    if (renovErr) {
      console.warn("renovacoes insert falhou:", renovErr.message);
    }

    const { data: updatedHost, error: updateErr } = await supabase
      .from("hostings_estoque")
      .update({
        data_vencimento: novoVenc.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", host.id)
      .select()
      .single();

    if (updateErr) return json(500, { ok: false, error: updateErr.message });

    return json(200, {
      ok: true,
      message: "Renovação registrada com sucesso",
      host: updatedHost,
      renovacao: renovacao || null,
      novo_vencimento: novoVenc.toISOString()
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};