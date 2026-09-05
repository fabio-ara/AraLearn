# Uso do aplicativo

Este guia reúne as operações disponíveis no site e no aplicativo Android. O
[Guia do estudante](guia-estudante.md) e o [Guia do professor e
autor](guia-professor-autor.md) desenvolvem os dois percursos em separado.

As ações de limpeza local, o envio autenticado de PDF e o compartilhamento por
identificador integram o contrato comum do site e do aplicativo Android.

## Conceitos para começar

Uma **conta** autentica uma pessoa. O perfil contém um identificador escolhido
e foto opcional, usados para reconhecer relações diretas de curso. A pessoa
escolhe o identificador ao concluir o cadastro ou a atualização de perfil antigo.

Um **Curso vivo** é o mesmo objeto em Estudo, Autoria e ferramentas
conversacionais. O conteúdo pode mudar sob a mesma identidade e fica disponível
para Estudo assim que contém Unidades válidas.

**Estudo** permite selecionar cursos próprios, compartilhados ou públicos,
começar, continuar ou retomar o percurso e marcar unidades para rever. Cursos
públicos também podem ser abertos sem conta, pelo seletor ou endereço direto.
Visitantes conservam progresso e Rever neste navegador; registrar observações
exige conta, e editar exige ser proprietário.

**Autoria** apresenta somente cursos próprios e abre diretamente em Conteúdo.
Planejamento fica sempre à mão; Parâmetros, **Fontes**, Revisão, Analytics e Pessoas
e acesso aparecem no menu de tarefas.

Uma **réplica local** é a cópia dos dados necessários à continuidade no
dispositivo. Ela permite retomar conteúdo carregado, enquanto o servidor
continua responsável por propriedade, acesso e estado compartilhado.

## Criar uma conta

1. Na tela de acesso, use **Criar conta**.
2. Informe e-mail e senha com pelo menos oito caracteres.
3. Envie o formulário.
4. Se a instalação exigir confirmação, abra a mensagem recebida.
5. Volte ao aplicativo e entre.
6. Escolha seu identificador público quando solicitado.

Cada pessoa deve usar a própria conta. Assim, propriedade, acesso e autoria
continuam associados à identidade correta.

## Entrar e recuperar a senha

Para entrar, informe e-mail e senha e use **Entrar**. A preparação apresenta as
etapas **Dispositivo**, **Conta** e **Cursos**. Se os dados locais estiverem
inconsistentes, a tela oferece tentar novamente ou limpar o dispositivo. A
limpeza exige confirmação porque descarta mudanças ainda não sincronizadas.

Para recuperar a senha:

1. use **Recuperar senha**;
2. informe o e-mail;
3. abra o link recebido;
4. defina e repita a nova senha.

Um link inválido ou pertencente a um fluxo de autenticação incompatível é
recusado. Nesse caso, solicite outro link pelo aplicativo.

## Alterar perfil e aparência

Abra **Conta e aparência**. O identificador tem de 3 a 30 caracteres ASCII:
letras minúsculas, números, ponto, sublinhado ou hífen, com primeiro e último
caracteres alfanuméricos. A entrada aceita `@` inicial e converte maiúsculas;
não há segundo nome obrigatório. Se o identificador estiver ocupado, escolha
outro. A foto pode ser
JPEG, PNG ou WebP de até 512 KiB. Abra **Foto do perfil** para escolher ou
substituir uma imagem; **Remover foto** só aparece quando existe algo a remover.
Use **Voltar** ou `Esc` para retornar à vista principal e salve o perfil.

A foto fica em armazenamento privado. Ao substituí-la, o aplicativo primeiro
registra a nova referência e depois remove o objeto anterior. Uma falha nessa
segunda etapa é informada para que a remoção possa ser refeita. Se salvar o
perfil perder a resposta depois do envio, o aplicativo relê o perfil e não
apaga uma foto que já tenha virado a referência ativa. Quando não consegue
confirmar o resultado, a tela preserva o objeto e pede **Salvar** novamente para
confirmar o vínculo ou removê-lo antes de escolher outro arquivo.

Na mesma área, escolha o tema do sistema, claro ou escuro. A preferência fica no
dispositivo e não altera nenhum curso.

## Alternar entre Estudo e Autoria

Use o seletor **Estudo / Autoria** na tela inicial.

- **Estudo** reúne todos os cursos acessíveis num seletor e apresenta uma prévia
  rica do curso selecionado.
