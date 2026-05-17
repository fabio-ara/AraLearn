# AraLearn

AraLearn é uma aplicação open source, para uso predominantemente local e offline, voltada à transformação de conteúdos, dúvidas e intenções de estudo em percursos didáticos pequenos, praticáveis, revisáveis e progressivos, com auxílio de modelos de linguagem acessados por API ou por integração local.

O AraLearn não é um app de resumo. O objetivo não é condensar um tema em texto genérico, e sim decompor o estudo em microssequências pequenas, rigorosas, auditáveis e situadas numa estrutura maior de aprendizagem.

O projeto nasce de um problema contemporâneo relativamente claro: a informação deixou de ser escassa, mas a compreensão continua difícil. A web aberta, a documentação pública, os vídeos, as redes sociais, os repositórios e os modelos de linguagem facilitaram enormemente a obtenção de explicações, exemplos e respostas. Ainda assim, estudantes e autores continuam frequentemente sem saber por onde começar, o que praticar primeiro, como revisar, como retomar depois de uma interrupção e, sobretudo, como transformar abundância em percurso.

O AraLearn procura reduzir essa distância entre acesso à informação e aprendizagem efetiva. Para isso, organiza o material em uma hierarquia explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A aplicação combina autoria local, prática ativa, importação e exportação de estrutura, persistência no dispositivo e assistência por modelos de linguagem. O foco atual é o uso produtivo de modelos acessíveis, inclusive leves ou disponíveis em free-tier, sem entregar a eles a autoridade final sobre a didática.

A inteligência artificial, no AraLearn, não é encarada como fonte de verdade. Ela é uma força geradora de conteúdo, sim, mas contida por arquitetura: a aplicação define contexto, escopo, governança da lição, artefatos intermediários, contratos, formatos permitidos, validações e critérios de aplicação. O objetivo é usar LLM de modo produtivo sem entregar ao modelo o controle soberano do percurso, do conhecimento ou da progressão didática.

A aplicação pode ser usada como:

- aplicação web, inclusive pelo GitHub Pages;
- aplicação local no navegador;
- APK Android empacotado com WebView.

Versão web publicada:

https://fabio-ara.github.io/AraLearn/

---

## Propósito

O AraLearn foi pensado para estudantes trabalhadores em condições reais: com pouco tempo, matéria acumulando, atenção fragmentada, deslocamentos, cansaço físico e mental e necessidade de aprender sob pressão. A proposta, entretanto, é mais ampla. O sistema pode apoiar estudo de disciplinas acadêmicas, preparação para concursos, treinamento em linguagens de programação, uso de ferramentas profissionais, leitura de documentação técnica, aprendizagem de línguas, estudo de artigos científicos e organização didática de materiais heterogêneos.

O objetivo não é substituir sala de aula, estudo extensivo de fonte, produção de artigos, resenhas ou pesquisa aprofundada. O objetivo é criar ponte entre informação disponível e ação cognitiva executável em condições restritas de tempo, atenção e energia.

Em vez de entregar apenas texto, o AraLearn procura transformar uma dúvida ou um conteúdo em uma sequência de pequenas ações:

```text
orientar
explicar
exemplificar
completar
escolher
comparar
resolver
revisar
editar
versionar
```

Não se trata de apenas mais um app de flashcards. Flashcards, claro, são a interface. O objetivo central do projeto, entretanto, é a conversão controlada de informação em aprendizagem prática e ativa.

Meticulosidade, aqui, significa decomposição, progressão, prática com finalidade, contraste, tratamento de erro comum, revisão local e verificação de domínio. O critério não é extensão textual; é suficiência didática.

---

## O que mudou

O AraLearn continua sendo um motor de geração de microssequências didáticas de cards, mas sua missão operacional ficou mais nítida.

Antes, havia maior ênfase na ideia de top-down como pré-materialização ampla do conteúdo. Hoje, a direção do produto é mais forte:

- o `top-down` organiza material amplo em uma trilha didática navegável;
- o `bottom-up` atua durante a execução do estudo, no ponto em que a dúvida aparece;
- a autoria do curso deixa de ser apenas preparatória e passa a acontecer também no runtime;
- a inteligência artificial passa a funcionar menos como “geradora de curso pronto” e mais como parceira de organização e intervenção situada.

