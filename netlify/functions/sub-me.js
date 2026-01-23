const crypto = require("crypto");

function verify(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (sig !== expected) return null;

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || Date.now() > payload.exp) return null;

  return payload;
}

function getCookie(event, name) {
  const raw = event.headers.cookie || event.headers.Cookie || "";
  const parts = raw.split(";").map(s => s.trim());
  for (const p of parts) {
    const [k, ...v] = p.split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

exports.handler = async (event) => {
  const t = getCookie(event, "sx_sub_session");
  const payload = verify(t, process.env.SUB_SESSION_SECRET);
  if (!payload) return { statusCode: 401, body: "no_sub_session" };

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true })
  };
};
