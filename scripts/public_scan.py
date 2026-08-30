"""Fail when a public repository contains common private or secret artifacts."""

from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRECTORIES = {".git", ".next", ".npm-cache", "node_modules", "out", "__pycache__"}
TEXT_SUFFIXES = {".css", ".html", ".js", ".json", ".md", ".mjs", ".py", ".svg", ".ts", ".tsx", ".txt", ".yml", ".yaml"}
FORBIDDEN_PATH_PARTS = {"data/private", "runtime", "exports"}
FORBIDDEN_FILES = {
    ".env",
    "AGENTS.md",
    "auth.json",
    "开发日志.md",
    "项目转接说明.md",
    "验收记录.md",
}
PATTERNS = {
    "Windows 用户绝对路径": re.compile(r"[A-Za-z]:\\Users\\", re.IGNORECASE),
    "共同工作区绝对路径": re.compile(r"D:\\OneDrive\\Desktop\\codex", re.IGNORECASE),
    "私钥头": re.compile(r"BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY"),
    "GitHub Token": re.compile(r"\bgh[opusr]_[A-Za-z0-9]{20,}\b"),
    "API Key": re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"),
}


def public_files():
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in SKIP_DIRECTORIES for part in path.parts):
            continue
        relative = path.relative_to(ROOT)
        normalized = relative.as_posix()
        if path.name in FORBIDDEN_FILES or any(part in normalized for part in FORBIDDEN_PATH_PARTS):
            raise SystemExit(f"禁带路径进入公开仓库：{normalized}")
        if path.suffix.lower() in TEXT_SUFFIXES or path.name in {"LICENSE", ".gitignore", ".env.example"}:
            yield relative, path


def main() -> None:
    findings: list[str] = []
    for relative, path in public_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in PATTERNS.items():
            if pattern.search(text):
                findings.append(f"{relative.as_posix()}: {label}")
    if findings:
        raise SystemExit("\n".join(findings))
    print("公开范围扫描通过。")


if __name__ == "__main__":
    main()
