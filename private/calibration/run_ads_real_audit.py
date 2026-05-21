from __future__ import annotations

import json
import subprocess
from datetime import datetime
from pathlib import Path

from autocalibration_common import close_managed_bridge, ensure_codex_bridge, load_local_config, build_runtime_env
from calibration_common import REPO_ROOT


SCENARIO_FILES = [
    REPO_ROOT / "private" / "calibration" / "scenarios" / "ads.programacao-web.http-basico.json",
    REPO_ROOT / "private" / "calibration" / "scenarios" / "ads.engenharia-software-iii.historia-aceitacao.json",
]


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def main() -> int:
    report_root = REPO_ROOT / "private" / "calibration" / "reports" / f"ads-real-{now_stamp()}"
    report_root.mkdir(parents=True, exist_ok=True)

    config = load_local_config()
    runtime_env = build_runtime_env(config)
    runtime_env, managed_bridge = ensure_codex_bridge(report_root, config, runtime_env)
    try:
        summary: list[dict[str, str | int | float | bool | None]] = []
        for scenario_file in SCENARIO_FILES:
            scenario = json.loads(scenario_file.read_text(encoding="utf-8"))
            scenario_id = str(scenario.get("id") or scenario_file.stem)
            scenario_dir = report_root / scenario_id
            scenario_dir.mkdir(parents=True, exist_ok=True)
            payload = {
                "targetModelId": "codex-cli-local",
                "judgeModelId": "",
                "skipJudge": True,
                "scenarioFile": str(scenario_file),
                "reportDir": str(scenario_dir),
                "progressPath": str(scenario_dir / "progress.json"),
            }
            command = [
                "node",
                str(REPO_ROOT / "private" / "calibration" / "real_generation_runner.mjs"),
                json.dumps(payload, ensure_ascii=False),
            ]
            completed = subprocess.run(
                command,
                cwd=REPO_ROOT,
                env=runtime_env,
                text=True,
                capture_output=True,
                timeout=600,
                check=False,
            )
            (scenario_dir / "stdout.txt").write_text(completed.stdout, encoding="utf-8", newline="\n")
            (scenario_dir / "stderr.txt").write_text(completed.stderr, encoding="utf-8", newline="\n")
            report = json.loads(completed.stdout or "{}")
            summary.append(
                {
                    "scenarioId": scenario_id,
                    "scenarioLabel": report.get("scenarioLabel"),
                    "acceptable": report.get("overall", {}).get("acceptable"),
                    "deterministicScore": report.get("overall", {}).get("deterministicScore"),
                    "finalScore": report.get("overall", {}).get("finalScore"),
                    "blockingFindings": len(report.get("overall", {}).get("blockingFindings") or []),
                    "error": report.get("error") or report.get("availability") or "",
                }
            )
        (report_root / "summary.json").write_text(
            json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(report_root)
        return 0
    finally:
        close_managed_bridge(managed_bridge)


if __name__ == "__main__":
    raise SystemExit(main())
