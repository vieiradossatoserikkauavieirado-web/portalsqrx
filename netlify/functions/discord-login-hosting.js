// netlify/functions/discord-login-hosting.js
exports.handler = async function (event) {
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  const REDIRECT_URI = process.env.DISCORD_REDIRECT_HOSTING; // ex: https://seusite.com/.netlify/functions/discord-callback-hosting
  const state = ""; // opcional: você pode gerar state para CSRF

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    prompt: "consent"
    // state
  });

  const url = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
  return {
    statusCode: 302,
    headers: { Location: url },
    body: ""
  };
};