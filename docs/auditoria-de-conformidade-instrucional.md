# Auditoria de conformidade instrucional

## Finalidade e limite

A auditoria de conformidade confronta o desenho instrucional persistido com o
conteúdo realmente materializado. Ela localiza divergências reproduzíveis,
conserva evidência pública e organiza revisão e reparo. Não atribui nota ao
curso, não mede aprendizagem, compreensão, proficiência ou carga cognitiva e
não certifica eficácia educacional.

O ciclo mantém quatro responsabilidades separadas:

1. o backend calcula fatos estruturais sobre versões, referências, cards e
   resources reais;
2. o auditor semântico examina aquilo que requer interpretação do conteúdo;
3. uma pessoa aprova ou rejeita cada finding;
4. um reparo autorizado altera somente findings aprovados e uma rodada nova
   relê o estado corrente.

Registrar um manifesto prova a identidade e o contrato da materialização. Não
prova, por si só, conformidade instrucional. Do mesmo modo, um teste que passa
prova apenas a regra técnica examinada.

## Sequência autoritativa

```text
planejamento e parâmetros
  → materialização e manifesto
  → audit run sobre a revisão corrente
  → checks determinísticos
  → revisão semântica pública
  → decisão humana por finding
  → mandato de reparo somente para aprovados
  → escrita confirmada e vinculada
  → novo audit run sobre o estado corrente
  → resolução ou permanência do finding + detecção de regressões
```

Construção, auditoria, reparo e reauditoria são rodadas diferentes. O auditor
não usa o próprio finding como autorização para modificar conteúdo. A
reauditoria não reaproveita a conclusão anterior: ela exige outra leitura,
posterior à correção, com revisão, hash e referências correntes.

## Quatro tipos de conclusão

| Tipo | Pode ser calculado pelo backend | Exemplo | Limite |
| --- | --- | --- | --- |
| fato determinístico | sim | hash corrente, referência existente, ordem dos cards, `package@version` realmente instanciado | vale para a regra e a revisão registradas |
| juízo semântico | não; requer leitura contextual | uma explicação desenvolve a relação ou apenas menciona o termo | deve citar evidência pública curta; estabilidade não o torna verdade científica |
| correção factual | depende de fonte apropriada | um valor, definição ou afirmação disciplinar está correto | exige fonte e competência do domínio |
| efeito educacional | não | a pessoa aprendeu ou a representação foi eficaz | requer desenho empírico, participantes e medidas adequadas |

Contagens não atravessam essas fronteiras. Três práticas declaradas são três
artefatos; não são automaticamente três oportunidades semanticamente distintas.
Uma assinatura diferente é um dado estruturado; a relevância da variação ainda
precisa de julgamento.

## Rodada imutável

Cada `audit run` congela o contexto necessário para reproduzir o que foi
examinado:

- escopo de microssequência ou Parte operacional;
- revisão do workspace e marcador da materialização;
- hash canônico dos cards correntes;
- referências versionadas de análise, snapshot efetivo, blueprint, binding e
  manifesto;
- `ResourceSet`s e condição experimental efetivos;
- algoritmo e versão dos checks;
- microssequências incluídas, quando o escopo é uma Parte;
- checks, métricas com unidade e denominador e fingerprints dos findings.

Uma rodada sem finding também é um resultado persistido. Isso permite distinguir
“checado sem finding nas regras cobertas” de “não auditado”, “resultado parcial”
e “não aplicável”. A persistência do run não duplica cards nem artefatos
instrucionais imutáveis.

## Finding público e localizado

Um finding estruturado conserva:

- código governado e origem `deterministic` ou `semantic_audit`;
- gravidade operacional, sem conversão em score;
- alvo exato — workspace, curso, módulo, lição, microssequência, card ou
  instância de resource;
- regra, parâmetro ou requisito confrontado;
- evidência pública curta;
- proposta de reparo opcional;
- fingerprint estável no mesmo alvo e regra;
- audit run de origem e, após reauditoria, run de verificação.

