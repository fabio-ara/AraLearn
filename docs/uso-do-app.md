# Uso do aplicativo

Este guia descreve o runtime canônico da revisão corrente. O site e o APK da
última release podem continuar na versão anterior até a migração e a promoção
hospedadas.

## Antes de usar: cinco conceitos

### Conta

A conta autentica uma pessoa. O perfil humano mínimo contém nome e foto
opcionais; ele não é perfil social.

### Curso vivo

Curso é o objeto concreto compartilhado entre Estudo, Autoria e MCP. Ele pode
ser alterado sem trocar de identidade e não precisa passar por um estágio de
publicação para ser estudado.

### Estudo

Estudo lê Cursos próprios e Cursos com acesso direto. Ele altera somente o
estado pessoal: progresso, marcas para rever e observações.

### Autoria

Autoria lista somente Cursos próprios. Ela permite criar Curso, inspecionar
e editar planejamento e Partes, inspecionar composição, copiar um pedido de
materialização para o chat conectado e gerir acesso. O MCP autoral possui a
mesma restrição de propriedade e opera o mesmo estado persistido.

### Réplica local

IndexedDB conserva lista conhecida, Cursos abertos e estado pessoal. A réplica
permite retomada, mas PostgreSQL continua sendo a autoridade para propriedade,
acesso e estado compartilhado.

## Criar uma conta

1. Na tela de acesso, use **Criar conta**.
2. Informe e-mail e senha com pelo menos oito caracteres.
3. Envie o formulário.
4. Se a configuração exigir confirmação, abra a mensagem recebida.
5. Volte ao aplicativo e entre.

Não reutilize credencial administrativa do Supabase. Cada pessoa deve operar
com sua própria conta para que autorização e autoria sejam auditáveis.

## Entrar

1. Informe e-mail e senha.
2. Use **Entrar**.
3. Aguarde as etapas Dispositivo, Conta e Cursos.

Se a preparação local falhar, a tela oferece tentar novamente ou limpar os
dados do dispositivo. A limpeza descarta alterações offline ainda não enviadas
e pede confirmação explícita.

## Recuperar a senha

1. Use **Recuperar senha**.
2. Informe o e-mail.
3. Abra o link recebido no mesmo contexto autorizado.
4. Defina e repita a nova senha.

Links em fluxo implícito inseguro são recusados; solicite um novo link quando o
aplicativo informar esse problema.

## Alterar o perfil

Abra **Conta e aparência**.

- Digite um nome de 1 a 120 caracteres e salve.
- Para a foto, escolha JPEG, PNG ou WebP de até 512 KiB.
- Use remover para retirar a foto corrente.

A foto é privada. O aplicativo envia o objeto primeiro, registra sua chave no
perfil e então tenta apagar a foto anterior. Se a última limpeza falhar, a tela
informa que ficou pendente.

## Alterar a aparência

Em **Conta e aparência**, escolha tema do sistema, claro ou escuro. A mudança é
local ao dispositivo e não altera nenhum Curso.

## Alternar entre Estudo e Autoria

Na Home, use o seletor **Estudo / Autoria**.

- Estudo mostra todos os Cursos acessíveis.
- Autoria mostra somente Cursos próprios.

Um Curso compartilhado não desapareceu quando não aparece na Autoria: a
concessão significa prática, não edição.

## Abrir e percorrer um Curso

1. Em Estudo, use **Abrir Curso**.
2. Escolha um Módulo.
3. Escolha uma Lição.
4. Escolha uma Microssequência didática.
5. Abra uma Unidade de estudo.

Na primeira abertura, o cliente baixa a composição em páginas, verifica que
todas pertencem à mesma revisão, recompõe o documento e o valida. Depois disso,
o Curso fica disponível no cache local.

## Responder e avançar

Quando houver resposta:

1. interaja com o componente;
2. use **Continuar**;
3. corrija campos incompletos, se necessário;
4. leia o feedback;
5. use **Continuar** novamente.

Ao avançar, a Unidade é registrada como concluída. A resposta momentânea do
componente não é convertida automaticamente em nota, ranking ou medida de
aprendizagem.

## Marcar para rever

Use o ícone de revisão na Unidade. A Home passa a mostrar **Rever**, com links
diretos aos alvos marcados. Use novamente o ícone para retirar a marca.

## Registrar uma observação

1. Na Unidade, use **Observação**.
2. Escolha Dúvida, Possível erro, Confuso, Sugestão ou Observação.
3. Escreva até 1.000 caracteres.
4. Salve.

Abra novamente para editar ou retirar. A observação é pessoal e ancorada à
Unidade. A nova fila de triagem e correção autoral ainda não está implementada;
salvar não significa que houve reparo.

## Zerar o progresso

Quando houver progresso, o cartão do Curso na Home mostra o ícone de zerar.
Confirme a pergunta que inclui o título do Curso. A ação limpa somente o
progresso daquele Curso; não remove conteúdo nem outros Cursos.

## Criar um Curso

1. Abra Autoria.
2. Use **Criar Curso**.
3. Informe título e objetivo.
4. Salve.

O Curso nasce privado. A lista usa paginação; se ele não aparecer após falha de
rede, atualize quando a conexão retornar antes de repetir a criação com uma
nova intenção. O plano nasce vazio com preferência inicial de 7–12 Partes; esse
intervalo pode ser alterado e não é regra pedagógica.

