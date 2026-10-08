# 🐍 Python 시험 연습장 (python-exam-practice)

> ⚠️ **비공식 개인 학습용 사이트입니다.** elice 및 서울대학교와 **무관**하며, elice의 코드·이미지·로고를 사용하지 않습니다.
> 개인 정보를 수집하지 않고, 모든 기록은 사용자의 브라우저에만 저장됩니다.

**사이트:** https://wonjaelee0.github.io/python-exam-practice/

elice 시험 화면과 같은 흐름(문제 · 에디터 · Run · Submit · 터미널)으로 Python 문제를 연습하는 정적 웹사이트입니다.
서버 없이 브라우저 안에서 Python(Pyodide)이 실행되며, GitHub Pages로 배포됩니다.

## 특징

- **Run**: 터미널에서 직접 입력하며 실행합니다 (`input()` 대화형, Stop, 실행 시간 제한).
- **Submit**: 공개 예시와 숨은 테스트로 채점합니다. 채점 방식은 elice와 같습니다.
  - `input("프롬프트: ")`는 프롬프트를 출력한 뒤 줄을 바꾸고, 입력값은 출력에 들어가지 않습니다.
  - 출력 끝의 줄바꿈만 무시하고 **공백까지 정확히** 비교합니다.
- **Python 3.6 호환 경고**: 시험장(elice)은 Python 3.6입니다. `f"{x=}"`, f-string 안의 같은 따옴표, `:=` 같은 최신 문법을 잡아냅니다.
- **제출 규칙 검사**: `:` 뒤 공백, `,` 뒤 공백, 문장부호 앞 공백, `random.seed(1)`.
- **시험처럼 모드**: 실제 시험처럼 Submit 결과(점수·틀린 테스트)를 숨깁니다.
- 기대 출력은 사람이 쓰지 않고, 정답 코드를 **Python 3.6 컨테이너**에서 실행해 자동으로 만듭니다.

## 구조

```
content/          문제(YAML)·단원·설정 — 문제 추가는 여기만 고치면 된다
tools/            빌드·검증 도구 (Python)
  build.py          content → site/data (품질 게이트 V1~V11)
  run36.py          정답 실행기 (python:3.6 컨테이너에서 실행)
  fetch_assets.py   Pyodide·Monaco·xterm 등 외부 파일 내려받기 (버전·SHA-256 고정)
  serve.py          GitHub Pages와 같은 조건의 로컬 서버
  leak_guard.py     비공개 자료 유출 검사
site/             배포되는 정적 사이트 (빌드 도구 없이 그대로 배포)
  py/               채점 의미론·검사기 — CI(3.6)와 브라우저가 같은 코드를 사용
  js/               화면 (Preact + htm), 실행 엔진(Web Worker)
docs/PLAN.md      전체 계획서 · docs/AUTHORING.md 문제 작성 가이드
```

## 로컬에서 실행

필요한 것: [uv](https://docs.astral.sh/uv/) (Node.js는 필요 없음)

```bash
uv run tools/fetch_assets.py      # 외부 파일 내려받기 (처음 한 번)
uv run tools/build.py             # 문제 빌드 (Docker가 켜져 있으면 Python 3.6으로 검증)
uv run tools/serve.py --dev       # http://localhost:8000/python-exam-practice/
uv run --group dev pytest -q      # 테스트
```

## 문제 추가

1. `content/problems/<단원>/<id>.yaml` 작성 ([docs/AUTHORING.md](docs/AUTHORING.md))
2. `uv run tools/build.py`로 검증 — 정답·대체 정답·오답 코드를 실행해 테스트 품질을 확인
3. `main`에 push하면 GitHub Actions가 Python 3.6으로 다시 검증하고 Pages에 배포

## 라이선스

- 코드: MIT ([LICENSE](LICENSE))
- 문제·해설(`content/`): CC BY-NC 4.0 — 이 사이트를 위해 새로 작성한 문제입니다.
- 사용한 오픈소스: Pyodide(MPL-2.0), Monaco Editor(MIT), xterm.js(MIT), Preact/htm(MIT/Apache-2.0), marked(MIT), DOMPurify(Apache-2.0/MPL-2.0), coi-serviceworker(MIT)