Raciocínio privado, transcript, prompt bruto e cadeia de pensamento não são
campos de finding. Evidência pública deve ser suficiente para uma pessoa
entender o problema sem expor memória interna do auditor.

O ciclo de estado é explícito:

```text
open → approved → repaired → resolved
   └→ rejected
```

`rejected` registra que a pessoa não autorizou o reparo; não apaga o caso nem
vira aprovação implícita em uma rodada posterior. `repaired` significa que uma
escrita pertinente foi confirmada e vinculada, não que o problema foi resolvido.
Somente uma nova rodada pode verificar `resolved` ou manter o finding aberto.

## Checks determinísticos

O núcleo determinístico lê os artefatos normalizados e os cards reais. Entre as
regras cobertas estão:

- análise, snapshot, blueprint, binding e manifesto nas identidades correntes;
- hash e marcador de materialização sem stale silencioso;
- preservação de `research_lock` e da condição de `ResourceSet`;
- passos planejados e materializados, `artifactRefs` e papéis theory/practice;
- existência de cards e contracts válidos;
- teoria necessária anterior à prática, segundo a ordem real;
- cardinalidade de unidades novas e conjuntos de coordenação explicitamente
  declarados;
- referências estruturais de explicação, evidência, variação e formas de
  resposta;
- package, versão, slot, papel, seleção e conjunto autorizador de cada instância
  real.

Coleções malformadas falham fechado. Locks, assignments, `ResourceSet`s ou
cards nunca são convertidos silenciosamente em listas vazias.

### Resources usados, não apenas declarados

O manifesto declara seleções e materialização, mas o auditor deriva novamente o
multiconjunto de instâncias nos cards persistidos: card, slot, instância,
`package@version` e papel. Como o manifesto identifica a materialização por
artefato, package e papel, a igualdade usa esse multiconjunto com multiplicidade;
slot e instância localizam a ocorrência real no card. Em seguida, cada ocorrência
é confrontada com a seleção exata e o mesmo `ResourceSet` autorizador. Uma
declaração forjada não oculta package extra, versão diferente, papel incompatível
ou condição experimental violada.

Adequação semântica da representação continua sendo juízo separado. O fato de
um package estar autorizado não demonstra que ele é a melhor representação para
a tarefa.

## Revisão semântica

O auditor semântico recebe apenas a fatia JIT da microssequência e as fontes
pertinentes. Ele começa pelos fatos determinísticos e registra somente a
conclusão pública estruturada. Entre as perguntas que não podem ser resolvidas
por contagem estão:

- o conteúdo introduz unidades não declaradas e as comprime excessivamente;
- um requisito marcado como desenvolvido foi explicado ou apenas mencionado;
- a prática realmente solicita reconhecimento, aplicação, diagnóstico ou outra
  operação pretendida;
- variações declaradas são semanticamente distintas ou apenas cosméticas;
- a representação preserva a estrutura disciplinar relevante;
- afirmações factuais correspondem às fontes apropriadas.

Uma chamada sem findings é válida e encerra a etapa sem inventar problema. A
mesma entrada deve produzir fingerprints estáveis nas repetições de engenharia,
mas essa estabilidade não substitui revisão humana nem validação educacional.

## Auditoria de Parte

Parte continua sendo lote operacional, não unidade pedagógica nem ancestral de
parâmetro. A auditoria percorre as microssequências como rodadas componentes
imutáveis; cada componente conserva sua própria revisão, checks e métricas. A
rodada de Parte só agrega quando cada microssequência ainda disponível tem um
componente corrente. Referências removidas permanecem como cobertura ausente,
em vez de bloquear ou fingir conformidade. O pai congela a lista ordenada e as
referências das rodadas usadas e registra a revisão cercada da agregação. Ela
resume:

- cobertura das microssequências;
- distribuição dos findings por categoria e alvo;
- coerência entre dependências e revisitas declaradas;
- redundância sem função e lacunas de integração;
- numeradores, denominadores e unidades das métricas aplicáveis.