Em outras palavras: o AraLearn não quer apenas gerar estrutura nem apenas gerar cards. Quer articular os dois movimentos de modo coerente.

No fluxo amplo, a LLM ajuda a transformar materiais como ementa, bibliografia, listas de exercícios, slides, documentação ou artigo científico em uma trilha organizada de cursos, módulos, lições e microssequências planejadas. No fluxo local, essa mesma trilha pode ser materializada progressivamente durante o estudo, à medida que o usuário pede explicação, correção, expansão, reformulação ou a geração da próxima microssequência.

Essa mudança aproxima o produto de sua tese mais forte: estrutura externa robusta, autoria humana situada, prática ativa e progressão auditável.

---

## Visão geral

No estado atual, o AraLearn reúne:

- organização de conteúdos em cursos, módulos, lições, microssequências e cards;
- geração estrutural contextual em home, curso, módulo e lição pelo `CourseForge`;
- trilha completa de microssequências planejadas, navegáveis mesmo antes da materialização dos cards;
- runtime local de microssequência para materializar, corrigir, expandir, reformular e editar conteúdo durante o estudo;
- governança didática por lição com `sourceGuideStructured`, `presetId`, catálogos fechados e, quando houver, `domainMap`;
- motor `CourseForge` por fases, com planejamento, auditoria, reparo e aplicação por patch;
- recursos de navegação, edição, ordenação, importação, exportação e estudo;
- execução de cards com progresso local;
- edição de microssequências e cards;
- importação e exportação de projetos ou recortes estruturais;
- backup completo do estado local;
- assistência por serviços de inteligência artificial generativa acessados por API;
- suporte também a provider local via `Codex CLI`;
- funcionamento com persistência local, inclusive sem conexão contínua depois que o material está salvo;
- empacotamento Android em WebView.

A aplicação aproxima quatro atividades que normalmente aparecem separadas:

- autoria de material didático;
- organização estrutural do percurso;
- estudo ativo;
- revisão do próprio percurso.

Essa integração permite que o mesmo ambiente seja usado para estudar, corrigir, reorganizar, preservar e fazer crescer o próprio material.

---

## Modelo conceitual

O AraLearn organiza o conteúdo em uma hierarquia explícita:

```text
Projeto
  -> Cursos
    -> Módulos
      -> Lições
        -> Microssequências
          -> Cards
```

Essa estrutura aparece no contrato público, na persistência local e na interface. Ela não é apenas uma forma de navegação. Ela resolve um problema prático de contexto: quando o usuário pede ajuda dentro de uma lição específica, o modelo recebe curso, módulo e lição como moldura semântica. Isso torna a tarefa mais restrita, verificável e barata.

A hierarquia também expressa uma posição metodológica: conhecimento não deve ser tratado como uma coleção plana de itens. Um card ganha sentido dentro de uma microssequência; uma microssequência ganha sentido dentro de uma lição; uma lição ganha sentido dentro de um módulo; e um módulo ganha sentido dentro de um curso.

Essa organização por níveis é uma das bases do projeto. Ela dialoga com a tradição estruturalista e com áreas em que a análise depende de estratos explícitos, relações internas e unidades funcionais. Em termos de produto, isso significa que o AraLearn evita tratar cards como itens isolados. A unidade mínima de renderização pode ser o card, mas a unidade didática central é o conjunto de cards reunidos sob o mesmo tema: a microssequência.

---

## Top-down e bottom-up

O AraLearn combina dois movimentos complementares.

### Organização top-down

O top-down é útil quando o problema é a organização de uma massa maior de conteúdo: disciplina, ementa, conjunto de textos, documentação, plano de curso, trilha de formação, slides, exercícios ou artigo científico. Nesse caso, o usuário precisa montar um percurso mais amplo, distribuído em cursos, módulos e lições.

Esse fluxo é adequado para:

- disciplinas acadêmicas;
- preparação para concursos;
- manuais técnicos;
- documentação profissional;
- estudo sistemático de fontes extensas.

