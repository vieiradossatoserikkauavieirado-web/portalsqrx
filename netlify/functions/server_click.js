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

    const { error } = await supabase.rpc("increment_server_clicks", { p_server_id: serverId });
    if (error) return { statusCode: 500, body: "db_error" };

    return { statusCode: 200, body: "ok" };
  } catch (e) {
    console.error("server_click error:", e);
    return { statusCode: 500, body: "internal_error" };
  }
};