## Consultar e editar o planejamento

Abra o Curso e escolha **Planejamento**. A tela mostra objetivo, público,
escopo, orientação de autoria, faixa preferencial, referências do plano,
Partes, vínculos, contagens e atividade recente persistida.

O ícone de edição permite alterar título, objetivo, público, escopo, orientação
e faixa preferencial. Em **Referências do plano**, acrescente, edite, mova ou
retire resultados de aprendizagem pretendidos, unidades de análise
instrucional e requisitos de evidência. Todos são campos em linguagem natural;
a interface não pede JSON.

Em **Partes**, você pode:

- criar ou editar título e intenção operacional;
- mover a Parte na ordem de produção;
- dividir ou unir Partes;
- mover uma Microssequência para outra Parte ou deixá-la sem Parte;
- consultar Microssequências e Unidades já materializadas.

Essas ações mudam o plano, não a hierarquia curricular. Retirar uma Parte ou
um vínculo não apaga conteúdo já produzido.

## Levar uma Parte ao chat conectado

1. Na Parte desejada, use **Levar pedido ao chat conectado**.
2. Aguarde a confirmação de que o texto foi copiado.
3. Cole o pedido no cliente conectado e autorize o trabalho ali.
4. Reabra ou atualize o planejamento para conferir os fatos confirmados.

O botão apenas copia texto para a área de transferência. Ele não inicia uma
tentativa, não altera a composição e não muda o status da Parte. Os estados
Planejada, Em materialização, Atenção necessária, Parcial e Materializada são
derivados de vínculos, Unidades, tentativas e etapas persistidas pelo serviço.

## Consultar Estrutura e Conteúdo

**Estrutura** pagina Módulos, Lições e Microssequências. **Conteúdo** pagina
Unidades já materializadas. Essas áreas são, nesta revisão, superfícies de
inspeção. A edição contextual e a rolagem vertical contínua ainda não foram
conectadas ao runtime canônico.

## Conceder acesso

1. Em Autoria, abra um Curso próprio.
2. Escolha **Pessoas**.
3. Use acrescentar.
4. Informe o e-mail exato de uma conta existente.
5. Confirme.

A pessoa passa a ver o Curso em Estudo. A concessão não cria organização, não
duplica Curso e não permite edição. O serviço não oferece pesquisa de diretório
nem inclui o e-mail nos eventos de Curso.

## Revogar acesso

Em **Pessoas**, use retirar ao lado do nome e confirme. O servidor impede novas
leituras. Uma réplica já baixada pode permanecer fisicamente no dispositivo da
pessoa até a limpeza local; revogação não recolhe bytes já entregues.

## Usar Autoria conversacional

Conecte um cliente MCP com OAuth individual. A experiência esperada é:

1. descrever a intenção;
2. permitir que o cliente localize e leia o Curso e seu plano;
3. revisar a proposta quando houver decisão de conteúdo;
4. autorizar a mutação;
5. receber síntese breve e link visual;
6. conferir o resultado na Autoria e em Estudo.

A pessoa não precisa escolher a ferramenta técnica. O cliente deve reler o
Curso antes de escrever e usar a revisão e a versão específica recebidas. Uma
alteração do plano e uma alteração da composição são comandos separados. Veja
[Autoria por MCP](autoria-mcp.md).

## Trabalhar sem conexão

Conteúdo já carregado pode ser estudado offline. Progresso, marcas e observações
entram numa fila por Curso. Quando a conexão retorna, o repositório compara a
revisão remota, reconcilia as operações locais e tenta novamente de forma
limitada.

Não limpe dados, desinstale nem troque de navegador antes da sincronização se
houver alterações importantes. A Home pode mostrar Cursos conhecidos sem
garantir que uma composição nunca aberta esteja disponível offline.

## Sair

Em **Conta e aparência**, use **Sair**. Se uma saída for interrompida, a tela de
recuperação oferece repetir. Sair não apaga automaticamente o cache do Curso;
a política de limpeza local deve ser considerada em dispositivo compartilhado.

## Excluir a conta

1. Abra **Conta e aparência**.
2. Use **Excluir conta**.
3. Digite exatamente `EXCLUIR MINHA CONTA`.

A interface remove os avatares privados antes de chamar a exclusão. O banco
recusa a operação enquanto houver objeto de avatar. A exclusão remove a conta,
os Cursos próprios e os dados relacionados por cascade; é irreversível e não
deve ser usada como forma de sair.

## O que ainda não está disponível

O runtime canônico desta revisão não apresenta como concluídos:

- edição contextual completa de Unidades;
- parâmetros semânticos por escopo;
- proveniência e ancoragem completas;
- fila autoral de observações, auditoria e correção;
- variantes experimentais;
- analytics de Autoria;
- disponibilização pública.

Consulte o [estado corrente](estado-atual-e-roadmap.md) antes de planejar uma
atividade que dependa dessas capacidades.

## O que o aplicativo não interpreta

Progresso, cliques, rolagem, tempo, marcas e observações são eventos ou estados
observáveis. Eles não medem diretamente atenção, engajamento, compreensão ou
aprendizagem. Uma pesquisa precisa declarar construto, medida, algoritmo,
denominador, ausências e limites.
