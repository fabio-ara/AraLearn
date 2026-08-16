# Guia de investigação

Este guia orienta a formulação de estudos sobre o AraLearn como artefato
sociotécnico: um sistema de software cuja operação depende de pessoas, regras,
conteúdo, instituições e infraestrutura. O objetivo é impedir que propriedades
do código sejam confundidas com efeitos educacionais.

## Antes de formular a pergunta

Comece por três documentos:

1. [Visão do produto](visao-do-produto.md), para delimitar o problema e o
   público;
2. [Modelo didático](modelo-didatico.md), para compreender a intervenção
   educacional pretendida;
3. [Arquitetura](arquitetura.md), para identificar os componentes que
   materializam essa intervenção.

Ao ler, classifique cada afirmação em uma destas categorias:

- **evidência externa:** resultado ou argumento encontrado na literatura;
- **decisão de design:** escolha feita para atender a um problema declarado;
- **propriedade implementada:** comportamento verificável do artefato;
- **hipótese:** relação ainda sujeita a investigação;
- **resultado empírico:** conclusão derivada de dados coletados e analisados
  por um estudo adequado.

Essa classificação evita inferências como “o sistema tem prática de
recuperação, logo melhora a aprendizagem”. A literatura pode justificar a
decisão de incorporar uma forma de prática; o efeito no contexto do AraLearn
continua dependendo de população, conteúdo, exposição, comparação e medida.

## Escolher a unidade de análise

A pergunta deve informar o que será observado. Exemplos de unidades distintas:

- uma pessoa retomando uma microssequência depois de uma interrupção;
- um card e a relação entre sua microteoria, representação e prática;
- uma sessão de autoria assistida e as revisões humanas realizadas;
- um workspace educacional e sua divisão de responsabilidades;
- uma publicação e o custo de armazenamento de suas revisões;
- um pipeline de validação e sua capacidade de impedir estados inválidos.

Misturar unidades produz conclusões vagas. Desempenho de sincronização não é
medida de aprendizagem; quantidade de alterações feitas por um modelo não é
medida de qualidade autoral.

## Selecionar uma estratégia de investigação

O corpus distingue duas famílias metodológicas complementares:

- **pesquisa baseada em design** investiga uma intervenção educacional em
  contexto, por ciclos de concepção, uso, análise e refinamento
  ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased));
