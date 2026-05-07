# Assistência por IA generativa no AraLearn

Este documento descreve o papel dos serviços de inteligência artificial generativa acessados por API no AraLearn e organiza a visão de engenharia do fluxo de geração, revisão, edição e encaixe de microssequências em cursos.

O objetivo é servir como referência pública para desenvolvimento, pesquisa e discussão arquitetural. O texto distingue o que já existe na aplicação, o que pertence ao contrato público e quais decisões ainda podem ser amadurecidas por testes, revisão didática e experimentação com modelos mais robustos.

## Visão resumida do produto

AraLearn é um motor open source de aprendizagem ativa. Ele converte conteúdos, dúvidas e intenções de estudo em microssequências didáticas compostas por cards navegáveis, praticáveis, editáveis e preserváveis em JSON.

O produto parte de um problema contemporâneo: a informação se tornou abundante, especialmente após a popularização da inteligência artificial generativa, mas disponibilidade de explicações não garante aprendizagem. O estudante pode receber respostas, resumos e exemplos em grande quantidade e, ainda assim, continuar sem saber qual é a próxima ação de estudo, como praticar, como revisar ou como retomar um percurso interrompido.

O AraLearn procura reduzir essa distância entre informação e prática. Para isso, combina:

- autoria de material didático;
- estudo ativo por cards;
- revisão e progresso local;
- persistência no próprio dispositivo;
- importação, exportação e backup em JSON;
- geração e reorganização assistidas por serviços de IA generativa;
- oficina local para rascunhos antes da consolidação em cursos.

O foco de uso são condições reais de estudo: trabalho, faculdade, deslocamentos, atenção fragmentada, pausas, retomadas e necessidade de transformar dúvidas pontuais em treino efetivo.

## Modelo conceitual

A hierarquia pública do AraLearn é:

```text
Projeto
  -> Cursos
    -> Módulos
      -> Lições
        -> Microssequências
          -> Cards
```

Essa estrutura organiza o produto inteiro:

- o contrato público declara cursos, módulos, lições, microssequências e cards;
- a interface navega pela mesma hierarquia;
- o progresso local é salvo a partir do caminho de estudo;
- a oficina de microssequências usa a mesma base de leitura e revisão, mas mantém rascunhos fora dos cursos definitivos;
- a assistência por IA generativa gera ou transforma microssequências que depois são normalizadas para o contrato público.

O AraLearn não trata a geração assistida como resposta isolada. O resultado esperado é material estudável: uma sequência pequena de ações cognitivas, com explicação, exemplo ou leitura guiada, prática e consolidação.

## Responsabilidades arquiteturais

A arquitetura separa responsabilidades para preservar controle e portabilidade.

O usuário:

- escreve o pedido de estudo;
- escolhe tags explícitas quando elas ajudam a orientar contexto ou destino;
- revisa o resultado;
- edita a microssequência;
- decide quando consolidar o rascunho em um curso.

A aplicação:

- define o plano didático local;
- monta prompts restritos;
- envia chamadas ao serviço de IA generativa;
- extrai e valida JSON;
- normaliza textos, lacunas, tabelas, árvores e alternativas;
- converte o JSON intermediário para o contrato público;
- cria rascunhos na oficina;
- mantém versões locais da microssequência;
- oferece slots fechados para reposicionamento;
- aplica mudanças somente depois de validação determinística.

O modelo de linguagem:

- preenche conteúdo didático;
- reescreve ou reorganiza microssequências quando solicitado;
- sugere um slot de destino quando recebe opções fechadas;
- nunca deve ser o único responsável pela estrutura final aplicada ao projeto.

Esse desenho permite usar modelos menores em tarefas controladas e reservar modelos mais robustos para operações que exigem raciocínio estrutural maior, como fluxogramas ou avaliação semântica mais rigorosa.

## Navegação e estados da oficina

A tela inicial apresenta os cursos do projeto e a `Oficina de microssequências`.

A oficina funciona como fila local de rascunhos. Ela tem duas áreas principais:

- `Gerar novas microssequências`: abre a tela `Gerar microssequência`;
- `Fila de rascunhos`: lista microssequências já geradas e ainda não consolidadas em cursos.

A tela `Gerar microssequência` é apenas o formulário de criação. Ela não apresenta preview, faixa de cards, título editável da microssequência nem versões locais. O usuário escolhe tags explícitas quando necessário, seleciona o modo de geração, escreve o pedido e envia.

Depois do envio:

1. o AraLearn chama o serviço de IA generativa;
2. a resposta é validada e convertida;
3. uma microssequência real é criada na fila de rascunhos;
4. a aplicação seleciona essa microssequência;
5. o `Painel da microssequência` é aberto para revisão.

