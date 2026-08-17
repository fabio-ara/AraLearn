# Desenho instrucional parametrizado

## Finalidade e estado

O AraLearn representa um conjunto pequeno de decisões pedagógicas que uma
pessoa autora consegue compreender, revisar e aplicar a um Curso vivo. A mesma
resolução é usada pela interface, pelo MCP e pela materialização. O objetivo é
tornar uma intenção verificável; não é transformar preferência editorial em
ciência, produzir uma nota de qualidade nem inferir aprendizagem.

O recorte corrente possui quatro parâmetros pedagógicos, orientações autorais
em linguagem natural e uma política de componentes didáticos. Faixa de Partes,
limites de lote, bytes, altura e quantidade de elementos no DOM permanecem
políticas de produção ou cercas técnicas. Não participam da herança pedagógica.

A implementação está validada localmente. O [estado corrente](estado-atual-e-roadmap.md)
e o [roteiro de implantação](implantacao.md) registram os gates que ainda
impedem descrevê-la como promovida no ambiente hospedado.

## Quatro estatutos que não se confundem

| Estatuto | Exemplo | Interpretação permitida | Interpretação proibida |
| --- | --- | --- | --- |
| evidência externa | estudos sobre análise de conhecimento, explicação, recuperação ou variação | justificar que uma decisão merece ser investigada | afirmar que um valor local é universalmente ótimo |
| operacionalização do AraLearn | unidade de análise instrucional, forma explicativa ou oportunidade distinta | planejar e auditar o artefato com uma unidade explícita | declarar que o sistema observou conhecimento ou aprendizagem |
| propriedade de software | precedência determinística, referência exata e contagem reproduzível | verificar que o contrato foi respeitado | tratar conformidade técnica como eficácia educacional |
| hipótese de produto ou pesquisa | no máximo duas unidades novas por Unidade expositiva | produzir uma variante examinável e registrar sua origem | apresentar o número como constante cognitiva |

Essa separação acompanha cada definição do catálogo. O default é identificado
como hipótese de produto, não como conclusão da literatura.

## Catálogo pedagógico pequeno e fechado

Os quatro parâmetros aprovados são os únicos que podem ser atribuídos. Nenhum
comando cria definições ad hoc.

| Parâmetro | Valor | Default de produto | Escopos | O que operacionaliza |
| --- | --- | --- | --- | --- |
| `new_analysis_unit_ceiling_per_expository_study_unit` | inteiro positivo | `2` | Curso, Lição, Microssequência didática | teto de unidades de análise apresentadas pela primeira vez numa Unidade de estudo expositiva |
| `required_explanation_forms` | conjunto fechado | definição simples, exemplo concreto, mecanismo e contraste | Curso, Lição, Microssequência didática | formas que precisam ser desenvolvidas quando forem aplicáveis às unidades e relações planejadas |
| `minimum_distinct_practice_opportunities_per_evidence_requirement` | inteiro positivo | `2` | Curso, Lição, Microssequência didática | quantidade mínima de oportunidades semanticamente distintas por requisito de evidência |
| `required_practice_variation_dimensions` | conjunto fechado | caso ou dados | Curso, Lição, Microssequência didática | dimensões que precisam variar entre oportunidades dirigidas ao mesmo requisito |

As formas explicativas permitidas são:

- definição simples;
- exemplo concreto;
- mecanismo;
- contraste;
- condição de aplicação;
- limite ou exceção;
- exemplo resolvido;
- ligação entre representações.

Definição simples é a base. Exemplo concreto, mecanismo e contraste são
condicionais: quando uma forma não se aplica, o fato materializado registra a
forma e uma justificativa curta. Um processo ou relação causal torna mecanismo
pertinente; um vizinho confundível torna contraste pertinente; uma unidade
abstrata ou relacional que admita instância torna exemplo concreto pertinente.
O default não é checklist de oito itens.

