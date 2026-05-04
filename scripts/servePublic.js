import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const MIME_BY_EXT = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"]
]);

function safeResolve(requestPath) {
  const decoded = decodeURIComponent(requestPath.split("?")[0]);
  const clean = decoded.replace(/\\/g, "/");
  const raw = clean.startsWith("/") ? clean.slice(1) : clean;
  const resolved = path.resolve(repoRoot, raw);
  if (!resolved.startsWith(repoRoot + path.sep)) {
    return null;
  }
  return resolved;
}

async function tryReadFile(absolutePath) {
  try {
    const data = await fs.readFile(absolutePath);
    return data;
  } catch {
    return null;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = req.url || "/";
    const targetPath = urlPath === "/" ? "/public/index.html" : urlPath;
    let resolved = safeResolve(targetPath);
    if (!resolved) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Requisição inválida.");
      return;
    }

    let data = await tryReadFile(resolved);
    if (!data && targetPath !== "/public/index.html" && !targetPath.startsWith("/public/")) {
      resolved = safeResolve("/public" + (targetPath.startsWith("/") ? targetPath : "/" + targetPath));
      if (resolved) {
        data = await tryReadFile(resolved);
      }
    }

    if (!data) {
      res.writeHead(404, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        Pragma: "no-cache",
        Expires: "0"
      });
      res.end("Arquivo não encontrado.");
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_BY_EXT.get(ext) || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    });
    res.end(data);
  } catch (error) {
    res.writeHead(500, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0"
    });
    res.end("Erro interno: " + String(error && error.message ? error.message : error));
  }
});

const port = Number.parseInt(process.env.PORT || "4182", 10);
server.listen(port, "127.0.0.1", () => {
  console.log(`Servidor local: http://127.0.0.1:${port}/`);
});
