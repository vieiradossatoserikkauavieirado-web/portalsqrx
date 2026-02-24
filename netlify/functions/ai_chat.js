import fs from "fs";
import path from "path";

function json(res, status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    },
    body: JSON.stringify(body)
  };
}

// --- util: normalização ---
function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const stop = new Set([
    "a","o","os","as","um","uma","de","da","do","das","dos","e","ou","pra","para","com","sem",
    "no","na","nos","nas","em","por","como","que","quando","onde","isso","isso","ai","eh","é"
  ]);
  return norm(s)
    .split(" ")
    .filter(w => w.length >= 3 && !stop.has(w));
}

// --- carregar KB ---
let KB = null;

function loadKbOnce() {
  if (KB) return KB;

  const kbDir = path.join(process.cwd(), "kb");
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith(".json"));

  const items = [];
  for (const f of files) {
    const full = path.join(kbDir, f);
    const content = fs.readFileSync(full, "utf8");
    try {
      const arr = JSON.parse(content);
      for (const it of arr) items.push(it);
    } catch {
      // ignora arquivo quebrado
    }
  }

  // pré-processa tokens para busca
  KB = items.map(it => {
    const text = `${it.title || ""} ${(it.tags || []).join(" ")} ${it.answer || ""}`;
    return {
      ...it,
      _tokens: tokenize(text)
    };
  });

  return KB;
}

// --- regras rápidas (intenção) ---
function ruleBasedAnswer(qRaw) {
  const q = norm(qRaw);

  // erros do compilador
  const mErr = q.match(/\b(erros?|error|warning)\s*(\d+)\b/);
  if (mErr) {
    const code = mErr[2];
    return {
      answer:
`Você mencionou ${mErr[1]} ${code}.  
Se você colar aqui **a linha do erro + 10-20 linhas do código perto**, eu te digo a correção exata.

Enquanto isso, dica rápida:
- Erro/Warning ${code} normalmente envolve nome errado, include faltando, callback incorreto ou parâmetro inválido.
- Envie também: quais includes/plugins você usa (DOF2, sscanf, mysql, streamer).`
    };
  }

  // lemehost / hospedagem
  if (q.includes("lemehost") || (q.includes("upar") && (q.includes("gm") || q.includes("gamemode")))) {
    return {
      answer:
`Se for **upar GM na LemeHost**, o básico é:
1) Compile e gere o arquivo **.amx**  
2) Envie por FTP (ex: FileZilla) para a pasta **/gamemodes**  
3) Edite o **server.cfg**: \`gamemode0 NomeDoGM 1\`  
4) Reinicie pelo painel da host

Se você me disser:
- nome do GM (.amx)
- o que está no seu server.cfg (linha gamemode0)
- qual erro aparece no console
eu te passo o ajuste certinho.`
    };
  }

  // salvamento: DOF2 / dini / mysql
  if (q.includes("dof2") || q.includes("dini") || q.includes("mysql") || q.includes("salvar") || q.includes("salvamento")) {
    return {
      answer:
`Salvamento no SA-MP funciona assim:  
- **Arquivo (DOF2/dini):** grava dados em arquivos por player (rápido de começar, mas limita em servidor grande).  
- **MySQL:** grava no banco (melhor pra servidor médio/grande, mais organizado e seguro).

Se você me falar qual sistema você quer (DOF2, dini ou MySQL BlueG) e quais dados (level, money, skin...), eu te mando um modelo completo (connect + login + save + load).`
    };
    
  }
  // detectar CMD:
  if (q.includes("cmd:")) {
    return {
      answer:
  `Você está usando comando com ZCMD.

  Estrutura básica:

  CMD:nome(playerid, params[])
  {
      // código aqui
      return 1;
  }

  Explicação:
  - CMD:nome → cria o comando (/nome)
  - playerid → jogador que usou
  - params[] → texto digitado depois
  - return 1; → comando executado com sucesso

  Se quiser, me manda o comando completo que eu explico linha por linha.`
    };
  }

  return null;
}

// --- busca simples (scoring por interseção de tokens) ---
function searchKb(question, topK = 3) {
  const kb = loadKbOnce();
  const qTokens = tokenize(question);
  if (!qTokens.length) return [];

  const qSet = new Set(qTokens);

  const scored = kb.map(it => {
    let score = 0;
    // pontua tokens em comum
    for (const t of it._tokens) if (qSet.has(t)) score += 1;

    // bônus se bater tag exatamente
    const tags = (it.tags || []).map(norm);
    for (const qt of qTokens) {
      if (tags.includes(qt)) score += 2;
    }

    return { it, score };
  }).filter(x => x.score > 0);

  scored.sort((a,b) => b.score - a.score);
  return scored.slice(0, topK).map(x => x.it);
}

function getSession(event) {
  const cookie = event.headers.cookie || "";
  // Exemplo: se você usa "sx_session=..."
  const has = cookie.includes("sx_session=");
  if (!has) return null;

  
  return { username: "VIP", plan: "VIP GOLD" };
}

function hasVip(session) {
  const p = (session?.plan || "").toUpperCase();
  return p.includes("VIP");
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(null, 405, { error: "Method not allowed" });
  }

 /* const session = getSession(event);
  if (!session) {
    return json(null, 401, { error: "Sem sessão. Faça login." });
  }*/

  if (!hasVip(session)) {
    return json(null, 403, { error: "Recurso disponível apenas para VIP." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(null, 400, { error: "JSON inválido." });
  }

  const message = (payload.message || "").trim();
  if (!message) return json(null, 400, { error: "Mensagem vazia." });

  // 1) regras
  const ruled = ruleBasedAnswer(message);
  if (ruled) return json(null, 200, { answer: ruled.answer });

  // 2) busca na KB
  const hits = searchKb(message, 3);

  if (!hits.length) {
    return json(null, 200, {
      answer:
`Não achei isso na minha base ainda. 😅  
Me manda:
- qual seu objetivo (ex: "criar comando /cv", "salvar level", "corrigir warning 219")
- e se tiver, o erro do compilador + trecho do código

Aí eu te respondo e depois você pode adicionar essa resposta na KB pra ficar automático.`
    });
  }

  // 3) monta resposta
  const best = hits[0];
  let answer = `**${best.title}**\n\n${best.answer}`;

  if (hits.length > 1) {
    answer += `\n\nOutros tópicos relacionados:\n`;
    for (let i = 1; i < hits.length; i++) {
      answer += `- ${hits[i].title}\n`;
    }
  }

  return json(null, 200, { answer });
}