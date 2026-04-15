// ... gerou session_token, discord_id, username, avatar, expires_at ...
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY);

// depois de obter userJson (discord) e gerar session_token, created_at, expires_at:
const payload = {
  session_token,
  discord_id,
  username,    // ex: `${userJson.username}#${userJson.discriminator}`
  avatar: userJson.avatar || null,
  created_at,
  expires_at
};

const { data, error: insertErr } = await supabase
  .from('sessoes_hosting')
  .insert(payload)
  .select()
  .single();

if (insertErr) {
  console.error('Erro insert session:', insertErr);
  // redireciona com erro de sessão
  return {
    statusCode: 302,
    headers: { Location: '/hosting.html?err=sessionfail' },
    body: ''
  };
}

// set cookie e redireciona (mesma lógica sua)
const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60;
const cookie = `${COOKIE_NAME}=${encodeURIComponent(session_token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;

return {
  statusCode: 302,
  headers: {
    'Set-Cookie': cookie,
    Location: '/hosting.html?login=ok'
  },
  body: ''
};