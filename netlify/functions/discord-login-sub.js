function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

exports.handler = async (event) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_SUB_REDIRECT_URI;

  const returnTo =
    (event.queryStringParameters && event.queryStringParameters.return) || "/gamemodes.html";

  const state = b64url({ returnTo });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state
  });

  return {
    statusCode: 302,
    headers: { Location: `https://discord.com/oauth2/authorize?${params.toString()}` },
    body: ""
  };
};
