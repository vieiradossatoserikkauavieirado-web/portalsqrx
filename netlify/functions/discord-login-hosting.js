exports.handler = async () => {
  try {
    const clientId = (process.env.DISCORD_CLIENT_ID || "").trim();
    const redirectUri = (process.env.DISCORD_REDIRECT_URI_HOSTING || "")
      .trim()
      .replace(/\/$/, "");

    if (!clientId || !redirectUri) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
        body: "missing_env: DISCORD_CLIENT_ID or DISCORD_REDIRECT_URI_HOSTING",
      };
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      prompt: "consent",
    });

    return {
      statusCode: 302,
      headers: {
        Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
        "Cache-Control": "no-store",
      },
      body: "",
    };
  } catch (err) {
    console.error("discord-login-hosting error:", err);

    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: "internal_error",
    };
  }
};