# Princípios editoriais da documentação

A documentação do AraLearn deve permitir que pessoas com formações diferentes compreendam o mesmo produto em profundidades diferentes. Um estudante autodidata pode chegar para aprender a usar o aplicativo; um professor pode querer entender o desenho instrucional; um pesquisador pode examinar construtos, evidências e limites; um engenheiro pode precisar reproduzir a arquitetura; um gestor ou administrador público pode querer avaliar dependências, segurança, privacidade, operação e adequação institucional.

Esses leitores não precisam receber documentos concorrentes. A documentação deve construir uma progressão: começar pelo problema e pelo referente concreto, introduzir os conceitos necessários, explicar a terminologia especializada e oferecer caminhos de aprofundamento técnico e acadêmico.

**Didático não significa curto. Acadêmico não significa críptico. Acessível não significa impreciso.**

## Começar pelo problema e pelo referente

Um termo técnico, pedagógico ou metodológico só ajuda quando o leitor entende o fenômeno, o objeto ou a decisão que ele nomeia.

Quando a estrutura do assunto permitir, uma explicação deve desenvolver relações semelhantes a estas:

1. qual problema ou necessidade está em jogo;
2. qual objeto, situação ou fenômeno precisa ser compreendido;
3. qual conceito ajuda a explicar esse objeto;
4. um exemplo que torne a relação observável;
5. como esse conceito se relaciona a outros;
6. qual terminologia técnica é adequada;
7. como o assunto aparece no AraLearn;
8. que decisão foi adotada e quais alternativas eram relevantes;
9. que evidência sustenta a decisão ou a interpretação;
10. quais limites permanecem;
11. onde continuar o estudo do tema.

Essa sequência orienta o raciocínio. Ela não deve ser convertida mecanicamente em onze subtítulos.

Uma página de segurança, por exemplo, não precisa começar por `RLS`, `JWT` ou `CAS`. Primeiro explica por que uma pessoa não pode ler ou alterar dados de outra e por que duas gravações concorrentes podem entrar em conflito. Depois apresenta autenticação, autorização, segurança em nível de linha e controle otimista de concorrência nos pontos em que esses mecanismos passam a ter um referente claro.

O mesmo princípio vale para educação. Carga cognitiva, prática de recuperação, validade, agência ou múltiplas representações aparecem depois que o leitor compreende o problema educacional ao qual esses conceitos respondem.

## Preservar profundidade

Simplificar a entrada não autoriza apagar conhecimento.

Quando um assunto exige desenvolvimento extenso, a documentação pode ser extensa. A profundidade deve ser distribuída em uma ordem que permita avançar sem pressupostos desnecessários.

Um leitor interessado em engenharia deve encontrar material suficiente para compreender e reproduzir o sistema. Um pesquisador deve encontrar conceitos, métodos, hipóteses, métricas, limitações e literatura. Um autor deve compreender o desenho instrucional e as decisões que pode controlar. Um estudante deve conseguir usar o produto sem dominar previamente nenhuma dessas camadas.

Quando uma passagem acumular informação demais, reduza o escopo daquela passagem e distribua o conteúdo. Não comprima vários conceitos novos numa frase mais abstrata.

## Usar terminologia técnica com rigor

A documentação utiliza a terminologia adequada de cada domínio quando ela acrescenta precisão.

Isso inclui, quando pertinente, educação, design instrucional, psicologia cognitiva, avaliação educacional, estatística, metodologia científica, filosofia da ciência, sociologia, gestão do conhecimento, interação humano-computador, UX, UI, acessibilidade, engenharia de software, sistemas distribuídos, desenvolvimento web, bancos de dados, segurança, privacidade, infraestrutura, computação móvel, inteligência artificial, sistemas de informação e Learning Analytics.

A presença de muitos domínios não é objetivo por si só. Uma disciplina deve entrar quando ajuda a responder uma pergunta real sobre o artefato.

Termos especializados são apresentados depois do conceito que ajudam a nomear. Quando existir uma expressão técnica consagrada em inglês e ela for útil para pesquisa posterior, a primeira ocorrência pode apresentar o equivalente em português e o termo original.

Nomes próprios de padrões, protocolos, produtos, bibliotecas, instituições e trabalhos acadêmicos permanecem reconhecíveis para que o leitor possa localizá-los.

Termos sobrecarregados devem receber qualificação quando dois domínios puderem ser confundidos.

## Distinguir o que é produto, teoria, hipótese e evidência

A documentação deve separar afirmações de naturezas diferentes.

Uma ideia pode ser:

