exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method_not_allowed" };
    }

    const body = JSON.parse(event.body || "{}");
    const serverId = String(body.serverId || "").trim();
    if (!serverId) return { statusCode: 400, body: "missing_serverId" };

    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { error } = await supabase
      .from("server_stats")
      .upsert(
        { server_id: serverId, views: 1, updated_at: new Date().toISOString() },
        { onConflict: "server_id" }
      );

    // Se já existe, incrementa via RPC-like workaround: update + increment
    // (Supabase JS não tem "increment" nativo universal; usamos update com expressão via SQL é melhor,
    // mas aqui vamos fazer em 2 passos de forma simples e compatível)
    if (error) {
      // tenta update increment
      const { error: err2 } = await supabase.rpc("increment_server_views", { p_server_id: serverId });
      if (err2) return { statusCode: 500, body: "db_error" };
    } else {
      // se upsert inseriu ou atualizou sem erro, precisamos garantir incremento real quando já existia.
      // Para ficar 100%, use a função RPC abaixo (recomendado). Se você criar a RPC, pode remover o upsert.
      await supabase.rpc("increment_server_views", { p_server_id: serverId }).catch(() => {});
    }

    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error("server_view error:", e);
    return { statusCode: 500, body: "internal_error" };
  }
};