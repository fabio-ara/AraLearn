# Matriz de rastreabilidade pedagógica

Esta matriz liga compromissos pedagógicos a objetos observáveis do produto e a
formas proporcionais de avaliação. Implementação e teste demonstram capacidade;
efeito educacional exige investigação com pessoas.

| Compromisso | Como aparece no AraLearn | Evidência técnica | Avaliação educacional necessária | Sinal para rever |
| --- | --- | --- | --- | --- |
| Novidade semanticamente independente | AnalysisUnits inventariam conceitos, relações, condições, procedimentos e operações intelectuais separáveis | fixture e teste de granularidade; plano relacional | especialistas comparam inventário e explicação para públicos definidos | tópico amplo esconde várias novidades ou conceito auxiliar aparece sem ter sido estabelecido |
| Teto controla distribuição | cada StudyUnit introduz no máximo o teto efetivo sem ampliar artificialmente a AnalysisUnit | materialização valida referências e introduções | comparar teto 1 e 2 com o mesmo inventário | menos Units surgem por compressão ou o inventário muda entre condições |
| StudyUnit focal não é resumo | definição, mecanismo, exemplo, contraste, representação e prática podem ocupar Units próprias | Conteúdo focal e materialização sem meta de quantidade | tarefas de compreensão e inspeção especializada | Unit curta omite pré-requisito ou Unit longa acumula novidades não inventariadas |
| Prática suficiente e variada | oportunidades ligam requisitos e dimensões de variação da configuração | parâmetros efetivos e Analytics de prática | protocolo externo mede desempenho e transferência | consolidação fabrica requisito ou toda prática repete a mesma forma |
| Representação serve à função | componentes são consultados sob demanda e registram forma explicativa | catálogo, renderer e inspeção contextual | especialista e público julgam adequação e acessibilidade | parágrafo ou escolha aparecem por inércia; forma substituta condensa relação essencial |
| Direção editorial preserva conteúdo | estilo, títulos e extensão ficam separados dos quatro parâmetros pedagógicos | configuração por Curso/Microssequência e guidance | comparação autoral com inventário constante | limite editorial elimina novidade ou prática em vez de criar mais Units |
| Planejamento permanece revisável | GPT propõe uma Parte, espera decisão e relê o plano antes da próxima | tarefas `consultar_planejamento` e `salvar_parte` | observação de autoria longa e retomada em conversa nova | resposta despeja o plano inteiro ou Parte vira nível pedagógico rígido |
| Revisão alcança efeitos laterais | Observações levam à releitura de progressão, pré-requisitos, transições, exemplos e prática | preparação contextual e correções em conjunto | revisão por especialistas e pessoa autora | reparo altera só o alvo anotado apesar de dependências evidentes |
| Proveniência permanece contestável | Fonte, papel e Âncora aparecem junto do conteúdo e podem ser corrigidos | estado corrente de Fontes e autorização de PDF | checagem disciplinar e bibliográfica | link é tratado como prova ou Fonte não pode ser questionada |
| Agência humana é explícita | pessoa aprova Parte, configuração e correção antes da escrita | tarefas de leitura/escrita separadas e respostas curtas | estudo de usabilidade e compreensão das consequências | coordenação técnica oculta efeito ou GPT anuncia sucesso sem releitura |
| Analytics descreve sem pontuar | Desenho e Autoria mostram contagens do estado corrente por escopo | contrato v2, painel e JSON equivalente | interpretação dentro de pergunta e protocolo declarados | contagem vira score, autoria percentual ou conclusão sobre aprendizagem |
| Autoria e acesso não se confundem | proprietário edita; acesso direto concede Estudo; cópia pessoal protege original | RLS, autorização e fluxo de cópia | tarefas de compreensão de propriedade | pessoa com acesso altera o original ou dados privados atravessam Cursos |

## Relações que não devem ser confundidas

| Objeto | Use para | Não use como |
| --- | --- | --- |
| AnalysisUnit | acompanhar novidade independente | seção editorial ou tema amplo |
| requisito de evidência | declarar desempenho necessário | justificativa automática para consolidação |
| Observação | registrar apontamento ancorado | erro confirmado ou autorização de correção |
| achado de revisão | explicar problema no contexto corrente | entidade histórica universal |
| parâmetro definido | fixar condição pedagógica | medida de qualidade |
| Fonte e Âncora | localizar proveniência | garantia de verdade ou autoridade científica |
| snapshot de Analytics | reproduzir contagens do recorte | cópia integral do Curso ou dado de aprendizagem |
| condição de pesquisa | separar Cursos e configuração deliberada | experimento causal pronto |

Consulte [Análise instrucional](desenho-instrucional-parametrizado.md), [Revisão
e correções](auditoria-de-conformidade-instrucional.md), [Analytics](analytics-instrucionais.md)
e o [protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md).
