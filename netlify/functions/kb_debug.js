const fs = require("fs");
const path = require("path");

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    body: JSON.stringify(bodyObj, null, 2),
  };
}

exports.handler = async () => {
  const kbDir = path.join(__dirname, "../../kb");
  let exists = false;
  let files = [];
  let err = null;

  try {
    exists = fs.existsSync(kbDir);
    if (exists) files = fs.readdirSync(kbDir);
  } catch (e) {
    err = String(e?.message || e);
  }

  return json(200, {
    __dirname,
    kbDir,
    exists,
    files,
    err,
  });
};