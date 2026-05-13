# Codex CLI local no AraLearn

## 1. Visão geral

O provider `Codex CLI` do AraLearn usa sempre a mesma arquitetura:

- o app fala com um bridge HTTP local;
- o bridge expõe `127.0.0.1`;
- o bridge chama o `Codex CLI` instalado no ambiente local.

Quando o bridge não responde, o app abre uma tela de assistência com diagnóstico, endpoint, script copiável e comando de teste específico para a plataforma detectada.

## 2. Arquitetura

```text
AraLearn
-> http://127.0.0.1:4183/assist
-> Node.js bridge
-> Codex CLI
```

## 3. O que o app espera

- endpoint local em `http://127.0.0.1:4183/assist`;
- rota de saúde em `http://127.0.0.1:4183/health`;
- bridge ativo fora do AraLearn;
- `Codex CLI` já instalado e autenticado no ambiente da plataforma.

## 4. Android

No Android, o setup operacional acontece no Termux.

No AraLearn:

- selecione `Codex CLI`;
- se o bridge não estiver ativo, abra a configuração local;
- toque em `Copiar script para Termux`;
- cole no Termux.

O script do app:

- atualiza pacotes do Termux;
- instala Node.js;
- confere `codex`;
- grava `~/aralearn-codex/aralearnCodexBridge.mjs`;
- define `ARALEARN_CODEX_HOST`, `ARALEARN_CODEX_PORT`, `ARALEARN_CODEX_COMMAND=codex` e token opcional;
- inicia o bridge local.

## 5. Windows

No Windows, o setup operacional acontece no PowerShell.

No AraLearn:

- selecione `Codex CLI`;
- se o bridge não estiver ativo, abra a configuração local;
- toque em `Copiar script PowerShell`;
- cole numa janela do PowerShell;
- mantenha essa janela aberta enquanto usar o provider.

O script do app:

- confere `node`;
- confere `codex.cmd` ou `codex`;
- grava `%USERPROFILE%\aralearn-codex\aralearnCodexBridge.mjs`;
- define `ARALEARN_CODEX_HOST`, `ARALEARN_CODEX_PORT`, `ARALEARN_CODEX_COMMAND=codex.cmd` e token opcional;
- inicia o bridge local.

## 6. Linux

No Linux, o setup operacional acontece no shell da distribuição.

No AraLearn:

- selecione `Codex CLI`;
- se o bridge não estiver ativo, abra a configuração local;
- toque em `Copiar script para Linux`;
- cole no terminal;
- mantenha esse terminal aberto enquanto usar o provider.

O script do app:

- confere `node`;
- confere `codex`;
- grava `~/aralearn-codex/aralearnCodexBridge.mjs`;
- define `ARALEARN_CODEX_HOST`, `ARALEARN_CODEX_PORT`, `ARALEARN_CODEX_COMMAND=codex` e token opcional;
- inicia o bridge local.

## 7. Saúde do bridge

Android e Linux:

```bash
curl http://127.0.0.1:4183/health
```

Com token:

```bash
curl -H "x-aralearn-token: TOKEN" http://127.0.0.1:4183/health
```

Windows PowerShell:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:4183/health'
```

Com token:

```powershell
Invoke-RestMethod -Headers @{ "x-aralearn-token" = "TOKEN" } -Uri 'http://127.0.0.1:4183/health'
```

## 8. Variáveis aceitas pelo bridge

- `ARALEARN_CODEX_HOST`
- `ARALEARN_CODEX_PORT`
- `ARALEARN_CODEX_TOKEN`
- `ARALEARN_CODEX_COMMAND`
- `ARALEARN_CODEX_ARGS`
- `ARALEARN_CODEX_TIMEOUT_MS`
- `ARALEARN_CODEX_MAX_BODY_BYTES`
- `ARALEARN_CODEX_WORKDIR`

## 9. Limitações

- AraLearn não instala automaticamente shell, Node.js nem Codex CLI.
- no Android, o bridge roda fora do APK.
- no Windows e no Linux, o bridge roda fora do navegador.
- o app usa apenas HTTP local em `127.0.0.1`.

## 10. Problemas comuns

- `Bridge local não encontrado`
  Verifique se o bridge está rodando e se o endpoint continua em `127.0.0.1:4183`.

- `Codex CLI não encontrado`
  Instale o Codex CLI no ambiente local da plataforma e confirme `codex --help`.

- `Token local inválido`
  Confirme o valor de `ARALEARN_CODEX_TOKEN` no bridge e o mesmo token na configuração da IA no app.

- `Falha HTTP 404`
  O endpoint deve terminar em `/assist`.

- `Falha HTTP 500`
  Veja o erro textual devolvido pelo bridge; normalmente será falha do próprio `Codex CLI`.
