# Criar e desenvolver Cursos por conversa

Este guia descreve o fluxo corrente de Autoria por um cliente conectado ao
Model Context Protocol (MCP). A conversa e a interface visual operam o mesmo
Curso vivo. Não existe uma cópia “do assistente”, um Workspace intermediário
ou uma publicação paralela.

## O que já funciona

Com uma conta autorizada, o cliente pode:

- listar, ler e criar Cursos próprios;
- editar o plano instrucional e suas Partes;
- configurar parâmetros pedagógicos, orientações por escopo e política de
  componentes;
- criar, revisar e aposentar Fontes e Âncoras e atribuí-las a itens do plano ou
  Unidades;
- incluir, alterar ou excluir entidades didáticas em lotes delimitados;
- iniciar, retomar e concluir a materialização de uma Parte;
- ler, criar e triar Anotações ancoradas;
- auditar uma Unidade, registrar e decidir achados, propor/aplicar uma correção
  focal, verificar o resultado numa nova rodada e executar rollback;
- consultar e validar contratos de componentes;
- gerir perfil e acesso direto ao Estudo.

Variantes experimentais e analytics educacionais completos não estão
disponíveis. A conversa pode discuti-los, mas não deve afirmar que os persistiu
sem uma operação correspondente.

## Antes da primeira conversa

1. Conecte o endpoint MCP do ambiente correto.
2. Autorize uma conta individual por OAuth.
3. Confirme que o cliente descobriu seis ferramentas e o recurso
   `aralearn://authoring/invariants`.
4. Leia o Curso e a projeção necessária antes de qualquer alteração.

A conta nunca recebe uma chave administrativa. O servidor confere propriedade
em cada operação de Autoria.

## Começar pelo problema educacional

No primeiro pedido, descreva em linguagem natural:

- quem deverá aprender;
- o que deverá conseguir compreender ou fazer;
- conhecimentos prévios relevantes;
- conteúdo ou fontes disponíveis;
- restrições reais de tempo, linguagem ou acessibilidade;
- dúvidas que ainda exigem decisão humana.

Essas informações orientam o planejamento. Elas não justificam inventar
fontes, resultados de aprendizagem, valores de parâmetros ou eficácia que não
foram demonstrados.

## Localizar ou criar o Curso

Peça ao cliente para procurar pelo título. Ele deve usar `listarCursos` e, se
houver homônimos, apresentar contexto suficiente para a escolha.

Se o Curso ainda não existir, `criarCurso` cria uma raiz privada com título e
objetivo. A operação usa um `requestId` estável: repetir a mesma intenção após
uma resposta perdida não produz duplicatas.

Não há Workspace, Coleção, Trilha ou estágio de publicação a escolher. O Curso
criado é a mesma identidade aberta em Autoria e Estudo.

## Planejar sem duplicar autoridades

Use `lerCurso` com a vista `instructional_plan`. O plano conserva:

- público e escopo;
- resultados de aprendizagem pretendidos;
- unidades de análise instrucional;
- requisitos de evidência;
- Partes e seus vínculos com Microssequências didáticas;
- faixa preferencial de Partes, como hipótese operacional ajustável.

Título e objetivo continuam na raiz do Curso. Orientações naturais não ficam
num campo genérico do plano: elas são revisões próprias, versionadas e
aplicadas por escopo na vista `course_design`.

Parte é um agrupamento operacional de produção. Ela não substitui Módulo,
Lição, Microssequência didática ou Unidade de estudo e não define a ordem
curricular.

Depois que as Microssequências existem, atribua explicitamente a cada uma as
unidades de análise e os requisitos de evidência que ela deve realizar. Um
item pode pertencer a vários alvos e um alvo pode receber vários itens. Essa
cobertura não é inferida do vínculo com a Parte nem do plano inteiro.

## Configurar o desenho antes da materialização

Leia `course_design` no escopo que será alterado. O contrato apresenta quatro
parâmetros pedagógicos explícitos:

- teto de novas unidades de análise por Unidade expositiva;
- formas de explicação exigidas quando aplicáveis;
- mínimo de oportunidades distintas de prática por requisito de evidência;
- dimensões de variação exigidas entre essas oportunidades.

Os defaults são hipóteses de produto, não leis pedagógicas. Uma atribuição
`automatic` precisa de justificativa breve; `author` e
`research_condition` registram decisões explícitas. Limpar uma atribuição
restaura a resolução herdada ou o default, sem gravar uma cópia derivada.

Orientações naturais são preservadas no texto original. Uma interpretação
estruturada registra diretivas, divergências e perguntas sem substituir nem
reescrever o original. Para um alvo, a pilha efetiva acumula as revisões do
Curso até o escopo mais próximo.

A política de componentes separa disponibilidade, exclusão e preferência:

- `all` mantém o catálogo corrente disponível;
- `allow_only` restringe a uma lista explícita;
- exclusões sempre vencem;
- preferências apenas desempatem opções permitidas e semanticamente adequadas.

No escopo de Microssequência, leia `targetPlanItems` e use
`set_target_plan_items` para substituir atomicamente as listas
`instructionalAnalysisUnitIds` e `evidenceRequirementIds`. Nos demais escopos,
`targetPlanItems` é `null`. IDs repetidos, de outro tipo ou de outro Curso são
recusados.

## Registrar Fontes e Âncoras antes de produzir

Use `lerCurso` com `view: "course_sources"` para percorrer o catálogo, abrir uma
Fonte ou ler o histórico de um alvo. Crie ou revise a Fonte sem inventar
metadados; depois crie Âncoras de página, tempo, fragmento URI ou trecho textual
na revisão exata.

Toda atribuição nova declara se a Fonte informa, sustenta, foi adaptada ou foi
citada e exige ao menos uma Âncora ativa. `set_target_sources` substitui o
conjunto completo e ordenado do item do plano ou da Unidade; não o trate como
acréscimo parcial. Referência legada não resolvida mantém identidade e ordem,
fica oculta e deve ser resolvida sob a mesma identidade literal.

Não coloque `sources` no JSON de uma Unidade. Para cada Unidade incluída ou
substituída pelo commit da composição, envie exatamente uma aplicação separada
de atribuição, ainda que vazia. Repetir depois de resposta perdida preserva o
mesmo `requestId` e o mesmo comando.

## Descobrir componentes sob demanda

O cliente não carrega todos os contratos do catálogo no contexto. O fluxo
econômico é:

1. explorar famílias e facetas;
2. buscar candidatos pela intenção didática;
3. inspecionar poucos packages;
4. obter somente os contratos necessários;
5. validar a Unidade proposta;
6. preparar uma prévia quando a decisão exigir inspeção visual.

A política de componentes limita os candidatos, mas não prova que um package é
pedagogicamente adequado.

## Produzir por Parte

Antes de iniciar uma tentativa, o servidor resolve e sela o desenho efetivo
para as Microssequências-alvo: parâmetros, orientações versionadas, política de
componentes, itens do plano atribuídos e Fontes/Âncoras desses itens. Os catálogos selados conservam
`id`, `position`, `statement` e `version`; cada alvo referencia somente seus
IDs. O cliente não declara esse contexto como fato.

Para cada etapa de materialização, o cliente deve:

1. retomar a tentativa persistida e sua próxima etapa;
2. gerar somente o recorte autorizado;
3. validar relações pai–filho e contratos das Unidades;
4. informar fatos limitados sobre a aplicação do desenho;
5. informar aplicações de Fontes somente com revisões e Âncoras seladas;
6. enviar o lote delimitado com as versões esperadas;
7. reler o estado e resumir apenas o que foi persistido.

O auditor verifica, para a Microssequência da etapa, schema, pertencimento ao
subconjunto atribuído, contagens e coerência interna das declarações de formas,
oportunidades e variações. Essas declarações vêm do agente ou da pessoa autora;
o banco não as descobre semanticamente na prosa. Na mesma transação, o banco
reconcilia materialmente os IDs de Unidades do lote, o pai/alvo, as atribuições
de Fonte e os `componentRefs` presentes no conteúdo, além do CAS e da política. Uma resposta
técnica bem-sucedida não demonstra qualidade pedagógica ou efeito de
aprendizagem.

## Conferir visualmente

Depois de uma alteração:

1. confira **Planejamento**, **Parâmetros** e **Fontes**;
2. use **Estrutura** para a hierarquia compacta;
3. percorra **Inspeção** na ordem curricular e confira a atribuição da Unidade;
4. abra o mesmo Curso em **Estudo** para verificar renderer, navegação e a
   projeção redigida de Fontes;
5. confirme que Fonte oculta ou não resolvida não aparece e que **Citação** não
   entrega link;
6. abra **Auditoria e correções** para acompanhar Observações, rodadas, achados
   e correções sem criar uma oitava área;
7. separe defeitos técnicos de decisões pedagógicas.

Respostas ficam inertes na Inspeção. A tela examina o conteúdo real, mas não é
um segundo editor de Unidade.

## Revisar, corrigir e continuar

Para trabalhar com Observações, use `lerCurso` na vista
`anchored_annotations`, nos modos caixa de entrada, alvo ou detalhe. A mutação
continua dentro de `alterarCurso`, pela operação
`update_anchored_annotations`; o MCP mantém exatamente seis ferramentas.

Antes de criar, confirme com a pessoa o alvo exato e uma síntese breve. O
comando exige `confirmed: true` e `briefSummary` não vazio, preserva o texto
declarado e não envia a conversa inteira. Responder ou resolver descreve
triagem, não uma correção do Curso. A classificação automática só associa
assunto quando o alvo é exatamente um Tópico; qualquer seleção diferente é uma
correção humana separada.

