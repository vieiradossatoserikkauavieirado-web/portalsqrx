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

  const kbDir = path.join(__dirname, "../../kb");

  let files = [];
  try {
    files = fs.readdirSync(kbDir).filter(f => f.endsWith(".json"));
  } catch (err) {
    console.log("Erro ao ler pasta KB:", err);
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
      } else {
        console.log("KB arquivo não é array:", f);
      }
    } catch (err) {
      console.log("KB JSON inválido:", f, err?.message || err);
    }
  }

  KB = items.map(it => {
    const text = `${it.title || ""} ${(it.tags || []).join(" ")} ${it.answer || ""}`;
    return { ...it, _tokens: tokenize(text) };
  });

  console.log("KB carregada. json_files:", files.length, "items:", items.length, "KB:", KB.length);
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
function pickAnswerFromChoices(q, choices) {
  // retorna o primeiro item que aparecer no texto
  for (const c of choices) if (q.includes(c)) return c;
  return null;
}

function wantsMysql(q){ return q.includes("mysql") || q.includes("blueg") || q.includes("banco"); }
function wantsDof2(q){ return q.includes("dof2") || q.includes("dof"); }
function wantsDini(q){ return q.includes("dini") || q.includes("ini"); }

function jobName(q){
  // tenta identificar um job
  const jobs = [
    "fazendeiro","minerador","lenhador","pescador","lixeiro","taxista","mecanico","policial","medico","entregador"
  ];
  return pickAnswerFromChoices(q, jobs);
}

function makeBeginnerFormat({ title, explain, steps, code, commons, ask }) {
  let out = `**${title}**\n\n${explain}\n\n`;
  if (steps?.length) {
    out += `**Passo a passo**\n`;
    for (let i = 0; i < steps.length; i++) out += `${i+1}) ${steps[i]}\n`;
    out += `\n`;
  }
  if (code) out += `**Exemplo (código)**\n${code}\n\n`;
  if (commons?.length) {
    out += `**Erros comuns**\n`;
    for (const c of commons) out += `- ${c}\n`;
    out += `\n`;
  }
  if (ask?.length) {
    out += `**Pra eu adaptar pro seu servidor:**\n`;
    for (const a of ask) out += `- ${a}\n`;
  }
  return out.trim();
}

