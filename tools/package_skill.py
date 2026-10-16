"""Build the small, deterministic ZIP uploaded through Claude's Skills settings."""

import argparse
import io
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parent.parent


def build_archive(root=ROOT):
    root = root.resolve()
    files = [root / "SKILL.md", root / "LICENSE"]
    for directory in ("scripts", "references", "agents", "evals", "examples"):
        files.extend(path for path in (root / directory).rglob("*") if path.is_file())
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        for source in sorted(files, key=lambda item: item.relative_to(root).as_posix()):
            if source.is_symlink() or not source.resolve().is_relative_to(root):
                raise ValueError("Package input must remain inside the source repository.")
            relative = source.relative_to(root).as_posix()
            entry = zipfile.ZipInfo("skill-evolution/" + relative, (1980, 1, 1, 0, 0, 0))
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            # Runtime files are UTF-8 text. Stable line endings and uncompressed
            # entries keep the committed archive identical across OS/zlib builds.
            archive.writestr(entry, source.read_bytes().replace(b"\r\n", b"\n"))
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "skill-evolution.zip")
    parser.add_argument("--check", action="store_true", help="Verify the committed ZIP without writing.")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.suffix.lower() != ".zip":
        parser.error("Output must be a .zip file.")
    data = build_archive()
    if args.check:
        if not output.is_file() or output.read_bytes() != data:
            parser.exit(1, "Skill ZIP is missing or stale; run python tools/package_skill.py.\n")
        print("Skill ZIP is current.")
        return
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".zip.tmp")
    temporary.write_bytes(data)
    temporary.replace(output)
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        print(f"Built {output.name}: {len(archive.namelist())} runtime files, {len(data)} bytes.")


if __name__ == "__main__":
    main()