No estado atual do produto, essa trilha estrutural pública já foi consolidada no `CourseForge`. O mesmo motor por fases atende home, curso, módulo e lição, sempre dentro do escopo selecionado e com patch auditado antes da aplicação.

O top-down atual não precisa pré-gerar cards por padrão para ser útil. Seu valor principal está em:

- organizar a trilha;
- dar ordem ao material;
- planejar microssequências;
- tornar o percurso navegável antes da materialização local.

### Geração e intervenção bottom-up

O segundo movimento é bottom-up. Ele é útil quando o problema já apareceu no estudo concreto: uma dúvida localizada, um procedimento específico, um ponto de notação, um erro recorrente, um contraste que não ficou claro, uma prática que faltou ou uma microssequência que precisa ser refeita.

Nesse caso, não faz sentido pedir ao sistema que reorganize uma disciplina inteira. O que faz sentido é gerar, revisar, aprofundar, corrigir ou reformular uma microssequência localizada no contexto certo.

Hoje isso acontece no runtime da microssequência. O workbench local não é mais um branch estrutural paralelo da lição. Ele é a superfície de materialização progressiva e intervenção didática sobre o ponto estudado.

Essa abordagem permite que o estudo assuma um caráter mais dialógico: a trilha já existe, mas o usuário pode interrogá-la, tensioná-la, pedir reforço, pedir contraste, pedir reformulação e continuar produzindo o curso no próprio ato de estudo.

---

## Orientação por nível

O AraLearn usa a ideia de fonte-guia para orientar a geração e a curadoria do material.

A fonte-guia não é uma descrição comum. Ela é uma orientação de conteúdo para o motor de geração. Ela ajuda a indicar escopo, notação, limites, passos esperados, erros comuns, tipos de prática e foco da lição.

### Curso e módulo

No estado atual do produto, curso e módulo não têm fonte-guia operacional forte no contrato público. Esses níveis ficam principalmente com:

- título;
- descrição breve para UI;
- estrutura descendente.

### Lição

No nível de lição, a orientação é mais operacional. Hoje, a lição pode carregar uma governança estruturada com campos como:

- `sourceGuideStructured`;
- `presetId`;
- `resourceTags`;
- `contentTypeTags`;
- `learningActionTags`;
- `supportLevel`;
- `domainMap`.

Exemplo de orientação legível:

```text
Escopo: construir tabelas-verdade linha a linha.
Notação: V/F; usar colunas auxiliares.
Passos esperados: separar proposições, montar linhas, avaliar conectivos.
Erros comuns: confundir condicional; pular coluna auxiliar.
Não incluir: equivalências avançadas.
```

Na interface atual, a lição concentra o núcleo principal da orientação enviada ao modelo. Curso e módulo funcionam mais como contexto estrutural leve.

---

## Inteligência artificial com controle do usuário

No AraLearn, modelos de linguagem são apoio operacional, não autoridade final.

A aplicação usa inteligência artificial para transformar conteúdos, dúvidas e pedidos de revisão em estruturas estudáveis. A preferência é por modelos acessíveis, baratos ou disponíveis em free-tier, mas o projeto procura organizar a tarefa para que o resultado seja útil mesmo sem supor uma inteligência didática soberana do modelo.

A arquitetura do AraLearn procura deslocar parte da inteligência do modelo para o processo:

- o contexto é hierárquico;
- a fonte-guia é explícita;
- os recursos didáticos são controlados;
- a saída esperada é estruturada;
- o contrato é validado;
- as microssequências planejadas não entram automaticamente no estudo;
- iterações locais podem ser aceitas ou excluídas;
- o usuário pode revisar, editar, excluir, exportar e versionar;
- o material fica no dispositivo, sob controle do usuário.

A pergunta central não é apenas:

```text
qual modelo responde melhor?
```

mas:

```text
como organizar a tarefa para que uma resposta de modelo barato ou local seja útil, auditável e revisável?
```

---

## Especificação antes de improvisação

Uma das inspirações arquiteturais do AraLearn está em algo próximo do que, em engenharia de software, costuma ser entendido como desenvolvimento orientado por especificação.

