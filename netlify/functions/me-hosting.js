// netlify/functions/me-hosting.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const COOKIE_NAME = 'sx_hosting_session';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE || '');

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').map(p => p.split('=')).reduce((acc, [k,v]) => {
    if (!k) return acc;
    acc[k.trim()] = v ? decodeURIComponent(v.trim()) : '';
    return acc;
  }, {});
}

exports.handler = async function (event) {
  try {
    const cookies = parseCookies(event.headers.cookie || event.headers.Cookie || '');
    const token = cookies[COOKIE_NAME];
    if (!token) return { statusCode: 200, body: JSON.stringify({ ok: false }) };

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('sessoes_hosting')
      .select('discord_id, username, avatar, expires_at')
      .eq('session_token', token)
      .gt('expires_at', now)
      .limit(1)
      .single();

    if (error || !data) return { statusCode: 200, body: JSON.stringify({ ok: false }) };

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
  } catch (err) {
    console.error('me-hosting error', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};