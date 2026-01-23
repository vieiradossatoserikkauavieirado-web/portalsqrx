exports.handler = async (event) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = (process.env.DISCORD_SUB_REDIRECT_URI || "").trim().replace(/\/$/, "");

  if (!clientId || !redirectUri) {
    return { statusCode: 500, body: "missing_env: DISCORD_CLIENT_ID or DISCORD_SUB_REDIRECT_URI" };
  }

  const returnTo = event.queryStringParameters?.return || "/gamemodes.html";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state: Buffer.from(JSON.stringify({ returnTo })).toString("base64url"),
  });

  return {
    statusCode: 302,
    headers: { Location: `https://discord.com/oauth2/authorize?${params.toString()}` },
    body: "",
  };
};
