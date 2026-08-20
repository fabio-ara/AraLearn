# Guia de investigação

## Finalidade

Este guia ajuda a estudar o AraLearn sem confundir uma propriedade do software
com um efeito educacional. **Parâmetros** torna decisões de desenho e fatos de
produção reproduzíveis; **Variantes** registra Cursos de origem comum; e
**Pesquisa** expõe fatos brutos e contagens descritivas. Nenhuma dessas áreas
cria, por si só, experimento, instrumento, medida, amostra ou inferência causal.

Antes de formular uma pergunta, consulte:

1. [Visão do produto](visao-do-produto.md);
2. [Modelo didático](modelo-didatico.md);
3. [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md);
4. [Arquitetura](arquitetura.md);
5. [Estado corrente](estado-atual-e-roadmap.md).

## Classificar a afirmação

Toda afirmação de pesquisa deve receber um estatuto:

- **evidência externa:** resultado ou argumento da literatura;
- **decisão de desenho:** escolha feita para responder a um problema;
- **propriedade implementada:** comportamento verificável do artefato;
- **hipótese:** relação ainda sujeita a investigação;
- **resultado empírico:** conclusão produzida por um estudo adequado.

Por exemplo, a literatura sustenta investigar prática de recuperação e
variação. O default de duas oportunidades no AraLearn é uma hipótese de
produto. Um teste pode provar que duas oportunidades distintas foram
registradas; não pode provar que uma pessoa aprendeu.

## Escolher a unidade de análise

A pergunta precisa dizer o que será observado. São unidades diferentes:

- uma pessoa retomando uma Microssequência;
- uma Unidade de estudo e suas formas explicativas;
- um requisito de evidência e suas oportunidades de prática;
- uma sessão de autoria e suas revisões;
- um Curso, uma Lição ou uma Microssequência sob determinada condição;
- uma tentativa de materialização;
- um evento técnico de revisão ou concorrência.

Quantidade de mudanças feitas por um assistente não é qualidade autoral.
Conformidade de uma Unidade não é desempenho do estudante. Egress, latência e
Storage não são medidas de aprendizagem.

## Usar os parâmetros correntes

O catálogo possui somente quatro operacionalizações:

1. teto de unidades da análise introduzidas por Unidade expositiva;
2. formas explicativas requeridas;
3. oportunidades distintas por requisito de evidência;
4. dimensões requeridas de variação da prática.

Cada definição informa constructo, operacionalização, limitações, evidência e
estatuto do default. Não crie uma quinta definição alterando JSON ou tabela.
Uma nova dimensão exige nova decisão de produto, revisão conceitual, migração,
interface, MCP e testes.

### Origem `research_condition`

`research_condition` identifica que um valor pertence a uma condição
deliberada. Ele não cria bloqueio, protocolo, aleatorização, consentimento,
atribuição de participante ou coleta. Uma pessoa autora pode substituí-lo no
Curso vivo; o evento registra a mudança. Variantes comparáveis registram uma
origem comum e diferenças declaradas, mas continuam sendo Cursos editáveis,
sem constituir um experimento governado.

Ao usar essa origem:

- declare a pergunta e a condição fora do valor;
- registre a revisão exata do Curso;
- mantenha invariantes e diferenças planejadas em protocolo próprio;
- não interprete o rótulo como garantia de isolamento experimental;
- não use o estado pessoal cotidiano como outcome implícito.

## Orientação natural e interpretação

O texto original da orientação é imutável por revisão. Uma interpretação
estruturada aponta para uma revisão exata e conserva resumo, diretivas,
divergências e perguntas. O original continua sendo a fonte humana; a
interpretação não pode reescrevê-lo.

Quando uma orientação for fator ou contexto de um estudo, registre:

- UUID e versão da revisão original;
- escopo e origem;
- UUID e versão da interpretação efetivamente usada, quando houver;
- divergências e perguntas ainda abertas;
- hash do contexto selado pela materialização.

Uma nova redação é outra versão. Não a descreva como equivalente sem avaliação.

## Planejado e aplicado

O resumo imediato compara:

- parâmetros efetivos resolvidos;
- orientações e política efetivas;
- itens do plano explicitamente atribuídos à Microssequência;
- fatos estruturados declarados na materialização;
- componentes realmente persistidos.

Ele pode mostrar teto excedido, forma não contabilizada na declaração,
oportunidade declarada insuficiente, variação declarada ausente ou componente
proibido. Esses são achados de conformidade ao desenho, não pontuações
educacionais.

Os fatos aplicados preservam identidades de Unidades de estudo e declarações
sobre unidades da análise, requisitos de evidência, oportunidades, formas,
dimensões e pacotes. Forma, oportunidade e variação não são inferidas
semanticamente do conteúdo pelo banco. A reconciliação material cobre IDs das
Unidades, pai/alvo e `componentRefs`. O registro não preserva conversa, prompt,
conteúdo gerado ou raciocínio privado.

## Caso DNS e DHCP

O corpus de regressão usa sete unidades explícitas: função do DNS, exemplo
nome–IP, hierarquia, registros e distribuição, mecanismo de resolução,
concessão DHCP e contraste DNS/DHCP.

O caso examina propriedades do artefato:

- teto de introduções por Unidade expositiva;
- cobertura das sete identidades;
- formas explicativas declaradas como desenvolvidas ou justificadamente não
  aplicáveis;
- oportunidades e variações por requisito;
- operação-alvo invariável.

Essas propriedades são verificadas sobre a aplicação factual fornecida ao
auditor. O teste delimita o esquema, a atribuição por alvo, as contagens e a
coerência
interna; não é uma observação semântica independente de que a explicação
desenvolveu uma forma ou que duas práticas diferem de modo substantivo.

Não há relação de dependência entre unidades de análise persistida neste marco;
portanto o teste não a inventa. A ordem curricular de Módulos, Lições,
Microssequências e Unidades continua verificável separadamente.

Casos metamórficos impedem proxy de comprimento:

- texto longo e estruturalmente claro pode passar;
- texto curto com muitas introduções pode falhar;
- fragmentar o mesmo texto sem desenvolver as formas continua falhando;
- omitir uma identidade planejada falha cobertura.

## Consultar fatos e comparar variantes

A área **Pesquisa** projeta sete conjuntos de fatos: atividade, produção,
desenho, Fontes, Observações, auditorias e variantes. Cada consulta fixa Curso,
revisão, filtros e instante de corte. Gráfico, tabela, lista, CSV, JSON e MCP
derivam da mesma resposta paginada.

Use a visão para localizar o registro que sustenta uma contagem. Informe a
definição, o denominador e as lacunas junto do número. Identidade de conta,
texto bruto de Observação e cópias integrais de conteúdo não fazem parte da
projeção.

Uma comparação de variantes permite verificar:

- o planejamento comum registrado;
- as diferenças de parâmetros ou componentes declaradas;
- os valores e políticas efetivos;
- as Partes, Unidades, componentes e referências existentes;
- mudanças posteriores que não haviam sido declaradas.

Esses fatos ajudam a descrever a intervenção. Eles não informam exposição,
aprendizagem ou efeito. Consulte [Pesquisa sobre a
Autoria](analytics-instrucionais.md) e [Variantes
comparáveis](experimentos-instrucionais-parametrizados.md).

## Construir a cadeia de evidência

Para cada estudo, registre:

| Elemento | Pergunta de controle |
| --- | --- |
| problema | o que ocorre hoje e para quem isso é um problema? |
| constructo | qual conceito não observável se pretende estudar? |
| operacionalização | qual regra ou unidade do AraLearn representa parte dele? |
| indicador | qual dado observável será usado e qual seu denominador? |
| mecanismo | por que a intervenção poderia produzir mudança? |
| rival | que explicação alternativa produziria o mesmo resultado? |
| decisão | que resultado mudaria o desenho? |
| limite | para quais pessoas, tarefas e contextos a interpretação vale? |

Um evento de parâmetro informa ator, canal, escopo, valor anterior e novo e
revisão. Ele demonstra que uma decisão mudou, não por que mudou nem seu efeito.

## Dados e privacidade

O AraLearn não coleta automaticamente todo rastro possível. Antes de propor
outro dado, responda:

1. qual pergunta ele atende;
2. qual constructo pode e não pode representar;
3. que decisão legítima poderá apoiar;
4. por quanto tempo precisa existir;
5. quem poderá acessá-lo;
6. qual risco de vigilância, coerção ou interpretação indevida introduz.

Parâmetros, orientações e fatos de materialização pertencem ao Curso e à
Autoria. O estado pessoal v2 contém somente progresso e **Rever**. Anotações
ancoradas são manifestações protegidas em uma relação separada, visíveis à
própria pessoa e ao proprietário para triagem. Não una esses conjuntos só
porque compartilham um `courseId`.

A projeção de Pesquisa inclui somente fatos redigidos sobre Observações. Texto
bruto e identidade da pessoa não são exportados. Quantidade, ausência,
categoria, estado, resposta, resolução e instantes não medem aprendizagem,
dificuldade, atenção, qualidade ou eficácia; `capturedAt` é uma pista de
contexto, não duração. Uma coleta adicional exige protocolo explícito,
minimizado e governado, com finalidade, retenção, acesso e inferências proibidas
documentadas.

## Estratégia de investigação

Pesquisa baseada em design e Design Science Research podem compartilhar
episódios e dados, mas não são sinônimas. A primeira acompanha intervenção e
aprendizagem situada; a segunda investiga o artefato, seus requisitos e sua
avaliação. Consulte o [protocolo de avaliação](protocolo-avaliacao-artefato.md).

Para alegação causal, o contrato de parâmetros é insuficiente. Ainda são
necessários, conforme a pergunta:

- população e critérios de inclusão;
- consentimento e apreciação ética aplicável;
- protocolo e hipóteses registrados;
- condição de comparação;
- regra de atribuição;
- instrumentos e outcomes válidos;
- controle de exposição, perdas e versões;
- plano de análise e explicações rivais.

## Relatar

O relatório deve separar:

- o que a literatura sustentava;
- o que foi decisão de produto;
- qual propriedade o software verificou;
- o que o estudo observou;
- quais interpretações rivais permanecem;
- quais alterações ocorreram depois da observação.

Preserve resultados negativos e divergências. Não apresente valor padrão como
evidência, conformidade como aprendizagem, `research_condition` como
randomização nem contagem descritiva como efeito educacional.