- **Autoria** mostra somente cursos próprios.

A ausência de um curso compartilhado em Autoria indica o alcance da concessão:
a pessoa pode estudar e registrar observações. A edição contextual está disponível
somente ao proprietário e altera o mesmo curso.

## Abrir e percorrer um Curso

1. Em Estudo, escolha uma opção no seletor **Curso**.
2. Confira título, objetivo, relação de acesso, progresso e disponibilidade na
   prévia selecionada.
3. Use **Abrir**. A entrada mostra primeiro os módulos, independentemente do
   progresso já salvo.
4. Escolha módulo, lição ou microssequência para chegar às Unidades.

Na primeira abertura, o aplicativo baixa a composição em páginas, confirma que
todas pertencem à mesma revisão e valida o documento. Depois, mantém uma cópia
local para retomada.

Quando a Unidade possuir proveniência pública, use **Fontes**. A consulta
apresenta somente as fontes e localizações autorizadas. Uma fonte oculta não
aparece. Um uso pendente de verificação é identificado como tal. **Referência**
omite o endereço; **Referência e acesso** permite os meios autorizados.

## Responder, avançar e rever

Quando houver uma prática, responda no próprio componente e use **Continuar**.
Complete os campos indicados, leia o retorno e use **Continuar** novamente para
avançar. A Unidade concluída e o novo ponto de retomada entram no estado pessoal.

Use **Marcar para rever** dentro da Unidade para acrescentá-la à seção **Rever**
da tela inicial. O mesmo controle retira a marca. Na Home, cada item também pode
ser retirado diretamente; **Desfazer** restaura a marca sem sair da tela.

O AraLearn não transforma a resposta momentânea em nota, classificação entre
pessoas ou medida de aprendizagem.

## Registrar uma observação

1. Na Unidade, use **Observação**.
2. Escolha **Dúvida**, **Possível erro**, **Trecho confuso**, **Sugestão** ou
   **Sem categoria**.
3. Escreva até 2.000 caracteres Unicode, respeitado o limite de 16 KiB.
4. Salve.

É possível criar várias observações na mesma Unidade. Abra um item para editar
ou retirar e consulte sua categoria, seu estado, a sincronização e eventual
resposta. A Anotação ancorada chega à caixa de entrada do proprietário; outros
estudantes não a recebem.

## Zerar o progresso

Quando há progresso, a prévia selecionada oferece **Zerar progresso do curso**.
Confira o título na confirmação. A ação limpa o progresso e o ponto de retomada
daquele curso e preserva conteúdo, marcas **Rever**, Anotações e outros cursos.

Dentro do percurso, controles de reinício delimitam o alcance pelo rótulo:
módulo, lição, microssequência ou a partir de uma Unidade.

## Criar e planejar um curso

Em Autoria, use **Criar curso**, informe título e objetivo e salve. O curso nasce
privado e abre em Conteúdo. A barra superior conserva o contexto; Conteúdo e
Planejamento usam atalhos permanentes, e o menu reúne as tarefas ocasionais. A
superfície mantém uma coluna útil de até 430 px também no computador.

Em **Planejamento**, o mapa curricular começa pelos módulos recolhidos. Abra
somente o módulo e a lição que deseja examinar para revelar suas microssequências.
**Objetivo** mostra o texto completo de cada nível. Os pré-requisitos e a
**Cobertura do escopo** oferecem links para os pontos correspondentes do curso;
ao voltar, o mapa conserva os ramos abertos, a posição e o foco.

Confira o mapa completo antes de aprová-lo. Expandir um ramo é apenas uma ação
de leitura e não exige aprová-lo separadamente. A aprovação global não inclui
exercícios, componentes ou unidades futuras que ainda não existem.

Depois da aprovação global, **Lotes de produção** mostra as partes usadas para
materializar e revisar o curso aos poucos. Uma parte pode agrupar uma ou mais
microssequências, mas não pertence à hierarquia curricular. Dividir, unir ou
reordenar lotes preserva o mapa. O conteúdo confirmado fica em Conteúdo, não num
histórico de execução.

Use **Reorganizar lotes** para **Dividir**, **Reunir** ou **Reordenar** uma parte.
Confira a prévia **Microssequências no lote**, o título, a intenção e a progressão
antes de **Salvar reorganização**. A reunião conserva os textos dos lotes para
sua revisão; ela não resume nem reescreve as unidades. **Descartar reorganização**
abandona a proposta. Se houver uma mudança concorrente, o rascunho permanece
disponível para comparação com o planejamento relido. Se a confirmação do envio
for incerta, repita a mesma tentativa para recuperar o resultado, sem preparar
uma reorganização diferente sobre a dúvida.

