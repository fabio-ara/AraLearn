# AraLearn

AraLearn é uma aplicação open source, para uso predominantemente local e offline, para transformar conteúdos, dúvidas e intenções de estudo em percursos didáticos pequenos, praticáveis e revisáveis, com auxílio de inteligência artificial acessada via API.

O projeto nasce de um problema contemporâneo: a informação deixou de ser escassa, mas a compreensão continua difícil. Mecanismos de busca, repositórios abertos, redes sociais, documentação pública e modelos de linguagem facilitaram a obtenção de explicações, exemplos e resumos. Ainda assim, estudantes frequentemente continuam sem saber por onde começar, o que praticar, como revisar ou como retomar os estudos.

O AraLearn procura reduzir essa distância entre acesso à informação e aprendizagem efetiva. Para isso, organiza o material em uma hierarquia explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

A aplicação combina autoria local, prática ativa, importação e exportação de lições, persistência no dispositivo e assistência por modelos de linguagem acessados por API. O foco atual é o uso de modelos leves e baratos ou disponíveis em free-tier.

A inteligência artificial, no AraLearn, não é encarada como fonte da verdade. Ela é uma força geradora de conteúdo, sim, mas contida por arquitetura: a aplicação define contexto, limites, recursos, fonte-guia, contratos, validações, estados de rascunho e iterações locais reversíveis. O objetivo é usar inteligência artificial de modo produtivo sem entregar a ela a autoridade final sobre o conhecimento, a didática ou o percurso do usuário.

A aplicação pode ser usada como:

- aplicação web, inclusive pelo GitHub Pages;
- aplicação local no navegador;
- APK Android empacotado com WebView.

Versão web publicada:

https://fabio-ara.github.io/AraLearn/

---

## Propósito

O AraLearn foi pensado para estudantes trabalhadores em condições reais: com pouco tempo, matéria acumulando, atenção fragmentada, em condições precárias de deslocamento, fatigados física e mentalmente e necessidade de aprender rápido e sob pressão.

A proposta, entretanto, é mais ampla: o sistema pode apoiar estudo de disciplinas acadêmicas, preparação para concursos, treinamento em linguagens de programação, uso de ferramentas profissionais, treinamento em plataformas de gestão documental, aprendizagem de línguas estrangeiras, estudo de artigos científicos, apoio na leitura de artigos de economia, administração, direito, entre outros domínios.

O objetivo não é substituir sala de aula, leitura aprofundada de livros, produção de artigos, resenhas e resumos ou pesquisa aprofundada. O objetivo é criar ponte entre informação disponível e ação cognitiva executável de forma imediata sob condições restritas de tempo e de ambiente.

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

---

## Visão geral

No estado atual, o AraLearn reúne:

- organização de conteúdos em cursos, módulos, lições, microssequências e cards;
- geração estrutural contextual em home, curso e módulo;
- criação de rascunhos de microssequências a partir do contexto de uma lição;
- geração e edição de cards no painel da microssequência;
- recursos de navegação, edição, ordenação, importação, exportação e estudo;
- execução de cards com progresso local;
- edição de microssequências e cards;
- importação e exportação de projetos ou recortes estruturais;
- backup completo do estado local;
- assistência por serviços de inteligência artificial generativa acessados por API;
- funcionamento com persistência local, inclusive sem conexão contínua depois que o material está salvo;
- empacotamento Android em WebView.

A aplicação aproxima três atividades que normalmente aparecem separadas:

- autoria de material didático;
- estudo ativo;
- revisão do percurso.

Essa integração permite que o mesmo ambiente seja usado para estudar, corrigir, reorganizar e preservar o próprio material.

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

Essa organização por níveis é uma das bases do projeto. Ela dialoga com a tradição estruturalista e com áreas em que a análise depende de estratos explícitos, relações internas e unidades funcionais. Em termos de produto, isso significa que o AraLearn evita tratar cards como itens isolados. A unidade mínima de renderização pode ser o card, mas a unidade didática central é o conjunto de cards reunidos sob o mesmo tema, a microssequência.

