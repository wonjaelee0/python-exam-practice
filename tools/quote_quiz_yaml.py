"""퀴즈 YAML에서 따옴표 없이 쓴 한 줄 값(prompt/explanation 등)에 ': '나 ' #'이 있으면 큰따옴표로 감싼다."""
import re
import sys
from pathlib import Path

KEYS = ("prompt", "explanation", "answer", "title", "summary")
LINE = re.compile(r"^(\s*(?:- )?(?:" + "|".join(KEYS) + r"):\s)(.*)$")

for path in sys.argv[1:]:
    p = Path(path)
    out = []
    changed = 0
    in_points = None  # points: 목록 안이면 그 들여쓰기
    for line in p.read_text(encoding="utf-8").split("\n"):
        stripped = line.lstrip()
        indent = len(line) - len(stripped)
        if stripped.startswith("points:") and stripped.rstrip() == "points:":
            in_points = indent
        elif in_points is not None and (not stripped.startswith("- ") or indent <= in_points):
            in_points = None if stripped else in_points
        if in_points is not None and stripped.startswith("- ") and indent > in_points:
            val = stripped[2:]
            if val and val[0] not in "\"'[{" and (": " in val or " #" in val or val[0] in "`@%*!?-&"):
                esc = val.replace("\\", "\\\\").replace('"', '\\"')
                out.append(" " * indent + '- "' + esc + '"')
                changed += 1
                continue
        m = LINE.match(line)
        if m:
            val = m.group(2)
            plain = val and val[0] not in "\"'|>[{" and not val.startswith("&")
            if plain and (": " in val or " #" in val or val.endswith(":") or val[0] in "`@%*!?-"):
                esc = val.replace("\\", "\\\\").replace('"', '\\"')
                line = f'{m.group(1)}"{esc}"'
                changed += 1
        out.append(line)
    p.write_text("\n".join(out), encoding="utf-8")
    print(p.name, "quoted", changed)
