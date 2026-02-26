const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(event, name){
  const raw = event.headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

exports.handler = async (event) => {
  try{
    if(event.httpMethod !== "POST"){
      return { statusCode: 405, body: "method_not_allowed" };
    }

    const token = getCookie(event, "sx_portal_session");
    if(!token) return { statusCode: 401, body: "unauthorized" };

    const { data: sess } = await supabase
      .from("sessoes_portal")
      .select("discord_id")
      .eq("token", token)
      .single();

    if(!sess?.discord_id) return { statusCode: 401, body: "unauthorized" };

    const body = event.body ? JSON.parse(event.body) : {};
    const serverId = typeof body.serverId === "string" ? body.serverId : null;
    const days = (body.days === 7 || body.days === 30) ? body.days : null;

    const mention = `<@${sess.discord_id}>`;
    const msg =
      `💰 ${mention} pagou destaque.\n` +
      `• Servidor: **${serverId || "não informado"}**\n` +
      `• Duração: **${days ? `${days} dias` : "não informada"}**\n` +
      `➡️ Ativar: /premiumserve server_id:${serverId || "srv_xxx"} days:${days || 7}`;

    const fetchFn = globalThis.fetch || require("node-fetch");

    await fetchFn(`https://discord.com/api/v10/channels/1476318002205954270/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ content: msg })
    });

    return { statusCode: 200, body: JSON.stringify({ ok:true }) };

  }catch(e){
    console.log("log-premium-purchase error", e);
    return { statusCode: 500, body: "internal_error" };
  }
};