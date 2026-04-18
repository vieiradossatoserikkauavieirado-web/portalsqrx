// discord-login-hosting.js
exports.handler = async function (event) {
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI_HOSTING;

  const next = event.queryStringParameters?.next || "/hosting.html?login=ok";
  const state = Buffer.from(JSON.stringify({ next }), "utf8").toString("base64url");

  console.log("DEBUG: DISCORD_REDIRECT_URI_HOSTING =", JSON.stringify(REDIRECT_URI));
  console.log("DEBUG: next =", next);

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    prompt: "consent",
    state
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://discord.com/api/oauth2/authorize?${params.toString()}`,
      "Cache-Control": "no-store"
    },
    body: ""
  };
};