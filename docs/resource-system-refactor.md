# Refatoração do sistema de recursos

## Objetivo e resultado

O corte de 28 de julho de 2026 consolidou o contrato dos cards em
`aralearn.resources.v4`, ampliou o repertório para dezesseis recursos e tornou
a revisão bottom-up atômica e validada por escopo. O estudo permanece
determinístico, local-first e independente de LLM.

Não há caminho de produção compatível com o motor antigo por slots numerados.
Documentos com outra versão são rejeitados na entrada; a migration SQL altera
o armazenamento implantado, mas não funciona como adaptador de payload legado.

## Decisões vigentes

- `src/resources/registry/` é a fonte canônica de IDs, labels, schemas,
  capacidades de interação, alvos de lacuna, limites e exemplos.
- Adaptadores de domínio, geração, autoria, MCP e Edge derivam ou verificam
  seus dados contra esse registro.
- O renderer fica fora do registro e possui teste de cobertura exata.
- `choice` usa `selectionMode`, `selectionCriterion`, `options` e `answerIds`.
  A avaliação compara o conjunto exato somente após confirmação.
- A quantidade de opções varia de 2 a 7 e depende de distratores funcionais.
  Cinco opções são uma preferência de perfil, não uma cota.
- A autoria automática usa lacunas por alternativas. Digitação permanece uma
  capacidade explícita para autoria manual, sem regex nem correção por LLM.
- Providers bottom-up implementam `generateStructured`. Capacidade de schema
  estrito e JSON mode são anunciadas separadamente e não existe fallback para
  parser textual.
- A revisão retorna somente substituições do alvo. O restante do card,
  microssequência e projeto é contexto somente leitura protegido por
  fingerprint e comparação estrutural.
- Todo bloco de `composite` possui `id` estável. Alterações por índice não são
  forma canônica.
- Geometria, rotas, cores, dimensões e controles pertencem ao renderer, nunca
  ao conteúdo produzido pela LLM.

## Escopo entregue

1. Registro canônico e contrato v4.
2. `choice` single/multiple, `correct`/`incorrect`/`best`, opções textuais ou
   de código, feedback localizado e `answerIds` plural.
3. Provider estruturado e schemas pequenos por fase.
4. Patches atômicos de card, recurso e um ou vários blocos do mesmo
   `composite`.
5. Guardas de escopo, retomada por fingerprint e persistência granular.
6. Layouts e validações de `graph`, `flow`, `tree`, `table`, `matrix`,
   `relation_map`, `plane` e `formula`.
7. Novos recursos `chart`, `sequence`, `annotated_text` e
   `linguistic_example`, todos com `none`, `gap` e `choice`.
8. Contratos do MCP, GPT e runtime Edge sincronizados.
9. Corpus versionado com vinte cenários disciplinares e benchmark
   determinístico.
10. Remoção do catálogo de templates, parsers, retries e compiladores do motor
    por slots.

`system_map` e `reaction` não foram introduzidos neste corte. Eles continuam
como candidatos especializados e só devem entrar se um estudo de casos mostrar
ganho que não possa ser obtido por `graph`/`flow` e `formula`/`sequence`.

## Critérios verificados

- Objetos conhecidos fechados com `additionalProperties: false`.
- Cobertura exata entre registro, recursos de domínio, renderers e autoria.
- Round-trip e rejeição de referências ou campos desconhecidos.
- Cards de prática autossuficientes e sem resposta exposta.
- Interação por teclado, foco visível, confirmação e feedback posterior.
- Persistência de resposta, tentativa e posição sem rede.
- Nenhuma mutação lateral em correções atômicas.
- Validação integrada do aplicativo, pacotes de autoria e MCP.

## Linha de base e estado final

| Medida | Linha de base | Após o corte |
|---|---:|---:|
| Recursos | 12 | 16 |
| Motores bottom-up | textual por slots | estruturado por schema |
| Corpus disciplinar | inexistente | 20 cenários |
| Testes integrados | 739 na linha de base | 707 no corte v4 |
| Catálogos de geração independentes | presentes | removidos |

A redução na contagem de testes decorre da exclusão dos testes do motor
retirado. A cobertura nova inclui contratos, round-trip, renderização,
acessibilidade, lacunas, persistência, autoria atômica e providers.

## Base técnica e acadêmica

As decisões usam JSON Schema 2020-12, a documentação oficial dos providers,
WCAG 2.2 e os princípios do ELK Layered. A fundamentação didática e a matriz que
liga evidências a decisões estão em
[Fundamentação pedagógica dos resources](fundamentacao-pedagogica-dos-resources.md).

O DOI `10.1207/S1532690XCI2001_3`, sugerido no prompt inicial como referência
de Renkl, corresponde a outro artigo. A referência usada para a transição entre
exemplo e resolução é Renkl et al. (2002),
<https://doi.org/10.1080/00220970209599510>.