function templateJobFarmer({ storage = "dof2", commandSystem = "zcmd", withCheckpoint = true }) {
  const storageExplain =
    storage === "mysql"
      ? "Você vai salvar no **MySQL** (mais indicado pra servidor médio/grande)."
      : storage === "dini"
        ? "Você vai salvar em **DINI** (arquivo INI simples)."
        : "Você vai salvar em **DOF2** (arquivo por player).";

  const code = "```pawn\n"
  + "#include <a_samp>\n"
  + (commandSystem === "zcmd" ? "#include <zcmd>\n" : "")
  + "#include <sscanf2>\n"
  + (storage === "dof2" ? "#include <DOF2>\n" : "")
  + "\n"
  + "enum E_PLAYER {\n"
  + "  pJob,\n"
  + "  pFarmCount,\n"
  + "  pCooldown\n"
  + "}\n"
  + "new pInfo[MAX_PLAYERS][E_PLAYER];\n"
  + "\n"
  + "#define JOB_NONE (0)\n"
  + "#define JOB_FAZENDEIRO (1)\n"
  + "\n"
  + "new Float:COLETA_POS[3] = { -383.0, -1426.0, 25.0 };\n"
  + "new Float:ENTREGA_POS[3] = { -77.0, -1136.0, 1.0 };\n"
  + "\n"
  + "stock IsCooldown(playerid) {\n"
  + "  return (pInfo[playerid][pCooldown] > gettime());\n"
  + "}\n"
  + "\n"
  + "public OnPlayerConnect(playerid){\n"
  + "  pInfo[playerid][pJob] = JOB_NONE;\n"
  + "  pInfo[playerid][pFarmCount] = 0;\n"
  + "  pInfo[playerid][pCooldown] = 0;\n"
  + "  return 1;\n"
  + "}\n"
  + "\n"
  + (withCheckpoint
      ? "CMD:emprego(playerid, params[])\n"
        + "{\n"
        + "  SendClientMessage(playerid, -1, \"Empregos: 1) Fazendeiro\");\n"
        + "  SendClientMessage(playerid, -1, \"Use: /pegarjob 1\");\n"
        + "  return 1;\n"
        + "}\n"
        + "\n"
        + "CMD:pegarjob(playerid, params[])\n"
        + "{\n"
        + "  new id;\n"
        + "  if (sscanf(params, \"d\", id)) return SendClientMessage(playerid, -1, \"Use: /pegarjob [1] (Fazendeiro)\");\n"
        + "  if (id != 1) return SendClientMessage(playerid, -1, \"Job inválido.\");\n"
        + "  pInfo[playerid][pJob] = JOB_FAZENDEIRO;\n"
        + "  SendClientMessage(playerid, -1, \"Você virou Fazendeiro! Vá ao checkpoint de coleta.\");\n"
        + "  SetPlayerCheckpoint(playerid, COLETA_POS[0], COLETA_POS[1], COLETA_POS[2], 3.0);\n"
        + "  return 1;\n"
        + "}\n"
        + "\n"
        + "CMD:trabalhar(playerid, params[])\n"
        + "{\n"
        + "  if (pInfo[playerid][pJob] != JOB_FAZENDEIRO) return SendClientMessage(playerid, -1, \"Você não é Fazendeiro.\");\n"
        + "  if (IsCooldown(playerid)) return SendClientMessage(playerid, -1, \"Aguarde o cooldown para trabalhar novamente.\");\n"
        + "  // a coleta/entrega é feita pelo checkpoint\n"
        + "  SendClientMessage(playerid, -1, \"Siga o checkpoint e colete/entregue para ganhar.\");\n"
        + "  return 1;\n"
        + "}\n"
        + "\n"
        + "public OnPlayerEnterCheckpoint(playerid)\n"
        + "{\n"
        + "  if (pInfo[playerid][pJob] != JOB_FAZENDEIRO) return 1;\n"
        + "\n"
        + "  // Se estiver indo coletar\n"
        + "  if (pInfo[playerid][pFarmCount] == 0) {\n"
        + "    pInfo[playerid][pFarmCount] = 1;\n"
        + "    SendClientMessage(playerid, -1, \"Você coletou! Agora entregue no próximo checkpoint.\");\n"
        + "    SetPlayerCheckpoint(playerid, ENTREGA_POS[0], ENTREGA_POS[1], ENTREGA_POS[2], 3.0);\n"
        + "    return 1;\n"
        + "  }\n"
        + "\n"
        + "  // Entrega\n"
        + "  pInfo[playerid][pFarmCount] = 0;\n"
        + "  GivePlayerMoney(playerid, 200);\n"
        + "  pInfo[playerid][pCooldown] = gettime() + 120; // 2 min\n"
        + "  SendClientMessage(playerid, -1, \"Entrega feita! Você ganhou $200. Cooldown: 2 min.\");\n"
        + "  SetPlayerCheckpoint(playerid, COLETA_POS[0], COLETA_POS[1], COLETA_POS[2], 3.0);\n"
        + "  return 1;\n"
        + "}\n"
      : "CMD:trabalhar(playerid, params[])\n"
        + "{\n"
        + "  if (pInfo[playerid][pJob] != JOB_FAZENDEIRO) return SendClientMessage(playerid, -1, \"Você não é Fazendeiro.\");\n"
        + "  if (IsCooldown(playerid)) return SendClientMessage(playerid, -1, \"Aguarde o cooldown.\");\n"
        + "  GivePlayerMoney(playerid, 200);\n"
        + "  pInfo[playerid][pCooldown] = gettime() + 120;\n"
        + "  SendClientMessage(playerid, -1, \"Você trabalhou e ganhou $200 (cooldown 2 min).\");\n"
        + "  return 1;\n"
        + "}\n")
  + "\n"
  + "// SALVAMENTO: aqui você encaixa DOF2/DINI/MySQL (quando você decidir)\n"
  + "```";

  return makeBeginnerFormat({
    title: "Sistema de Emprego: Fazendeiro (iniciante, completo)",
    explain:
      `Vou te entregar um sistema base (bem didático) de **Fazendeiro** com: pegar job, checkpoint (coleta/entrega), salário e cooldown.\n${storageExplain}`,
    steps: [
      "Adicionar includes (a_samp, zcmd, sscanf).",
      "Criar variáveis do player (job, farmCount, cooldown).",
      "Criar comandos (/emprego, /pegarjob, /trabalhar).",
      "Usar checkpoint para coletar e depois entregar.",
      "Dar pagamento e aplicar cooldown pra evitar farm infinito.",
      "Depois você liga salvamento (arquivo ou MySQL)."
    ],
    code,
    commons: [
      "Comando não funciona: faltou #include <zcmd> ou você não usa ZCMD.",
      "params não lê: faltou #include <sscanf2> e o plugin sscanf no server.cfg.",
      "Checkpoint não chama: callback OnPlayerEnterCheckpoint não existe/está duplicada.",
      "Farm infinito: esqueceu cooldown."
    ],
    ask: [
      "Você usa ZCMD ou YCMD?",
      "Quer checkpoint (visual) ou tudo por comando?",
      "Vai salvar em DOF2, DINI ou MySQL?",
      "Qual salário e cooldown você quer?"
    ]
  });
}

