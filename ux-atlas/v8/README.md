# Atlas visual do AraLearn — v8

Esta edição reorganiza a região Entrada → Estudo → Autoria e torna o próprio atlas testável.

## Âncora funcional

Repositório corrente usado como referência: `ebd3feed909df9c007d0c09140ba28d3afe2dc61`.

O runtime atual já informa, por Curso acessível, `ownership`, `canEdit`, `canDerive`, `isPersonalCopy`, `personalCopyCourseId` e, quando se trata de cópia pessoal, `sourceCourseId`/`sourceCourseRevision`.

## Regra de testabilidade

Todo botão dentro do mock é criado pelo mesmo mecanismo. Ele:

1. recebe um número;
2. registra um destino;
3. aparece na lista **Botões desta tela** com o mesmo número;
4. recebe uma aresta correspondente no grafo local.

Após cada renderização, o atlas valida automaticamente se há botão sem caminho, numeração inconsistente ou destino sem aresta. Se houver, exibe um erro visível.

## Grafo local e completo

O mapa detalhado abre em **Local**, mostrando a tela selecionada, suas saídas e os estados imediatamente conectados. Isso reduz o emaranhado visual. O botão `Local / Completo` alterna para o grafo inteiro quando for necessário se situar globalmente.

## Escalabilidade

O antigo seletor abstrato `1 / 20 / 200` foi substituído por unidades explícitas:

- `1 Curso`;
- `20 Cursos`;
- `200 Cursos`.

Ele aparece somente em telas cuja cardinalidade realmente importa. Listas grandes não renderizam todos os objetos simultaneamente: mostram total, quantidade carregada e **Carregar mais**.

## Estudo e Autoria

Não existe mais uma biblioteca neutra misturada com os dois modos.

### Estudo

A tela inicial contém:

- continuidade do Curso atual;
- **Coleções de Estudo**;
- **Todos para estudar**;
- busca;
- troca explícita para Autoria.

Coleções de Estudo são uma proposta de organização pessoal e não alteram permissões. Um Curso pode pertencer a várias coleções.

### Autoria

A tela inicial contém:

- continuidade do trabalho autoral;
- **Coleções de Autoria**;
- **Todos para editar**;
- busca;
- criação de Curso;
- troca explícita para Estudo.

Coleções de Autoria são independentes das de Estudo e só recebem Cursos editáveis.

## Coleções

Coleções não existem hoje no backend do AraLearn; são uma extensão proposta. A v8 prototipa de forma funcional no próprio navegador:

- criar coleção;
- abrir coleção;
- adicionar Cursos;
- remover Curso da coleção;
- renomear coleção;
- excluir coleção.

Essas operações são simuladas em memória no atlas para permitir teste de UX. Excluir uma coleção nunca exclui Curso nem altera acesso.

## Operações sobre Curso

A v8 separa três operações diferentes:

- **Remover deste dispositivo** — capacidade atual; remove apenas conteúdo/cache local.
- **Sair deste Curso** — extensão proposta para Curso compartilhado. O backend atual não expõe auto-revogação; `revoke_access` exige o proprietário.
- **Excluir Curso** — extensão proposta para Curso próprio ou cópia pessoal. Não foi encontrada uma operação individual `delete_course` publicada na Course API atual.

Ações destrutivas aparecem em menu textual e confirmação, não como ícones ambíguos.

## Estado de continuidade

A UI usa uma ação simples de **Continuar**. Internamente, o runtime atual separa:

- progresso e marcas de Rever, que usam estado pessoal sincronizável pela API;
- ponto exato de navegação/Curso selecionado, mantido atualmente no cache local e reconciliado entre abas do mesmo dispositivo.

## Validação desta edição

A v8 foi verificada em:

- 1440 × 960;
- 430 × 932;
- 390 × 844;
- cenários de 1, 20 e 200 Cursos.

Foram percorridos 64 estados. Também foram testados criação/renomeação/exclusão de coleção, adição de Cursos, filtros, paginação, menu de Curso compartilhado, abertura de Conta e alteração de parâmetros.

Abra `index.html` diretamente no navegador.
