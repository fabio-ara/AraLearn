# Verificação da interface

Uma tela pode parecer correta e ainda salvar o dado errado, perder o foco ou oferecer
uma ação que o servidor recusará. Por isso, a verificação acompanha a jornada inteira:
o que a pessoa faz, a resposta visível e o efeito persistido. A
[matriz técnica](matriz-conformidade-tecnica.md) indica os testes disponíveis para
cada capacidade.

## O que precisa ser demonstrado

Uma jornada é uma sequência de ações com uma finalidade, como abrir um curso,
consultar sua explicação e voltar à atividade. A verificação acompanha esse
percurso e confere tanto o resultado percebido pela pessoa quanto o que foi salvo.

Em cada jornada, registre o estado inicial, execute as ações e confirme o efeito onde
o dado é realmente conservado. O servidor decide o curso compartilhado e as
permissões; o dispositivo guarda rascunhos, posição e filas locais. A
[persistência](persistencia-relacional.md) explica essa divisão.

Em **Estudo**, percorra:

1. abra a entrada de estudo e escolha o curso;
2. percorra módulo, lição e microssequência;
3. abra uma unidade e retorne pelos mesmos níveis.

Confirme que **Voltar** restaura a origem real, a rolagem e o foco, e que **Home**
oferece a saída global sem consumir o histórico. Acesso ao pai só deve aparecer quando
houver ação contextual própria. Na unidade, **Visualizar**, **Editar** e **Assistência
por IA** devem ser modos irmãos sobre o mesmo alvo, sem deslocar elementos cuja função
não mudou. Verifique resposta, retorno, fontes, observações, marcação para rever,
zeragem de progresso e retomada.

Em **Autoria**, abra o curso diretamente em **Conteúdo**. Confirme que uma unidade de
estudo domina o leitor e que índice, pesquisa, endereços diretos, anterior e próxima
permitem chegar também a unidades antigas sem renderizar o curso inteiro.

Abra a visão múltipla sem selecionar nenhum alvo. Selecione unidades separadamente
para uma observação em lote e limpe a seleção sem recolher a leitura. Focalize e edite
uma unidade de página posterior por seus próprios comandos. Verifique preservação de
rascunho e retomada de envio parcial.

Materializar é salvar o conteúdo de um lote de produção aprovado. A
[autoria contextual](autoria-contextual.md) explica a relação entre esse lote e o
percurso planejado.

Em **Planejamento**, comece com um curso descartável ainda sem conteúdo e confirme,
nesta ordem:

1. o mapa curricular completo apresenta módulos, lições e microssequências;
2. a cobertura relaciona todo item obrigatório aos pontos previstos do mapa;
3. nenhuma unidade de estudo existe antes da aprovação e da materialização;
4. a aprovação se refere exatamente ao mapa que estava inspecionável;
5. lotes de produção aparecem depois e separados da hierarquia curricular;
6. mudar os limites de um lote não reorganiza módulos, lições ou
   microssequências;
7. após a produção, a cobertura mostra também as unidades em que o item foi
   desenvolvido.

Materialize ao menos duas partes. Percorra o conteúdo real na ordem e abra os detalhes
de desenho. Quando existirem, confira os rótulos humanos **Ideias introduzidas aqui**,
**Ideias já estabelecidas usadas aqui** e **Ideias retomadas**. A interface normal não
deve exibir nomes de campos, termos internos, identificadores ou contagens
apresentadas como julgamento pedagógico.

No mapa, teste a seta isoladamente, abra objetivos longos e siga vínculos da
cobertura, retornando ao mesmo ramo, posição e foco. Em Parâmetros, percorra múltiplos
recortes da hierarquia, do curso à unidade de estudo, incluindo um rascunho ainda não
salvo e valores automáticos, fixos ou herdados. Nas folhas de observações, confira leitura sem
edição, texto alterado, fechamento e retomada; avisos não podem encobrir campo, envio
ou foco.

Registre uma observação numa unidade e outra em várias unidades, peça revisão, aplique
uma proposta aprovada e reinspecione o conjunto afetado. Abra **Dados de autoria**,
escolha dimensões e recortes diferentes e confira que os números coincidem com a
análise incluída em **Exportar curso e análise**. Esse arquivo também contém o
documento integral do curso. Inclua criação,
edição e exclusão segura do curso descartável.