## Usar áudio e ferramentas da unidade

Em Estudo, as ferramentas aparecem à esquerda dos controles habituais da
Unidade. Os dois primeiros atalhos ficam visíveis; **Mais ferramentas** revela
as restantes. Fechar uma ferramenta devolve o foco e a posição de leitura.
A calculadora trabalha com expressões e explicita a precisão aproximada.
Gramática, dicionário e leitura podem oferecer várias consultas relacionadas
ao conteúdo, independentes das referências bibliográficas.

Em Autoria, abra **Áudio** no menu do curso. **Configuração** define idioma,
velocidade e voz nativa preferida. A disponibilidade das vozes depende do
dispositivo; uma voz escolhida indisponível pede uma escolha explícita. Vozes
remotas exigem permissão no curso e consentimento do estudante ao usar a
ferramenta. Uma voz local disponível pode funcionar sem rede.

Em **Arquivos**, selecione WAV PCM ou MP3, confira a prévia e use **Guardar
áudio**. Cada arquivo aceita até 20 MiB; PDFs e áudios compartilham 64 MiB por
curso. Guardar um arquivo não o inclui automaticamente numa Unidade: escolha
o áudio ao compor o conteúdo. Uma Unidade pode conter várias faixas e uma
alternativa textual sempre visível, sob demanda ou depois da resposta.

**Gerar voz** usa o serviço configurado no curso. Informe o texto, forneça a
chave apenas para a solicitação e autorize o envio e o uso da sua cota. Confira
o áudio gerado antes de guardá-lo. A chave não é persistida no curso e uma
falha não repete a geração automaticamente. Arquivos guardados exigem conexão
para autorização e transferência; não são copiados para o armazenamento
offline do aplicativo. Veja os formatos, privacidade e limites em [Áudio](audio.md).

## Configurar o desenho do curso

Em **Parâmetros**, escolha o escopo e abra o ajuste desejado. O valor vigente
aparece primeiro; origem, justificativa e definição ficam no ajuste revelado.
Em Conteúdo, o atalho da unidade abre uma folha sobre a leitura, preservando o
editor e seu rascunho. Em Estudo, o proprietário também encontra
**Parâmetros · escopo atual** em **Conta e aparência**, depois de salvar ou
descartar qualquer edição aberta. A entrada preserva os níveis do Estudo.

O catálogo organiza as escolhas por conteúdo, prática, conversa e cadência.
Além de novidade, explicações, quantidade e variação de prática, permite escolher
distribuição e posição das práticas. Granularidade de partes e lotes e frequência
de pausa são decisões independentes. A conversa pode favorecer concisão, debate
ou explicação; isso não reduz o material didático. Alvos de palavras são flexíveis
e não autorizam compressão. Direção editorial e componentes têm ajustes próprios.

**Fixar valor** registra uma decisão sua ou uma condição de pesquisa, com
justificativa. **Automático pelo contexto** delega uma escolha explicada à IA
antes da produção e pode ficar sem valor enquanto essa escolha está pendente.
**Restaurar herança** remove a decisão local. Uma condição de pesquisa não pode
ser contrariada silenciosamente por uma exceção mais específica; a configuração
mostra o conflito para resolução antes da produção. O conteúdo já produzido
preserva os valores e motivos que foram usados naquela produção.

Em **Perfis de autoria**, crie um nome e escolha quais preferências copiar:
valor fixo, escolha automática ou não incluir o parâmetro. Edite ou exclua o
perfil quando necessário. A prévia de aplicação mostra as escolhas do perfil e
as exceções do curso; por padrão, as exceções ficam preservadas. Na reaplicação,
marque explicitamente somente as exceções que deseja retirar. Condições de
pesquisa ficam protegidas e conflitos exigem resolução prévia.

Aplicar um perfil copia preferências para o curso. Não reescreve conteúdo
existente nem cria vínculo permanente: editar ou excluir o perfil depois não
altera cursos que já receberam a cópia. Perfis não incluem identidade, acesso,
tema ou sincronização do dispositivo.

## Manter Fontes, PDFs e proveniência

