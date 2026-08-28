# Visão do produto

O AraLearn é uma plataforma para estudo e criação de cursos com apoio de inteligência artificial generativa. Seu problema central é reduzir a distância entre informação disponível e conhecimento que possa ser estudado de forma progressiva, praticado, retomado e revisto.

A partir de um tema, de uma ementa, de fontes ou de materiais já reunidos, um curso pode ser planejado, produzido, revisado e estudado no próprio aplicativo. A inteligência artificial participa da autoria, mas o curso é o objeto persistente: sua estrutura, seu conteúdo, suas fontes, suas decisões de desenho e seu histórico continuam existindo independentemente da conversa usada para trabalhar sobre ele.

## O problema tratado

A disponibilidade de informação deixou de resolver, por si só, o problema de aprender. Livros, aulas, vídeos, documentação, repositórios, fóruns, cursos on-line e modelos de linguagem tornam materiais e explicações fáceis de obter. O trabalho difícil permanece: delimitar o que precisa ser aprendido, decidir por onde começar, relacionar conceitos, introduzir pré-requisitos, escolher quando aprofundar, praticar operações pertinentes e retomar o percurso depois de uma interrupção.

Esse problema é especialmente concreto para quem estuda com pouco tempo. O AraLearn surgiu de um contexto de estudo autodidata em que o estudante pode estar cansado, em deslocamento, sujeito a interrupções e com conexão instável ou inexistente. Nessa situação, uma exposição longa ou uma coleção de materiais não organizada pode ser tão pouco utilizável quanto a ausência de material.

A resposta do AraLearn não é apenas condensar informação. O produto procura transformá-la em um percurso que possa ser percorrido em etapas relacionadas, com explicação, exemplos, práticas e retorno conforme o que precisa ser compreendido ou realizado. A divisão precisa permitir avanços pequenos sem transformar o conhecimento numa coleção de fragmentos independentes.

O [modelo didático](modelo-didatico.md) desenvolve os fundamentos e as decisões educacionais que orientam essa organização. A [história do projeto](origens-do-aralearn.md) apresenta o percurso pessoal e técnico que levou a essa direção.

## O curso como objeto central

No AraLearn, um curso não é apenas um conjunto de páginas nem o resultado final de uma conversa. Ele reúne um percurso que pode continuar sendo planejado e modificado ao longo do tempo.

O conteúdo produzido permanece ligado à estrutura em que será estudado. Fontes e informações de proveniência podem acompanhar o material; decisões de desenho podem ser registradas e revistas; materializações e auditorias podem deixar rastros próprios. Uma sessão de autoria pode terminar sem que o trabalho desapareça com ela.

O percurso de estudo segue esta hierarquia:

```text
curso → módulo → lição → microssequência didática → unidade de estudo
```

Os níveis mais amplos mantêm cada avanço situado no restante do percurso. A **microssequência didática** organiza um objetivo local dentro da lição. Suas **unidades de estudo** desenvolvem as etapas necessárias para alcançá-lo por meio de explicações, exemplos, práticas e retorno.

O AraLearn não exige uma quantidade fixa de unidades para cada assunto nem uma quantidade universal de exercícios. A extensão depende do conteúdo, do objetivo e do trabalho necessário para desenvolvê-lo. Uma unidade também não precisa se limitar à prosa: fórmulas, código, tabelas, gráficos, diagramas e outras representações podem ser usados quando preservam uma relação importante ou permitem realizar a operação necessária.

Os [componentes didáticos](componentes-didaticos.md) apresentam essas representações e seu funcionamento. A [fundamentação dos componentes](fundamentacao-pedagogica-dos-resources.md) desenvolve os critérios educacionais usados para examiná-las.

## Estudo e Autoria

`Estudo` e `Autoria` trabalham sobre o mesmo curso, mas respondem a contextos diferentes.

Em **Estudo**, a prioridade é percorrer o conteúdo já produzido, realizar práticas, receber retorno, retomar o ponto alcançado, marcar unidades para rever e registrar observações com pouco atrito. Esse percurso foi concebido para continuar útil em períodos curtos e sob conectividade imperfeita. O smartphone, por isso, não é apenas uma plataforma adicional: ele é um suporte central para estudar nos intervalos em que o tempo efetivamente existe.

