# Backlog editorial e conceitual

Este arquivo registra decisões, esclarecimentos e lacunas identificados durante a revisão editorial de agosto de 2026. Ele é um artefato de trabalho da branch de revisão, não uma descrição pública do estado corrente do produto.

Sua função é impedir que a reconstrução da documentação perca relações conceituais importantes e separar três coisas que precisam permanecer distintas: o que o AraLearn já é, decisões de produto já estabelecidas e capacidades que ainda precisam ser implementadas ou verificadas.

## Tese do produto

O AraLearn procura reduzir o atrito entre informação disponível e conhecimento que possa ser efetivamente estudado.

A disponibilidade de informação deixou de resolver, por si só, o problema de aprender. Web aberta, documentação, vídeos, cursos, fóruns, repositórios e modelos de linguagem tornam explicações e materiais fáceis de obter, mas permanece o trabalho de selecionar, ordenar, delimitar, relacionar, introduzir pré-requisitos, praticar e retomar. O problema não é apenas encontrar informação; é convertê-la em um percurso assimilável.

A resposta do AraLearn não é apenas resumir. O conteúdo é distribuído em etapas relacionadas, com explicação, exemplos, práticas e retorno conforme o que precisa ser compreendido ou realizado. A divisão precisa reduzir a quantidade de trabalho cognitivo exigida a cada momento sem romper as relações necessárias à compreensão.

Essa tese antecede as camadas posteriores de inteligência artificial, autoria estruturada e pesquisa. Elas ampliam a resposta inicial, mas não substituem o problema que deu origem ao produto.

## Smartphone, estudo fragmentado e continuidade

O smartphone pertence à razão de existir do AraLearn, não apenas à lista de plataformas suportadas.

O contexto original é o do estudante-trabalhador que estuda em períodos curtos, durante deslocamentos, sob cansaço, atenção fragmentada e conexão instável ou inexistente. O produto precisa permitir que uma ação de estudo suficientemente delimitada caiba nesses intervalos e que o percurso possa ser retomado sem reconstrução mental ou operacional da sessão anterior.

Por isso, estudo em pequenas etapas, retomada, estado local e disponibilidade sem conexão são partes do mesmo problema de produto.

A interface foi mantida desde cedo com largura compatível com tela de celular. Essa decisão não significa que todas as atividades tenham o mesmo contexto de uso: Estudo é especialmente importante em mobilidade; Autoria normalmente exige uma sessão mais deliberada, acesso estável à internet e, com frequência, o conforto de um computador.

## Estudo e Autoria são contextos distintos

`Estudo` e `Autoria` devem continuar claramente delimitados.

A separação não pressupõe pessoas diferentes. Em um curso ministrado por professor, a autoria pode ficar concentrada no professor e o estudo nos alunos. No autodidatismo, a mesma pessoa pode alternar entre os papéis.

Em Estudo, a prioridade é percorrer o conteúdo, praticar, receber retorno, retomar o ponto alcançado, marcar unidades para rever e registrar observações com pouco atrito.

Em Autoria, a prioridade é planejar, inspecionar, julgar, conferir fontes, registrar problemas, discutir alterações, acompanhar materializações e examinar decisões de desenho e registros de pesquisa.

Para o autodidata, existe um ciclo importante:

```text
autor → estudante → revisor → autor novamente
```

Uma deficiência pode ser descoberta durante o estudo, inclusive longe do computador e sem conexão estável, e só depois ser examinada como problema de autoria. Marcar uma unidade para rever continua sendo estado pessoal de estudo; não significa automaticamente que exista um defeito autoral.

## Modelo de autoria

A autoria corrente do AraLearn precisa ser descrita como **autoria conversacional com inteligência artificial generativa**, e não como edição manual acrescida de assistência opcional.

Há três participantes com responsabilidades diferentes.

### Pessoa autora

A pessoa conserva intenção, julgamento, responsabilidade e autoridade autoral. Ela fornece objetivos, contexto, materiais, fontes, restrições, observações e decisões; compara alternativas; rejeita, corrige ou aprova propostas.

Autoridade autoral não significa realizar manualmente todo o trabalho de autoria.

### LLM

