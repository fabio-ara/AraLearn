# Guia do professor e autor

Autoria é a interface manual e visual do mesmo Curso vivo usado em Estudo e
pelas ferramentas conversacionais. Nesta revisão, ela permite criar Cursos,
editar o plano instrucional e as Partes em linguagem natural, consultar a
configuração do desenho e a cobertura de cada Microssequência, manter Fontes e
Âncoras, atribuí-las a itens do plano ou Unidades, consultar a hierarquia,
inspecionar Unidades em sequência vertical, levar um pedido de materialização
ao chat conectado e gerir acesso direto. Edição contextual de Unidades,
observações autorais reunidas, auditoria, correção, variantes e analytics ainda
não devem ser tratadas como disponíveis.

## Abrir a Autoria

Na Home de Estudo, use **Autoria**. A lista mostra somente **Meus cursos**: cada
item pertence à conta autenticada.

Um Curso que outra pessoa compartilhou aparece em Estudo, mas não em Autoria.
Essa separação é intencional: o acesso direto permite praticar e conservar
estado pessoal; não concede edição.

A lista é paginada e pode ser pesquisada pelo título, objetivo e orientações
privadas. Quando a rede falha, Cursos conhecidos neste dispositivo podem
continuar visíveis, mas uma composição ainda não carregada exige conexão.

## Criar um Curso

1. Use o ícone **Criar Curso**.
2. Informe um título claro.
3. Descreva o objetivo instrucional.
4. Salve.

O Curso nasce privado e vazio. Não existe uma etapa separada de publicação para
torná-lo estudável: assim que a composição contém Unidades válidas, o próprio
proprietário pode abri-las em Estudo.

A criação é atômica e idempotente. Isso significa que uma repetição do mesmo
pedido, causada por falha de rede, recupera o resultado em vez de criar outro
Curso. Ela também cria um plano vazio com faixa preferencial inicial de 7–12
Partes. Essa faixa é configurável e não constitui lei pedagógica.

## Compreender as seis áreas

Ao abrir um Curso, a barra iconográfica oferece seis destinos.

### Planejamento

Mostra:

- objetivo;
- público e escopo;
- faixa preferencial e origem dessa preferência;
- resultados de aprendizagem pretendidos;
- unidades de análise instrucional;
- requisitos de evidência;
- Partes, Microssequências vinculadas e progresso derivado;
- atividade recente confirmada pelo serviço.

O ícone de edição permite alterar título, objetivo, público, escopo e faixa
preferencial. Cada uma das três listas aceita itens escritos em
linguagem natural, com controles para acrescentar, editar, reordenar e remover.
Não existe editor de JSON nessa experiência.

Uma Parte possui título, intenção operacional e ordem de produção. É possível
acrescentar, editar, reordenar, dividir ou unir Partes e mover uma
Microssequência entre elas. Parte não é um nível do currículo. Remover uma
Parte ou um vínculo conserva a Microssequência e todas as Unidades já
produzidas.

Os estados **Planejada**, **Em materialização**, **Atenção necessária**,
**Parcial** e **Materializada** são calculados a partir de vínculos, Unidades,
tentativas e etapas persistidas. A pessoa não marca esse status manualmente.

### Parâmetros

Começa no Curso e permite percorrer Módulo, Lição e Microssequência sem baixar
a composição inteira. Cada decisão mostra valor efetivo, origem e objeto de
onde veio.

Os quatro parâmetros pedagógicos controlam introduções por Unidade expositiva,
formas explicativas, oportunidades distintas de prática e dimensões de
variação. Eles podem ser definidos no Curso, na Lição ou na Microssequência.
Módulo mostra a herança, mas não oferece um override pedagógico sem necessidade
demonstrada.

**Remover definição local** não apaga o valor ancestral: resolve novamente a
cadeia e mostra o valor restaurado. Automático, autor e condição de pesquisa
são origens visíveis; condição de pesquisa não é lock nem experimento pronto.

Orientações autorais ficam separadas do Planejamento. O texto original possui
versão própria e pode receber uma interpretação com resumo, diretivas,
divergências e perguntas sem ser reescrito. A orientação efetiva acumula os
textos do Curso até o alvo.

