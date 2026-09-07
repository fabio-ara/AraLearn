"""Synthetic validator checks; these do not claim Android execution."""
import base64
import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("android_native_gate", ROOT / "scripts/androidNativeGate.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)
LIGHT_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGP88fMXAwMDEwMYAAAjLALvhf1a+QAAAABJRU5ErkJggg==")
DARK_PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGPk4uFjYGBgYgADAAHWACiyHU04AAAAAElFTkSuQmCC")


def node(label, checked="false", **values):
    attributes = {"package": gate.PACKAGE, "text": label, "enabled": "true", "clickable": "true",
                  "bounds": "[20,30][80,90]", "checked": checked, **values}
    return "<node " + " ".join(f'{key}="{value}"' for key, value in attributes.items()) + "/>"


def hierarchy(*nodes):
    return '<hierarchy rotation="0">' + "".join(nodes) + "</hierarchy>"


THEME = hierarchy(node("Tema escuro, selecionado"), node("Tema claro"), node("Tema do sistema"))


class SyntheticUpgradeDevice:
    """Only exercises the existing command sequence; it is not Android evidence."""
    def __init__(self, lose_at=None):
        self.events, self.version, self.code = [], None, None
        self.lose_at = lose_at

    def call(self, *args, **options):
        self.events.append(("call", *args))
        if args[0] == "install":
            self.version, self.code = (gate.BASE_VERSION, gate.BASE_CODE) if args[-1] == "baseline.apk" else ("0.0.66", 212)

    def installed(self):
        return {"package": gate.PACKAGE, "version": self.version, "versionCode": self.code, "uid": 10101}

    def launch(self): self.events.append(("launch", self.version))
    def wait_label(self, label): self.events.append(("wait", label))
    def isolate_network(self): self.events.append(("offline",))
    def restore_network(self): self.events.append(("online",))
    def stop(self): self.events.append(("stop", self.version))
    def settings(self): self.events.append(("settings", self.version))
    def dark(self): self.events.append(("choose-dark", self.version))

    def capture(self, name):
        self.events.append(("capture", name))
        return THEME, LIGHT_PNG if name == self.lose_at else DARK_PNG


class NativeGateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="aralearn-native-validator-")
        self.addCleanup(self.temporary.cleanup)
        self.folder = Path(self.temporary.name)
        self.evidence = self.folder / "evidence"
        self.evidence.mkdir()
        self.env = {"GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main", "GITHUB_REPOSITORY": "fixture/app",
                    "GITHUB_SHA": "1" * 40, "GITHUB_RUN_ID": "901", "GITHUB_RUN_ATTEMPT": "2"}
        self.manifest = {"version": "0.0.66", "source": {"repository": "fixture/app"},
                         "promotion": {"targetSha": "1" * 40}, "run": {"id": 801, "attempt": 3},
                         "android": {"versionCode": 212, "certificateSha256": gate.CERTIFICATE},
                         "gate": {"scope": "integral", "web": "success", "supabase": "success"}}
        self.receipt = {**copy.deepcopy(self.manifest), "release": {"apk": "AraLearn-0.0.66.apk",
                         "sha256": "a" * 64, "certificateSha256": gate.CERTIFICATE}}
        installed = {"package": gate.PACKAGE, "version": "0.0.66", "versionCode": 212, "uid": 10101}
        self.proof = {"schema": "aralearn.android-native-proof.v2", "promotion": {
            **gate.promotion_identity(self.manifest, self.env), "apkSha256": "a" * 64,
            "manifestSha256": gate.digest(json.dumps(self.manifest, sort_keys=True, separators=(",", ":")).encode())},
            "environment": {"runner": "ubuntu24", "imageVersion": "synthetic-test", "kvm": True,
                "networkPolicy": "public-bootstrap-then-offline", "offlineAfterHydration": True,
                "emulatorVersion": "synthetic-test", "systemImageMetadataSha256": "2" * 64,
                "systemImage": gate.SYSTEM_IMAGE, "licensesBefore": {"android-sdk-license": "3" * 64},
                "licensesAfter": {"android-sdk-license": "3" * 64}},
            "candidate": {**{key: installed[key] for key in ["package", "version", "versionCode"]},
                "sha256": "a" * 64, "certificateSha256": gate.CERTIFICATE},
            "baseline": {"package": gate.PACKAGE, "version": gate.BASE_VERSION, "versionCode": gate.BASE_CODE,
                "sha256": gate.BASE_SHA, "certificateSha256": gate.CERTIFICATE},
            "cleanInstall": {"initiallyAbsent": True, "installed": dict(installed), "launched": True, "themeAfterRelaunch": "dark"},
            "upgrade": {"initiallyAbsent": True, "before": {**installed, "version": gate.BASE_VERSION, "versionCode": gate.BASE_CODE},
                "after": dict(installed), "afterReinstall": dict(installed), "launched": True,
                "themePreference": {"source": "baseline-ui", "selected": "dark", "afterBaseRelaunch": "dark",
                    "afterUpgrade": "dark", "afterReinstall": "dark", "candidateThemeWrites": 0}}}
        for name in ["clean-initial", "clean-selected", "clean-relaunched", "base-initial", "base-selected", "base-relaunched", "upgraded", "candidate-reinstalled"]:
            xml = hierarchy(node("Conta e aparência")) if name in {"clean-initial", "base-initial"} else THEME
            (self.evidence / (name + ".xml")).write_text(xml, encoding="utf-8")
            dark = name not in {"clean-initial", "base-initial"}
            (self.evidence / (name + ".png")).write_bytes(DARK_PNG if dark else LIGHT_PNG)
        self.refresh_evidence()

    def refresh_evidence(self):
        self.proof["evidence"] = [{"name": file.name, "bytes": file.stat().st_size, "sha256": gate.digest(file.read_bytes())}
                                  for file in sorted(self.evidence.iterdir())]

    def validate(self):
        return gate.validate_proof(self.proof, self.manifest, self.receipt, self.env, self.evidence)

    def test_uses_current_public_baseline(self):
        self.assertEqual((gate.BASE_VERSION, gate.BASE_CODE, gate.BASE_SHA), (
            "0.0.65", 211, "90e157778492e2411ecb391e6455d0f9ba4f44af072903fa4e373c581d077e17"))

    def test_rejects_proof_without_preference_from_baseline(self):
        self.proof["schema"] = "aralearn.android-native-proof.v1"
        self.proof["upgrade"].pop("themePreference", None)
        self.proof["upgrade"]["oldAppPreference"] = "not_tested_login_required"
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_upgrade_observes_old_preference_before_any_candidate_theme_write(self):
        device = SyntheticUpgradeDevice()
        result = gate.upgrade_preserving_theme(device, Path("baseline.apk"), Path("candidate.apk"))
        self.assertEqual(result, self.proof["upgrade"])
        self.assertEqual([event for event in device.events if event[0] in {"call", "choose-dark", "stop", "launch", "capture"}], [
            ("call", "install", "baseline.apk"), ("launch", "0.0.65"), ("capture", "base-initial"),
            ("choose-dark", "0.0.65"), ("capture", "base-selected"), ("stop", "0.0.65"),
            ("launch", "0.0.65"), ("capture", "base-relaunched"), ("stop", "0.0.65"),
            ("call", "install", "-r", "candidate.apk"), ("launch", "0.0.66"), ("capture", "upgraded"),
            ("stop", "0.0.66"), ("call", "install", "-r", "candidate.apk"),
            ("launch", "0.0.66"), ("capture", "candidate-reinstalled")])

    def test_upgrade_stops_on_preference_loss_without_masking_it_by_another_choice(self):
        for stage in ["base-relaunched", "upgraded", "candidate-reinstalled"]:
            with self.subTest(stage=stage):
                device = SyntheticUpgradeDevice(lose_at=stage)
                with self.assertRaisesRegex(RuntimeError, "Tema escuro"):
                    gate.upgrade_preserving_theme(device, Path("baseline.apk"), Path("candidate.apk"))
                self.assertEqual([event for event in device.events if event[0] == "choose-dark"], [("choose-dark", "0.0.65")])
                self.assertEqual(device.events[-1], ("capture", stage))

    def test_verify_refuses_a_proof_file_with_another_producer_hash(self):
        manifest_path = self.folder / "manifest.json"
        gate.write_json(manifest_path, self.manifest)
        gate.write_json(self.folder / "proof.json", self.proof)
        args = ["androidNativeGate.py", "verify", "--manifest", str(manifest_path),
                "--candidate-folder", str(self.folder / "candidate"), "--folder", str(self.folder), "--proof-sha256", "0" * 64]
        with patch.object(sys, "argv", args), patch.dict(os.environ, self.env), patch.object(gate, "candidate_bundle") as bundle:
            with self.assertRaisesRegex(RuntimeError, "digest do job produtor"):
                gate.main()
            bundle.assert_not_called()

    def test_accepts_bound_proof_with_old_preference_retained(self):
        self.assertIs(self.validate(), self.proof)
        self.assertEqual(self.proof["upgrade"]["themePreference"]["source"], "baseline-ui")

    def test_rejects_other_run_attempt_sha_and_apk(self):
        for key, value in [("runId", 902), ("runAttempt", 1), ("sha", "2" * 40), ("apkSha256", "b" * 64),
                           ("candidateRunId", 802), ("candidateRunAttempt", 4), ("manifestSha256", "b" * 64)]:
            with self.subTest(key=key):
                old = self.proof["promotion"][key]
                self.proof["promotion"][key] = value
                with self.assertRaises(RuntimeError):
                    self.validate()
                self.proof["promotion"][key] = old

    def test_requires_main_integral_and_exact_candidate(self):
        cases = [(self.env, "GITHUB_REF", "refs/heads/other"), (self.env, "GITHUB_ACTIONS", "false"),
                 (self.manifest, "gate", {"scope": "focal", "web": "success", "supabase": "success"}),
                 (self.manifest, "version", "0.0.65"), (self.manifest["android"], "versionCode", 211)]
        for target, key, value in cases:
            with self.subTest(key=key):
                original = target[key]
                target[key] = value
                with self.assertRaises(RuntimeError):
                    self.validate()
                target[key] = original

    def test_future_candidate_derives_version_from_approved_manifest(self):
        self.manifest["version"] = "0.0.67"
        self.manifest["android"]["versionCode"] = 213
        identity = gate.promotion_identity(self.manifest, self.env)
        self.receipt = {**copy.deepcopy(self.manifest), "release": {**self.receipt["release"], "apk": "AraLearn-0.0.67.apk"}}
        self.proof["promotion"] = {**identity, "apkSha256": "a" * 64,
            "manifestSha256": gate.digest(json.dumps(self.manifest, sort_keys=True, separators=(",", ":")).encode())}
        for target in [self.proof["candidate"], self.proof["cleanInstall"]["installed"],
                       self.proof["upgrade"]["after"], self.proof["upgrade"]["afterReinstall"]]:
            target.update({"version": "0.0.67", "versionCode": 213})
        self.validate()

    def test_requires_the_original_receipt_and_certificate(self):
        self.receipt["source"]["extra"] = "changed"
        with self.assertRaisesRegex(RuntimeError, "manifesto"):
            self.validate()
        del self.receipt["source"]["extra"]
        self.receipt["release"]["certificateSha256"] = "0" * 64
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_checks_both_apk_identities(self):
        for role in ["candidate", "baseline"]:
            for key, value in [("sha256", "0" * 64), ("certificateSha256", "0" * 64), ("package", "com.other"), ("versionCode", 209)]:
                with self.subTest(role=role, key=key):
                    previous = self.proof[role][key]
                    self.proof[role][key] = value
                    with self.assertRaises(RuntimeError):
                        self.validate()
                    self.proof[role][key] = previous

    def test_uid_and_all_installed_versions_are_required(self):
        for field in ["after", "afterReinstall"]:
            self.proof["upgrade"][field]["uid"] += 1
            with self.assertRaisesRegex(RuntimeError, "UID"):
                self.validate()
            self.proof["upgrade"][field]["uid"] -= 1
        self.proof["cleanInstall"]["installed"]["versionCode"] = 210
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_requires_baseline_data_and_retention_before_new_candidate_write(self):
        theme = self.proof["upgrade"]["themePreference"]
        for key, value in [("source", "candidate-ui"), ("selected", "system"), ("afterBaseRelaunch", "light"),
                           ("afterUpgrade", "light"), ("afterReinstall", "light"), ("candidateThemeWrites", 1)]:
            with self.subTest(key=key):
                previous = theme[key]
                theme[key] = value
                with self.assertRaisesRegex(RuntimeError, "preferência antiga"):
                    self.validate()
                theme[key] = previous

    def test_requires_actual_evidence_bytes_not_only_json_claim(self):
        (self.evidence / "candidate-reinstalled.xml").write_text(THEME + " ", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "Bytes"):
            self.validate()

    def test_rejects_missing_and_unexpected_evidence(self):
        self.proof["evidence"].pop()
        with self.assertRaises(RuntimeError):
            self.validate()
        self.refresh_evidence()
        (self.evidence / "unrelated.txt").write_text("not part of the proof", encoding="utf-8")
        with self.assertRaises(RuntimeError):
            self.validate()

    def test_rejects_path_replacement_and_duplicate_files(self):
        old = self.proof["evidence"][0]["name"]
        for invalid in ["../proof.json", self.proof["evidence"][1]["name"]]:
            self.proof["evidence"][0]["name"] = invalid
            with self.assertRaises(RuntimeError):
                self.validate()
        self.proof["evidence"][0]["name"] = old

    def test_xml_must_show_preference_after_reinstall(self):
        (self.evidence / "candidate-reinstalled.xml").write_text(
            hierarchy(node("Tema escuro"), node("Tema claro, selecionado"), node("Tema do sistema")), encoding="utf-8")
        self.refresh_evidence()
        with self.assertRaisesRegex(RuntimeError, "ambígua"):
            self.validate()

    def test_visual_theme_must_match_the_persisted_claim_at_each_step(self):
        for name in ["base-selected", "base-relaunched", "upgraded", "candidate-reinstalled"]:
            with self.subTest(step=name):
                target = self.evidence / (name + ".png")
                target.write_bytes(LIGHT_PNG)
                self.refresh_evidence()
                with self.assertRaisesRegex(RuntimeError, "Tema escuro"):
                    self.validate()
                target.write_bytes(DARK_PNG)
                self.refresh_evidence()

    def test_png_decoder_distinguishes_light_dark_and_tampering(self):
        self.assertTrue(gate.screen_is_dark(DARK_PNG))
        self.assertFalse(gate.screen_is_dark(LIGHT_PNG))
        changed = bytearray(DARK_PNG)
        changed[-8] ^= 1
        with self.assertRaisesRegex(RuntimeError, "Checksum|Estrutura"):
            gate.screen_is_dark(bytes(changed))

    def test_base_and_candidate_launch_must_be_observed_before_theme_choice(self):
        for name in ["clean-initial", "base-initial"]:
            with self.subTest(step=name):
                target = self.evidence / (name + ".xml")
                target.write_text(hierarchy(node("Entrar")), encoding="utf-8")
                self.refresh_evidence()
                with self.assertRaisesRegex(RuntimeError, "Conta e aparência"):
                    self.validate()
                target.write_text(hierarchy(node("Conta e aparência")), encoding="utf-8")
                (self.evidence / (name + ".png")).write_bytes(DARK_PNG)
                self.refresh_evidence()
                with self.assertRaisesRegex(RuntimeError, "Estado inicial claro"):
                    self.validate()
                (self.evidence / (name + ".png")).write_bytes(LIGHT_PNG)
                self.refresh_evidence()

    def test_rejects_empty_changed_or_unidentified_licenses(self):
        for before, after in [({}, {}), ({"license": "3" * 64}, {"license": "4" * 64}), ({"license": "accepted"}, {"license": "accepted"})]:
            with self.assertRaises(RuntimeError):
                gate.ensure_licenses_unchanged(before, after)
        with self.assertRaisesRegex(RuntimeError, "INEVITABLE"):
            gate.licenses(self.folder)
        license_dir = self.folder / "licenses"
        license_dir.mkdir()
        (license_dir / "android-sdk-license").write_text("existing", encoding="utf-8")
        before = gate.licenses(self.folder)
        gate.ensure_licenses_unchanged(before, gate.licenses(self.folder))
        (license_dir / "android-sdk-license").write_text("changed", encoding="utf-8")
        with self.assertRaises(RuntimeError):
            gate.ensure_licenses_unchanged(before, gate.licenses(self.folder))

    def test_requires_kvm_and_offline_after_public_hydration(self):
        for key, value in [("kvm", False), ("offlineAfterHydration", False), ("networkPolicy", "always-online"),
                           ("runner", "windows"), ("systemImage", "other")]:
            old = self.proof["environment"][key]
            self.proof["environment"][key] = value
            with self.assertRaises(RuntimeError):
                self.validate()
            self.proof["environment"][key] = old

    def test_ui_target_requires_unique_observed_in_package_bounds(self):
        self.assertEqual(gate.ui_target(hierarchy(node("Escolher")), "Escolher")[1], (50, 60))
        for xml in [hierarchy(node("Escolher"), node("Escolher")), hierarchy(node("Escolher", package="com.other")),
                    hierarchy(node("Escolher", bounds="[0,0][0,1]")), hierarchy(node("Escolher", bounds="[0,0][9000,2]")),
                    hierarchy(node("Escolher", clickable="false"))]:
            with self.assertRaises(RuntimeError):
                gate.ui_target(xml, "Escolher")

    def test_ui_xml_rejects_entities_and_oversize(self):
        for xml in ['<!DOCTYPE hierarchy [<!ENTITY x SYSTEM "file:///etc/passwd">]><hierarchy>&x;</hierarchy>', "x" * (2 * 1024 * 1024 + 1)]:
            with self.assertRaises(RuntimeError):
                gate.ui_nodes(xml)

    def test_actual_subprocess_stdin_is_closed_unless_hardware_prompt(self):
        result = gate.command([sys.executable, "-c", "import sys; print(len(sys.stdin.buffer.read()))"])
        self.assertEqual(result.stdout.strip(), b"0")
        result = gate.command([sys.executable, "-c", "import sys; print(sys.stdin.buffer.read().hex())"], input_bytes=b"no\n")
        self.assertEqual(result.stdout.strip(), b"6e6f0a")

    def test_sdk_invocation_cannot_accept_new_license(self):
        sdk = self.folder / "sdk"
        (sdk / "licenses").mkdir(parents=True)
        (sdk / "licenses/android-sdk-license").write_text("already present", encoding="utf-8")
        calls = []

        def denied(args, **options):
            calls.append((args, options))
            return subprocess.CompletedProcess(args, 1, b"", b"License not accepted")

        with patch.object(gate.sys, "platform", "linux"), patch.dict(os.environ, {"ImageOS": "ubuntu24", "ANDROID_HOME": str(sdk)}), \
                patch.object(gate.Path, "exists", return_value=True), patch.object(gate.os, "access", return_value=True), patch.object(gate, "command", denied):
            with patch.object(gate, "candidate_bundle", return_value=(self.receipt, b"candidate")), \
                    self.assertRaisesRegex(RuntimeError, "stdin fechado"):
                gate.run_gate(self.manifest, gate.promotion_identity(self.manifest, self.env), self.folder, self.folder / "candidate")
        self.assertEqual(len(calls), 1)
        self.assertEqual(calls[0][0][1:], ["--install", "emulator", gate.SYSTEM_IMAGE, "--channel=0"])
        self.assertNotIn("input_bytes", calls[0][1])
        self.assertEqual((sdk / "licenses/android-sdk-license").read_text(), "already present")

    def test_technical_log_preserves_error_and_redacts_tokens(self):
        secret = "synthetic-token-must-not-appear"
        with patch.object(gate, "DIAGNOSTIC_DIR", self.folder / "diagnostics"), patch.dict(os.environ, {"GH_TOKEN": secret}):
            gate.diagnostic("sdkmanager.log", ("download failed " + secret).encode())
        text = (self.folder / "diagnostics/sdkmanager.log").read_text(encoding="utf-8")
        self.assertIn("download failed", text)
        self.assertNotIn(secret, text)

    def test_signer_parser_rejects_wrong_or_multiple_certificate(self):
        valid = "Signer #1 certificate SHA-256 digest: " + gate.CERTIFICATE
        self.assertEqual(gate.parse_certificate(valid), gate.CERTIFICATE)
        for invalid in [valid.replace(gate.CERTIFICATE, "0" * 64), valid + "\n" + valid.replace("#1", "#2"), "verified"]:
            with self.assertRaises(RuntimeError):
                gate.parse_certificate(invalid)
        self.assertEqual(gate.parse_badging("package: name='com.aralearn.app' versionCode='211' versionName='0.0.65'"),
                         {"package": gate.PACKAGE, "versionCode": 211, "version": "0.0.65"})

    def test_asset_digest_and_length_are_checked(self):
        data = b"synthetic apk bytes"
        release = {"assets": [{"id": 1, "name": "app.apk", "state": "uploaded", "size": len(data), "digest": "sha256:" + gate.digest(data)}]}
        with patch.object(gate, "github", return_value=data):
            self.assertEqual(gate.asset(release, "app.apk", "fixture/app"), data)
            release["assets"][0]["digest"] = "sha256:" + "0" * 64
            with self.assertRaises(RuntimeError):
                gate.asset(release, "app.apk", "fixture/app")

    def test_candidate_bundle_requires_exact_regular_files_and_matching_bytes(self):
        directory = self.folder / "candidate"
        directory.mkdir()
        apk = b"synthetic signed apk"
        receipt = copy.deepcopy(self.receipt)
        receipt["release"]["sha256"] = gate.digest(apk)
        apk_name = receipt["release"]["apk"]
        (directory / apk_name).write_bytes(apk)
        (directory / (apk_name + ".sha256")).write_text(f"{gate.digest(apk)}  {apk_name}\n", encoding="utf-8")
        (directory / f"AraLearn-{self.manifest['version']}.json").write_text(json.dumps(receipt), encoding="utf-8")
        self.assertEqual(gate.candidate_bundle(directory, self.manifest), (receipt, apk))
        (directory / "unexpected.txt").write_text("no", encoding="utf-8")
        with self.assertRaisesRegex(RuntimeError, "inesperado"):
            gate.candidate_bundle(directory, self.manifest)
        (directory / "unexpected.txt").unlink()
        (directory / apk_name).write_bytes(b"changed")
        with self.assertRaisesRegex(RuntimeError, "recibo"):
            gate.candidate_bundle(directory, self.manifest)


if __name__ == "__main__":
    unittest.main()
