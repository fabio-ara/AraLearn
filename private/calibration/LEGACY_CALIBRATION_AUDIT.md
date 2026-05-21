# Legacy Calibration Audit

O caminho principal de calibração agora é:

```bash
python private/calibration/flow_loop.py --provider fake --auto-fix --max-cycles 10
```

## Manter como dependência do loop mínimo

- `autocalibration_common.py`
  - Mantido para sanitização, escrita de relatório, `run_node_json` e autopatch opcional via `codex exec`.

## Manter apenas como referência legada, fora do caminho principal

- `run_autocalibration.py`
  - Loop antigo amplo demais, com judge, múltiplos providers e foco excessivo na bancada.
- `run_calibration.py`
  - Runner antigo de smoke/validação geral; útil só como referência pontual.
- `calibration_common.py`
  - Biblioteca auxiliar do runner antigo; não é mais dependência do fluxo principal.
- `test_autocalibration_common.py`
  - Continua útil para a camada de sanitização legada, mas não governa o novo loop.

## Observação

- Os arquivos legados foram preservados para evitar quebrar referências e histórico local.
- O produto deve usar `flow_loop.py` como entrada principal daqui em diante.
