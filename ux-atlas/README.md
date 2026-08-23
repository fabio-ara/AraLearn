# Atlas visual do AraLearn — v6

Esta edição reorganiza o produto inteiro a partir de três princípios:

1. todas as superfícies do AraLearn são projetadas para largura de celular;
2. escala e permissões são parte da arquitetura, não remendos de listas;
3. Estudo, Autoria e Pesquisa são vistas diferentes sobre Cursos da mesma conta, mas a organização pessoal de Estudo e Autoria pode ser independente.

## Base funcional verificada

Estado corrente usado: `ebd3feed909df9c007d0c09140ba28d3afe2dc61`.

O runtime atual já distingue, por Curso acessível:

- `ownership` (`owned` ou `shared`);
- `canEdit`;
- `canDerive`;
- `isPersonalCopy`;
- `personalCopyCourseId`;
- para a cópia pessoal, `sourceCourseId` e `sourceCourseRevision`.

O compartilhamento atual é autorizado por `public.course_access` e é de Estudo. A cópia pessoal é outro Curso, pertencente ao usuário que a criou, registrado em `private.course_personal_copies` e ligado ao Curso/revisão de origem. Variantes possuem relações próprias de comparação/checkpoint.

Não foi encontrada uma entidade corrente de pasta/coleção/grupo pessoal de Cursos.

## Decisão de UX desta edição

- **Agrupamentos automáticos** (`Meus`, `Cópias`, `Compartilhados`, `Variantes`) são derivados das permissões/proveniência.
- **Coleções de Estudo** são organização pessoal para aprender.
- **Coleções de Autoria** são organização pessoal para produzir/pesquisar e contêm apenas Cursos editáveis.
- As duas coleções não precisam coincidir.
- Coleções personalizadas são marcadas como extensão proposta; não alteram permissões nem identidade do Curso.
- `Grupos/coortes` de participantes foram removidos da navegação principal do atlas nesta edição. Eles só devem ser discutidos quando o fluxo de Pesquisa for inspecionado e sua pertinência for estabelecida.

## Escalabilidade

Na lateral do atlas, `Escala do exemplo` alterna entre 1, 20 e 200 objetos. O objetivo é verificar que a arquitetura continua compreensível em cardinalidades diferentes.

Abra `index.html` diretamente no navegador.
