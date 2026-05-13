import { buildStandaloneBridgeSource } from "../assist/codexBridgeShared.js";
import { resolveCodexLocalEndpoint, resolveCodexLocalHealthEndpoint } from "../assist/codexLocalAssist.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeShellSingleQuotes(value) {
  return String(value || "").replace(/'/g, `'\"'\"'`);
}

export function buildCodexTermuxHealthCommand({ endpoint, token } = {}) {
  const target = resolveCodexLocalHealthEndpoint(endpoint);
  const trimmedToken = normalizeText(token);
  if (!trimmedToken) {
    return `curl ${target}`;
  }
  return `curl -H "x-aralearn-token: ${trimmedToken}" ${target}`;
}

export function buildCodexTermuxSetupScript({ endpoint, token } = {}) {
  const assistEndpoint = resolveCodexLocalEndpoint(endpoint);
  const healthEndpoint = resolveCodexLocalHealthEndpoint(assistEndpoint);
  const trimmedToken = normalizeText(token);
  const bridgeSource = buildStandaloneBridgeSource();
  const tokenExport = trimmedToken
    ? `export ARALEARN_CODEX_TOKEN='${escapeShellSingleQuotes(trimmedToken)}'`
    : 'unset ARALEARN_CODEX_TOKEN 2>/dev/null || true';

  return `#!/data/data/com.termux/files/usr/bin/bash
set -u

echo "== AraLearn + Codex CLI via Termux =="
echo "Endpoint esperado no app: ${assistEndpoint}"
echo "Health esperado: ${healthEndpoint}"

mkdir -p "$HOME/aralearn-codex"
cd "$HOME/aralearn-codex" || exit 1

echo
echo "[1/6] Atualizando pacotes do Termux..."
pkg update -y

echo
echo "[2/6] Instalando Node.js..."
pkg install nodejs -y

echo
echo "[3/6] Conferindo Node.js..."
node --version || exit 1

echo
echo "[4/6] Conferindo Codex CLI..."
if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI não encontrado. Instale/autentique o Codex CLI pelo método oficial atual da OpenAI e rode este script novamente."
  exit 1
fi

echo
echo "[5/6] Gravando bridge local..."
cat > "$HOME/aralearn-codex/aralearnCodexBridge.mjs" <<'ARALearnCodexBridgeEOF'
${bridgeSource}
ARALearnCodexBridgeEOF

echo
echo "[6/6] Iniciando bridge local..."
export ARALEARN_CODEX_HOST=127.0.0.1
export ARALEARN_CODEX_PORT=4183
${tokenExport}
node "$HOME/aralearn-codex/aralearnCodexBridge.mjs"
`;
}

