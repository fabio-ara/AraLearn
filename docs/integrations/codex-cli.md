# Codex CLI local

O serviço `codex-cli` permite usar o AraLearn com uma ponte HTTP local, isto é, um pequeno serviço rodando na própria máquina que recebe pedidos do app e os repassa ao Codex CLI. Ele é útil para quem já usa Codex CLI e quer integrar essa ferramenta ao fluxo de autoria e estudo do AraLearn.

Mesmo nesse modo, a regra permanece: o usuário é autor, a IA é ferramenta, e a resposta só entra no projeto depois de validação local.

## Finalidade

A ponte local recebe uma operação estruturada do AraLearn, encaminha o prompt ao Codex CLI e devolve resposta para validação pelo app.

Ela usa os mesmos modos conceituais dos serviços remotos. Planejamento da trilha, geração local, correção, complemento e continuação continuam sendo operações do AraLearn.

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

- `top_down_structure`;
- `top_down_structure_audit`;
- `bottom_up_micro_plan`;
- `bottom_up_card_build`;
- `bottom_up_card_audit`;
- `branch_microsequence_structure`.

## Executar

```bash
npm run codex:local
```

Depois disso, configure o serviço no app usando o endereço local.

## Configuração no app

A interface permite informar endereço, token quando usado, modelo, densidade padrão e parâmetros do serviço.

## Configuração do Codex CLI

A parametrização do Codex CLI não é igual à de APIs como DeepSeek. Em vez de `temperature` e `thinking`, o Codex CLI trabalha com opções próprias, como modelo, perfil e parâmetros definidos no próprio CLI.

A ponte pode receber argumentos por variável de ambiente, por exemplo `ARALEARN_CODEX_ARGS`. Isso permite ajustar como o comando `codex` será executado.

## Diferença em relação à API remota

No uso por API, o AraLearn monta uma requisição HTTP para o serviço escolhido. No uso com Codex CLI, o AraLearn fala com um serviço local, e esse serviço chama o binário do Codex.

```text
AraLearn -> ponte HTTP local -> Codex CLI -> texto estruturado -> compilação e validação AraLearn
```

Do ponto de vista do projeto, a resposta continua precisando respeitar o contrato v3.

## Observações técnicas

- A ponte envia prompts ao Codex via `stdin`.
- Quando necessário, pode usar arquivo temporário local para prompts maiores.
- A resposta passa pela validação do AraLearn antes de entrar no projeto.
- O uso local não elimina revisão humana.
- O uso local pode reduzir dependência de uma API remota específica, mas não torna a IA automaticamente confiável.

## Segurança e autoria

O Codex CLI deve ser tratado como serviço de geração, não como dono da trilha. O app continua responsável por montar contexto, pedir saída textual no formato esperado, compilar a estrutura final, validar a resposta, aplicar os cards à microssequência e permitir revisão pelo usuário.
