# Atlas visual do AraLearn — v7

Artefato temporário para investigar e redesenhar a UX/UI do AraLearn sem alterar o frontend real.

## Base funcional

Estado corrente examinado: `ebd3feed909df9c007d0c09140ba28d3afe2dc61`.

O runtime atual já distingue, por Curso acessível, `ownership`, `canEdit`, `canDerive`, `isPersonalCopy`, `personalCopyCourseId` e, quando aplicável, `sourceCourseId`/`sourceCourseRevision`. O compartilhamento atual usa `course_access` e concede Estudo; a cópia pessoal é outro Curso pertencente ao usuário que a criou e ligado ao Curso/revisão de origem. Variantes possuem relações próprias de comparação/checkpoint.

Não foi encontrada uma entidade corrente de pasta/coleção/grupo pessoal de Cursos. Por isso, o atlas distingue agrupamentos automáticos derivados das permissões/proveniência de **Coleções de Estudo** e **Coleções de Autoria**, que são propostas de organização pessoal e não alteram permissões nem identidade do Curso.

## Arquitetura de navegação

O atlas possui sete escalas: **Visão geral**, **Entrada**, **Cursos**, **Estudo**, **Autoria**, **ChatGPT / MCP** e **Pesquisa**.

A Visão geral começa em **Entrar**. A escala Entrada detalha Login, Criar conta, Recuperar acesso e Nova senha. Depois da autenticação, a pessoa chega a **Cursos**, biblioteca da conta. Estudo, Autoria e Pesquisa são vistas sobre Cursos acessíveis segundo as permissões daquela conta.

Todas as superfícies propostas do AraLearn são desenhadas para largura de celular, inclusive Autoria e Pesquisa.

## Escalabilidade

A chave `1 / 20 / 200` muda a cardinalidade dos exemplos. O objetivo é verificar que a arquitetura continue compreensível com poucos ou muitos Cursos, Partes, Unidades e Fontes.

## Correções da v7

- restaura **Entrar** como primeira tela real do atlas;
- adiciona a escala **Entrada**;
- corrige o bug da v6 em que o SVG do Graphviz era calculado como `0 × 0 px`;
- limita os SVGs do seletor **Estudo / Autoria** a `18 × 18 px`;
- corrige a navegação **Autoria → Estudo**;
- usa curvas calculadas pelo Graphviz para evitar os problemas anteriores de rótulos em arestas ortogonais.

## Validação

A v7 foi executada em navegador e verificada em `1440×960`, `430×932` e `390×844`. Todos os sete grafos apresentaram nós com dimensões positivas; não houve erro de JavaScript nem overflow horizontal; e o fluxo **Entrar → Cursos** trocou corretamente para a escala Cursos.

Abra `index.html` diretamente no navegador.
