# Atlas visual do AraLearn — v11

A v11 é uma evolução direta da v10. Ela preserva a base visual, os fluxos de Estudo e Autoria, a semântica de navegação e os cenários de escala da v10, e corrige a principal lacuna identificada: a interface do atlas não tornava verificável se as capacidades implementadas no backend estavam realmente disponíveis e compreensíveis no frontend.

## Regra de continuidade

Nenhuma das 59 telas existentes na v10 foi removida. A v11 acrescenta 19 superfícies/estados, chegando a 78 telas testáveis no atlas. A validação estrutural percorre todas as telas e as ações produzidas por elas e exige que cada ação tenha um destino existente e uma aresta correspondente no grafo.

Continuam valendo as regras da v10:

- `←` volta ao estado de navegação anterior e restaura a posição de rolagem;
- `↑` sobe um nível didático e não é sinônimo de voltar;
- listas grandes usam rolagem contínua, sem `Carregar mais`;
- o card inteiro é o alvo principal para abrir Curso/nível;
- ações secundárias ficam no mesmo eixo e usam área de toque compacta;
- criar/organizar coleções e menus contextuais usam overlays/bottom sheets;
- um Curso pode pertencer a várias coleções.

A v11 também corrige o cenário de 200 Cursos em Autoria: a contagem de Cursos editáveis e a quantidade efetivamente rolável agora coincidem.

## Navegação de Autoria

A Inspeção continua sendo a superfície principal do Curso. Em vez de transformar capacidades em uma coleção de abas permanentes, uma barra compacta de quatro grupos abre folhas contextuais:

- **Curso** → Estrutura, Planejamento, Parâmetros e Fontes;
- **Revisar** → Inspeção, Discussões/correções e Auditoria;
- **Pesquisa** → Variantes e Pesquisa da autoria;
- **Pessoas** → administração de acesso direto ao Estudo.

Dentro da Unidade, permanecem as quatro ações irmãs da v10: Fontes, Observação, Editar e Auditar. A assistência por ChatGPT/MCP aparece como ação contextual separada, em overlay, com alvo, caminho e revisão explícitos.

## Pesquisa da autoria

A tela inicial de Pesquisa deixa de representar o backend por quatro recortes abstratos. A v11 expõe os sete conjuntos de fatos atuais:

1. Atividade do Curso;
2. Materializações;
3. Decisões de desenho;
4. Fontes;
5. Observações;
6. Auditorias/correções;
7. Variantes.

A vista de Analytics contém gráfico de barras, tabela equivalente, revisão, denominador, dados ausentes, definição da métrica, inferências proibidas, fatos do recorte, deep links e ações de exportação CSV/JSON. As vistas específicas da v10 (Ciclo, Parâmetros, Fontes e Histórico) continuam acessíveis por divulgação progressiva.

## Variantes e experimentação de desenho

A v11 representa explicitamente conjuntos de 2–8 Variantes como Cursos independentes originados do mesmo planejamento. A criação permite visualizar diferenças de parâmetro e política de componentes. A comparação mostra material produzido e mantém separados cinco grupos: diferenças declaradas; observadas conforme declarado; desvios não declarados; diferenças factuais; dados ausentes ou incompletos.

Os gráficos demonstrativos permitem aprofundar até fatos relacionados. A tela declara de modo persistente que a comparação descreve processo/material produzido e **não demonstra aprendizagem**.

## O que permanece futuro

Efeitos sobre estudantes aparecem como futuro, separados de Analytics e Variantes. O atlas não finge que o backend atual já possui atribuição de participantes, grupos experimentais, exposição, instrumentos ou outcomes de aprendizagem/retenção.

## Cobertura auditável

A nova área **Cobertura** é meta-informação do atlas. Ela liga explicitamente `backend → tarefa humana → superfície de UI → dataset de Pesquisa (quando aplicável)`.

Consulte `MATRIZ-COBERTURA.md` e `REGRESSION-v10-v11.md`.

## Validação

Execute `node validate.mjs`. O validador exige 78 telas, preservação das 59 telas v10, destinos/arestas consistentes, cenário de 200 Cursos sem `Carregar mais`, 200 cards em Estudo, 112 editáveis em Autoria, os sete datasets, gráfico+tabela+fatos, Variantes e limite metodológico.