Em **Componentes didáticos**, escolha todos ou apenas um subconjunto e marque
exclusões e preferências entre referências conhecidas do catálogo. Preferência
não obriga uso; exclusão prevalece. A próxima materialização usa e registra a
política resolvida.

Ao chegar a uma Microssequência, **Cobertura planejada desta
Microssequência** mostra as unidades de análise e os requisitos de evidência do
plano. Marque somente o que aquele alvo deve realizar. A relação é
muitos-para-muitos: o mesmo item pode aparecer em vários alvos e cada alvo pode
receber vários itens. Salvar substitui as duas listas daquela Microssequência,
sem atribuir automaticamente o plano inteiro.

O resumo planejado×aplicado usa apenas fatos persistidos. Divergência indica
que a materialização não demonstrou uma decisão planejada; não é nota de
qualidade nem medida de aprendizagem. Formas, oportunidades e variações são
declarações do agente ou da pessoa autora validadas internamente; o resumo não
alega que o banco as observou semanticamente no conteúdo.

### Fontes

Mostra o catálogo privado do Curso em páginas de até 24 itens. Uma Fonte possui identidade
estável, revisão, estado, tipo, título, citação, URL opcional, edição ou versão
opcional e visibilidade no Estudo. É possível criar uma Fonte, acrescentar uma
nova revisão ou aposentá-la. O histórico permanece preservado; revisar não
reescreve o fato anterior.

Na interface corrente, o histórico de Fonte ou de alvo mostra uma revisão por
página e oferece carregar mais. Essa é uma escolha de apresentação para manter
o painel leve, não um limite prometido pelo contrato da API.

No detalhe de uma revisão, crie Âncoras por intervalo de páginas, intervalo de
tempo, fragmento URI ou trecho textual exato. Uma Âncora fica presa à revisão
exata da Fonte e também é versionada. O trecho de verificação é privado e
opcional: ajuda a conferir a localização, mas nunca é enviado ao Estudo.

**Definir fontes** no Planejamento ou na Inspeção abre o editor do alvo. Salvar
substitui o conjunto completo, preservando a ordem escolhida. Cada vínculo novo
declara uma relação — **informa**, **sustenta**, **foi adaptado de** ou **foi
citado de** — e exige ao menos uma Âncora ativa da revisão exata da Fonte. Não
há vínculo novo sem localização comprovada.

Referências textuais anteriores aparecem como **Legado não resolvido**. Elas
mantêm identidade literal e ordem, podem exceder o limite de uma identidade
nova e permanecem ocultas. Resolver cria uma nova revisão ativa sob a mesma
identidade; não troque, apare ou “corrija” espaços do identificador legado. O
AraLearn não inventa título, citação, link ou Âncora ausente.

A visibilidade controla somente a projeção de Estudo:

- **Oculta** não aparece;
- **Citação** apresenta identificação e localização, sem URL;
- **Citação e link** também entrega a URL HTTPS.

O catálogo completo, revisões, trecho de verificação, autoria técnica e
histórico continuam owner-only.

### Estrutura

Percorre Módulos, Lições e Microssequências didáticas em páginas. A tela mostra
o título, contexto e resumo de cada entidade. Ela é uma inspeção da hierarquia,
não um segundo documento.

### Inspeção

Apresenta as Unidades de estudo materializadas numa sequência vertical e usa a
mesma revisão do Curso do início ao fim da leitura. A barra fixa informa a
posição curricular e permite avançar ou voltar. O filtro limita a sequência a
uma Parte, às Unidades sem Parte ou ao Curso completo; links de contexto abrem
o Módulo, a Lição, a Microssequência ou a Unidade exata.

A página carrega 12 Unidades por vez e mantém uma janela limitada enquanto a
pessoa rola. A Unidade e a distância em relação à barra são conservadas apenas
neste dispositivo. Ao voltar, a tela tenta reancorar essa posição; se o Curso
mudou, relê a nova revisão antes de continuar. Respostas aparecem somente para
preservar a representação, mas ficam desativadas: Inspeção não é Estudo nem
editor contextual.

