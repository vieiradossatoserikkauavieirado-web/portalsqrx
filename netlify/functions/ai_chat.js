// netlify/functions/ai_chat.js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, headers) {
  const cookieHeader = headers?.cookie || headers?.Cookie || headers?.COOKIE || "";
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function requireIaSession(event) {
  const token = getCookie("sx_ia_session", event.headers);
  if (!token) return { ok:false, statusCode: 401, error: "Sem sessão. Faça login." };

  const { data: sess, error } = await supabase
    .from("sessoes_ia")
    .select("username, plan, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !sess) return { ok:false, statusCode: 401, error: "Sessão inválida. Faça login." };

  const exp = new Date(sess.expira_em).getTime();
  if (!exp || Number.isNaN(exp) || exp < Date.now()) {
    return { ok:false, statusCode: 401, error: "Sessão expirada. Faça login novamente." };
  }

  return { ok:true, sess };
}

function extractTextFromResponsesAPI(respJson) {
  // Responses API pode retornar em "output_text" (quando disponível) ou por itens.
  if (typeof respJson?.output_text === "string" && respJson.output_text.trim()) {
    return respJson.output_text.trim();
  }
  const out = respJson?.output;
  if (!Array.isArray(out)) return "";

  // tenta achar mensagens
  for (const item of out) {
    if (item?.type === "message" && Array.isArray(item?.content)) {
      const parts = item.content
        .filter(p => p?.type === "output_text" || p?.type === "text")
        .map(p => p?.text || "")
        .join("");
      if (parts.trim()) return parts.trim();
    }
  }
  return "";
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "method_not_allowed" };
    }

    const gate = await requireIaSession(event);
    if (!gate.ok) {
      return {
        statusCode: gate.statusCode,
        headers: { "Content-Type":"application/json", "Cache-Control":"no-store" },
        body: JSON.stringify({ error: gate.error })
      };
    }

    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      return {
        statusCode: 500,
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ error: "missing_env: OPENAI_API_KEY" })
      };
    }

    const body = JSON.parse(event.body || "{}");
    const message = String(body.message || "").trim();
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message) {
      return {
        statusCode: 400,
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ error: "Mensagem vazia." })
      };
    }

    // Prompt focado em Pawn / SA-MP
    const system = [
      "Você é um assistente de programação especializado em Pawn (SA-MP).",
      "Responda com explicações curtas e práticas.",
      "Quando sugerir código, use Pawn correto e com comentários curtos.",
      "Se faltar contexto, faça 1-2 perguntas objetivas antes de supor.",
      "Não invente includes/funções: se não tiver certeza, diga como verificar."
    ].join(" ");

    // Converte history (role/content) para um input simples
    const compactHistory = history
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10);

    const input = [
      { role: "system", content: system },
      ...compactHistory.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: message }
    ];

    // Responses API (oficial): POST https://api.openai.com/v1/responses :contentReference[oaicite:2]{index=2}
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input
      }),
    });

    if (!r.ok) {
      const txt = await r.text().catch(()=> "");
      return {
        statusCode: 502,
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ error: `Falha na IA (${r.status}).`, details: txt.slice(0, 800) })
      };
    }

    const respJson = await r.json();
    const answer = extractTextFromResponsesAPI(respJson) || "Não consegui gerar uma resposta. Tente de novo com mais detalhes.";

    return {
      statusCode: 200,
      headers: { "Content-Type":"application/json", "Cache-Control":"no-store" },
      body: JSON.stringify({ answer })
    };

  } catch {
    return {
      statusCode: 500,
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ error: "internal_error" })
    };
  }
};