As dimensões de variação permitidas são caso ou dados, contexto, característica
da tarefa, representação externa e nível de apoio. A operação-alvo permanece
invariante para um mesmo requisito de evidência. Trocar apenas palavras, ordem
visual ou componente não cria automaticamente outra oportunidade.

## O que não virou parâmetro

O catálogo não contém controles chamados densidade conceitual, dificuldade,
carga cognitiva, teoria/prática, cobertura, progressão ou qualidade. Esses
rótulos esconderiam unidades ou relações diferentes:

- densidade só pode ser uma métrica de pesquisa depois que unidade semântica,
  denominador, idioma, gênero e procedimento estiverem declarados;
- granularidade resulta da análise e da estrutura, não de um controle global;
- coordenação simultânea é uma relação ou conjunto auditável, não um número a
  ser maximizado ou minimizado;
- cobertura compara referências planejadas e aplicadas;
- progressão depende de ordem e dependências curriculares;
- teoria e prática são realizações observáveis nas Unidades, não uma proporção
  universalmente adequada.

Caracteres, linhas, pixels, bytes e tamanho do lote continuam importantes para
ergonomia e segurança. Nenhum deles, isoladamente, mede completude, coerência,
complexidade ou aprendizagem.

## Escopo, origem e precedência

Parâmetros pedagógicos podem existir em Curso, Lição e Microssequência
didática. Módulo não recebeu parâmetros neste marco porque não foi demonstrada
uma necessidade pedagógica distinta; a interface ainda mostra o contexto e a
herança quando um Módulo é selecionado. Orientações e política de componentes
podem usar Curso, Módulo, Lição ou Microssequência.

Cada atribuição aponta para o objeto concreto e registra uma origem:

- `system_default`: valor do catálogo, sem linha de atribuição;
- `automatic`: escolha explícita do assistente, com motivo breve;
- `author`: escolha de uma pessoa autora;
- `research_condition`: condição identificada de pesquisa, sem criar lock ou
  workflow experimental.

A resolução de parâmetros usa uma regra única:

1. entre `author` e `research_condition`, vence o escopo aplicável mais
   próximo;
2. se não houver valor explícito aplicável, vence o `automatic` mais próximo;
3. sem atribuição aplicável, vale o `system_default`.

Assim, uma escolha automática numa Lição não apaga silenciosamente uma escolha
explícita do Curso. `research_condition` identifica proveniência; não impede
que uma pessoa autora registre outra decisão no objeto corrente. Herança é
resultado calculado, nunca origem persistida.

Remover uma atribuição atua somente no parâmetro e escopo selecionados. A nova
leitura resolve novamente a cadeia e mostra o valor restaurado, sua origem e o
objeto de onde veio. Mudanças efetivas incrementam a revisão do Curso e geram
receipt idempotente e evento compacto; um no-op não cria falsa atividade.

### Exemplo de herança

Considere teto `2` definido pelo autor no Curso e teto `1` definido pelo autor
na Lição A. Uma Microssequência de A mostra valor efetivo `1`, origem `author`
e fonte Lição A. Limpar o valor da Lição faz a mesma Microssequência voltar a
`2`, com fonte Curso. Interface e MCP apresentam a mesma explicação.

## Itens do plano atribuídos a cada Microssequência

Unidades de análise instrucional e requisitos de evidência não se aplicam
automaticamente a todas as Microssequências de uma Parte ou do Curso. Uma
relação muitos-para-muitos atribui explicitamente cada item a zero ou mais
Microssequências e permite que cada Microssequência receba zero ou mais itens
dos dois tipos. Resultados de aprendizagem pretendidos continuam no plano, mas
não integram essa atribuição operacional.

Ao ler `course_design` numa Microssequência, `targetPlanItems` devolve duas
listas ordenadas: `instructionalAnalysisUnitIds` e
`evidenceRequirementIds`. Nos demais escopos, o campo é `null`. O comando
`set_target_plan_items` substitui atomicamente as duas listas do alvo; IDs de
outro Curso, de outro tipo ou repetidos são recusados. Interface e MCP usam o
mesmo comando, sem inferir cobertura a partir da Parte ou da posição
curricular.

