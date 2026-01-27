exports.handler = async () => {
  const clientId = (process.env.DISCORD_CLIENT_ID || "").trim();
  const redirectUri = (process.env.DISCORD_REDIRECT_URI || "").trim().replace(/\/$/, "");

  if (!clientId || !redirectUri) {
    return { statusCode: 500, body: "missing_env: DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI" };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
  });

  return {
    statusCode: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
      "Cache-Control": "no-store",
    },
    body: "",
  };
};