- uma definição operacional do AraLearn;
- uma decisão de desenho;
- uma propriedade implementada;
- uma proposição teórica;
- uma hipótese do artefato;
- um resultado obtido em outro estudo;
- uma evidência empírica produzida com o próprio AraLearn.

Essas categorias não são intercambiáveis.

Testes de software podem demonstrar comportamento sob condições exercitadas. Eles não demonstram, sozinhos, compreensão, usabilidade ou aprendizagem.

Uma norma pode estabelecer requisitos de acessibilidade ou segurança. Ela não demonstra efeito educacional.

Uma associação observada em dados não autoriza, por si, inferência causal.

Um termo próprio do AraLearn, como **Microssequência didática**, **Parte de autoria** ou **estado de estudo não punitivo**, deve ser descrito como conceito operacional do produto quando essa for sua natureza. A proximidade com um construto da literatura não transforma automaticamente o termo do produto em constructo científico estabelecido.

## Organizar a documentação por função

Cada documento deve ter uma função predominante.

### Compreender e usar

README, visão do produto, uso do aplicativo, guias e solução de problemas devem ser compreensíveis sem formação prévia em engenharia, educação ou pesquisa.

Eles explicam para que serve o AraLearn, o que a pessoa encontra, como realizar uma tarefa, qual resultado esperar e como recuperar-se de falhas relevantes.

### Aprofundamento conceitual e acadêmico

Documentos sobre aprendizagem, desenho instrucional, componentes, pesquisa, métricas, metodologia e aspectos sociotécnicos desenvolvem conceitos, relações, alternativas, controvérsias, evidências e limites de inferência.

A literatura aparece como parte do argumento, não como lista decorativa.

### Aprofundamento técnico

Documentos de engenharia explicam a arquitetura corrente, tecnologias, persistência, autorização, sincronização, contratos, APIs, armazenamento, segurança, implantação, testes e recuperação.

Detalhe técnico não é bastidor quando ajuda a compreender ou reproduzir o sistema corrente. O texto técnico, porém, continua obrigado a construir o referente antes de exigir domínio do vocabulário especializado.

### Referência

Glossários, dicionários, contratos e matrizes favorecem consulta precisa. Eles complementam explicações narrativas; não precisam substituí-las.

### Avaliação

Documentos de avaliação relacionam proposições, métodos, evidências, riscos de validade e limites de generalização.

### História

História de versões pertence ao Git, ao CHANGELOG, às notas de release e a documentos explicitamente históricos quando houver função pública clara.

## Manter uma fonte principal para cada informação

Informações mutáveis devem ter uma fonte principal. Outros documentos podem resumir ou apontar para ela, mas não devem manter versões concorrentes do mesmo conteúdo.

| Informação | Fonte principal |
| --- | --- |
| finalidade e compromissos do produto | [Visão do produto](visao-do-produto.md) |
| percursos de leitura | [Mapa da documentação](README.md) |
| procedimento de uso | guia do público ou da tarefa correspondente |
| fundamentos conceituais | capítulo conceitual do assunto |
| arquitetura e mecanismo corrente | documento técnico correspondente |
| vocabulário técnico e construtos | glossários e vocabulário controlado |
| relação entre alegação, implementação e verificação | matriz de conformidade pertinente |
| metadados bibliográficos | [`referencias.bib`](referencias.bib) |
| bibliografia legível | [`referencias.md`](referencias.md) |
| história de versões | CHANGELOG e notas de release |

Quando um comportamento muda, a documentação corrente deve ser reescrita para representar o novo estado. Acrescentar uma cronologia no final da seção não substitui essa atualização.

## Documentar integralmente a engenharia

Documentação integral da engenharia não significa comentar cada função, arquivo ou tabela.

Significa que todo subsistema vivo e material possui um percurso encontrável que permita compreender, conforme o assunto exigir:

- o problema que resolve;
- sua finalidade;
- o modelo mental necessário;
- sua fronteira de responsabilidade;
- suas relações com outros subsistemas;
- os fluxos de dados e de controle;
- as fontes de autoridade;
- autenticação e autorização;
- persistência e sincronização;
- concorrência;
- funcionamento sem conexão;
- segurança e privacidade;
- falhas e recuperação;
- limites;
- tecnologias utilizadas;
- formas de verificação.

Uma tecnologia deve ser apresentada no ponto em que passa a resolver um problema já compreendido.

A documentação não deve se limitar a afirmações como “o AraLearn usa PostgreSQL, IndexedDB e Supabase”. Ela deve explicar por que cada mecanismo aparece, o que faz, onde termina sua responsabilidade e como se relaciona com os demais.

## Ligar tecnologias a fontes oficiais

