# Matriz de rastreabilidade pedagógica

Esta matriz liga compromissos pedagógicos a objetos observáveis do produto e a
formas proporcionais de avaliação. Implementação e teste demonstram capacidade;
efeito educacional exige investigação com pessoas.

| Compromisso | Como aparece no AraLearn | Evidência técnica | Avaliação educacional necessária | Sinal para rever |
| --- | --- | --- | --- | --- |
| Repertório acumulado | unidades de análise acompanham conceitos, relações, condições, procedimentos e operações; cada uso distingue introdução, mobilização e retomada | fixture e teste de granularidade; plano relacional derivado do conteúdo | especialistas comparam repertório e explicação para públicos definidos | tópico amplo esconde várias novidades, ideia reaparece sob outro nome ou conhecimento auxiliar é usado cedo demais |
| Teto controla distribuição | cada unidade expositiva introduz no máximo o teto efetivo sem ampliar artificialmente uma unidade de análise | materialização valida referências e introduções | comparar teto 1 e 2 com o mesmo repertório | menos unidades surgem por compressão ou o repertório muda entre condições |
| Unidade focal não é resumo nem fragmento | definição, mecanismo, relação, exemplo, contraste, representação e prática ocupam unidades coerentes | conteúdo renderizado e aceitação contra compactação e atomização | tarefas de compreensão e inspeção especializada | uma tela acumula novidades ou a sequência fragmenta uma ideia sem progressão |
| Dependências e relações são ensinadas | pré-requisitos aparecem antes do uso e relações essenciais recebem explicação e prática | fixture autocontida e leitura sequencial renderizada | público-alvo tenta explicar e aplicar a cadeia | conceito dependente aparece cedo, relação é pressuposta ou aplicação nunca foi praticada |
| Cobertura é auditável | item do escopo aponta ao mapa e às unidades em que foi desenvolvido | mapa curricular e projeção de cobertura | especialista julga profundidade proporcional | item foi apenas mencionado ou ficou sem unidade materializada |
| Prática suficiente e variada | oportunidades ligam requisitos e dimensões de variação da configuração | parâmetros efetivos e Analytics de prática | protocolo externo mede desempenho e transferência | consolidação fabrica requisito ou toda prática repete a mesma forma |
| Representação serve à função | componentes são consultados sob demanda e registram forma explicativa | catálogo, renderer e inspeção contextual | especialista e público julgam adequação e acessibilidade | parágrafo ou escolha aparecem por inércia; forma substituta condensa relação essencial |
| Alvos e direção editorial preservam conteúdo | dois alvos quantitativos flexíveis e direção qualitativa ficam separados dos quatro parâmetros pedagógicos | configuração por curso/microssequência e extensão observada | comparação autoral com repertório constante | alvo vira limite e elimina novidade ou prática em vez de reorganizar unidades |
| Configuração distingue contexto de condição | `default` exige calibração automática pelo GPT em cada microssequência ou unidade; valor fixado pelo pesquisador prevalece e fica auditável no uso efetivo | configuração aplicada selada nas unidades e exportação de Analytics | comparação entre cursos independentes sob protocolo declarado | preset é tratado como universal ou condição fixada é silenciosamente recalibrada |
| Mapa global precede produção | GPT propõe todos os módulos, lições e microssequências, oferece inspeção completa e só depois define lotes | tarefas `consultar_planejamento`, `salvar_mapa_curricular` e `salvar_parte` | observação de autoria longa e retomada em conversa nova | materialização começa antes do mapa, parte vira nível curricular ou aprovação alcança conteúdo não apresentado |
| Revisão alcança efeitos laterais | Observações levam à releitura de progressão, pré-requisitos, transições, exemplos e prática | preparação contextual e correções em conjunto | revisão por especialistas e pessoa autora | reparo altera só o alvo anotado apesar de dependências evidentes |
| Proveniência permanece contestável | Fonte, papel e Âncora aparecem junto do conteúdo e podem ser corrigidos | estado corrente de fontes e autorização de PDF | checagem disciplinar e bibliográfica | link é tratado como prova ou fonte não pode ser questionada |
| Agência humana é explícita | pessoa aprova separadamente mapa, progressão focal e correção concreta | tarefas de leitura/escrita separadas e respostas curtas | estudo de usabilidade e compreensão das consequências | coordenação técnica oculta efeito ou uma aprovação autoriza níveis seguintes |
| Analytics descreve sem pontuar | Desenho e Autoria mostram contagens do estado corrente por escopo | contrato v2, painel e JSON equivalente | interpretação dentro de pergunta e protocolo declarados | contagem vira score, autoria percentual ou conclusão sobre aprendizagem |
| Autoria e acesso não se confundem | proprietário edita; acesso público ou direto concede Estudo; visitante não envia observação | RLS, projeções e autorização comum | tarefas de compreensão de propriedade | pessoa com acesso altera o original ou dados privados atravessam cursos |

## Relações que não devem ser confundidas

| Objeto | Use para | Não use como |
| --- | --- | --- |
| unidade de análise | acompanhar uma mudança de conhecimento, seu uso e sua retomada | seção editorial, palavra importante ou tema amplo |
| requisito de evidência | declarar desempenho necessário | justificativa automática para consolidação |
| observação | registrar apontamento ancorado | erro confirmado ou autorização de correção |
| achado de revisão | explicar problema no contexto corrente | entidade histórica universal |
| parâmetro definido | fixar condição pedagógica | medida de qualidade |
| fonte e âncora | localizar proveniência e seu papel | garantia de verdade ou autoridade científica |
| snapshot de Analytics | reproduzir desenho e configuração efetivamente aplicados | cópia integral do curso ou dado de aprendizagem |
| condição de pesquisa | separar cursos e configuração deliberada | experimento causal pronto |

Consulte [Análise instrucional](desenho-instrucional-parametrizado.md), [Revisão
e correções](auditoria-de-conformidade-instrucional.md), [Analytics](analytics-instrucionais.md)
e o [protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md).
