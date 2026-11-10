"use strict";
// Tiny static server, no dependencies. Serves /public, lists optional farm photos and sounds.
const http = require("http");
const fs = require("fs");
const path = require("path");

const PUBLIC = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
  ".wav": "audio/wav", ".ogg": "audio/ogg",
};

function list(dir, exts) {
  try {
    return fs.readdirSync(path.join(PUBLIC, dir)).filter((f) => exts.includes(path.extname(f).toLowerCase()));
  } catch { return []; }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/healthz") { res.writeHead(200); return res.end("ok"); }
  if (url.pathname === "/api/assets") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({
      sounds: list("sounds", [".mp3", ".m4a", ".wav", ".ogg"]),
      photos: list("photos", [".jpg", ".jpeg", ".png", ".webp"]),
    }));
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    const ext = path.extname(file).toLowerCase();
    const code = [".html", ".js", ".css"].includes(ext);
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": code ? "no-cache" : "public, max-age=86400",
    });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, () => console.log("Ozzy’s Farm Studio on port " + PORT));
}
module.exports = server;
