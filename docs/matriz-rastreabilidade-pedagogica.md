# Matriz de rastreabilidade pedagógica

A matriz relaciona as decisões do [modelo didático](modelo-didatico.md) ao que
pode ser inspecionado no AraLearn e às perguntas de avaliação correspondentes.
Por exemplo, conservar o ponto de estudo pode ser verificado no software; saber
se a retomada fica mais fácil exige observar pessoas retornando a uma tarefa.

As **unidades de análise instrucional** são recortes de conhecimento acompanhados
no planejamento. Um **requisito de evidência** declara o que a prática precisa
solicitar para examinar um objetivo. O [desenho instrucional](desenho-instrucional-parametrizado.md)
explica esses registros. Já a **unidade de estudo** é a etapa apresentada a quem
estuda; pode desenvolver vários recortes de conhecimento. Uma **microssequência**
reúne unidades voltadas a um objetivo delimitado. A
[configuração aplicada](parametros-de-autoria.md) conserva as escolhas usadas na
produção dessa etapa, permitindo compará-las à intenção atual.

A verificação do artefato confere seus registros e comportamentos. A avaliação
do conteúdo e do uso examina a adequação dessas escolhas, com os métodos do
[protocolo de avaliação](protocolo-avaliacao-artefato.md). A
[matriz técnica](matriz-conformidade-tecnica.md) localiza implementações e testes
para reproduzir as verificações.

