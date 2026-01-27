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
    const token = getCookie("sx_session", event.headers);
    if (!token) {
      return {
        statusCode: 401,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
        body: "no_session_cookie",
      };
    }

    const { data: sess, error } = await supabase
      .from("sessoes")
      .select("username, expira_em")
      .eq("token", token)
      .maybeSingle();

    if (error || !sess) {
      return {
        statusCode: 401,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
        body: "invalid_session",
      };
    }

    if (new Date(sess.expira_em).getTime() < Date.now()) {
      return {
        statusCode: 401,
        headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
        body: "expired_session",
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify({ username: sess.username }),
    };
  } catch {
    return {
      statusCode: 500,
      headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" },
      body: "internal_error",
    };
  }
};
