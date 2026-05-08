# Assistência por IA generativa

Este documento descreve a engenharia da assistência por serviços de inteligência artificial generativa acessados por API no AraLearn. Para visão de produto, arquitetura geral, modelo didático e rascunhos, consulte os documentos correspondentes em `docs/`.

## Papel da assistência

A assistência por IA generativa apoia a transformação didática de pedidos do usuário.

Ela pode ser usada para:

- gerar microssequências;
- revisar microssequências;
- reorganizar conteúdo;
- apoiar autoria de cards e formatos específicos.

O modelo de linguagem não é responsável sozinho pela estrutura final aplicada ao projeto. A aplicação planeja, solicita, valida, normaliza e converte o resultado para o contrato público.

## Responsabilidades

A aplicação:

- define contratos de planejamento e execução;
- monta prompts restritos;
- seleciona recursos didáticos permitidos;
- envia a chamada ao serviço;
- extrai JSON;
- normaliza o conteúdo;
- valida o resultado;
- aplica o material ao projeto ou como nova versão de uma microssequência.

O modelo:

- preenche conteúdo;
- adapta linguagem;
- propõe alternativas;
- sugere slot de reposicionamento quando recebe destinos fechados;
- responde em JSON no formato solicitado.

O usuário:

- escreve o pedido;
- escolhe curso, módulo e lição na aba `Gerar`;
- revisa o resultado;
- decide se continua editando ou marca o material como pronto para estudo.

## Escada de microssequências

A aba `Gerar` usa um formato intermediário mínimo. O modelo recebe o contexto hierárquico e a dúvida do usuário, mas não gera cards.

Entrada conceitual:

```json
{
  "courseTitle": "Curso",
  "moduleTitle": "Módulo",
  "lessonTitle": "Lição",
  "userInput": "Dúvida ou comentário"
}
```

Resposta esperada:

```json
{
  "title": "Estudo sobre o tema",
  "steps": [
    { "title": "Primeira microssequência" },
    { "title": "Segunda microssequência" }
  ]
}
```

Regras da aplicação:

- `steps` deve ter de 2 a 7 itens;
- cada `step.title` deve ser texto não vazio;
- duplicatas exatas são removidas;
- campos inesperados são ignorados;
- cards não são aceitos nessa resposta.

Cada item validado vira uma microssequência `draft` dentro da lição escolhida. A escada não vira entidade persistente separada.

## Camada modular de microssequência

A geração e a edição de cards usam uma camada interna em `src/generation/`. Essa camada separa:

- tipos didáticos neutros;
- tamanhos internos de microssequência;
- catálogo de recursos de card;
- anexos e fontes resolvidos para a operação;
- capacidades do modelo selecionado;
- contratos e prompts de planejamento;
- contratos e prompts de geração ou edição;
- validação estrutural da resposta.

Os tipos didáticos iniciais são `Assistido`, `Simples`, `Explicar uma ideia`, `Passo a passo`, `Prática guiada`, `Comparar`, `Revisão rápida`, `Erro comum`, `Regra/procedimento` e `Código/comando`. O tipo `Assistido` delega a escolha efetiva à etapa de planejamento.

Os tamanhos internos são:

- `short`: 3 cards;
- `medium`: 5 cards;
- `long`: 7 cards.

O tamanho é decidido no planejamento, validado pela aplicação e usado para exigir a quantidade exata de cards na resposta final.

## Recursos internos

O catálogo interno de recursos inclui:

- `paragraph`;
- `multiple_choice`;
- `code_editor`;
- `table`;
- `flowchart`;
- `block_gap_fill`.

Cada recurso possui descrição, limites e schema próprio. O recurso `block_gap_fill` representa lacunas preenchidas com blocos selecionáveis e feedback obrigatório após a tentativa. A renderização já reconhece esse bloco no runtime interno.

Os recursos efetivos de geração são calculados por:

```text
recursos base do tipo + recursos extras escolhidos pelo usuário + recursos extras pedidos pelo plano
```

O contrato final inclui schemas apenas dos recursos efetivos.

## JSON intermediário

Na geração ou revisão de cards, o modelo recebe um formato menor que o contrato público.

Exemplo:

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

Campos aceitos por card:

- `title`: título do card;
- `text`: explicação, leitura guiada ou lacuna;
- `question`: enunciado de múltipla escolha;
- `answer`: resposta correta;
- `wrong`: alternativas incorretas ou distratores;
- `language`: linguagem de um card de código;
- `code`: trecho de código ou comando;
- `columns`: colunas de tabela;
- `rows`: linhas de tabela, enviadas como textos separados por `|`;
- `currentPath`: caminho atual em árvore de diretórios;
- `selectedPath`: caminho selecionado em árvore de diretórios;
- `paths`: lista de caminhos para montar uma árvore;
- `after`: comentário exibido ao continuar.

Esse JSON é intermediário. O resultado aplicado ao projeto já deve obedecer ao `aralearn.contract`.

## Pipeline de geração

Fluxo implementado para criar rascunhos na aba `Gerar`:

1. o usuário escolhe curso, módulo e lição;
2. o usuário escreve uma dúvida ou comentário;
3. a aplicação monta o payload de contexto;
4. o serviço de IA generativa recebe prompt e schema de escada;
5. a resposta é lida como JSON;
6. a aplicação extrai JSON quando a resposta vem em bloco Markdown;
7. a aplicação tenta reparo quando o JSON é ilegível ou insuficiente;
8. a aplicação valida `steps`;
9. cada item validado vira uma microssequência `draft`;
10. os rascunhos são persistidos na lição selecionada.

Fluxo implementado para gerar ou revisar cards no painel:

1. o usuário abre uma microssequência;
2. a aplicação monta contexto de curso, módulo, lição e microssequência;
3. o usuário pode escolher tipo, recursos extras e anexos;
4. a aplicação envia anexos ao serviço de arquivos do modelo quando existirem;
5. a aplicação monta o contrato de planejamento com hierarquia, tags, pedido, recursos leves, tipos, tamanhos e fontes;
6. o modelo faz a primeira chamada e devolve `typeId`, `sizeId`, objetivo, recursos extras e `cardPlan`;
7. a aplicação valida o plano, incluindo tipo, tamanho, quantidade esperada e recursos;
8. a aplicação resolve recursos efetivos e monta o contrato de geração com schemas completos apenas desses recursos;
9. o modelo faz a segunda chamada e devolve os cards;
10. a aplicação valida quantidade, posições, recursos, schemas e campos obrigatórios;
11. o resultado válido é convertido para o contrato público;
12. a microssequência recebe nova versão ou cards aplicados.

O fluxo preserva o contexto hierárquico:

```text
Curso -> Módulo -> Lição -> Microssequência -> Cards
```

## Anexos de referência

No painel `Gerar cards` e `Editar cards`, o usuário pode anexar documentos de referência para o pedido atual.

Regras atuais:

- os anexos ficam apenas no estado transitório da sessão;
- a aplicação envia os arquivos primeiro ao serviço de arquivos do modelo;
- planejamento e geração recebem as referências desses arquivos no payload;
- anexos selecionados explicitamente têm prioridade sobre menções no texto;
- quando há vários anexos sem seleção nem menção, a camada de fontes sinaliza necessidade de seleção;
- o usuário continua responsável por revisar o resultado aplicado ao projeto.

## Lacunas por opções

Nos testes atuais, lacunas geradas pela assistência devem ser completadas por opções selecionáveis.

Formas aceitas:

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit]].",
  "wrong": ["git add", "git push"]
}
```

```json
{
  "title": "Recuperação ativa",
  "say": "O comando que registra mudanças preparadas é [[git commit::git commit|git add|git push]]."
}
```

O normalizador reforça:

- prática e revisão devem receber lacunas quando apropriado;
- lacunas precisam de distratores;
- tabelas geradas não devem depender de digitação livre nesta etapa;
- cards conceituais não devem receber lacunas indevidas.

## Prompt de preenchimento

Estrutura conceitual do prompt:

```text
Gere cards para a microssequência indicada.
Responda somente JSON válido no formato solicitado.
Devolva exatamente output.expectedCardCount cards.
Use apenas resourceType presente em resources.allowedResourceTypes.
Siga o plano didático validado.
Cada card deve ter position, resourceType e os campos do schema do recurso.
Use uma ideia principal por card, textos curtos e progressão interna.
Retorne apenas JSON válido.
```

O prompt completo inclui:

- pedido original do usuário;
- contrato de geração;
- plano didático validado;
- tipos e recursos efetivos;
- schemas dos recursos efetivos;
- tags da lição;
- fontes resolvidas;
- resumo da microssequência atual quando houver.

## Edição assistida

No painel da microssequência, a edição assistida trabalha principalmente em nível de microssequência.

O usuário pode pedir:

- simplificação de linguagem;
- reorganização da sequência;
- troca de formato de card;
- melhoria de exemplos;
- inclusão de prática;
- ajuste de alternativas;
- revisão de densidade textual.

A camada interna já possui contratos para planejar edição e aplicar edição em duas chamadas. O contrato de aplicação recebe a versão atual completa, recursos efetivos, tags, fontes resolvidas e versões anteriores quando o plano validado solicitar. A integração visual completa desse fluxo segue a regra de versionamento existente do painel.

## Reposicionamento assistido

No reposicionamento, o serviço recebe:

- título da microssequência;
- tags explícitas;
- pedido do usuário;
- slots fechados criados pela aplicação.

O serviço deve devolver:

- `slotId`;
- renomeações permitidas dentro da lição de destino, quando necessário.

A aplicação valida o `slotId` antes de mover a microssequência.

## Teste real com Gemini

Para testar geração real:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

O teste verifica:

- quantidade de cards;
- variedade de contêineres;
- ausência de fluxograma na geração inicial;
- conteúdo mínimo por card;
- múltipla escolha completa;
- lacunas com opções selecionáveis.

A chave deve ficar apenas no ambiente da sessão.

## Decisões em aberto

Pontos de pesquisa e engenharia:

- gerar card por card com crítica posterior quando modelos menores falharem em sequências longas;
- usar modelos mais robustos para fluxogramas;
- criar schema especializado para `flow`;
- registrar vínculo entre fonte e card;
- classificar transformação como literalidade, paráfrase, inferência, síntese ou contraponto;
- medir qualidade didática antes da aplicação;
- ajustar estratégia por disciplina e nível do estudante.