---

## Geração e importação

O AraLearn combina dois movimentos complementares.

### Geração bottom-up

O usuário parte de uma dúvida concreta dentro de uma lição. A aplicação usa o contexto da árvore para gerar rascunhos de microssequências no lugar correto do curso.

Essa abordagem é adequada quando o estudante sabe onde está a dificuldade:

```text
“não entendi cd ..”
“como resolver esta tabela-verdade?”
“qual a diferença entre merge e rebase?”
“como representar este vetor no plano?”
```

### Organização top-down

O usuário também pode criar ou importar estruturas mais amplas. Cursos, módulos e lições podem ser preparados a partir de materiais, ementas, documentos ou objetivos de estudo.

Esse fluxo é adequado para disciplinas acadêmicas, preparação para concursos, manuais técnicos, ferramentas profissionais e estudo sistemático de fontes extensas.

Desde que obedeçam ao contrato `aralearn.contract`, podem ser importados:

- projetos completos;
- cursos;
- módulos;
- lições;
- microssequências.

A aplicação também trabalha com `aralearn.storage`, formato de backup completo que preserva projeto e progresso local.

---

## Orientação por nível

O AraLearn usa a ideia de fonte-guia para orientar a geração e a curadoria do material.

A fonte-guia não é uma descrição comum. Ela é uma orientação de conteúdo para o motor de geração. Ela ajuda a indicar escopo, notação, limites, passos esperados e erros comuns.

A direção arquitetural atual é tornar essa orientação mais determinística, sem mudar o fluxo principal da UI.

### Curso e módulo

No estado atual do produto, curso e módulo não têm fonte-guia operacional própria no contrato público.

Esses níveis ficam apenas com:

- título;
- descrição breve para UI;
- estrutura descendente.

### Lição

No nível de lição, a fonte-guia é mais operacional. Hoje, a lição pode carregar uma fonte-guia estruturada com campos fechados como:

- meta da lição;
- sinais e notação;
- confusões prováveis;

Exemplo:

```text
Fonte-guia:
Escopo: construir tabelas-verdade linha a linha.
Notação: V/F; usar colunas auxiliares.
Passos esperados: separar proposições, montar linhas, avaliar conectivos.
Erros comuns: confundir condicional; pular coluna auxiliar.
Não incluir: equivalências avançadas.
```

No uso atual, restrições de recurso didático, tipo de microssequência e pedido de edição ou geração ficam distribuídas entre essa fonte-guia estruturada da lição e os controles do painel contextual ou do painel da microssequência.

A intenção é substituir contexto solto por orientação funcional. Quanto mais fraco o modelo, mais o sistema deve restringir a tarefa.

Na interface atual, a lição concentra o núcleo principal da orientação enviada ao modelo. Curso e módulo ficam como contexto estrutural leve e não carregam mais fonte-guia própria.

---

## Cards e formatos didáticos

Cada card declara sua função por campos semânticos simples. A intenção é manter o JSON legível, validável e adequado tanto à edição humana quanto à geração assistida.

Formatos já cobertos incluem:

- `say`: explicação, orientação textual e lacunas;
- `ask`: questão de múltipla escolha;
- `code`: trecho de código;
- `table`: tabela para estudo ou prática;
- `tree`: representação e inspeção de estruturas de diretório;
- `flow`: fluxograma com estudo e prática por lacunas;
- `plane`: plano cartesiano introdutório;
- `matrix`: matrizes com leitura, destaque e sequência de resolução.

A escolha dos recursos não deve ser arbitrária. Ela deve depender da lição.

Exemplos:

- uma lição de shell de Linux pode usar árvore, editor de código e lacunas;
- uma lição de lógica proposicional pode usar tabela, lacunas e múltipla escolha;
- uma lição de álgebra linear pode usar matriz, plano cartesiano e lacunas;
- uma lição de administração pode usar texto, tabela e classificação;
- uma lição sobre Git pode usar editor de código, árvore e comparação.

