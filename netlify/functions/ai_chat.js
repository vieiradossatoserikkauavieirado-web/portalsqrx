// netlify/functions/ai_chat.js
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getCookie(name, headers) {
  const cookieHeader =
    headers?.cookie || headers?.Cookie || headers?.COOKIE || "";
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(bodyObj),
  };
}

// --- Normalização / tokens (busca simples) ---
function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const stop = new Set([
    "a","o","os","as","um","uma","de","da","do","das","dos","e","ou","pra","para","com","sem",
    "no","na","nos","nas","em","por","como","que","quando","onde","isso","ai","eh","é","ta","tá"
  ]);
  return norm(s)
    .split(" ")
    .filter(w => w.length >= 3 && !stop.has(w));
}

// --- Carregar KB (.json) ---
let KB = null;

function loadKbOnce() {
  if (KB) return KB;

  const kbDir = path.join(process.cwd(), "kb");
  let files = [];
  try {
    files = fs.readdirSync(kbDir).filter(f => f.endsWith(".json"));
  } catch (err) {
    // pasta kb não existe no deploy
    KB = [];
    return KB;
  }

  const items = [];
  for (const f of files) {
    const full = path.join(kbDir, f);
    try {
      const content = fs.readFileSync(full, "utf8");
      const arr = JSON.parse(content);
      if (Array.isArray(arr)) {
        for (const it of arr) items.push(it);
      }
    } catch {
      // ignora JSON inválido
    }
  }

  KB = items.map(it => {
    const text = `${it.title || ""} ${(it.tags || []).join(" ")} ${it.answer || ""}`;
    return { ...it, _tokens: tokenize(text) };
  });

  return KB;
}

function searchKb(question, topK = 3) {
  const kb = loadKbOnce();
  const qTokens = tokenize(question);
  if (!qTokens.length || !kb.length) return [];

  const qSet = new Set(qTokens);

  const scored = kb
    .map(it => {
      let score = 0;

      // tokens em comum
      for (const t of it._tokens) if (qSet.has(t)) score += 1;

      // bônus em tags
      const tags = (it.tags || []).map(norm);
      for (const qt of qTokens) if (tags.includes(qt)) score += 2;

      // bônus se o título bater algo forte
      const titleTokens = tokenize(it.title || "");
      for (const tt of titleTokens) if (qSet.has(tt)) score += 2;

      return { it, score };
    })
    .filter(x => x.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(x => x.it);
}

// --- Regras didáticas (parece “IA”) ---
function ruleBasedAnswer(messageRaw) {
  const q = norm(messageRaw);

  // detecta CMD:
  if (q.includes("cmd:")) {
    return {
      answer:
`Você está usando **ZCMD** (comandos com CMD:).

Modelo:
CMD:nome(playerid, params[])
{
    // seu código aqui
    return 1;
}

Explicando bem simples:
- **CMD:nome** → cria o comando (o player digita **/nome**)
- **playerid** → é o ID do jogador que executou
- **params[]** → o que o player digitou depois do comando (ex: /setlevel 10)
- **return 1;** → diz “comando tratado com sucesso”

Se você colar seu comando completo, eu explico linha por linha e já te mostro como pegar parâmetros com **sscanf**.`
    };
  }

  // erros/warnings
  const m = q.match(/\b(error|erro|warning)\s*(\d+)\b/);
  if (m) {
    const code = m[2];
    return {
      answer:
`Você citou **${m[1]} ${code}**.

Pra eu corrigir certinho, manda:
1) a linha completa do erro/warning
2) 10–20 linhas do código perto da linha apontada (ou o trecho do comando/callback)

Dica: muitos erros vêm de **include faltando**, **nome errado**, ou **plugin não carregado**.`
    };
  }

  // lemehost / upar gm
  if (q.includes("lemehost") || (q.includes("upar") && (q.includes("gm") || q.includes("gamemode")))) {
    return {
      answer:
`Pra **upar gamemode na LemeHost** (bem simples):
1) Compile e gere o arquivo **.amx**
2) Envie o **.amx** para a pasta **/gamemodes** via FTP
3) No **server.cfg** coloque: \`gamemode0 NomeDoGM 1\`
4) Reinicie o servidor no painel

Se não funcionar, me diga:
- nome do arquivo .amx
- sua linha gamemode0 do server.cfg
- o erro que aparece no console
que eu aponto o que está errado.`
    };
  }

  return null;
}

// --- sessão (igual me_ia) ---
async function getSession(event) {
  const token = getCookie("sx_ia_session", event.headers);
  if (!token) return { ok: false, code: "no_session" };

  const { data: sess, error } = await supabase
    .from("sessoes_ia")
    .select("username, plan, expira_em")
    .eq("token", token)
    .maybeSingle();

  if (error || !sess) return { ok: false, code: "invalid_session" };

  const exp = new Date(sess.expira_em).getTime();
  if (!exp || Number.isNaN(exp) || exp < Date.now()) {
    return { ok: false, code: "expired_session" };
  }

  return { ok: true, username: sess.username, plan: sess.plan || "VIP GOLD" };
}

function isVip(plan) {
  // Ajuste aqui se você tiver planos específicos.
  // Ex: "VIP GOLD", "VIP SILVER", etc.
  const p = (plan || "").toUpperCase();
  return p.includes("VIP");
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return json(405, { error: "Method not allowed" });
    }

    const sess = await getSession(event);
    if (!sess.ok) {
      return json(401, { error: "Sem sessão. Faça login novamente.", code: sess.code });
    }

    if (!isVip(sess.plan)) {
      return json(403, { error: "Recurso disponível apenas para VIP.", code: "vip_required" });
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "JSON inválido." });
    }

    const message = (payload.message || "").trim();
    if (!message) return json(400, { error: "Mensagem vazia." });

    // 1) regras (didático)
    const ruled = ruleBasedAnswer(message);
    if (ruled) return json(200, { answer: ruled.answer });

    // 2) KB
    const hits = searchKb(message, 3);

    if (!hits.length) {
      const kbLoaded = loadKbOnce();
      if (!kbLoaded.length) {
        return json(200, {
          answer:
`Ainda não encontrei conteúdo porque sua pasta **/kb** está vazia ou não foi publicada no deploy.

Crie pelo menos 1 arquivo como:
- kb/guia_basico_samp.json

Depois me mande a pergunta de novo.`
        });
      }

      return json(200, {
        answer:
`Não achei isso na minha base ainda.

Me manda:
- seu objetivo (ex: “criar comando /login”, “salvar level no DOF2”, “corrigir error 017”)
- e se tiver, o erro do compilador + trecho do código

Aí eu respondo e você pode salvar essa resposta na KB pra virar automático.`
      });
    }

    // resposta com o melhor hit
    const best = hits[0];
    let answer = `**${best.title}**\n\n${best.answer}`;

    if (hits.length > 1) {
      answer += `\n\nTópicos relacionados:\n`;
      for (let i = 1; i < hits.length; i++) {
        answer += `- ${hits[i].title}\n`;
      }
    }

    return json(200, { answer });
  } catch (err) {
    return json(500, { error: "internal_error", detail: String(err?.message || err) });
  }
};