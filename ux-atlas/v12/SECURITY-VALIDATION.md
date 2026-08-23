# Validação de segurança aplicável à especificação v12

Esta checagem é deliberadamente restrita ao que este artefato pode demonstrar. Ela **não certifica a segurança do AraLearn de produção**.

## Artefato do Atlas

A versão final é estática e local: não usa `eval()`/`new Function`, não faz fetch/XHR/WebSocket/EventSource, não usa cookies ou Web Storage, não pede APIs sensíveis, não carrega origens remotas e possui CSP restritiva. O registro de telas é dado de build confiável; textos usados pelo shell são escapados.

## Regras que a implementação deve preservar

A interface não é fronteira de autorização. Ocultar ou desabilitar botão nunca substitui checagem server-side.

- autenticação obrigatória nas operações protegidas;
- autorização server-side por Curso e capacidade de edição;
- revisão esperada, concorrência otimista e idempotência nas mutações;
- confirmação para revogação/correção/reversão e ações destrutivas;
- acesso revogado como estado próprio, sem continuar exibindo dado não autorizado;
- URL/download de Fonte/PDF somente após autorização e revisão confirmadas;
- upload validado no servidor por contrato, tipo/tamanho e autorização;
- conteúdo persistido tratado como dado, não HTML executável;
- OAuth/MCP mostra escopo/destino antes do consentimento;
- Analytics/exportação preservam a projeção redigida do contrato.

Evidência principal: `supabase/migrations/20260817150000_course_profiles_access.sql`, `CourseAuthoringSurface.js`, `CourseSourcesPanel.js`, `OAuthAuthorizationConsent.js`, `CourseAnalyticsPanel.js` e `docs/analytics-instrucionais.md`.

Passar esta checagem não significa pentest, auditoria completa de RLS, revisão criptográfica nem certificação de produção.