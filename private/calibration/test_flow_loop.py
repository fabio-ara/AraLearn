from __future__ import annotations

import unittest

from flow_loop import FocusedFailure, build_fix_prompt, parse_bool, summarize_stop_reason


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


if __name__ == "__main__":
    unittest.main()
