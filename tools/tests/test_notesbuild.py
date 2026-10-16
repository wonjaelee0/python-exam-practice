import json

import notesbuild


def write_note(root, name, text):
    d = root / "notes"
    d.mkdir(exist_ok=True)
    (d / name).write_text(text, encoding="utf-8")


def test_load_and_write(tmp_path):
    write_note(tmp_path, "w02.yaml", "id: w02\nshort: 2주차\ntitle: 기본\norder: 2\nquiz: w02\nunits: [b02]\nbody: |\n  ## 제목\n  본문\n")
    write_note(tmp_path, "rules.yaml", "id: rules\nshort: 공통\ntitle: 규칙\norder: 0\nbody: 내용\n")
    notes, errors = notesbuild.load(tmp_path)
    assert errors == []
    assert {n["id"] for n in notes} == {"w02", "rules"}
    assert all(n["course"] == "basic" for n in notes)

    out = tmp_path / "out"
    entries, hashes = notesbuild.write(out, notes)
    assert [e["id"] for e in entries] == ["rules", "w02"]  # order 순서
    assert len(hashes) == 2
    first = json.loads((out / entries[1]["file"]).read_text(encoding="utf-8"))
    assert first["body"].startswith("## 제목")
    assert "body" not in entries[1]  # 목록(manifest)에는 본문을 넣지 않음


def test_load_errors(tmp_path):
    write_note(tmp_path, "w03.yaml", "id: w99\nshort: x\ntitle: x\nbody: x\n")
    write_note(tmp_path, "w04.yaml", "id: w04\nshort: x\ntitle: x\n")
    write_note(tmp_path, "w05.yaml", "id: w05\nshort: x\ntitle: x\nbody: '![a](https://example.com/a.png)'\n")
    notes, errors = notesbuild.load(tmp_path)
    assert notes == []
    assert len(errors) == 3


def test_check_links():
    notes = [{"id": "w02", "quiz": "w02", "units": ["b02", "zz"]}, {"id": "w03", "quiz": "nope", "units": []}]
    errors = notesbuild.check_links(notes, {"b02"}, {"w02"})
    assert len(errors) == 2