Isso não significa “converter o produto em linguagem formal pura”, mas sim evitar o salto bruto entre pedido humano amplo e resultado final aceito sem mediação. Em vez de simplesmente despejar um prompt genérico para uma LLM, o AraLearn tenta operar por artefatos intermediários:

- intenção;
- escopo;
- ingestão de anexos;
- governança da lição;
- planos de lição;
- planos de microssequência;
- auditorias;
- contratos locais de geração;
- patch final.

Essa estratégia aparece no `CourseForge` e também no runtime local. A LLM não trabalha diretamente sobre a árvore inteira do projeto de forma livre e opaca; ela preenche, repara ou reorganiza dentro de envelopes menores e mais verificáveis.

---

## Fontes, parsers e organização de material

O AraLearn não trata o envio de arquivo bruto para a LLM como solução suficiente. Antes da geração estrutural, o app inclui uma camada inicial de ingestão para produzir texto utilizável, grounding mínimo e avisos rastreáveis quando a extração vier parcial.

Hoje o repositório já aceita, entre outros formatos:

- texto simples;
- Markdown;
- HTML;
- JSON;
- CSV;
- PDF;
- DOCX.

Para isso, o projeto já usa bibliotecas open source de parsing e extração como:

- `pdfjs-dist`, para leitura de PDF;
- `mammoth`, para extração textual de DOCX.

O objetivo imediato dessa camada não é reconstrução visual perfeita do documento, mas extração textual suficiente para permitir que o material seja reorganizado em sequência didática. Em termos práticos, isso significa que um artigo científico, uma ementa comentada, um conjunto de slides ou uma lista de exercícios pode servir como base para o top-down estrutural.

---

## Auditoria, revisão e autoria

Um risco de qualquer sistema que transforma conteúdo é confundir transformação com verdade.

Ao resumir, simplificar, converter em lacunas ou gerar exemplos, uma LLM pode modificar o sentido da fonte, apagar nuances, reforçar interpretações frágeis ou produzir explicações fluentes demais e verificáveis de menos.

Por isso, o AraLearn insiste em:

- contratos explícitos;
- checagens estruturais;
- auditoria didática local;
- rastreabilidade mínima com `sourceRefs`, quando houver fonte;
- patch validado antes da aplicação;
- revisão humana posterior.

O resultado gerado entra no produto como material revisável, não como verdade encerrada. O usuário continua sendo autor e curador do próprio percurso.

---

## Dialética situada do estudo

Uma das ideias mais fortes do AraLearn hoje é esta: a estrutura do curso não encerra a aprendizagem; ela prepara o terreno para uma prática em que o estudante continua pensando com o percurso.

Quando o usuário abre uma microssequência planejada ou pronta, ele não recebe apenas texto para consumir. Ele pode:

- estudar;
- travar num ponto;
- pedir correção;
- pedir exemplo;
- pedir contraste;
- pedir prática;
- pedir a próxima microssequência;
- reformular a etapa atual.

Isso produz uma espécie de dialética socrática situada: a pergunta do estudante não acontece no vazio nem diante de um chatbot sem forma, mas no interior de uma trilha já arquitetada. A estrutura limita, orienta e torna a conversa produtiva.

---

## Origem intelectual e influências

O AraLearn nasce de uma combinação entre prática pessoal de estudo, desenvolvimento de software, revisão de materiais didáticos, organização do conhecimento e uso crítico de inteligência artificial generativa.

Antes da integração com inteligência artificial, o autor já tinha a prática de conversão de materiais extensos em flashcards, inspirada por ferramentas como Anki e por métodos de recuperação ativa. A IA não inaugura essa lógica; ela amplia a capacidade de transformar textos, dúvidas e materiais irregulares em unidades pequenas de prática.

O projeto também dialoga com produtos e ambientes que influenciaram sua forma:

- Duolingo, pelo uso de unidades pequenas, progressão e prática recorrente;
- Anki, pela centralidade da recuperação ativa e da revisão;
- Obsidian, pela organização pessoal do conhecimento;
- Git, pela ideia de versionamento, histórico e reversibilidade;
- Wikipédia, pela estruturação aberta da informação;
- interfaces de microtexto, como X, pelo desafio de transformar consumo fragmentado de informação em retenção, prática e revisão.

