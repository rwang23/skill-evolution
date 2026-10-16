"""Exercise the ZIP as a fresh Claude skill install, including paths with spaces."""

import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile


ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("package_skill", ROOT / "tools" / "package_skill.py")
PACKAGER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGER)


class PackageInstallTests(unittest.TestCase):
    def test_archive_is_current_and_contains_only_one_runtime_package(self):
        data = PACKAGER.build_archive()
        self.assertEqual((ROOT / "skill-evolution.zip").read_bytes(), data)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = archive.namelist()
            self.assertEqual(sum(name.endswith("/SKILL.md") for name in names), 1)
            self.assertIn("skill-evolution/SKILL.md", names)
            self.assertIn("skill-evolution/examples/repeated-feedback.jsonl", names)
            self.assertFalse(any(any(part in name.split("/") for part in (".git", "tests", "tools", "assets", "docs")) for name in names))
            self.assertFalse(any(name.endswith("README.md") for name in names))
            self.assertTrue(all(name.startswith("skill-evolution/") and ".." not in name.split("/") for name in names))

    def test_fresh_personal_and_project_installs_run_outside_the_skill_directory(self):
        with tempfile.TemporaryDirectory(prefix="skill evolution install ") as temporary:
            base = Path(temporary)
            working = base / "unrelated working directory"
            working.mkdir()
            for profile in ("personal profile", "project checkout"):
                with self.subTest(profile=profile):
                    skills = base / profile / ".claude" / "skills"
                    with zipfile.ZipFile(io.BytesIO(PACKAGER.build_archive())) as archive:
                        archive.extractall(skills)
                    installed = skills / "skill-evolution"
                    result = subprocess.run(["node", str(installed / "scripts/validate-skill-package.js"), str(installed), "--json"], cwd=working, capture_output=True, text=True, encoding="utf-8")
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    review = base / profile / "review output"
                    result = subprocess.run(["node", str(installed / "scripts/propose-skill-evolution.js"), str(installed / "examples/repeated-feedback.jsonl"), "--output-dir", str(review)], cwd=working, capture_output=True, text=True, encoding="utf-8")
                    self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                    proposal_path = Path(json.loads(result.stdout)["proposal"])
                    proposal = json.loads(proposal_path.read_text(encoding="utf-8"))
                    self.assertEqual(proposal["status"], "proposal")
                    self.assertEqual(proposal["approval"]["status"], "pending")
                    self.assertIsNone(proposal["apply_plan"])
                    validated = subprocess.run(["node", str(installed / "scripts/validate-skill-package.js"), str(installed), "--proposal", str(proposal_path), "--json"], cwd=working, capture_output=True, text=True, encoding="utf-8")
                    self.assertEqual(validated.returncode, 0, validated.stdout + validated.stderr)


if __name__ == "__main__":
    unittest.main()
