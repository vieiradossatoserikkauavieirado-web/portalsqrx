// netlify/functions/notify-renewal.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession:false, autoRefreshToken:false }
});

const json = (s,b) => ({ statusCode: s, headers: { 'Content-Type':'application/json' }, body: JSON.stringify(b) });

// opcional: implemente verificação server-to-server do tx com seu gateway
async function verifyTxWithGateway(tx) {
  // Placeholder — implemente a chamada à API do seu gateway para verificar a transação 'tx'
  // Retorne true se confirmado, false caso contrário.
  return true;
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return json(405, { ok:false, error:'METHOD_NOT_ALLOWED' });

    const body = JSON.parse(event.body || '{}');
    const hostLogin = body.host || body.login_host || null;
    const discordId = body.discord_id || body.discordId || null;
    const plan = body.plan || body.plano || null;
    const tx = body.tx || null;
    const amount = body.amount || null;

    if (!hostLogin) return json(400, { ok:false, error:'HOST_REQUIRED' });

    // find host
    const { data: host, error: hostErr } = await supabase
      .from('hostings_estoque')
      .select('*')
      .eq('login_host', hostLogin)
      .limit(1)
      .maybeSingle();

    if (hostErr) return json(500, { ok:false, error: hostErr.message });
    if (!host) return json(404, { ok:false, error:'HOST_NOT_FOUND' });

    // optional: validate tx with gateway (recommended)
    if (tx) {
      try {
        const okTx = await verifyTxWithGateway(tx);
        if (!okTx) {
          return json(400, { ok:false, error:'TX_NOT_VALID' });
        }
      } catch (e) {
        // se não conseguir validar, continue mas logue
        console.warn('verifyTxWithGateway error:', e);
      }
    }

    // compute novo vencimento: se existe data_vencimento no futuro, soma 30 dias; se passou, soma a partir de agora
    const agora = new Date();
    let base = host.data_vencimento ? new Date(host.data_vencimento) : agora;
    if (base < agora) base = agora;
    const novoVenc = new Date(base);
    novoVenc.setDate(novoVenc.getDate() + 30);

    // insert renovacao (audit) — continuar mesmo se falhar
    const renovPayload = {
      discord_id: String(host.cliente_discord_id || discordId || ''),
      host_id: host.id,
      login_host: host.login_host || host.login,
      plano: plan || host.plano,
      valor: amount || null,
      status: 'concluida',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: renovData, error: renovErr } = await supabase
      .from('renovacoes')
      .insert(renovPayload)
      .select()
      .single();

    if (renovErr) {
      console.warn('renovacoes insert falhou:', renovErr.message);
    }

    // update hostings_estoque
    const { data: updatedHost, error: updateErr } = await supabase
      .from('hostings_estoque')
      .update({
        data_vencimento: novoVenc.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', host.id)
      .select()
      .single();

    if (updateErr) return json(500, { ok:false, error: updateErr.message });

    // opcional: retornar informação para o frontend e para o bot (bot detectará alteração no DB)
    return json(200, {
      ok: true,
      message: 'Renovação registrada com sucesso',
      host: updatedHost,
      renovacao: renovData || null,
      novo_vencimento: novoVenc.toISOString()
    });

  } catch (err) {
    return json(500, { ok:false, error: err.message });
  }
};