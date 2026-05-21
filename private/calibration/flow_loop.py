from __future__ import annotations

import argparse
import json
import os
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from calibration_common import REPO_ROOT, run_command
from autocalibration_common import (
    build_runtime_env,
    collect_secret_values,
    load_local_config,
    run_codex_exec_patch,
    run_node_json,
    sanitize_payload,
    sanitize_text,
    write_json,
    write_text,
)


DEFAULT_STEP_TIMEOUT_SECONDS = 30
DEFAULT_REAL_STEP_TIMEOUT_SECONDS = 120
DEFAULT_REAL_TOTAL_TIMEOUT_SECONDS = 180
DEFAULT_MAX_CYCLES = 10
DEFAULT_MAX_PATCHES = 5

PROBE_PATH = REPO_ROOT / "private" / "calibration" / "flow_probe.mjs"
INVARIANTS_PATH = REPO_ROOT / "private" / "calibration" / "BOTTOM_UP_INVARIANTS.md"
REPORT_ROOT = REPO_ROOT / "private" / "calibration" / "reports"
CACHE_ROOT = REPO_ROOT / "private" / "calibration" / "cache"

VALIDATION_COMMANDS = [
    ("npm_test", ["npm", "test"]),
    ("validate_scope", ["npm", "run", "validate:scope"]),
    ("harness_scope", ["npm", "run", "harness:scope"]),
    ("harness_bottom_up", ["npm", "run", "harness:bottom-up"]),
]


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def parse_bool(value: str | bool | None, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes", "y", "on"}:
        return True
    if normalized in {"0", "false", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError(f"Valor booleano inválido: {value}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Loop mínimo para calibrar os fluxos top-down e bottom-up do AraLearn."
    )
    parser.add_argument("--provider", default="fake", help="Provider do app. Padrão: fake.")
    parser.add_argument(
        "--auto-fix",
        nargs="?",
        const="true",
        default="false",
        help="Quando true, tenta autopatch mínimo com codex exec. Aceita true/false.",
    )
    parser.add_argument("--max-cycles", type=int, default=DEFAULT_MAX_CYCLES)
    parser.add_argument("--max-patches", type=int, default=DEFAULT_MAX_PATCHES)
    parser.add_argument("--real-budget", type=int, default=0)
    parser.add_argument("--max-real-calls", type=int, default=0)
    parser.add_argument("--step-timeout-seconds", type=int, default=DEFAULT_STEP_TIMEOUT_SECONDS)
    parser.add_argument("--real-step-timeout-seconds", type=int, default=DEFAULT_REAL_STEP_TIMEOUT_SECONDS)
    parser.add_argument("--real-total-timeout-seconds", type=int, default=DEFAULT_REAL_TOTAL_TIMEOUT_SECONDS)
    parser.add_argument("--report-root", default=str(REPORT_ROOT))
    parser.add_argument("--cache-root", default=str(CACHE_ROOT))
    return parser.parse_args()


@dataclass
class FocusedFailure:
    stage_id: str
    route: str
    file_hint: str
    error: str
    expected: dict[str, Any]
    received: dict[str, Any]
    evidence: str
    fix_area: str
    test_command: str
    pedagogical_constraints: list[str]


def load_invariants_text() -> str:
    if not INVARIANTS_PATH.exists():
        return ""
    return INVARIANTS_PATH.read_text(encoding="utf-8")


def to_failure(probe_report: dict[str, Any]) -> FocusedFailure | None:
    data = probe_report.get("firstFailure") or {}
    if not data:
        return None
    return FocusedFailure(
        stage_id=str(data.get("stageId") or ""),
        route=str(data.get("route") or ""),
        file_hint=str(data.get("fileHint") or ""),
        error=str(data.get("error") or "Falha sem diagnóstico."),
        expected=data.get("expected") or {},
        received=data.get("received") or {},
        evidence=str(data.get("evidence") or ""),
        fix_area=str(data.get("fixArea") or ""),
        test_command=str(data.get("testCommand") or ""),
        pedagogical_constraints=list(data.get("pedagogicalConstraints") or []),
    )


def build_fix_prompt(failure: FocusedFailure, invariants_text: str) -> str:
    constraints = "\n".join(f"- {item}" for item in failure.pedagogical_constraints)
    invariant_excerpt = invariants_text.strip()
    return (
        "Corrija uma única falha do fluxo real do app AraLearn.\n\n"
        f"Etapa: {failure.stage_id}\n"
        f"Rota: {failure.route}\n"
        f"Arquivo provável: {failure.file_hint}\n"
        f"Área provável: {failure.fix_area}\n"
        f"Falha: {failure.error}\n"
        f"Payload esperado: {json.dumps(failure.expected, ensure_ascii=False)}\n"
        f"Payload recebido: {json.dumps(failure.received, ensure_ascii=False)}\n"
        f"Evidência: {failure.evidence}\n"
        f"Teste focado: {failure.test_command}\n\n"
        "Restrições pedagógicas relevantes:\n"
        f"{constraints or '- Preservar a trilha top-down e o contrato público.'}\n\n"
        "Invariantes registradas:\n"
        f"{invariant_excerpt}\n\n"
        "Aplique o menor patch possível para fazer a etapa avançar sem mexer na bancada além do indispensável. "
        "Depois rode somente o teste focado informado."
    )


def run_probe(
    *,
    provider: str,
    report_dir: Path,
    cache_root: Path,
    real_budget: int,
    timeout_seconds: int,
    env: dict[str, str],
) -> tuple[dict[str, Any], dict[str, Any]]:
    payload = {
        "provider": provider,
        "reportDir": str(report_dir),
        "cacheDir": str(cache_root),
        "realBudget": real_budget,
    }
    probe_report, command_result = run_node_json(
        "flow_probe",
        PROBE_PATH,
        payload,
        env=env,
        timeout_seconds=timeout_seconds,
        progress_message="Executando flow probe mínimo do produto",
    )
    return probe_report, command_result.to_dict()


def run_focused_test(command_text: str, env: dict[str, str]) -> dict[str, Any]:
    mapping = {
        "npm run validate:scope": ("validate_scope", ["npm", "run", "validate:scope"]),
        "npm run harness:bottom-up": ("harness_bottom_up", ["npm", "run", "harness:bottom-up"]),
    }
    label, command = mapping.get(command_text, ("npm_test", ["npm", "test"]))
    result = run_command(label, command, cwd=REPO_ROOT, timeout_seconds=600, env=env)
    return result.to_dict()


def run_validation_suite(env: dict[str, str], report_dir: Path, secret_values: list[str]) -> list[dict[str, Any]]:
    results = []
    for label, command in VALIDATION_COMMANDS:
        result = run_command(label, command, cwd=REPO_ROOT, timeout_seconds=1200, env=env)
        results.append(result.to_dict())
        write_text(report_dir / f"{label}.stdout.txt", sanitize_text(result.stdout, secret_values))
        write_text(report_dir / f"{label}.stderr.txt", sanitize_text(result.stderr, secret_values))
    return results


def summarize_stop_reason(
    *,
    probe_report: dict[str, Any],
    patches_applied: int,
    no_progress_attempts: int,
    validation_results: list[dict[str, Any]] | None = None,
    auto_fix_enabled: bool = False,
    auto_fix_attempted: bool = False,
) -> str:
    if probe_report.get("stopReason") == "quota_exhausted":
        return "quota_exhausted"
    if probe_report.get("stopReason") == "timeout":
        return "timeout"
    if validation_results is not None and any(not item.get("ok") for item in validation_results):
        return "validation_failed"
    if probe_report.get("stopReason") == "completed":
        return "completed"
    if no_progress_attempts >= 2:
        return "no_progress"
    if auto_fix_enabled and not auto_fix_attempted:
        return "autofix_not_configured"
    if patches_applied >= 1:
        return "patched_but_not_completed"
    return "first_failure"


def build_summary(
    *,
    command_text: str,
    provider: str,
    probe_report: dict[str, Any],
    patch_result: dict[str, Any] | None,
    tests_run: list[str],
    stop_reason: str,
) -> str:
    failure = probe_report.get("firstFailure") or {}
    usage = probe_report.get("usage") or {}
    completed = probe_report.get("completedStages") or []
    lines = [
        "# Flow Loop Summary",
        "",
        f"- Command: `{command_text}`",
        f"- Provider: `{provider}`",
        f"- Usage: mode `{usage.get('mode', '')}`, real `{usage.get('realCalls', 0)}`, cache `{usage.get('cacheHits', 0)}`",
        f"- Completed stages: `{', '.join(completed) if completed else '-'}`",
        f"- First failed stage: `{failure.get('stageId', '-')}`",
        f"- Error: {failure.get('error', '-')}",
        f"- Patch applied: `{patch_result.get('ok') if patch_result else False}`",
        f"- Tests run: `{', '.join(tests_run) if tests_run else '-'}`",
        f"- Stop reason: `{stop_reason}`",
    ]
    if stop_reason == "completed":
        lines.append(
            "- Next command: `python private/calibration/flow_loop.py --provider fake --auto-fix --max-cycles 10`"
        )
    elif provider == "fake":
        lines.append(
            "- Next command: `python private/calibration/flow_loop.py --provider fake --auto-fix --max-cycles 10`"
        )
    else:
        lines.append(
            f"- Next command: `python private/calibration/flow_loop.py --provider {provider} --real-budget 1 --auto-fix false --max-cycles 1`"
        )
    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    auto_fix_enabled = parse_bool(args.auto_fix, default=False)
    report_dir = Path(args.report_root).resolve() / now_stamp()
    report_dir.mkdir(parents=True, exist_ok=True)
    cache_root = Path(args.cache_root).resolve()
    cache_root.mkdir(parents=True, exist_ok=True)

    config = load_local_config()
    env = build_runtime_env(config)
    secret_values = collect_secret_values(config=config, runtime_env=env)
    command_text = " ".join(
        [
            "python",
            "private/calibration/flow_loop.py",
            f"--provider {args.provider}",
            f"--auto-fix {str(auto_fix_enabled).lower()}",
            f"--max-cycles {args.max_cycles}",
            f"--real-budget {args.real_budget}",
        ]
    )

    probe_timeout = (
        min(args.real_total_timeout_seconds, args.real_step_timeout_seconds)
        if args.provider != "fake"
        else args.step_timeout_seconds
    )
    real_budget = min(args.real_budget, args.max_real_calls)
    no_progress_attempts = 0
    patches_applied = 0
    patch_result_payload: dict[str, Any] | None = None
    focused_test_payload: dict[str, Any] | None = None
    auto_fix_attempted = False
    probe_report: dict[str, Any] = {}

    for cycle in range(1, max(1, args.max_cycles) + 1):
        cycle_dir = report_dir / f"cycle-{cycle:02d}"
        cycle_dir.mkdir(parents=True, exist_ok=True)
        try:
            probe_report, probe_command = run_probe(
                provider=args.provider,
                report_dir=cycle_dir,
                cache_root=cache_root,
                real_budget=real_budget,
                timeout_seconds=probe_timeout,
                env=env,
            )
        except subprocess.TimeoutExpired as error:
            probe_report = {
                "completedStages": [],
                "firstFailure": {
                    "stageId": "probe",
                    "route": args.provider,
                    "error": f"Timeout after {probe_timeout} seconds.",
                    "fileHint": str(PROBE_PATH),
                    "expected": {"timeoutSeconds": probe_timeout},
                    "received": {"timeoutSeconds": probe_timeout, "command": list(error.cmd or [])},
                    "evidence": "Probe real excedeu o orçamento de tempo.",
                    "fixArea": "runtime_context",
                    "testCommand": "npm run harness:bottom-up",
                    "pedagogicalConstraints": [
                        "Preservar a trilha top-down como linha principal.",
                        "Não introduzir assunto fora de include/dependências.",
                        "Não condensar artificialmente a didática.",
                        "Manter o contrato público válido.",
                    ],
                },
                "stopReason": "timeout",
                "usage": {"mode": "real_or_cache", "realCalls": 0, "cacheHits": 0, "callLog": []},
            }
            probe_command = {
                "label": "flow_probe",
                "command": list(error.cmd or []),
                "exit_code": "",
                "ok": False,
                "stdout": error.output if isinstance(error.output, str) else "",
                "stderr": error.stderr if isinstance(error.stderr, str) else "",
                "timeout_seconds": probe_timeout,
            }
        write_json(cycle_dir / "probe-command.json", sanitize_payload(probe_command, secret_values))
        if probe_report.get("stopReason") == "completed":
            break

        failure = to_failure(probe_report)
        if failure is None:
            break

        invariants_text = load_invariants_text()
        fix_prompt = build_fix_prompt(failure, invariants_text)
        write_text(cycle_dir / "fix-prompt.md", sanitize_text(fix_prompt, secret_values))

        if not auto_fix_enabled:
            break

        auto_fix_attempted = True
        codex_available = bool(env.get("ARALEARN_CODEX_COMMAND") or shutil_which("codex"))
        if not codex_available:
            no_progress_attempts = max(no_progress_attempts, 1)
            break

        patch_result, last_message, diagnostics = run_codex_exec_patch(
            iteration_dir=cycle_dir,
            prompt=fix_prompt,
            env=env,
            timeout_seconds=1800,
        )
        patch_result_payload = sanitize_payload(
            {
                **diagnostics,
                "label": patch_result.label,
                "command": patch_result.command,
                "exit_code": patch_result.exit_code,
                "ok": patch_result.ok,
                "stdout": patch_result.stdout,
                "stderr": patch_result.stderr,
                "last_message": last_message,
            },
            secret_values,
        )
        write_json(cycle_dir / "autofix-result.json", patch_result_payload)
        patches_applied += 1 if patch_result.ok else 0

        focused_test_payload = run_focused_test(failure.test_command, env)
        write_json(cycle_dir / "focused-test.json", sanitize_payload(focused_test_payload, secret_values))

        if not patch_result.ok or not focused_test_payload.get("ok"):
            no_progress_attempts += 1
        else:
            no_progress_attempts = 0

        if patches_applied >= args.max_patches or no_progress_attempts >= 2:
            break

    validation_results = None
    if probe_report.get("stopReason") == "completed":
        validation_results = run_validation_suite(env, report_dir, secret_values)
        write_json(report_dir / "validation-results.json", sanitize_payload(validation_results, secret_values))

    stop_reason = summarize_stop_reason(
        probe_report=probe_report,
        patches_applied=patches_applied,
        no_progress_attempts=no_progress_attempts,
        validation_results=validation_results,
        auto_fix_enabled=auto_fix_enabled,
        auto_fix_attempted=auto_fix_attempted,
    )
    tests_run = []
    if focused_test_payload:
        tests_run.append(str(focused_test_payload.get("label") or "focused"))
    if validation_results is not None:
        tests_run.extend(str(item.get("label") or "") for item in validation_results)

    write_json(report_dir / "run-status.json", sanitize_payload(
        {
            "status": stop_reason,
            "provider": args.provider,
            "updatedAt": now_iso(),
            "completedStages": probe_report.get("completedStages") or [],
            "firstFailure": probe_report.get("firstFailure") or {},
            "patchesApplied": patches_applied,
            "autoFixEnabled": auto_fix_enabled,
            "autoFixAttempted": auto_fix_attempted,
        },
        secret_values,
    ))
    summary = build_summary(
        command_text=command_text,
        provider=args.provider,
        probe_report=probe_report,
        patch_result=patch_result_payload,
        tests_run=tests_run,
        stop_reason=stop_reason,
    )
    write_text(report_dir / "summary.md", sanitize_text(summary, secret_values))
    print(report_dir)
    return 0 if stop_reason == "completed" else 1


def shutil_which(command: str) -> str:
    from shutil import which

    return which(command) or ""


if __name__ == "__main__":
    raise SystemExit(main())