O `Painel da microssequência` é a tela de curadoria. Ele reúne:

- preview da versão ativa;
- faixa de cards;
- edição por novo pedido;
- tags explícitas;
- versões locais;
- ação de reposicionar em curso quando houver tags suficientes para montar destinos.

O usuário pode retornar à oficina, continuar revisando ou consolidar a microssequência em um curso. Enquanto isso não acontece, o rascunho permanece fora dos cursos definitivos.

## Recuperação de estado local

A oficina possui uma estrutura interna para abrir a tela de geração sem misturá-la à fila visível. Essa estrutura não deve armazenar cards finais.

Se uma sessão local contiver cards presos nessa área interna, o AraLearn os promove automaticamente para uma microssequência real da fila de rascunhos ao carregar o projeto. A tela inicial também ignora essa área interna ao calcular progresso, evitando que o usuário veja contagem de cards que não aparecem na fila.

Essa recuperação preserva dados criados localmente e mantém a regra operacional: cards gerados pertencem a uma microssequência revisável, não ao formulário de geração.

## Camadas de JSON

O AraLearn usa formatos diferentes para responsabilidades diferentes.

### Contrato público

`aralearn.contract` é o formato público, importável e versionável do produto.

Ele representa:

- cursos;
- módulos;
- lições;
- microssequências;
- cards.

Esse contrato está documentado em [aralearn-contract.md](./aralearn-contract.md). Ele deve permanecer legível para autoria humana, validação automatizada e geração assistida por modelos de linguagem.

### Backup local

`aralearn.storage` é o formato de backup completo do estado local da aplicação.

Ele preserva projeto, progresso e dados de uso local. Esse formato serve para restauração integral do ambiente do usuário, não para geração direta de material didático.

### JSON intermediário da assistência

Na geração de microssequências, o modelo recebe um pedido menor que o contrato público completo.

O formato intermediário atual é semelhante a:

```json
{
  "title": "Título da microssequência",
  "tags": ["Tag 1", "Tag 2"],
  "cards": [
    {
      "title": "Título do card",
      "text": "Texto explicativo ou texto com [[lacuna]].",
      "wrong": ["distrator 1", "distrator 2"]
    }
  ]
}
```

Campos aceitos por card no JSON intermediário:

- `title`: título do card;
- `text`: texto explicativo, leitura guiada ou lacuna;
- `question`: enunciado de múltipla escolha;
- `answer`: resposta correta;
- `wrong`: alternativas incorretas ou distratores para lacunas;
- `language`: linguagem de um card de código;
- `code`: trecho de código ou comando;
- `columns`: colunas de uma tabela;
- `rows`: linhas de tabela, enviadas como textos separados por `|`;
- `currentPath`: caminho atual em uma árvore de diretórios;
- `selectedPath`: caminho selecionado em uma árvore de diretórios;
- `paths`: lista de caminhos para montar uma árvore;
- `after`: comentário exibido ao continuar.

Esse JSON intermediário é uma forma controlada de coleta. Depois da resposta do modelo, o AraLearn converte cada card para o contrato público.

## Pipeline de geração

O fluxo implementado de geração é:

1. O usuário escreve um pedido em linguagem natural na tela `Gerar microssequência`.
2. O AraLearn coleta tags explícitas selecionadas pelo usuário.
3. A aplicação detecta assunto e estratégia didática.
4. A aplicação monta um plano determinístico local.
5. O modelo recebe o plano e preenche apenas o conteúdo dos cards.
6. A resposta é lida como JSON.
7. Se o JSON vier em bloco Markdown, a aplicação extrai o objeto JSON.
8. Se a resposta vier ilegível ou insuficiente, a aplicação faz nova tentativa com prompt de reparo.
9. Se o serviço rejeitar o schema por complexidade, a aplicação tenta novamente com `responseMimeType: "application/json"` e sem schema.
10. O AraLearn mescla resposta e plano, normaliza textos, limita excesso, aplica distratores e valida os cards.
11. A microssequência é criada como rascunho real na oficina local.
12. O painel de revisão é aberto com a versão recém-gerada.

Essa organização reduz a dependência de uma resposta perfeita do modelo e permite que a aplicação mantenha controle sobre a forma final do material.

## Plano determinístico

O plano local usa quatro informações principais:

```json
{
  "title": "Título planejado",
  "subject": "git_github",
  "recipe": "explain_commands",
  "goal": "Objetivo didático",
  "tags": ["Git", "Comandos essenciais"],
  "cardPlans": [
    {
      "role": "concept",
      "container": "say",
      "title": "Fluxo mínimo",
      "learningGoal": "Explicar a ordem geral sem detalhar tudo de uma vez."
    }
  ]
}
```