Peça uma revisão com critério explícito, por exemplo cobertura do objetivo,
formas de explicação, oportunidades de prática ou adequação representacional.
O cliente deve citar os alvos encontrados, confrontar o planejado com os fatos
declarados como aplicados e propor a menor mudança suficiente. Para formas,
oportunidades e variações, essa comparação é ponto de partida para revisão do
conteúdo, não observação independente de que a declaração seja verdadeira.

Para persistir essa revisão, use `lerCurso` com `view: "audit_cycle"`. O modo
`context` prepara uma Unidade focal; `findings` e `runs` são paginados e aceitam
filtro opcional pela Unidade; `runs` enumera inclusive rodadas sem achados. O
modo `detail` recebe exatamente um entre `findingId` e `auditRunId`; o detalhe
da rodada expõe todos os checks e evidências.

Registre a auditoria sem misturar reparo. A pessoa ou o cliente fornece checks
pedagógicos, factuais e editoriais; o servidor acrescenta o check estrutural.
Um resultado factual positivo precisa de Fonte e Âncora ativas e exatas:
`supported_by` sustenta uma afirmação, enquanto `quoted_from` só comprova o
critério `quotation_fidelity`.

Depois, se um achado aberto justificar mudança, proponha uma correção somente
para o conteúdo e as atribuições de Fontes da Unidade focal existente. Ela não
pode criar, excluir, mover, reposicionar ou trocar o pai de entidades e precisa
preservar `topics` legítimos. Mostre o efeito à pessoa e só envie
`auditCommand.confirmed: true` ao aplicar. A aplicação conserva checkpoint
`before|after` e deixa o achado aguardando verificação.

Verifique sempre numa nova rodada. `resolved` exige que o critério focal tenha
passado; `still_open` reabre o achado. Rollback também exige confirmação e só
restaura o checkpoint quando o estado aplicado ainda é corrente. Os demais
cinco comandos do ciclo recusam `confirmed`.

Vínculos com Observações não copiam texto, pseudônimo ou pessoa. Uma Observação
retirada aparece indisponível e sem link enquanto o tombstone existe; depois da
limpeza física, o vínculo e seu ID simplesmente deixam a projeção. Uma
`suggestedAnnotationAction` de resolver ou reabrir não executa a triagem: exige
outro comando explícito de Anotações com a versão corrente.

Na interface, use `section=observations&annotationId=...` para uma Observação,
`section=observations&findingId=...` com `correctionId` opcional para um achado
e `section=observations&auditRunId=...` para uma rodada. Fonte ou Âncora abre
`section=sources`; a Unidade abre a Inspeção. Combinações incompatíveis e links
profundos acima do limite são recusados.

Quando houver decisão pedagógica real, a pessoa confirma o valor ou a
orientação. Uma automação não sobrescreve silenciosamente uma decisão explícita.

## Retomar em outra conversa

Uma nova sessão deve:

1. ler o recurso de invariantes;
2. localizar o Curso;
3. ler o plano, o desenho no escopo e a tentativa pertinente;
4. ler o catálogo ou as atribuições de Fontes pertinentes;
5. se houver revisão em curso, ler achado, rodada e correção pertinentes;
6. explicar em poucas linhas o estado recuperado;
7. só então propor a próxima operação.

O estado recuperável está no Curso. Prompt, conversa e raciocínio não viram uma
cópia oculta do planejamento.

## Recuperar falhas

- **Não autenticado:** refaça o OAuth; não use chave administrativa.
- **Curso não encontrado:** confirme conta, identificador e propriedade.
- **Conflito de revisão:** releia e reconcilie; não incremente versão à mão.
- **Pedido repetido:** reutilize o mesmo `requestId` somente para a mesma
  intenção e o mesmo comando.
- **Parâmetro ou orientação inválidos:** confira escopo, versão da orientação,
  origem e contrato do valor.
- **Componente bloqueado:** releia a política efetiva; preferência não autoriza
  um package excluído.
- **Fonte ou Âncora inválida:** releia a revisão, o alvo e o conjunto completo;
  não retire a Âncora nem normalize a identidade legada para contornar o erro.
- **Evidência factual recusada:** use Fonte e Âncora ativas na revisão exata e
  confira se a relação corresponde ao critério.
- **Correção ou rollback obsoleto:** releia a Unidade e o checkpoint; não force
  uma revisão ou substitua o alvo por aproximação.
- **Entidade inválida:** confira pai, posição, identidade e contrato antes de
  reenviar.
- **Resultado ausente na interface:** releia o Curso e confirme ambiente,
  conta, revisão e escopo.

Os contratos técnicos completos estão em [Autoria por MCP](autoria-mcp.md). O
[estado corrente](estado-atual-e-roadmap.md) distingue capacidades conectadas
de avaliações e marcos ainda pendentes.
