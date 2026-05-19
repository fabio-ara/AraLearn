# Codex CLI local

## Finalidade

O bridge local do Codex permite usar o mesmo fluxo estrutural e o mesmo bottom-up do app sem passar por uma API remota.

Endpoint padrão:

- `http://127.0.0.1:4183/assist`

Health check:

- `http://127.0.0.1:4183/health`

## Modos suportados

- `plan-scope`
- `generate-microsequence`
- `improve-microsequence`
- `add-practice`
- `create-support`
- `generate-next`

## Subir o bridge

```bash
npm run codex:local
```

## Observações

- o bridge envia prompts longos ao Codex via `stdin`;
- quando o prompt fica grande demais, ele pode usar arquivo temporário local;
- a UI do app permite configurar endpoint, token e modelo no painel de provider.

