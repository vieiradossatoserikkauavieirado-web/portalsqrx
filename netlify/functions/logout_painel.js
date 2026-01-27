exports.handler = async () => {
  // apaga cookie no navegador
  const clear = "sx_painel_session=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0"

  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": clear,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain",
    },
    body: "ok",
  }
}
