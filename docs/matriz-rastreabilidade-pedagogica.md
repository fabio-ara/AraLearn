# Matriz de rastreabilidade pedagógica

## 1. Finalidade

Rastreabilidade é a capacidade de reconstruir por que uma decisão foi tomada,
como foi implementada e que evidência seria necessária para avaliá-la. Esta
matriz liga o [quadro teórico](quadro-teorico.md) ao artefato e ao
[protocolo de avaliação](protocolo-avaliacao-artefato.md).

A matriz não converte literatura em garantia de eficácia. Uma fonte externa
pode justificar que um problema merece atenção ou que um mecanismo é
plausível; somente dados obtidos em uma avaliação compatível podem sustentar
efeitos atribuídos ao AraLearn.

## 2. Vocabulário de evidência

Cada linha separa sete elementos:

1. **problema**: condição observável que motiva uma intervenção;
2. **alternativas e requisitos**: opções consideradas e propriedades que a
   solução precisa preservar;
3. **decisão**: regra normativa adotada no produto;
4. **fundamentação externa**: conhecimento produzido fora do artefato;
5. **hipótese de design**: relação provisória entre contexto, mecanismo e
   resultado esperado;
6. **operacionalização e evidência técnica**: código, contrato ou teste que
   mostra que a decisão foi implementada;
7. **evidência empírica**: dados com participantes, tarefas e medidas capazes de
   apoiar ou enfraquecer a hipótese.

Neste documento, uma hipótese pode ser resumida como **C–M–R**:

- **C — contexto**: para quem e em que situação;
- **M — mecanismo**: qual propriedade do desenho pode produzir diferença;
- **R — resultado**: qual mudança observável é esperada.

Essa notação organiza raciocínio de projeto; não constitui, por si só, uma
teoria causal validada.

Nos itens técnicos, **package** é um módulo de recurso com contrato e mecanismo
de renderização próprios; **kernel** é o núcleo que coordena esses módulos; e **workspace** é um
espaço de trabalho com membros e permissões locais. Inteligência artificial
(IA) designa os modelos e serviços que auxiliam a autoria.

## 3. Matriz de justificativa das decisões