Do ponto de vista teórico, o AraLearn tem afinidade com a tradição estruturalista e com posições epistemológicas que recusam a ideia de conhecimento como coleção plana de itens. Em Saussure, uma unidade ganha valor por sua posição num sistema. No AraLearn, algo semelhante aparece: um card não deve ser lido fora da microssequência; a microssequência não deve ser lida fora da lição; a lição não deve ser lida fora de uma trilha maior.

Lyotard ajuda a compreender o pano de fundo histórico: em um mundo em que o saber circula como informação operacionalizável, é fácil obter resposta e difícil obter formação. Foucault ajuda a lembrar que toda tecnologia educacional que registra trajetórias, erros e revisões merece suspeita: ela pode tanto ampliar autonomia quanto intensificar dependência e normalização.

---

## Questões de pesquisa

O AraLearn poderá servir futuramente como objeto acadêmico em tecnologia educacional, informática na educação, design instrucional, linguística aplicada, ciência da computação e filosofia da tecnologia.

Algumas perguntas orientam sua evolução:

- microssequências geradas com apoio de inteligência artificial melhoram retenção em comparação com estudo livre ou resumos?
- uma hierarquia explícita de curso, módulo, lição, microssequência e card reduz a fricção de estudar com IA?
- modelos leves ou locais podem produzir bons resultados quando a tarefa é suficientemente restrita?
- como preservar rastreabilidade entre fonte, transformação e card?
- como distinguir paráfrase, inferência, aplicação, exemplo e crítica em material gerado?
- como evitar que eficiência substitua formação ampla, contato prolongado com textos e reflexão crítica?

O horizonte é transformar aprendizagem em percurso estruturado, revisável, rastreável e controlado pelo usuário.

---

## Execução local

Instale as dependências:

```powershell
npm install
```

Inicie o servidor local:

```powershell
npm start
```

Depois, abra:

```text
http://127.0.0.1:4182/
```

---

## Validação

Rode a suíte automatizada:

```powershell
npm test
```

Valide o exemplo renderizável do contrato:

```powershell
npm run validate:example
```

Para verificar o fluxo real do `CourseForge` com Gemini, defina a chave no ambiente da sessão e rode:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

A chave não deve ser versionada nem registrada em arquivos do projeto.

---

## Documentação

- [Visão geral da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Guia de uso do app](docs/uso-do-app.md)
- [Arquitetura](docs/arquitetura.md)
- [Assistência por IA generativa](docs/assistencia-por-ia.md)
- [Contrato público atual](docs/aralearn-contract.md)
- [Fundamentos e evidências](docs/fundamentos-e-evidencias.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Rascunhos e microssequências](docs/rascunhos-e-microssequencias.md)
- [Pesquisa e avaliação](docs/pesquisa-e-avaliacao.md)
- [Planejamento de referência](docs/planejamento-matematica-para-informatica.md)
- [Codex CLI local no Android, Windows e Linux](docs/codex-cli.md)
- [Abrir com AraLearn no Android](docs/android-share-import.md)
- [Exemplos JSON](docs/examples)

---

## Status

O AraLearn está em desenvolvimento ativo. A versão atual já consolida uma base funcional para estudo, autoria local, persistência, importação, exportação, validação automatizada, assistência por inteligência artificial, geração estrutural contextual e empacotamento Android.

Do ponto de vista conceitual, o projeto já tem direção nítida:

- tratar informação abundante como matéria-prima de percurso, não como fim em si;
- combinar organização top-down com intervenção bottom-up no runtime;
- restringir o papel da inteligência artificial por arquitetura, contratos e validações locais;
- favorecer prática ativa, mediação progressiva e revisão no mesmo ambiente;
- preservar controle local, reversibilidade e clareza sobre os limites reais da automação.

O projeto parte de uma convicção simples:

```text
aprender não é apenas consumir conteúdo.
aprender é transformar informação em prática, erro, revisão, memória, autonomia e entendimento.
```
