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
Home → Curso → Módulo → Lição → Microssequência → Unidade
```

Confirme que **Voltar** restaura a origem real, a rolagem e o foco, e que
**Home** oferece a saída global sem consumir o histórico. Acesso ao pai só deve
aparecer quando houver ação contextual própria. Na Unidade, **Visualizar**,
**Editar** e **Assistência por IA** devem ser modos irmãos sobre o mesmo alvo,
sem deslocar elementos cuja função não mudou. Verifique resposta, retorno, Fontes, Observações,
marcação para rever, zeragem de progresso e retomada.

Em **Autoria**, parta da Visão geral e verifique as sete tarefas: Planejamento,
inclusive Partes e o histórico completo de materializações; Conteúdo, inclusive
hierarquia e edição; Parâmetros e componentes; Fontes, Âncoras e PDFs; Revisão,
com Observações, Auditoria, correção, verificação e reversão; Variantes e
pesquisa; Pessoas e acesso. Inclua criação, edição e exclusão segura de um Curso
descartável.

A Assistência por IA precisa demonstrar conversa, plano discutível,
confirmação, descoberta progressiva de componentes, validação, renderer real,
aplicação ao rascunho e gravação explícita. Uma proposta recusada deve deixar o
conteúdo corrente intacto.

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
ações **Excluir este Curso**, **Sair deste Curso**, **Remover dados deste
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