### Pessoas

Mostra o proprietário e cada pessoa que recebeu **Acesso ao Estudo**. Nome e
foto aparecem quando disponíveis.

## Conceder acesso para Estudo

1. Abra **Pessoas**.
2. Use o ícone de acrescentar.
3. Informe o e-mail exato de uma conta existente.
4. Confirme a concessão.

O serviço não pesquisa nem sugere contas. O e-mail é usado para localizar a
identidade e não é incluído na resposta ou no evento de acesso. A pessoa passa
a encontrar o Curso em Estudo e conserva estado pessoal próprio.

Conceder acesso não:

- transfere propriedade;
- permite editar;
- cria grupo ou organização;
- revela outras pessoas favorecidas;
- duplica o Curso.

## Revogar acesso

Em **Pessoas**, use o ícone de retirar ao lado do nome e confirme. A revogação
impede novas leituras e novas mutações remotas de estado pessoal.

Dados já baixados em um dispositivo podem continuar fisicamente presentes até
a limpeza local. Por isso, acesso direto é adequado à prática autorizada, mas
não deve ser confundido com revogação criptográfica retroativa de bytes que já
foram entregues.

## Configurar nome e foto

Em **Conta e aparência**:

1. defina o nome legível;
2. escolha uma foto JPEG, PNG ou WebP de até 512 KiB;
3. salve.

A foto fica em um bucket privado e usa uma chave aleatória dentro do diretório
da própria conta. Ela pode ser lida somente pela própria pessoa e por pessoas
que possuem uma relação direta de acesso a Curso com ela. O perfil é humano e
mínimo; não constitui rede social.

Ao substituir a foto, a interface salva primeiro a nova referência e tenta
retirar o objeto anterior. Se a limpeza falhar, informa que ficou pendente. Para
excluir a conta, todos os objetos de avatar precisam ser removidos antes.

## Trabalhar com um assistente por MCP

O cliente MCP e a interface visual operam o mesmo Curso. O fluxo seguro é:

1. listar os Cursos próprios;
2. escolher o Curso pelo título e confirmar sua identidade;
3. ler o plano instrucional, o desenho efetivo, a hierarquia, a vista
   `course_sources`, a vista `study_units` ou páginas de entidades;
4. formular a alteração;
5. usar a revisão do Curso e a versão específica lidas como condições da
   escrita;
6. reler e apresentar uma síntese verificável.

O assistente pode criar Curso, alterar o plano por comandos semânticos,
definir ou limpar parâmetros e orientações, gerir a política de componentes,
atribuir itens do plano a cada Microssequência,
criar, revisar e aposentar Fontes e Âncoras, substituir atribuições de
proveniência, confirmar etapas de materialização, alterar a composição por uma
operação separada, gerir perfil e acesso e consultar componentes didáticos.
Interface e MCP usam as mesmas relações, regras de domínio, transações e
projeções; não há um desenho reservado ao chat.

Para revisar conteúdo, prefira `lerCurso` com `view: "study_units"`. Escolha o
mesmo escopo disponível na interface e use a revisão devolvida, a âncora para
entrar numa Unidade específica e os cursores para percorrer páginas adjacentes.
O MCP recebe os mesmos links profundos, limites e erros da Inspeção visual; não
deve baixar a composição inteira apenas para revisar Unidades.

Se outra edição alterar o Curso antes da escrita, o servidor recusa a revisão
antiga. A resposta correta é reler e reconciliar a intenção; sobrescrever
silenciosamente anularia o propósito do controle de concorrência.

## Planejar e produzir por Parte nesta revisão

Para preparar a produção:

1. descreva a intenção de cada Parte;
2. organize as Partes na ordem de produção desejada;
3. mova ou retire os vínculos de Microssequência já existentes, se necessário;
4. em **Parâmetros**, atribua a cada Microssequência suas unidades de análise e
   seus requisitos de evidência;
5. em **Fontes**, resolva o catálogo e as Âncoras e atribua conjuntos completos
   aos itens do plano que sustentam a Parte;
