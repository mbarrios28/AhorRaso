#!/usr/bin/env python3
"""
dump_project.py
---------------
Recorre un proyecto y vuelca TODO el contenido de sus archivos en un único
archivo Markdown, incluyendo:
  - Un árbol con la estructura del proyecto
  - Un índice de archivos
  - El contenido completo de cada archivo (incluidos los .md)
Se omiten directorios basura (node_modules, .git, venv, __pycache__, ...),
archivos binarios y archivos enormes.

Uso:
    python dump_project.py                  # vuelca el directorio actual
    python dump_project.py /ruta/proyecto
    python dump_project.py -o salida.md
"""

import argparse
import os
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuración: qué ignorar
# ---------------------------------------------------------------------------
IGNORE_DIRS = {
    "node_modules", ".git", ".svn", ".hg",
    "__pycache__", ".mypy_cache", ".pytest_cache", ".ruff_cache",
    "venv", ".venv", "env", ".env",
    "dist", "build", "out", ".next", ".nuxt", ".cache", ".parcel-cache",
    ".idea", ".vscode", ".vs",
    "coverage", ".coverage", "htmlcov",
    "target", "obj",
    ".tox", ".eggs",
}

IGNORE_FILES = {
    ".DS_Store", "Thumbs.db", "desktop.ini",
}

IGNORE_EXTS = {
    # binarios / compilados
    ".pyc", ".pyo", ".pyd", ".exe", ".dll", ".so", ".dylib",
    ".bin", ".o", ".a", ".class", ".jar", ".war",
    # imágenes
    ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".ico", ".webp",
    ".mp3", ".mp4", ".wav", ".ogg", ".flac", ".avi", ".mov", ".mkv",
    # comprimidos
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".xz",
    # documentos
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    # fuentes
    ".ttf", ".otf", ".woff", ".woff2", ".eot",
    # bases de datos / locks
    ".db", ".sqlite", ".sqlite3", ".lock",
    # builds minificados y source maps
    ".min.js", ".min.css", ".map",
}

MAX_FILE_SIZE = 2 * 1024 * 1024  # 2 MB por archivo

LANG_MAP = {
    ".py": "python", ".js": "javascript", ".mjs": "javascript",
    ".cjs": "javascript", ".ts": "typescript", ".jsx": "jsx", ".tsx": "tsx",
    ".json": "json", ".md": "markdown", ".html": "html", ".htm": "html",
    ".css": "css", ".scss": "scss", ".sass": "sass", ".less": "less",
    ".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".xml": "xml",
    ".sh": "bash", ".bash": "bash", ".zsh": "bash", ".ps1": "powershell",
    ".sql": "sql", ".go": "go", ".rs": "rust", ".java": "java",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".cc": "cpp",
    ".rb": "ruby", ".php": "php", ".swift": "swift", ".kt": "kotlin",
    ".dart": "dart", ".vue": "vue", ".svelte": "svelte",
    ".txt": "text", ".env": "bash", ".gitignore": "text",
    ".dockerignore": "text", ".editorconfig": "text",
}

SPECIAL_NAMES = {
    "dockerfile": "dockerfile",
    "makefile": "makefile",
    "procfile": "text",
}


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def is_ignored_dir(name: str) -> bool:
    return name in IGNORE_DIRS or name.endswith(".egg-info")


def is_ignored_file(name: str) -> bool:
    if name in IGNORE_FILES:
        return True
    low = name.lower()
    return any(low.endswith(ext) for ext in IGNORE_EXTS)


def is_binary(path: Path) -> bool:
    try:
        with open(path, "rb") as f:
            chunk = f.read(1024)
    except OSError:
        return True
    if b"\0" in chunk:
        return True
    try:
        chunk.decode("utf-8")
        return False
    except UnicodeDecodeError:
        return True


def get_lang(path: Path) -> str:
    name = path.name.lower()
    if name in SPECIAL_NAMES:
        return SPECIAL_NAMES[name]
    return LANG_MAP.get(path.suffix.lower(), "")


