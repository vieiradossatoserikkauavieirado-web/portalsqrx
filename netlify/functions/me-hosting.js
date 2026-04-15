// após obter token do cookie
const { data, error } = await supabase
  .from('sessoes_hosting')
  .select('discord_id, username, avatar, expires_at')
  .eq('session_token', token)
  .gt('expires_at', new Date().toISOString())
  .limit(1)
  .single();

if (!data) return { statusCode: 200, body: JSON.stringify({ ok: false }) };

return {
  statusCode: 200,
  body: JSON.stringify({
    ok: true,
    discord_id: data.discord_id,
    username: data.username,
    avatar: data.avatar,
    expires_at: data.expires_at
  })
};