Em **Fontes**, use **Nova fonte** para informar o título conhecido e um link,
ou escolher uma referência escrita pelo autor. **Dados da referência** revela
os campos opcionais: tipo de material, autoria, publicação e outros dados
pertinentes. Um nome pode ser mantido literalmente, inclusive quando pertence
a uma instituição. Preencha sobrenome e prenomes somente quando conhecidos.
**Conferir referência** mostra a apresentação antes de salvar.

**Estilo das referências** permite escolher ABNT ou APA para o curso. A troca
reformata as referências geradas e preserva os textos escritos pelo autor.
Alternar entre os modos também conserva esse texto. Uma fonte incompleta pode
permanecer sem título, data ou autoria; esses dados não são inventados para
completar a apresentação. Veja os critérios e limites em
[Fontes, citações e referências](fontes-e-citacoes.md).

A fonte mantém sua identidade; URL e PDF são formas opcionais de acesso.
Uma âncora localiza página, tempo, fragmento de endereço ou trecho. Ao criar uma
âncora, escolha o PDF específico quando houver um arquivo correspondente. Essa
referência ao arquivo permanece mesmo quando seu endereço de acesso é renovado.

No detalhe, **Registrar observação** permite acrescentar uma nota, contestar a
interpretação ou solicitar reformulação. Escolha a fonte inteira ou uma Âncora
ativa como alvo. A revisão posterior precisa considerar esse contexto antes de
alterar as unidades relacionadas.

No detalhe da fonte, **Anexar PDF** incorpora o arquivo. Em uma conversa, envie
um único arquivo para a operação
`incorporar_pdf_como_fonte`. O serviço valida os bytes e grava no Storage
privado. O download autorizado usa um endereço temporário. Remover o PDF revoga
novas leituras, preservando fonte, Âncoras e vínculos; o mesmo conteúdo pode ser
reativado por uma nova incorporação confirmada. Numa conversa, peça a
`manter_fonte` para retirar somente os PDFs ou para retirar a fonte inteira; esta
segunda opção remove primeiro todos os PDFs ativos vinculados à fonte.

No conteúdo, abra **Fontes e âncoras** da unidade para revisar seus vínculos.
Cada uso distingue a relação com o texto, como adaptação ou contraste, e os
papéis que cumpre: escopo do estudo, avaliação, sustentação do conteúdo ou
leitura complementar. Os papéis sugeridos no cadastro apenas preenchem um novo
vínculo; os usos existentes mantêm suas escolhas.

É possível relacionar uma obra ao item inteiro ou selecionar um trecho da parte
pertinente. Uma citação direta também exige um localizador na fonte. Use
**Adicionar outro vínculo** quando a mesma obra cumprir outro uso ou sustentar
outra localização. Salvar confirma o conjunto de vínculos desse item. Se o texto
mudar e o trecho não puder ser localizado com precisão, a referência é
conservada e marcada para conferência.

No Estudo, os números junto ao conteúdo abrem a referência em uma sobreposição.
Fechá-la devolve o foco e a posição de leitura. O acesso à página ou ao PDF
depende das permissões correntes; a existência de uma referência não certifica
a afirmação didática. Identidades técnicas, caminhos de Storage e endereços
assinados não aparecem no uso normal.

Uma fonte configurada para não aparecer no Estudo continua oculta. Aposentar a
fonte impede novos vínculos e conserva as referências existentes; retirar o
acesso a um PDF é uma ação separada. Para completar uma referência, mantenha sua
identidade e acrescente somente metadados e localizações conhecidos.

## Editar uma Unidade no próprio conteúdo

O proprietário pode usar o ícone **Editar** tanto em Estudo quanto em Conteúdo.
Escolha o título ou um trecho autorizado, edite diretamente no renderer e use
**Salvar**. O AraLearn valida a Unidade inteira e preserva identidade, pai,
posição e fontes efetivas. **Desfazer** e **Refazer** atuam no rascunho corrente;
**Cancelar** abandona somente esse rascunho.

Quem recebeu acesso privado ou abriu um curso público pode estudar, sem editar
o curso. Com conta, pode registrar uma observação para o autor. Essas ações não
criam cópia automática. Cópias próprias existentes continuam cursos
independentes e podem ser editadas por seus proprietários.

Para trabalhar com a sessão contextual, use **Assistência por IA** na Unidade,
na microssequência ou na lição:

1. escolha OpenAI, Gemini ou DeepSeek;
2. informe o modelo quando necessário e a chave efêmera da sessão;
3. escreva o que deseja compreender ou alterar;
4. discuta, peça explicações ou acrescente condições; uma conversa sem mudança
   não precisa produzir uma proposta;
5. quando a proposta representar sua intenção, use **Preparar prévia**;
6. alterne **Original** e **Prévia** e confira o resultado antes de usar
   **Aplicar ao rascunho**; **Descartar prévia** conserva o conteúdo anterior;
7. salve somente se o rascunho estiver adequado, ou descarte-o para restaurar o original.

O pedido leva sua mensagem, o conteúdo selecionado, o restante do objeto
corrente como contexto, um resumo do curso e as mensagens recentes. PDFs,
fontes e dados da conta ficam fora. A chave segue somente ao provider escolhido
e permanece em memória até sair, recarregar ou encerrar a superfície.

O provider pode conservar dados segundo seus próprios termos. A configuração
do serviço fica disponível junto à conversa sem ocupar o espaço principal do
chat.

A sessão pode trabalhar com a composição da Unidade, com a estrutura da
microssequência e com a organização de microssequências dentro da lição. Depois
de pedir a prévia, o AraLearn gera e valida a candidata no renderer real e
aguarda a aplicação explícita ao rascunho. Proposta inválida ou não renderizável deixa o conteúdo
corrente intacto. Endpoint, relay e instruções de arquitetura não aparecem no
uso normal.

A conversa e o rascunho suspendem atualizações de fundo do conteúdo aberto.
Se outra sessão tiver alterado o curso, salvar pode resultar em conflito;
a proposta fica disponível para conferência ou descarte, sem substituir a revisão
original pela mais nova silenciosamente.

## Trabalhar com o ChatGPT a partir da Autoria

1. Em **Conteúdo**, localize e inspecione o objeto sobre o qual quer trabalhar.
2. Registre uma Observação no alvo ou salve a mudança necessária em
   **Parâmetros**. Os dois tipos de registro permanecem no curso e aparecem na
   Autoria.
3. No ChatGPT conectado por MCP ou Actions, identifique o curso e peça que ele
   leia as Observações ou decisões de Parâmetros pertinentes.
4. Examine a proposta. Acrescente condições, discorde ou peça outra solução
   enquanto ela não representar sua intenção.
5. Autorize explicitamente a operação somente depois de concordar com o efeito.
6. Volte ao AraLearn e confira o resultado no mesmo curso.

A interface normal não abre um compositor e não exige copiar e colar um pedido.
O cliente conectado obtém o contexto necessário pelas operações autorizadas,
respeita o estado corrente e pode devolver um endereço direto para o alvo. Uma
conversa ou proposta sem aprovação não altera o curso.

Primeiro, o GPT apresenta uma síntese do mapa curricular global e um link para
inspecionar módulos, lições, microssequências, dependências e cobertura. A pessoa
autora pode ajustar ordem, escopo e ênfase. Somente o mapa visto pode ser
aprovado, e nenhuma unidade de estudo é criada nessa etapa.

Depois, o GPT propõe brevemente a progressão da primeira parte operacional.
Quando ela é aprovada, o conteúdo materializado aparece em Conteúdo. A inspeção
mostra as unidades reais e, quando pertinente, as ideias introduzidas, as ideias
estabelecidas usadas e as retomadas. O mesmo ciclo continua para a parte
seguinte, sem expor detalhes técnicos da execução.

Curso, módulo, lição, tópico, microssequência, unidade, parâmetro, fonte e âncora
podem ser alvos de leitura ou alteração conforme a operação disponível.
Materialização continua restrita à parte operacional.

Ao voltar para a guia ou janela do AraLearn, a aplicação relê o cabeçalho
canônico e atualiza a área visível. Isso também ocorre quando outra janela
devolve o foco ao aplicativo. Se o navegador não sinalizar a troca de foco, use a ação
**Atualizar** no cabeçalho do curso. A atualização preserva o contexto de
navegação e, em Conteúdo, a Unidade e a posição conhecidas.

Se houver uma confirmação ou um formulário em edição, a atualização automática
ou manual é adiada. O AraLearn conserva os campos já preenchidos e orienta
concluir ou cancelar o rascunho antes de tentar novamente. Assim, o retorno do
ChatGPT não descarta uma contribuição ainda não enviada.