---

## Inteligência artificial com controle do usuário

No AraLearn, modelos de linguagem são apoio operacional, não autoridade final.

A aplicação usa inteligência artificial por API para transformar conteúdos, dúvidas e pedidos de revisão em estruturas estudáveis. A preferência é por modelos acessíveis, baratos ou disponíveis em free-tier, pois o público-alvo inclui estudantes-trabalhadores e usuários que não devem depender de infraestrutura cara.

A arquitetura do AraLearn procura deslocar parte da inteligência do modelo para o processo:

- o contexto é hierárquico;
- a fonte-guia é explícita;
- os recursos didáticos são controlados;
- a saída esperada é estruturada;
- o contrato é validado;
- rascunhos de microssequência não entram automaticamente no estudo;
- iterações geradas no painel da microssequência podem ser aceitas ou excluídas;
- o usuário pode revisar, editar, excluir, exportar e versionar;
- o material fica no dispositivo, sob controle do usuário.

A pergunta central não é apenas:

```text
qual modelo responde melhor?
```

mas:

```text
como organizar a tarefa para que uma resposta de modelo barato seja útil, auditável e revisável?
```

---

## Direção atual da geração por inteligência artificial

A direção técnica do projeto é assumir que a inteligência artificial disponível é limitada e deve receber tarefas pequenas.

Em vez de pedir ao modelo que decida tudo, o AraLearn caminha para um fluxo em que:

```text
AraLearn define contexto.
AraLearn define recursos permitidos.
AraLearn escolhe ou valida a receita didática.
AraLearn monta o plano dos cards.
Gemini preenche conteúdo.
AraLearn valida.
O usuário revisa.
```

Na geração de microssequências, a direção é usar um processo em duas etapas:

1. planejamento restrito;
2. geração de conteúdo conforme plano definido pelo app.

Na primeira etapa, a inteligência artificial pode escolher entre opções fechadas:

- tipo de microssequência;
- tamanho;
- recursos selecionados, sempre dentro dos recursos permitidos pela lição.

Essas opções chegam ao Gemini como listas fechadas do próprio AraLearn. O modelo escolhe dentro delas; depois disso, o AraLearn monta os JSONs efetivos da operação e acrescenta `cardPlan`, contexto resolvido, schemas e validações locais.

Na segunda etapa, a inteligência artificial recebe apenas o plano aprovado e preenche os cards. Ela não deve alterar quantidade, ordem, papéis ou recursos dos cards.

Essa arquitetura torna o uso de modelos baratos mais realista, reduz custo, melhora previsibilidade e preserva controle humano.

---

## Rascunhos, revisão e prontidão

Microssequências geradas a partir do contexto de uma lição nascem como rascunhos. Elas não devem ser tratadas como material definitivo.

No fluxo atual, é importante separar dois casos:

- a geração de microssequências cria itens `draft` fora do estudo;
- a geração ou edição de cards no painel da microssequência aplica a iteração diretamente no conteúdo em uso, mas mantém reversão local por versões.

O fluxo esperado de microssequências continua sendo:

```text
gerar rascunho
revisar
editar
validar
marcar como pronto
estudar
```

Já no fluxo de cards, o comportamento atual é:

```text
gerar ou editar
revisar a iteração aplicada
aceitar ou excluir a iteração atual
continuar estudando ou editando
```

Essa distinção é central. O AraLearn não deve fingir que uma geração fluente é equivalente a material didático confiável.

O usuário continua sendo autor e curador do próprio percurso.

---

## Rastreabilidade e crítica

Um risco de qualquer sistema que transforma conteúdo é confundir transformação com verdade.

Ao resumir, simplificar, converter em lacunas ou gerar exemplos, a inteligência artificial pode modificar o sentido da fonte. Pode apagar nuances, transformar tese em fato, produzir inferências sem lastro ou reforçar uma moldura interpretativa.

