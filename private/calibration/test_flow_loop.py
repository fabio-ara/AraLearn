from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from flow_loop import FocusedFailure, build_fix_prompt, parse_bool, prepare_runtime_env, summarize_stop_reason


class FlowLoopTests(unittest.TestCase):
    def test_parse_bool_accepts_cli_values(self) -> None:
        self.assertTrue(parse_bool("true"))
        self.assertTrue(parse_bool("1"))
        self.assertFalse(parse_bool("false"))
        self.assertFalse(parse_bool("0"))

    def test_build_fix_prompt_stays_short_and_single_failure(self) -> None:
        failure = FocusedFailure(
            stage_id="repair_current",
            route="repair_current",
            file_hint="src/generation/runtime/projectGenerationRuntime.js",
            error="A intervenção saiu da microssequência atual.",
            expected={"targetMicrosequenceKey": "micro-a"},
            received={"targetMicrosequenceKey": "micro-b"},
            evidence="target trocado",
            fix_area="runtime_context",
            test_command="npm run harness:bottom-up",
            pedagogical_constraints=["Manter a microssequência atual.", "Não criar assunto novo."],
        )
        prompt = build_fix_prompt(failure, "repair_current\n- manter objetivo local")
        self.assertIn("repair_current", prompt)
        self.assertIn("targetMicrosequenceKey", prompt)
        self.assertNotIn("histórico do chat", prompt.lower())

    def test_stop_reason_prefers_no_progress(self) -> None:
        stop_reason = summarize_stop_reason(
            probe_report={"stopReason": "first_failure"},
            patches_applied=1,
            no_progress_attempts=2,
            validation_results=None,
            auto_fix_enabled=True,
            auto_fix_attempted=True,
        )
        self.assertEqual(stop_reason, "no_progress")

    @patch("flow_loop.ensure_codex_bridge")
    @patch("flow_loop.collect_secret_values")
    @patch("flow_loop.build_runtime_env")
    def test_prepare_runtime_env_bootstraps_codex_bridge(
        self,
        build_runtime_env_mock,
        collect_secret_values_mock,
        ensure_codex_bridge_mock,
    ) -> None:
        base_env = {"ARALEARN_CODEX_COMMAND": "codex"}
        bridged_env = {
            "ARALEARN_CODEX_COMMAND": "codex",
            "ARALEARN_CODEX_ASSIST_URL": "http://127.0.0.1:4183/assist",
        }
        build_runtime_env_mock.return_value = base_env
        collect_secret_values_mock.return_value = ["secret-token"]
        ensure_codex_bridge_mock.return_value = (bridged_env, object())

        with tempfile.TemporaryDirectory() as temp_dir:
            env, secret_values, managed_bridge = prepare_runtime_env(
                "codex-cli-local",
                Path(temp_dir),
                {"codex_bridge_token": "secret-token"},
            )

        self.assertEqual(env, bridged_env)
        self.assertEqual(secret_values, ["secret-token"])
        self.assertIsNotNone(managed_bridge)
        ensure_codex_bridge_mock.assert_called_once()


if __name__ == "__main__":
    unittest.main()