Validação local, recomposição do painel e resposta de rede ambígua também
conservam o formulário aberto e devolvem o foco ao campo pertinente. Esse
comportamento abrange Parâmetros, fontes e Âncoras, Observações na caixa autoral
e em Conteúdo. **Descartar** ou **Cancelar** remove o rascunho de propósito.

Se a rede cair depois do envio e não for possível saber se o servidor confirmou
a mudança, a mensagem oferece a repetição natural pelo mesmo formulário. Sem
editar os campos, essa nova tentativa reutiliza o comando, as versões, as
identidades geradas e o mesmo identificador de pedido. O servidor devolve o
recibo anterior em vez de duplicar o efeito. Recupere o resultado dessa tentativa
antes de preparar uma alteração diferente; uma nova intenção precisa partir do
estado confirmado.

Rascunhos de cópias antigas com resposta perdida podem continuar guardados no
dispositivo. O aplicativo consulta a prova da gravação anterior e, quando
consegue confirmá-la, oferece o curso próprio correspondente. A consulta não
reaplica a mudança nem cria curso. Sem prova suficiente, conserve o rascunho até
poder examiná-lo; descartar exige uma escolha explícita. Conversa, configuração
e credencial do provedor não integram esse registro.

## Navegar e editar Conteúdo

**Conteúdo** mostra normalmente uma unidade por vez, com anterior, próxima e
localizador de contexto. Usa o mesmo renderer de Estudo, com a prática inativa
e as respostas esperadas disponíveis para inspeção. O recorte pode abranger o
curso, uma parte, unidades sem parte, um módulo, uma lição ou uma microssequência.

As ferramentas da unidade ficam à esquerda das ações de inspeção. Áudio,
calculadora e materiais de apoio abrem sobre o conteúdo e devolvem o foco ao
fechar. Durante a edição, esses atalhos conservam suas posições e ficam
desabilitados; os títulos e demais textos do recurso podem ser editados no
próprio conteúdo.

No localizador, **Ir à atualização mais recente** abre a unidade modificada mais
recentemente no escopo corrente. **Atualizado em** informa essa atualização,
não a data de criação. A partir desse ponto, anterior e próxima continuam pela
ordem curricular. Se o escopo ainda não tem unidades, **Abrir mapa curricular**
oferece uma próxima ação.

**Fontes**, **Observações** e **Parâmetros** abrem folhas sobre a unidade corrente.
Fechar a folha devolve a leitura, a posição e o foco sem abandonar o rascunho de
edição que estava aberto. Consultar contexto não salva nem aplica uma correção
automaticamente. No curso, módulo, lição e microssequência, **Editar** abre os
metadados e a composição autorizados para aquele nível e exige salvamento explícito.

Para comparar várias unidades ou registrar a mesma observação nelas, use o ícone
**Selecionar várias unidades**. A leitura passa a uma sequência vertical; a unidade de
entrada fica identificada como **Referência**. Marque os alvos e, quando necessário,
use **Carregar unidades anteriores** ou **Carregar unidades posteriores**.
**Registrar observação nas unidades selecionadas** conserva os alvos escolhidos;
uma falha parcial permite repetir somente o que ainda não foi confirmado.

**Cancelar seleção** volta à unidade de referência, ao foco e à posição de entrada.
A seleção é temporária e não cria um lote de produção. A inspeção mantém uma
janela limitada de unidades e conserva a posição no dispositivo; ao mudar de
revisão, procura a mesma identidade de unidade.

## Usar Revisão

Em **Revisão**, a tarefa **Observações** reúne as Anotações do curso.
Use filtros para encontrar o alvo e abra o detalhe para considerar, responder,
resolver, reabrir, retirar ou revisar o registro, conforme as ações permitidas.

Uma Observação salva fica visível no alvo e na caixa de entrada autoral. O
ChatGPT conectado pode ler as Observações pendentes, discutir uma proposta e,
depois da aprovação explícita, executar a alteração pertinente ou registrar a
decisão de manter o estado. O resultado atualizado permanece no mesmo curso.

Para pedir uma correção ampla, use o GPT conectado. Ele consulta as Observações
abertas, prepara uma revisão com progressão, pré-requisitos, transições,
exemplos e prática afetados e apresenta uma proposta. Depois da decisão,
`aplicar_correcoes` grava o conjunto aprovado. Volte ao deep link e reinspecione
as unidades de estudo; aplicação não demonstra que a questão foi resolvida.

A identificação da pessoa acompanha a observação; uma contribuição do estudante
não autoriza a edição do curso. Não haver observações pendentes também não
significa que a unidade foi revisada ou validada.