O modelo vê esse plano, mas a aplicação continua responsável pela intenção didática de cada card e pela conversão para o contrato público.

Assuntos reconhecidos no planejamento atual:

- programação;
- linguagem C;
- Portugol;
- algoritmos em representação tabular;
- shell Linux;
- Git e GitHub;
- engenharia de software;
- administração;
- arquitetura de computadores;
- lógica proposicional;
- matrizes e vetores;
- teoria dos grafos;
- estudo geral.

Estratégias didáticas atuais:

- `explain_concept`: explicação, exemplo, recuperação ativa e verificação;
- `compare_concepts`: ponto de partida, tabela comparativa, exemplo, verificação e síntese;
- `explain_commands`: explicação progressiva, código ou tabela, recuperação ativa e verificação;
- `directory_context`: explicação, árvore de diretórios, recuperação ativa e verificação;
- `worked_example`: ideia mínima, exemplo resolvido, lacuna e verificação;
- `practice_sequence`: preparação, modelo, prática, checagem e retomada;
- `diagnostic_gap`: ponto de confusão, distinções, lacuna diagnóstica e erro comum.

## Contêineres na geração inicial

Nesta fase, a geração automática de microssequências usa estes contêineres:

- `say`: explicação, leitura guiada e lacuna por opções;
- `ask`: múltipla escolha;
- `code`: código, comando ou trecho executável;
- `table`: comparação, classificação ou resumo estruturado;
- `tree`: diretórios, caminhos e estrutura de projeto.

`flow` permanece parte do contrato público do AraLearn. Sua entrada na geração assistida depende de engenharia própria, com schema especializado, validação geométrica e testes didáticos específicos.

## Lacunas por opções

Para os testes atuais, lacunas geradas pela assistência devem ser completadas por opções selecionáveis, não por digitação livre.

Há duas formas válidas:

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit]].",
  "wrong": ["git add", "git push"]
}
```

ou:

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit::git commit|git add|git push]]."
}
```

Na primeira forma, o AraLearn usa `wrong` para montar as opções da lacuna. Na segunda, as opções já estão declaradas no próprio texto.

O normalizador local reforça essa regra:

- cards planejados como prática ou revisão recebem lacuna quando o modelo não a envia;
- lacunas sem distratores recebem alternativas locais;
- tabelas geradas têm lacunas textuais removidas nesta fase para evitar digitação livre;
- fluxogramas não entram na geração automática desta etapa.

## Prompt de preenchimento

O prompt atual não pede ao modelo para criar a arquitetura da microssequência. Ele pede preenchimento do plano.

Estrutura conceitual:

```text
Preencha o conteúdo dos cards seguindo exatamente o plano abaixo.
Devolva exatamente N cards, na mesma ordem do plano.
Cada card deve ter title e os campos de conteúdo necessários.
Escreva para estudante de Tecnologia em Análise e Desenvolvimento de Sistemas.
Use linguagem natural simples, de iniciante para iniciante.
A microssequência precisa ter explicação, exemplo ou leitura guiada, prática e consolidação.
Cada texto deve ter no máximo duas frases.
Use uma ideia por card e uma ideia por frase.
Use [[resposta]] apenas quando o plano pedir prática, revisão ou lacuna.
Todo card com [[resposta]] deve enviar wrong com duas ou três alternativas plausíveis.
Retorne apenas JSON válido.
```

O prompt completo também inclui:

- resumo da microssequência atual, quando houver;
- plano determinístico em JSON;
- pedido original do usuário.

## Pipeline de edição

A edição assistida acontece no `Painel da microssequência`.

O comportamento atual é de edição em nível de microssequência:

1. o usuário abre um rascunho ou uma microssequência existente;
2. escreve um novo pedido no painel;
3. a aplicação envia a microssequência atual como contexto;
4. o serviço gera uma nova versão da microssequência;
5. o AraLearn normaliza e substitui os cards da versão ativa;
6. a aplicação registra uma nova versão local;
7. o usuário compara, revisa e continua editando se necessário.

Esse fluxo permite pedidos como:

- simplifique a linguagem para iniciante;
- divida a explicação em mais etapas;
- troque uma questão de múltipla escolha por uma lacuna com opções;
- use exemplos mais verossímeis de Git básico;
- acrescente uma tabela comparativa;
- transforme o exemplo em uma sequência de comandos comentada.

Hoje, a unidade principal de edição assistida é a microssequência inteira. A edição isolada de um card existe como capacidade técnica separada, mas não é o eixo principal da oficina.

