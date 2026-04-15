// discord-login-hosting.js
exports.handler = async function (event) {
  const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
  // aqui usamos a variável que você informou
  const REDIRECT_URI = process.env.DISCORD_REDIRECT_URI_HOSTING;

  // debug temporário — remove depois
  console.log('DEBUG: DISCORD_REDIRECT_URI_HOSTING =', JSON.stringify(REDIRECT_URI));

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    prompt: 'consent'
  });

  return {
    statusCode: 302,
    headers: { Location: `https://discord.com/api/oauth2/authorize?${params.toString()}` },
    body: ''
  };
};