Revisão autoral exige conexão. A cópia e a fila de Anotações próprias pertencem
ao percurso de Estudo; a consulta do curso e as correções usam o estado remoto
corrente.

## Consultar Analytics

**Analytics** caracteriza o estado atual do curso em duas áreas: **Desenho** e
**Autoria**. Selecione curso, parte, microssequência ou unidade de estudo; leia os poucos
números principais e expanda apenas a tabela necessária.

Desenho mostra parâmetros aplicados, unidades de análise, distribuição de novidades,
formas explicativas, componentes, prática e fontes. Autoria mostra parâmetros
definidos explicitamente e a origem observável da criação e da última revisão
das unidades. Uma origem incerta permanece ausente, em vez de virar uma
inferência.

**Exportar Analytics** baixa um JSON com o mesmo snapshot mostrado na tela. Ele
não é uma cópia completa do curso nem uma medida de aprendizagem. Veja
[Analytics da Autoria](analytics-instrucionais.md).

## Conceder e revogar acesso

Em **Pessoas**, use **Conceder acesso**, digite ao menos dois caracteres do
identificador e selecione a pessoa apresentada. Confira identificador e foto,
quando houver, antes de confirmar. A busca devolve no máximo dez pessoas e só
existe no contexto de um curso próprio. Se a pessoa trocar de identificador
durante a escolha, refaça a busca. Há limites de tentativas; aguarde quando a
interface indicar isso. A concessão mantém propriedade e edição com o autor.

Para revogar, use a ação junto ao identificador e confirme. O servidor encerra o acesso privado.
Uma cópia anteriormente baixada é removida na próxima validação conectada do
dispositivo dessa pessoa quando ela deixa de ter acesso. Se o curso continuar
público, ainda poderá ser estudado como tal.

Na mesma área, o proprietário pode tornar o curso público. A confirmação exige
escolher a política dos arquivos; exceções por fonte ou PDF ficam em **Fontes**.
Um curso público permite leitura e prática sem conta. Voltar a privado encerra
novas leituras públicas; pessoas com concessão privada continuam autorizadas.

## Usar Autoria conversacional

Conecte um assistente por meio de um protocolo aberto, o **Model Context
Protocol (MCP)**, com autorização individual. Descreva a intenção, deixe o
cliente localizar e ler o recorte necessário, revise a proposta, autorize a
alteração e confira o resultado na Autoria e em Estudo.

Ao retornar do cliente conversacional, o AraLearn relê o cabeçalho canônico do
curso antes de atualizar Planejamento, Conteúdo, Revisão, **Fontes** ou Analytics. A
cópia de um pedido não escreve na API, no PostgreSQL, no Storage nem no
IndexedDB.

O cliente usa a revisão do curso e a versão do objeto lido para proteger a
escrita. A pessoa escolhe a finalidade; o cliente seleciona a ferramenta e a
operação adequadas. Veja [Autoria por MCP](autoria-mcp.md).

Um GPT personalizado com **Actions** usa o contrato OpenAPI e um OAuth próprios,
distintos do MCP. Os dois canais chegam às mesmas tarefas humanas e alteram o
mesmo curso vivo.

## Trabalhar sem conexão

Conteúdo já carregado pode ser estudado sem rede. Progresso e marcas **Rever**
usam a fila do estado pessoal; Observações usam outra fila e outra cópia local.
No modo automático, o retorno da conexão permite comparar a revisão remota e
enviar operações pendentes. Em **Conta e aparência → Sincronização**, o modo
**Manual** suspende esse intercâmbio de fundo e a atualização do conteúdo aberto.
A nuvem sincroniza por solicitação; salvar uma alteração autoral ou enviar uma
observação permanece uma ação explícita. A preferência pertence ao dispositivo,
sem alterar parâmetros pedagógicos ou direitos de acesso.

Na tela inicial, esse estado só aparece quando altera a capacidade de abrir o
curso. Sem conexão, **Disponível offline** confirma que a composição validada
pode ser aberta; **Conecte-se para abrir este curso** distingue o descritor
conhecido de uma composição ainda ausente. A seleção e o último ponto visitado
permanecem no dispositivo; uma segunda aba não desloca a tela já aberta na
primeira.

