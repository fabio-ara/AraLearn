# Fundamentos, pesquisa e governança

AraLearn é, ao mesmo tempo, artefato técnico, proposta pedagógica e posição sobre autoria assistida. O projeto embute escolhas sobre o que conta como estudo, como a assistência por IA deve ser limitada, que tipo de autonomia o usuário preserva e quais riscos precisam permanecer visíveis. Este documento reúne essas bases de leitura. As obras citadas ao longo do texto aparecem listadas integralmente na seção [Referências bibliográficas](#referências-bibliográficas), com identificadores e links estáveis quando eles existem em forma editorial adequada.

A arquitetura está em [Arquitetura](arquitetura.md), os fluxos de IA estão em [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md), e o contrato persistido está em [Contrato público](aralearn-contract.md).

## Problema de fundo

O AraLearn responde a um problema contemporâneo: há mais informação disponível do que capacidade prática de organizar, exercitar e retomar esse material.

Busca, enciclopédias, documentação técnica, vídeos, fóruns e IA generativa ampliam o acesso. Ainda assim, o estudante precisa construir forma: recorte, sequência, prática, revisão e continuidade. Herbert Simon ajuda a formular esse ponto ao observar que a abundância de informação consome atenção (SIMON, 1971).

O AraLearn propõe uma mediação: uma estrutura externa editável em que o usuário trabalha sobre a informação, em vez de apenas acumulá-la.

## Lugar diante de outros produtos

AraLearn dialoga com ferramentas conhecidas, mas não se reduz a nenhuma delas.

[Anki](https://apps.ankiweb.net/) mostra a força de cards e revisão. [Duolingo](https://www.duolingo.com/) e [SoloLearn](https://www.sololearn.com/) mostram como percursos retomáveis reduzem atrito. [Obsidian](https://obsidian.md/) e tradições de notas conectadas mostram a importância de organizar conhecimento com participação ativa do usuário. [Google Search](https://www.google.com/search/about/) e [Wikipédia](https://www.wikipedia.org/) ajudam a encontrar e consultar informação. [NotebookLM](https://notebooklm.google/) aproxima fontes explicitamente selecionadas e geração textual. Plataformas de fluxo contínuo mostram a força cultural de unidades pequenas e atenção fragmentada.

O AraLearn ocupa uma lacuna entre essas formas: transformar material heterogêneo em trilhas editáveis de estudo, com microssequências, prática, validação, persistência local e assistência por IA.

## Fundamentos pedagógicos

O app parte da ideia de que estudar exige mais que exposição a explicações ou resumos. Uma resposta pronta pode produzir familiaridade sem consolidação. Por isso, o AraLearn aproxima explicação e prática dentro de uma microssequência e evita tratar o card como peça isolada.

Essa escolha dialoga com pesquisas sobre recuperação ativa e prática de teste. Em vez de assumir que ver um conteúdo basta, o desenho do produto supõe que o estudante precisa evocar, aplicar, distinguir casos, reconhecer erro provável e retomar a regra em situação concreta. Nessa linha, a prática não aparece só no fim do curso; ela aparece distribuída ao longo da trilha (KARPICKE; ROEDIGER III, 2008).

O desenho também conversa com a ideia de dificuldades desejáveis, associada a Robert A. Bjork e Elizabeth L. Bjork. O ponto não é tornar o estudo artificialmente difícil, mas evitar facilidades enganosas: explicações excessivamente compactas, prática sem contexto, resposta revelada na própria pergunta ou ausência de variação entre casos. A arquitetura do app tenta impedir justamente esse tipo de conforto improdutivo (BJORK; BJORK, 2011).

Outra base importante é a teoria da carga cognitiva, associada a John Sweller, e a literatura sobre exemplos resolvidos. Em temas com notação, procedimento ou formalismo, exigir autonomia cedo demais pode gerar sobrecarga. Por isso, o AraLearn favorece progressão: situar, exemplificar, praticar com apoio, variar o caso e só depois aumentar a exigência local (SWELLER, 1988).

A variedade de recursos de card conversa com pesquisas sobre aprendizagem multimídia, sobretudo as de Richard E. Mayer. A regra de projeto, porém, é mais estrita do que "usar mais mídia". Representação só deve entrar quando melhora a tarefa didática. Uma matriz deve preservar a forma matricial que o estudante precisa reconhecer; um plano deve mostrar coordenada ou vetor quando o conteúdo é espacial; um grafo deve mostrar vértices, arestas e relações quando isso é parte do problema (MAYER, 2009).

## Mediação, autoria e autonomia

O AraLearn dialoga com tradições que entendem aprendizagem como processo mediado. Vygotsky ajuda a pensar que o desempenho do estudante não é apenas atributo interno fixo; ele depende também dos instrumentos e formas de mediação postos em circulação (VYGOTSKY, 1978). Bruner e a literatura sobre andaimes didáticos ajudam a pensar progressão, apoio e retirada gradual de suporte (BRUNER, 1978).

No produto, isso aparece na própria unidade da microssequência. Ela permite que o apoio seja local, delimitado e retirável. O usuário pode pedir uma etapa de reforço, corrigir uma explicação, abrir uma ramificação de apoio e depois voltar à trilha principal sem reescrever o curso inteiro.

Paulo Freire é relevante aqui porque, em *Pedagogia da autonomia*, autonomia não significa abandono do estudante à própria sorte; significa formação para ação crítica, apropriação do processo e recusa de uma relação puramente bancária com o saber (FREIRE, 1996). O AraLearn não pretende encarnar sozinho esse ideal, mas tenta preservar condições mínimas para ele: o usuário vê a estrutura, pode revisar o material, discordar da proposta gerada e reescrever o percurso. A IA reduz atrito de autoria e deve permanecer subordinada ao juízo humano.

## IA, autoria e controle

A IA generativa facilita a produção de explicações, exemplos e exercícios. Isso ajuda, mas também pode gerar passividade: o usuário aceita texto plausível sem examinar origem, progressão ou adequação.

O AraLearn procura reduzir esse risco por arquitetura. A IA trabalha dentro de uma árvore, com escopo, contrato público, validação e revisão humana. O modelo reduz atrito de autoria; o usuário mantém poder de revisão.

Esse ponto também precisa ser descrito tecnicamente com precisão. No fluxo principal atual, o app seleciona contexto estruturalmente: etapa aberta, dependências, referências escolhidas, próxima etapa e fontes anexadas. Essa delimitação é deliberada. Ela melhora a auditabilidade do que foi efetivamente usado em cada intervenção e combina bem com o uso de campos controlados, catálogos fechados e valores canônicos no motor de geração.

## Tensões críticas

Tecnologias educacionais não são neutras. Elas organizam atenção, classificam avanço, registram decisões e induzem formas de responder.

Lyotard ajuda a pensar a relação entre conhecimento, sistemas informacionais e performatividade. O risco é reduzir conhecimento a desempenho, eficiência e produção de respostas úteis, como se aprender fosse apenas otimizar saídas (LYOTARD, 1979/2009).

Foucault ajuda a pensar disciplina, exame e normalização. Classificar, sequenciar, registrar e corrigir podem apoiar aprendizagem, mas também podem servir a controle, especialmente em usos institucionais. O que no nível individual aparece como apoio pode, em outra escala, aparecer como observação intensiva, ranqueamento e padronização (FOUCAULT, 1975/1987).

O AraLearn não elimina essas tensões. Ele tenta torná-las visíveis por meio de autoria local, contrato exportável, versões, validação e possibilidade de revisão humana.

Ivan Illich é útil para lembrar que uma ferramenta educacional pode ampliar capacidade de uso autônomo ou produzir dependência disfarçada de conveniência (ILLICH, 1973). Gilbert Simondon ajuda a tratar o objeto técnico como realidade dotada de modo de existência próprio e de relações específicas com seu meio associado (SIMONDON, 1958). Pierre Lévy ajuda a enquadrar o problema na transformação contemporânea das tecnologias da inteligência: o desafio não é só armazenar informação, mas organizar operações de leitura, seleção, retomada e produção de sentido (LÉVY, 1993).

## Riscos concretos

Riscos que o projeto deve reconhecer:

- transformar conhecimento em sequência de tarefas;
- confundir aprendizagem com desempenho mensurável;
- reforçar visão única produzida por IA;
- padronizar linguagem, exemplos e critérios;
- ocultar disputas conceituais ou históricas;
- induzir dependência do usuário em relação ao modelo;
- registrar detalhes demais sobre estudo, erro, dúvida e preferência;
- permitir uso institucional para vigilância ou punição;
- criar assimetria entre quem controla o sistema e quem executa a trilha.

## Diretrizes de governança

### Autoria visível

O usuário deve ver e editar a estrutura. A IA não deve ocultar o processo de organização.

### Escopo revisável

O que entra e o que fica fora deve ser explícito, editável e exportável.

### Versões preservadas

Alterações não devem apagar o percurso anterior sem possibilidade de inspeção.

### Mínimo de dados

O app deve evitar coleta desnecessária de dados de estudo. Quanto mais íntimo o dado cognitivo, maior o dever de minimização.

### Persistência local

O desenho com persistência local como padrão reduz dependência de servidor e favorece controle do usuário. Quando houver API remota, o envio de contexto deve ser claro.

### Pluralidade de fontes

A geração por IA deve poder ser confrontada com anotações, bibliografia, professor, documentação, listas e revisão humana.

### Exportação

O projeto deve permanecer exportável em contrato público, para evitar aprisionamento em plataforma.

### Juízo humano

O app deve apoiar estudo, não decidir sozinho o que é verdadeiro, importante ou suficiente.

## Hipóteses de design

Hipóteses que podem orientar avaliação:

- uma estrutura explícita reduz desorientação diante de material abundante;
- microssequências ajudam o usuário a iniciar e retomar o estudo;
- separar planejamento da trilha e geração local aumenta controle editorial;
- cards situados em trilha tendem a ser mais compreensíveis do que cards soltos;
- revisão por versão favorece inspeção do conteúdo gerado;
- contratos e validação reduzem passividade diante da IA;
- persistência local ajuda rotinas de estudo fragmentadas.

Essas hipóteses ainda precisam de investigação específica. Não devem ser apresentadas como resultados comprovados sem evidência.

## Referências de produto e serviço

Quando o AraLearn se compara a outros produtos, a referência é funcional. Os principais marcos mencionados nesta documentação são:

- [Anki](https://apps.ankiweb.net/), como referência em flashcards e repetição espaçada;
- [Obsidian](https://obsidian.md/), como referência em notas locais e base de conhecimento pessoal;
- [NotebookLM](https://notebooklm.google/), como referência em trabalho com fontes explicitamente selecionadas;
- [DeepSeek API](https://api-docs.deepseek.com/), [Gemini API](https://ai.google.dev/api) e [ChatGPT](https://openai.com/index/chatgpt/), como referências de serviços e produtos de geração textual;
- [Google Search](https://www.google.com/search/about/) e [Wikipédia](https://www.wikipedia.org/), como referências de acesso e consulta a informação.

Essas comparações não significam equivalência entre produtos. Elas servem para situar o lugar do AraLearn no ecossistema e esclarecer que problema específico ele tenta resolver.

## Perguntas de pesquisa

Perguntas possíveis:

- O app ajuda a transformar material disperso em percurso estudável?
- A árvore curso, módulo, lição, microssequência e card melhora a orientação?
- Ver microssequências planejadas antes dos cards aumenta clareza do caminho?
- O usuário revisa mais quando a estrutura é visível e editável?
- Gerar uma etapa por vez reduz excesso de material?
- A prática dentro das microssequências melhora a compreensão de procedimentos?
- Professores conseguem adaptar o material sem depender integralmente da IA?
- O app muda a relação do usuário com respostas geradas por modelo?

## Métodos e indicadores

O AraLearn pode ser investigado por entrevistas, observação de uso, estudos de caso, análise de sessões de estudo, comparação entre trilhas estruturadas e coleções soltas de cards, avaliação por professores e inspeção de versões geradas e revisadas.

Indicadores possíveis incluem tempo até iniciar estudo, número de microssequências revisadas, proporção de etapas materializadas, frequência de retorno, inconsistências detectadas, intervenções manuais, clareza percebida da trilha, sensação de controle e qualidade dos exercícios segundo avaliadores humanos.

Nenhum indicador isolado basta. O produto deve ser avaliado por conjunto de evidências.

## O que o app pode afirmar

O AraLearn pode afirmar que procura:

- organizar material disperso em trilhas revisáveis;
- separar planejamento de trilha e geração local de cards;
- situar cards dentro de microssequências;
- aproximar explicação e prática;
- preservar autoria humana;
- usar IA com contrato e validação;
- manter o estudo disponível localmente depois de salvo.

## O que ainda exige pesquisa

O app não deve afirmar, sem investigação específica:

- melhora garantida de aprendizagem;
- superioridade universal sobre outros métodos;
- neutralidade pedagógica;
- adequação automática a qualquer área;
- confiabilidade plena de conteúdo gerado por IA;
- substituição da revisão docente ou discente.

## Critério de honestidade

Em apresentação pública ou acadêmica, convém separar o que está implementado, o que é decisão arquitetural, o que é hipótese didática, o que já foi observado e o que ainda precisa ser avaliado.

Uma formulação simples orienta o projeto:

> a estrutura deve aumentar a capacidade do usuário de compreender, revisar e se apropriar do material; não apenas aumentar sua eficiência em cumprir tarefas.

## Referências bibliográficas

- BJORK, Robert A.; BJORK, Elizabeth L. Making things hard on yourself, but in a good way: creating desirable difficulties to enhance learning. In: GERNBACHER, Morton Ann et al. *Psychology and the real world: essays illustrating fundamental contributions to society*. New York: Worth, 2011.
- BRUNER, Jerome S. The role of dialogue in language acquisition. In: SINCLAIR, A.; JARVELLA, R. J.; LEVELT, W. J. M. *The child's conception of language*. New York: Springer, 1978.
- FOUCAULT, Michel. *Vigiar e punir: nascimento da prisão*. Petrópolis: Vozes, 1987. Publicação original em 1975.
- FREIRE, Paulo. *Pedagogia da autonomia: saberes necessários à prática educativa*. São Paulo: Paz e Terra, 1996.
- ILLICH, Ivan. *Tools for conviviality*. New York: Harper & Row, 1973.
- KARPICKE, Jeffrey D.; ROEDIGER III, Henry L. The critical importance of retrieval for learning. *Science*, v. 319, n. 5865, p. 966-968, 2008. DOI: [10.1126/science.1152408](https://doi.org/10.1126/science.1152408).
- LÉVY, Pierre. *As tecnologias da inteligência: o futuro do pensamento na era da informática*. Rio de Janeiro: Editora 34, 1993.
- LYOTARD, Jean-François. *A condição pós-moderna*. Rio de Janeiro: José Olympio, 2009. Publicação original em 1979.
- MAYER, Richard E. *Multimedia learning*. 2. ed. New York: Cambridge University Press, 2009. DOI: [10.1017/CBO9780511811678](https://doi.org/10.1017/CBO9780511811678). Página da editora: [Cambridge University Press](https://www.cambridge.org/core/books/multimedia-learning/7A62F072A71289E1E262980CB026A3F9).
- SIMON, Herbert A. Designing organizations for an information-rich world. In: GREENBERGER, Martin (org.). *Computers, communications, and the public interest*. Baltimore: Johns Hopkins Press, 1971.
- SIMONDON, Gilbert. *Du mode d'existence des objets techniques*. Paris: Aubier, 1958.
- SWELLER, John. Cognitive load during problem solving: effects on learning. *Cognitive Science*, v. 12, n. 2, p. 257-285, 1988. DOI: [10.1016/0364-0213(88)90023-7](https://doi.org/10.1016/0364-0213(88)90023-7).
- VYGOTSKY, Lev S. *Mind in society: the development of higher psychological processes*. Cambridge, MA: Harvard University Press, 1978.
