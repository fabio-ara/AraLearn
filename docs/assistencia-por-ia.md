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

- define o plano didático;
- monta prompts restritos;
- escolhe schema quando adequado;
- envia a chamada ao serviço;
- extrai JSON;
- tenta reparo quando a resposta falha;
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
3. o AraLearn detecta assunto e estratégia didática;
4. a aplicação monta um plano determinístico;
5. o modelo recebe o plano e preenche conteúdo;
6. a resposta é lida como JSON;
7. a aplicação extrai JSON quando necessário;
8. a aplicação tenta reparo quando o JSON é ilegível ou insuficiente;
9. a aplicação repete a chamada sem schema quando o serviço recusa a complexidade do schema;
10. o AraLearn mescla resposta e plano;
11. o normalizador reduz densidade, aplica distratores e valida cards;
12. o resultado é convertido para contrato público;
13. a microssequência recebe nova versão ou cards aplicados.

## Plano determinístico

O plano local orienta a resposta do modelo.

Exemplo:

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

O modelo vê `role` e `container`, mas não precisa devolvê-los. A aplicação usa esses campos para converter o conteúdo ao contrato público.

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

Receitas didáticas atuais:

- `explain_concept`;
- `compare_concepts`;
- `explain_commands`;
- `directory_context`;
- `worked_example`;
- `practice_sequence`;
- `diagnostic_gap`.

## Contêineres na geração inicial

A geração inicial usa:

- `say`;
- `ask`;
- `code`;
- `table`;
- `tree`.

`flow` permanece no contrato público, mas deve receber engenharia específica antes de entrar na geração automática. Fluxogramas exigem validação estrutural e geométrica mais rigorosa.

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

O prompt completo inclui:

- pedido original do usuário;
- plano determinístico;
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

O resultado normalizado substitui a versão ativa e cria nova versão local.

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

- dividir geração em várias chamadas menores;
- gerar card por card com crítica posterior;
- usar modelos mais robustos para fluxogramas;
- criar schema especializado para `flow`;
- registrar vínculo entre fonte e card;
- classificar transformação como literalidade, paráfrase, inferência, síntese ou contraponto;
- medir qualidade didática antes da aplicação;
- ajustar estratégia por disciplina e nível do estudante.
