// netlify/functions/renew-info.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession:false, autoRefreshToken:false }
});

const json = (s,b) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'METHOD_NOT_ALLOWED' });

    const body = JSON.parse(event.body || '{}');
    const hostLogin = body.host || body.login_host || null;
    const discordId = body.discord_id || body.discordId || null;

    if (!hostLogin && !discordId) return json(400, { ok:false, error:'HOST_OR_DISCORD_REQUIRED' });

    if (hostLogin) {
      const { data, error } = await supabase
        .from('hostings_estoque')
        .select('*')
        .eq('login_host', hostLogin)
        .limit(1)
        .maybeSingle();
      if (error) return json(500, { ok:false, error: error.message });
      return json(200, { ok:true, host: data });
    }

    const { data: hosts, error } = await supabase
      .from('hostings_estoque')
      .select('*')
      .eq('cliente_discord_id', String(discordId))
      .order('id', { ascending: true });

    if (error) return json(500, { ok:false, error: error.message });
    return json(200, { ok:true, hosts });
  } catch (err) {
    return json(500, { ok:false, error: err.message });
  }
};