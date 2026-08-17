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
e editar planejamento e Partes, percorrer a composição em uma sequência
vertical, copiar um pedido de
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
escopo, faixa preferencial, referências do plano, Partes, vínculos, contagens
e atividade recente persistida.

O ícone de edição permite alterar título, objetivo, público, escopo e faixa
preferencial. Em **Referências do plano**, acrescente, edite, mova ou
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

## Definir parâmetros, itens por alvo, orientações e componentes

Abra **Parâmetros**. O primeiro contexto é o Curso; avance progressivamente por
Módulo, Lição e Microssequência para examinar outro nível sem carregar o Curso
inteiro.

Cada parâmetro mostra o valor efetivo, sua origem e o escopo fonte. Para criar
uma decisão local, escolha o valor, informe uma justificativa breve e salve.
Para restaurar a herança, use **Remover definição local**. Módulo mostra
parâmetros herdados, mas não permite um override pedagógico neste catálogo.

Em **Orientação autoral**, escreva o texto natural daquele escopo. Uma nova
edição conserva a versão anterior; uma interpretação automatizada aparece em
bloco separado e nunca substitui o original. Limpar a orientação local mantém
as orientações ancestrais.

Em **Componentes didáticos**, escolha entre todos ou apenas os permitidos e
marque exclusões e preferências nas opções conhecidas do catálogo. Não digite
refs. Na próxima materialização, uma política explícita de pessoa autora ou de
condição de pesquisa prevalece sobre políticas automáticas descendentes; dentro
da mesma classe de autoridade, vale o escopo aplicável mais próximo.

Numa Microssequência, **Cobertura planejada desta Microssequência** permite
marcar quais unidades de análise e requisitos de evidência do plano pertencem
àquele alvo. Um item pode servir a várias Microssequências e cada alvo pode
receber vários itens. Salvar substitui somente as duas listas daquele alvo; a
Parte e a ordem curricular não distribuem o plano automaticamente.

O resumo **Planejado × aplicado** usa os fatos que a tentativa realmente
persistiu. Ele pode apontar uma diferença de cobertura ou política, mas não é
nota de aprendizagem ou qualidade. Formas, oportunidades e variações são
declarações validadas do agente ou da pessoa autora, não interpretações
semânticas produzidas pelo banco a partir da prosa.

## Levar uma Parte ao chat conectado

1. Na Parte desejada, use **Levar pedido ao chat conectado**.
2. Aguarde a confirmação de que o texto foi copiado.
3. Cole o pedido no cliente conectado e autorize o trabalho ali.
4. Reabra ou atualize o planejamento para conferir os fatos confirmados.

O botão apenas copia texto para a área de transferência. Ele não inicia uma
tentativa, não altera a composição e não muda o status da Parte. Os estados
Planejada, Em materialização, Atenção necessária, Parcial e Materializada são
derivados de vínculos, Unidades, tentativas e etapas persistidas pelo serviço.

## Consultar Estrutura e Inspeção

**Estrutura** pagina Módulos, Lições e Microssequências. **Inspeção** apresenta
as Unidades de estudo em uma sequência vertical fiel ao renderer de Estudo,
sem ativar respostas nem edição. Escolha o Curso inteiro, uma Parte, as
Unidades sem Parte, um Módulo, uma Lição ou uma Microssequência; cada troca de
escopo volta ao início daquele recorte.

Uma página traz normalmente 12 Unidades, e a interface mantém no DOM no máximo
36 por vez. Ao se aproximar de uma extremidade, o aplicativo busca a página
anterior ou seguinte e substitui trechos distantes por espaçadores, preservando
a posição visual. Um link profundo abre o escopo correto e inclui a Unidade
ancorada na primeira página. A posição corrente é local ao dispositivo; ao
reabrir o Curso, o aplicativo tenta restaurá-la sob a mesma revisão e se
reposiciona pela Unidade quando a revisão mudou.

Sem conexão, a Inspeção só reutiliza a página exata já guardada para a mesma
revisão, escopo, âncora ou cursor, direção e limites. Ela a identifica como
offline ou desatualizada e não inventa uma página aproximada. Revogação de autoridade
purga esse cache na próxima validação online.

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
