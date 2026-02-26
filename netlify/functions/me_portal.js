const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(headers, name){
  const raw = headers.cookie || "";
  const m = raw.match(new RegExp(`(?:^|; )${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

exports.handler = async (event) => {
  try{
    const token = getCookie(event.headers, "sx_portal_session");
    if(!token) return { statusCode:401 };

    const { data } = await supabase
      .from("sessoes_portal")
      .select("discord_id, username, expira_em")
      .eq("token", token)
      .maybeSingle();

    if(!data) return { statusCode:401 };

    if(new Date(data.expira_em).getTime() < Date.now())
      return { statusCode:401 };

    return {
      statusCode:200,
      body: JSON.stringify({
        discord_id: data.discord_id,
        username: data.username
      })
    };

  }catch{
    return { statusCode:500 };
  }
};