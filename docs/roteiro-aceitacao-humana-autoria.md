# Roteiro de aceitação humana da autoria

Este roteiro avalia se uma pessoa encontra e conclui as tarefas reais de autoria
sem aprender a arquitetura interna. Automação verifica contratos e geometria;
não substitui observação de compreensão e uso.

## Pré-condições

Reprove a revisão se:

- a autoria deixa de abrir diretamente em Conteúdo;
- aparece dashboard, sidebar, segunda coluna permanente ou segundo rolador;
- uma unidade de estudo deixa de dominar o leitor;
- ações somente por ícone não possuem nome acessível, foco e estado corretos;
- a página cria rolagem horizontal em 360, 390 ou 430 px;
- Estudo perde navegação, renderer, prática, progresso ou funcionamento offline;
- a interface ou a conversa expõe identificadores, nomes de campos, hashes,
  comandos, contagens internas ou detalhes de transporte.

Verifique a aplicação real nos temas claro e escuro, por toque, teclado e
tecnologias assistivas pertinentes. Tela larga preserva a mesma arquitetura de
uma coluna.

## Preparação

- use conta e cursos privados descartáveis;
- inclua um curso novo baseado numa ementa extensa;
- prepare público, objetivo, pré-requisitos, escopo e fontes com papéis distintos;
- inclua ao menos duas partes de produção e conteúdo suficiente para exigir
  índice e pesquisa;
- use configuração contextual e uma condição de pesquisa deliberadamente fixa;
- não explique MCP, Actions nem mecanismos internos;
- peça que a pessoa diga o que procura, o que espera e por que escolheu cada ação.

## Jornada curricular e conversacional

Execute numa conexão MCP nova ou renovada e num GPT com o OpenAPI corrente
efetivamente importado:

1. a pessoa pede um curso extenso;
2. o GPT apresenta uma síntese curricular global;
3. um link permite inspecionar todos os módulos, lições e microssequências;
4. cada item obrigatório do escopo aparece associado ao mapa;
5. a pessoa altera cobertura ou ordem;
6. o GPT ajusta a mesma arquitetura, sem materializar unidades;
7. a pessoa aprova o mapa visível;
8. o GPT apresenta brevemente a progressão da primeira parte;
9. a pessoa corrige uma ênfase;
10. o GPT materializa a parte e devolve o link do conteúdo;
11. a pessoa inspeciona todas as unidades na ordem;
12. o GPT apresenta a segunda parte;
13. a pessoa altera uma decisão e acrescenta uma fonte técnica;
14. o GPT materializa e a pessoa inspeciona o resultado;
15. o repertório acumulado distingue ideias novas, usadas e retomadas.

O chat deve parecer conversa com uma pessoa que desconhece o mecanismo do
AraLearn. A pessoa autora não pode ser tratada como estudante. A aprovação do
mapa não aprova a parte; a aprovação da parte não aprova silenciosamente
correções futuras.

## Tarefas

| Intenção | Resultado esperado | Evidência |
| --- | --- | --- |
| “Mostre como todo o curso ficará organizado.” | apresenta síntese e mapa completo de módulos, lições e microssequências | cobertura, ordem, dependências e zero unidades materializadas |
| “Mude esta área de lugar.” | atualiza o mapa e preserva decisões anteriores | nova versão inspecionável antes da aprovação |
| “Prepare o primeiro lote.” | apresenta somente a progressão local relevante | parte separada do currículo e conversa curta |
| “Produza este lote.” | materializa unidades suficientes e conectadas | conteúdo renderizado, não apenas JSON ou contagens |
| “Mostre o que esta unidade pressupõe.” | exibe ideias introduzidas, usadas e retomadas em linguagem humana | ausência de termos internos e referências coerentes |
| “Compare teto 1 e 2.” | preserva o repertório e permite mudar a distribuição de unidades | condição fixada prevalece sobre calibração contextual |
| “Deixe o GPT ajustar ao conteúdo.” | estado `default` produz calibração contextual por microssequência ou unidade | valor, origem, escopo e aplicação observáveis |
| “Confira de onde vem esta afirmação.” | distingue fonte de escopo, avaliação e sustentação técnica | proveniência e limite interpretado |
| “Revise as observações abertas.” | relê também progressão, pré-requisitos, transições, exemplos e prática | conjunto afetado e proposta concreta |
| “Mostre como o curso foi desenhado.” | Analytics mostra estado aplicado e exporta dados comparáveis | valores, origem, escopo, uso e JSON |
| “Continue numa conversa nova.” | retoma mapa, lotes e repertório persistidos sem repetir o briefing | próxima decisão correta |

## Revisão sequencial do conteúdo

Use ao menos uma microssequência técnica, como o funcionamento de um switch
Ethernet. Assuma que quadro, endereço MAC e porta já foram ensinados e confira
uma progressão real com problema, mecanismo, mudança de estado, previsão,
comparação, prática parcialmente resolvida e integração.

Reprove se:

- um conceito necessário aparece antes de ser ensinado;
- uma relação essencial é pressuposta;
- uma aplicação exige operação que nunca foi praticada;
- uma unidade expositiva supera o teto de novidades;
- prática é obrigada a introduzir novidade;
- o conteúdo vira resumo denso;
- uma ideia simples é atomizada em telas sem progressão;
- componentes variam pela aparência em vez da função;
- definições se repetem integralmente sem necessidade.

Registre um caso em que uma unidade densa foi dividida e outro em que fragmentos
foram fundidos. Avalie o percurso completo, não apenas unidades isoladas.

## Perguntas finais

Pergunte sem mostrar a navegação:

1. “Onde você conferiria o mapa completo antes da produção?”
2. “Qual é a diferença entre currículo e parte?”
3. “O que exatamente você aprovou em cada momento?”
4. “Como saberia que configuração vale neste ponto?”
5. “Como voltaria a um conteúdo antigo?”
6. “O que faria quando uma fonte parece inadequada?”
7. “O que os números de Analytics permitem e não permitem concluir?”

## Critério de decisão

O fluxo falha se a pessoa precisar conhecer o backend, perder o contexto,
aprovar conteúdo que não viu, aceitar compactação por limite visual, reconstruir
sozinha uma sequência atomizada, não reencontrar unidades antigas ou interpretar
contagem como qualidade.

Registre dificuldades como observações e corrija falhas materiais reproduzíveis.
Uma sessão positiva sustenta usabilidade somente para participantes, tarefas e
condições exercitados. Não demonstra aprendizagem nem eficácia educacional.
