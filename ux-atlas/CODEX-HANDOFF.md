# Handoff para Codex — fechamento do AraLearn

Use `main` como base funcional e a branch `ux/codex-frontend-v11` como especificação de UX/UI.

Leia somente nesta ordem antes de implementar:

1. #147 — resultado e sequência;
2. #174 — gate contra overengineering;
3. `ux-atlas/STUDY-VISUAL-BASELINE.md` — identidade de Estudo;
4. `ux-atlas/MATRIZ-COBERTURA.md` — capacidades que precisam aparecer no produto;
5. `ux-atlas/index.html` — Atlas navegável;
6. `docs/principios-editoriais.md` — documentação final;
7. a issue corrente entre #151 e #155.

Não use `ux/atlas-frontend`, `ux/atlas-v11-continuity` ou `ux/final-interface-spec` como base de implementação.

## Regra de interpretação

**Não simplifique o produto para simplificar a implementação.**

Toda capacidade definida em #147 e na matriz de cobertura precisa continuar disponível. Procure simplicidade em menos mecanismos, menos abstrações, menos caminhos concorrentes e melhor integração entre as camadas.

O backend atual é o ponto de partida. Quando faltar uma operação necessária ao produto final, implemente a menor correção vertical correta. Não trate o backend como imutável e não crie arquitetura nova por antecipação.

Quando substituir um caminho, migre seus consumidores e remova a implementação anterior. Não deixe fallback, dual read/write, alias, adapter ou compatibilidade de transição sem consumidor real.

Se houver dúvida real sobre a necessidade de uma solução mais complexa, faça um ensaio finito com poucos cenários e critério de encerramento. Se a solução simples satisfizer os requisitos, pare de investigar alternativas.

## Estudo

Preserve a identidade e a experiência definidas em `STUDY-VISUAL-BASELINE.md`:

- `Estudo / Autoria`;
- Curso → Módulo → Lição → Microssequência → Unidade;
- `←` volta exatamente à tela anterior;
- `↑` sobe somente um nível didático;
- `Visualizar / Editar / Assistência por API` aparecem como modos irmãos na Unidade, com Visualizar como padrão;
- edição, assistência, cópia pessoal, offline e reconciliação usam os mecanismos correntes.

A referência histórica serve para identidade visual/interacional. Não restaure Workspace, Trilhas, APIs, schemas ou persistência antigos.

## Autoria e operabilidade

Implemente todas as capacidades da matriz de cobertura. A interface final deve permitir que a pessoa autorizada use e mantenha o produto sem recorrer ao repositório, SQL ou Storage manual.

Isso inclui ciclo de vida de Cursos e cópias, Planejamento/materialização, Parâmetros/componentes, Fontes/PDFs, Inspeção, Observações, Auditoria/correções, Variantes, Pesquisa, Pessoas/acesso, dados locais, conta e Manutenção administrativa.

Capacidade não precisa virar aba permanente. Também não pode ficar escondida a ponto de parecer inexistente.

## Chrome

O Codex local já consegue operar o Chrome. Use-o diretamente durante #152–#154. Testes automatizados são complementares.

Exercite os fluxos definidos em #153 com cliques, teclado, rolagem e navegação reais, incluindo retorno tela a tela, os três modos da Unidade, ciclo de vida de Curso, Parâmetros, Fontes/PDFs, Pesquisa, acessos e Manutenção. Use dados descartáveis em ações destrutivas e preserve evidência interna suficiente.

## Documentação

Em #154, aplique `docs/principios-editoriais.md` ao corpus corrente inteiro.

README e guias ensinam o produto atual a público geral e não contêm bastidores, cronologia de versões, roadmap, issues, tentativas ou estado intermediário de validação.

Aprofundamentos técnicos, conceituais e acadêmicos também devem ser didáticos: apresentar problema e referente antes do termo especializado, desenvolver relações e então aprofundar mecanismos, alternativas, evidências e limites.

Reutilize a bibliografia existente e pesquise somente lacunas materiais. Páginas técnicas, conceituais ou acadêmicas com afirmações externas usam citações autor-data no corpo e terminam com `Referências`, derivadas de `docs/referencias.bib`. Preserve `docs/referencias.md` como bibliografia geral.

## Execução

Use `GPT-5.6 Sol` com esforço `high` e mantenha esse esforço durante a continuidade. Não mude para `ultra` apenas pelo tamanho da tarefa.

Multiagente é aceitável somente para verificações independentes e delimitadas; não o use para abrir explorações arquiteturais paralelas.

Execute #151 → #152 → #153 → #154 → #155, avançando automaticamente quando os critérios de cada etapa estiverem satisfeitos.

Não abra subissues ou frentes paralelas. Não inicie #156–#168.

Só interrompa por credencial indispensável ausente, ação remota destrutiva sem autoridade suficiente, decisão de produto materialmente ambígua ou falha que não possa ser corrigida proporcionalmente dentro do escopo.

Depois de #155, pare.