A nuvem sinaliza pendência, andamento, sucesso ou falha sem uma notificação
permanente sobre o conteúdo. No modo manual, ela indica a pausa das atualizações.
Um rascunho aberto impede a troca do conteúdo até salvar ou descartar; uma
explicação focal acompanha conflitos que exigem escolha. Uma composição
desatualizada não é apresentada como perda de conexão.

Na Autoria, o IndexedDB conserva a lista de cursos próprios, o cabeçalho, o
planejamento, a hierarquia e páginas recentes de Conteúdo e a posição de retomada.
Uma leitura local é identificada como desatualizada e somente para consulta. A
mudança da revisão remota invalida os derivados da revisão anterior antes de
uma nova leitura.

Depois que uma edição manual ou assistida recebe confirmação 2xx, o AraLearn
guarda imediatamente o instantâneo confirmado da Unidade e recompõe `course.v1`
antes de invalidar as projeções anteriores. Progresso, Observações e posição são
preservados. Estudo e Conteúdo podem mostrar essa revisão sem rede como
confirmada, com sincronização pendente, sem reenviar a gravação. Uma releitura
igual normaliza a cópia; uma revisão superior a descarta como superada. Sair da
conta, limpar o curso ou perder acesso purga esse estado.

Parâmetros, catálogos privados de fontes e áudios, metadados e bytes de arquivos, caixa autoral
de Observações, revisão, correções, Analytics, gestão de acesso e mutações
autorais dependem do servidor. O Storage não é reproduzido no
IndexedDB. A tela inicial pode mostrar um curso conhecido, mas a própria prévia
distingue esse caso de uma composição já disponível no dispositivo. Perder a
autoridade sobre o curso elimina a cópia e o ponto de retomada; a tela informa a
mudança e escolhe outro curso acessível, quando houver.

Preserve os dados do aplicativo até a sincronização quando houver alterações
recentes importantes.

## Sair

Em **Conta e aparência**, abra **Dados e conta** e use **Sair**. Se houver uma interrupção, o aplicativo
permite repetir a saída.
Sair encerra a sessão, mas cursos, estado pessoal e filas já gravados localmente
podem permanecer no dispositivo. A confirmação avisa que uma alteração ainda
aberta e não salva será perdida. Considere essas duas condições ao usar aparelho
compartilhado.

**Remover dados deste dispositivo** apaga somente os
dados persistidos da conta ativa e mantém a sessão. **Sair e remover dados deste
dispositivo** encerra a sessão e apaga o mesmo namespace. Nenhuma dessas ações
preserva texto que ainda exista apenas num formulário aberto.

## Excluir a conta

1. Abra **Conta e aparência**.
2. Abra **Dados e conta** e use **Excluir conta**.
3. Digite exatamente `EXCLUIR MINHA CONTA`.

A operação exige conexão e é irreversível. O aplicativo envia uma única
solicitação confirmada; a API autentica a pessoa, localiza seus cursos e remove
os avatares, PDFs e áudios correspondentes. O banco recusa a exclusão enquanto algum
desses objetos permanecer. Depois, remove a conta, os cursos próprios e as
relações dependentes; contribuições em cursos alheios são retiradas e redigidas
conforme a política de retenção. Uma falha intermediária conserva a conta para
nova tentativa. Se a limpeza do Storage já tiver começado, alguns arquivos ou a foto
podem ter sido removidos e a conta pode já ter sido excluída ou ainda aguardar a
etapa final. A tela informa essa ambiguidade; repetir **Excluir conta** confirma
ou conclui a mesma operação. A cópia local só é limpa depois da confirmação do servidor.
Depois dessa confirmação, porém, o resultado remoto é terminal. Se outra aba
bloquear a limpeza local, a conta já foi excluída e a interface permite repetir
somente a remoção dos dados do dispositivo.

## Limites atuais

A edição contextual não altera livremente toda a estrutura interna de uma
Unidade: somente folhas textuais declaradas pelo componente ficam editáveis.
Mudanças estruturais, correções auditáveis e materialização usam operações
próprias. Cursos públicos permitem estudo sem conta. O estado do visitante fica
neste dispositivo, separado de cada conta; entrar não transfere silenciosamente
esse estado para outra pessoa. Cursos privados exigem propriedade ou concessão
direta. Disponibilizar o curso não libera automaticamente seus arquivos.

Progresso, cliques, rolagem, tempo, marcas e Observações descrevem eventos ou
estados observáveis. A interpretação como atenção, engajamento, compreensão ou
aprendizagem exige construto, medida, procedimento, tratamento dos dados
ausentes e limites declarados.
