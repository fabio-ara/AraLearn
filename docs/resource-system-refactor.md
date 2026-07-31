# Refatoração do sistema de recursos

## Objetivo e resultado

O corte concluído em 29 de julho de 2026 consolidou o contrato dos cards em
`aralearn.resources.v4`, ampliou o repertório para dezoito recursos e tornou
a assistência atômica de revisão validada por escopo. O estudo permanece
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
- Providers da assistência implementam `generateStructured`. Capacidade de schema
  estrito e JSON mode são anunciadas separadamente e não existe fallback para
  parser textual.
- O reparo de recursos retorna somente substituições dos alvos. O restante do card,
  microssequência e projeto é contexto somente leitura protegido por
  fingerprint e comparação estrutural.
- `atomic-card-assistance` nomeia essa revisão local por API;
  `atomic-resource-authoring` nomeia separadamente a consulta de contratos e as
  mutações de workspace da autoria remota pelo Chatbot ou Plugin.
- Os alvos graváveis são fechados: `main`, `response`, `after:text`,
  `body:<id>` e `after:<id>`. O card inteiro é um escopo separado.
- Todo bloco de `composite` possui `id` estável. Alterações por índice não são
  forma canônica.
- Geometria, rotas, cores, dimensões e controles pertencem ao renderer, nunca
  ao conteúdo produzido pela LLM.
- `system_map` preserva limites, grupos, componentes e conexões;
  `reaction` preserva lados da equação, espécies, coeficientes, estados, seta
  e condições.

## Escopo entregue

1. Registro canônico e contrato v4.
2. `choice` single/multiple, `correct`/`incorrect`/`best`, opções textuais ou
   de código, feedback localizado e `answerIds` plural.
3. Provider estruturado e schemas pequenos por fase.
4. Reparo atômico do card inteiro ou de um ou vários recursos no corpo e no
   apoio; criação antes, depois, no fim ou numa nova microssequência.
5. Prévia efêmera, guardas de escopo, fingerprint e persistência relacional
   mínima somente após confirmação.
6. Layouts e validações de `graph`, `flow`, `tree`, `table`, `matrix`,
   `relation_map`, `plane` e `formula`.
7. Recursos adicionais `chart`, `sequence`, `annotated_text`,
   `linguistic_example`, `system_map` e `reaction`, integrados às mesmas
   mecânicas `none`, `gap` e `choice`.
8. Contratos do MCP, GPT e runtime Edge sincronizados.
9. Corpus determinístico derivado dos exemplos dos dezoito recursos, acrescido
   de matrizes explícitas para variantes de gráfico, sequência e escrita,
   tipos de grupo/componente de sistema e direções de reação.
10. Remoção do catálogo de templates, parsers, fallbacks e compiladores do
    motor por slots.

Na criação `new_microsequence`, a persistência permite somente uma nova
microssequência e sua subárvore, além de mudanças em `position` das
microssequências irmãs que preservem a ordem relativa existente.

## Critérios verificados

- Objetos conhecidos fechados com `additionalProperties: false`.
- Cobertura exata entre registro, recursos de domínio, renderers e autoria.
- Round-trip e rejeição de referências ou campos desconhecidos.
- Práticas testadas com dados locais e rejeição de referências externas
  explícitas; respostas de lacuna não expostas nos casos verificados.
- Restrições de `guide.exclude`/`guide.avoid` de módulo e lição, fontes
  autorizadas e referências externas explícitas verificadas na assistência de
  card.
- Interação por teclado, foco visível, confirmação e feedback posterior.
- Persistência de resposta, tentativa e posição sem rede.
- Nenhuma mutação lateral em correções atômicas.
- Validação integrada do aplicativo, pacotes de autoria e MCP.

## Linha de base e estado final

| Medida | Linha de base | Após o corte |
|---|---:|---:|
| Recursos | 12 | 18 |
| Assistência de revisão por API | motor integral por slots | reparo/criação atômicos por schema |
| Corpus de contrato | inexistente | registro canônico + matrizes de variantes |
| Cobertura automatizada | incluía o motor legado | suíte v4 integral executada por `npm test` |
| Catálogos de geração independentes | presentes | removidos |

A suíte é descoberta automaticamente em `tests/v4`; por isso, uma contagem
fixa neste documento ficaria obsoleta a cada cenário acrescentado. A cobertura
vigente inclui contratos, round-trip, renderização, acessibilidade, lacunas,
persistência, autoria atômica e providers.

## Base técnica e acadêmica

As decisões usam JSON Schema 2020-12, a documentação oficial dos providers,
WCAG 2.2, os princípios do ELK Layered, a terminologia da IUPAC para equações
de reação e critérios de legibilidade de notações visuais. A fundamentação
didática e a matriz que liga evidências a decisões estão em
[Fundamentação pedagógica dos resources](fundamentacao-pedagogica-dos-resources.md).

O DOI `10.1207/S1532690XCI2001_3`, sugerido no prompt inicial como referência
de Renkl, corresponde a outro artigo. A referência usada para a transição entre
exemplo e resolução é Renkl et al. (2002),
<https://doi.org/10.1080/00220970209599510>.
