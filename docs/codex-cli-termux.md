# Codex CLI via Termux no AraLearn

## 1. Visão geral

O AraLearn APK não executa o Codex CLI diretamente.

No Android, o fluxo suportado é:

- o AraLearn roda como APK/WebView;
- o Termux roda separadamente;
- um bridge local em Node.js expõe HTTP em `127.0.0.1`;
- o AraLearn chama esse bridge por HTTP local.

Quando o bridge não responde, o app abre uma tela de assistência com diagnóstico, endpoint, script copiável e comandos de teste.

## 2. Arquitetura

```text
AraLearn APK/WebView
-> http://127.0.0.1:4183/assist
-> Termux
-> Node.js bridge
-> Codex CLI
```

## 3. Limitações

- AraLearn não instala Termux automaticamente.
- AraLearn não executa shell diretamente.
- Codex CLI precisa estar instalado/autenticado no Termux.
- O bridge precisa estar rodando.
- O suporte atual cobre geração top-down.
- O suporte atual cobre geração de microssequências de lição.
- O suporte atual cobre geração de cards no workbench da microssequência.
- O suporte atual cobre edição de cards no workbench.
- Anexos textuais podem ser enviados inline ao bridge local.
- Anexos binários ou formatos não textuais entram apenas como metadados neste fluxo inicial.

## 4. Instalar Termux

Use uma versão atual do Termux.

Evite builds antigas com repositórios quebrados ou pacotes defasados.

## 5. Preparar Termux

```bash
pkg update
pkg upgrade
pkg install nodejs git
node --version
npm --version
```

## 6. Codex CLI

Se `codex --help` funciona, pule esta etapa.

Se não funciona, instale o Codex CLI pelo método oficial atual da OpenAI.

Não fixe aqui um comando que possa envelhecer rápido.

```bash
codex --help
```

## 7. Configuração pelo AraLearn

- No AraLearn, selecione `Codex CLI · Termux`.
- Se o bridge não responder, o app abre a tela de configuração.
- Toque em `Copiar script para Termux`.
- Cole no Termux.
- Volte ao AraLearn e toque em `Testar conexão`.

## 8. Configuração manual

O script copiado pelo app:

- cria `~/aralearn-codex`;
- grava `~/aralearn-codex/aralearnCodexBridge.mjs`;
- inicia o servidor em `127.0.0.1:4183`.

O bridge também pode ser testado manualmente no desktop com:

```bash
npm run codex:local
```

## 9. Testar bridge

Sem token:

```bash
curl http://127.0.0.1:4183/health
```

Com token:

```bash
curl -H "x-aralearn-token: TOKEN" http://127.0.0.1:4183/health
```

## 10. Usar no AraLearn

Configuração básica:

- Modelo: `Codex CLI · Termux`
- Endpoint: `http://127.0.0.1:4183/assist`

O token é opcional, mas recomendado quando o bridge estiver exposto a cenários menos controlados.

Fluxos suportados no provider local:

- gerar estrutura top-down;
- gerar microssequências draft de uma lição;
- gerar ou substituir cards de uma microssequência pelo painel de assistência;
- editar um card existente pelo painel de assistência.

## 11. Automatizar inicialização

Uma opção simples é criar `~/start-aralearn-codex.sh` e rodar esse script antes de abrir o AraLearn:

```bash
#!/data/data/com.termux/files/usr/bin/bash
cd ~/aralearn-codex
export ARALEARN_CODEX_PORT=4183
export ARALEARN_CODEX_COMMAND=codex
node aralearnCodexBridge.mjs
```

Depois:

```bash
chmod +x ~/start-aralearn-codex.sh
~/start-aralearn-codex.sh
```

`Termux:Boot` pode ajudar, mas é opcional e não faz parte do fluxo obrigatório.

## 12. Problemas comuns

- `/health` não responde.
  Verifique se o bridge está rodando e se o endpoint continua em `127.0.0.1:4183`.
- `codex` não encontrado.
  Instale o Codex CLI no Termux e confirme `codex --help`.
- O Codex pede login.
  Autentique o CLI pelo fluxo oficial atual antes de iniciar o bridge.
- O comando não interativo do Codex mudou.
  Ajuste `ARALEARN_CODEX_ARGS`. O default atual do bridge é `exec {prompt}`.
- O APK bloqueia HTTP local.
  O wrapper Android deste repositório foi ajustado para permitir cleartext local em `127.0.0.1` e `localhost`. Se você usar outro wrapper, replique essa configuração.
- Token incorreto.
  Confirme o valor de `ARALEARN_CODEX_TOKEN` no Termux e o mesmo token na configuração da IA no app.

## 13. Segurança

- O bridge escuta em `127.0.0.1` por padrão.
- Não use `0.0.0.0` sem entender os riscos.
- Token local é opcional, mas recomendado.
- Não cole material sensível sem necessidade.
