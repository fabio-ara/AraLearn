# Integração local com Codex CLI

O serviço `codex-cli` é uma ponte HTTP local para a assistência bottom-up. Ele
recebe pedidos na própria máquina e os repassa ao Codex CLI. A
interface do AraLearn pode usá-lo como serviço local; no Android, o endereço
precisa ser alcançável pelo WebView.

A resposta é conferida em memória antes de alterar um curso privado próprio ou,
para conta administrativa ou editorial, o curso oficial. A responsabilidade
pelo conteúdo continua sendo da pessoa autora.

## Finalidade

A ponte local recebe uma operação estruturada de revisão do aplicativo,
encaminha a solicitação ao Codex CLI e devolve a resposta para validação. Ela
repara resources ou o card inteiro; nos escopos autorizados de microssequência
e lição, constrói cards ou no máximo uma nova microssequência.

Planejamento e autoria extensa de cursos não passam por esta ponte. Esse
trabalho pertence ao Chatbot personalizado ou ao Plugin.

## Endpoints

Assistência:

```text
http://127.0.0.1:4183/assist
```

Health check:

```text
http://127.0.0.1:4183/health
```

## Modos suportados

- `card_assistance_representation`;
- `card_assistance_build`;
- `card_assistance_resource_repair`;
- `bottom_up_plan_cards`;
- `bottom_up_build_card`;
- `bottom_up_create_microsequence`.

## Executar

Configure primeiro, na interface, um token local de 32 a 512 bytes. O painel de
setup gera o script com o mesmo token, a origem exata do app e os limites do
bridge.

Para executar diretamente pelo repositório, defina ao menos o token e a origem.
Exemplo em PowerShell para desenvolvimento local:

```powershell
$env:ARALEARN_CODEX_TOKEN = "<segredo-local-com-32-bytes-ou-mais>"
$env:ARALEARN_CODEX_ALLOWED_ORIGINS = "http://localhost:8080"
npm run codex:local
```

Use `https://appassets.androidplatform.net` no APK e a origem HTTPS exata no
site publicado. `*`, origem com caminho e HTTP fora de loopback são recusados.

## Configuração do serviço

A interface exige endereço e token local de 32 a 512 bytes. O mesmo token deve
ser enviado pelo app e configurado no bridge; pedido sem token ou com token
divergente é recusado. Esses valores pertencem à configuração local e não são
credenciais administrativas do Supabase.

## Configuração do Codex CLI

A parametrização do Codex CLI não é igual à de APIs como DeepSeek. Em vez de `temperature` e `thinking`, o Codex CLI trabalha com opções próprias, como modelo, perfil e parâmetros definidos no próprio CLI.

A ponte usa um comando fechado `codex exec -`; argumentos arbitrários não são
aceitos. Os tetos de corpo, `stdout`, `stderr` e resposta podem ser reduzidos,
respectivamente, por
`ARALEARN_CODEX_MAX_BODY_BYTES`, `ARALEARN_CODEX_MAX_STDOUT_BYTES`,
`ARALEARN_CODEX_MAX_STDERR_BYTES` e
`ARALEARN_CODEX_MAX_RESPONSE_BYTES`.

Para chamadas `codex exec`, a ponte desativa shell, apps, navegador, controle
do computador, plugins, hooks, memória e subagentes; ignora regras e
configuração do usuário; usa sessão efêmera e sandbox somente de leitura. A
autenticação normal do Codex CLI continua disponível.

## Diferença em relação à API remota

Nos provedores por API, o AraLearn monta uma requisição HTTP para o serviço escolhido. Com Codex CLI, o aplicativo fala com uma ponte local, e essa ponte chama o binário do Codex.

```text
AraLearn -> ponte HTTP local -> Codex CLI -> saída estruturada -> compilação e validação atômica
```

A resposta precisa respeitar os contratos de geração e, quando for exportada, o contrato v4.

## Observações técnicas

- A ponte envia todas as solicitações ao Codex via `stdin`; não grava o prompt
  em arquivo.
- Os arquivos temporários de schema e resposta são removidos antes de concluir
  tanto sucesso quanto falha.
- O schema exato entra no prompt e em `--output-schema`; bridge e provider
  validam novamente a resposta.
- A saída deve ser um único documento JSON completo. Markdown, prefixo,
  sufixo e extração textual não são aceitos.
- A resposta passa pela validação do AraLearn antes de o resultado ser gravado
  e mostrado na própria superfície.
- O uso local não elimina revisão humana.
- O uso local pode reduzir dependência de uma API remota específica, mas não torna a IA automaticamente confiável.

## Segurança e autoria

O Codex CLI é um serviço local de assistência, não um autor. O aplicativo monta
o contexto, pede a saída no formato esperado e valida o fragmento. A autoria
extensa e a publicação remota usam o Chatbot personalizado ou o Plugin; no
catálogo, a autorização editorial permanece separada.
