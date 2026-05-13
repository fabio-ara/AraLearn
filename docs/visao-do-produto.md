# Visão do produto

Este documento apresenta o AraLearn como produto, como artefato técnico e como proposta intelectual. Ele foi escrito para quem precisa entender a aplicação antes de entrar no código, na discussão didática ou na avaliação acadêmica.

## O problema a que o AraLearn responde

O problema contemporâneo da aprendizagem já não é apenas o acesso à informação. A informação está por toda parte: web aberta, vídeos, documentação, plataformas de curso, fóruns, repositórios, redes sociais e, mais recentemente, modelos de linguagem capazes de produzir explicações, exemplos e respostas em segundos. O que continua difícil é converter esse excesso em percurso.

Muitas pessoas sabem o que querem aprender, mas não sabem:

- por onde começar;
- como delimitar o recorte certo;
- que parte deve ser explicada antes de ser cobrada;
- em que formato vale praticar;
- como revisar;
- como retomar depois de um intervalo;
- como organizar, sem se perder, a massa de material que a própria web e as LLMs oferecem com tanta facilidade.

Esse problema se agrava no caso do estudante trabalhador, cansado, sujeito a interrupções, deslocamentos e múltiplas demandas. Nesses contextos, a dificuldade não é apenas “entender o conteúdo”; é sustentar organização cognitiva e continuidade prática.

## A resposta do produto

O AraLearn é uma aplicação open source, local-first e mobile-first que transforma dúvidas, materiais e intenções de estudo em percursos didáticos organizados por uma hierarquia explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A unidade didática central não é o card, mas a microssequência. O card é a unidade interativa; a microssequência é a unidade de progressão. Essa distinção é importante porque o produto não trata aprendizagem como coleção plana de itens soltos. O que interessa não é apenas “ter perguntas”, mas articular contexto, explicação, exemplo, prática e retomada.

Em vez de servir como repositório passivo de notas, o AraLearn procura funcionar como motor de transformação didática. Conteúdo disponível vira estudo guiado. Dúvida pontual vira prática executável. Material disperso vira organização. Revisão e edição deixam de ser atividades externas ao estudo e passam a ocorrer no mesmo ambiente.

## Dois movimentos complementares

O produto trabalha com dois movimentos que se completam.

O primeiro é top-down. Ele é útil quando o problema é a organização de uma massa maior de conteúdo: disciplina, ementa, conjunto de textos, documentação, plano de curso, trilha de formação. Nesse caso, o usuário precisa montar um percurso mais amplo, distribuído em cursos, módulos e lições.

O segundo é bottom-up. Ele é útil quando o problema já apareceu no estudo concreto: uma dúvida localizada, um procedimento específico, um ponto de notação, um erro recorrente, uma operação que não ficou clara. Nesse caso, não faz sentido pedir ao sistema que reorganize uma disciplina inteira. O que faz sentido é gerar, revisar ou aprofundar uma microssequência localizada no contexto certo.

O AraLearn combina esses dois movimentos porque a aprendizagem real exige os dois. Sem top-down, a pessoa continua afogada em material disperso. Sem bottom-up, a organização ampla não ajuda quando o entendimento trava em um ponto específico.

## De onde vem essa direção

O AraLearn não nasce do vazio. Há influências explícitas de produto, de prática de estudo e de reflexão intelectual.

Do lado dos produtos, Anki ajuda a evidenciar o valor da recuperação ativa; Duolingo mostra a força de unidades pequenas e recorrência; Obsidian explicita o valor de um repositório pessoal articulado; Wikipédia continua exemplar como estrutura aberta de conhecimento; Git fornece um imaginário forte de versionamento, reversibilidade e histórico; X expõe, em escala radical, um mundo em que a informação circula em fragmentos rápidos, porém raramente chega organizada como aprendizagem.