Uma LLM suficientemente capaz realiza grande parte do trabalho cognitivo e produtivo: analisar contexto, estruturar planejamento, decompor conteúdo, pesquisar quando o cliente dispõe dessa capacidade, examinar fontes, selecionar e consultar componentes, produzir unidades, materializar partes, interpretar observações, auditar, propor correções, gerar variantes e analisar registros da autoria e da pesquisa.

A arquitetura não deve depender conceitualmente de um fornecedor específico. GPT/ChatGPT é a escolha operacional usada atualmente no desenvolvimento e uma integração por Actions é específica do ChatGPT. O protocolo de domínio e a integração MCP são, em princípio, independentes de fornecedor; a compatibilidade prática de outros modelos depende do cliente, do acesso a ferramentas e das capacidades do modelo.

Não se deve documentar que uma assinatura ou um modelo de outro fornecedor funciona com o AraLearn sem verificação concreta.

### AraLearn

O AraLearn mantém o curso como artefato persistente e fornece o *harness* de autoria: estrutura do curso, operações tipadas, permissões, versões, controle de concorrência, idempotência, invariantes, validação, proveniência, materializações retomáveis, renderização, estado de estudo, auditoria, analytics e ligações de volta para a interface.

Formulação de referência:

> A pessoa conserva a autoridade autoral; a IA generativa realiza grande parte do trabalho autoral; o AraLearn estrutura, persiste e verifica o resultado.

Essa divisão precisa orientar `visao-do-produto.md`, o futuro documento canônico sobre autoria, o guia do professor e autor e os documentos de integração.

## Autoria conversacional e operações estruturadas

O fluxo normal de autoria começa em linguagem natural. A pessoa discute intenção, materiais, planejamento, fontes, problemas e alternativas com a LLM. A LLM lê o estado persistido necessário, usa ferramentas estruturadas do AraLearn e volta à conversa com resultados, justificativas, propostas e referências ao curso.

A conversa não é o repositório do curso. Uma sessão pode terminar e outra pode continuar a partir do estado persistido.

MCP e OpenAPI/Actions são pontes atuais entre a LLM e o domínio do AraLearn, não a identidade conceitual do produto. Detalhes mutáveis de fornecedor, plano, modelo e configuração pertencem aos documentos de integração ou de estado corrente.

## Assistência integrada por API

O recurso atualmente chamado **Assistência por IA** não deve ser confundido com o modelo geral de autoria conversacional.

A assistência integrada ao aplicativo usa APIs de provedores para ajustes ou reparos localizados em conteúdo. Ela pode continuar sendo uma ferramenta útil, mas representa uma modalidade diferente da autoria ampla realizada por uma LLM conectada ao backend de autoria.

A nomenclatura e o posicionamento desse recurso precisam ser revistos em trabalho próprio. Possíveis direções, ainda não aprovadas, incluem nomes que indiquem edição ou reparo localizado com IA.

## Função da interface de Autoria

A interface visual de Autoria surgiu para devolver à pessoa capacidade de observar e intervir num processo que, quando ficava apenas no backend e na conversa, era difícil de inspecionar.

Ela não deve ser reduzida a uma única tela de inspeção. Planejamento, estrutura, materializações, parâmetros, fontes, observações, auditoria, variantes, pesquisa e acesso continuam sendo funções legítimas.

O problema atual é de atrito e arquitetura da informação: a pessoa não deve precisar coordenar muitas telas, formulários e longas sequências de rolagem para compreender o que acabou de acontecer ou chegar ao objeto que quer examinar.

A interface deve oferecer acesso integral ao curso e, ao mesmo tempo, reduzir o custo de chegar ao recorte relevante.

Na inspeção de conteúdo, as tarefas centrais incluem:

- ler unidades de estudo materializadas em sequência e com baixa fricção;
- registrar observações no ponto pertinente;
- ver as fontes usadas e, quando aplicável, abrir o documento ou PDF correspondente;
- ver decisões e parâmetros de desenho efetivamente aplicados;
- examinar materializações, auditorias, variantes e fatos de pesquisa;
- sair de um recorte focal e explorar livremente qualquer outra região do curso.

A interface de Autoria deve favorecer leitura e julgamento antes de edição manual extensa. Isso não implica remover controles existentes apenas por simplificação.

## Parâmetros de desenho

Os parâmetros precisam continuar visíveis e rastreáveis porque fazem parte da explicação do que produziu determinado conteúdo e são importantes para pesquisa.

