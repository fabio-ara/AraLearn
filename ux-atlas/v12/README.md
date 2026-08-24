# AraLearn · Atlas final de interface — v12

Esta edição substitui a arquitetura experimental v10/v11 por uma especificação derivada do `main` atual (`ebd3feed909df9c007d0c09140ba28d3afe2dc61`).

- **101 telas/estados desenhados**, não apenas nós de grafo;
- um único registro canônico gera a navegação e os grafos;
- nenhuma numeração de botões é mantida separadamente;
- cobertura das capacidades atuais é validada automaticamente;
- Pesquisa, Variantes, Fontes, Auditoria, Edição/Assistência e estados de concorrência estão explicitamente desenhados;
- efeitos sobre estudantes permanecem marcados como futuro.

## Correção de empacotamento

O ZIP desta pasta foi corrigido após a identificação de uma falha objetiva: a versão anterior carregava os scripts, mas o `index.html` não continha o shell visual exigido pelo runtime, o que podia resultar em página em branco. No pacote corrigido, `index.html` é autocontido e inclui shell, CSS, registro das 101 telas, grafos e runtime. Basta extrair e abrir `index.html` diretamente no navegador.

Para implementação, leia `CODEX-HANDOFF.md`. Para uma inspeção curta, leia `EVALUACAO-RAPIDA.md`. Segurança: `SECURITY-VALIDATION.md`.
