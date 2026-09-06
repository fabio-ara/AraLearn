"""Release APK acceptance on an isolated Linux runner; never changes app data directly."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import struct
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
import zlib

PACKAGE = "com.aralearn.app"
BASE_VERSION = "0.0.64"
BASE_CODE = 210
BASE_SHA = "1d517793a7b28cdbab2ca8bb8f850a9f4adc605a7737472c24b8b0ba400ef5ac"
CERTIFICATE = "c3d2ad6c97e44492c09d785d2d5e9f461eb6399914b196119e2cba0e5d271296"
SYSTEM_IMAGE = "system-images;android-36;google_apis;x86_64"
HASH = re.compile(r"[a-f0-9]{64}")
DEADLINE = float("inf")
DIAGNOSTIC_DIR = None


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def diagnostic(name, data):
    if DIAGNOSTIC_DIR is None:
        return
    require(re.fullmatch(r"[a-z0-9-]+\.log", name), "Nome de diagnóstico inválido.")
    text = data.decode("utf-8", errors="replace")
    for key, value in os.environ.items():
        if value and len(value) >= 8 and re.search(r"TOKEN|SECRET|PASSWORD|KEY", key, re.I):
            text = text.replace(value, "[redacted]")
    DIAGNOSTIC_DIR.mkdir(parents=True, exist_ok=True)
    (DIAGNOSTIC_DIR / name).write_text(text[-2 * 1024 * 1024:], encoding="utf-8")


def command(args, *, timeout=90, env=None, input_bytes=None, allow_failure=False):
    remaining = min(timeout, DEADLINE - time.monotonic())
    require(remaining > 0, "Prazo do gate nativo esgotado.")
    executable = Path(str(args[0])).name
    technical = executable in {"sdkmanager", "avdmanager", "emulator", "gh"}
    try:
        result = subprocess.run([str(x) for x in args], input=input_bytes, stdin=subprocess.DEVNULL if input_bytes is None else None,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=remaining, env=env, check=False)
    except subprocess.TimeoutExpired as error:
        if technical:
            diagnostic(executable + ".log", (error.stdout or b"") + b"\n" + (error.stderr or b""))
        raise
    if technical:
        diagnostic(executable + ".log", result.stdout + b"\n" + result.stderr)
    if not allow_failure:
        require(result.returncode == 0, f"Falha no comando nativo {Path(str(args[0])).name}; nenhuma proteção foi contornada.")
    return result


def output(args, **options):
    return command(args, **options).stdout.decode("utf-8", errors="strict").strip()


def read_json(file):
    return json.loads(Path(file).read_text(encoding="utf-8-sig"))


def write_json(file, value):
    Path(file).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def promotion_identity(manifest, env):
    require(env.get("GITHUB_ACTIONS") == "true", "A prova publicável exige GitHub Actions.")
    require(env.get("GITHUB_REF") == "refs/heads/main", "A promoção nativa exige main.")
    repo, sha = env.get("GITHUB_REPOSITORY", ""), env.get("GITHUB_SHA", "")
    require(re.fullmatch(r"[\w.-]+/[\w.-]+", repo) and re.fullmatch(r"[a-f0-9]{40}", sha), "Identidade Git inválida.")
    require(manifest.get("source", {}).get("repository") == repo and manifest.get("promotion", {}).get("targetSha") == sha,
            "Manifesto pertence a outra promoção.")
    require(manifest.get("gate") == {"scope": "integral", "web": "success", "supabase": "success"}, "Gate integral ausente.")
    version, code = manifest.get("version", ""), manifest.get("android", {}).get("versionCode")
    require(isinstance(version, str) and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version)
            and tuple(map(int, version.split("."))) > tuple(map(int, BASE_VERSION.split(".")))
            and type(code) is int and code > BASE_CODE, "Candidata deve suceder a versão pública usada no upgrade.")
    require(manifest["android"].get("certificateSha256") == CERTIFICATE, "Certificado da candidata divergente.")
    numbers = [env.get("GITHUB_RUN_ID"), env.get("GITHUB_RUN_ATTEMPT"), manifest.get("run", {}).get("id"), manifest.get("run", {}).get("attempt")]
    require(all(re.fullmatch(r"[1-9][0-9]*", str(x or "")) for x in numbers), "Run/tentativa inválidos.")
    return {"repository": repo, "sha": sha, "runId": int(numbers[0]), "runAttempt": int(numbers[1]),
            "candidateRunId": int(numbers[2]), "candidateRunAttempt": int(numbers[3])}


def validate_receipt(receipt, manifest):
    candidate = {key: value for key, value in receipt.items() if key != "release"}
    require(candidate == manifest, "Recibo do APK não corresponde ao manifesto aprovado.")
    release = receipt.get("release", {})
    require(set(release) == {"apk", "sha256", "certificateSha256"} and release["apk"] == f"AraLearn-{manifest['version']}.apk"
            and HASH.fullmatch(release["sha256"]) and release["certificateSha256"] == CERTIFICATE, "Identidade do APK incompleta.")
    return release


def github(endpoint, *, binary=False):
    args = ["gh", "api", endpoint]
    if binary:
        args += ["-H", "Accept: application/octet-stream"]
    data = command(args, timeout=120).stdout
    return data if binary else json.loads(data)


def asset(release, name, repo):
    matches = [value for value in release.get("assets", []) if value["name"] == name]
    require(len(matches) == 1 and matches[0].get("state") == "uploaded", "Asset exato ausente ou duplicado.")
    descriptor = matches[0]
    require(0 < descriptor["size"] <= 128 * 1024 * 1024, "Asset excede o limite da prova nativa.")
    data = github(f"repos/{repo}/releases/assets/{descriptor['id']}", binary=True)
    require(len(data) == descriptor["size"], "Asset incompleto.")
    if descriptor.get("digest"):
        require(descriptor["digest"] == "sha256:" + digest(data), "Digest GitHub do asset diverge.")
    return data


def candidate_bundle(folder, manifest):
    directory = Path(folder)
    apk_name = f"AraLearn-{manifest['version']}.apk"
    names = {apk_name, apk_name + ".sha256", f"AraLearn-{manifest['version']}.json"}
    require(directory.is_dir() and not directory.is_symlink(), "Pacote assinado transportado ausente.")
    files = list(directory.iterdir())
    require(len(files) == len(names) and {file.name for file in files} == names
            and all(file.is_file() and not file.is_symlink() for file in files),
            "Pacote assinado transportado incompleto ou com arquivo inesperado.")
    receipt_file = directory / f"AraLearn-{manifest['version']}.json"
    checksum_file = directory / (apk_name + ".sha256")
    apk_file = directory / apk_name
    require(0 < receipt_file.stat().st_size <= 2 * 1024 * 1024
            and 0 < checksum_file.stat().st_size <= 512
            and 0 < apk_file.stat().st_size <= 128 * 1024 * 1024, "Tamanho do pacote assinado inválido.")
    receipt = read_json(receipt_file)
    expected = validate_receipt(receipt, manifest)
    require(checksum_file.read_text(encoding="utf-8") == f"{expected['sha256']}  {expected['apk']}\n",
            "Checksum transportado divergente.")
    apk = apk_file.read_bytes()
    require(digest(apk) == expected["sha256"], "APK transportado difere do recibo assinado.")
    return receipt, apk


def licenses(sdk):
    directory = sdk / "licenses"
    require(directory.is_dir(), "INEVITABLE: SDK sem licenças já disponíveis; nenhum aceite automático.")
    files = sorted(directory.iterdir())
    require(files and all(x.is_file() and not x.is_symlink() for x in files), "Inventário de licenças inválido.")
    return {file.name: digest(file.read_bytes()) for file in files}


def ensure_licenses_unchanged(before, after):
    require(isinstance(before, dict) and before and all(isinstance(key, str) and isinstance(value, str)
            and HASH.fullmatch(value) for key, value in before.items()) and before == after,
            "INEVITABLE: instalação alterou licenças; gate recusado.")


def parse_badging(text):
    match = re.search(r"^package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'", text, re.M)
    require(match is not None, "Identidade aapt ausente.")
    return {"package": match[1], "versionCode": int(match[2]), "version": match[3]}


def parse_certificate(text):
    values = re.findall(r"^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]{64})$", text, re.M)
    require(len(values) == 1 and values[0].lower() == CERTIFICATE, "Assinatura do APK não é a histórica.")
    return values[0].lower()


def apk_identity(file, tools):
    result = parse_badging(output([tools / "aapt", "dump", "badging", file]))
    result["certificateSha256"] = parse_certificate(output([tools / "apksigner", "verify", "--verbose", "--print-certs", file]))
    result["sha256"] = digest(file.read_bytes())
    return result


def ui_nodes(xml):
    require(len(xml) <= 2 * 1024 * 1024 and "<!DOCTYPE" not in xml and "<!ENTITY" not in xml, "Hierarquia UI inválida.")
    root = ET.fromstring(xml)
    require(root.tag == "hierarchy", "Raiz UI inesperada.")
    return list(root.iter("node"))


def ui_target(xml, label, *, clickable=True):
    nodes = [node for node in ui_nodes(xml) if node.get("package") == PACKAGE and node.get("enabled") == "true"
             and (node.get("text") == label or node.get("content-desc") == label)
             and (not clickable or node.get("clickable") == "true")]
    require(len(nodes) == 1, f"UI: alvo único não encontrado: {label}.")
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", nodes[0].get("bounds", ""))
    require(match is not None, "Bounds da UI ausentes.")
    x1, y1, x2, y2 = map(int, match.groups())
    require(0 <= x1 < x2 <= 8192 and 0 <= y1 < y2 <= 8192, "Bounds da UI inválidos.")
    return nodes[0], ((x1 + x2) // 2, (y1 + y2) // 2)


def screen_is_dark(png):
    signature = b"\x89PNG\r\n\x1a\n"
    require(png.startswith(signature) and len(png) < 8 * 1024 * 1024, "Captura nativa inválida.")
    position, header, compressed, ended = len(signature), None, [], False
    while position < len(png):
        require(position + 12 <= len(png), "PNG truncado.")
        length = int.from_bytes(png[position:position + 4], "big")
        kind = png[position + 4:position + 8]
        start, finish = position + 8, position + 8 + length
        require(finish + 4 <= len(png), "Chunk PNG truncado.")
        data = png[start:finish]
        checksum = int.from_bytes(png[finish:finish + 4], "big")
        require(zlib.crc32(kind + data) & 0xffffffff == checksum, "Checksum PNG inválido.")
        if kind == b"IHDR":
            require(header is None and length == 13, "Cabeçalho PNG inválido.")
            header = struct.unpack(">IIBBBBB", data)
        elif kind == b"IDAT":
            compressed.append(data)
        elif kind == b"IEND":
            require(length == 0, "Fim PNG inválido.")
            ended = True
            position = finish + 4
            break
        position = finish + 4
    require(header is not None and compressed and ended and position == len(png), "Estrutura PNG incompleta.")
    width, height, depth, color, compression, filtering, interlace = header
    require(depth == 8 and color in {2, 6} and compression == filtering == interlace == 0
            and 1 <= width <= 8192 and 1 <= height <= 8192 and width * height <= 8 * 1024 * 1024,
            "Formato PNG nativo inesperado.")
    channels, stride = (3 if color == 2 else 4), width * (3 if color == 2 else 4)
    expected = (stride + 1) * height
    decoder = zlib.decompressobj()
    raw = decoder.decompress(b"".join(compressed), expected + 1)
    require(decoder.eof and not decoder.unused_data and not decoder.unconsumed_tail and len(raw) == expected,
            "Pixels PNG inválidos.")
    previous = bytearray(stride)
    samples, offset = [], 0
    # Avoid system bars and the lower settings sheet; the content canvas is stable in both themes.
    x1, x2 = width // 8, max(width // 8 + 1, width * 7 // 8)
    y1, y2 = height // 8, max(height // 8 + 1, height // 2)
    x_step, y_step = max(1, (x2 - x1) // 64), max(1, (y2 - y1) // 64)
    for y in range(height):
        filter_kind, encoded = raw[offset], raw[offset + 1:offset + stride]
        offset += stride + 1
        require(filter_kind <= 4, "Filtro PNG inválido.")
        current = bytearray(stride)
        for index, value in enumerate(encoded):
            left = current[index - channels] if index >= channels else 0
            above = previous[index]
            upper_left = previous[index - channels] if index >= channels else 0
            if filter_kind == 1:
                value += left
            elif filter_kind == 2:
                value += above
            elif filter_kind == 3:
                value += (left + above) // 2
            elif filter_kind == 4:
                prediction = left + above - upper_left
                distances = (abs(prediction - left), abs(prediction - above), abs(prediction - upper_left))
                value += (left, above, upper_left)[distances.index(min(distances))]
            current[index] = value & 0xff
        if y1 <= y < y2 and (y - y1) % y_step == 0:
            for x in range(x1, x2, x_step):
                pixel = x * channels
                samples.append((299 * current[pixel] + 587 * current[pixel + 1] + 114 * current[pixel + 2]) // 1000)
        previous = current
    require(samples, "Captura sem amostra visual.")
    samples.sort()
    return samples[len(samples) // 2] < 64 and samples[int((len(samples) - 1) * 0.9)] < 128


def theme_control(xml, label):
    candidates = []
    for node in ui_nodes(xml):
        value = node.get("text") or node.get("content-desc")
        if node.get("package") == PACKAGE and node.get("enabled") == "true" and value in {label, label + ", selecionado"}:
            candidates.append(value)
    require(len(candidates) == 1, f"UI: controle de tema único não encontrado: {label}.")
    return ui_target(xml, candidates[0])[0], candidates[0].endswith(", selecionado")


def theme_selected(xml, png):
    # Android WebView does not consistently project aria-pressed into UIAutomator after a cold load.
    # Keep the controls observable and bind the assertion to the rendered pixels as well.
    theme_control(xml, "Tema escuro")
    light, light_announced = theme_control(xml, "Tema claro")
    system, system_announced = theme_control(xml, "Tema do sistema")
    light_selected = light_announced or light.get("checked") == "true" or light.get("selected") == "true"
    system_selected = system_announced or system.get("checked") == "true" or system.get("selected") == "true"
    require(not light_selected and not system_selected, "Preferência de tema ambígua.")
    require(screen_is_dark(png), "Tema escuro não está aplicado na captura nativa.")


class Device:
    def __init__(self, adb, folder):
        self.adb, self.folder = adb, folder

    def call(self, *args, **options):
        return output([self.adb, "-s", "emulator-5554", *args], **options)

    def hierarchy(self):
        self.call("shell", "uiautomator", "dump", "/sdcard/aralearn-native-ui.xml", timeout=20)
        xml = self.call("shell", "cat", "/sdcard/aralearn-native-ui.xml")
        ui_nodes(xml)
        return xml

    def wait_label(self, label, *, clickable=True, timeout=60):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            try:
                xml = self.hierarchy()
                ui_target(xml, label, clickable=clickable)
                return xml
            except (RuntimeError, ET.ParseError, subprocess.TimeoutExpired):
                time.sleep(1)
        raise RuntimeError(f"UI nativa indisponível: {label}; nenhuma coordenada presumida.")

    def tap(self, label):
        xml = self.wait_label(label)
        _, (x, y) = ui_target(xml, label)
        sizes = re.findall(r"(?:Physical|Override) size: (\d+)x(\d+)", self.call("shell", "wm", "size"))
        require(sizes and x < int(sizes[-1][0]) and y < int(sizes[-1][1]), "Alvo fora da tela nativa observada.")
        self.call("shell", "input", "tap", str(x), str(y))

    def capture(self, name):
        xml = self.hierarchy()
        (self.folder / (name + ".xml")).write_text(xml, encoding="utf-8")
        png = command([self.adb, "-s", "emulator-5554", "exec-out", "screencap", "-p"]).stdout
        require(png.startswith(b"\x89PNG\r\n\x1a\n") and len(png) < 8 * 1024 * 1024, "Captura nativa inválida.")
        (self.folder / (name + ".png")).write_bytes(png)
        return xml, png

    def installed(self):
        found = self.call("shell", "pm", "list", "packages", "-U", "--user", "0", PACKAGE)
        match = re.fullmatch(re.escape("package:" + PACKAGE) + r" uid:(\d+)", found)
        require(match is not None, "Pacote/UID nativo inesperado.")
        details = self.call("shell", "dumpsys", "package", PACKAGE)
        code = re.search(r"\bversionCode=(\d+)\b", details)
        version = re.search(r"\bversionName=([^\s]+)", details)
        require(code and version, "Versão instalada ausente.")
        return {"package": PACKAGE, "uid": int(match[1]), "versionCode": int(code[1]), "version": version[1]}

    def launch(self):
        self.call("shell", "am", "start", "-W", "-n", PACKAGE + "/.MainActivity")

    def isolate_network(self):
        self.call("shell", "cmd", "connectivity", "airplane-mode", "enable")
        self.call("shell", "svc", "wifi", "disable")
        self.call("shell", "svc", "data", "disable")
        require(self.call("shell", "settings", "get", "global", "airplane_mode_on") == "1",
                "Emulador não confirmou isolamento de rede.")

    def stop(self):
        self.call("shell", "am", "force-stop", PACKAGE)

    def settings(self):
        self.tap("Conta e aparência")
        return self.wait_label("Aparência", clickable=False)

    def wait_dark_selected(self, timeout=15):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            try:
                xml = self.hierarchy()
                png = command([self.adb, "-s", "emulator-5554", "exec-out", "screencap", "-p"]).stdout
                theme_selected(xml, png)
                return xml
            except (RuntimeError, ET.ParseError, subprocess.TimeoutExpired):
                time.sleep(1)
        raise RuntimeError("Tema escuro não está marcado na UI nativa.")

    def dark(self):
        self.settings()
        self.tap("Tema escuro")
        self.wait_dark_selected()


def check_installed(value, version, code):
    require(set(value) == {"package", "uid", "versionCode", "version"} and value["package"] == PACKAGE
            and value["version"] == version and value["versionCode"] == code and isinstance(value["uid"], int)
            and value["uid"] >= 10000, "Identidade instalada inválida.")


def validate_proof(proof, manifest, receipt, env, evidence_dir):
    expected = promotion_identity(manifest, env)
    release = validate_receipt(receipt, manifest)
    expected["apkSha256"] = release["sha256"]
    expected["manifestSha256"] = digest(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode())
    require(proof.get("schema") == "aralearn.android-native-proof.v1" and proof.get("promotion") == expected, "Prova de outro APK/run/tentativa/SHA.")
    platform = proof.get("environment", {})
    require(platform.get("runner") == "ubuntu24" and platform.get("kvm") is True
            and platform.get("networkPolicy") == "public-bootstrap-then-offline"
            and platform.get("offlineAfterHydration") is True
            and platform.get("systemImage") == SYSTEM_IMAGE and platform.get("imageVersion")
            and isinstance(platform.get("emulatorVersion"), str) and platform["emulatorVersion"]
            and isinstance(platform.get("systemImageMetadataSha256"), str)
            and HASH.fullmatch(platform["systemImageMetadataSha256"]), "Ambiente nativo incompleto.")
    ensure_licenses_unchanged(platform.get("licensesBefore"), platform.get("licensesAfter"))
    code = manifest["android"]["versionCode"]
    require(proof.get("candidate") == {"package": PACKAGE, "version": manifest["version"], "versionCode": code,
            "certificateSha256": CERTIFICATE, "sha256": release["sha256"]}, "APK candidato não foi identificado.")
    require(proof.get("baseline") == {"package": PACKAGE, "version": BASE_VERSION, "versionCode": BASE_CODE,
            "certificateSha256": CERTIFICATE, "sha256": BASE_SHA}, "APK público de base divergente.")
    clean, upgrade = proof.get("cleanInstall", {}), proof.get("upgrade", {})
    require(clean.get("initiallyAbsent") is True and clean.get("launched") is True and clean.get("themeAfterRelaunch") == "dark", "Instalação limpa não comprovada.")
    check_installed(clean.get("installed", {}), manifest["version"], code)
    require(upgrade.get("initiallyAbsent") is True and upgrade.get("launched") is True, "Upgrade não comprovado.")
    for field, version, installed_code in [("before", BASE_VERSION, BASE_CODE), ("after", manifest["version"], code), ("afterReinstall", manifest["version"], code)]:
        check_installed(upgrade.get(field, {}), version, installed_code)
    require(upgrade["before"]["uid"] == upgrade["after"]["uid"] == upgrade["afterReinstall"]["uid"], "UID mudou no upgrade/reinstalação.")
    require(upgrade.get("candidateThemeAfterReinstall") == "dark" and upgrade.get("oldAppPreference") == "not_tested_login_required",
            "Retenção da candidata foi confundida com preferência antiga.")
    files = proof.get("evidence", [])
    names = {name + suffix for name in ["clean-initial", "clean-selected", "clean-relaunched", "base-login", "upgraded", "candidate-selected", "candidate-reinstalled"] for suffix in [".png", ".xml"]}
    require(len(files) == len(names) and {item.get("name") for item in files} == names, "Evidência nativa incompleta/duplicada.")
    directory = Path(evidence_dir)
    require({file.name for file in directory.iterdir()} == names, "Arquivo inesperado na evidência nativa.")
    for item in files:
        require(set(item) == {"name", "sha256", "bytes"} and HASH.fullmatch(item["sha256"]), "Digest da evidência inválido.")
        file = directory / item["name"]
        require(file.is_file() and not file.is_symlink(), "Evidência não é arquivo regular.")
        data = file.read_bytes()
        require(len(data) == item["bytes"] and digest(data) == item["sha256"], "Bytes da evidência alterados.")
        if item["name"].endswith(".png"):
            require(data.startswith(b"\x89PNG\r\n\x1a\n"), "PNG da prova inválido.")
        else:
            ui_nodes(data.decode("utf-8"))
    for stem in ["clean-selected", "clean-relaunched", "candidate-selected", "candidate-reinstalled"]:
        theme_selected((directory / (stem + ".xml")).read_text(encoding="utf-8"),
                       (directory / (stem + ".png")).read_bytes())
    for stem, label in [("clean-initial", "Conta e aparência"), ("base-login", "Entrar"), ("upgraded", "Conta e aparência")]:
        ui_target((directory / (stem + ".xml")).read_text(encoding="utf-8"), label)
    require(not screen_is_dark((directory / "clean-initial.png").read_bytes())
            and not screen_is_dark((directory / "upgraded.png").read_bytes()),
            "Estado inicial claro do emulador não foi comprovado.")
    return proof


def run_gate(manifest, identity, folder, candidate_folder):
    global DIAGNOSTIC_DIR
    DIAGNOSTIC_DIR = folder / "diagnostics"
    require(sys.platform == "linux" and os.environ.get("ImageOS") == "ubuntu24", "Gate exige runner Ubuntu24.04 padrão.")
    require(Path("/dev/kvm").exists() and os.access("/dev/kvm", os.R_OK | os.W_OK), "INEVITABLE: KVM indisponível; sem emulação alternativa.")
    sdk = Path(os.environ.get("ANDROID_HOME", ""))
    require(sdk.is_absolute() and sdk.is_dir(), "SDK do runner ausente.")
    receipt, candidate_bytes = candidate_bundle(candidate_folder, manifest)
    before = licenses(sdk)
    manager = sdk / "cmdline-tools/latest/bin/sdkmanager"
    try:
        install = command([manager, "--install", "emulator", SYSTEM_IMAGE, "--channel=0"], timeout=540, allow_failure=True)
    finally:
        ensure_licenses_unchanged(before, licenses(sdk))
    license_refused = re.search(rb"license.{0,100}(?:not accepted|not been accepted)|not accepted.{0,100}license", install.stdout + install.stderr, re.I)
    require(not license_refused, "INEVITABLE: SDK exige licença não aceita; stdin fechado, nenhum aceite novo.")
    require(install.returncode == 0 and (sdk / "system-images/android-36/google_apis/x86_64/package.xml").is_file(),
            "SDK não instalou a imagem com stdin fechado; consultar diagnóstico técnico para disponibilidade/rede/licença.")
    emulator, adb = sdk / "emulator/emulator", sdk / "platform-tools/adb"
    command([emulator, "-accel-check"])
    tools = sdk / "build-tools/36.0.0"
    require((tools / "apksigner").is_file() and (tools / "aapt").is_file(), "Build-tools36.0.0 do runner ausentes.")
    baseline_release = github(f"repos/{identity['repository']}/releases/tags/v{BASE_VERSION}")
    require(baseline_release.get("draft") is False and baseline_release.get("prerelease") is False, "Base não é release pública.")
    baseline_bytes = asset(baseline_release, f"AraLearn-{BASE_VERSION}.apk", identity["repository"])
    require(digest(baseline_bytes) == BASE_SHA, "APK público0.0.64 foi alterado.")
    proof = {"schema": "aralearn.android-native-proof.v1", "promotion": {**identity, "apkSha256": digest(candidate_bytes),
             "manifestSha256": digest(json.dumps(manifest, sort_keys=True, separators=(",", ":")).encode())},
             "environment": {"runner": os.environ["ImageOS"], "imageVersion": os.environ.get("ImageVersion"), "kvm": True,
             "networkPolicy": "public-bootstrap-then-offline", "offlineAfterHydration": True,
             "systemImage": SYSTEM_IMAGE, "emulatorVersion": output([emulator, "-version"]).splitlines()[0],
             "systemImageMetadataSha256": digest((sdk / "system-images/android-36/google_apis/x86_64/package.xml").read_bytes()),
             "licensesBefore": before, "licensesAfter": licenses(sdk)}}
    evidence = folder / "evidence"
    evidence.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="aralearn-native-", dir=os.environ.get("RUNNER_TEMP")) as temporary:
        working = Path(temporary)
        candidate, baseline = working / "candidate.apk", working / "baseline.apk"
        candidate.write_bytes(candidate_bytes)
        baseline.write_bytes(baseline_bytes)
        proof["candidate"], proof["baseline"] = apk_identity(candidate, tools), apk_identity(baseline, tools)
        require(proof["candidate"]["versionCode"] == manifest["android"]["versionCode"] and proof["candidate"]["version"] == manifest["version"] and proof["candidate"]["package"] == PACKAGE,
                "Versão/pacote da candidata incorretos.")
        require(proof["baseline"]["versionCode"] == BASE_CODE and proof["baseline"]["version"] == BASE_VERSION and proof["baseline"]["package"] == PACKAGE,
                "Versão/pacote público de base incorretos.")
        device = Device(adb, evidence)
        for case in ["clean", "upgrade"]:
            avd_home = working / case
            avd_home.mkdir()
            env = {**os.environ, "ANDROID_AVD_HOME": str(avd_home)}
            command([sdk / "cmdline-tools/latest/bin/avdmanager", "create", "avd", "-n", "aralearn-" + case, "-k", SYSTEM_IMAGE,
                     "-d", "pixel_7"], env=env, input_bytes=b"no\n")
            with (working / (case + "-emulator.log")).open("wb") as log:
                process = subprocess.Popen([str(emulator), "-avd", "aralearn-" + case, "-port", "5554", "-no-window", "-no-snapshot",
                    "-no-audio", "-no-boot-anim", "-gpu", "swiftshader", "-memory", "2048", "-cores", "2", "-camera-back", "none", "-camera-front", "none"],
                    env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=log)
                try:
                    boot_until = time.monotonic() + 300
                    while time.monotonic() < boot_until:
                        require(process.poll() is None, "Emulador encerrou antes da inicialização.")
                        result = command([adb, "-s", "emulator-5554", "shell", "getprop", "sys.boot_completed"], timeout=15, allow_failure=True)
                        if result.returncode == 0 and result.stdout.strip() == b"1":
                            break
                        time.sleep(2)
                    else:
                        raise RuntimeError("Emulador não iniciou em 300s; consultar diagnóstico técnico.")
                    device.call("shell", "input", "keyevent", "82")
                    require(not device.call("shell", "pm", "list", "packages", PACKAGE), "AVD contém instalação anterior inesperada.")
                    device.call("install", str(candidate if case == "clean" else baseline), timeout=120)
                    initial = device.installed()
                    device.launch()
                    if case == "clean":
                        device.wait_label("Conta e aparência")
                        device.capture("clean-initial")
                        device.isolate_network()
                        device.dark()
                        device.capture("clean-selected")
                        device.stop()
                        device.launch()
                        device.settings()
                        relaunched_xml, relaunched_png = device.capture("clean-relaunched")
                        theme_selected(relaunched_xml, relaunched_png)
                        proof["cleanInstall"] = {"initiallyAbsent": True, "installed": initial, "launched": True, "themeAfterRelaunch": "dark"}
                    else:
                        device.wait_label("Entrar")
                        device.capture("base-login")
                        device.stop()
                        device.call("install", "-r", str(candidate), timeout=120)
                        after = device.installed()
                        device.launch()
                        device.wait_label("Conta e aparência")
                        device.isolate_network()
                        device.capture("upgraded")
                        device.dark()
                        device.capture("candidate-selected")
                        device.stop()
                        device.call("install", "-r", str(candidate), timeout=120)
                        reinstalled = device.installed()
                        device.launch()
                        device.settings()
                        reinstalled_xml, reinstalled_png = device.capture("candidate-reinstalled")
                        theme_selected(reinstalled_xml, reinstalled_png)
                        proof["upgrade"] = {"initiallyAbsent": True, "before": initial, "after": after, "afterReinstall": reinstalled,
                            "launched": True, "candidateThemeAfterReinstall": "dark", "oldAppPreference": "not_tested_login_required"}
                except (RuntimeError, OSError, ValueError, ET.ParseError, subprocess.TimeoutExpired):
                    log.flush()
                    diagnostic(case + "-emulator.log", (working / (case + "-emulator.log")).read_bytes())
                    try:
                        device.capture("failure")
                    except (RuntimeError, OSError, ValueError, ET.ParseError, subprocess.TimeoutExpired):
                        pass
                    raise
                finally:
                    try:
                        # Cleanup must remain possible after the acceptance deadline expires.
                        subprocess.run([str(adb), "-s", "emulator-5554", "emu", "kill"], stdin=subprocess.DEVNULL,
                                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10, check=False)
                    except (OSError, subprocess.TimeoutExpired):
                        pass
                    finally:
                        try:
                            process.wait(timeout=20)
                        except subprocess.TimeoutExpired:
                            process.terminate()
                            try:
                                process.wait(timeout=10)
                            except subprocess.TimeoutExpired:
                                process.kill()
                                process.wait(timeout=10)
    proof["environment"]["licensesAfter"] = licenses(sdk)
    proof["evidence"] = [{"name": file.name, "bytes": file.stat().st_size, "sha256": digest(file.read_bytes())} for file in sorted(evidence.iterdir())]
    validate_proof(proof, manifest, receipt, os.environ, evidence)
    write_json(folder / "proof.json", proof)
    require(os.environ.get("GITHUB_OUTPUT"), "Saída verificável do job ausente.")
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as handle:
        handle.write("proof_sha256=" + digest((folder / "proof.json").read_bytes()) + "\n")
    print(f"Gate Android nativo aprovado: instalação limpa, upgrade {BASE_CODE}→{manifest['android']['versionCode']} e retenção de tema da candidata. Preferência da versão antiga não testada.")


def main():
    global DEADLINE
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["run", "verify"])
    parser.add_argument("--manifest", default=".candidate/candidate.json")
    parser.add_argument("--candidate-folder", required=True)
    parser.add_argument("--folder", required=True)
    parser.add_argument("--proof-sha256")
    args = parser.parse_args()
    DEADLINE = time.monotonic() + 23 * 60
    manifest = read_json(args.manifest)
    identity = promotion_identity(manifest, os.environ)
    candidate_folder = Path(os.path.abspath(args.candidate_folder))
    folder = Path(args.folder).resolve()
    if args.operation == "run":
        folder.mkdir(parents=True, exist_ok=True)
        require(not any(folder.iterdir()), "Pasta da prova deve estar vazia; nada anterior será reutilizado.")
        run_gate(manifest, identity, folder, candidate_folder)
    else:
        require(args.proof_sha256 and HASH.fullmatch(args.proof_sha256)
                and digest((folder / "proof.json").read_bytes()) == args.proof_sha256, "Prova não corresponde ao digest do job produtor.")
        receipt, _ = candidate_bundle(candidate_folder, manifest)
        validate_proof(read_json(folder / "proof.json"), manifest, receipt, os.environ, folder / "evidence")
        print("Prova Android vinculada ao APK/run/tentativa/SHA atuais; bytes da evidência conferidos.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, ET.ParseError, subprocess.TimeoutExpired) as error:
        print("Gate Android recusado: " + str(error), file=sys.stderr)
        if "--folder" in sys.argv and "run" in sys.argv:
            failure_dir = Path(sys.argv[sys.argv.index("--folder") + 1])
            failure_dir.mkdir(parents=True, exist_ok=True)
            write_json(failure_dir / "failure.json", {"schema": "aralearn.android-native-failure.v1", "message": str(error), "passed": False})
        sys.exit(1)
