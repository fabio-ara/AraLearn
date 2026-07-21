# Codex CLI local

O serviço `codex-cli` é uma ponte HTTP local para pesquisa, desenvolvimento e autoria pessoal. Ele recebe pedidos na própria máquina e os repassa ao Codex CLI. A interface completa do AraLearn pode configurá-lo como provedor local; no Android, seu endereço precisa ser alcançável pelo WebView.

Mesmo nesse modo, a regra permanece: o usuário é responsável pelo conteúdo e a IA é ferramenta. A resposta é compilada e validada em memória antes de gerar patches granulares em um curso pessoal.

## Finalidade

A ponte local recebe uma operação estruturada do aplicativo ou de um harness, encaminha o prompt ao Codex CLI e devolve a resposta para validação técnica.

Ela oferece modos de planejamento, geração, correção, complemento e continuação usados pelos fluxos top-down e bottom-up.

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

Depois disso, configure o serviço na interface de assistência do AraLearn usando o endereço local. Um harness também pode consumir a mesma ponte sem persistir resultados.

## Configuração do harness

A interface permite informar endereço, token quando usado, modelo, densidade padrão e parâmetros do serviço. Esses valores são configuração local do usuário e não uma credencial administrativa do Supabase.

## Configuração do Codex CLI

A parametrização do Codex CLI não é igual à de APIs como DeepSeek. Em vez de `temperature` e `thinking`, o Codex CLI trabalha com opções próprias, como modelo, perfil e parâmetros definidos no próprio CLI.

A ponte pode receber argumentos por variável de ambiente, por exemplo `ARALEARN_CODEX_ARGS`. Isso permite ajustar como o comando `codex` será executado.

## Diferença em relação à API remota

Nos provedores por API, o AraLearn monta uma requisição HTTP para o serviço escolhido. Com Codex CLI, o aplicativo fala com uma ponte local, e essa ponte chama o binário do Codex.

```text
AraLearn -> ponte HTTP local -> Codex CLI -> texto estruturado -> compilação e validação
```

A resposta continua precisando respeitar os contratos experimentais e, quando materializada como artefato de intercâmbio, o contrato v3.

## Observações técnicas

- A ponte envia prompts ao Codex via `stdin`.
- Quando necessário, pode usar arquivo temporário local para prompts maiores.
- A resposta passa pela validação do AraLearn antes de alterar linhas da cópia pessoal.
- O uso local não elimina revisão humana.
- O uso local pode reduzir dependência de uma API remota específica, mas não torna a IA automaticamente confiável.

## Segurança e autoria

O Codex CLI deve ser tratado como serviço de geração, não como autor. O aplicativo monta o contexto, pede saída textual no formato esperado, compila e valida o fragmento e só então permite aplicá-lo à cópia pessoal. A publicação futura no catálogo oficial continuará exigindo uma API administrativa separada, ainda inexistente.