Quando um produto, protocolo, padrão, serviço ou tecnologia disponível na web for relevante para compreender, instalar, operar ou aprofundar um assunto, a documentação deve apontar para uma fonte oficial adequada.

Use, conforme o caso:

- especificações e normas;
- documentação oficial do produto ou protocolo;
- documentação de APIs;
- páginas institucionais;
- documentação de bibliotecas mantida pelo projeto responsável.

Links tecnológicos não substituem bibliografia acadêmica quando a afirmação é empírica.

Bibliografia acadêmica não substitui especificações ou documentação oficial quando a afirmação é sobre o funcionamento corrente de um protocolo ou produto.

Não transforme capítulos em listas de fornecedores. O link aparece depois que a função da tecnologia foi explicada.

## Sustentar afirmações externas

Afirmações externas técnicas, acadêmicas, metodológicas, históricas ou normativas precisam de fonte adequada ao tipo de afirmação.

A citação deve aparecer no texto no ponto em que a afirmação depende dela.

A fonte precisa sustentar o alcance real da frase. Uma referência não deve ser usada apenas porque seu título parece relacionado.

Quando a literatura apresentar resultados contraditórios, nulos ou dependentes de contexto, essas condições devem permanecer visíveis quando alterarem a interpretação.

### Escolher fontes conforme a pergunta

Para educação, aprendizagem e interação humana, a seleção pode incluir, conforme a pergunta:

- revisões sistemáticas;
- meta-análises;
- revisões de escopo;
- trabalhos fundamentais;
- estudos primários pertinentes;
- trabalhos teóricos;
- literatura metodológica;
- normas.

Uma obra fundamental não deixa de ser relevante por ser antiga. Uma publicação não se torna adequada apenas por ser recente.

Em áreas que mudam rapidamente, como IA generativa e Human-AI Interaction, afirmações sobre o estado corrente devem considerar também literatura recente.

Para engenharia, especificações, normas e documentação oficial são as principais autoridades para o comportamento de protocolos e tecnologias correntes. Literatura acadêmica complementa esse material quando a afirmação envolve fatores humanos, segurança, privacidade, sistemas distribuídos, desempenho ou propriedades empíricas.

Para ética, privacidade e direitos, diferencie requisito legal, orientação institucional, decisão de produto e questão metodológica.

## Manter citações e bibliografia verificáveis

`referencias.bib` é a fonte canônica de metadados bibliográficos.

`referencias.md` oferece a representação legível do corpus completo.

Documentos técnicos, conceituais e acadêmicos que façam afirmações externas devem usar o padrão bibliográfico adotado pelo projeto. Quando houver seção local de **Referências**, ela deve conter somente as obras efetivamente citadas naquela página e derivar dos mesmos metadados canônicos.

A bibliografia geral também deve permitir aprendizagem. Além de localizar uma obra por autoria, um leitor deve conseguir encontrar caminhos temáticos, reconhecer leituras fundamentais, sínteses e aprofundamentos, entender por que uma fonte é relevante e conhecer seus limites de uso.

Uma orientação temática não deve duplicar manualmente os metadados completos da bibliografia.

### Registrar pesquisas bibliográficas com honestidade

Novas buscas destinadas a ampliar o corpus seguem o protocolo bibliográfico vigente.

Registre apenas o que realmente ocorreu.

Diferencie:

- metadado conferido;
- título avaliado;
- resumo lido;
- texto integral lido;
- informação obtida por uma síntese;
- inferência feita para o AraLearn.

Catálogos e serviços de metadados ajudam a confirmar identidade bibliográfica. Eles não demonstram, sozinhos, método, população ou resultado de um estudo.

## Separar documentação corrente de bastidor

A documentação corrente explica o produto, sua engenharia, seus fundamentos, seus limites e seu uso.

Ela não deve funcionar como diário de implementação, backlog, relato de depuração ou transcrição do processo de desenvolvimento.

Não pertencem aos capítulos correntes:

- prompts ou instruções de desenvolvimento;
- conversas internas;
- issues e pull requests como narrativa do produto;
- tentativas e improvisações;
- checkpoints internos;
- contagens de tokens;
- comentários de ferramentas de desenvolvimento;
- cronologias de correção que não ajudem o leitor a compreender o estado atual.

Ferramentas de inteligência artificial podem e devem aparecer quando forem funcionalidade do AraLearn, tecnologia explicada, objeto de pesquisa ou risco sociotécnico pertinente. O processo interno usado para produzir o código não é conteúdo necessário à documentação pública corrente.

## Tratar genealogia com cuidado

