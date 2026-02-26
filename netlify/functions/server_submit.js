await fetch(`https://discord.com/api/v10/channels/${process.env.DB_CHANNEL_ID}/messages`,{
  method:"POST",
  headers:{
    Authorization:`Bot ${process.env.DISCORD_BOT_TOKEN}`,
    "Content-Type":"application/json"
  },
  body:JSON.stringify({
    content:
`📥 Novo servidor cadastrado
ID: ${serverId}
Nome: ${name}
Owner: <@${discordId}>

\`\`\`json
${JSON.stringify(serverData, null, 2)}
\`\`\``
  })
});