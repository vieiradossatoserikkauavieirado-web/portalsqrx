exports.handler = async (event) => {
  try {
    const { serverId, ownerId, plan } = JSON.parse(event.body);

    const days = plan === "monthly" ? 30 : 7;

    const premiumData = {
      serverId,
      ownerId,
      plan,
      isActive: true,
      expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
      createdAt: Date.now()
    };

    await fetch(`https://discord.com/api/v10/channels/${process.env.DB_PREMIUM_CHANNEL_ID}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: "```json\n" + JSON.stringify(premiumData, null, 2) + "\n```"
      })
    });

    return { statusCode: 200 };

  } catch {
    return { statusCode: 500 };
  }
};