Por isso, o AraLearn deve evoluir para preservar rastreabilidade entre:

```text
fonte original
orientação
transformação
card
revisão humana
```

Quando houver fonte, cards devem poder carregar referências internas para os trechos usados. No futuro, a aplicação poderá distinguir operações como:

- literal;
- paráfrase;
- inferência;
- aplicação;
- exemplo;
- contraponto;
- crítica.

Essa preocupação responde a uma questão ética central: o AraLearn não deve doutrinar o usuário por meio de uma inteligência artificial opaca. Ele deve empoderar o usuário para estudar, revisar, comparar e voltar à fonte.

---

## Origem intelectual e influências

O AraLearn nasce de uma combinação entre prática pessoal de estudo, desenvolvimento de software, revisão de materiais didáticos, organização do conhecimento e uso crítico de inteligência artificial generativa.

Antes da integração com inteligência artificial, o autor já tinha a prática de conversão de materiais extensos em flashcards, inspirada por ferramentas como Anki e por métodos de recuperação ativa. A inteligência artificial não inaugura essa lógica; ela amplia a capacidade de transformar textos, dúvidas e materiais irregulares em unidades pequenas de prática.

O projeto também dialoga com produtos e ambientes que influenciaram sua forma:

- Duolingo, pelo uso de unidades pequenas, progressão e prática recorrente;
- Anki, pela centralidade da recuperação ativa e da revisão;
- Obsidian, pela organização pessoal do conhecimento;
- Git, pela ideia de versionamento, histórico e reversibilidade;
- Wikipédia e web semântica, pela estruturação aberta da informação;
- interfaces de microtexto, como X, pelo desafio de transformar consumo fragmentado de informação em retenção, prática e revisão.

Do ponto de vista teórico, o AraLearn tem forte influência do estruturalismo e de posições epistemológicas emergentistas: conhecimento não aparece como coleção plana de itens, mas como sistema de relações entre níveis. Essa influência aparece na arquitetura do aplicativo, que organiza o estudo em curso, módulo, lição, microssequência e card. A unidade mínima não é isolada; ela ganha sentido por sua posição na estrutura.

A reflexão sobre a condição pós-moderna, especialmente em Lyotard, também é relevante: em um mundo em que o saber circula como informação processável, armazenável e operacionalizável, há o risco de reduzir aprendizagem a desempenho. O AraLearn reconhece a importância da eficiência, mas procura não tratá-la como único critério. O objetivo é transformar informação em prática sem abandonar fonte, revisão, crítica e formação.

Foucault deve, ainda, ser lembrado: toda tecnologia educacional que registra trajetórias, erros, revisões e desempenho pode tanto ampliar autonomia quanto produzir normalização, vigilância e dependência. O AraLearn busca privilegiar controle local, exportação, revisão humana e transparência do processo, mas é passível de críticas profundas e de doutrinação. É, assim, necessário pensar em como restringir seu alcance.

Há também uma preocupação epistemológica vinda de áreas como linguística, biologia evolutiva, sistemática e filosofia da ciência: modelos não são a realidade. Um card gerado por inteligência artificial não é a fonte original; é uma transformação didática situada, produzida por um conjunto de escolhas, restrições e validações. O projeto busca tornar essa transformação mais explícita, em vez de ocultá-la atrás da fluência da inteligência artificial.

O projeto é dedicado à memória de Edilson Jacob da Silva Jr., cuja trajetória e amizade marcaram profundamente a relação do autor com programação, automação e estudo.

---

## Questões de pesquisa

O AraLearn poderá servir futuramente como objeto acadêmico em tecnologia educacional, informática na educação, design instrucional, linguística aplicada, ciência da computação e filosofia da tecnologia.

Algumas perguntas orientam sua evolução:

- microssequências geradas com apoio de inteligência artificial melhoram retenção em comparação com estudo livre ou resumos?
- lacunas, múltipla escolha, tabelas, fluxogramas e código ajudam a transformar explicação em prática?
- uma hierarquia explícita de curso, módulo, lição, microssequência e card reduz a fricção de estudar com inteligência artificial?
- modelos de inteligência artificial leves e baratos podem produzir bons rascunhos quando a tarefa é suficientemente restrita?
- como preservar rastreabilidade entre fonte, transformação e card?
- como distinguir paráfrase, inferência, aplicação, exemplo e crítica em material gerado?
- como evitar que eficiência substitua formação ampla, contato prolongado com textos e reflexão crítica?
- repositórios pessoais de aprendizagem podem registrar trajetórias de entendimento de modo ético e útil?
- que limites éticos devem existir quando uma ferramenta registra erros, dúvidas, revisões e progresso?

O horizonte é transformar aprendizagem em percurso estruturado, revisável, rastreável e controlado pelo usuário.

---

## Limites e riscos

O AraLearn não parte de uma visão ingênua da inteligência artificial.

O projeto reconhece riscos:

- dependência de modelos externos;
- geração convincente sem fidelidade;
- simplificação excessiva;
- perda de contato com textos extensos;
- fragmentação do estudo;
- viés;
- doutrinação involuntária;
- vigilância cognitiva;
- transformação de erro e dúvida em dado explorável;
- confusão entre eficiência e formação.

A resposta do projeto não é abandonar inteligência artificial, mas contê-la por arquitetura:

- local-first e offline-first;
- open source;
- fonte-guia;
- contratos explícitos;
- listas fechadas;
- validação;
- rascunhos;
- revisão humana;
- rastreabilidade;
- exportação;
- controle do usuário.

---

## Arquitetura do repositório

```text
public/   Entrada web, assets e estilos da interface
src/      Contrato, renderização, persistência, editor, geração e UI
tests/    Suíte automatizada
scripts/  Utilitários de desenvolvimento e publicação
docs/     Documentação pública, contrato e exemplos
android/  Empacotamento Android em WebView
```

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

## Android

Para gerar o APK debug local:

```powershell
npm run android:debug
```

Artefato gerado:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## GitHub Pages

O site público é gerado a partir dos arquivos web versionados:

```powershell
npm run pages:build
```

O workflow de publicação envia o artefato estático para o GitHub Pages a cada atualização da branch `main`.

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

Para verificar a geração real de microssequências com Gemini, defina a chave no ambiente da sessão e rode:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

A chave não deve ser versionada nem registrada em arquivos do projeto.

---

## Documentação

- [Visão geral da documentação](docs/README.md)
- [Visão do produto](docs/visao-do-produto.md)
- [Arquitetura](docs/arquitetura.md)
- [Modelo didático](docs/modelo-didatico.md)
- [Rascunhos e microssequências](docs/rascunhos-e-microssequencias.md)
- [Contrato público atual](docs/aralearn-contract.md)
- [Assistência por IA generativa](docs/assistencia-por-ia.md)
- [Pesquisa e avaliação](docs/pesquisa-e-avaliacao.md)
- [Planejamento de referência](docs/planejamento-matematica-para-informatica.md)
- [Exemplos JSON](docs/examples)
- [Histórico de versões](CHANGELOG.md)

---

## Status

O AraLearn está em desenvolvimento ativo. A versão atual já consolida uma base funcional para estudo, autoria local, persistência, importação, exportação, validação automatizada, assistência por inteligência artificial e empacotamento Android.

Versão atual do pacote:

```text
0.1.1
```

As próximas iterações devem aprofundar:

- orientação determinística por nível;
- campos fechados de lição;
- templates internos de microssequência;
- geração em duas etapas com inteligência artificial;
- rastreabilidade entre fonte e card;
- validação didática;
- versionamento local de percursos;
- avaliação com usuários;
- integração entre estudo breve e formação aprofundada.

O projeto parte de uma convicção simples:

```text
aprender não é apenas consumir conteúdo.
aprender é transformar informação em prática, erro, revisão, memória, autonomia e entendimento.
```