A genealogia do AraLearn pode ajudar a explicar os problemas que motivaram o artefato.

Ela deve diferenciar:

- relato biográfico declarado;
- interpretação sobre como uma experiência influenciou o desenho;
- hipótese;
- evidência científica.

A genealogia não deve se tornar currículo, narrativa heroica ou argumento de autoridade.

Vínculo com uma instituição não implica endosso institucional. Uma experiência pessoal com uma instituição não autoriza avaliação geral daquela instituição.

Fatos biográficos só devem ser publicados quando houver autoridade explícita para fazê-lo.

## Escrever em português natural

A documentação deve desenvolver ideias e relações, em vez de acumular estruturas que apenas aparentem organização.

Evite, quando não tiverem função:

- metadiscurso sobre o próprio texto;
- enumerações mecânicas;
- listas excessivamente simétricas;
- paralelismo repetitivo;
- cadeias de substantivos abstratos;
- múltiplos conceitos novos na mesma frase;
- negativas que apenas cercam uma afirmação simples;
- fórmulas repetidas como “não apenas X, mas também Y”;
- o verbo “combinar” usado como relação genérica;
- qualificadores vagos ou promocionais;
- anglicismos dispensáveis;
- travessão como recurso estilístico recorrente;
- conclusões que apenas repetem a introdução;
- linguagem pseudacadêmica baseada em jargão não explicado.

Isso não é uma lista de palavras proibidas. A qualidade da frase depende de seu papel no argumento.

Um texto acadêmico pode ser formal sem ser opaco. Um texto introdutório pode ser simples sem ser superficial.

## Escrever exemplos e instruções úteis

Um exemplo precisa revelar a relação ou a regra que pretende ensinar.

Exemplos simples demais podem esconder problemas de escala. Casos excessivamente particulares podem fazer parecer que há uma restrição inexistente.

Instruções devem descrever ações observáveis, resultados reconhecíveis e formas de recuperação quando necessárias.

Nomes de botões e áreas devem coincidir com a interface vigente.

Identificadores internos aparecem apenas quando sua grafia exata for necessária para uma tarefa técnica.

## Não escrever para o teste

A linguagem da documentação pública não deve ser moldada por detalhes dos testes automatizados.

Seletores CSS, nomes de handlers, tolerâncias geométricas, hashes, identificadores de workflows, migrations e contagens de testes pertencem aos artefatos técnicos que deles realmente dependem.

Um teste pode verificar uma propriedade. A explicação destinada a pessoas deve apresentar a propriedade em linguagem adequada ao leitor.

## Fazer do mapa da documentação uma entrada real

O mapa da documentação deve permitir que a pessoa entre pelo que deseja compreender ou fazer.

Entre os percursos relevantes estão:

- começar a usar o AraLearn;
- estudar;
- criar e revisar cursos;
- compreender Assistência por IA e integrações conversacionais;
- estudar a engenharia;
- instalar e operar;
- compreender segurança e privacidade;
- estudar fundamentos educacionais;
- investigar o artefato academicamente;
- compreender sua genealogia;
- encontrar bibliografia e caminhos de aprofundamento.

Se o índice promete um percurso que os documentos não entregam, é o corpus ou o índice que precisa ser corrigido.

## Revisar antes de publicar

Verificação automática é necessária, mas não suficiente.

Automação pode encontrar links quebrados, chaves bibliográficas desconhecidas, termos abolidos, corrupção de codificação e algumas classes de inconsistência.

Ela não consegue demonstrar, sozinha, que:

- a progressão é didática;
- o argumento é intelectualmente honesto;
- uma citação sustenta o alcance da frase;
- a bibliografia é adequada à pergunta;
- um conceito foi explicado antes de ser exigido;
- o corpus preservou todo conhecimento corrente relevante;
- a prosa é natural.

Antes de concluir uma alteração substancial, revise:

- progressão das ideias;
- naturalidade do português;
- precisão terminológica;
- coerência entre documentos;
- correspondência com o produto corrente;
- suficiência da engenharia documentada;
- distinção entre hipótese, implementação e evidência;
- qualidade das fontes;
- referências locais;
- links de aprofundamento;
- ausência de bastidor;
- integridade de UTF-8;
- conhecimento útil que possa ter sido perdido em versões anteriores.

Quando uma reestruturação documental for material, compare estados anteriores relevantes. Restaure conhecimento que continua correto e necessário, atualizado para o produto vigente. Não restaure história, arquitetura ou terminologia superadas apenas porque apareceram em uma versão antiga.

Revisão independente pode procurar omissões e contradições. Ela complementa, mas não substitui, a responsabilidade editorial sobre o corpus.
