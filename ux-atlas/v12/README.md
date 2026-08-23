# AraLearn · Atlas final de interface — v12

Esta edição substitui a arquitetura experimental v10/v11 por uma especificação derivada do `main` atual (`ebd3feed909df9c007d0c09140ba28d3afe2dc61`).

- **101 telas/estados desenhados**, não apenas nós de grafo;
- um único registro canônico gera a navegação e os grafos;
- nenhuma numeração de botões é mantida separadamente;
- cobertura das capacidades atuais é validada automaticamente;
- Pesquisa, Variantes, Fontes, Auditoria, Edição/Assistência e estados de concorrência estão explicitamente desenhados;
- efeitos sobre estudantes permanecem marcados como futuro.

O ZIP nesta pasta contém `index.html`, CSS/JS estáticos inspecionáveis, `screen-registry.json`, DOTs dos grafos e toda a documentação. A versão final do artefato não usa `eval()` nem APIs de rede.

Para implementação, leia `CODEX-HANDOFF.md`. Para uma inspeção curta, leia `EVALUACAO-RAPIDA.md`. Segurança: `SECURITY-VALIDATION.md`.