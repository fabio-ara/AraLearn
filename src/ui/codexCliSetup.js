import { buildStandaloneBridgeSource } from "../assist/codexBridgeShared.js";
import { resolveCodexLocalEndpoint, resolveCodexLocalHealthEndpoint } from "../assist/codexLocalAssist.js";

const PLATFORM_ANDROID = "android";
const PLATFORM_WINDOWS = "windows";
const PLATFORM_LINUX = "linux";
const PLATFORM_UNKNOWN = "unknown";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeShellSingleQuotes(value) {
  return String(value || "").replace(/'/g, `'\"'\"'`);
}

function escapePowerShellSingleQuotes(value) {
  return String(value || "").replace(/'/g, "''");
}

function normalizePlatform(platform) {
  const normalized = normalizeText(platform).toLowerCase();
  if (normalized === PLATFORM_ANDROID || normalized === PLATFORM_WINDOWS || normalized === PLATFORM_LINUX) {
    return normalized;
  }
  return PLATFORM_UNKNOWN;
}

export function detectCodexCliSetupPlatform({
  userAgent,
  platform,
  hasAndroidBridge
} = {}) {
  const navigatorObject = typeof globalThis.navigator === "object" ? globalThis.navigator : null;
  const safeUserAgent = normalizeText(userAgent ?? navigatorObject?.userAgent).toLowerCase();
  const safePlatform = normalizeText(
    platform ?? navigatorObject?.userAgentData?.platform ?? navigatorObject?.platform
  ).toLowerCase();
  const androidBridgeAvailable =
    hasAndroidBridge ??
    !!(
      globalThis.AraLearnAndroid ||
      globalThis.AndroidHost ||
      globalThis.AraLearnAndroidImport
    );

  if (androidBridgeAvailable || safeUserAgent.includes("android")) {
    return PLATFORM_ANDROID;
  }
  if (safePlatform.includes("win") || safeUserAgent.includes("windows")) {
    return PLATFORM_WINDOWS;
  }
  if (
    safePlatform.includes("linux") ||
    safePlatform.includes("x11") ||
    safeUserAgent.includes("linux") ||
    safeUserAgent.includes("x11")
  ) {
    return PLATFORM_LINUX;
  }
  return PLATFORM_UNKNOWN;
}

export function getCodexCliSetupPresentation(platform) {
  switch (normalizePlatform(platform)) {
    case PLATFORM_ANDROID:
      return {
        platform: PLATFORM_ANDROID,
        platformLabel: "Android",
        shellLabel: "Termux",
        introText:
          "No APK Android, o AraLearn não pode instalar apps nem executar shell diretamente. Para usar Codex como API local, rode o bridge abaixo no Termux.",
        quickSteps: [
          "Instale ou abra o Termux.",
          "Copie o script abaixo para o Termux.",
          "Aguarde o bridge iniciar em 127.0.0.1.",
          "Volte ao AraLearn e toque em Testar conexão.",
          "Se o status ficar ativo, use o modelo normalmente."
        ],
        copyScriptButtonLabel: "Copiar script para Termux",
        scriptFieldLabel: "Script para colar no Termux",
        healthCommandButtonLabel: "Copiar comando de teste"
      };
    case PLATFORM_WINDOWS:
      return {
        platform: PLATFORM_WINDOWS,
        platformLabel: "Windows",
        shellLabel: "PowerShell",
        introText:
          "No Windows, o AraLearn usa um bridge HTTP local para chamar o Codex CLI no PowerShell. Rode o script abaixo numa janela do PowerShell e mantenha essa janela aberta enquanto usar o provider.",
        quickSteps: [
          "Abra o PowerShell.",
          "Copie e execute o script abaixo.",
          "Mantenha a janela do PowerShell aberta com o bridge ativo.",
          "Volte ao AraLearn e toque em Testar conexão.",
          "Se o status ficar ativo, use o modelo normalmente."
        ],
        copyScriptButtonLabel: "Copiar script PowerShell",
        scriptFieldLabel: "Script para colar no PowerShell",
        healthCommandButtonLabel: "Copiar comando PowerShell de teste"
      };
    case PLATFORM_LINUX:
      return {
        platform: PLATFORM_LINUX,
        platformLabel: "Linux",
        shellLabel: "Shell",
        introText:
          "No Linux, o AraLearn usa um bridge HTTP local para chamar o Codex CLI no terminal. Rode o script abaixo no shell da sua distribuição e mantenha esse terminal aberto enquanto usar o provider.",
        quickSteps: [
          "Abra um terminal.",
          "Copie e execute o script abaixo no shell.",
          "Mantenha o terminal aberto com o bridge ativo.",
          "Volte ao AraLearn e toque em Testar conexão.",
          "Se o status ficar ativo, use o modelo normalmente."
        ],
        copyScriptButtonLabel: "Copiar script para Linux",
        scriptFieldLabel: "Script para colar no shell Linux",
        healthCommandButtonLabel: "Copiar comando de teste"
      };
    default:
      return {
        platform: PLATFORM_UNKNOWN,
        platformLabel: "Plataforma não identificada",
        shellLabel: "Terminal",
        introText:
          "O AraLearn não conseguiu identificar a plataforma atual para o setup do Codex CLI. Revise o endpoint ou abra o app em Android, Windows ou Linux.",
        quickSteps: [
          "Confirme se o endpoint local está correto.",
          "Abra o app em Android, Windows ou Linux.",
          "Use Testar conexão após subir o bridge manualmente."
        ],
        copyScriptButtonLabel: "Copiar script",
        scriptFieldLabel: "Script do bridge local",
        healthCommandButtonLabel: "Copiar comando de teste"
      };
  }
}

export function buildCodexCliHealthCommand({ platform, endpoint, token } = {}) {
  const target = resolveCodexLocalHealthEndpoint(endpoint);
  const trimmedToken = normalizeText(token);
  const safePlatform = normalizePlatform(platform);

  if (safePlatform === PLATFORM_WINDOWS) {
    if (!trimmedToken) {
      return `Invoke-RestMethod -Uri '${target}'`;
    }
    return `Invoke-RestMethod -Headers @{ "x-aralearn-token" = "${trimmedToken}" } -Uri '${target}'`;
  }

  if (!trimmedToken) {
    return `curl ${target}`;
  }
  return `curl -H "x-aralearn-token: ${trimmedToken}" ${target}`;
}

function buildAndroidSetupScript({ assistEndpoint, healthEndpoint, tokenExport, bridgeSource }) {
  return `#!/data/data/com.termux/files/usr/bin/bash
set -u

echo "== AraLearn + Codex CLI no Android =="
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
export ARALEARN_CODEX_COMMAND=codex
${tokenExport}
node "$HOME/aralearn-codex/aralearnCodexBridge.mjs"
`;
}

function buildLinuxSetupScript({ assistEndpoint, healthEndpoint, tokenExport, bridgeSource }) {
  return `#!/usr/bin/env bash
set -euo pipefail

echo "== AraLearn + Codex CLI no Linux =="
echo "Endpoint esperado no app: ${assistEndpoint}"
echo "Health esperado: ${healthEndpoint}"

mkdir -p "$HOME/aralearn-codex"
cd "$HOME/aralearn-codex"

echo
echo "[1/5] Conferindo Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale o Node.js 18+ pela forma oficial da sua distribuição e rode este script novamente."
  exit 1
fi
node --version

echo
echo "[2/5] Conferindo Codex CLI..."
if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI não encontrado. Instale/autentique o Codex CLI pelo método oficial atual da OpenAI e rode este script novamente."
  exit 1
fi

echo
echo "[3/5] Gravando bridge local..."
cat > "$HOME/aralearn-codex/aralearnCodexBridge.mjs" <<'ARALearnCodexBridgeEOF'
${bridgeSource}
ARALearnCodexBridgeEOF

echo
echo "[4/5] Definindo variáveis do bridge..."
export ARALEARN_CODEX_HOST=127.0.0.1
export ARALEARN_CODEX_PORT=4183
export ARALEARN_CODEX_COMMAND=codex
${tokenExport}

echo
echo "[5/5] Iniciando bridge local..."
node "$HOME/aralearn-codex/aralearnCodexBridge.mjs"
`;
}

function buildWindowsSetupScript({ assistEndpoint, healthEndpoint, token, bridgeSource }) {
  const trimmedToken = normalizeText(token);
  const tokenCommand = trimmedToken
    ? `$env:ARALEARN_CODEX_TOKEN = '${escapePowerShellSingleQuotes(trimmedToken)}'`
    : "Remove-Item Env:ARALEARN_CODEX_TOKEN -ErrorAction SilentlyContinue";

  return `$ErrorActionPreference = "Stop"

Write-Host "== AraLearn + Codex CLI no Windows =="
Write-Host "Endpoint esperado no app: ${assistEndpoint}"
Write-Host "Health esperado: ${healthEndpoint}"

$BridgeRoot = Join-Path $env:USERPROFILE "aralearn-codex"
New-Item -ItemType Directory -Force -Path $BridgeRoot | Out-Null
Set-Location $BridgeRoot

Write-Host ""
Write-Host "[1/5] Conferindo Node.js..."
$null = Get-Command node -ErrorAction Stop
node --version

Write-Host ""
Write-Host "[2/5] Conferindo Codex CLI..."
$codexCommand = Get-Command codex.cmd -ErrorAction SilentlyContinue
if (-not $codexCommand) {
  $codexCommand = Get-Command codex -ErrorAction SilentlyContinue
}
if (-not $codexCommand) {
  throw "Codex CLI não encontrado. Instale/autentique o Codex CLI pelo método oficial atual da OpenAI e rode este script novamente."
}

Write-Host ""
Write-Host "[3/5] Gravando bridge local..."
@'
${bridgeSource}
'@ | Set-Content -LiteralPath (Join-Path $BridgeRoot "aralearnCodexBridge.mjs") -Encoding utf8

Write-Host ""
Write-Host "[4/5] Definindo variáveis do bridge..."
$env:ARALEARN_CODEX_HOST = "127.0.0.1"
$env:ARALEARN_CODEX_PORT = "4183"
$env:ARALEARN_CODEX_COMMAND = "codex.cmd"
${tokenCommand}

Write-Host ""
Write-Host "[5/5] Iniciando bridge local..."
node (Join-Path $BridgeRoot "aralearnCodexBridge.mjs")
`;
}

export function buildCodexCliSetupScript({ platform, endpoint, token } = {}) {
  const assistEndpoint = resolveCodexLocalEndpoint(endpoint);
  const healthEndpoint = resolveCodexLocalHealthEndpoint(assistEndpoint);
  const bridgeSource = buildStandaloneBridgeSource();
  const safePlatform = normalizePlatform(platform);
  const tokenExport = normalizeText(token)
    ? `export ARALEARN_CODEX_TOKEN='${escapeShellSingleQuotes(token)}'`
    : "unset ARALEARN_CODEX_TOKEN 2>/dev/null || true";

  if (safePlatform === PLATFORM_ANDROID) {
    return buildAndroidSetupScript({
      assistEndpoint,
      healthEndpoint,
      tokenExport,
      bridgeSource
    });
  }

  if (safePlatform === PLATFORM_WINDOWS) {
    return buildWindowsSetupScript({
      assistEndpoint,
      healthEndpoint,
      token,
      bridgeSource
    });
  }

  if (safePlatform === PLATFORM_LINUX) {
    return buildLinuxSetupScript({
      assistEndpoint,
      healthEndpoint,
      tokenExport,
      bridgeSource
    });
  }

  return `# Plataforma não identificada
# Endpoint esperado: ${assistEndpoint}
# Health esperado: ${healthEndpoint}
# Abra o AraLearn em Android, Windows ou Linux para receber um script específico.`;
}
