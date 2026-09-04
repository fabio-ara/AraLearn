# Verificação da interface

Esta página explica como verificar a experiência corrente do AraLearn. Ela não
é um registro de execuções passadas. O objetivo é tornar observável a relação
entre navegação, autorização, persistência e apresentação.

## O que precisa ser demonstrado

Uma tela isolada não demonstra um fluxo. Para cada jornada, a verificação parte
do estado inicial, executa as ações da pessoa, observa a resposta visível e
confirma o efeito na camada canônica correspondente.

Em **Estudo**, percorra:

```text
Home → curso → módulo → lição → microssequência → unidade
```

Confirme que **Voltar** restaura a origem real, a rolagem e o foco, e que
**Home** oferece a saída global sem consumir o histórico. Acesso ao pai só deve
aparecer quando houver ação contextual própria. Na Unidade, **Visualizar**,
**Editar** e **Assistência por IA** devem ser modos irmãos sobre o mesmo alvo,
sem deslocar elementos cuja função não mudou. Verifique resposta, retorno, fontes, Observações,
marcação para rever, zeragem de progresso e retomada.

Em **Autoria**, abra o curso diretamente em **Conteúdo**. Confirme que uma
unidade de estudo domina o leitor e que índice, pesquisa, endereços diretos,
anterior e próxima permitem chegar também a unidades antigas sem renderizar o
curso inteiro.

Em **Planejamento**, comece com um curso descartável ainda sem conteúdo e
confirme, nesta ordem:

1. o mapa curricular completo apresenta módulos, lições e microssequências;
2. a cobertura relaciona todo item obrigatório aos pontos previstos do mapa;
3. nenhuma unidade de estudo existe antes da aprovação e da materialização;
4. a aprovação se refere exatamente ao mapa que estava inspecionável;
5. lotes de produção aparecem depois e separados da hierarquia curricular;
6. mudar os limites de um lote não reorganiza módulos, lições ou
   microssequências;
7. após a produção, a cobertura mostra também as unidades em que o item foi
   desenvolvido.

Materialize ao menos duas partes. Percorra o conteúdo real na ordem e abra os
detalhes de desenho. Quando existirem, confira os rótulos humanos **Ideias
introduzidas aqui**, **Ideias já estabelecidas usadas aqui** e **Ideias
retomadas**. A interface normal não deve exibir nomes de campos, termos internos,
identificadores ou contagens apresentadas como julgamento pedagógico.

Registre uma observação numa unidade e outra em várias unidades, peça revisão,
aplique uma proposta aprovada e reinspecione o conjunto afetado. Abra
**Analytics** em mais de um escopo e confira que os números coincidem com o JSON
exportado. Inclua criação, edição e exclusão segura do curso descartável.

A conversa que acompanha essa jornada deve ser curta: síntese do mapa, decisão
curricular, progressão focal do lote, resultado e link. Ela não deve presumir
que a pessoa autora é estudante nem explicar o mecanismo do AraLearn.

A Assistência por IA precisa demonstrar conversa, uma proposta concreta em cada
resposta, revisão multiturmo, aceite explícito, descoberta progressiva de
componentes, validação no renderer real, aplicação ao rascunho e gravação
separada. Uma proposta recusada deve deixar o conteúdo corrente intacto.

## Revisão do percurso materializado

Não encerre a verificação ao conferir cartões isolados. Leia uma microssequência
inteira como alguém que possui somente os pré-requisitos declarados. Confirme
que dependências aparecem antes do uso, relações essenciais são ensinadas e as
práticas exigem operações já preparadas.

Procure os dois extremos: uma unidade densa que apenas enumera conceitos e uma
sequência fragmentada em telas sem progressão perceptível. Registre pelo menos
um caso em que a primeira precisou ser dividida e outro em que fragmentos
precisaram ser fundidos. Componentes devem tornar a relação pertinente
observável, não apenas variar a aparência.

## Tamanhos e temas

Use 360, 390 e 430 pixels como larguras de telefone e uma largura de computador
representativa. Em cada tamanho, observe:

- área segura e controles alcançáveis;
- ausência de rolagem horizontal global;
- alinhamento da coluna e dos controles;
- textos extensos sem truncamento de sentido;
- foco depois de abrir, fechar, voltar e falhar;
- geometria estável ao trocar modo, selecionar, validar ou editar;
- sheets e dialogs com contorno estável e conteúdo variável rolando internamente;
- menus e sobreposições fechando por ação explícita, clique externo e `Esc`;
- temas claro e escuro quando a superfície os oferece;
- console sem erro relacionado à jornada.

Estudo permanece a referência visual. Tela larga não cria outra arquitetura de
navegação nem um painel paralelo.

## Dados e autorização

Use somente identidades e sessões de teste autorizadas. A interface deve ocultar
Manutenção de identidades comuns, mas isso não substitui a recusa do servidor.
Do mesmo modo, esconder edição de quem não pode editar não substitui RLS,
revisão esperada e validação da operação.

Para ações destrutivas, crie dados descartáveis e confira o alvo no diálogo. As
ações **Excluir este curso**, **Sair deste curso**, **Remover dados deste
dispositivo**, **Sair** e **Excluir conta** têm efeitos diferentes e não podem
ser tratadas como atalhos equivalentes.

## Automação e Chrome

Os testes de runtime exercitam contratos e estados de erro. Playwright percorre
interações repetíveis e matrizes de tamanho. O Chrome real completa a prova ao
mostrar a aplicação efetivamente carregada, a sessão autenticada, o foco, o
console e o comportamento físico das sobreposições.

Execute primeiro as verificações focais da área alterada. Antes de publicar,
execute:

```bash
npm test
npm run test:e2e
npm run pages:build
```

Uma falha pertinente impede considerar a revisão aprovada. Corrija a causa,
repita o menor recorte afetado e então retome o gate amplo necessário.

## Limite da evidência

Uma interface que renderiza, persiste e responde corretamente demonstra uma
propriedade técnica. Ela não demonstra, sozinha, compreensão, acessibilidade
vivida ou aprendizagem. Essas perguntas exigem participantes, tarefas,
instrumentos e análise adequados; consulte o [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).