## Orientações autorais em linguagem natural

Orientação natural não é um quinto parâmetro nem volta a ser um campo escalar
do plano. Cada edição cria uma revisão imutável com texto original, escopo,
origem, ator, canal e revisão do Curso. A conversão inicial preserva como
`migration` a orientação que existia no planejamento; essa origem é somente de
leitura e não pode ser escolhida por novos comandos.

A orientação efetiva é uma pilha ordenada do Curso até o alvo. Uma orientação
local complementa as ancestrais; não as reescreve. Limpar a orientação de um
escopo retira somente aquela revisão corrente.

Uma interpretação automatizada é outro registro, ligado à revisão exata do
texto. Ela conserva diretivas estruturadas, divergências e perguntas de
esclarecimento dentro de limites pequenos. Não altera o original. Uma nova
versão da orientação não herda silenciosamente a interpretação anterior.

A materialização sela os identificadores e versões exatos das orientações e
interpretações efetivas. Quando uma variante for tratada como condição de
pesquisa, essa referência permite saber qual texto e qual interpretação foram
usados sem guardar conversa, prompt ou raciocínio privado.

## Política de componentes didáticos

Política de componentes é separada dos parâmetros pedagógicos. O valor efetivo
é completo e usa a mesma precedência de autoridade dos parâmetros: entre
`author` e `research_condition`, vence o escopo aplicável mais próximo; na
ausência de política explícita, vence a `automatic` mais próxima e, por fim, o
`system_default`:

```text
catálogo exato
disponibilidade: todos ou apenas permitidos
permitidos
excluídos
preferidos
```

Cada referência usa `package@version` do catálogo canônico. Há no máximo 32
referências por conjunto. Exclusão vence permissão; preferência apenas
desempata entre opções ainda permitidas e semanticamente adequadas. Preferir
não obriga uso, e permitir não prova adequação.

O catálogo mostrado pela interface e pelo MCP vem no mesmo contrato de leitura
que a política. A Edge compara versão, referências, rótulos e finalidade com o
catálogo executável e falha diante de drift. Não existe `ResourceSet`, cópia de
contrato de package nem lista livre aceita do cliente.

Na próxima materialização, o servidor resolve a política para a
Microssequência, sela a revisão do catálogo e as referências efetivas e valida
os componentes realmente presentes no lote. Referência desconhecida,
excluída ou fora de uma lista `allow_only` reverte conteúdo, vínculo, etapa,
evento e receipt na mesma transação.

## Contexto efetivo e resultado aplicado

O cliente não fornece `designContext`. Ao iniciar uma tentativa, o servidor
resolve parâmetros, orientações, interpretações e política para cada
Microssequência-alvo e grava um contexto compacto de até 64 KiB. O contexto
sela catálogos do recorte com `{id, position, statement, version}` para as
unidades de análise e os requisitos de evidência atribuídos, além das duas
listas de IDs de cada alvo. O hash canônico inclui enunciados, versões e
atribuições e cerca todas as etapas posteriores.

Uma etapa de materialização registra somente fatos declarados sobre a
aplicação, em até 16 KiB:

- IDs das Unidades de estudo do lote;
- unidades de análise que o agente ou a pessoa autora declara ter introduzido
  em cada Unidade;
- formas explicativas declaradas como desenvolvidas ou não aplicáveis;
- oportunidades declaradas para requisitos de evidência;
- operação declarada como invariável e dimensões declaradas como variadas;
- componentes `package@version` declarados como usados.

O validador interno cerca schema, enumerações, unicidade, pertencimento aos
itens atribuídos ao alvo, teto, cobertura declarada, contagens, operação
invariável e dimensões exigidas. Isso torna a declaração consistente com o
próprio contrato, mas não observa semanticamente a prosa para descobrir se uma
forma foi de fato desenvolvida ou se duas oportunidades são substantivamente
distintas. O banco reconcilia materialmente somente os IDs de Unidades com o
lote, o pai e a Microssequência-alvo, e os `componentRefs` declarados com os
packages presentes no conteúdo persistido e com a política selada.