| Compromisso | Como aparece no AraLearn | Verificação do artefato | Avaliação do conteúdo ou do uso | Sinal para rever |
| --- | --- | --- | --- | --- |
| Repertório acumulado | o planejamento identifica os recortes de conhecimento, e a revisão distingue sua introdução, uso e retomada | inventário declarado e aplicações salvas; casos sintéticos e teste de granularidade | especialistas comparam repertório e explicação para públicos definidos | tópico amplo esconde várias novidades, ideia reaparece sob outro nome ou conhecimento auxiliar é usado cedo demais |
| Teto de novidades orienta a distribuição | o máximo de recortes novos vale nas unidades expositivas, que ensinam conteúdo, e nas mistas, que reúnem ensino e prática; ampliar artificialmente um recorte compromete essa contagem | a gravação das unidades valida referências e introduções | comparar, por exemplo, tetos 1 e 2 com o mesmo repertório e público definido | menos unidades surgem por compressão ou o repertório muda entre condições |
| Unidade focal desenvolve uma função didática | cada etapa desenvolve uma relação, um exemplo ou uma prática com o contexto necessário | apresentação do conteúdo salvo; testes localizam problemas de estrutura e disposição | tarefas de compreensão e inspeção especializada | uma tela acumula novidades ou a sequência fragmenta uma ideia sem progressão |
| Conhecimentos necessários à tarefa ficam disponíveis | conhecimentos mobilizados como estabelecidos precisam ter sido ensinados ou assumidos expressamente como pré-requisitos; relações essenciais recebem desenvolvimento próprio | caso sintético autocontido e leitura do percurso na interface | público-alvo tenta explicar e aplicar as relações | a tarefa pressupõe como dominado um conhecimento ainda indisponível ou a explicação deixa uma relação implícita |
| A posição da prática corresponde à sua finalidade | na [tentativa anterior à explicação](desenho-instrucional-parametrizado.md#explicação-prática-e-posição-na-sequência), o requisito identifica o alvo a ensinar depois; na consolidação posterior, a prática mobiliza o ensino já oferecido | parâmetro de posição, ordem salva e [teste de materialização](../tests/runtime/course-human-materialization.test.js) | comparar sequências com público e objetivos definidos, distinguindo tentativa inicial e desempenho posterior | tentativa prévia é tratada como domínio já exigido ou o ensino posterior fica ausente |
| Cobertura é auditável | vínculos ligam cada assunto previsto no escopo ao mapa e às unidades em que a autoria declara seu desenvolvimento | mapa curricular e vínculos de cobertura | especialista confere o desenvolvimento e sua profundidade diante do objetivo | item foi apenas mencionado ou ficou sem unidade materializada |
| A prática corresponde aos requisitos e às variações escolhidas | as oportunidades do mesmo requisito conservam a operação-alvo; a configuração indica quais aspectos devem variar entre elas, quando aplicável, como os dados ou o apoio disponível | parâmetros efetivos e dados de autoria sobre a prática | avaliar desempenho e aplicação em tarefas novas conforme o protocolo | a contagem depende de um requisito artificial ou diferenças apenas visuais são tratadas como variação substantiva |
| Representação serve à função | a escolha de [componentes didáticos](componentes-didaticos.md) considera o que a pessoa precisa interpretar ou fazer; a aplicação registra a forma explicativa | catálogo, apresentação na interface e inspeção contextual | especialista e público julgam adequação e acessibilidade | um formato é escolhido por hábito ou condensa uma relação essencial |
| Alvos e direção editorial preservam conteúdo | alvos flexíveis de palavras e orientações de escrita complementam os parâmetros de explicação e prática | configuração por curso/microssequência e extensão observada | comparação autoral com repertório constante | alvo vira limite e elimina novidade ou prática em vez de reorganizar unidades |
| Configuração distingue contexto de condição | o modo automático exige escolha contextual pelo assistente de inteligência artificial (IA) na produção; valor fixado pelo pesquisador prevalece e fica auditável no uso efetivo | configuração aplicada registrada nas unidades e exportação da análise | comparação entre cursos independentes sob protocolo declarado | combinação predefinida é tratada como universal ou condição fixada é silenciosamente recalibrada |
| Planejamento e acordo de autoria orientam a produção | o mapa situa as microssequências nos módulos e nas lições; o [acordo de autoria](parametros-de-autoria.md) conserva os pontos de revisão, e a autonomia expressamente autorizada para o curso permite produzir com o mapa em rascunho | tarefas de planejamento e produção consultam o acordo vigente e as condições do recorte | observação de autoria longa, autonomia autorizada e retomada em conversa nova | produção ignora um ponto de revisão acordado, parte vira nível curricular ou autorização para continuar é tratada como revisão humana |
| A revisão considera as dependências do problema | [observações](observacoes-pedagogicas.md) registram apontamentos ligados ao conteúdo; a [preparação da revisão](auditoria-de-conformidade-instrucional.md) examina onde uma correção pode alterar a progressão ou o sentido de outra tarefa | preparação contextual e correções em conjunto | revisão por especialistas e pessoa autora | reparo altera só o alvo anotado apesar de dependências evidentes |
| A origem do conteúdo pode ser conferida e contestada | [fontes e localizações](fontes-e-citacoes.md) registram a proveniência, isto é, de onde vem o material e como ele foi usado; esses vínculos podem ser corrigidos | estado corrente de fontes e autorização dos arquivos anexados | checagem disciplinar e bibliográfica | link é tratado como prova ou fonte não pode ser questionada |
| A pessoa conserva autoridade sobre as decisões | a pessoa define o alcance da autonomia e os pontos de inspeção; o mandato conserva esse acordo, e a revisão autoral exige declaração própria | operações distintas para ler, alterar e declarar revisão | observar se a pessoa compreende as consequências e consegue intervir, conforme a discussão de [autonomia e controle humano](modelo-didatico.md#autonomia-com-suporte-e-responsabilidade-humana) | coordenação técnica oculta efeitos ou amplia o alcance de uma autorização |
| Dados de autoria permitem inspecionar o material | a área [Dados de autoria](analytics-instrucionais.md) permite consultar o desenho e as intervenções registradas no recorte escolhido | contrato de dados v4, painel e arquivo de exportação correspondente | interpretação dentro de pergunta e protocolo declarados | contagem vira pontuação, autoria percentual ou conclusão sobre aprendizagem |
| Explicação oferece conteúdo de apoio com fontes | cada microssequência oferece às suas unidades a mesma [explicação](explicacao-e-revisao-humana.md), que pode reunir texto, representações visuais e áudio; os parâmetros continuam orientando a produção das unidades | leitura da base salva, vínculos com fontes e registro da base usada na produção | consulta por iniciantes e exame de como o apoio é usado na tarefa | a unidade vira apenas um atalho ou a base omite pressupostos necessários |
| Revisão humana tem alvo definido | explicação e unidades recebem declarações independentes sobre o conteúdo inspecionado | registros por objeto e sinalização de mudança material posterior | observar compreensão da declaração, qualidade da inspeção e decisões de correção | abrir, salvar ou corrigir é tratado como aprovação automática |
| Inspeção de IA permanece vinculada à base examinada | a [inspeção por IA](auditoria-de-conformidade-instrucional.md#inspeção-por-ia-sobre-o-conteúdo-salvo) registra critérios, justificativas e trechos do conteúdo salvo; a base inclui a ordem de estudo e as relações pertinentes | leitura da base pedagógica, verificação das evidências e dos estados do parecer | avaliação independente da correção dos julgamentos e das insuficiências encontradas | parecer atual é tratado como aprovação humana ou como resultado de aprendizagem |
| Autoria e acesso não se confundem | proprietário edita; acesso público ou direto concede estudo; visitante não envia observação | regras de acesso no banco, leituras autorizadas e autorização comum | tarefas de compreensão de propriedade | pessoa com acesso altera o original ou dados privados atravessam cursos |

## Alcance de cada registro

| Objeto | Use para | Não use como |
| --- | --- | --- |
| unidade de análise instrucional | acompanhar um recorte de conhecimento planejado, seu desenvolvimento, uso e retomada | correspondência automática com uma palavra, seção editorial ou tema amplo |
| requisito de evidência | declarar o que a tarefa pretende permitir observar | desempenho já observado ou requisito artificial criado apenas para contar práticas |
| observação | registrar apontamento ancorado | erro confirmado ou autorização de correção |
| parâmetro definido | registrar uma escolha de desenho ou de processo | medida de qualidade |
| fonte e localização do trecho | localizar proveniência e seu papel | garantia de verdade ou autoridade científica |
| dados de autoria | inspecionar desenho e configuração efetivamente aplicados | medida de aprendizagem ou cópia integral por si só |
| exportação de curso e análise | conservar conteúdo salvo, análise e metadados de proveniência e revisão | cópia dos arquivos anexados ou garantia de exposição imutável |
| condição de pesquisa | delimitar escolhas fixadas em cursos independentes para comparação | experimento causal pronto |