Há, porém, uma hipótese de UX a investigar: no fluxo comum, uma pessoa pode achar mais natural registrar uma observação ou discutir com a LLM algo como “a explicação ficou condensada demais” do que localizar e editar diretamente um parâmetro. A LLM poderia interpretar a intenção, propor a mudança de desenho e aplicá-la após a decisão autoral.

Essa hipótese **não está aprovada como substituição da edição manual**. Controles explícitos continuam especialmente relevantes para condições de pesquisa, reprodução de configuração e *overrides* deliberados.

## Especialista e autodidata

O AraLearn deve acomodar regimes de confiança diferentes.

Um professor, especialista ou tutor pode combinar conhecimento disciplinar forte com a escala produtiva da LLM. Um autodidata pode iniciar a autoria sem domínio suficiente do assunto e usar o próprio curso para construir esse domínio.

No segundo caso, selecionar fontes é apenas parte do problema. Também é difícil planejar a progressão, inferir pré-requisitos, julgar granularidade e detectar erros num assunto ainda pouco conhecido.

Esse uso é legítimo, mas exige atenção maior a fontes, proveniência, incerteza, auditoria e revisão, porque a pessoa tende a detectar menos problemas por conhecimento prévio.

## Formalização, qualidade e pesquisa

As camadas posteriores do AraLearn devem ser entendidas como uma tentativa de tornar a produção educacional mais explícita, inspecionável, rastreável, comparável e avaliável.

Isso inclui:

- planejamento instrucional persistido;
- fontes, âncoras e proveniência;
- parâmetros de desenho com origem e justificativa;
- componentes didáticos especializados e extensíveis por pacotes;
- contratos, normalização e validação de componentes;
- materializações persistidas e retomáveis;
- observações ancoradas;
- auditoria, correção e verificação;
- variantes;
- analytics sobre o processo de autoria.

Essas estruturas não demonstram, por si mesmas, eficácia educacional. Elas tornam decisões e resultados mais observáveis e criam condições para pesquisa que distinga fatos de implementação, decisões de design, hipóteses e efeitos empíricos.

A dimensão de pesquisa foi incorporada depois da proposta inicial, mas pertence ao mesmo produto: ela se apoia justamente na formalização do estudo e da autoria.

## Genealogia intelectual a recuperar criticamente

Versões antigas da documentação continham uma camada intelectual que desapareceu nas refatorações posteriores.

Em `docs/visao-do-produto.md` de 13 de maio de 2026, o problema era formulado como a dificuldade de converter abundância informacional em percurso e formação. A mesma versão relacionava o projeto a:

- Saussure e ao estruturalismo, pela importância das relações entre unidades dentro de um sistema;
- Lyotard, pela transformação do saber em informação operacionalizável e pela tensão entre acesso a conteúdo e formação;
- Foucault, como advertência crítica sobre tecnologias que registram, classificam e acompanham trajetórias de sujeitos.

Essa camada não deve ser simplesmente restaurada por nostalgia. É preciso rever a precisão das leituras, verificar fontes e decidir onde cada relação pertence no corpus atual. A tese sobre abundância de informação e dificuldade de convertê-la em percurso, porém, é constitutiva da visão do produto e deve permanecer visível.

`docs/origens-do-aralearn.md` deve conservar a genealogia biográfica. A fundamentação acadêmica e filosófica deve ficar em documentos adequados e ser ligada à visão sem transformar a visão do produto numa revisão bibliográfica.

## Estado atual e lacunas de produto

A documentação pública deve descrever como atual apenas o que estiver implementado ou for uma decisão conceitual que não dependa de capacidade ainda ausente.

### Capacidades já verificadas e relevantes à documentação

O backend corrente permite à LLM trabalhar sobre planejamento, desenho, fontes, componentes, materialização, unidades de estudo, observações, auditoria, variantes e pesquisa por operações estruturadas.

O backend também entrega orientação focal à LLM conforme a fase de trabalho e conserva versões, validações e estado necessário para continuidade entre conversas.

A interface já suporta deep links para alvos de autoria e a inspeção de uma unidade de estudo específica pode ser aberta ancorada nessa unidade, com sequência paginada ao redor dela.

### Lacuna: conjuntos de unidades em foco

