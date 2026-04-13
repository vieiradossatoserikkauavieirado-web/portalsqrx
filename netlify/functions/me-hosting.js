const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, headers) {
  const cookieHeader =
    headers?.cookie || headers?.Cookie || headers?.COOKIE || "";
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

exports.handler = async (event) => {
  try {
    const token = getCookie("sx_hosting_session", event.headers);

    if (!token) {
      return {
        statusCode: 401,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "no_session_cookie" }),
      };
    }

    const { data: sess, error } = await supabase
      .from("sessoes_hosting")
      .select("discord_id, username, avatar, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (error || !sess) {
      return {
        statusCode: 401,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "invalid_session" }),
      };
    }

    if (new Date(sess.expira_em).getTime() < Date.now()) {
      return {
        statusCode: 401,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ error: "expired_session" }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        discord_id: sess.discord_id,
        username: sess.username,
        avatar: sess.avatar,
      }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ error: "internal_error" }),
    };
  }
};