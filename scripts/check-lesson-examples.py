"""Run the worked Python examples in each lesson and compare their printed results."""
import argparse
import contextlib
import difflib
import io
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FENCE = re.compile(r"^```python\n(.*?)^```[ \t]*$", re.MULTILINE | re.DOTALL)
RESULT = re.compile(r"^\s*\*\*运行结果\*\*\s*\n```text\n(.*?)\n```", re.DOTALL)


def verify(path):
    source = path.read_text(encoding="utf-8")
    namespace = {"__name__": "__main__"}
    results = 0
    for match in FENCE.finditer(source):
        expected = RESULT.match(source[match.end():])
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer):
            exec(compile(match[1], str(path), "exec"), namespace)
        if expected:
            actual = buffer.getvalue().rstrip("\n")
            if actual != expected[1]:
                diff = difflib.unified_diff(expected[1].splitlines(), actual.splitlines(),
                                            fromfile="正文", tofile="运行输出", lineterm="")
                raise ValueError(f"{path.name}\n" + "\n".join(diff))
            results += 1
    if results == 0:
        raise ValueError(f"{path.name} 缺少可核对的运行结果")
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lessons", nargs="*", type=Path, help="Markdown 课文路径")
    paths = parser.parse_args().lessons
    if not paths:
        paths = [p for p in sorted((ROOT / "content").glob("*.md"))
                 if "### 数值复算 ·" in p.read_text(encoding="utf-8")]
    if not paths:
        parser.error("没有可核对的课文")
    count = sum(verify(p) for p in paths)
    print(f"{len(paths)} 篇课文通过，{count} 组运行输出与正文一致")
