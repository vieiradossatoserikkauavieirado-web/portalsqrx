exports.handler = async (event) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = (process.env.DISCORD_SUB_REDIRECT_URI || "").trim().replace(/\/$/, "");

  if (!clientId || !redirectUri) {
    return { statusCode: 500, body: "missing_env: DISCORD_CLIENT_ID or DISCORD_SUB_REDIRECT_URI" };
  }

  const qs = event.queryStringParameters || {};
  const returnTo = qs.return || "/gamemodes.html";

  // ✅ quando force=1, obriga o Discord a pedir consentimento de novo
  const force = qs.force === "1";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify",
    state: Buffer.from(JSON.stringify({ returnTo })).toString("base64url"),
  });

  if (force) {
    // ✅ força aparecer a tela de autorização sempre
    params.set("prompt", "consent");

    // ✅ tenta obrigar revalidação do login no Discord (se suportado pela sessão)
    params.set("max_age", "0");
  }

  return {
    statusCode: 302,
    headers: {
      Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
      // ✅ evita cache do redirect
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
    body: "",
  };
};