O resultado não soma categorias em nota nem apaga os recortes locais. Parte
grande avança micro a micro; componentes ausentes são progresso explícito e
mantêm o estado parcial em vez de afirmar conformidade. Depois de completo, o
histórico e os findings continuam paginados. A leitura usa cursores independentes
para findings e componentes. Cada item do pai aponta para a referência exata da
rodada filha congelada; abrir o recorte local não substitui essa referência pela
rodada mais recente da microssequência.

## Interface, autoridade e offline

Em Autoria, Auditoria apresenta resumo, lista e detalhe por exposição
progressiva. `passed`, `failed`, `not_applicable`, não auditado e parcial têm
rótulos distintos e nunca dependem apenas de cor. O detalhe mostra origem,
regra ou critério, evidência pública que resume a divergência observada, alvo e
proveniência; “Abrir conteúdo” preserva o finding e o filtro no retorno. Os
contagens completas e o recorte governado de `expected` e `actual` permanecem
no check imutável da rodada. Referências longas usam envelope bounded, enquanto
a linhagem integral continua na relação imutável pai→filho; esses dados não são
repetidos no finding compacto quando isso ampliaria a saída.

Aprovar e rejeitar são decisões humanas explícitas, autorizadas e protegidas por
CAS e idempotência. Preparar reparos cria mandato apenas para os aprovados. A
interface não executa o reparo instrucional nem configura cards individualmente
para contornar locks. Um mandato de reparo incompleto não pode ser limpo nem
substituído; cada vínculo confirmado consome um finding e o último encerra o
mandato. Só então solicitar reauditoria cria outro mandato e outra rodada.

Uma rodada histórica exata continua legível depois que o conteúdo, a Parte ou
o mandato mudam, mas vem marcada como não corrente. Esse histórico não concede
autoridade operacional: decisão, mandato e reparo exigem rodada concluída ainda
corrente e alvo disponível. Depois de um reparo real, a rodada de origem fica
histórica; o finding `repaired` ainda pode solicitar uma nova reauditoria, com
alvo disponível, rede, CAS e escopo explícito, mas não pode voltar a autorizar
decisão ou reparo por conta própria.

A reauditoria cobre todos os reparos elegíveis do escopo. `still_open` exige uma
nova ocorrência da mesma identidade na rodada ou no child run congelado da
Parte, que sucede a anterior; `resolved` exige ausência dessa recorrência. Uma
conclusão vazia não pode deixar findings reparados presos a uma rodada superada.

Offline, a última evidência sincronizada pode ser consultada. Decisões,
mandatos, reparos e verificação ficam desabilitados até a releitura autoritativa;
não há outbox local de auditoria que possa fabricar autoridade.

## Métricas sem meta escondida

Cards, palavras, caracteres, passos, instâncias, packages, requisitos,
oportunidades e findings são métricas derivadas, com algoritmo versionado,
unidade, denominador e referências de entrada. Servem para descrever e comparar
rodadas. Não definem quantidade ideal de cards, nota de qualidade ou dosagem
universal. Listas longas de referências usam envelope bounded com contagem e
marcador de truncamento; a contagem do denominador não é reduzida ao recorte
transportado.

## Evidência de engenharia

O corpus versionado da #106 contém oito cenários: compressão do texto DNS/DHCP
da #89, menção versus desenvolvimento, reconhecimento versus aplicação,
prática antes da teoria, resource inadequado, condição experimental divergente,
falso positivo rejeitado e reparo que introduz novo problema. Ele verifica
contratos, estabilidade, autoridade e regressões conhecidas; não é experimento
com estudantes nem validação de uma medida científica.

Veja também:

- [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md);
- [Fluxos, prompts e contratos](fluxos-prompts-e-contratos.md);
- [Autoria por MCP](autoria-mcp.md);
- [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md);
- [Matriz de conformidade técnica](matriz-conformidade-tecnica.md).
