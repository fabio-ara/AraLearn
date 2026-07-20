# Codex CLI local — harness de pesquisa

O serviço `codex-cli` é uma ponte HTTP local preservada para harnesses de pesquisa e desenvolvimento. Ele recebe pedidos técnicos na própria máquina e os repassa ao Codex CLI. Não faz parte do runtime estudantil, não aparece na aplicação web ou no APK e não grava no Supabase operacional.

Mesmo nesse modo experimental, a regra permanece: o pesquisador é responsável pelo conteúdo e a IA é ferramenta. A resposta produz apenas um artefato validável em memória; não gera mutações na conta de um estudante.

## Finalidade

A ponte local recebe uma operação estruturada de um harness, encaminha o prompt ao Codex CLI e devolve a resposta para validação técnica.

Ela conserva modos experimentais de planejamento, geração, correção, complemento e continuação. Esses modos não são operações disponíveis ao estudante.

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

Depois disso, um harness ou cliente técnico pode usar o endereço local. O aplicativo estudantil atual não oferece configuração desse serviço.

## Configuração do harness

Clientes técnicos podem informar endereço, token quando usado, modelo, densidade padrão e parâmetros do serviço. Nenhuma dessas opções é exposta na interface estudantil.

## Configuração do Codex CLI

A parametrização do Codex CLI não é igual à de APIs como DeepSeek. Em vez de `temperature` e `thinking`, o Codex CLI trabalha com opções próprias, como modelo, perfil e parâmetros definidos no próprio CLI.

A ponte pode receber argumentos por variável de ambiente, por exemplo `ARALEARN_CODEX_ARGS`. Isso permite ajustar como o comando `codex` será executado.

## Diferença em relação à API remota

Nos harnesses por API, o cliente técnico monta uma requisição HTTP para o serviço escolhido. Com Codex CLI, o harness fala com um serviço local, e esse serviço chama o binário do Codex.

```text
harness -> ponte HTTP local -> Codex CLI -> texto estruturado -> compilação e validação
```

A resposta continua precisando respeitar os contratos experimentais e, quando materializada como artefato de intercâmbio, o contrato v3.

## Observações técnicas

- A ponte envia prompts ao Codex via `stdin`.
- Quando necessário, pode usar arquivo temporário local para prompts maiores.
- A resposta passa pela validação do harness e não altera linhas do runtime estudantil.
- O uso local não elimina revisão humana.
- O uso local pode reduzir dependência de uma API remota específica, mas não torna a IA automaticamente confiável.

## Segurança e autoria

O Codex CLI deve ser tratado como serviço experimental de geração, não como autor. O harness monta o contexto, pede saída textual no formato esperado, compila e valida um artefato para revisão humana. Aplicação de cards e publicação futura exigirão uma API administrativa separada, ainda inexistente.