O registro não contém conteúdo gerado, prompt, conversa, justificativa extensa
nem cadeia de raciocínio. Cada `record_step` é auditado somente contra o
subconjunto de itens atribuído à sua Microssequência; não precisa cobrir itens
destinados a outro alvo da mesma tentativa.

A área **Parâmetros** resume planejado e aplicado usando apenas esses fatos
persistidos. Uma diferença significa divergência do contrato observado, não
baixa qualidade, dificuldade do estudante ou efeito educacional. Analytics e
inferência acadêmica mais ampla pertencem a marcos posteriores.

## Caso de regressão DNS e DHCP

O caso obrigatório registra sete unidades ou relações da explicação:

1. função do DNS;
2. exemplo nome → endereço IP;
3. hierarquia do DNS;
4. registros e distribuição;
5. mecanismo de resolução;
6. concessão do DHCP;
7. contraste entre DNS e DHCP.

Com teto `2` e formas definição, exemplo, mecanismo e contraste, a versão
densa falha no auditor porque sua declaração introduz muitas unidades de uma
vez e não contabiliza as formas aplicáveis. Uma versão reparada passa no
contrato quando:

- cada unidade possui primeira introdução identificada;
- nenhuma Unidade expositiva introduz mais de duas;
- as sete unidades estão cobertas;
- as formas aplicáveis foram declaradas como desenvolvidas ou justificadamente
  não aplicáveis.

Essa regressão verifica o contrato factual fornecido ao auditor. Ela não é um
analisador semântico da explicação e não transforma a declaração de uma forma,
oportunidade ou variação em observação independente do conteúdo.

O plano corrente não persiste relações de dependência entre unidades de
análise. O teste não inventa essa informação: ordem e dependências da estrutura
curricular continuam sendo validadas separadamente, enquanto uma futura
relação semântica só poderá ser auditada quando existir de ponta a ponta.

Os testes metamórficos impedem um atalho editorial: texto longo e claro pode
passar; texto curto e semanticamente denso falha; dividir o mesmo texto em
várias Unidades sem desenvolver termos continua falhando; omitir um dos sete
fatos falha cobertura. Não existe limiar de caracteres.

## Interface e MCP

A área **Parâmetros** usa navegação progressiva Curso → Módulo → Lição →
Microssequência, sem carregar o documento integral. Ela apresenta:

- valor efetivo, origem e escopo fonte de cada parâmetro;
- atribuição corrente e ação de limpar para restaurar herança;
- orientação original e interpretações separadas;
- política de componentes com opções legíveis do catálogo;
- cobertura planejada da Microssequência, com seleção natural das unidades de
  análise e dos requisitos de evidência do plano;
- resumo de planejado versus aplicado;
- produção e limites técnicos em bloco separado, somente quando pertinentes.

Não há editor JSON nem formulário com todas as decisões abertas ao mesmo tempo.
Módulo mostra os parâmetros herdados, mas não oferece controle pedagógico que o
catálogo não sustenta.

O MCP não ganha outra ferramenta. `lerCurso` consulta a vista `course_design`;
`alterarCurso` usa `update_course_design`. Ambos chegam ao mesmo domínio e às
mesmas RPCs owner-only da interface. O comando informa escopo, revisão esperada,
origem, motivo e `requestId`; replay idêntico devolve o mesmo resultado.
`set_target_plan_items` é a variante fechada que substitui a atribuição do alvo
e não exige origem ou motivo de parâmetro.

## Fundamentação e limites

