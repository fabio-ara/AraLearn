# Guia do professor e autor

Autoria é a interface manual e visual do mesmo Curso vivo usado em Estudo e
pelas ferramentas conversacionais. Nesta revisão, ela permite criar Cursos,
editar o plano instrucional e as Partes em linguagem natural, consultar a
composição, levar um pedido de materialização ao chat conectado e gerir acesso
direto. Edição contextual de Unidades, proveniência, auditoria, correção,
variantes e analytics ainda não devem ser tratadas como disponíveis.

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

## Compreender as quatro áreas

Ao abrir um Curso, a barra iconográfica oferece quatro destinos.

### Planejamento

Mostra:

- objetivo;
- público e escopo;
- orientação para a autoria;
- faixa preferencial e origem dessa preferência;
- resultados de aprendizagem pretendidos;
- unidades de análise instrucional;
- requisitos de evidência;
- Partes, Microssequências vinculadas e progresso derivado;
- atividade recente confirmada pelo serviço.

O ícone de edição permite alterar título, objetivo, público, escopo, orientação
e faixa preferencial. Cada uma das três listas aceita itens escritos em
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

### Estrutura

Percorre Módulos, Lições e Microssequências didáticas em páginas. A tela mostra
o título, contexto e resumo de cada entidade. Ela é uma inspeção da hierarquia,
não um segundo documento.

### Conteúdo

Lista as Unidades de estudo já materializadas, usando a mesma revisão do Curso.
Nesta fatia, Conteúdo ainda não oferece a rolagem vertical contínua nem a edição
contextual de cada Unidade. Essas capacidades precisam ser integradas antes de
considerar a inspeção autoral móvel concluída.

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
3. ler o plano instrucional, a hierarquia ou páginas de entidades;
4. formular a alteração;
5. usar a revisão do Curso e a versão específica lidas como condições da
   escrita;
6. reler e apresentar uma síntese verificável.

O assistente pode criar Curso, alterar o plano por comandos semânticos,
confirmar etapas de materialização, alterar a composição por uma operação
separada, gerir perfil e acesso e consultar componentes didáticos. Interface e
MCP usam as mesmas relações, regras de domínio, transações e projeções; não há
um plano reservado ao chat.

Se outra edição alterar o Curso antes da escrita, o servidor recusa a revisão
antiga. A resposta correta é reler e reconciliar a intenção; sobrescrever
silenciosamente anularia o propósito do controle de concorrência.

## Planejar e produzir por Parte nesta revisão

Para preparar a produção:

1. descreva a intenção de cada Parte;
2. organize as Partes na ordem de produção desejada;
3. mova ou retire os vínculos de Microssequência já existentes, se necessário;
4. use **Levar pedido ao chat conectado** na Parte escolhida;
5. cole o texto no cliente conectado e acompanhe somente o progresso que o
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

Uma etapa de materialização pode confirmar no mesmo commit mudanças de
entidades, vínculo com a Microssequência-alvo, fatos da etapa, revisão do Curso
e atividade. A escrita geral da composição permanece separada do planejamento:
editar o plano não substitui o conteúdo, e editar o conteúdo não reescreve o
plano implicitamente.

## O que ainda não fazer pela interface

Não trate as seguintes ações como implementadas no runtime canônico:

- editar cada Unidade diretamente;
- inspecionar fontes e âncoras de ponta a ponta;
- transformar observação de estudante em correção verificada;
- configurar parâmetros pedagógicos por escopo;
- criar condições e variantes comparáveis;
- consultar analytics de Autoria;
- disponibilizar Curso publicamente.

Essas tarefas permanecem objetivos do produto. Elas só entram neste guia como
operações quando tiverem interface compreensível, backend proporcional,
persistência, autorização, MCP quando aplicável e verificação de navegador.

## Verificar uma alteração

Depois de alterar um Curso:

1. releia o Curso na Autoria;
2. abra-o em Estudo;
3. percorra a hierarquia até a Unidade afetada;
4. confira conteúdo, resposta, feedback e navegação;
5. teste em largura de smartphone;
6. registre qualquer divergência como observação precisa.

A síntese deve distinguir o que mudou para quem estuda, o que mudou por trás,
por que foi necessário, qual complexidade entrou ou saiu, como foi verificado e
quais incertezas permanecem.

## Leituras relacionadas

- [Arquitetura](arquitetura.md)
- [Autoria por MCP](autoria-mcp.md)
- [Guia do estudante](guia-estudante.md)
- [Estado corrente](estado-atual-e-roadmap.md)
- [Vocabulário controlado](vocabulario-controlado.md)