Em **Autoria**, o curso é planejado, produzido, inspecionado, corrigido e investigado. Esse trabalho costuma exigir mais reflexão, comparação de alternativas, exame de fontes e conexão estável com serviços remotos. A interface de Autoria torna visível um processo que, se ficasse apenas na conversa e no backend, seria difícil de acompanhar e julgar.

Os papéis podem estar separados entre pessoas ou concentrados na mesma pessoa. Um professor pode exercer a autoria enquanto estudantes usam o curso; um autodidata pode alternar entre autor, estudante e revisor. Uma deficiência percebida durante o estudo pode, mais tarde, tornar-se uma observação de autoria, uma auditoria e uma correção do curso.

Os procedimentos de estudo estão no [guia do estudante](guia-estudante.md). O trabalho de criação e manutenção de cursos é desenvolvido no [guia do professor e autor](guia-professor-autor.md).

## Autoria com inteligência artificial generativa

A autoria do AraLearn é, em grande parte, conversacional. A pessoa pode explicar em linguagem natural o que pretende criar, revisar ou investigar; uma LLM suficientemente capaz lê o estado necessário do curso, trabalha sobre planejamento, fontes, estrutura e conteúdo e usa operações delimitadas do AraLearn para persistir resultados.

Nesse processo, três responsabilidades precisam permanecer distintas.

A **pessoa autora** conserva intenção, julgamento, responsabilidade e autoridade autoral. Ela fornece contexto, materiais, fontes, restrições e observações; compara alternativas; rejeita, corrige ou aprova propostas.

A **inteligência artificial generativa** realiza grande parte do trabalho autoral: pode ajudar a analisar o contexto, estruturar o planejamento, decompor conteúdo, examinar fontes, escolher formas de representação, produzir unidades de estudo, materializar partes, interpretar observações, auditar o curso e propor correções.

O **AraLearn** estrutura e persiste esse trabalho. O sistema fornece operações tipadas, permissões, versões, validações, proveniência, materializações retomáveis, componentes com contratos próprios, auditoria e registros que permitem voltar ao curso em outra sessão.

A arquitetura conceitual não depende de um fornecedor específico de modelos. Atualmente, clientes compatíveis com o [Model Context Protocol (MCP)](autoria-mcp.md) podem trabalhar com o backend de autoria, e [Actions](autoria-actions.md) oferece uma integração específica com um GPT personalizado. A compatibilidade concreta de outros modelos depende das capacidades do cliente e do acesso às ferramentas necessárias.

A assistência integrada ao aplicativo cumpre outra função. Ela usa APIs de modelos para intervenções localizadas em conteúdo e não deve ser confundida com todo o modelo de autoria conversacional. A [assistência por modelo de linguagem](assistencia-por-ia.md) descreve esse recurso específico.

## Inspeção, fontes e decisão humana

Delegar trabalho à inteligência artificial só é útil para a autoria quando a pessoa consegue examinar o que foi produzido e intervir sobre o resultado.

A Autoria visual reúne superfícies para inspecionar estrutura e conteúdo, acompanhar materializações, consultar fontes e proveniência, registrar observações, examinar parâmetros de desenho, acompanhar auditorias e trabalhar com variantes e dados de pesquisa. Essas funções não substituem a conversa: elas tornam o curso legível e verificável para a pessoa que precisa julgar o trabalho realizado.

A interface também não restringe a inspeção ao que a IA acabou de produzir. A pessoa pode voltar a qualquer região do curso, inclusive a um trecho cuja deficiência só tenha sido percebida depois, durante o estudo.

Fontes têm função particular nesse processo. Uma explicação ou prática pode ser ligada ao material que a informou, e documentos registrados podem ser consultados durante revisão e auditoria. O AraLearn conserva as relações declaradas entre conteúdo e fonte; localizar bibliografia externa, quando necessário, depende das capacidades do ambiente de autoria utilizado.

Algumas decisões educacionais também são formalizadas como parâmetros de desenho. Torná-las explícitas permite saber qual configuração foi aplicada a determinado ponto, distinguir decisões da autoria de condições de pesquisa e comparar resultados sem tratar quantidades maiores como sinônimo automático de melhor qualidade. O [desenho instrucional parametrizado](desenho-instrucional-parametrizado.md) desenvolve essas regras.

## Continuidade do estudo

O AraLearn funciona na web e no Android e considera situações em que o estudo é interrompido ou a conexão com a internet varia. Depois que o conteúdo necessário de um curso está disponível no dispositivo, a leitura, a realização de práticas e a retomada desse conteúdo já carregado não precisam depender de uma operação remota a cada passo.

