app.get("/", (req, res) => {
  const ip = req.ip;
  const userAgent = req.headers['user-agent'];
  
  if (/curl|python|wget/i.test(userAgent)) {
    return res.status(403).send("Bloqueado.");
  }

  res.sendFile(__dirname + "/portal.html");
});
