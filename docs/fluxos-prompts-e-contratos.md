# Fluxos, instruções e contratos

Um modelo de linguagem recebe texto e produz uma saída probabilística. O
AraLearn precisa preservar identidades, relações, permissões, revisões e fatos
de forma determinística. A fronteira entre os dois mundos é explícita:
linguagem natural expressa intenção; comandos fechados descrevem a mudança;
domínio e PostgreSQL decidem o que pode ser gravado.

## Conceitos básicos

Uma **instrução** estabelece comportamento estável. Um **prompt** reúne o
pedido de uma chamada, o contexto necessário e o formato esperado. Nenhum dos
dois concede autorização.

**Contexto** é informação somente para leitura: objetivo, plano, desenho
efetivo, posição curricular, conteúdo vizinho e versões. O cliente não pode
transformar um trecho do contexto em alvo gravável apenas porque o recebeu.

Um **schema** delimita forma. Um **contrato** acrescenta significado,
autoridade, versões e invariantes. Um **envelope** transporta conteúdo e
metadados segundo o contrato. JSON válido não é, por si, uma mudança válida.

## Uma autoridade, duas formas de interação

A interface visual e um cliente MCP operam o mesmo Curso vivo. Elas não mantêm
documentos paralelos nem convertem uma conversa em publicação.

- Na interface, a pessoa edita campos naturais, escolhe escopos, valores e
  componentes e inspeciona o resultado.
- No MCP, a pessoa descreve a intenção em conversa; o cliente lê a mesma
  projeção e envia o mesmo tipo de comando ao executor autoral.

As duas formas convergem nas mesmas RPCs owner-only, no mesmo CAS, nos mesmos
recibos e nos mesmos eventos. O canal `application|mcp` é registrado como fato
de transporte, não como regra diferente de autorização.

## Selecionar somente o contexto necessário

`lerCurso` oferece vistas delimitadas:

- `summary`: identidade e cabeçalho;
- `outline`: hierarquia compacta;
- `instructional_plan`: plano, Partes, vínculos e atividade recente;
- `course_design`: parâmetros, orientações e política no escopo escolhido;
- `part_materialization`: tentativa retomável e suas etapas;
- `study_units`: Inspeção paginada em ordem curricular;
- `entities`: página estrutural sob revisão fixada.

Carregar o Curso inteiro por conveniência aumenta custo e contexto sem ampliar
autoridade. A leitura escolhida deve corresponder à decisão ou ao lote em
preparação.

## Planejamento e desenho são estados distintos

O plano instrucional conserva título e objetivo projetados da raiz do Curso,
público, escopo, resultados pretendidos, unidades de análise, requisitos de
evidência e Partes. Ele responde **o que** se pretende cobrir e como a produção
foi agrupada.

A ligação entre esse plano e a produção é explícita: cada Microssequência pode
receber várias unidades de análise e requisitos de evidência, e cada um desses
itens pode servir a vários alvos. A atribuição não é inferida da Parte nem
copiada para todas as Microssequências.

O desenho por escopo conserva:

- quatro parâmetros pedagógicos operacionalizados;
- revisões originais de orientação natural e interpretações separadas;
- política de componentes vinculada a uma revisão exata do catálogo.

Ele responde **quais decisões** precisam reger a materialização naquele alvo.
Não há `brief`, blueprint, ResourceSet ou snapshot declarado pelo cliente como
autoridade paralela.

## Resolver parâmetros sem esconder proveniência

Cada parâmetro possui definição versionada, schema, default de produto,
limitações, referências de base e escopos admitidos. O valor efetivo segue:

1. atribuição explícita `author|research_condition` mais próxima;
2. atribuição `automatic` mais próxima;
3. `system_default`.

`research_condition` registra proveniência e não bloqueia edição. Uma decisão
explícita do autor no alvo pode substituí-la. `automatic` exige valor explícito
e justificativa breve; nunca apaga silenciosamente uma decisão explícita.

Limpar uma atribuição remove somente a decisão local. Herança e default são
projeções calculadas, não linhas copiadas.

Os quatro parâmetros correntes tratam introdução de novas unidades de análise,
formas de explicação, quantidade de oportunidades distintas de prática e
dimensões de variação. Limites de bytes, DOM, lotes e Partes são cercas
técnicas, não parâmetros pedagógicos.

## Preservar orientação natural e interpretação

Uma orientação é gravada como texto original imutável em nova revisão. A pilha
efetiva acumula as revisões do Curso ao alvo, em ordem estrutural. Limpar a
orientação local não reescreve revisões ancestrais.

Uma interpretação referencia uma revisão exata e conserva:

- resumo;
- diretivas `require|avoid|prefer`;
- divergências;
- perguntas pendentes.

