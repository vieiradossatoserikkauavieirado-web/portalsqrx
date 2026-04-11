exports.handler = async (event) => {
  try {
    const cookie = event.headers.cookie || "";
    const baseUrl = process.env.URL || "http://localhost:8888";

    /* ===============================
       1) VALIDAR ACESSO VIP
       =============================== */
    const vipCheck = await fetch(`${baseUrl}/.netlify/functions/vip-me`, {
      headers: {
        cookie
      }
    });

    if (!vipCheck.ok) {
      const reason = await vipCheck.text().catch(() => "");
      return {
        statusCode: vipCheck.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        },
        body: JSON.stringify({
          error: reason || "vip_access_denied"
        })
      };
    }

    /* ===============================
       2) SENHAS VIP PROTEGIDAS
       =============================== */
    const senhas = [
      {
        "name": "GM Brasil Play Stars V2",
        "password": "St@rs!2026_V!p#Pr7L$QxMn1t0ry",
        "note": "CMD ADM: /stars2026",
        "tag": "VIP"
      },
      {
        "name": "GM Os Crias Roleplay (2026)",
        "password": "vipos$$criasportalsiqueirax####pre##$$$miumacesseuausa",
        "note": "CMD ADM: /siqueirax",
        "tag": "VIP"
      },
      {
        "name": "Brasil Play City 2026",
        "password": "bpcddjhjdakjdg665###*",
        "note": "/siqueirax",
        "tag": "VIP"
      }
    ];

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify(senhas)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: JSON.stringify({
        error: "server_error"
      })
    };
  }
};