O estado necessário para continuar também pode permanecer localmente e ser sincronizado quando a conexão retorna. Isso permite interromper uma sessão e retomá-la posteriormente, além de levar o estado confirmado para outro dispositivo ligado à mesma conta.

Essa continuidade não significa que todas as operações funcionem sem conexão. Autoria conversacional, sincronização e outras mudanças que exigem confirmação do servidor continuam dependendo da comunicação necessária para realizá-las. A [persistência relacional e sincronização](persistencia-relacional.md) explica como o AraLearn distribui essas responsabilidades entre dispositivo e servidor.

## Estado pessoal e revisão

Para que um percurso possa ser interrompido e retomado, o AraLearn conserva informações pessoais de continuidade, como o ponto alcançado e as unidades marcadas para revisão. Esses registros organizam o próprio estudo e preservam escolhas entre sessões.

Esse estado não é convertido automaticamente em nota, histórico de desempenho ou medida de aprendizagem. Avançar por uma unidade ou marcá-la para rever informa o que o aplicativo precisa fazer depois; não estabelece, por si só, quanto a pessoa compreendeu ou domina aquele conteúdo.

No caso do autodidata, o estado de estudo também pode participar de um ciclo mais amplo sem perder sua função original: a pessoa estuda, percebe uma dificuldade, volta à Autoria, registra ou aprofunda observações e usa a LLM para auditar e corrigir o curso. Marcar **Rever**, porém, continua sendo uma decisão de estudo e não uma declaração automática de defeito no material.

O [estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) detalha quais registros são conservados, suas finalidades e os limites de interpretação associados a eles.

## Formalização e pesquisa

O AraLearn foi ampliado, ao longo do desenvolvimento, para tornar o processo de criação e uso de um curso mais explícito e investigável. Planejamento persistido, fontes e âncoras, parâmetros com origem e justificativa, componentes especializados, materializações, observações, auditorias, variantes e analytics permitem examinar não apenas o conteúdo final, mas também parte do processo que o produziu.

Essa formalização procura transformar produção generativa em um artefato mais rastreável, auditável e avaliável. Ela não demonstra, por si só, que uma escolha de desenho ou uma função do produto melhora a aprendizagem.

O AraLearn é, portanto, também um artefato ligado a pesquisa educacional. Propriedades técnicas podem ser verificadas no software; efeitos sobre compreensão, retomada, aprendizagem, agência ou qualidade da autoria exigem estudos que definam participantes, tarefas, condições e formas de avaliação adequadas.

A literatura pode fundamentar conceitos, decisões de projeto e hipóteses, mas não demonstra que uma função esteja implementada. Código, testes e inspeção sustentam afirmações sobre o funcionamento do produto; efeitos educacionais dependem de evidência empírica produzida para essa finalidade.

A [revisão de literatura](revisao-de-literatura.md) reúne os fundamentos externos usados pelo projeto, o [quadro teórico](quadro-teorico.md) organiza as relações propostas e o [protocolo de avaliação](protocolo-avaliacao-artefato.md) estabelece como propriedades técnicas e questões educacionais podem ser investigadas sem confundir seus tipos de evidência.

## Contextos de aplicação e fronteiras

O estudo autodidata é um contexto central do AraLearn, mas não esgota seus usos. Um curso pode ser criado por professor ou especialista para outras pessoas, usado em formação profissional, apoiar aprendizagem no trabalho ou servir a investigações educacionais compatíveis com as capacidades disponíveis.

Para um autodidata que ainda não domina o assunto, a autoria assistida por IA pode reduzir um obstáculo importante: planejar e organizar um percurso quando ainda não se conhece suficientemente o domínio para fazê-lo com segurança. Essa possibilidade aumenta, e não diminui, a importância de fontes, proveniência, auditoria e revisão humana.

O núcleo do produto continua sendo a criação, manutenção e estudo de cursos. O AraLearn não transforma automaticamente registros de uso em avaliação da aprendizagem nem trata uma resposta fluente de IA como evidência de correção ou qualidade pedagógica.

As funções disponíveis e seus limites mudam com a evolução do software. A referência corrente para verificar o que está efetivamente disponível é [Capacidades e limites atuais](estado-atual-e-roadmap.md).