A interpretação não substitui o original e não é raciocínio oculto. Nova
interpretação cria um fato versionado; não altera silenciosamente a orientação
humana.

## Aplicar política de componentes

A política efetiva usa uma revisão exata do catálogo e separa:

- disponibilidade `all|allow_only`;
- lista permitida quando aplicável;
- exclusões;
- preferências.

Exclusão vence. Preferência apenas desempata entre opções permitidas e
semanticamente adequadas. Disponibilidade não prova uso; uso não prova
adequação. O fato aplicado registra referências exatas `package@version`.

## Materialização reproduzível por Parte

```text
Parte, Microssequências-alvo e itens do plano atribuídos a cada alvo
→ resolução server-side do desenho efetivo
→ tentativa e etapas persistidas
→ geração delimitada
→ validação da Unidade e dos componentes
→ fatos de aplicação do desenho
→ commit atômico da etapa
→ inspeção e eventual reparo
```

No início, o servidor calcula e sela o contexto efetivo. Para vários alvos, o
contexto contém um dicionário deduplicado de revisões de orientação e, por
Microssequência, a sequência de IDs efetivos em ordem Curso→alvo. Catálogos de
unidades de análise e requisitos de evidência conservam cada item como
`{id, position, statement, version}`; cada alvo referencia somente os IDs que
lhe foram atribuídos. O cliente não envia `designContext` como declaração
confiável.

Ao registrar uma etapa, `designApplication` contém somente fatos limitados:
unidades de análise introduzidas, formas de explicação desenvolvidas ou
justificadamente não aplicáveis, oportunidades de prática, dimensões que
variaram, operação-alvo invariável e componentes usados. O auditor valida a
forma, as referências, as contagens e a coerência interna dessas declarações
somente contra o subconjunto atribuído à Microssequência da etapa.

Formas, oportunidades e variações são fatos declarados pelo agente ou pela
pessoa autora; o banco não os infere semanticamente do conteúdo. A
reconciliação material na transação cobre os IDs das Unidades do lote, seu
pai/alvo e os `componentRefs` extraídos das entidades persistidas. Assim, o
contrato torna divergências rastreáveis sem fingir observação pedagógica
independente.

Falha de validação reverte entidades, vínculo, progresso, evento e recibo. Não
há confirmação parcial escondida.

## Descoberta progressiva de componentes

O catálogo não deve ser despejado inteiro no prompt. O cliente explora, busca,
inspeciona poucos candidatos, carrega os contratos necessários, valida a
Unidade e só então prepara uma prévia.

Esse fluxo reduz contexto e evita selecionar um package somente pelo rótulo. A
política efetiva limita candidatos, mas o validador ainda precisa conferir
slots, referências e relações da Unidade.

## Concorrência, repetição e no-op

Cada mudança informa revisão esperada do Curso e, quando aplicável, versão do
plano, Parte, tentativa, etapa ou revisão de orientação. O PostgreSQL aplica
CAS. Em conflito, o cliente relê e reconcilia.

`requestId` identifica uma intenção dentro da janela de retenção. Repetir o
mesmo comando recupera o recibo; usar a mesma chave para conteúdo diferente é
conflito. Um no-op sela o resultado sem avançar revisão, versão ou atividade.

## O que não é persistido

O produto não grava transcrição de chat, prompt completo, resposta bruta ou
raciocínio do modelo como estado do Curso. Persiste somente o dado confirmado:
plano, decisões de desenho, orientação original, interpretação estruturada,
composição, contexto efetivo limitado, fatos de aplicação, eventos compactos e
recibos temporários.

## Falhas fechadas

| Situação | Resultado correto |
|---|---|
| comando ou JSON inválido | rejeitar antes de gravar |
| revisão ou versão obsoleta | reler e reconciliar |
| escopo fora do Curso próprio | negar autoridade |
| orientação referenciada não é a revisão exata | rejeitar interpretação |
| componente excluído ou fora de `allow_only` | reverter a etapa |
| item declarado não pertence ao subconjunto atribuído ao alvo | reverter a etapa |
| IDs, pai/alvo ou `componentRefs` não correspondem às entidades | reverter a etapa |
| contexto excede o orçamento | abortar sem truncar silenciosamente |
| pedido idêntico repetido | devolver o recibo idempotente |

## Limite da automação

Contratos demonstram integridade técnica, não verdade, adequação pedagógica ou
eficácia. Parâmetros são operacionalizações examináveis; defaults são
hipóteses de produto. Resultado educacional exige desenho de pesquisa,
instrumentos, participantes, análise de incerteza e interpretação humana.

O fluxo técnico detalhado está em [Autoria por MCP](autoria-mcp.md); a base dos
parâmetros e suas limitações está em [Desenho instrucional
parametrizado](desenho-instrucional-parametrizado.md).