Do lado intelectual, o projeto dialoga com a tradição estruturalista e com críticas à circulação contemporânea do saber. Em Saussure e no estruturalismo, uma unidade não se define isoladamente, mas por relações dentro de um sistema; no AraLearn, uma unidade didática também precisa ser lida na estrutura maior em que se insere. Em Lyotard, o saber aparece cada vez mais como informação operacionalizável; no AraLearn, esse diagnóstico ajuda a compreender por que hoje é tão fácil obter conteúdo e tão difícil convertê-lo em formação. Em Foucault, qualquer tecnologia que registra, classifica e acompanha trajetórias de sujeitos merece suspeita; no AraLearn, isso reaparece como cuidado com rastreabilidade, controle local e recusa de autoridade automática da IA.

## O que o AraLearn não é

O AraLearn não é aplicativo de resumo. Não é chatbot generalista. Não é mecanismo de resposta livre sem contenção. Não é ferramenta que substitui leitura longa, aula, fonte primária ou reflexão crítica. Não é máquina de gerar quantidade para dar sensação de completude.

Sua aposta é outra: em vez de condensar tudo em explicação geral, decompor. Em vez de responder amplamente, situar. Em vez de produzir volume, organizar progressão. Em vez de esconder a transformação feita pela IA, tratá-la como etapa revisável.

## O que existe hoje

No estado atual, o app já reúne um conjunto funcional relevante:

- organização em cursos, módulos, lições, microssequências e cards;
- contrato JSON público para projetos e recortes estruturais;
- importação e exportação de estrutura;
- backup completo do estado local;
- persistência de progresso no dispositivo;
- geração estrutural contextual;
- geração contextual de microssequências na lição;
- geração e edição de cards no painel da microssequência;
- aplicação direta de iterações com possibilidade de aceitar ou excluir;
- separação entre rascunho (`draft`) e conteúdo pronto para estudo;
- exclusão do estudo por `included: false` sem apagar a microssequência da árvore;
- formatos de apresentação e prática que incluem texto, escolha, código, tabela, árvore, fluxograma, plano cartesiano e matriz.

## A função da inteligência artificial

No AraLearn, a inteligência artificial não entra como autora soberana do percurso. Ela entra como força de transformação sob restrição. O app define contexto, contratos, formato esperado, recursos permitidos, plano dos cards, critérios de validação e regras de aplicação. A LLM preenche ou repara conteúdo dentro desse envelope.

Essa decisão não é apenas técnica; ela é também metodológica. Em vez de pedir ao modelo que “pense didaticamente sobre tudo”, o AraLearn desloca parte da inteligência para a arquitetura. Isso torna mais plausível o uso de modelos leves ou baratos e reduz a dependência de respostas amplas, opacas e difíceis de verificar.

## A experiência desejada

Toda a direção de UI e UX do produto busca reduzir atrito. O estudante não deve precisar aprender uma máquina complicada antes de conseguir estudar. A interface, por isso, procura:

- preservar hierarquia estável;
- tornar as ações principais explícitas;
- concentrar geração no nível apropriado;
- reduzir passos desnecessários;
- manter o estudo, a revisão e a edição próximos;
- facilitar retomada depois de interrupção.

Essa simplicidade não é minimalismo vazio. Ela responde a uma finalidade concreta: oferecer estrutura externa para quem já está cognitivamente sobrecarregado.

## Horizonte

O horizonte do AraLearn é claro: transformar informação abundante em percurso de aprendizagem estruturado, revisável, portável e controlado pelo usuário. É um horizonte técnico, didático e também político, no sentido amplo do termo. Técnico, porque depende de arquitetura e validação. Didático, porque depende de progressão, prática e mediação. Político, porque envolve autonomia, rastreabilidade, dependência de plataformas externas e o modo como uma tecnologia educacional trata os dados e os erros de quem aprende.

O projeto ainda está em evolução, mas sua identidade já é nítida. Ele não tenta competir com a web em abundância informacional. Tenta oferecer o que a web, sozinha, raramente oferece: forma estudável.
