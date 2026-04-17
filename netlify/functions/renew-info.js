// netlify/functions/renew-info.js
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body)
  };
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
    }

    const body = JSON.parse(event.body || "{}");
    const discordId = body.discord_id || body.discordId || null;

    if (!discordId) {
      return json(400, { ok: false, error: "DISCORD_ID_REQUIRED" });
    }

    const { data: hosts, error } = await supabase
      .from("hostings_estoque")
      .select("*")
      .eq("cliente_discord_id", String(discordId))
      .order("id", { ascending: true });

    if (error) {
      return json(500, { ok: false, error: error.message });
    }

    return json(200, { ok: true, hosts: hosts || [] });
  } catch (err) {
    return json(500, { ok: false, error: err.message });
  }
};