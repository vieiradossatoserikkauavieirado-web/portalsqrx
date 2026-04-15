// netlify/functions/notify-purchase.js
// Função Netlify que registra um pedido no Supabase e (opcional) envia um webhook para o Discord.
// - Coloque as env vars no Netlify: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SERVICE_ROLE), DISCORD_WEBHOOK_URL (opcional), DISCORD_ALERT_ROLE_ID (opcional), PLANOS_JSON (opcional).
// - Usa fetch global (Node 18+) — sem dependências extras.

const { createClient } = require('@supabase/supabase-js');

/**
 * Lê env vars com fallback para nomes alternativos que você possa ter usado.
 */
const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_URL_KEY ||
  null;

const SUPABASE_SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||           // preferido
  process.env.SUPABASE_SERVICE_ROLE_KEY ||       // seu nome atual possível
  process.env.SUPABASE_KEY ||                    // alternativa comum
  null;

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || null;
const DISCORD_ALERT_ROLE_ID = process.env.DISCORD_ALERT_ROLE_ID || null;

// Planos: pode ser definido via env PLANOS_JSON = '{"barato":{"nome":"Barato","slots":10}, ... }'
const PLANOS = process.env.PLANOS_JSON
  ? (() => { try { return JSON.parse(process.env.PLANOS_JSON); } catch (e) { console.warn('PLANOS_JSON inválido'); return {}; } })()
  : {
    barato: { nome: 'Barato', slots: 10 },
    bom: { nome: 'Bom', slots: 20 },
    otimo: { nome: 'Ótimo', slots: 50 }
  };

// validação inicial de env vars
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
  console.error('[notify-purchase] ENV MISSING:', {
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_SERVICE_ROLE: !!SUPABASE_SERVICE_ROLE,
    used_env_names: {
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SUPABASE_URL' : (process.env.SUPABASE_URL_KEY ? 'SUPABASE_URL_KEY' : null),
      SUPABASE_SERVICE_ROLE: process.env.SUPABASE_SERVICE_ROLE ? 'SUPABASE_SERVICE_ROLE' : (process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : (process.env.SUPABASE_KEY ? 'SUPABASE_KEY' : null))
    }
  });

  // Resposta imediata quando variáveis de ambiente não estão configuradas
  exports.handler = async function () {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'ENV_MISSING',
        message: 'SUPABASE_URL ou SUPABASE_SERVICE_ROLE (ou SUPABASE_SERVICE_ROLE_KEY) não estão configurados no ambiente.'
      })
    };
  };

  // fim do módulo (não prosseguimos sem as keys)
  return;
}

// cria o cliente Supabase com a service_role (backend)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

/**
 * Handler principal
 */
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Allow': 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const discord_id = body.discord_id || null;
    const planoKey = body.plano || body.plano_key || body.plan || 'desconhecido';
    const checkout_ref = body.checkout_ref || null;

    if (!discord_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'MISSING_DISCORD_ID', message: 'discord_id é obrigatório' })
      };
    }

    const planoInfo = PLANOS[planoKey] || { nome: planoKey, slots: 0 };

    const pedido = {
      discord_id: String(discord_id),
      discord_username: body.discord_username || null,
      plano_key: planoKey,
      amount_cents: body.amount_cents || null,
      checkout_url: body.checkout_url || null,
      checkout_ref: checkout_ref,
      status: 'pendente',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Insere no Supabase
    const { data, error } = await supabase
      .from('pedidos')
      .insert(pedido)
      .select()
      .single();

    if (error) {
      console.error('[notify-purchase] supabase insert error:', error);
      // Retorna erro 500 com detalhes não sensíveis para o front (útil para debug)
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'DB_INSERT_FAILED',
          message: error.message || 'Erro ao inserir pedido no banco.',
          details: error.details || null
        })
      };
    }

    // Opcional: enviar webhook para Discord (não falhará a rota se webhook der problema)
    let webhookResult = { sent: false, error: null };
    if (DISCORD_WEBHOOK_URL) {
      try {
        const rolePart = DISCORD_ALERT_ROLE_ID ? `<@&${DISCORD_ALERT_ROLE_ID}>` : '';
        const userPart = `<@${discord_id}>`;

        const content = `${rolePart} ${userPart} comprou **${planoInfo.nome}**\nSlots: ${planoInfo.slots}\n\nCrie uma host, entrega pendente.`;

        const payload = {
          content,
          allowed_mentions: {
            parse: [], // não parse automático
            users: [discord_id],
            roles: DISCORD_ALERT_ROLE_ID ? [DISCORD_ALERT_ROLE_ID] : []
          }
        };

        const res = await fetch(DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error('[notify-purchase] webhook send failed', res.status, text);
          webhookResult = { sent: false, error: `HTTP ${res.status}: ${text}` };
        } else {
          webhookResult = { sent: true };
        }
      } catch (wErr) {
        console.error('[notify-purchase] webhook exception', wErr);
        webhookResult = { sent: false, error: String(wErr.message || wErr) };
      }
    } else {
      // webhook não configurado — ok, o bot/listener processará a tabela pedidos
    }

    // Sucesso
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Pedido registrado com sucesso.',
        pedido: data || null,
        webhook: webhookResult
      })
    };
  } catch (err) {
    console.error('[notify-purchase] unexpected error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'EXCEPTION',
        message: err.message || 'Erro interno'
      })
    };
  }
};