# ---------------------------------------------------------------------------
# Árbol del proyecto
# ---------------------------------------------------------------------------
def build_tree(root: Path) -> str:
    lines = [root.name + "/"]
    _walk_tree(root, "", lines)
    return "\n".join(lines)


def _walk_tree(path: Path, prefix: str, lines: list) -> None:
    try:
        entries = sorted(os.listdir(path))
    except OSError:
        return

    filtered = []
    for e in entries:
        p = path / e
        if p.is_dir():
            if is_ignored_dir(e):
                continue
        else:
            if is_ignored_file(e):
                continue
        filtered.append(e)

    for i, e in enumerate(filtered):
        p = path / e
        last = (i == len(filtered) - 1)
        connector = "└── " if last else "├── "
        if p.is_dir():
            lines.append(prefix + connector + e + "/")
            _walk_tree(p, prefix + ("    " if last else "│   "), lines)
        else:
            lines.append(prefix + connector + e)


# ---------------------------------------------------------------------------
# Recolección de archivos
# ---------------------------------------------------------------------------
def collect_files(root: Path):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if not is_ignored_dir(d))
        for fn in sorted(filenames):
            if is_ignored_file(fn):
                continue
            files.append(Path(dirpath) / fn)
    return files


# ---------------------------------------------------------------------------
# Script principal
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Vuelca todo el contenido de un proyecto en un único Markdown."
    )
    parser.add_argument("root", nargs="?", default=".", help="Ruta del proyecto")
    parser.add_argument("-o", "--output", default="project_dump.md",
                        help="Archivo Markdown de salida")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        raise SystemExit(f"❌ No existe el directorio: {root}")

    out_path = Path(args.output).resolve()
    files = [f for f in collect_files(root) if f.resolve() != out_path]

    md_files = [f for f in files if f.suffix.lower() == ".md"]

    with open(out_path, "w", encoding="utf-8") as out:
        # --- Cabecera ---
        out.write(f"# Proyecto: {root.name}\n\n")
        out.write(f"- **Ruta:** `{root}`\n")
        out.write(f"- **Archivos analizados:** {len(files)}\n")
        out.write(f"- **Archivos `.md` encontrados:** {len(md_files)}\n\n")

        # --- Estructura ---
        out.write("## Estructura del proyecto\n\n")
        out.write("```\n")
        out.write(build_tree(root))
        out.write("\n```\n\n")

        # --- Índice ---
        out.write("## Índice de archivos\n\n")
        for f in files:
            rel = f.relative_to(root).as_posix()
            out.write(f"- `{rel}`\n")
        out.write("\n")

        # --- Contenido ---
        out.write("## Contenido de los archivos\n\n")
        for f in files:
            rel = f.relative_to(root).as_posix()
            out.write(f"### `{rel}`\n\n")

            try:
                size = f.stat().st_size
            except OSError as e:
                out.write(f"_No se pudo acceder al archivo: {e}_\n\n")
                continue

            if size == 0:
                out.write("_Archivo vacío._\n\n")
                continue
            if size > MAX_FILE_SIZE:
                out.write(f"_Omitido: pesa {size:,} bytes (>{MAX_FILE_SIZE:,})._\n\n")
                continue
            if is_binary(f):
                out.write("_Archivo binario, omitido._\n\n")
                continue

            try:
                content = f.read_text(encoding="utf-8", errors="replace")
            except Exception as e:
                out.write(f"_Error al leer: {e}_\n\n")
                continue

            # Fence suficientemente larga para no romper el Markdown
            fence = "```"
            while fence in content:
                fence += "`"

            lang = get_lang(f)
            out.write(f"{fence}{lang}\n")
            out.write(content)
            if not content.endswith("\n"):
                out.write("\n")
            out.write(f"{fence}\n\n")

    print(f"✅ Listo: {out_path}")
    print(f"   Archivos incluidos: {len(files)} (de ellos {len(md_files)} .md)")


if __name__ == "__main__":
    main()