| ID | Problema | Alternativas e requisitos | Decisão | Fundamentação externa | Consequências | Limites |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Interrupção e conexão variável podem romper a continuidade de uma tarefa móvel. | Depender do servidor, manter somente cache de página ou conservar réplica e cursor locais. A ação corrente precisa permanecer disponível e retomável. | Conteúdo sincronizado e estado corrente ficam disponíveis localmente; sincronização não integra o caminho crítico do estudo. | Interrupções impõem custo de reconstrução da tarefa ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)). Interfaces móveis variam conforme contexto e dispositivo ([Ahmad Faudzi et al. (2023)](referencias.md#ref-faudzi2023mobileui)). | Tema, resposta, confirmação e avanço podem ocorrer sem aguardar rede; o percurso possui ponto de retomada explícito. | Disponibilidade offline não demonstra menor custo de retomada nem maior continuidade de estudo. |
| P2 | Teoria condensada pode introduzir termos e relações antes dos fundamentos necessários. | Resumir, acumular detalhes num card ou distribuir uma explicação progressiva. É preciso preservar profundidade sem impor cota de telas. | O planejamento antecede a quantidade de cards; a microteoria começa por situação inteligível e progride até a profundidade definida pelo escopo. | Busca e integração desnecessárias podem consumir memória de trabalho ([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)). Segmentação possui efeitos condicionais ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting)), e microlearning reúne intervenções heterogêneas ([De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)). | Número de cards torna-se consequência do conteúdo, dos pré-requisitos e da prática planejada. | Mais cards podem gerar redundância e fragmentação; suficiência teórica precisa ser julgada em cada domínio. |
| P3 | Prosa ou componente genérico pode ocultar estrutura espacial, formal ou relacional relevante. | Usar texto, representação genérica ou package especializado. O recurso precisa preservar convenção acadêmica e apoiar uma operação identificável. | O gesto cognitivo e o objeto são definidos antes da consulta ao catálogo; somente então se recupera o contrato do package selecionado. | Representações externas podem complementar, restringir ou construir relações, mas também exigem coordenação ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)). Coerência e contiguidade orientam sua composição ([Mayer (2009)](referencias.md#ref-mayer2009multimedia); [Ginns (2006)](referencias.md#ref-ginns2006contiguity)). | O catálogo pode crescer sem contrato monolítico; recursos sem função distintiva podem ser fundidos ou retirados. | Validade do esquema de dados e ausência de sobreposição não demonstram adequação didática. |
| P4 | Novatos podem recorrer a busca improdutiva quando precisam resolver antes de compreender a operação. | Exigir solução completa desde o início, manter imitação permanente ou retirar apoio gradualmente. | Quando a tarefa justificar, explicação e exemplo resolvido antecedem prática guiada e produção com menos apoio. | Exemplos resolvidos e *fading* oferecem base para essa progressão em condições delimitadas ([Sweller e Cooper (1985)](referencias.md#ref-sweller1985workedexamples); [Renkl et al. (2004)](referencias.md#ref-renkl2004fading)). | O percurso pode tornar decisões intermediárias observáveis e localizar dificuldades. | Conhecimento prévio e natureza da tarefa moderam o apoio; retirada lenta ou rápida demais pode prejudicar o objetivo. |
| P5 | Variedade de componentes pode manter a mesma operação superficial e dar apenas aparência de prática diversa. | Distribuir formatos por frequência, usar sempre escolha ou selecionar a resposta pela evidência desejada. | Lacuna, digitação, escolha, associação e ordenação são usadas conforme recordar, produzir, discriminar, relacionar ou sequenciar. | Recuperação ativa pode favorecer aprendizagem posterior ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval)); transferência para novas tarefas não é automática ([Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)). | Práticas passam a declarar o gesto cognitivo; alvos internos permanecem independentes e situados no objeto. | Um toque não caracteriza recuperação por si só; demanda e validade dependem do item. |
| P6 | Feedback apenas binário informa resultado sem necessariamente apoiar revisão. | Avaliar a cada toque, revelar automaticamente, registrar apenas acerto ou oferecer retorno específico após confirmação. | A pessoa confirma quando desejar; recebe explicação acionável; pode tentar novamente; a resposta correta só é revelada por ação explícita. | Efeitos do feedback dependem do foco, conteúdo e oportunidade de ação ([Hattie e Timperley (2007)](referencias.md#ref-hattie2007feedback); [Shute (2008)](referencias.md#ref-shute2008feedback); [Morris et al. (2021)](referencias.md#ref-morris2021formative)). Usar feedback é competência própria ([Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Wood (2021)](referencias.md#ref-wood2021dialogic)). | O erro pode orientar nova tentativa sem produzir nota, ranking ou diagnóstico automático. | Feedback extenso, genérico ou controlador também pode prejudicar; efeitos afetivos exigem instrumentos próprios. |
| P7 | Editar um card por meio de JSON ou em tela separada pode ocultar o alvo e misturar conteúdo com estrutura. | Expor documento inteiro, criar formulários extensos ou permitir edição contextual de folhas autorizadas. | Rótulos e textos visíveis são editáveis; identificadores, topologia e tipos são contexto protegido; assistência é conversacional e reversível. | Interação humano–IA deve comunicar limites, permitir correção e preservar controle ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Aceitação indevida de recomendações é risco relevante ([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). | A pessoa pode solicitar, inspecionar, iterar, rejeitar e restaurar mudanças sem operar o contrato integral. | Escopo válido não garante conteúdo correto ou pedagogicamente adequado; revisão humana permanece necessária. |
| P8 | Dúvidas e possíveis erros podem perder sentido quando separados do card que os provocou. | Canal externo, registro comportamental inferido ou observação voluntária situada. | A manifestação permanece ligada ao card, pode receber retorno e pode ser relacionada a reparo confirmado. | Avaliação formativa e *feedback literacy* tratam feedback como processo de interpretação e ação ([Nicol e Macfarlane-Dick (2006)](referencias.md#ref-nicol2006formative); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy); [Nicol e Kushwah (2024)](referencias.md#ref-nicol2024feedbackagency)). | A observação pode ser reencontrada e analisada no contexto sem copiar todo o curso. | Uma observação não diagnostica domínio, atenção ou qualidade docente; ausência de manifestação também não. |
| P9 | Colaboração e automação podem ampliar privilégios ou tornar responsabilidade opaca. | Papéis globais, espaço pessoal isolado ou permissões locais e revogáveis; automação irrestrita ou escopo delimitado. | Workspaces calculam capacidades locais e registram proveniência; modelos de linguagem recebem contexto de leitura e alvos graváveis separados. | Participação ocorre em contextos sociais específicos ([Wenger (1998)](referencias.md#ref-wenger1998communities); [Bridwell-Mitchell (2016)](referencias.md#ref-bridwellmitchell2016collaborative)). Diretrizes para IA generativa e interação humano–IA enfatizam transparência, revisão e responsabilidade ([UNESCO (2023)](referencias.md#ref-unesco2023genai); [Autio et al. (2024)](referencias.md#ref-nist2024genai); [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). | Uma pessoa pode exercer papéis diferentes em espaços isolados; alterações assistidas permanecem atribuíveis e revisáveis. | Papéis não produzem colaboração automaticamente; validação estrutural não torna saída de modelo confiável. |
| P10 | Coletar cliques, tempo e tentativas por disponibilidade técnica favorece interpretações sem validade. | Registrar tudo, manter telemetria mínima ou definir primeiro pergunta, construto e intervenção. | Dados comportamentais não são coletados por padrão; qualquer indicador futuro exige finalidade, interpretação, ação, retenção, acesso e custo explícitos. | Ética de *learning analytics* exige propósito, transparência, proporcionalidade e participação ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics); [Tsai e Martinez-Maldonado (2022)](referencias.md#ref-tsai2022humancentered)). | Estado operacional permanece compacto; observações voluntárias não são convertidas automaticamente em perfil. | Ausência de telemetria pode limitar certas perguntas; novos dados só se justificam por protocolo específico. |

## 4. Matriz de operacionalização e avaliação

Os caminhos indicam pontos verificáveis da implementação atual. Eles podem
mudar em refatorações; a decisão conceitual permanece identificada pelo ID.

| ID | Hipótese C–M–R | Operacionalização | Evidência técnica adequada | Episódio empírico necessário | Critério de revisão |
| --- | --- | --- | --- | --- | --- |
| P1 | Em estudo móvel interrompido, réplica e cursor locais podem facilitar reencontro e continuação. | `src/storage/progressStore.js`; `src/sync/RelationalSyncEngine.js` | teste offline, persistência do cursor, conflito entre dispositivos e latência de ação local | interromper e retomar tarefas sob condições de rede e intervalo controlados; observar sucesso, erro, tempo e explicação | revisar se o ponto não for compreendido, se houver perda de estado ou se a alternativa for superior |
| P2 | Para novatos, progressão sem premissas ocultas pode sustentar compreensão sem reduzir profundidade. | `src/authoring/pedagogicalBlueprint.js`; `authoring/core/quality.md` | validação do plano didático, dependências, cobertura e rubrica de auditoria | julgamento de especialistas e tarefas de explicação e aplicação com novatos | dividir, recompor ou aprofundar quando houver salto, condensação, fragmentação ou prática sem base |
| P3 | Quando a tarefa depende de estrutura disciplinar, representação especializada adequada pode reduzir ambiguidade evitável. | `src/resources/kernel/packageRegistry.js`; `src/resources/catalog/resourceCatalog.js` | contrato válido, materialização determinística, geometria e descrição acessível | comparar texto, recurso inadequado e recurso especializado em tarefa equivalente, com especialista do domínio | fundir, restringir ou retirar quando a distinção não for compreendida ou não justificar o custo |
| P4 | Para novatos e tarefas complexas, exemplo seguido de retirada de apoio pode melhorar execução independente. | planejamento de microteoria, exemplo e prática guiada | cobertura entre exemplo e prática; retirada explícita sem remover dados necessários | desempenho imediato e adiado, justificativa dos passos e problema de transferência | alterar ordem ou apoio quando houver imitação sem compreensão ou busca improdutiva |
| P5 | Quando a modalidade corresponde à operação, a prática pode fornecer evidência mais válida do desempenho pretendido. | packages de resposta e alvos declarados pelos packages de conteúdo | independência de alvos, resposta localizada, confirmação e reinício | comparar reconhecimento, produção, associação e ordenação conforme o objetivo | retirar prática artificial, ambígua ou desalinhada |
| P6 | Depois de resposta voluntariamente confirmada, feedback específico pode apoiar interpretação e nova ação. | `src/ui/studyCardProgression.js` e feedback associado ao alvo | não revelar antes da ação; fluxo confirmar–feedback–avançar; tentar novamente | pedir interpretação do feedback, revisão da resposta e solução de item relacionado | reescrever quando o retorno não explicar causa, contraste ou próximo passo |
| P7 | Na edição de card, alvos textuais visíveis e reversão podem reduzir erro de escopo e retrabalho. | `src/assist/cardAssistanceScope.js`; `src/assist/cardAssistanceLedger.js` | somente caminhos autorizados são gravados; desfazer, refazer e restaurar preservam estado | tarefa de reparo com iteração, rejeição e restauração; medir erro, retrabalho e compreensão do escopo | bloquear se estrutura aparecer como texto editável ou mudança extrapolar seleção |
| P8 | Ao surgir uma dúvida situada, observação ligada ao card e retorno no mesmo contexto podem apoiar decisão de revisão. | observações contextuais e comentários do workspace | identidade estável, sincronização, retorno e vínculo com reparo | registrar, reencontrar, interpretar o retorno e decidir ação; analisar casos negativos | revisar se o contexto se perder, a manifestação virar diagnóstico ou a responsabilidade ficar indefinida |
| P9 | Em colaboração e autoria assistida, capacidades locais e proveniência podem tornar escopo e responsabilidade mais compreensíveis. | serviços de workspace, permissões e autoria via catálogo/contrato | isolamento, revogação, atribuição, validação e concorrência | tarefas com diferentes papéis e modelos; entrevista sobre autorização, autoria e confiança | alterar se houver confusão de papel, privilégio excessivo ou aceitação automática |
| P10 | Quando a coleta começa por uma pergunta e uma intervenção, indicadores podem ser mais interpretáveis e proporcionais. | política de dados e estado corrente compacto | inventário de dados, ausência de telemetria não autorizada, retenção e acesso verificáveis | co-design de pergunta, indicador e ação; teste de interpretação e dano potencial | não coletar ou descontinuar indicador sem validade, ação ou proporcionalidade |

## 5. O que cada fonte de evidência autoriza afirmar

| Fonte | Interpretação permitida | Interpretação não permitida |
| --- | --- | --- |
| esquema de dados ou contrato | a entrada possui forma válida e restrições declaradas | o conteúdo é correto, claro ou útil |
| teste unitário | uma unidade produziu o resultado esperado no caso testado | pessoas compreendem a função |
| teste de integração ou E2E | componentes completam uma jornada definida | a jornada é intuitiva ou pedagogicamente eficaz |
| auditoria visual automatizada | não houve recorte, sobreposição ou contraste insuficiente segundo a regra testada | a representação foi interpretada corretamente |
| revisão de especialista | a convenção e o conteúdo atendem a critérios do domínio no corpus revisado | estudantes aprenderam com o material |
| teste de usabilidade | participantes concluíram tarefas e relataram determinada experiência | houve retenção ou transferência |
| avaliação de aprendizagem | ocorreu diferença nas medidas e condições estudadas | o efeito será universal ou terá o mesmo mecanismo noutro contexto |

Um resultado empírico deve registrar população, tarefa, comparação, medida,
procedimento, incerteza e casos adversos. Sem esses elementos, a matriz conserva
o campo como evidência necessária, não como efeito observado.

## 6. Manutenção da rastreabilidade

Uma alteração relevante segue esta sequência:

1. identificar a proposição P1–P10 afetada;
2. atualizar problema, alternativa ou decisão quando a lógica mudar;
3. apontar a nova operacionalização sem apagar o histórico versionado;
4. acrescentar ou modificar testes compatíveis com o requisito;
5. registrar que inferências os testes autorizam;
6. definir o episódio empírico capaz de avaliar a hipótese;
7. revisar documentação relacionada e glossário;
8. tratar resultados contrários como motivo de revisão, não como falha a
   ocultar.

Uma nova funcionalidade não exige automaticamente uma nova proposição. Primeiro
se verifica se ela operacionaliza uma hipótese existente. Uma nova proposição
só é necessária quando introduz problema, mecanismo ou resultado que não pode
ser rastreado de forma responsável pelas linhas atuais.

## 7. Cobertura documental

- O [Modelo didático](modelo-didatico.md) explica a progressão de ensino e
  prática.
- A [Fundamentação dos recursos](fundamentacao-pedagogica-dos-resources.md)
  detalha as decisões representacionais.
- O [Glossário de construtos](glossario-construtos.md) fixa definições e
  indicadores.
- O [Protocolo de avaliação](protocolo-avaliacao-artefato.md) transforma as
  hipóteses em episódios avaliáveis.
- A [Matriz de conformidade técnica](matriz-conformidade-tecnica.md) relaciona
  documentação e implementação sem atribuir eficácia pedagógica aos testes.

As referências completas estão em [`referencias.bib`](referencias.bib).
