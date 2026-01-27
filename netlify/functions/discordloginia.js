// netlify/functions/discordloginia.js
exports.handler = async (event) => {
  try {
    const clientId = (process.env.DISCORD_CLIENT_ID || "").trim();
    const redirectUri = (process.env.DISCORD_IA_REDIRECT_URI || "").trim().replace(/\/$/, "");

    if (!clientId || !redirectUri) {
      console.error("missing env: DISCORD_CLIENT_ID or DISCORD_IA_REDIRECT_URI");
      return { statusCode: 500, body: "missing_env: DISCORD_CLIENT_ID or DISCORD_IA_REDIRECT_URI" };
    }

    const qs = event.queryStringParameters || {};
    const force = qs.force === "1";

    // só aceita paths locais (evita open-redirect)
    let returnTo = "/ia.html";
    if (qs.return && String(qs.return).startsWith("/")) {
      returnTo = String(qs.return);
    }

    // state com returnTo
    const state = Buffer.from(JSON.stringify({ returnTo }), "utf8").toString("base64url");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    });

    if (force) {
      params.set("prompt", "consent");
      params.set("max_age", "0");
    }

    return {
      statusCode: 302,
      headers: {
        Location: `https://discord.com/oauth2/authorize?${params.toString()}`,
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
      body: "",
    };
  } catch (err) {
    console.error("discordloginia error:", err?.message || err);
    return {
      statusCode: 302,
      headers: { Location: "/loginia.html?err=dc_fail" },
      body: "",
    };
  }
};
