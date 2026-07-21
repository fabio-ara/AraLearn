# Integração local com Codex CLI

O serviço `codex-cli` é uma ponte HTTP local para pesquisa, desenvolvimento e autoria pessoal. Ele recebe pedidos na própria máquina e os repassa ao Codex CLI. A interface do AraLearn pode usá-lo como serviço local; no Android, o endereço precisa ser alcançável pelo WebView.

A resposta é conferida em memória antes de alterar um curso pessoal. A responsabilidade pelo conteúdo continua sendo da pessoa autora.

## Finalidade

A ponte local recebe uma operação estruturada do aplicativo, encaminha a solicitação ao Codex CLI e devolve a resposta para validação.

Ela oferece modos de planejamento, geração, correção, complemento e continuação usados na autoria da estrutura e na revisão localizada.

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

Depois disso, configure o serviço na interface de assistência do AraLearn usando o endereço local.

## Configuração do serviço

A interface permite informar endereço, token quando usado, modelo, densidade padrão e parâmetros do serviço. Esses valores pertencem à configuração local e não são credenciais administrativas do Supabase.

## Configuração do Codex CLI

A parametrização do Codex CLI não é igual à de APIs como DeepSeek. Em vez de `temperature` e `thinking`, o Codex CLI trabalha com opções próprias, como modelo, perfil e parâmetros definidos no próprio CLI.

A ponte pode receber argumentos por variável de ambiente, por exemplo `ARALEARN_CODEX_ARGS`. Isso permite ajustar como o comando `codex` será executado.

## Diferença em relação à API remota

Nos provedores por API, o AraLearn monta uma requisição HTTP para o serviço escolhido. Com Codex CLI, o aplicativo fala com uma ponte local, e essa ponte chama o binário do Codex.

```text
AraLearn -> ponte HTTP local -> Codex CLI -> texto estruturado -> compilação e validação
```

A resposta precisa respeitar os contratos de geração e, quando for exportada, o contrato v3.

## Observações técnicas

- A ponte envia solicitações ao Codex via `stdin`.
- Quando necessário, pode usar arquivo temporário local para solicitações maiores.
- A resposta passa pela validação do AraLearn antes de alterar linhas da cópia pessoal.
- O uso local não elimina revisão humana.
- O uso local pode reduzir dependência de uma API remota específica, mas não torna a IA automaticamente confiável.

## Segurança e autoria

O Codex CLI é um serviço de geração, não um autor. O aplicativo monta o contexto, pede a saída no formato esperado, valida o fragmento e só então permite aplicá-lo à cópia pessoal. A publicação no catálogo oficial continuará passando por uma área administrativa separada.