## Versionamento local

O `Painel da microssequência` mantém versões locais da microssequência.

Regras atuais:

- a versão ativa é aplicada ao projeto persistido;
- novas iterações entram como novas versões;
- o usuário pode alternar entre versões;
- a faixa de cards reflete a versão ativa;
- as versões locais pertencem ao estado da aplicação e não são parte do `aralearn.contract`;
- o contexto enviado ao serviço deve ficar limitado à microssequência em revisão.

Esse desenho dá liberdade para experimentar variações didáticas sem transformar cada tentativa em parte permanente do contrato público.

## Pipeline de reposicionamento

O reposicionamento implementado hoje atua em nível de microssequência.

O fluxo é:

1. o usuário revisa uma microssequência no painel;
2. seleciona tags explícitas relacionadas ao destino desejado;
3. a aplicação procura microssequências existentes, em cursos definitivos, cujos títulos correspondem às tags selecionadas;
4. a aplicação monta slots fechados antes e depois dessas microssequências;
5. o modelo recebe apenas a microssequência atual, as tags e a lista de slots;
6. o modelo escolhe um `slotId` e pode sugerir renomeações para microssequências da lição de destino;
7. o AraLearn valida se o slot existe;
8. a aplicação move a microssequência para a posição validada.

O modelo não inventa curso, módulo, lição ou posição livre. Ele escolhe entre opções fechadas construídas pela aplicação.

O reposicionamento de cards isolados é uma decisão futura de arquitetura. Se for adotado, precisará responder a perguntas próprias:

- um card deslocado mantém dependências da microssequência original?
- o card vira nova microssequência, entra em outra microssequência ou cria uma revisão intermediária?
- como preservar versões locais depois de mover apenas parte do material?
- que evidências indicam que a unidade correta de encaixe é o card, e não a microssequência?

## Por que usar JSON intermediário menor

Modelos menores tendem a responder melhor quando recebem tarefas fragmentadas, schema simples e pouca liberdade estrutural.

Por isso, a geração inicial evita pedir um `aralearn.contract` completo. A aplicação pede apenas conteúdo de cards e faz a conversão local.

Essa escolha traz vantagens:

- reduz campos obrigatórios na resposta do modelo;
- evita que o modelo decida a hierarquia do curso;
- diminui a chance de campos extras;
- preserva o contrato público;
- permite validação determinística;
- facilita novas tentativas quando a resposta falha.

## Validação local

Depois da resposta do modelo, o AraLearn:

- extrai JSON quando a resposta vem em bloco Markdown;
- limita a quantidade de cards entre 3 e 5;
- preserva a ordem do plano local;
- substitui títulos de cards de comando quando necessário;
- separa textos em parágrafos;
- remove lacunas de cards conceituais;
- garante distratores para lacunas de prática;
- converte tabela textual para `table.rows`;
- monta árvore a partir de caminhos;
- sanitiza o card final pelo contrato público.

O resultado final aplicado ao projeto já é contrato AraLearn, não o JSON intermediário.

## Teste real com Gemini

Para executar o teste de geração real:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

O teste envia pedidos de assuntos diferentes e verifica critérios automáticos:

- quantidade de cards;
- variedade de contêineres;
- ausência de fluxograma na geração inicial;
- conteúdo mínimo por card;
- múltipla escolha completa;
- lacunas com opções selecionáveis.

A chave deve ficar apenas no ambiente da sessão e não deve ser registrada em arquivos do projeto.

## Pontos de pesquisa e engenharia

O AraLearn pode evoluir a partir de experimentos controlados. Pontos relevantes:

- geração em várias chamadas: diagnóstico, plano, card individual, crítica, reparo e normalização;
- comparação entre modelos menores e modelos mais robustos por assunto, contêiner e custo;
- schema especializado para fluxogramas antes da conversão para `flow`;
- rastreabilidade entre fonte, transformação e card gerado;
- classificação da transformação como literalidade, paráfrase, inferência, síntese ou contraponto;
- critérios automáticos de densidade textual, progressão conceitual, qualidade de lacunas e plausibilidade de distratores;
- estudo de retenção, esforço de revisão, erro recorrente e retomada após pausa;
- reposicionamento de cards isolados versus reposicionamento de microssequências;
- calibração de cursos existentes a partir de dúvidas pontuais do estudante;
- preservação de autonomia do usuário sobre material, revisão, exportação e backup.

O princípio central deve permanecer: o modelo sugere conteúdo, transformação ou destino; o AraLearn planeja, valida, normaliza, aplica e preserva o controle do usuário sobre o percurso de aprendizagem.