Ainda não existe, como conceito de navegação, um conjunto de múltiplas **unidades em foco** levado da conversa para a interface.

Essa lacuna deve entrar no backlog de produto. A intenção é que a LLM possa indicar, depois de materializar, revisar, auditar ou discutir conteúdo, um recorte preciso para inspeção visual sem despejar dezenas de links individuais.

**Foco** não significa **alteração**. Uma unidade pode estar em foco porque foi produzida, auditada, comparada, discutida, considerada correta ou simplesmente porque é relevante para o raciocínio corrente.

O foco deve orientar entrada e atenção, não limitar a inspeção. A pessoa precisa continuar podendo percorrer toda a parte, lição, microssequência ou curso e abandonar o recorte focal quando quiser.

Possíveis destinos semânticos para desenvolvimento futuro incluem:

- inspecionar uma materialização inteira;
- inspecionar um subconjunto de unidades em foco;
- abrir diretamente uma unidade específica;
- ver o desenho efetivamente aplicado ao recorte;
- chegar a uma fonte, observação ou achado de auditoria específico.

A forma de codificar e persistir esses recortes ainda precisa ser projetada. Não presumir que “foco” deva virar entidade persistente do domínio.

## Prioridades de reconstrução documental

### Prioridade 1 — identidade do produto

- revisar `docs/visao-do-produto.md` para recuperar a tese sobre abundância informacional, estudo móvel, dupla redução de atrito e autoria conversacional;
- revisar posteriormente o `README.md` para refletir a mesma identidade em nível introdutório;
- preservar `docs/origens-do-aralearn.md` como genealogia biográfica e recuperar apenas o que realmente pertence à narrativa histórica.

### Prioridade 2 — modelo de autoria

Criar um documento canônico, provisoriamente `docs/modelo-de-autoria.md`, que desenvolva:

- o atrito da autoria produzido pela necessidade de material didático estruturado;
- distinção entre autoridade autoral e trabalho autoral;
- papéis da pessoa, da LLM e do AraLearn;
- autoria conversacional e operações estruturadas;
- independência conceitual de fornecedor;
- relação entre conversa e interface visual;
- especialista e autodidata;
- fontes, proveniência, auditoria e confiança;
- materialização e componentes;
- instrumentação para pesquisa;
- limites e perguntas empíricas abertas.

### Prioridade 3 — guias e integrações

- revisar `docs/guia-professor-autor.md` depois que o modelo de autoria estiver estabilizado;
- revisar `docs/criar-cursos-pelo-chat.md` para que o fluxo prático corresponda ao modelo canônico;
- manter `docs/autoria-mcp.md` e `docs/autoria-actions.md` como documentos de integração e contratos, sem transferir para eles a função de explicar a autoria como conceito;
- revisar `docs/assistencia-por-ia.md` para separar claramente edição localizada por API da autoria conversacional principal.

### Prioridade 4 — fundamentos e pesquisa

- revisar a distribuição da tese sobre informação, conhecimento e formação no corpus;
- recuperar criticamente as referências intelectuais antigas quando ainda forem pertinentes;
- verificar como `quadro-teorico.md`, revisão de literatura, documentos de componentes, parametrização, auditoria e analytics se ligam à nova visão sem duplicá-la;
- manter explícita a distinção entre propriedade implementada, decisão de design, hipótese e resultado empírico.

### Documentos técnicos

Documentos estritamente técnicos de engenharia não precisam ser reescritos apenas para acompanhar a reconstrução conceitual. Devem ser alterados quando houver incompatibilidade factual, terminologia conceitualmente enganosa, links quebrados ou quando uma mudança de produto tornar a descrição técnica obsoleta.

## Regra para novas ideias durante a revisão

Quando uma nova ideia surgir durante a escrita:

1. verificar se já existe no produto corrente;
2. se existir, documentá-la no local adequado;
3. se existir parcialmente, separar a capacidade atual da lacuna;
4. se for apenas desejada, registrá-la como backlog de produto, sem descrevê-la como capacidade atual;
5. depois da implementação, verificar novamente o código e só então incorporá-la à documentação pública como fato.

A documentação deve continuar servindo como instrumento para compreender o produto. Discrepâncias encontradas durante a escrita são evidência para decisões e issues futuras; não devem ser escondidas por redação que torne a implementação mais coerente do que ela realmente é.
