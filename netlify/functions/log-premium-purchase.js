exports.handler = async (event) => {
  try{
    const fetchFn = globalThis.fetch || require("node-fetch");

    await fetchFn(`https://discord.com/api/v10/channels/1476318002205954270/messages`, {
      method: "POST",
      headers: {
        "Authorization": `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: "💰 Novo pagamento de destaque recebido.\nVerificar e ativar manualmente."
      })
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ ok:true })
    };

  }catch(err){
    console.log("log-premium-purchase error", err);
    return { statusCode: 500 };
  }
};