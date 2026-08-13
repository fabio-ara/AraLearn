# Fluxos e contratos de geração

O AraLearn separa duas fronteiras de autoria:

- Chatbot ou Plugin lê e reorganiza cursos, módulos, lições,
  microssequências e cards em workspaces compostos;
- a assistência local por API atua somente nos alvos selecionados em cards,
  microssequências ou lições.

Cada chamada usa schema fechado. A resposta do serviço nunca é gravada
diretamente: primeiro é compilada e validada em memória; depois, a mudança
inteira é confirmada em uma transação. Essa garantia é invisível na interface.

No manifesto, `atomic-card-assistance` nomeia o fluxo local por API.
`atomic-resource-authoring` nomeia separadamente a consulta de contratos e as
mutações de workspace pelo Chatbot ou Plugin. Uma capacidade não é alias nem
fallback da outra.

## Assistência bottom-up por API

O ponto de partida é sempre a seleção visível. Ela define a autoridade máxima
da chamada; a instrução pode escolher uma operação dentro desse limite, mas
não pode alcançar outro alvo.

| Nível | Seleção | Operações máximas |
| --- | --- | --- |
| Card | Instâncias de packages | `edit_text` nos caminhos textuais selecionados |
| Card | Card inteiro | `edit_text`, `recompose_card` ou `restore_version` |
| Microssequência | Alguns cards | Atualizar, remover ou mover os cards selecionados |
| Microssequência | Todos os cards | As anteriores e criar cards nessa microssequência |
| Lição | Uma microssequência | Alterar seus cards e criar cards dentro dela |
| Lição | Algumas microssequências | Alterar somente as subárvores selecionadas |
| Lição | Todas as microssequências | As anteriores e criar uma microssequência na lição |

Microssequência ou lição vazia pode ser selecionada como recipiente para
receber o primeiro filho. Cada chamada no recipiente de lição cria no máximo
uma microssequência. Não há assistência local em módulo ou curso, nem criação
de microssequência a partir do nível de card ou de microssequência.

Selecionar todos os filhos concede autoridade sobre o recipiente, mas não
obriga uma criação. A operação efetiva continua sendo determinada pelo pedido
dentro das permissões calculadas.

Não existe pipeline local para planejar ou gerar a árvore inteira. Leitura,
combinação e movimentação de partes maiores entre cursos ocorrem por MCP.

### Contexto somente leitura

O pacote de contexto contém:

- caminho hierárquico, objetivos e guias;
- `topics`, `covers`, `checks`, `errors` e `dependsOn` relevantes;
- `guide.exclude` e `guide.avoid` sem truncamento;
- ordem e índices locais;
- vizinhos anteriores e posteriores limitados;
- índice compacto da lição.

Somente a seleção aparece como gravável. O restante existe para preservar
coerência e não pode ser alterado. Curso completo, credenciais, instrução,
contexto e resposta do serviço não são persistidos junto ao conteúdo.

A primeira fase escolhe a operação usando apenas pedido e autoridade, sem
cards, guides ou outros textos recuperados. Seu enum inclui `unsupported`,
portanto um pedido incompatível com a seleção falha sem ser convertido na
única mutação disponível. Remoção e movimento só entram no enum quando o
pedido liga explicitamente o verbo à entidade selecionada; menções a remover
redundância ou mover texto permanecem reparos de conteúdo.

### Edição de card por conversa

Cada instância de package recebe uma identidade de alvo:

- `content:<id>` para uma instância de representação;
- `response:<id>` para a instância de resposta;
- `feedback:<id>` para uma instância de explicação posterior.

Em `edit_text`, o valor de cada alvo existe em `writableTargets` com seu caminho
textual fechado e é omitido do card em `readOnlyContext`; instâncias irmãs
permanecem nessa representação para coerência, sem autoridade de escrita. O
serviço devolve somente os pares de caminho e valor que deseja alterar.

```json
{
  "message": "Tornei a explicação autocontida.",
  "edits": [
    {
      "path": "content[0].data.text",
      "value": "Exemplo corrigido e autocontido."
    }
  ]
}
```

O compilador aplica o patch ao card congelado e prova que ele reconstrói
exatamente o resultado proposto. Identidades, packages, versões, estrutura,
respostas formais e posição não podem mudar nessa operação. Selecionar o card
inteiro amplia os caminhos textuais graváveis, mas uma troca de representação
exige `recompose_card`.

A conversa conserva até oito turnos e nove versões exatas do card durante a
sessão. Cada turno seguinte recebe apenas a ancestralidade ativa. `no-op`
preserva a explicação do assistente sem criar versão; falha não entra na
conversa. `restore_version` move o cursor para um snapshot existente sem nova
chamada ao provider. Pedido, resposta e versões não são persistidos.

### Cards e microssequências

Recompor um card inteiro usa duas etapas curtas:

1. `card_assistance_representation` escolhe no catálogo uma composição com uma
   ou mais instâncias de conteúdo e, na prática, uma resposta compatível;
2. `card_assistance_build` recebe somente os contratos exatos da composição
   escolhida e constrói o card autorizado.

A representação atual é preferida quando a instrução não exige troca. Criar
cards é uma operação distinta e só ocorre quando a seleção concedeu autoridade
sobre uma microssequência. `bottom_up_plan_cards` planeja posições e
representações; `bottom_up_build_card` constrói cada card com seu schema exato.
O AraLearn aloca identidades e posições, e o serviço preenche somente o
conteúdo. No recipiente de lição, `bottom_up_create_microsequence` cria no
máximo uma microssequência por envio.

Quando uma lição autoriza criar cards dentro de exatamente uma
microssequência, `bottom_up_plan_cards` recebe também um índice readonly dos
cards do destino, com índice e posição explícitos. O índice orienta
`insertIndex`, mas não transforma cards existentes em alvos graváveis.