function templateLoginSimple({ storage = "dof2" }) {
  const code =
"```pawn\n"
+ "#include <a_samp>\n"
+ "#include <zcmd>\n"
+ "#include <sscanf2>\n"
+ (storage === "dof2" ? "#include <DOF2>\n" : "")
+ "\n"
+ "new bool:gLogged[MAX_PLAYERS];\n"
+ "new gPass[MAX_PLAYERS][64];\n"
+ "\n"
+ "CMD:registrar(playerid, params[])\n"
+ "{\n"
+ "  new senha[64];\n"
+ "  if (sscanf(params, \"s[64]\", senha)) return SendClientMessage(playerid, -1, \"Use: /registrar [senha]\");\n"
+ "  // Aqui você salva a senha (ideal: hash, mas pra iniciante vamos simples)\n"
+ "  format(gPass[playerid], 64, \"%s\", senha);\n"
+ "  SendClientMessage(playerid, -1, \"Registrado! Agora use /login [senha]\");\n"
+ "  return 1;\n"
+ "}\n"
+ "\n"
+ "CMD:login(playerid, params[])\n"
+ "{\n"
+ "  new senha[64];\n"
+ "  if (sscanf(params, \"s[64]\", senha)) return SendClientMessage(playerid, -1, \"Use: /login [senha]\");\n"
+ "  if (strcmp(senha, gPass[playerid], true) != 0) return SendClientMessage(playerid, -1, \"Senha incorreta!\");\n"
+ "  gLogged[playerid] = true;\n"
+ "  SendClientMessage(playerid, -1, \"Logado com sucesso!\");\n"
+ "  return 1;\n"
+ "}\n"
+ "```";

  return makeBeginnerFormat({
    title: "Sistema de Login/Registro (base para iniciantes)",
    explain:
      `Esse é um modelo simples de **/registrar** e **/login**. Depois a gente evolui para salvar em ${storage.toUpperCase()} e usar hash.`,
    steps: [
      "Criar variável gLogged (se está logado).",
      "Criar /registrar para guardar senha.",
      "Criar /login para comparar senha e liberar o player.",
      "Depois ligar salvamento (arquivo ou MySQL) para manter entre reconexões."
    ],
    code,
    commons: [
      "Sem sscanf: o comando não lê senha corretamente.",
      "Sem ZCMD: CMD: não funciona.",
      "Salvar senha pura é inseguro (depois a gente troca por hash)."
    ],
    ask: [
      "Você quer salvar as contas em DOF2, DINI ou MySQL?",
      "Quer sistema com spawn travado até logar (recomendado)?"
    ]
  });
}
// --- Regras didáticas (parece “IA”) ---
function ruleBasedAnswer(messageRaw) {
  const q = norm(messageRaw);

  // 0) Ajuda / menu
  if (q === "ajuda" || q === "/ajuda" || q.includes("o que voce sabe") || q.includes("menu")) {
    return {
      answer:
`Eu sou o tutor SA-MP/Pawn do Portal SiqueiraX.

Você pode pedir:
- **Comandos**: "CMD:siqueirax(...) o que é", "comando /setlevel com sscanf"
- **Callbacks**: "o que é OnPlayerConnect", "pra que serve OnGameModeInit"
- **Plugins/Includes**: "como instalar streamer", "sscanf não funciona"
- **Hospedagem**: "upar gm na lemehost", "server.cfg plugins"
- **Sistemas prontos**: "sistema de emprego fazendeiro", "sistema de login", "sistema de casas"

Dica: se você colar erro + trecho do código, eu corrijo mais rápido.`
    };
  }

  // 1) Comandos CMD:
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

Explicando simples:
- **CMD:nome** → comando /nome
- **playerid** → quem digitou o comando
- **params[]** → o que vem depois do comando
- **return 1;** → comando executado

Quer um exemplo? Diga: "comando /setlevel com sscanf".`
    };
  }

  // 2) Perguntas de "como faz sistema ..."
  const wantsSystem =
    q.includes("como faz") || q.includes("como criar") || q.includes("criar sistema") || q.includes("fazer sistema") || q.includes("sistema de");

  if (wantsSystem && (q.includes("emprego") || q.includes("job"))) {
  const storage = wantsMysql(q) ? "mysql" : (wantsDini(q) ? "dini" : "dof2");
  const withCheckpoint = true;

  const template = templateJobFarmer({ storage, commandSystem: "zcmd", withCheckpoint });

  const hits = searchKb("sistema emprego fazendeiro", 2);
  let extra = "";

  if (hits.length) {
    extra = "\n\n📚 Material de Estudo:\n";
    hits.forEach(h => {
      extra += `\n**${h.title}**\n${h.answer}\n`;
    });
  }

  return { answer: template + extra };
}

  if (wantsSystem && (q.includes("login") || q.includes("registro") || q.includes("registrar") || q.includes("conta"))) {
    const storage = wantsMysql(q) ? "mysql" : (wantsDini(q) ? "dini" : "dof2");
    return { answer: templateLoginSimple({ storage }) };
  }

  // 3) Erros e warnings
  const m = q.match(/\b(error|erro|warning)\s*(\d+)\b/);
  if (m) {
    const code = m[2];
    return {
      answer:
`Você citou **${m[1]} ${code}**.

Pra eu corrigir 100%:
1) cole a linha do erro/warning
2) cole 10–20 linhas do código perto da linha apontada

