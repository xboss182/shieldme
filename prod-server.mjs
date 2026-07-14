import { createServer } from "node:http";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile, stat } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MIME = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

const STATIC_DIR = resolve(__dirname, "dist/client");

async function serveStatic(req, res) {
  // Only GET/HEAD for static
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const url = new URL(req.url, "http://localhost");
  const filePath = resolve(STATIC_DIR, "." + url.pathname);
  // Prevent path traversal outside static dir
  if (!filePath.startsWith(STATIC_DIR)) return false;
  try {
    const s = await stat(filePath);
    if (!s.isFile()) return false;
    const ext = extname(filePath).toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const data = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Content-Length", data.length);
    if (req.method !== "HEAD") res.write(data);
    res.end();
    return true;
  } catch {
    return false;
  }
}

async function startServer() {
  const serverPath = resolve(__dirname, "./dist/server/server.js");
  const { default: server } = await import(serverPath);

  const httpServer = createServer(async (req, res) => {
    try {
      // Serve static assets from dist/client first
      if (await serveStatic(req, res)) return;

      // SSR fallthrough
      const url = `http://${req.headers.host || "localhost"}${req.url}`;
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      }

      let body = undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        body = await new Promise((resolveBody, rejectBody) => {
          const chunks = [];
          req.on("data", (chunk) => chunks.push(chunk));
          req.on("end", () => resolveBody(Buffer.concat(chunks)));
          req.on("error", rejectBody);
        });
      }

      const request = new Request(url, { method: req.method, headers, body, duplex: "half" });
      const response = await server.fetch(request, {}, {});
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      res.end();
    } catch (err) {
      console.error("Server error:", err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    }
  });

  const port = process.env.PORT || 3006;
  httpServer.listen(port, "127.0.0.1", () => {
    console.log(`ShieldMail server running on http://127.0.0.1:${port}`);
  });
}

startServer().catch(console.error);
