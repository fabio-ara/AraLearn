\set ON_ERROR_STOP on
-- Executar com os dois arquivos juntos. A fixture abre BEGIN e este modo
-- sempre termina em ROLLBACK; erro aborta a sessão sem commit intermediário.
-- Valida preparação atual, não o upgrade nem a revisão do checkpoint antigo.
-- As observações usam os recibos unificados de course_change_receipts.
\set contextual_current_probe true
\ir contextual-state-before-354.sql