Dica rápida:
- **error 017**: include faltando / nome errado
- **warning 219**: variável não usada
- **runtime**: geralmente é índice inválido / variável não inicializada`
    };
  }

  // 4) Hospedagem / LemeHost
  if (q.includes("lemehost") || (q.includes("upar") && (q.includes("gm") || q.includes("gamemode")))) {
    return {
      answer:
`Pra **upar gamemode na LemeHost**:
1) Compile e gere **.amx**
2) Envie o **.amx** para **/gamemodes** via FTP
3) No **server.cfg**: \`gamemode0 NomeDoGM 1\`
4) Reinicie no painel

Se não iniciar, me mande:
- print/trecho do server.cfg (gamemode0 + plugins)
- nome do .amx
- log do console (as últimas linhas)`
    };
  }

  // 5) Salvamento (guia de escolha)
  if (q.includes("salvar") || q.includes("salvamento") || q.includes("dof2") || q.includes("dini") || q.includes("mysql")) {
    return {
      answer:
`Salvamento no SA-MP (bem simples):
- **DOF2/DINI (arquivo):** mais fácil pra começar.
- **MySQL:** melhor pra servidor grande/organizado.

Diz pra mim:
1) Você quer DOF2, DINI ou MySQL?
2) Quais dados quer salvar (level, money, skin, etc)?
Que eu te mando um modelo completo (carregar no connect + salvar no disconnect + timer).`
    };
  }

  // 6) Se detectar nome de emprego específico, guia (sem gerar tudo)
  const j = jobName(q);
  if (j && (q.includes("emprego") || q.includes("job"))) {
    return {
      answer:
`Você quer um sistema de emprego **${j}**.

Modelo comum:
1) pegar emprego (comando ou pickup)
2) trabalhar (checkpoint / coleta-entrega)
3) pagar salário + cooldown
4) salvar job no arquivo/banco

Se você disser:
- DOF2/DINI/MySQL
- checkpoint ou comando
eu gero o código completo desse emprego.`
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