A conversa deve acompanhar as decisões da pessoa autora: síntese do mapa, progressão
do lote, inspeção do resultado e próximos ajustes. A extensão respeita a preferência
de diálogo e o que for necessário para decidir; um pedido breve na conversa não
autoriza reduzir a explicação didática produzida.

A Assistência por IA precisa demonstrar conversa, uma proposta concreta em cada
resposta, revisão multiturmo, aceite explícito, descoberta progressiva de componentes,
validação na apresentação real dos componentes, aplicação ao rascunho e gravação
separada. Uma proposta
recusada deve deixar o conteúdo corrente intacto.

## Revisão do percurso materializado

Não encerre a verificação ao conferir cartões isolados. Leia uma microssequência
inteira como alguém que possui somente os pré-requisitos declarados. Confirme que
dependências aparecem antes do uso, relações essenciais são ensinadas e as práticas
exigem operações já preparadas.

Procure os dois extremos: uma unidade densa que apenas enumera conceitos e uma
sequência fragmentada em telas sem progressão perceptível. Quando esses problemas
ocorrerem, registre por que foi necessário dividir uma unidade ou reunir fragmentos;
não altere a sequência apenas para preencher uma cota de exemplos. Componentes devem
tornar a relação pertinente observável, não apenas variar a aparência.

## Tamanhos e temas

Use 360, 390 e 430 pixels como larguras de telefone e uma largura de computador
representativa. Em cada tamanho, observe:

- área segura e controles alcançáveis;
- ausência de rolagem horizontal global;
- alinhamento da coluna e dos controles;
- textos extensos sem truncamento de sentido;
- foco depois de abrir, fechar, voltar e falhar;
- geometria estável ao trocar modo, selecionar, validar ou editar;
- folhas sobrepostas e diálogos com dimensões estáveis e conteúdo variável rolando internamente;
- menus e sobreposições fechando por ação explícita, clique externo e `Esc`;
- temas claro e escuro quando a superfície os oferece;
- console sem erro relacionado à jornada.

Estudo permanece a referência visual. Tela larga não cria outra arquitetura de
navegação nem um painel paralelo.

## Dados e autorização

Use somente identidades e sessões de teste autorizadas. A interface deve ocultar
Manutenção de identidades comuns, mas isso não substitui a recusa do servidor. Do
mesmo modo, esconder edição de quem não pode editar não substitui a [segurança em
nível de linha](supabase.md#postgresql-esquemas-e-autorização), a comparação de
revisões e validação da operação.

Para ações destrutivas, crie dados descartáveis e confira o alvo no diálogo. As ações
**Excluir este curso**, **Sair deste curso**, **Remover dados deste dispositivo**,
**Sair** e **Excluir conta** têm efeitos diferentes e não podem ser tratadas como
atalhos equivalentes.

## Automação e Chrome

Os testes de execução exercitam contratos e estados de erro.
[Playwright](https://playwright.dev/docs/intro), ferramenta que controla o navegador
automaticamente, repete interações e tamanhos de tela de forma previsível. Uma rodada
manual no Chrome completa essa prova ao observar a aplicação publicada, com sessão
autenticada, foco, console e comportamento real das sobreposições.

Execute as verificações da área alterada e a preparação da candidata:

```bash
npm run validate:candidate -- --base origin/main --plan
npm run validate:candidate -- --base origin/main
```

O primeiro comando mostra as provas selecionadas; o segundo executa essa seleção.
Mudanças de comportamento precisam dos testes e jornadas correspondentes. A validação
final e a publicação seguem o [guia do
desenvolvedor](guia-desenvolvedor.md#testes-e-integração) e o procedimento de
[implantação](implantacao.md).

Uma falha pertinente impede considerar a revisão aprovada. Corrija a causa, repita o
menor recorte afetado e então retome o conjunto de verificações exigido para a mudança.

## Limite da evidência

Uma interface que renderiza, persiste e responde corretamente demonstra uma
propriedade técnica. Ela não demonstra, sozinha, compreensão, acessibilidade vivida ou
aprendizagem. Essas perguntas exigem participantes, tarefas, instrumentos e análise
adequados; consulte o [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).
