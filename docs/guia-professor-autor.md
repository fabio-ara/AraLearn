# Guia do professor e autor

Autoria é a interface manual e visual do mesmo Curso vivo usado em Estudo e
pelas ferramentas conversacionais. Nesta revisão, ela permite criar Cursos,
consultar planejamento e composição, alterar o planejamento básico e gerir
acesso direto. Edição contextual de Unidades, proveniência, auditoria,
correção, variantes e analytics ainda não devem ser tratadas como disponíveis.

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
4. Acrescente orientações iniciais, se houver.
5. Salve.

O Curso nasce privado e vazio. Não existe uma etapa separada de publicação para
torná-lo estudável: assim que a composição contém Unidades válidas, o próprio
proprietário pode abri-las em Estudo.

A criação é atômica e idempotente. Isso significa que uma repetição do mesmo
pedido, causada por falha de rede, recupera o resultado em vez de criar outro
Curso.

## Compreender as quatro áreas

Ao abrir um Curso, a barra iconográfica oferece quatro destinos.

### Planejamento

Mostra:

- objetivo;
- orientações;
- número de Partes de autoria registradas;
- número de decisões registradas.

O ícone de edição permite alterar título, objetivo e orientações. Há também um
campo avançado de **Estado estruturado**, atualmente em JSON, com quatro campos
fechados: versão, Partes, decisões e mandato.

Esse campo avançado é uma limitação corrente, não a experiência final desejada.
A interface futura deverá oferecer controles compreensíveis e edição em
linguagem natural sem expor JSON a uma pessoa leiga. Enquanto isso, não altere
o estado estruturado manualmente sem compreender seu contrato.

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
3. ler resumo, hierarquia ou páginas de entidades;
4. formular a alteração;
5. usar a revisão lida como condição da escrita;
6. reler e apresentar uma síntese verificável.

O assistente pode criar Curso, alterar metadados ou composição, gerir perfil e
acesso e consultar componentes didáticos. Ele não deve pedir à pessoa que
escolha ferramentas técnicas nem expor identificadores quando um link visual
for suficiente.

Se outra edição alterar o Curso antes da escrita, o servidor recusa a revisão
antiga. A resposta correta é reler e reconciliar a intenção; sobrescrever
silenciosamente anularia o propósito do controle de concorrência.

## Produzir conteúdo nesta revisão

A composição pode ser alterada pelo MCP em lotes atômicos de até 200 inclusões,
substituições ou exclusões. Cada entidade precisa respeitar:

- identidade única no Curso;
- pai do tipo correto;
- posição sem duplicidade;
- contrato fechado de conteúdo;
- revisão corrente do Curso.

**Parte de autoria** continua sendo a unidade operacional necessária para
planejar e materializar várias Microssequências numa interação, mas o novo ciclo
completo de Partes ainda não está conectado. O estado básico já reserva Partes
e a interface mostra sua contagem; dimensionamento, progresso, retomada e
mudança de plano ainda pertencem à próxima fatia.

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
