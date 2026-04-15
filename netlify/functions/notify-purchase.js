// netlify/functions/notify-purchase.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

// opcional: PLANOS_JSON em env ({"barato":{"nome":"Barato","slots":50},...})
const PLANOS = process.env.PLANOS_JSON ? JSON.parse(process.env.PLANOS_JSON) : {
  barato: { nome: 'Barato', slots: 50 },
  bom: { nome: 'Bom', slots: 100 },
  otimo: { nome: 'Ótimo', slots: 200 }
};

exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const body = JSON.parse(event.body || '{}');
    const discord_id = body.discord_id;
    const planoKey = body.plano || 'desconhecido';
    const checkout_ref = body.checkout_ref || null;

    if (!discord_id) return { statusCode: 400, body: JSON.stringify({ error: 'discord_id é obrigatório' }) };

    const planoInfo = PLANOS[planoKey] || { nome: planoKey, slots: 0 };

    const pedido = {
      discord_id,
      discord_username: null,
      plano_key: planoKey,
      amount_cents: null,
      checkout_url: null,
      checkout_ref,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('pedidos').insert(pedido).select().single();
    if (error) {
      console.error('supabase insert pedidos error:', error);
      // retornar 200 mas com mensagem de log (para não quebrar UX)
      return { statusCode: 200, body: JSON.stringify({ message: 'Pedido registrado localmente (warning).', error: error.message }) };
    }

    // exemplo de envio via webhook (se quiser enviar do function)
    // const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    // if (DISCORD_WEBHOOK_URL) {
    //   try {
    //     await fetch(DISCORD_WEBHOOK_URL, {
    //       method: 'POST',
    //       headers: { 'Content-Type': 'application/json' },
    //       body: JSON.stringify({ content: `Novo pedido: ${discord_id} - ${planoInfo.nome}` })
    //     });
    //   } catch (wErr) {
    //     console.error('erro webhook:', wErr);
    //   }
    // }

    return { statusCode: 200, body: JSON.stringify({ message: 'Pedido registrado com sucesso.' }) };
  } catch (err) {
    console.error('notify-purchase error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno' }) };
  }
};