- **Design Science Research** investiga um artefato, sua utilidade e o
  conhecimento de design produzido por sua construção e avaliação
  ([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm); [Venable et al. (2016)](referencias.md#ref-venable2016feds)).

Elas podem compartilhar episódios e dados, mas não são sinônimas. A primeira
acentua a intervenção e a aprendizagem situada; a segunda acentua o artefato,
seus requisitos e sua avaliação. O [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md) apresenta trilhas separadas para as
duas estratégias.

## Construir a cadeia de evidência

Para cada pergunta, registre:

| Elemento | Pergunta de controle |
| --- | --- |
| problema | o que ocorre hoje e para quem isso constitui problema? |
| construto | qual conceito não observável se pretende estudar? |
| indicador | qual dado pode representar parte desse construto? |
| mecanismo | por que a intervenção poderia produzir mudança? |
| rival | que outra explicação produziria o mesmo resultado? |
| decisão | qual resultado levaria a manter, alterar ou rejeitar o desenho? |
| limite | para quais pessoas, tarefas e contextos a interpretação é válida? |

O [quadro teórico](quadro-teorico.md) formula proposições e mecanismos; o
[glossário de construtos](glossario-construtos.md) impede que termos cotidianos
sejam usados como medidas; a [matriz de rastreabilidade
pedagógica](matriz-rastreabilidade-pedagogica.md) liga fundamento, decisão,
implementação e avaliação.

## Verificar afirmações técnicas

Quando a pergunta envolve computação, formule a propriedade de modo
observável. Por exemplo:

- uma operação repetida com a mesma chave não cria duas mudanças;
- uma réplica local permite abrir o curso sem conexão;
- uma migration transforma um schema conhecido em outro estado conhecido;
- um package inválido não pode ser registrado no catálogo;
- uma publicação aponta para o hash do artefato efetivamente validado.

A [matriz de conformidade técnica](matriz-conformidade-tecnica.md) aponta para
código, schemas, migrations e testes. Esses materiais permitem replicar a
verificação, mas também devem ser criticados: um teste cobre entradas e
ambientes delimitados e pode não revelar falhas fora deles.

## Planejar dados educacionais

O AraLearn não coleta automaticamente todo rastro possível. Antes de propor um
novo dado, responda:

1. qual pergunta ele atende;
2. qual construto pode e não pode representar;
3. que decisão legítima poderá apoiar;
4. por quanto tempo precisa existir;
5. quem poderá acessá-lo;
6. qual risco de vigilância, coerção ou interpretação indevida introduz.

Esse procedimento segue a preocupação ética de que analytics educacionais
devem ser orientados por finalidade, transparência e possibilidade de ação,
não por disponibilidade técnica ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). O
[estado de estudo não punitivo](estado-de-estudo-nao-punitivo.md) documenta os
dados funcionais atuais e as inferências que não são autorizadas.

## Preparar variantes no AraLearn

Quando a pergunta exige comparação entre versões instrucionais, use a ação
avançada **Experimentos** dentro de Desenho. Ela não cria uma medida nem coleta
todo rastro disponível; apenas governa a intervenção que poderá ser avaliada.

Antes de validar o protocolo:

1. escolha uma publicação privada aprovada como base comum;
2. delimite curso, lição ou microssequências pertencentes à base;
3. use definições de parâmetro existentes como fatores;
4. declare cada condição completa, sem pedir produto cartesiano automático;
5. informe o que deve permanecer invariante;
6. selecione uma regra de atribuição e registre referências de consentimento,
   instrumentos e outcomes;
7. explique o que levará a corrigir, aceitar ou invalidar uma divergência.

Um `ResourceSet` como fator fixa disponibilidade por `package@version`. Essa
lista não informa quais resources foram usados: seleção e materialização são
auditadas separadamente. Ausência de uma representação ideal precisa aparecer
como limitação da condição.

Depois da validação, o servidor deriva workspaces privados de variante da mesma
base, aplica locks, conserva o mapeamento de escopo e impede que o assistente
troque condição. A pessoa pesquisadora acompanha a materialização e a auditoria,
decide diferenças não previstas e só então congela cada revisão. Iniciar coleta
é uma ação separada do freeze.

Se um problema surgir depois do freeze, registre o motivo em **Criar revisão
corrigida** e confirme `retain_existing`: participantes já atribuídos permanecem
na revisão imutável recebida, novos ingressos aguardam a sucessora, e as
comparações dependentes são refeitas. Nunca edite a revisão congelada.

Participantes aderem sob consentimento versionado e recebem pseudônimo local ao
experimento. A atribuição é executada pelo servidor — manual, aleatória com seed
reprodutível ou balanceada simples — e fixa uma revisão congelada. A variante
já sincronizada abre offline; nova atribuição requer conexão. Participante não
entra no workspace autoral nem vê base, protocolo, seed ou outras condições.

O fluxo completo, suas garantias técnicas e suas alegações proibidas estão em
[Experimentos instrucionais parametrizados](experimentos-instrucionais-parametrizados.md).

## Executar e relatar

Antes da coleta:

- defina participantes, critérios de inclusão e contexto;
- obtenha a apreciação ética aplicável;
- registre instrumentos, protocolo, hipóteses e plano de análise;
- identifique versões do aplicativo, dos cursos e dos contratos;
- prepare um procedimento de interrupção e proteção de dados.

Durante a análise, preserve resultados negativos e divergências. Ao relatar,
separe claramente:

- o que a literatura já sustentava;
- o que o artefato implementava;
- o que o estudo observou;
- que explicações rivais permanecem;
- quais mudanças foram feitas depois da observação.

A [revisão de literatura](revisao-de-literatura.md) atual é uma síntese
orientada ao design, não uma revisão sistemática concluída. As referências
canônicas estão em [referencias.bib](referencias.bib), e o [protocolo de
avaliação](protocolo-avaliacao-artefato.md) deve ser adaptado à pergunta, à
população e à instituição responsável pelo estudo.
