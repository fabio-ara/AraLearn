# Guia do desenvolvedor

## Preparar

Instale uma versão atual do Node.js, execute `npm install` e configure somente
a URL pública do projeto Supabase e a chave pública de acesso. Segredos de
serviço não entram no site, no APK ou no repositório.

```bash
npm run dev
```

## Entender antes de alterar

- [Arquitetura](arquitetura.md): fronteiras entre PostgreSQL, Storage e
  IndexedDB.
- [Persistência e sincronização](persistencia-relacional.md): réplica, outbox e
  conflitos.
- [Contrato público](aralearn-contract.md): documento v4.
- [Resources](recursos-de-card.md): representações aceitas.
- [Supabase](supabase.md): migrations, RLS, funções e implantação.
- [Sistema visual](sistema-visual.md): tokens, temas, ícones e acessibilidade.

## Validar

```bash
npm run lint
npm test
npm run test:e2e
npm run validate:cutover
npm run catalog:validate
npm run audit:frontend
npm run audit:residues
npm run audit:docs
```

Testes E2E usam um servidor isolado. Se a porta padrão estiver ocupada, defina
`ARALEARN_E2E_PORT` para outra porta. Não interrompa uma sessão local para
executar a suíte.

Mudanças de comportamento, persistência, UX ou regra atualizam a documentação
pública e o manual privado no mesmo ciclo. Consulte também
[CONTRIBUTING.md](../CONTRIBUTING.md).