No nível de microssequência, cards não selecionados preservam identidade,
conteúdo e ordem relativa. No nível de lição, microssequências não selecionadas
também permanecem idênticas. Criar uma microssequência altera somente a nova
subárvore e as posições estritamente necessárias das irmãs.

Lacunas usam `targetInstanceId` e `targetPath`. O compilador resolve o alvo no
envelope de card; não há marcador em prosa, parser de HTML ou campo numerado.

## Validação e confirmação invisíveis

O envio congela a revisão, o fingerprint e a autoridade da seleção. Uma falha
estrutural permite no máximo uma repetição do mesmo alvo com o diagnóstico do
validador. O pipeline não troca silenciosamente de serviço, modelo,
representação ou escopo.

Antes de confirmar, o AraLearn valida:

- o envelope com `role`, `content`, `response` e `feedback`;
- cada `{ id, package, version, data }` segundo seu slot e schema exato;
- identidades, posições e dependências;
- lacunas e opções de resposta;
- `responseCompatibility`, `practiceTargets` e referências internas;
- o contrato integral do fragmento resultante;
- a ausência de alterações fora da autoridade selecionada.

Se o conteúdo ou a revisão mudar durante a chamada, o resultado é recusado. Se
continuar vigente, o servidor ou repositório local confirma o change set em
uma única transação e a própria superfície renderizada mostra o resultado, sem
etapa intermediária ou painel de validação.

No card, **Desfazer**, **Refazer** e a restauração percorrem o histórico volátil
da conversa. Uma nova edição depois de desfazer abre um ramo ativo e descarta o
refazer abandonado. Esse histórico não é cópia do curso nem substitui a
proveniência autoral.

## Autoridade do conteúdo

A autorização é calculada a partir da sessão vigente:

- a pessoa pode editar manualmente ou por API seu curso privado;
- curso oficial é somente leitura para conta comum;
- conta administrativa ou editorial pode editar o curso oficial;
- curso privado de outra pessoa não é editável neste recorte;
- cache ou capacidade desconhecida sempre resulta em somente leitura.

Uma alteração privada permanece na identidade privada. Uma alteração oficial
autorizada mantém a continuidade oficial. Não existe fork automático do curso
de Coleções. Elevar um curso privado ao catálogo é uma operação de autoria
externa pelo Chatbot ou Plugin com MCP.

## Linguagem formal da autoria externa

A autoria por workspace usa diretamente o envelope de packages versionados. O
agente primeiro escolhe pelo catálogo, carrega somente os contratos exatos e
preenche seus campos; não existe tradução de um contrato monolítico anterior.
O compilador confere slots, schemas, referências, posições, lacunas e
compatibilidades antes da gravação.

O workspace remoto pode organizar partes maiores e produzir uma publicação
privada incompleta para teste. No chat, a revisão conceitual pode mostrar
somente as microteorias e a quantidade de práticas. Consulte [Gateway MCP de
autoria](autoria-mcp.md).

A escala técnica e a escala da conversa são diferentes. Uma alteração é
confirmada atomicamente, enquanto uma etapa conversacional pode reunir várias
microssequências. Chatbot ou Plugin pode salvar o planejamento, materializar a
parte solicitada, auditá-la e repará-la em rodadas distintas. Essa disciplina
vive nas instruções e no conhecimento recuperado, não numa trava de schema.

O workspace não é salvo como cópia integral a cada comando. O executor envia
ao banco somente as partes atingidas, e o servidor recompõe e valida o
documento antes de confirmar a revisão corrente. Copiar cria identidades novas;
mover transfere a parte atual e a retira da origem.

## Instruções curtas e conhecimento sob demanda

O fluxo externo separa três responsabilidades:

- instruções curtas mantêm o procedimento estável;
- `prepararAutoriaAraLearn` recupera até oito unidades relevantes para a
  intenção e o nível estrutural;
- a única `consultarBibliotecaDeResources` conduz a descoberta e a verificação
  progressivas sob `aralearn.resource-library.v1`.

O agente usa `explore` para conhecer famílias e facetas, `search` para buscar
pela intenção, `inspect` para comparar até oito perfis e `contracts` para
carregar no máximo quatro versões exatas por chamada. Só então compõe o card,
executa `validate_card` e usa `audit_representation` para distinguir
`semantic_fit`, `response_affordance` e `feedback_legibility` antes de salvar.
Não existe chamada de lista global nem contrato que reúna todos os schemas.

`search` classifica a cobertura como `canonical`, `versatile` ou `substitute`.
Um `substitute` não é erro nem bloqueio: o agente prossegue com o melhor
candidato, comunica brevemente o `chatDisclosure` e preserva a representação
ideal numa decisão autoral. `preview_card` devolve um descritor com
`rendered: false`; não produz screenshot nem simula o renderer do aplicativo.

A recuperação é lexical e determinística. Não usa embedding remoto, banco
vetorial nem texto integral da conversa. Esse RAG leve reduz contexto e evita
pedir ao modelo que memorize os campos dos packages instalados. O modelo
decide conteúdo e representação; operações focadas, schemas e validadores
decidem o que pode ser salvo.

O mesmo assistente pode criar conteúdo privado, enviá-lo à avaliação e atuar
no catálogo conforme as capacidades da conta conectada. Não existe um GPT
administrativo separado. O percurso completo está em [Criar cursos pelo
chat](criar-cursos-pelo-chat.md).

## Responsabilidade autoral

Saída estruturada reduz ambiguidade, mas não torna o conteúdo correto por si
só. A pessoa continua responsável pela revisão pedagógica e factual. A
publicação no catálogo permanece sujeita à validação e à capacidade editorial.