6. use **Levar pedido ao chat conectado** na Parte escolhida;
7. cole o texto no cliente conectado e acompanhe somente o progresso que o
   serviço confirmar.

O botão apenas copia o pedido para a área de transferência. Ele não abre uma
tentativa, não cria Unidades e não transforma a Parte em materializada. Quando
o cliente conectado realmente executa o trabalho, cada tentativa possui etapas
retomáveis e recibos. Só fatos persistidos aparecem no status e na atividade
recente.

Quando existe uma tentativa, **Ver etapas** carrega somente seus detalhes:
estado e versão de cada etapa, próxima etapa pendente e fatos limitados que o
serviço realmente registrou. Fechar esse detalhe não muda o Curso. A mesma
leitura está em `lerCurso` com a vista `part_materialization`, permitindo que
um chat reconectado continue sem confiar na memória da conversa anterior.

Durante uma tentativa em andamento, ainda é possível corrigir título, objetivo
e itens independentes do plano. Alterar, retirar, reordenar ou trocar vínculos
da Parte em execução é recusado até que ela termine ou seja marcada como falha.

A composição pode ser alterada pelo MCP em lotes atômicos de até 200 inclusões,
substituições ou exclusões. Cada entidade precisa respeitar:

- identidade única no Curso;
- pai do tipo correto;
- posição sem duplicidade;
- contrato fechado de conteúdo;
- revisão corrente do Curso.

O contrato da composição usa `aralearn.course.v1`, `studyUnits` como coleção da
Microssequência e `study_unit` como tipo persistido. Esses nomes não possuem
alias corrente. `sources` não é campo da Unidade. Para cada Unidade incluída ou
substituída, a mesma operação declara exatamente uma aplicação de atribuição,
mesmo quando o conjunto é vazio. Cada linha alterada é validada pelo seu tipo,
e dependências de Microssequência são verificadas no escopo das Lições
atingidas.

Uma etapa de materialização pode confirmar no mesmo commit mudanças de
entidades, vínculo com a Microssequência-alvo, aplicação do desenho, atribuição
de Fontes, fatos da etapa, revisão do Curso e atividade. O servidor aceita
somente revisões e Âncoras já seladas a partir das atribuições dos itens do
plano. A escrita geral da composição permanece separada do planejamento:
editar o plano não substitui o conteúdo, e editar o conteúdo não reescreve o
plano implicitamente.

## O que ainda não fazer pela interface

Não trate as seguintes ações como implementadas no runtime canônico:

- editar cada Unidade diretamente;
- transformar observação de estudante em correção verificada;
- registrar observações autorais no ciclo unificado da #124;
- produzir achados, correções ou verificação independente da #125;
- criar condições e variantes comparáveis;
- consultar analytics de Autoria;
- disponibilizar Curso publicamente.

Essas tarefas permanecem objetivos do produto. Elas só entram neste guia como
operações quando tiverem interface compreensível, backend proporcional,
persistência, autorização, MCP quando aplicável e verificação de navegador.

## Verificar uma alteração

Depois de alterar um Curso:

1. releia o Curso na Autoria;
2. use a Inspeção e o link profundo da Unidade afetada;
3. confira na atribuição a revisão e as Âncoras exatas das Fontes;
4. abra-o em Estudo;
5. percorra a hierarquia até a mesma Unidade;
6. confira conteúdo, resposta, feedback, navegação e a projeção redigida de
   Fontes;
7. teste em 360, 390 e 430 px e desktop;
8. registre qualquer divergência como observação precisa.

A síntese deve distinguir o que mudou para quem estuda, o que mudou por trás,
por que foi necessário, qual complexidade entrou ou saiu, como foi verificado e
quais incertezas permanecem.

## Leituras relacionadas

- [Arquitetura](arquitetura.md)
- [Autoria por MCP](autoria-mcp.md)
- [Guia do estudante](guia-estudante.md)
- [Estado corrente](estado-atual-e-roadmap.md)
- [Vocabulário controlado](vocabulario-controlado.md)