O KLI fundamenta analisar explicitamente unidades e relações de conhecimento,
mas também mostra que granularidade depende da população e da tarefa
([Koedinger et al. (2012)](referencias.md#ref-koedinger2012kli)). O AraLearn
chama seus recortes de unidades de análise instrucional e não afirma que sejam
componentes cognitivos observados.

Coerência textual interage com conhecimento prévio e com as inferências que o
texto exige; não é uma função simples do comprimento
([McNamara e Kintsch (1996)](referencias.md#ref-mcnamara1996coherence)).
Explicações podem apoiar elaboração, condições de aplicação e relações com
princípios, mas seu efeito depende do conteúdo e de como são produzidas e
usadas ([Chi et al. (1989)](referencias.md#ref-chi1989selfexplanations);
[Wittwer e Renkl (2008)](referencias.md#ref-wittwer2008explanations)).

Prática de recuperação, distribuição e intercalação oferecem bases para
distinguir oportunidades e variações, sem estabelecer a mesma dosagem para
todo objetivo ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval);
[Cepeda et al. (2008)](referencias.md#ref-cepeda2008spacing);
[Taylor e Rohrer (2010)](referencias.md#ref-taylor2010interleaved)).
Representações externas precisam ser escolhidas por função e pela tarefa de
coordenação que impõem; quantidade não garante benefício
([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)).

Essas fontes justificam as dimensões examinadas. Os defaults `2`, as formas
iniciais e `case_or_data` continuam hipóteses do produto, sujeitas a revisão e
pesquisa. Conformidade estrutural não demonstra eficácia.

## Persistência, migração e orçamento

O catálogo é versionado e imutável. Mudanças de parâmetro, orientação e
política são append-only; a leitura deriva somente o estado corrente e a
herança. Defaults não geram linhas. Eventos são compactos e receipts existentes
continuam sendo usados; não há event store, snapshot global, blueprint ou
ledger paralelo.

A migration posterior ao corte de Unidade de estudo:

- exige o catálogo antigo exato e ausência de assignments, snapshots,
  análises, `ResourceSet`s e manifests antigos;
- bloqueia as relações legadas antes de contar suas linhas, evitando que uma
  escrita concorrente atravesse o preflight;
- aborta se houver qualquer tentativa ou etapa de materialização anterior à
  `1800`; esse estado não é reinterpretado sob o novo contexto;
- aborta e exige exportação privada diante de qualquer estado inesperado;
- resemeia apenas as quatro definições curadas, sem inferir defaults ausentes;
- cria a relação muitos-para-muitos de itens do plano por Microssequência;
- move a orientação existente do plano para uma revisão de escopo Curso;
- remove o campo antigo do plano e suas assinaturas, sem dual read/write;
- não converte `research_lock`, escopo Workspace ou referência opaca.

A leitura de um escopo falha fechada acima do hard cap executável de 256 KiB;
não existe promessa contratual de que toda leitura normal fique abaixo de
96 KiB. Valores individuais ficam abaixo de 4 KiB; orientação e interpretação,
abaixo de 8 KiB; política aceita no máximo 32 referências. A materialização
mantém os limites de 64 KiB para contexto e 16 KiB para fatos. São cercas de
Free Plan e transporte, não limites pedagógicos.

## O que os testes demonstram

Os gates cobrem domínio, PGlite, PostgreSQL real, Edge/API/MCP, navegador em
360/390/430 px e desktop, Estudo e corte transitório. Eles verificam:

- precedência, herança e restauração por `clear`;
- CAS, idempotência, no-op e autorização owner-only;
- imutabilidade do texto original e vínculo de interpretações;
- catálogo e políticas sem refs livres;
- atribuição muitos-para-muitos por alvo, contexto com enunciados e versões e
  aplicação cercada pelo hash;
- rejeição atômica de componente proibido;
- regressão DNS/DHCP e casos metamórficos sobre declarações contratuais, sem
  proxy de comprimento nem alegação de análise semântica independente;
- paridade entre interface e MCP.

Esses testes demonstram propriedades do artefato nos casos cobertos. Não medem
compreensão, aprendizagem, validade de construto nem sustentabilidade futura do
Free Plan.
