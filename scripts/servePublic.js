import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readSupabaseRuntimeConfig } from "../src/supabase/runtimeConfig.js";
import { buildAssistAllowedOrigins } from "../src/config/networkOrigins.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const rootArgumentIndex = process.argv.indexOf("--root");
const requestedRoot = rootArgumentIndex >= 0 ? process.argv[rootArgumentIndex + 1] : "";
if (rootArgumentIndex >= 0 && !requestedRoot) {
  throw new Error("Informe o diretório depois de --root.");
}
const artifactMode = Boolean(requestedRoot);
const serverRoot = artifactMode ? path.resolve(repoRoot, requestedRoot) : repoRoot;
const CSP_CONNECT_SOURCE_PLACEHOLDER = "__ARALEARN_CONNECT_SRC__";
if (artifactMode && serverRoot !== path.resolve(repoRoot, ".pages")) {
  throw new Error("O servidor de artefato aceita somente o diretório .pages.");
}

const MIME_BY_EXT = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
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
  const resolved = path.resolve(serverRoot, raw);
  if (resolved !== serverRoot && !resolved.startsWith(serverRoot + path.sep)) {
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

function developmentConfig() {
  return readSupabaseRuntimeConfig({
    supabaseUrl: process.env.ARALEARN_SUPABASE_URL || "",
    supabasePublishableKey: process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "",
    developmentRuntime: true,
    assistAllowedOrigins: buildAssistAllowedOrigins({
      configured: process.env.ARALEARN_ASSIST_ALLOWED_ORIGINS || "",
      development: true
    })
  });
}

function developmentRuntimeConfig() {
  const config = developmentConfig();
  return Buffer.from(
    `globalThis.__ARALEARN_ENV__ ??= Object.freeze(${JSON.stringify({
      supabaseUrl: config.projectUrl,
      supabasePublishableKey: config.publishableKey,
      assistAllowedOrigins: config.assistAllowedOrigins,
      developmentRuntime: true
    }, null, 2)});\n`,
    "utf8"
  );
}

function applyDevelopmentContentSecurityPolicy(data) {
  const source = data.toString("utf8");
  if (!source.includes(CSP_CONNECT_SOURCE_PLACEHOLDER)) return data;
  const config = developmentConfig();
  const connectSource = [
    config.projectUrl ? new URL(config.projectUrl).origin : "",
    ...config.assistAllowedOrigins
  ].filter(Boolean).join(" ");
  return Buffer.from(source.replaceAll(CSP_CONNECT_SOURCE_PLACEHOLDER, connectSource), "utf8");
}

const server = http.createServer(async (req, res) => {
  try {
    const urlPath = new URL(req.url || "/", "http://127.0.0.1").pathname;
    const targetPath = urlPath === "/" ? (artifactMode ? "/index.html" : "/public/index.html") : urlPath;
    if (!artifactMode && targetPath.split("?")[0] === "/runtime-config.js") {
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
      });
      res.end(developmentRuntimeConfig());
      return;
    }
    let resolved = safeResolve(targetPath);
    if (!resolved) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Requisição inválida.");
      return;
    }

    let data = await tryReadFile(resolved);
    if (!artifactMode && !data && targetPath !== "/public/index.html" && !targetPath.startsWith("/public/")) {
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
    if (ext === ".html") data = applyDevelopmentContentSecurityPolicy(data);
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
  console.log(`Servidor local (${artifactMode ? ".pages" : "desenvolvimento"}): http://127.0.0.1:${port}/`);
});
