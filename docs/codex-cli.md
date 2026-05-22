# Codex CLI local

O provider `codex-cli` permite usar o AraLearn com um bridge HTTP local. Ele é útil para quem já usa Codex CLI e quer integrar essa ferramenta ao fluxo de autoria e estudo do AraLearn sem depender, necessariamente, de comprar créditos de API de outro provider.

Mesmo nesse modo, a regra do AraLearn permanece a mesma: o usuário é o autor, a IA é ferramenta, e a resposta só entra no projeto depois de validação local.

## Finalidade

O bridge local recebe uma operação estruturada do AraLearn, encaminha o prompt ao Codex CLI e devolve uma resposta para validação pelo app.

Ele usa os mesmos modos esperados pelos providers remotos. Isso preserva a arquitetura de geração: planejamento da trilha, materialização local, correção, complemento e continuação continuam sendo operações do AraLearn.

## Endpoints

Endpoint de assistência:

```text
http://127.0.0.1:4183/assist
```

Health check:

```text
http://127.0.0.1:4183/health
```

## Modos suportados

- `plan-scope`;
- `generate-microsequence`;
- `improve-microsequence`;
- `add-practice`;
- `create-support`;
- `generate-next`.

## Executar

```bash
npm run codex:local
```

Depois disso, configure o provider no app usando o endpoint local.

## Configuração no app

A interface do AraLearn permite informar:

- endpoint;
- token, quando usado;
- modelo;
- densidade padrão;
- demais parâmetros do provider.

## Configuração do Codex CLI

A parametrização do Codex CLI não é igual à de APIs como DeepSeek. Em vez de `temperature` e `thinking`, o Codex CLI trabalha com opções próprias, como modelo, perfil e parâmetros de raciocínio configurados no próprio CLI.

O bridge pode ser chamado com argumentos definidos por variável de ambiente, por exemplo `ARALEARN_CODEX_ARGS`. Isso permite ajustar como o comando `codex` será executado.

## Diferença em relação à API remota

No uso por API, o AraLearn monta uma requisição HTTP para o provider escolhido. No uso com Codex CLI, o AraLearn fala com um serviço local, e esse serviço chama o binário do Codex.

```text
AraLearn -> bridge HTTP local -> Codex CLI -> JSON -> validação AraLearn
```

Essa diferença é operacional. Do ponto de vista do projeto, a resposta continua precisando respeitar o contrato.

## Observações técnicas

- O bridge envia prompts ao Codex via `stdin`.
- Quando necessário, o bridge pode usar arquivo temporário local para prompts maiores.
- A resposta ainda passa pela validação do AraLearn antes de entrar no projeto.
- O uso local não elimina a necessidade de revisar o conteúdo gerado.
- O uso local pode reduzir dependência de uma API remota específica, mas não torna a IA automaticamente confiável.

## Segurança e autoria

O Codex CLI deve ser tratado como provider de geração, não como dono da trilha. O app continua responsável por:

- montar o contexto correto;
- pedir JSON válido;
- validar a resposta;
- preservar versão anterior quando algo falha;
- permitir revisão pelo usuário.

O usuário continua responsável por aceitar, corrigir, descartar ou estudar o material produzido.
