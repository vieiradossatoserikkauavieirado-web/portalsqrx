const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const inviteCode = 'HSd3YcWryb'; // Seu código do convite aqui

  try {
    // Busca dados do invite no Discord API
    const response = await fetch(`https://discord.com/api/v9/invites/${inviteCode}?with_counts=true`);
    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Erro ao buscar dados do Discord.' }),
      };
    }

    const data = await response.json();

    // Pega total de membros e online (presences_count só funciona se o bot estiver no servidor, pode faltar)
    const totalMembers = data.approximate_member_count || 0;
    const onlineMembers = data.approximate_presence_count || 0;

    return {
      statusCode: 200,
      body: JSON.stringify({
        totalMembers,
        onlineMembers,
        serverName: data.guild?.name || 'Servidor Discord',
        inviteUrl: `https://discord.gg/${inviteCode}`,
      }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro interno na função.' }),
    };
  }
};
