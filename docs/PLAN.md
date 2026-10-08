# 🐍 elice 스타일 Python 시험 연습 사이트 — 상세 구축 계획서

> ## 결정 기록 (2026-10-08, 구현 후 갱신) — 아래 본문보다 이 기록이 우선한다
> - **저장소·사이트**: `wonjaelee0/python-exam-practice` (public) → https://wonjaelee0.github.io/python-exam-practice/
> - **시간 제한(모의고사 타이머)은 넣지 않는다.** 우선순위는 *문제 양 + 연습*. 실제 시험의 '결과 비공개'는 설정의 **시험처럼 모드**(Submit 결과 숨김)로 대신한다. → 6.3절·9장의 시험 모드는 보류
> - **기술 스택 변경**: 로컬에 Node.js가 없어 Vite/React 대신 **빌드 도구 없는 정적 구성**으로 바꿨다. `site/` 폴더가 그대로 배포된다.
>   Preact + htm(ESM), Monaco 0.57(AMD `min/vs`), xterm 6(ESM), marked, DOMPurify, coi-serviceworker — 모두 `tools/assets.json`에 버전·SHA-256 고정, CI가 내려받아 same-origin으로 서빙
> - **Pyodide 314.0.7 (Python 3.14.2)** 고정, 모듈 워커(`site/js/runtime/py-worker.js`)
> - **폴더 구조 변경**: 채점 의미론·검사기는 `site/py/`(CI의 Python 3.6과 브라우저가 공유), 화면은 `site/js/`, 도구는 `tools/` → 7.1절의 `web/`, `tools/runner/` 구조를 대체
> - **검증 완료**: Pages 실서버에서 `crossOriginIsolated === true`(계층 A), `?tier=B`로 계층 B(재실행 입력·워커 재시작) 확인,
>   CI(python:3.6.15)와 로컬(3.12)의 기대출력 20문제 모두 일치(`random.seed(1)` 포함), 브라우저(3.14)에서 3.6 기대출력으로 PASS
> - **캐시 대응**: 실행 엔진 파일(워커·`site/py/*.py`)은 내용 해시(`manifest.runtime.assetVersion`)를 주소에 붙인다. 문제 데이터는 단원별 해시 파일명
> - **현재 문제 수 (2026-10-08 밤)**: 136 — b02 18, b03 18, b04 26, b05 26, b06 25, 종합(mixed) 23. 난이도 ★1 23 · ★2 43 · ★3 34 · ★4 29 · ★5 7 (고난도 34문제 추가).
>   모두 CI의 Python 3.6.15로 검증, 3.6과 3.12의 기대출력이 전부 동일(빌드 ID 일치). 5.2절 목표(코딩 ≈315 + 퀴즈 ≈60)까지 배치로 추가

> 작성 2026-10-08(목) · 중간고사 **2026-10-20(화, D-12)** · 기말고사 2026-12-08(화)
> 과목: 2026-2 컴퓨팅 기초: 처음 만나는 컴퓨팅 (011) — eTL `코딩수업` → elice testroom
> 근거: 강의자료 `midterms/b_01~b_06.ipynb` 전수 분석 + elice **6주차 실습 testroom 직접 조작**(2026-10-08) + GitHub Pages 공식 문서·실제 응답 헤더 확인
> **배포 전제: GitHub Pages (정적 호스팅, 서버 없음)** — 모든 설계는 이 제약 안에서 동작해야 한다 (8장)
> 가칭: **Python Exam Lab** (저장소명 예: `python-exam-lab`, 변경 가능)

---

## 목차

0. [요약](#0-요약)
1. [현황 분석](#1-현황-분석)
2. [요구사항](#2-요구사항)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [문제 데이터 설계](#4-문제-데이터-설계)
5. [문제 생산 파이프라인](#5-문제-생산-파이프라인-방대한-양을-검증된-상태로)
6. [화면 · UX 설계](#6-화면--ux-설계)
7. [저장소 · 개발 환경](#7-저장소--개발-환경)
8. [**GitHub Pages 배포 설계**](#8-github-pages-배포-설계)
9. [일정 (D-12 → D-0)](#9-일정-d-12--d-0)
10. [확장성 설계와 기말 로드맵](#10-확장성-설계와-기말-로드맵)
11. [리스크와 대응](#11-리스크와-대응)
12. [저작권 · 공개 정책](#12-저작권--공개-정책)
13. [결정 필요 사항과 다음 단계](#13-결정-필요-사항과-다음-단계)
- 부록 A 채점 의미론 코어 · B Python 3.6 비호환 목록 · C 문제 YAML 예시 · D 문제 생성 스킬 골격 · E elice 화면 문구 사전 · F Pages 배포 워크플로 골격 · G 호환 실행 계층(재실행 입력) 알고리즘 · H base 경로·서비스워커·저장소 네임스페이스 코드 골격

---

## 0. 요약

**목표.** 시험장(elice testroom)과 같은 화면·실행·채점 경험을 주는 정적 웹사이트를 **GitHub Pages**에 배포한다. 강의자료(b_02~b_07)에서 뽑아 **자동 검증까지 마친 문제를 중간고사 전 350문항 이상** 확보해 연습한다. 같은 구조를 기말고사(NumPy·Pandas·Matplotlib)까지 그대로 확장한다.

### 0.1 직접 확인한 사실 (설계의 근거)

| # | 발견 (2026-10-08 elice 6주차 실습에서 확인) | 설계 반영 |
|---|---|---|
| F1 | elice 실행 환경은 **Python 3.6.0** (GCC 5.4.0, 2018 빌드). 빈 사전문제에서 `sys.version`을 출력해 확인 | 정답은 Python 3.6으로 검증, 사용자 코드에 **3.6 호환 검사기** 적용 |
| F2 | 채점 기대출력에서 `input('지구 몸무게: ')`는 `지구 몸무게: ⏎`로 기록된다. **프롬프트 뒤 공백까지 그대로 출력되고 줄이 바뀌며, 입력값은 출력되지 않는다.** 반면 Run 터미널에서는 입력값이 화면에 표시된다 | Run(대화형)과 Submit(채점)의 입력 처리 방식을 따로 재현. 6주차 만점 코드 4개로 PoC를 돌려 **4/4 바이트 단위 일치** |
| F3 | 제출 규칙 5개 공지(`:` 뒤 공백, `,` 뒤 공백, 대문자 시작, 문장부호 앞 공백 없음, `random.seed(1)`) | 공백까지 **정확히 일치해야 정답**으로 채점, 규칙 위반을 알려 주는 검사기(린트) 추가 |
| F4 | Submit 후 `Last submit score --`로 점수가 숨겨지고 `Last submit datetime`만 갱신 | 시험 모드에서 똑같이 숨김 → 시험 종료 후 리포트 공개 |
| F5 | 에디터 Monaco, 터미널 xterm.js. Run 중에는 버튼이 빨간 `Stop`으로 바뀌고 `Remaining: 02:06` 카운트다운이 뜬다(실행 제한 약 2분) | elice와 같은 라이브러리로 재현 |
| F6 | 안내문: "추가 문제는 수업 시간에 별도 풀이 X **(시험에는 출제될 수 있음)**" | 주차별 실습·추가문제 스타일을 출제 1순위로 삼음 |

### 0.2 GitHub Pages가 강제하는 조건 (확인 완료, 상세는 8장)

| 조건 | 확인 내용 | 대응 |
|---|---|---|
| 서버 없음, 정적 파일만 | 백엔드·DB·서버 채점 불가 | 실행·채점·저장을 **모두 브라우저에서** 처리(Pyodide + IndexedDB) |
| 응답 헤더를 바꿀 수 없음 | COOP/COEP를 못 넣으면 `SharedArrayBuffer`를 못 써서 `input()`을 블로킹할 수 없음 | `coi-serviceworker`로 헤더 주입(계층 A). 서비스워커가 막히면 **재실행 방식 입력**(계층 B)으로 자동 전환 |
| `cache-control: max-age=600` 고정 | 배포 후 최대 10분간 옛 파일이 섞일 수 있음 | 파일명 해시와 버전 경로, `manifest.json`은 항상 재검증, 새 버전 알림 |
| 프로젝트 사이트 경로 `https://<id>.github.io/<repo>/` | 절대경로 `/`를 쓰면 깨짐, 새로고침 시 SPA 라우트가 404 | `base` 경로 자동 주입, `HashRouter`, `404.html` |
| 같은 계정의 모든 프로젝트 사이트가 **origin 공유** | localStorage·IndexedDB·캐시·서비스워커 충돌 가능 | 모든 키에 저장소별 접두어, 서비스워커 scope를 `/<repo>/`로 한정 |
| 사이트는 항상 공개 | private 저장소여도 Pages URL은 공개 | 강의자료·elice 원문은 빌드에 절대 포함하지 않음(유출 검사), 검색 노출 차단(`noindex`) |
| 용량 1GB, 대역폭 월 100GB(soft), 배포 10분 타임아웃 | Pyodide 전체 배포판은 수백 MB | 필요한 패키지만 self-host(중간 ≈25MB, 기말 ≈85MB 추정) |
| 기존 사이트 모방은 **교육 목적 예외 조건**에서만 허용 | 직접 코드 작성, 사용자 데이터 미수집, **눈에 띄는 비제휴 고지** | elice 코드·에셋 미사용, 분석 도구 없음, 모든 페이지에 고지문 |

### 0.3 핵심 결정

- **GitHub Pages 정적 사이트** + 브라우저 안에서 Python 실행(Pyodide, Web Worker). GitHub Actions로 빌드·검증·배포한다
- **실행 계층 2단**: 계층 A(서비스워커로 교차 출처 격리 → SAB 블로킹 input + 인터럽트)를 기본으로 쓰고, 안 되면 계층 B(재실행 방식 입력 + 워커 재시작)로 자동 폴백한다. 채점은 두 계층에서 결과가 같다
- **콘텐츠는 데이터로 관리.** 문제 1개 = YAML 1개, 단원·모의고사 세트도 YAML. 단원을 추가할 때 코드를 고치지 않는다
- **기대출력은 사람이 쓰지 않는다.** 정답 코드를 elice 방식·Python 3.6으로 실행해 자동 생성한다
- 품질 게이트 13종(이중 정답, 오답 판별력, 출제 범위, 3.6 호환, 규칙 등)을 통과한 문제만 배포한다
- 모드는 두 가지: **연습 모드**(즉시 피드백·diff·힌트)와 **시험 모드**(elice처럼 결과 비공개, 종료 후 리포트)

### 0.4 일정 요약

10/8 **Pages 실배포 스파이크** → 10/9 MVP 공개 → 10/12 b02~b06 문제와 시험 모드 → 10/13~14 b_07(함수) → 10/15~19 실전 연습·보강 → 10/20 시험

---

## 1. 현황 분석

### 1.1 시험 · 수업 정보

| 항목 | 내용 | 출처 |
|---|---|---|
| 중간고사 | 10/20(화) 수업시간, 컴퓨터실, elice | b_01 |
| 기말고사 | 12/08(화) 수업시간 | b_01 |
| 응시 경로 | myetl.snu.ac.kr → 과목 → 코딩수업 → `코딩수업 바로가기` → testroom.elice.io | eTL·elice 확인 |
| 수업 구조 | 화: 이론(b_xx.ipynb), 목: 실습(elice 주차별 테스트 = 사전문제 4 + 본문제 5 + 추가문제) | eTL·elice |
| 이후 진도 | 함수(b_07, 10/13) → NumPy · Pandas · Matplotlib (기말) | b_01 강의 목표 |
| **미확인** | 시험 시간(분), 문항 수, 부분점수 방식, 숨은 테스트 수 | 모두 **설정값으로 분리**(기본: 75분·5문항·테스트 비율 점수) |

### 1.2 강의자료 분석 → 출제 범위 지도

| 노트북 | 주제 | 핵심 개념 | 실습 / 오늘의 문제 | 시험 함정 포인트 |
|---|---|---|---|---|
| b_01 | 강의소개·컴퓨터/프로그래밍 개념·Colab·마크다운 | 입력→처리→출력, HW/SW, 이진수, 컴파일러 vs 인터프리터, 파이썬 특징 | – | 코딩 출제 가능성 낮음 → 개념 퀴즈 소량 |
| b_02 | 기본 문법·자료형·연산·입출력 | 주석, 들여쓰기(IndentationError), print 여러 값(공백 자동), `type()`, int/float/str/bool, 지수·8진·16진 표기, `0.1+0.2` 오차와 `math.fabs(x-y) < 1e-9`, f-string, `+ - * / // % **`, 문자열 `+`·`*`, `int()/float()/str()`, 우선순위, 변수 규칙, 다중·복합 할당, `input()`은 문자열, `split()`, `map(int, ...)` | 사칙연산, 몫·나머지(`divmod`), 변수 만들기, 두 수 합 / **삼각형 넓이(실수)** | `5.5 // 2 == 2.0`, `/`는 항상 float, input 형변환 누락, 정의 전 `+=` → NameError, `print("a", b)` 자동 공백 |
| b_03 | 조건문 | Falsy 값, 비교 연산(문자열 사전순), `not > and > or` 우선순위, if/else/elif(배타), 중첩 if, `random.randint` | 놀이기구 조건식, 짝홀, 학점, 수영장(다중 if vs elif) / **주사위 두 개** | 경계값(90 "이상"), elif 순서, 여러 항목 동시 출력은 독립 if, `random.seed(1)` |
| b_04 | 반복문 | `range(start, end, step)`·감소 range, 누적합, 시퀀스 순회, `reversed`, while(초기·조건·변화식), 무한루프 + break, 센티넬, continue, pass, 중첩 루프 | 구구단, n번 반복, 무한루프 조건값, 5×5 별 / **계단 별** | range 끝값 미포함, `end=' '`와 `print()` 줄바꿈, while 변화식 누락 |
| b_05 | 리스트·튜플 | 생성·`list(range)`, 튜플 불변·`(x,)`, 언패킹, 인덱싱·`len`, 메서드(append/insert/extend/pop/remove/index/count/reverse/sort/copy/clear), `sorted`, `in`, 할당 vs copy·`is`, 슬라이싱(step, `[::-1]`, 슬라이스 대입), 컴프리헨션, `map`, 2차원 리스트, `deepcopy` | 3의 배수 리스트, 중복 제거, 역순 슬라이싱 / **쇼핑몰 재고 관리(2D)** | `sort()`는 None 반환, 없는 값 remove → ValueError, `b = a` 별칭, 2D copy 함정, `1200 * 1.1 → 1320.0` |
| b_06 | 딕셔너리·집합·문자열 | dict 생성(리터럴·`dict()`·튜플 리스트·`zip`), KeyError vs `get`(기본값), `in`, 수정·추가·`del`·`len`, items/keys/values, setdefault vs update, pop/popitem/clear, fromkeys; set(중복 X, 순서 X, 인덱싱 X, `{}`는 dict), `\| & - ^ <= < == isdisjoint`, add/remove/discard/pop; 문자열 replace/maketrans·translate/split/join/upper/lower/strip/find/index/count, `string` 상수, `Counter`(참고), `sorted(key=, reverse=)` | 평균 점수, 수도 찾기(추가·수정), 공배수(교집합), 주문 데이터 정리 / 단어 빈도(참고), Turtle(**시험 출제 X** 명시) | get 기본값, 누적 카운트 패턴, strip 위치, set 출력 순서, 빈 집합은 `set()` |
| b_07 | (10/13 예정) 함수 | 예상: def, 매개변수·반환값, 기본값·키워드 인자, 여러 값 반환, 지역·전역, 가변 객체 전달, 함수를 key로 전달 | – | 수업 후 추출해 반영 |

**elice 6주차 실습 구성(관찰).** 주제만 요약했고, 원문은 비공개 `materials/elice/`에 보관한다.

| 구분 | 문제 주제 | 형식 | 핵심 개념 |
|---|---|---|---|
| 사전 1~4 | 입력→딕셔너리, 가격 계산기, 출석 인원(set), 대·소문자 변환 | TestCase형(Input/Output Sample) | for+input, dict 조회·in, len(set), upper/lower |
| 본 1 | 행성별 몸무게 | 본문제형(예시 결과) | dict 순회, float 곱 출력 |
| 본 2 | 과목 점수 → 학점 | 본문제형 | 리스트 + dict + 조건문 |
| 본 3 | 혈액형 빈도 ('종료'까지) | 본문제형, 센티넬 | while True, dict 카운트, 잘못된 입력 처리 |
| 본 4 | 문자 빈도와 최빈 문자 | 본문제형 | `get` 카운트, 최댓값 탐색, dict 출력 |
| 본 5 | 태그 문자열 정리 | 본문제형 | strip/lower/split/replace/join |
| 추가 1-1, 1-2 | 분기 매출 합계·필터 | 고정 데이터(입력 없음) | dict of list, sum, 조건 필터 |
| 추가 2 | 단어 빈도 | 고정 데이터 | replace, split, get, title |
| 추가 3 | 좋아하는 색 빈도 ('종료'까지) | 본문제형, 센티넬 | split(','), strip, lower, dict |

→ 시험 스타일 추정: **입력 반복(센티넬) + dict 카운트 + 문자열 정제 + 형식 출력**의 종합형이 핵심이다.

### 1.3 elice testroom 화면·동작 관찰

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ →|  6주차 실습 / 1번 문제                         ⓘ Test Information   [End Test] │ 상단바(다크)
├────┬────────────────────────┬──────────────────────────────────────────────────────┤
│ 1  │ 1번 문제 (h1)          │ 📁 │ main.py ×                          📎  ⟳  ⋮    │ 파일트리·탭·첨부·초기화
│ 2  │ 설명(마크다운)          │  1  gravity = {...}                                  │
│ …  │ ┌코드블록──────Copy┐   │  2                                                   │ Monaco(다크)
│ 5  │ └──────────────────┘   │  3  weight = int(input('지구 몸무게: '))              │
│Submit 예시 결과             │                                                      │
│ 6  │ Input   [100   Copy]   ├──────────────────────────────────────────────────────┤
│Submit Output [지구 몸무게:  │ [Run] [Submit]  Last submit score  │ Last submit     │ 실행 바
│ …  │         수성: 37.8 …]  │                 --                 │ datetime …  ●Editor connected
│ 12 │  (흰 배경)              │ /* Code has not run yet. */                          │ xterm 터미널
├────┴────────────────────────┴──────────────────────────────────────────────────────┤
│                         [‹ PREVIOUS]    5 / 13    [NEXT ›]                         │ 하단 내비
└──────────────────────────────────────────────────────────────────────────────────┘
```

| 영역 | 관찰 내용 | 사이트 반영 |
|---|---|---|
| 문제 사이드바 | 1~N 번호. 제출한 문제는 번호 아래 `Submit` 표시, 현재 문제 강조 | 동일 |
| 문제 패널 | 흰 배경. **형식 A**(본문제): `예시 결과 → Input / Output`. **형식 B**(사전문제): `TestCase → Test Case-n → Input Sample / Output Sample`. **형식 C**(추가문제): 입력 없음, 고정 데이터 코드블록 + `예시 결과`. 입력은 줄마다 박스 + `Copy` | 세 형식 모두 렌더러 지원 |
| 에디터 | Monaco 다크, 탭 `main.py`, 파일트리(`data/`, `elice.png`, `elice_utils.py`, `main.py`), 첨부·초기화·더보기 아이콘 | Monaco + 가상 파일트리 |
| 시작 코드 | 고정 데이터 + `##############################` 구분선, 그 아래에 작성 | 스키마의 `starter` |
| Run | 버튼이 빨간 `Stop`으로 바뀜, `Remaining: 02:06` 카운트다운, **대화형 터미널**: 프롬프트 뒤 입력 대기, 입력값 에코 | 동일 |
| 터미널 문구 | `/* Code has not run yet. */` → `/* Code is running... */` → 출력 → `/* Code running is complete! */` | 문구 그대로 |
| Submit | `Last submit datetime` 갱신, `Last submit score`는 `--` | 시험 모드 동일 |
| Test Information | 우측 드로어: Test period, Timeout, number of problems, 안내문, **제출 규칙 5개** | 동일(규칙 패널) |
| 런타임 | `3.6.0 (default, Jul 4 2018, 18:07:29) [GCC 5.4.0 20160609]` | 3.6 호환 대책(3.5절) |
| 연결 상태 | `● Editor connected` / `Connecting to editor...` (서버 측 실행·코드 동기화) | 서버가 없으므로 로컬 자동저장으로 대체 |

**제출 규칙 원문 (Test Information)**
1. `:` 뒤 한 칸 공백 (e.g. `input("Hi: ")`, `print("Hi:", a)`, `print(f"Hi: {a}")`)
2. 출력 시 `,` 뒤 한 칸 공백
3. 모든 문장은 대문자로 시작, 그 외에는 소문자
4. 문장 끝 기호(`.`, `!` 등) 앞에는 공백 없음
5. random 모듈 사용 시 seed를 1로 고정: `random.seed(1)`

### 1.4 채점 의미론 검증 (PoC, 2026-10-08)

- elice 화면의 기대출력 DOM을 분석했다. 첫 줄은 `"지구 몸무게: "`(끝 공백 포함)이고 바로 `<br>`가 이어진다. 즉 **프롬프트 → 줄바꿈**이며 입력값 `100`은 없다.
- PoC 러너(부록 A)는 `input(p)`가 p를 쓰고, 한 줄을 읽고, `'\n'`을 쓰도록 만들었다. 출력은 끝 줄바꿈만 무시하고 정확히 비교한다.
- 6주차 만점 코드 4개(행성 몸무게·혈액형·문자 빈도·태그 정리)를 elice 예시 입력으로 실행했다. 결과는 **4/4 PASS**다(프롬프트 끝 공백까지 일치). 회귀 스크립트: `materials/elice/week06_regression.py`(비공개)
- 아직 모르는 부분(줄 끝 공백 허용 여부, 부분점수, 시간 제한)은 `content/config.yaml`의 설정으로 분리한다. 사이트는 **elice와 같거나 더 엄격하게** 채점한다. 사이트를 통과하면 시험장에서도 통과하게 하기 위해서다.

---

## 2. 요구사항

### 2.1 기능 요구 (MoSCoW)

**Must (중간고사 전 필수)**
- M1 elice 레이아웃 재현 풀이 화면: 문제 패널, Monaco, xterm, Run/Submit, Last submit, Test Information, 번호 사이드바, PREVIOUS/NEXT
- M2 브라우저 Python 실행: 대화형 `input()`(한글 포함), Stop, 실행 제한 시간, traceback 표시 — **GitHub Pages에서 계층 A/B 모두 동작**
- M3 elice 채점 의미론 + 정확 일치 비교 + 숨은 테스트
- M4 연습 모드: 테스트별 판정, 공백 시각화 diff, 단계별 힌트, 해설
- M5 시험 모드: 세트 구성, 타이머, 점수 숨김, End Test, 결과 리포트
- M6 문제은행: 단원·태그·난이도·형식·상태 필터, 검색
- M7 Python 3.6 호환 경고 + 제출 규칙 린트
- M8 로컬 저장(코드 자동저장, 진도, 시험 기록) + 백업 내보내기·가져오기
- M9 문제 빌드·검증 파이프라인 + GitHub Actions + **GitHub Pages 자동 배포**
- M10 모든 페이지의 비제휴·교육 목적 고지문(GitHub Pages 정책 요건)

**Should**
- S1 대시보드(단원별 정답률, 취약 태그, D-day), 오답노트, 복습 큐(간격 반복)
- S2 단원별 개념 치트시트(시험 함정 모음 포함)
- S3 "정답과 비교 실행": 내가 만든 입력으로 내 출력과 정답 출력을 비교(정답 코드는 비공개)
- S4 파라미터화 변형 문제("같은 유형 다시 풀기")
- S5 문제 오류 신고 버튼(GitHub Issue 템플릿 링크)
- S6 자체 서비스워커로 캐싱 통합(재방문 즉시 로딩, 오프라인)

**Could**
- C1 개념 퀴즈(출력 예측, b_01 이론 객관식)
- C2 PWA 설치
- C3 모바일 읽기 전용 뷰(문제·치트시트)

**Won't (이번 범위 아님)**: 회원가입·서버 DB, 랭킹, AI 채팅, 사용 통계 수집(Pages 정책상 데이터 미수집 유지)

### 2.2 비기능 요구

| 항목 | 기준 |
|---|---|
| 호스팅 | **GitHub Pages 프로젝트 사이트**(`https://<id>.github.io/<repo>/`), 정적 파일만, 백엔드 0 |
| 헤더 독립성 | 커스텀 HTTP 헤더 없이 동작(COOP/COEP는 서비스워커가 주입, 실패하면 계층 B) |
| 용량 | 배포물 < 100MB(한도 1GB의 10%), 단일 파일 < 50MB |
| 성능 | 첫 방문 전송 ≈ 15MB 이내, 재방문 시 캐시 사용, 워커 프리로드 후 Run 시작 < 1초, 채점 1문제(테스트 6개) < 2초 |
| 브라우저 | 크롬 최신(컴퓨터실) 최우선, Edge·Safari·Firefox 동작(서비스워커가 없는 사생활 보호 창 포함 → 계층 B) |
| 한글 | 터미널에서 `사과`, `종료` 등 IME 조합 입력이 정상 동작 |
| 유지보수 | 문제 추가·수정은 YAML만, 앱 코드 수정 불필요 |
| 안전·개인정보 | 사용자 코드는 브라우저 샌드박스(WASM + Worker) 안에서만 실행, 외부 전송·분석 도구 없음 |
| 일관성 | 채점 의미론 파일 1개를 CI(Python 3.6)와 브라우저(Pyodide)가 **공유** |

---

## 3. 시스템 아키텍처

### 3.1 구조도

```
                         GitHub 저장소 (content/ tools/ web/ docs/)
  content/*.yaml ─────► GitHub Actions
  (문제·단원·세트)        ├─ tools/build.py: python:3.6 컨테이너로 정답 실행 → 기대출력, 품질 게이트 V1~V13
                         ├─ Pyodide(고정 버전) 필요한 파일만 내려받기
                         ├─ vite build (base=/<repo>/)  → web/dist
                         ├─ 유출 검사(materials·ipynb 없음)
                         └─ upload-pages-artifact → deploy-pages → 실서버 스모크 테스트
                                                          │
                                   https://<id>.github.io/<repo>/  (cache-control: max-age=600)
                                                          │
 ┌────────────────────────────────── 브라우저 ─────────────┴──────────────────────────────┐
 │ index.html ─► coi-serviceworker.js (scope /<repo>/): COOP/COEP 주입 → crossOriginIsolated │
 │ React UI (HashRouter, elice 레이아웃)                                                   │
 │  ├─ ProblemPanel (마크다운, Copy)                                                       │
 │  ├─ Monaco Editor ──자동저장──► IndexedDB `<ns>-db` (코드·진도·시험기록)                  │
 │  ├─ xterm Terminal ◄──── stdout/stderr ──────┐                                         │
 │  └─ Run / Submit ───► RunnerClient ───postMessage───┐                                  │
 │                                                     ▼                                  │
 │                     Web Worker: Pyodide (same-origin self-host)                         │
 │                       ├ 계층 A: input() → SAB + Atomics 대기, interrupt buffer로 Stop   │
 │                       ├ 계층 B: input 큐 소진 → 재실행 방식, Stop은 워커 재시작          │
 │                       ├ grade : stdin 주입, input은 프롬프트+'\n' (A·B 동일)             │
 │                       └ check : compat36 · 규칙 린트 · 구조 요구 검사                    │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 기술 스택 (권장안)

| 영역 | 선택 | 이유 |
|---|---|---|
| 빌드·프레임워크 | Vite + React 18 + TypeScript | Monaco·xterm 래퍼 생태계, 정적 빌드, `base` 경로 지원 |
| 라우팅 | React Router `HashRouter` | Pages는 서버 rewrite가 없으므로 새로고침·딥링크에도 404가 나지 않음 |
| 스타일 | Tailwind CSS + CSS 변수(색상 토큰) | 빠른 구현, 다크·라이트 |
| 에디터 | Monaco (`monaco-editor` **번들 포함** + `@monaco-editor/react`) | elice와 동일. CDN 로더를 끄고 same-origin으로 제공(COEP 차단 방지) |
| 터미널 | xterm.js 5 (`@xterm/xterm`, `@xterm/addon-fit`) | elice와 동일. 한글 IME는 첫날 스파이크로 검증하고, 실패하면 자체 터미널로 교체 |
| Python | Pyodide 최신 안정판(버전 고정, **Pages에 self-host**) + Web Worker | 서버 없이 CPython 실행. 기말용 numpy/pandas/matplotlib 지원 |
| 교차 출처 격리 | `coi-serviceworker`(MVP) → 자체 `sw.js`로 캐싱과 통합(S6) | Pages에서 헤더를 못 바꾸는 문제의 표준 해법. 서비스워커는 scope당 1개뿐이라 캐싱은 같은 파일에 합쳐야 함 |
| 동기 input | 계층 A: SharedArrayBuffer + `Atomics.wait` / 계층 B: 재실행 방식 | 격리 여부와 관계없이 대화형 터미널 제공 |
| 지문 | react-markdown + remark-gfm (+ rehype-katex) + 자체 CodeBlock(Copy) | 세 가지 지문 형식 렌더링 |
| 저장 | IndexedDB(`idb-keyval`, 저장소별 DB 이름) + JSON 내보내기 | 서버 없이 진도 보존, 공유 origin 충돌 방지 |
| 상태 | Zustand | 단순함 |
| 폰트 | D2Coding(OFL) 또는 JetBrains Mono + Pretendard, **self-host**(서브셋) | 터미널 한글 폭 정렬, COEP 호환 |
| 문제 도구 | Python + uv + pydantic + pytest | 스키마 검증·실행·테스트 |
| 테스트 | Vitest(단위), Playwright(E2E, Pages 모사·실서버 스모크) | CI 자동화 |
| 배포 | GitHub Actions(`configure-pages` → `upload-pages-artifact` → `deploy-pages`) | Jekyll 없이 산출물만 배포, 푸시하면 자동 |

### 3.3 Python 실행 엔진 상세

**Worker 프로토콜**

```ts
// main → worker
type Req =
  | { kind: 'init'; packages?: string[]; tier: 'A' | 'B' }
  | { kind: 'run'; runId: string; code: string; files: FileMap; inputs?: string[] }  // B는 inputs로 재실행
  | { kind: 'grade'; runId: string; code: string; files: FileMap;
      tests: { stdin?: string; call?: string }[]; timeoutMs: number; checker: CheckerSpec }
  | { kind: 'check'; code: string; unit: string }                                     // compat36·린트
// worker → main
type Res =
  | { kind: 'ready'; tier: 'A' | 'B' }
  | { kind: 'stdout' | 'stderr'; runId: string; text: string }
  | { kind: 'input-request'; runId: string }                                          // A: 블록 중, B: 중단됨
  | { kind: 'done'; runId: string; status: 'ok' | 'error' | 'interrupted' | 'timeout' | 'need-input'; traceback?: string }
  | { kind: 'grade-result'; runId: string; results: TestResult[] }
  | { kind: 'check-result'; warnings: Warning[] }
```

**계층 판정.** 페이지 로드 때 `self.crossOriginIsolated === true`이면 계층 A, 아니면 계층 B를 쓴다. 화면 하단에 `실행 엔진: 표준(A) / 호환(B)`를 작게 표시한다.

**계층 A — 대화형 input (교차 출처 격리 성공 시)**
1. Python 측에서 `builtins.input`을 교체한다. 프롬프트를 stdout으로 내보내고(flush) JS 함수 `read_line()`을 호출한다
2. Worker는 `input-request`를 보낸 뒤 `Atomics.wait`로 블록한다
3. 메인 스레드의 xterm이 입력 모드로 바뀐다. 에코, 백스페이스(한글은 2칸 폭), Enter, Ctrl+C를 처리하고, **여러 줄을 붙여넣으면 줄 단위로 큐에 쌓는다**
4. Enter를 누르면 UTF-8로 SAB에 쓰고 `Atomics.notify` → Worker가 깨어나 문자열을 반환한다
5. Stop·시간 제한은 `pyodide.setInterruptBuffer(new Uint8Array(new SharedArrayBuffer(1)))`로 처리한다. 2(SIGINT)를 기록하면 `KeyboardInterrupt`가 발생한다. 입력 대기 중이면 플래그로 깨운다. 응답이 없으면 워커를 재시작한다

**계층 B — 재실행 방식 input (서비스워커 차단·사생활 보호 창·첫 로드 등)**
1. 입력 큐를 비운 채 실행한다. `input()`이 호출됐는데 큐가 비어 있으면 `NeedInput`(BaseException 하위)으로 실행을 멈춘다
2. 그때까지의 출력과 프롬프트를 터미널에 보여 주고 사용자 입력을 받는다(에코는 터미널이 처리)
3. 입력을 큐에 넣고 **처음부터 다시 실행**한다. 이미 보여 준 출력은 건너뛰고 새 출력만 이어서 쓴다(부록 G)
4. 결정성 확보: 실행할 때마다 `random`을 같은 세션 시드로 먼저 시드한다(사용자의 `random.seed(1)`이 있으면 그 값이 우선)
5. Stop·시간 제한은 `worker.terminate()` 후 재생성한다(캐시 덕분에 1~2초)

이 학습 범위의 프로그램은 짧고 결정적이라 재실행 비용은 수 ms 수준이다. 출력 접두부가 달라지면(시간·무작위 의존) 터미널에 `(다시 실행됨)`을 표시하고 전체 출력을 다시 그린다.

**공통**
- Run 제한은 elice처럼 `Remaining` 카운트다운(기본 120초)으로 둔다. 출력 상한(기본 1MB)으로 무한 print를 막는다
- 격리: 매 실행마다 새 전역 네임스페이스를 쓰고, 사용자 모듈을 언로드하고, `random`을 재시드하고, 문제 파일을 다시 마운트한다
- 성능: 홈 진입 시 워커를 프리로드한다. 채점용 워커를 따로 둬서 Run과 Submit이 서로 막히지 않게 한다
- **채점은 입력이 미리 정해져 있으므로 대화형이 필요 없다.** 계층 A와 B의 판정 결과가 같고, 다른 점은 시간 초과 처리(A: 인터럽트 / B: 워커 재시작 후 다음 테스트 계속)뿐이다

### 3.4 elice 채점 의미론 재현

```
Run (대화형) : input(p) → 터미널에 p 표시 → 사용자 입력(에코) → Enter(줄바꿈)
Submit (채점): input(p) → stdout에 p 기록 → stdin 한 줄 소비(에코 없음) → '\n' 기록
               stdin 고갈 → EOFError('EOF when reading a line')  # CPython과 동일
비교          : CRLF→LF, 양쪽 모두 '끝의 줄바꿈'만 제거 → 문자열 완전 일치
판정(연습)    : PASS / 줄끝공백차이 / 공백·줄바꿈차이 / 대소문자차이 / 출력불일치
                / 런타임에러 / 시간초과 / 3.6 문법오류
점수          : 문제당 100 × (통과 테스트 수 / 전체)   # all-or-nothing은 설정으로 전환
```

- 기대출력은 빌드할 때 정답 코드를 **같은 의미론**으로, CI의 **Python 3.6 컨테이너**에서 실행해 만든다
- 의미론은 `content/config.yaml`에 설정으로 둔다. 다른 사실이 확인되면 한 줄만 고치면 된다
  ```yaml
  grading:
    prompt_newline: true        # input 프롬프트 뒤 '\n', 입력값 미출력
    ignore_final_newlines: true
    trailing_ws: strict         # strict | ignore
    score: per_test             # per_test | all_or_nothing
    compat36_syntax_zero: true  # 3.6 문법 위반 시 시험 리포트 0점(elice에선 SyntaxError)
  ```
- **회귀 테스트**: 사용자의 6주차 만점 코드와 elice 기대출력을 비공개 fixture로 둔다. 4/4 PASS가 항상 유지되어야 한다

### 3.5 Python 3.6 호환성 대책 (중요)

**위험.** 사이트(Pyodide, Python 3.12 이상)에서는 돌아가는데 시험장(3.6.0)에서는 SyntaxError나 AttributeError가 나는 경우다.
**PoC 결과.** 최신 파이썬의 `ast.parse(feature_version=(3,6))`는 `:=`, `match`, 위치 전용 인자는 잡아낸다. 하지만 **초보자가 가장 걸리기 쉬운 f-string 위반 3종은 통과시켜 버린다**: `f'{x=}'`, 중괄호 안 같은 따옴표, 중괄호 안 `\`. 따라서 전용 검사기가 필요하다.

3단계로 막는다.
1. **문제 빌드 (CI)**: 모든 정답·대체정답을 `python:3.6-slim` 컨테이너에서 실행한다(`actions/setup-python`은 최신 러너에서 3.6을 지원하지 않으므로 Docker 사용). 3.6에서 안 돌면 빌드가 실패한다. 기대출력도 3.6 결과로 만든다
2. **사용자 코드 검사기 `compat36.py`** (순수 Python, Pyodide에서 실행)
   - 문법: `ast.parse(feature_version=(3,6))` → `:=`, `/` 위치 전용 인자, `match` 등
   - **f-string 토큰 검사**(3.12+ tokenizer의 FSTRING_* 토큰 분석): `{x=}`, 중괄호 안 같은 따옴표 재사용, 중괄호 안 `\`, 중괄호 안 `#` 주석, 여러 줄 표현식
   - API: `str.removeprefix/removesuffix`(3.9), `str.isascii`(3.7), `math.prod/isqrt/comb/perm/dist`(3.8), `math.lcm`(3.9), `statistics.fmean`(3.8), `int.bit_count`(3.10), `zip(strict=)`(3.10), `itertools.pairwise`(3.10), `dict | dict`(3.9, 휴리스틱), `reversed(dict)`(3.8), `breakpoint()`(3.7), `dataclasses`(3.7). 전체 목록은 부록 B
3. **UI**: Run이나 Submit 때 경고 배지를 띄운다. 예: `⚠ elice(Python 3.6)에서는 오류: f-string 중괄호 안에 같은 따옴표`. 클릭하면 해당 줄을 하이라이트한다. 시험 리포트에서 **문법 위반은 0점**(elice라면 SyntaxError), API 위반은 경고로 처리한다

**동작 차이 정리**

| 항목 | 3.6 vs 사이트 | 대응 |
|---|---|---|
| dict 순서 | 3.6 CPython도 구현상 삽입 순서를 유지 → 출력 같음 | – |
| 문자열 set 출력 순서 | 실행할 때마다 달라짐(해시 무작위화) | 문제에서 **set을 그대로 출력하지 않기**(정렬 후 출력) |
| 오류 메시지 | 3.10 이상은 "Did you mean…" 등이 추가됨 | 채점 대상 아님(stderr). 안내만 |
| `random.seed(1)` 결과 | 같은 Mersenne Twister → randint/choice 동일 | V12 교차 검증으로 확인 |

**구현 규칙.** `tools/runner/elice_semantics.py`, `compat36.py`, `lint_rules.py`는 CI(3.6)와 Pyodide에서 함께 실행된다. 그래서 **3.6 문법으로 작성**한다(walrus·dataclasses·f-string `=` 금지).

### 3.6 저장 데이터 모델 (IndexedDB)

```ts
// 모든 이름에 저장소별 네임스페이스 NS(예: 'pyexamlab')를 붙인다 — <id>.github.io의 다른 프로젝트 사이트와 origin 공유
drafts:   { [problemId]: { code: string; updatedAt: number } }            // elice처럼 자동 저장
attempts: { id; problemId; problemVersion; mode: 'practice'|'exam'; code; results; score;
            warnings: { compat36: Warning[]; rules: Warning[] }; createdAt }
progress: { [problemId]: { status: 'untried'|'tried'|'solved'; bestScore; tries; lastAt;
            wrongCount; nextReviewAt } }                                  // 간격 반복
exams:    { id; setId; seed; startedAt; endedAt; timeLimitMin;
            items: { problemId; lastSubmitCode; lastSubmitAt; runs; submits }[]; report }
settings: { schemaVersion; fontSize; theme; runLimitSec; examDate: '2026-10-20';
            showTimerInExam; hintPolicy }
```
- 모든 데이터를 JSON 1개로 내보내고 가져올 수 있게 한다. 컴퓨터실과 집 사이를 옮기거나, **나중에 커스텀 도메인으로 바꿔 origin이 달라졌을 때** 데이터를 옮기는 유일한 방법이다. `schemaVersion`으로 마이그레이션한다
- 시험 진행 상태는 매 Submit·10초마다 저장한다. 새로고침(서비스워커 업데이트 등)이 나도 시험이 이어진다
- 문제 `version`이 바뀌면 기록에 표시된다(예전 버전 기록은 그대로 보존)

### 3.7 정적 사이트의 한계와 처리

- 숨은 테스트와 정답도 결국 JSON으로 공개 배포되므로 개발자도구로는 볼 수 있다. **개인 학습용이라 수용**한다. 스포일러를 막기 위해 base64로 감싸고, 시험 모드 중에는 UI에서 접근을 차단한다
- 서버 시간이 없으므로 타이머는 클라이언트 시간 기준이다(자기 연습용이라 문제없음)
- 신고·피드백은 서버 대신 GitHub Issue 링크로 받는다. 코드는 URL에 넣지 않고 클립보드 복사로 안내한다(URL 길이 제한)

---

## 4. 문제 데이터 설계

### 4.1 분류 체계

| 축 | 값 | 설명 |
|---|---|---|
| 채점 방식 `grader` | `stdio`(기본) / `function`(b_07~) / `script`(기말) | 표준입출력 비교 / 함수 호출 반환값 비교 / 네임스페이스·파일·그래프 검사 |
| 문제 형식 `format` | `write` / `fill` / `debug` / `predict` / `quiz` | 완전 작성 / 빈칸(`_____`, 강의 노트북 스타일) / 버그 수정 / 출력 예측 / 객관식·단답 |
| 지문 스타일 `style` | `elice-main` / `elice-pre` / `elice-extra` | 예시 결과 Input/Output / TestCase-n Sample / 입력 없음 고정 데이터 |
| 난이도 | ★1~★5 | ★1 문법 1개 · ★2 개념 2개 조합 · **★3 elice 본문제 수준** · ★4 추가문제 수준(여러 단원) · ★5 고난도 |
| 태그 | 표준 어휘 | 예: `io.input-cast`, `io.fstring-format`, `op.floordiv`, `cond.elif-order`, `loop.while-sentinel`, `list.slice`, `dict.count-get`, `str.clean-pipeline`, `set.ops`, `func.return-multi` |

태그는 대시보드의 취약점 분석, 치트시트 연결, 모의고사 구성의 기준이 된다.

### 4.2 문제 YAML 스키마 (v1)

```yaml
id: b06-dict-count-007              # <단원>-<주제>-<3자리>, 불변
version: 1                          # 내용이 바뀌면 +1
title: 혈액형 빈도수 세기
unit: b06                           # content/units/b06.yaml
requires: [b04, b06]                # 선행 단원(범위 검사용)
tags: [loop.while-sentinel, dict.count-get]
difficulty: 3
grader: stdio
format: write
style: elice-main
statement: |                        # 마크다운 (외부 이미지 링크 금지 → 이미지는 저장소에 포함)
  혈액형을 '종료'가 입력될 때까지 반복해서 입력받아 ...
  - 프롬프트: `혈액형(A, B, O, AB) 또는 종료: `
  - 목록에 없는 값이면 `잘못 입력했습니다` 출력
  ...
starter: |
  blood = {'A': 0, 'B': 0, 'O': 0, 'AB': 0}
  ##############################
solution: |                         # 3.6 호환 + 규칙 준수 (기대출력의 원천)
  ...
alt_solutions:                      # 다른 접근으로 독립 작성 → 교차 검증
  - |
    ...
mutants:                            # 흔한 오답 → 숨은 테스트 중 하나는 반드시 틀려야 함
  - name: 잘못된 입력 메시지 누락
    code: |
      ...
tests:                              # expected는 빌드가 자동 생성 (직접 쓰지 않음)
  - stdin: "B\nA\nO\nBA\nAB\nB\n종료\n"
    public: true                    # 지문의 '예시 결과'로 노출
  - stdin: "종료\n"                  # 경계: 즉시 종료
    note: 아무것도 입력하지 않음
  - stdin: "AB\nab\nAB\n종료\n"      # 대소문자
  - generator: gen_blood_random     # (선택) 빌드 시 입력 N개 생성
    count: 3
requirements:                       # (선택) 구조 요구 → 연습 모드 경고
  must_use: [while, dict]
hints:
  - 반복 횟수가 정해져 있지 않으니 `while True` + `break`
  - "`in`으로 딕셔너리 키가 있는지 확인"
  - 뼈대 코드 …
explanation: |
  ...
checker: { type: exact }            # exact | tokens | float(abs_tol) | custom
limits: { time_ms: 2000 }
files: {}                           # 예) data/sales.csv (기말)
packages: []                        # 예) [numpy, pandas]
lecture_ref: [{ nb: b_06, cell: 33 }]
source: generated                   # generated | lecture-adapted | elice-style
```

- 빌드 결과 JSON에는 `tests[].expected`가 자동으로 채워진다
- `public: true` 테스트는 지문 하단 `예시 결과`(또는 `TestCase`)로 렌더링된다. Input은 줄마다 Copy 박스로, Output은 의미론대로 생성된 텍스트로 보여준다

### 4.3 단원 메타 (`content/units/b05.yaml`)

```yaml
id: b05
title: 리스트와 튜플
lecture: b_05(이론).ipynb           # materials/ (비공개, 배포 안 됨)
date: 2026-09-29
order: 5
concepts:
  - { tag: list.create,  name: 리스트 생성,       cells: [5, 6, 10] }
  - { tag: list.methods, name: 리스트 메서드,     cells: [27, 29, 33, 34, 37, 39, 41, 43] }
  - { tag: list.slice,   name: 슬라이싱,          cells: [52, 53, 54, 57] }
  - { tag: list.copy,    name: 할당과 복사,       cells: [51, 69] }
  - { tag: list.2d,      name: 2차원 리스트,      cells: [61, 63, 65, 66, 68, 71] }
allowed:                            # 이 단원까지 배운 문법(이전 단원 누적) → AST 범위 검사
  nodes: [For, While, If, Break, Continue, ListComp, Subscript, Slice, Tuple, ...]
  builtins: [print, input, int, float, str, len, range, list, tuple, sorted, sum, max, min,
             map, type, reversed, abs, round, divmod]
  methods: [append, insert, extend, pop, remove, index, count, reverse, sort, copy, clear,
            split, upper, lower]
  modules: [random, math, copy]
exam: { midterm: true, final: true }
```
- `allowed`는 누적 계산된다. 예를 들어 b03 문제의 정답이 리스트를 쓰면 빌드 경고가 뜬다
- `concepts`는 대시보드, 치트시트, 태그 필터, "관련 강의 위치" 링크에 재사용된다

### 4.4 모의고사 세트 (`content/exams/midterm-mock.yaml`)

```yaml
id: midterm-mock
title: 중간고사 모의고사
time_limit_min: 75                   # 실제 시험 시간 확인 후 수정
run_limit_sec: 120                   # elice Remaining 카운트다운
problem_count: 5
pick:                                # 랜덤 세트 규칙 (seed로 재현)
  - { units: [b02, b03], difficulty: [2, 3] }
  - { units: [b04],      difficulty: [3] }
  - { units: [b05],      difficulty: [3] }
  - { units: [b06],      difficulty: [3, 4] }
  - { units: [mixed],    difficulty: [4] }
fixed_sets:                          # 고정 세트 A~J (재응시·비교용)
  A: [b03-cond-012, b04-loop-031, b05-list-044, b06-dict-007, mixed-021]
rules_panel: elice-default           # Test Information에 규칙 5개
scoring: { per_test: true, compat36_syntax_zero: true }
```
b_07을 추가하면 `pick`에 `{ units: [b07], difficulty: [3] }`을 넣는다. 기말은 `final-mock.yaml` 파일 하나만 추가하면 된다.

### 4.5 ID · 버전 · 배포 형태
- 경로는 `content/problems/<unit>/<id>.yaml`, id는 `<unit>-<topic>-<NNN>`
- 내용을 수정하면 `version`을 올린다. 삭제하지 않고 `deprecated: true`로 남겨 기록을 보존한다
- 배포 시에는 단원별 번들 `data/units/<unit>.<hash>.json`(불변, 캐시 우선)과 목록 `data/manifest.json`(항상 재검증)으로 내보낸다(8.4)

---

## 5. 문제 생산 파이프라인 (방대한 양을 "검증된" 상태로)

### 5.1 입력 소스
1. **강의 노트북** b_02~b_07: 개념·예제·실습·오늘의 문제 → 단원 메타와 출제 포인트
2. **elice 주차별 실습**(2~7주차의 사전·본·추가 문제): **출제 스타일의 기준**. 사용자 계정의 Chrome에서 텍스트만 수집해 `materials/elice/`에 비공개로 보관한다(제출이나 코드 수정은 하지 않음)
3. elice 제출 규칙 5개 + Python 3.6 제약
4. **초보자 오답 카탈로그**: input 형변환 누락, `/` vs `//`, range 끝값 off-by-one, 들여쓰기, `=` vs `==`, 없는 값 remove, dict KeyError, `{}`를 빈 집합으로 착각, 얕은 복사, `sort()` 반환값 사용, print 구분자 공백, f-string 포맷, 센티넬을 카운트에 포함시킴 등 → 뮤턴트(오답 코드)를 만드는 재료

### 5.2 단원별 출제 계획 (중간고사 목표: 코딩 ≈ 315 + 퀴즈 ≈ 60, 10/18까지 +50 보강)

| 단원 | 핵심 출제 축 | ★1–2 | ★3 | ★4–5 | 계 |
|---|---|---:|---:|---:|---:|
| b02 | 입력 형변환·산술(`//`, `%`, `**`)·f-string 포맷·실수 오차·split/map | 20 | 12 | 3 | 35 |
| b03 | 비교·논리 우선순위, elif 배타 조건, 중첩 vs 다중 if, 경계값, `random.seed(1)` | 18 | 15 | 7 | 40 |
| b04 | range 변형, 누적, while 센티넬('종료'), break/continue, 중첩 루프·별, 약수·소수·자릿수 | 20 | 20 | 10 | 50 |
| b05 | 메서드, 슬라이싱, 중복 제거, 복사 함정, 컴프리헨션, 2차원 리스트(재고·성적) | 20 | 20 | 10 | 50 |
| b06 | 빈도수(`get`), 문자열 정제(strip/lower/split/replace/join), set 연산, dict 검색·수정, 정렬 출력 | 20 | 25 | 15 | 60 |
| b07 | 함수 정의·반환·기본값·여러 값 반환·가변 인자·key 함수 | 15 | 15 | 10 | 40 |
| mixed | **elice 본문제·추가문제형 종합**(입력 반복 + dict + 문자열) | – | 20 | 20 | 40 |
| quiz | 출력 예측·b_01 이론(단답·객관식) | | | | 60 |

**단원별 문제 씨앗 (생성 지시에 사용)**

- **b02**: 두 정수 사칙연산 형식 출력(`a + b = c`) · 초→시:분:초 · 거스름돈 지폐 장수 · 섭씨↔화씨(`:.1f`) · 삼각형/사다리꼴/원 넓이(`:.2f`) · 세 과목 평균 · 세 자리 수 자릿수 합 · 문자열 `*` 구분선 · `divmod` 활용 · `0.1+0.2` 비교 · [debug] 두 입력을 더했더니 `1020`이 나오는 코드 · [predict] `5.5//2`, `-7//2`, `-7%2`, `int(4.9)`
- **b03**: 홀짝(`f"{n}: 짝수"`) · 학점(경계 90/89/70/69 테스트) · 양수/음수/0(중첩 if) · 놀이기구 탑승 조건(and/or) · 이용 가능 시설 전부 출력(다중 if) · 자판기 메뉴 · 윤년 · 세 수 최댓값(max 금지) · 나이·요일별 요금 · 주사위 게임 `seed(1)` · 가위바위보 · BMI 등급 · [predict] `not True or False and not False`
- **b04**: 구구단(N단, 범위, 역순) · 1~N 합·짝수 합(step)·감소 range · 약수·소수·완전수 · 자릿수 합(while) · '종료'까지 입력받아 합·평균·최댓값 · 업다운 숫자 맞추기(`seed(1)`) · 3이 나올 때까지 주사위 횟수 · continue로 3의 배수 제외(`end=' '`) · 별(직각, 역삼각, 오른쪽 정렬, 피라미드, ★4 다이아몬드) · 문자열 뒤집기 · 모음 개수 · 팩토리얼·피보나치 · [predict] `range(10, 0, -3)`
- **b05**: N개 정수 입력 후 최대·최소·평균 직접 구현 · 3의 배수 리스트 · 순서 유지 중복 제거 · 리스트 회전(슬라이싱) · `[::-1]` · 컴프리헨션 필터·변환 · sort vs sorted · 특정 값의 모든 인덱스 · 2D 성적표(합·평균·최고점 학생) · 2D 재고(추가·필터·가격 인상) · 행렬 합·전치 · 튜플 언패킹 swap · [debug] 없는 값 remove · [predict] `b = a; b[0] = 9`
- **b06**: 문자 빈도와 최빈 문자 · 단어 빈도(구두점 제거, lower, title 출력) · '종료'까지 입력받는 빈도(혈액형·색·투표) · 국가-수도 검색·추가·수정(get/update) · 점수 dict → 학점 dict · dict of list 매출 합계·필터 · 주문 데이터 누적 · 태그 정제 파이프라인 · 공배수(`&`) · 두 반 수강생 비교(`-`, `^`) · 출석 중복 제거(`len(set)`) · 전화번호부 메뉴(추가·검색·삭제·종료) · 문자 치환(maketrans) · 이메일 아이디·도메인 분리(find/split) · 정렬 출력(`sorted(d.items(), key=...)`) · [predict] `type({})`, `get` 기본값
- **b07(예상)**: 사칙연산 함수 · `is_prime(n)` + 범위 소수 · 리스트 통계 함수(여러 값 반환) · 기본 인자 · 학점 변환 함수 + dict · 단어 빈도 함수 · [predict] 지역/전역 변수 · [predict] 함수 안에서 리스트 수정 · key 함수 직접 정의 · `function` 채점(숨은 테스트가 함수를 직접 호출)
- **mixed(시험형)**: 메뉴 주문(dict 메뉴판 + 반복 입력 + 합계 + 없는 메뉴) · 성적 관리('종료'까지 이름·점수 → 평균·최고점·학점 분포) · 단어장 퀴즈(`seed(1)`) · 로그 분석(split·빈도·정렬) · 장바구니(2D list + dict) · 투표 집계(동률 처리)

### 5.3 생성 워크플로 (Claude Code 반복 배치)

```
① extract   uv run tools/extract_notebook.py b_07
            → content/units/b07.draft.yaml
              (셀 목록, 코드 예제, '실습'·'오늘의 문제', 빈칸 위치, 사용 문법 → allowed 초안)
② review    개념 목록·허용 문법 확인 (사람, 5분)
③ generate  /make-problems b07 --count 20 --difficulty 1-3
            입력: 단원 메타, docs/AUTHORING.md, 기존 문제 제목·태그(중복 회피), elice 스타일 샘플
            출력: YAML 20개 (정답 + 대체정답 + 뮤턴트 2~3 + 테스트 5~8 + 힌트 + 해설)
④ verify    uv run tools/build.py --unit b07  → 품질 게이트 V1~V13 → 실패 리포트
⑤ fix       실패 항목만 수정 → 재검증 (전부 통과할 때까지)
⑥ blind     서브에이전트가 '지문 + 공개 예시만' 보고 독립 풀이 → 숨은 테스트 전부 통과해야 함
⑦ ship      PR → Actions(3.6 컨테이너) 통과 → main 머지 → Pages 자동 배포(약 3~5분)
⑧ feedback  사용자가 풀다가 🚩 신고 → Issue → 수정 배치
```
처리량: 배치당 20문제, 생성부터 검증까지 한 사이클에 약 20~40분 → **하루 100문제 이상** 가능하다.

### 5.4 품질 게이트 (빌드 실패 조건)

| # | 검사 | 방법 | 목적 |
|---|---|---|---|
| V1 | 스키마 | pydantic | 필드 누락·오타 |
| V2 | 3.6 실행 | `python:3.6-slim` 컨테이너에서 solution·alt 실행 | 시험장 호환 |
| V3 | 기대출력 생성 | elice 의미론 러너로 실행해 `expected` 기록 | 손으로 쓴 오답 방지 |
| V4 | 결정성 | 같은 입력으로 3회(PYTHONHASHSEED 변경) 실행 시 동일 | set 출력·시드 누락 탐지 |
| V5 | 이중 정답 | alt_solutions 출력이 모든 테스트에서 solution과 일치 | 지문 모호성·정답 버그 |
| V6 | 판별력 | 각 mutant가 숨은 테스트 1개 이상에서 실패 | 약한 테스트 탐지 |
| V7 | 범위 | 정답 AST가 단원 `allowed`(누적) 안에 있음 | 안 배운 문법 요구 금지 |
| V8 | 규칙 린트 | `: ` / `, ` / 문장부호 앞 공백 / `seed(1)` | 정답이 elice 규칙 준수 |
| V9 | 지문-출력 일치 | 정답이 출력하는 문자열 리터럴이 지문이나 공개 예시에 등장 | 숨은 형식 요구 금지 |
| V10 | 테스트 구성 | 공개 1개 이상, 숨김 3개 이상, 경계·특수 케이스 note 포함 | 품질 |
| V11 | 중복·외부 링크 | 지문 정규화 trigram 유사도 0.85 이상 경고, 외부 이미지 URL 금지(COEP·저작권) | 다양성, Pages 호환 |
| V12 | Pyodide 교차 | Node + Pyodide(배포와 같은 버전)에서 기대출력 재현(전수) | 브라우저 런타임 차이 탐지 |
| V13 | 실행 시간 | 정답 실행이 제한의 1/10 미만 | 시간 초과 오판 방지 |

`blind`(5.3의 ⑥)는 배치 단위로 실행한다. 이 단계에서 **지문만으로 출력이 완전히 결정되는지** 마지막으로 확인한다.

### 5.5 파라미터화 변형 (무한 연습)
- `variants:` 블록은 지문 속 데이터 표(과일 이름·가격, 행성 중력 등)를 시드로 치환한다. 그러면 테스트가 새로 생성되고 정답 코드는 그대로 재사용된다
- 문제 화면의 `같은 유형 다시 풀기` 버튼으로 새 인스턴스를 만든다. 기록에는 원본 id와 seed를 남긴다
- 숫자 입력형은 `generator:`(빌드 시 Python으로 경계값을 포함한 입력 생성)를 사용한다. **정적 사이트이므로 변형은 빌드 시 미리 생성**하거나, 브라우저에서 정답 코드를 실행해 즉석 생성한다(Pyodide가 있으므로 가능)

### 5.6 품질 운영
- 문제 페이지의 🚩 버튼을 누르면 GitHub Issue 템플릿 링크가 열린다(문제 id·버전 자동 채움, 코드는 클립보드 복사 안내)
- 정답률이 이상하게 낮거나 신고가 들어온 문제는 재검토 목록에 오른다

### 5.7 작성 가이드 `docs/AUTHORING.md` (P1에서 작성)
- 지문은 한국어로 쓰고, **프롬프트·구분자·소수점·줄바꿈을 모두 명시**한다
- elice 규칙 5개를 따르고, Python 3.6 제약을 지키고, set을 그대로 출력하지 않고, random에는 `seed(1)`을 쓴다
- 이미지는 `content/assets/`에 넣고 상대경로로 참조한다(외부 링크 금지 — Pages의 COEP 환경과 저작권 때문)
- 테스트 설계 체크리스트: 최소·최대·0·음수·빈 입력·즉시 '종료'·중복·대소문자·앞뒤 공백·동률
- 난이도 기준(★ 정의), 태그 어휘, 지문 스타일 3종 템플릿

---

## 6. 화면 · UX 설계

### 6.1 사이트맵 (HashRouter — Pages에서 새로고침·공유 링크 안전)

```
https://<id>.github.io/<repo>/#/                  대시보드 (D-day, 단원 진도, 오늘의 추천 5문제, 최근 기록)
                              #/problems          문제은행 (필터: 단원/태그/난이도/형식/상태, 검색)
                              #/p/:id             풀이 화면 (연습 모드)
                              #/exam              모의고사 선택 (고정 A~J · 랜덤 생성 · 범위 커스텀)
                              #/exam/:sid         시험 진행 (elice testroom 재현)
                              #/exam/:sid/report  결과 리포트
                              #/review            오답노트 · 복습 큐
                              #/notes/:unit       개념 치트시트
                              #/settings          설정 · 백업/복원 · 실행 엔진 상태(A/B)
                              #/about             고지문 · 출처 · 라이선스
```

### 6.2 풀이 화면 (elice 재현 + 연습 기능)
- 기본 배치는 1.3의 그림과 같다. 레이아웃 컴포넌트 `ExamShell`을 연습 모드와 시험 모드가 공유한다
- 연습 모드에서만 추가되는 것
  - 실행 바 오른쪽에 `[터미널] [채점 결과]` 탭
  - 결과 탭: 테스트 표(번호, 공개/숨김, 판정, 시간). 행을 누르면 입력·기대·실제 출력과 diff가 펼쳐진다. 공백은 `·`, 탭은 `→`, 줄 끝은 `⏎`로 시각화한다
  - 경고 배지 `⚠ 3.6`, `⚠ 규칙`, `⚠ 빈칸 남음(_____)`, `⚠ 구조(while 미사용)`
  - 힌트 3단계, 그다음 해설과 정답(시도 n회 후 활성화, 설정 가능)
  - `정답과 비교 실행`: 직접 만든 입력으로 내 출력과 정답 출력을 diff(정답 코드는 보여주지 않음)
  - `예시 입력 자동 입력`(연습 전용 편의 기능. 시험 모드에서는 elice처럼 Copy만 제공)
- 단축키: Ctrl/Cmd+Enter Run, Ctrl/Cmd+Shift+Enter Submit, Ctrl+/ 주석, 터미널에서 Ctrl+C 중단
- 에디터 기본값은 elice와 같다(4칸 들여쓰기, 괄호 자동 닫기, 자동완성). 글꼴 크기는 조절할 수 있다

### 6.3 시험 모드 (실전 리허설)

- **시작 화면**: 세트 정보(문제 수·시간·범위), Test Information(규칙 5개), `시작`
- **진행**
  - 상단: `{세트명} / {n번 문제}`, 남은 시간(elice에는 없지만 시간 관리 연습용으로 표시하고, 설정에서 숨길 수 있음), Test Information, End Test
  - 번호 사이드바 + 제출한 문제에 `Submit` 라벨
  - Run은 대화형 터미널과 `Remaining` 카운트다운
  - Submit하면 결과는 비공개(`Last submit score --`), `Last submit datetime`만 갱신된다. 여러 번 제출할 수 있고 **마지막 제출**로 채점한다
  - 채점 결과·힌트·해설·비교 실행은 모두 숨긴다. 시간이 끝나면 자동으로 End Test
  - 시험 중에는 서비스워커 업데이트·새로고침 알림을 미룬다(8.4). 상태는 계속 저장돼 새로고침해도 이어진다
- **결과 리포트**: 총점과 문항별 점수, 실패한 테스트의 diff(이때 공개), 3.6·규칙 경고, 문제별 소요 시간과 Run/Submit 횟수, 제출하지 않은 문제 경고. 틀린 문제는 오답노트에 자동 등록된다
- **결과를 모르는 시험에 대비하는 장치**
  - 리포트에 "놓친 테스트 유형"을 표시한다(예: 경계값 0, 즉시 종료, 대문자, 앞뒤 공백)
  - Submit 직전 체크리스트 팝오버
    1. 프롬프트 문자열이 지문과 글자 단위로 같은가
    2. `: ` 공백
    3. 예시 입력으로 Run한 결과가 예시 출력과 같은가(입력 에코 줄은 제외)
    4. 경계값을 직접 Run해 봤는가

### 6.4 대시보드 · 오답노트 · 복습
- 단원별 진행 막대(시도/정답), 태그별 정답률 히트맵, 오류 유형 통계(SyntaxError/NameError/TypeError/ValueError/IndexError/KeyError/형식 불일치/시간 초과)
- 오늘의 추천: 취약 태그이면서 아직 못 푼 적정 난이도 문제 5개
- 복습 큐: 틀린 문제를 1일·3일·7일 뒤에 다시 보여준다(간격 반복)
- D-day 카드와 모의고사 점수 추이
- 모든 통계는 **브라우저 안에서만** 계산·저장한다(외부 전송 없음)

### 6.5 개념 치트시트
- 단원별 핵심 문법과 "시험 함정" 박스. **직접 쓴 요약**이며 강의자료 원문은 복사하지 않는다
- 공통 페이지: elice 규칙 5개, Python 3.6 주의사항, 출력 형식 체크리스트
- 각 항목에서 관련 태그 문제로 바로 이동할 수 있다

### 6.6 디자인 원칙
- 풀이·시험 화면은 elice와 같은 배치와 흐름으로 만든다(시험장으로의 학습 전이). 단, **elice의 코드·CSS·이미지·로고는 쓰지 않고 직접 구현**한다(Pages 교육 예외 조건)
- **고지문**(Pages 정책 요건 — "prominent disclaimer"): 첫 방문 배너와 모든 페이지 하단에 표시한다
  > 이 사이트는 elice 및 서울대학교와 **무관한 비공식 개인 학습용** 연습장입니다. 개인 정보를 수집하지 않으며, 모든 기록은 이 브라우저에만 저장됩니다.
- 데스크톱 1280px 이상에 최적화한다(시험장 환경). 모바일은 문제 열람과 치트시트 위주
- 에디터와 터미널은 다크를 기본으로 하고, 문제 패널은 라이트를 기본으로 한다

### 6.7 사용자 학습 루틴 (사이트 활용 권장안)

| 기간 | 루틴 |
|---|---|
| D-11~D-8 (10/9~10/12) | 단원별 ★1–3 드릴(하루 25~30문제), 틀린 문제는 diff로 원인 확인 |
| D-7~D-5 (10/13~10/15) | b_07 드릴 + mixed ★3–4, **매일 모의고사 1회**(시험 모드) |
| D-4~D-2 (10/16~10/18) | 모의고사 + 오답노트·복습 큐, 취약 태그 집중 |
| D-1 (10/19) | 실제 시간 조건으로 최종 리허설 1회, 치트시트(규칙·3.6 주의·함정) 정독 |

---

## 7. 저장소 · 개발 환경

### 7.1 디렉터리 구조

```
exam_python/                          ← Git 저장소 루트 (GitHub: <id>/<repo>)
├─ README.md                           ← 소개·사용법·고지문·사이트 URL
├─ LICENSE                             ← 코드 MIT, 자작 문제 CC BY-NC 등 (결정 필요)
├─ .gitignore                          ← materials/, midterms/, 빌드 산출물 (작성 완료)
├─ docs/
│  ├─ PLAN.md                          ← 이 문서
│  ├─ AUTHORING.md                     ← 문제 작성 가이드
│  ├─ DEPLOY.md                        ← Pages 설정·배포·롤백 절차(8장 요약)
│  └─ EXTENDING.md                     ← 새 단원·채점기·패키지 추가 방법
├─ materials/            (.gitignore)  ← 비공개 원자료 (절대 커밋·배포 금지)
│  ├─ lectures/b_01.ipynb …            ← 현재 midterms/ 내용을 이동
│  └─ elice/week06_problems.md, week06_regression.py   (작성 완료)
├─ content/
│  ├─ config.yaml                      ← 채점 의미론·기본 제한·규칙 세트
│  ├─ units/b02.yaml … b07.yaml
│  ├─ problems/b02/*.yaml … b07/, mixed/, quiz/
│  ├─ exams/midterm-mock.yaml
│  ├─ assets/                          ← 지문 이미지(직접 제작)
│  └─ notes/b02.md …                   ← 치트시트(직접 작성)
├─ tools/                (Python, uv)
│  ├─ pyproject.toml
│  ├─ extract_notebook.py
│  ├─ build.py                         ← V1~V13 + 단원별 JSON + manifest 생성
│  ├─ fetch_pyodide.py                 ← 고정 버전 core + 필요한 패키지만 내려받기
│  ├─ leak_guard.py                    ← 배포물에 비공개 자료가 섞였는지 검사
│  ├─ runner/elice_semantics.py        ← 채점 의미론 (CI 3.6 + Pyodide 공용, 3.6 문법)
│  ├─ runner/graders/{stdio,function,script}.py
│  ├─ checks/{compat36,lint_rules,scope,dedupe}.py
│  └─ tests/                           ← pytest (러너·체커·회귀)
├─ web/                  (Vite + React + TS)
│  ├─ index.html                       ← %BASE_URL%coi-serviceworker.js 를 맨 먼저 로드, noindex 메타
│  ├─ vite.config.ts                   ← base: process.env.VITE_BASE ?? '/'
│  ├─ public/
│  │  ├─ coi-serviceworker.js          ← 번들하지 않은 별도 파일(요건)
│  │  ├─ .nojekyll                     ← 브랜치 배포로 바뀌어도 Jekyll 처리 방지
│  │  ├─ 404.html                      ← /<repo>/#/ 로 리다이렉트
│  │  ├─ py/                           ← 빌드 시 tools/runner·checks 복사(공유 코드)
│  │  ├─ pyodide/vX.Y.Z/   (CI에서 생성) ← 버전 경로 = 캐시 무효화
│  │  └─ data/             (CI에서 생성) ← manifest.json, units/*.<hash>.json
│  ├─ e2e/ (pages-like.config.ts, live.config.ts)
│  └─ src/
│     ├─ app/ (routes, providers, Disclaimer, UpdateToast)
│     ├─ features/solve/  (ProblemPanel, EditorPane, TerminalPane, RunBar, ResultPanel)
│     ├─ features/exam/   (ExamShell, NumberSidebar, TestInfoDrawer, Timer, Report)
│     ├─ features/bank/ dashboard/ review/ notes/ settings/
│     ├─ runtime/ (pyodide.worker.ts, client.ts, protocol.ts, stdinChannel.ts, replay.ts, compare.ts, tier.ts)
│     ├─ store/   (ns.ts, db.ts, progress.ts, drafts.ts, exams.ts)
│     └─ lib/     (markdown.tsx, diff.ts, time.ts, paths.ts)
├─ .github/
│  ├─ workflows/ci.yml, deploy.yml
│  └─ ISSUE_TEMPLATE/problem-report.yml
└─ .claude/skills/make-problems/SKILL.md   ← 문제 배치 생성 지침(재사용)
```
`tools/runner/*`와 `tools/checks/*`는 빌드할 때 `web/public/py/`로 복사된다. **CI와 브라우저가 같은 파이썬 코드로 채점**하므로 두 환경의 판정이 어긋나지 않는다.

### 7.2 개발 명령 (예정)

```
uv run tools/build.py --all                      # 문제 검증 + JSON 생성 (로컬 Python)
uv run tools/build.py --unit b07 --py36 docker   # 3.6 컨테이너 검증 (Docker가 있을 때)
uv run pytest tools/tests
npm --prefix web run dev                         # 개발 서버 (COOP/COEP 헤더를 직접 켬 → 계층 A)
npm --prefix web run preview:pages               # Pages 모사: base=/<repo>/, 헤더 없음, 서비스워커로 격리
npx --prefix web playwright test                 # E2E (Pages 모사 + 서비스워커 차단 = 계층 B)
```
- 3.6 검증의 최종 기준은 CI다(GitHub Actions의 Ubuntu에는 Docker가 기본 탑재). 로컬 Docker는 선택 사항이다
- **경로 버그는 개발 서버(base `/`)에서 드러나지 않는다.** 머지 전에 반드시 `preview:pages`(base `/<repo>/`)로 확인한다

### 7.3 테스트 전략

| 대상 | 내용 |
|---|---|
| 러너 단위 | input 의미론, EOF, 예외, 출력 상한, 비교 판정 분류 |
| 회귀 | 6주차 만점 코드 4개(비공개 fixture) → PASS 유지(CI에서는 fixture가 없으면 skip) |
| compat36 | 위반 사례 30개와 정상 사례 30개. 정답 라벨은 실제 python3.6으로 생성 |
| 계층 B | 재실행 입력: 입력 3회 프로그램, `random.seed` 유무, 출력 접두부 불일치 처리 |
| 프런트 | compare/diff 단위 테스트, 저장소 마이그레이션·네임스페이스 테스트 |
| E2E (Pages 모사) | `/<repo>/` 경로, 헤더 없이 서비스워커로 격리 → 한글 입력, Stop, 시간 초과, 시험 모드 숨김 채점 → 리포트 |
| E2E (계층 B) | Playwright `serviceWorkers: 'block'`으로 격리 실패 상황 재현 → 같은 시나리오 통과 |
| 실서버 스모크 | 배포 직후 실제 Pages URL에서 `crossOriginIsolated`, 샘플 Run·Submit 확인 |
| 수동 | IME 체크리스트(Chrome·Safari·Firefox, macOS·Windows, 사생활 보호 창), 컴퓨터실과 같은 해상도 |

### 7.4 MVP 완료 기준 (10/9)
- [ ] **실제 Pages URL** → 문제 목록 → elice 레이아웃 풀이 화면, 고지문 표시
- [ ] Run: `input('이름: ')`에 `홍길동` 입력, Stop, 120초 제한 — 계층 A(크롬)와 계층 B(사생활 보호 창) 모두
- [ ] Submit(연습): 숨은 테스트 채점, 테스트별 판정과 diff
- [ ] 새로고침·딥링크(`#/p/...`) 정상, 새로고침해도 코드 유지(자동저장)
- [ ] 문제 10개(b02~b06 각 2)가 V1~V5·V8을 통과
- [ ] main에 push하면 Actions 빌드 → Pages 배포 → 실서버 스모크가 자동으로 진행

---

## 8. GitHub Pages 배포 설계

### 8.1 Pages 제약 한눈에

| 제약 (확인 근거) | 영향 | 대응 |
|---|---|---|
| 정적 파일만 서빙 | 서버 채점·DB·로그인 불가 | 실행·채점·저장 전부 클라이언트(3장) |
| **커스텀 응답 헤더 불가** | COOP/COEP 없음 → `SharedArrayBuffer` 없음 → `input()` 블로킹·인터럽트 불가 | `coi-serviceworker`가 헤더 주입(계층 A) + 재실행 입력(계층 B) (8.3) |
| `cache-control: max-age=600` + ETag (실측) | 배포 후 최대 10분간 옛 index·데이터 혼재 가능 | 해시 파일명, 버전 경로, manifest 재검증, 업데이트 알림 (8.4) |
| 프로젝트 사이트 경로 `/<repo>/` | 절대경로 `/x`가 깨짐, SPA 라우트 새로고침 404 | `base` 자동 주입, 모든 경로 `BASE_URL` 기준, HashRouter, 404.html (8.2) |
| `<id>.github.io` origin을 모든 프로젝트 사이트가 공유 | 저장소·캐시·서비스워커 충돌 | 네임스페이스와 scope 한정 (8.6) |
| 사이트 1GB, 대역폭 월 100GB(soft), 배포 10분 타임아웃, 429 레이트 리밋 (공식 문서) | Pyodide 전체 배포판 불가, 대량 공유 시 제한 | 필요한 파일만 self-host, 용량 예산 관리 (8.5) |
| 10회/시간 빌드 제한 | 브랜치 빌드에만 적용, **커스텀 Actions 워크플로는 제외**(공식 문서) | Actions 배포 사용 (8.7) |
| 사이트는 항상 공개(private 저장소라도) | 배포물 = 전 세계 공개 | 비공개 자료 유출 검사, noindex (8.9) |
| 기존 사이트 모방은 교육 예외 조건부 허용 | 조건 미충족 시 정책 위반 | 직접 구현·데이터 미수집·눈에 띄는 고지문 (8.9) |
| HTTPS 강제 | 서비스워커·SAB·클립보드에 필요(보안 컨텍스트) | 충족 |

### 8.2 사이트 형태 · URL · base 경로

- **형태**: 프로젝트 사이트 `https://<id>.github.io/<repo>/`(권장). 사용자 사이트(`<id>.github.io` 저장소)나 커스텀 도메인이면 base가 `/`가 된다
- **base 주입**: `actions/configure-pages`의 출력 `base_path`를 `VITE_BASE`로 넘긴다(부록 F). 저장소 이름을 바꿔도 자동으로 따라간다
- **경로 규칙**: 코드 어디에도 `/`로 시작하는 절대경로를 쓰지 않는다. 모든 자산은 `import.meta.env.BASE_URL` 기준(`lib/paths.ts`의 `asset('pyodide/...')` 헬퍼)으로 만든다. 워커 안에서도 같은 헬퍼를 쓴다(부록 H)
- **라우팅**: HashRouter(`/<repo>/#/p/b06-...`). 공유 링크·새로고침·서비스워커의 첫 로드 리로드 뒤에도 해시가 유지된다
- **404.html**: `/<repo>/` 아래 잘못된 경로로 들어오면 `/<repo>/#/`로 보낸다
- **index.html 순서**: `<meta name="robots" content="noindex">` → `coi-serviceworker.js`(별도 파일, 번들 금지) → 앱 스크립트

### 8.3 교차 출처 격리(COOP/COEP)와 실행 계층

**원리.** `coi-serviceworker`는 서비스워커가 모든 응답에 COOP/COEP 헤더를 붙여 돌려주는 방식이다. **첫 방문 때 한 번 자동으로 새로고침**된 뒤부터 `crossOriginIsolated === true`가 된다. 기본값은 COEP `credentialless`이고, 실패하면 `require-corp`로 재시도한다(`coepDegrade`).

**설계 규칙**
1. **모든 리소스를 same-origin으로 제공**한다: Pyodide, Monaco(워커 포함), 폰트, KaTeX, 이미지. CDN을 쓰지 않으면 COEP 모드와 관계없이 차단될 일이 없다
2. **외부 임베드는 금지**한다: 지문의 외부 이미지(강의 노트북의 Google Drive 이미지 등), 유튜브, Google Fonts. 빌드 게이트 V11이 외부 URL을 검사한다
3. **서비스워커는 scope당 하나뿐**이다. 그래서 캐싱 서비스워커를 따로 둘 수 없다
   - MVP: `coi-serviceworker` 그대로 사용 + HTTP 캐시(ETag 재검증)
   - S6 단계: `coi-serviceworker`의 헤더 주입 로직(MIT)을 가져와 **자체 `sw.js` 하나**에 헤더 주입과 캐싱을 합친다
4. 첫 로드 리로드는 홈 화면에서만 일어나도록 한다(`doReload`를 재정의해 시험 화면에서는 리로드 대신 안내). 리로드 중에는 로딩 화면을 보여 준다
5. 격리가 실패하면(서비스워커 비활성화 정책, Firefox 사생활 보호 창, 첫 로드 직후 등) **계층 B**로 자동 전환한다. 기능 차이는 Stop 속도(워커 재시작 1~2초)뿐이고, 채점 결과는 같다

**계층 비교**

| | 계층 A (격리 성공) | 계층 B (격리 실패) |
|---|---|---|
| 조건 | `crossOriginIsolated === true` | 그 외 |
| input | SAB + `Atomics.wait` 블로킹 | 재실행 방식(부록 G) |
| Stop·시간 초과 | interrupt buffer → KeyboardInterrupt | `worker.terminate()` 후 재생성 |
| 채점 | 동일 | 동일 |
| 사용자 체감 | elice와 같음 | 입력 후 출력이 아주 잠깐 늦을 수 있음 |

(선택) 크롬의 JSPI(`pyodide.ffi.run_sync`)로 계층 B에서도 블로킹 input을 구현할 수 있다. 중간고사 이후에 검토한다.

### 8.4 캐시 · 업데이트 전략 (`max-age=600` 대응)

| 자원 | 경로 규칙 | 캐시 정책 |
|---|---|---|
| 앱 JS·CSS | Vite 해시 파일명 `assets/*.<hash>.js` | 불변 → 캐시 우선 |
| Pyodide | `pyodide/vX.Y.Z/…` (버전 경로) | 불변 → 캐시 우선(S6에서 Cache Storage) |
| 문제 데이터 | `data/units/<unit>.<hash>.json` | 불변 → 캐시 우선 |
| 목록 | `data/manifest.json` (빌드 ID + 단원 해시 목록) | **항상 재검증**(`fetch(..., { cache: 'no-cache' })`) |
| index.html | – | 서비스워커에서 network-first |

- **업데이트 감지**: 앱이 30분마다, 그리고 탭에 다시 들어올 때 `manifest.json`의 빌드 ID를 비교한다. 바뀌었으면 `새 버전이 있습니다 — 새로고침` 토스트를 띄운다
- **시험 중 보호**: 시험이 진행 중이면 토스트와 서비스워커 `skipWaiting`을 시험이 끝날 때까지 미룬다
- **데이터 호환**: 문제 `version`이 올라도 예전 기록은 남는다. 진행 중 시험은 시작할 때의 문제 스냅샷으로 채점한다(배포 중간에 바뀌어도 안전)
- **롤백**: 이전 커밋으로 되돌려 다시 배포하거나, 이전 성공 워크플로 실행을 재실행한다

### 8.5 용량 · 대역폭 예산 (추정)

| 항목 | 크기(추정) | 비고 |
|---|---|---|
| 앱 번들(React + Monaco + xterm) | 3~4 MB | Monaco가 대부분, 언어는 Python만 포함 |
| Pyodide core (`pyodide.asm.wasm`·`.js`, `python_stdlib.zip`, lock) | 12~15 MB | 중간고사 범위에 필요한 전부 |
| 폰트(서브셋) | 2~4 MB | D2Coding·Pretendard woff2 서브셋 |
| 문제 데이터(400문항, 단원별 분할) | 2~3 MB | 단원별 지연 로딩 |
| **중간고사 배포 합계** | **≈ 25 MB** | 한도 1GB의 2.5% |
| (기말) numpy·pandas·matplotlib + 의존성 | 40~60 MB | 해당 문제에서만 `loadPackage` |
| **기말 배포 합계** | **≈ 85 MB** | 한도의 9% |

- 첫 방문 전송량은 ≈ 10~15MB(압축 여부에 따라 다름)다. 월 100GB면 첫 방문 약 7,000회까지 여유가 있다. 재방문은 ETag 304로 거의 0이다
- 단일 파일 최대는 `pyodide.asm.wasm`(약 10MB 내외)으로, git 100MB 제한과 무관하다. **Pyodide는 git에 커밋하지 않고 CI에서 내려받아 배포물에만 넣는다**
- `fetch_pyodide.py`는 공식 릴리스의 core 묶음 + `pyodide-lock.json`에서 필요한 패키지(와 의존성)만 골라 받는다. GitHub Actions 캐시로 재다운로드를 줄인다

### 8.6 공유 origin 문제 (`<id>.github.io`)

같은 계정의 모든 프로젝트 사이트가 origin 하나를 공유한다. 그래서 다음을 지킨다(코드 골격은 부록 H).
- **저장소 키 네임스페이스**: localStorage 키는 `pyexamlab:*`, IndexedDB 이름은 `pyexamlab-db`, Cache Storage는 `pyexamlab-*`. 정리할 때도 **자기 접두어만** 지운다
- **서비스워커 scope**: `/<repo>/`로 한정한다(파일을 `/<repo>/`에 두면 기본 scope가 그렇게 잡힘). 다른 프로젝트 사이트에 영향을 주지 않는다. `getRegistrations()`로 관리할 때도 자기 scope만 다룬다
- **저장소 이름을 바꾸면** 경로와 scope가 바뀐다. 예전 scope의 서비스워커는 `shouldDeregister`로 정리하고, 데이터는 origin이 같아 그대로 남는다
- **커스텀 도메인으로 바꾸면** origin이 달라져 기록이 따라오지 않는다 → 설정 화면의 내보내기·가져오기로 옮긴다(전환 전 안내 배너)
- COOP `same-origin` 때문에 새 탭으로 연 외부 페이지(GitHub Issue 등)와 `window.opener` 관계가 끊긴다. 외부 링크는 `target="_blank" rel="noopener"`로만 연다

### 8.7 배포 파이프라인 (GitHub Actions → Pages)

- **저장소 설정**: Settings → Pages → Build and deployment → Source: **GitHub Actions**
- **ci.yml** (PR·push, 배포 없음)
  1. Python + uv → V1, V3~V11 (변경된 문제만 증분 검증, 전체 검증은 main에서)
  2. `docker run python:3.6-slim` → V2, 기대출력 확정
  3. Node + Pyodide(배포와 같은 버전) → V12 교차 검증
  4. web: 타입 검사, vitest, `vite build`(base `/<repo>/`), Playwright(Pages 모사 + 계층 B)
  5. `tools/leak_guard.py`: 배포물 검사(아래)
- **deploy.yml** (main push·수동 실행, 부록 F)
  - `build`: checkout → `configure-pages`(base_path) → 문제 빌드(3.6) → `fetch_pyodide` → `vite build`(VITE_BASE) → leak guard → `upload-pages-artifact`(web/dist)
  - `deploy`: `deploy-pages`(environment `github-pages`, OIDC `id-token: write`)
  - `smoke`: 실제 Pages URL에서 Playwright 스모크(격리 확인 → 샘플 Run·Submit)
  - `concurrency: pages`(진행 중 배포 취소 안 함), 권한은 `contents: read`, `pages: write`, `id-token: write`만 부여
- **leak guard (유출 검사)**: 하나라도 걸리면 배포 실패
  1. `git ls-files`에 `materials/`, `midterms/`, `*.ipynb`가 없어야 한다
  2. 배포물(`web/dist`)에 `.ipynb`나 `materials` 경로가 없어야 한다
  3. (로컬 pre-push 훅) 비공개 원문과 공개 지문의 유사도 검사 — CI에는 원문이 없으므로 로컬에서만 실행
- Jekyll은 Actions 배포에서 실행되지 않는다. 브랜치 배포로 바뀌는 경우에 대비해 `.nojekyll`도 넣는다
- 배포는 보통 수 분 안에 끝난다(타임아웃 10분). 콘텐츠 PR이 몰리면 main 머지를 묶어서 배포 횟수를 줄인다

### 8.8 Pages 환경 검증 방법

| 단계 | 방법 | 잡아내는 문제 |
|---|---|---|
| 로컬 Pages 모사 | `vite preview --base /<repo>/` + **헤더 없음** + 서비스워커 | 절대경로, scope, 첫 로드 리로드 |
| 격리 실패 모사 | Playwright `serviceWorkers: 'block'` | 계층 B 동작 |
| 실서버 스모크 | 배포 직후 실제 URL | Pages 헤더·MIME·캐시 실동작 |
| 수동 점검 | DevTools Network에서 `cache-control`, wasm `content-type`, `crossOriginIsolated` 콘솔 확인 | 환경 차이 |

Pages는 PR별 미리보기 환경이 없다. 미리보기가 필요하면 별도 스테이징 저장소(`<repo>-staging`)에 같은 워크플로로 배포한다(선택).

### 8.9 공개성 · Pages 정책 준수

- **사이트는 항상 공개**다(private 저장소에서 Pages를 쓰려면 GitHub Pro가 필요하고, 그래도 사이트는 공개 URL). 따라서 배포물에는 자작 콘텐츠만 넣는다(12장)
- **교육 목적 예외 조건**(GitHub Pages 공식 문서): 기존 웹사이트를 학습용으로 모방하는 것은 ① 코드를 직접 작성하고 ② 사용자 데이터를 수집하지 않으며 ③ 원본과 무관하고 교육 목적임을 **눈에 띄게 고지**하면 허용된다
  - ① elice의 HTML·CSS·JS·이미지·로고를 복사하지 않고, 화면 배치만 참고해 직접 구현한다
  - ② 분석 도구·쿠키·외부 전송이 없다. 모든 기록은 브라우저 IndexedDB에만 남는다
  - ③ 첫 방문 배너, 모든 페이지 하단, README, `#/about`에 고지문을 둔다(6.6)
- **검색 노출 차단(권장)**: 프로젝트 사이트는 도메인 루트의 `robots.txt`를 가질 수 없다(그 파일은 사용자 사이트 저장소 몫). 그래서 `index.html`에 `<meta name="robots" content="noindex, nofollow">`를 넣는다. HashRouter라 페이지가 하나뿐이어서 이것으로 충분하다
- **금지 용도 아님**: 상업 목적이 아니고, 비밀번호 같은 민감 정보를 다루지 않는다

### 8.10 저장소 공개 여부와 Actions 사용량

| 선택 | 장점 | 단점 | 조건 |
|---|---|---|---|
| **A. public 저장소 (권장)** | Pages 무료, **Actions 분 무제한**, 설정 단순 | 소스(자작 문제·정답 YAML)도 공개 — 단, 사이트가 이미 공개하므로 추가 노출은 적음 | `.gitignore` + leak guard + noindex 필수 |
| B. private 저장소 | 소스 비공개 | Pages에 **GitHub Pro 필요**(GitHub Student Developer Pack으로 무료), Actions 월 3,000분 한도, 사이트는 어차피 공개 | 증분 검증·캐시로 PR당 2~4분 유지 |

어느 쪽이든 `materials/`(강의 노트북·elice 원문)는 git에 들어가지 않는다(이미 `.gitignore` 작성).

### 8.11 Day-0 Pages 스파이크 체크리스트 (10/8)

1. GitHub 저장소 생성 → Settings → Pages → Source: GitHub Actions
2. 최소 페이지: `index.html` + `coi-serviceworker.js` + self-host Pyodide core + 워커에서 `input()`(SAB)
3. Actions로 배포 → 크롬에서 `https://<id>.github.io/<repo>/` → 첫 로드 리로드 후 콘솔에서 `crossOriginIsolated === true`
4. `name = input('이름: '); print(f'안녕, {name}')`에 한글 입력(xterm IME)
5. `while True: pass` → Stop(인터럽트) 동작
6. Safari·Firefox·크롬 사생활 보호 창에서 반복 → 계층 B 자동 전환 확인
7. 첫 로딩 시간·전송량, 재방문 시간 측정. 응답 헤더(`cache-control`, wasm `content-type`) 기록
8. 통과하면 이 구조로 MVP 진행. 계층 A가 실패하면 계층 B를 기본으로 두고 진행한다(일정 영향 없음)

---

## 9. 일정 (D-12 → D-0)

| 날짜 | 단계 | Claude 작업 | 사용자 작업 | 완료 기준 |
|---|---|---|---|---|
| 10/8(목) D-12 | P0 준비 | 계획 확정, Git 초기화, `materials/` 비공개 이동, **Pages 실배포 스파이크(8.11)** + xterm 한글 IME + Stop | GitHub 저장소 생성·Pages 설정, 결정 사항 회신(13장) | 실제 Pages URL에서 대화형 input·Stop 동작 |
| 10/9(금) D-11 | P1 MVP | elice 레이아웃, Run/Submit, 의미론 러너, 비교기, 계층 A/B, 자동저장, 스키마 + build.py, 샘플 10문제, deploy.yml·스모크, 고지문, AUTHORING.md | 사이트 시용·피드백 | 7.4 체크리스트 |
| 10/10(토) D-10 | P2 콘텐츠① | b02·b03·b04 ≈125문제, 게이트 V1~V10, CI 3.6 | b02~b03 드릴, 신고 | 누적 ≈135 |
| 10/11(일) D-9 | P2 콘텐츠② | b05·b06 ≈110 + mixed 20, compat36·린트 UI | b04~b05 드릴 | 누적 ≈265 |
| 10/12(월) D-8 | P3 시험 모드 | 시험 셸, 타이머, 숨김 채점, End Test, 리포트, 고정 세트 A~E, 대시보드 v1, 오답노트, 업데이트 토스트(시험 중 보류) | **첫 모의고사** | 모의고사 완주 가능 |
| 10/13(화) D-7 | P4 b_07 | 수업 후 b_07 추출 → 함수 문제 40 + `function` 채점기 | b_07 노트북 전달 | b07 배포 |
| 10/14(수) D-6 | P5 품질 | V11~V13, blind 검증 전수, 치트시트 b02~b07, 힌트·해설 보강, 세트 F~J, quiz 60, 자체 `sw.js` 캐싱(S6) | 모의고사 | 누적 ≈365 |
| 10/15(목) D-5 | P6 스타일 보정 | 7주차 elice 실습(함수)을 수집해 스타일 반영 → mixed 나머지 20 + b07 보강 | 실습 후 모의고사 | 누적 ≈385 |
| 10/16~18 D-4~D-2 | 보강 | 신고 수정, 취약 단원 +50, 변형 문제, 성능·버그 | 매일 모의고사와 복습 | 누적 ≈435, 미해결 신고 0 |
| 10/19(월) D-1 | 동결 | 기능 동결(배포 중지 — 시험 전날 캐시 혼선 방지), 데이터 백업 안내 | 실전 리허설과 치트시트 | – |
| 10/20(화) | 시험 | – | 응시 | – |

**일정이 밀릴 때 버리는 순서**: 개념 퀴즈 → 변형 문제 → 자체 sw.js 캐싱 → 대시보드 고급 기능 → 시험 모드 부가 기능.
**끝까지 지키는 것**: Pages에서의 정상 동작(계층 A/B), 정확한 채점, b02~b07 핵심 문제, 기본 시험 모드.

---

## 10. 확장성 설계와 기말 로드맵

### 10.1 확장성 원칙
1. **콘텐츠는 데이터로**: 단원, 문제, 모의고사 세트, 치트시트, 채점 설정이 모두 `content/`에 있다. 앱은 이 데이터를 읽기만 한다
2. **채점기 플러그인**: `grader: stdio | function | script`. 새 방식은 `tools/runner/graders/<name>.py`와 UI 표시용 `web/src/runtime/graders/<name>.ts`만 추가하면 되고 기존 문제에는 영향이 없다
3. **패키지 지연 로딩**: 문제에 `packages: [numpy]`가 있을 때만 `pyodide.loadPackage`를 호출한다. 그래서 중간고사 문제의 로딩 속도는 그대로다. 배포물에도 선언된 패키지만 들어간다(8.5)
4. **파일·이미지 I/O를 처음부터 스키마에 포함**: `files`는 가상 FS(elice와 같은 `data/` 경로), 이미지 출력은 `elice_utils` 호환 shim과 이미지 패널로 처리한다
5. **의미론 단일 소스**: 채점 코드 하나를 CI와 브라우저가 공유한다
6. **버전 관리**: 문제 `version`, 로컬 데이터 `schemaVersion`, Pyodide 버전 경로 고정
7. **범위는 누적**: `units/*.yaml`의 `allowed`가 누적되므로 기말 문제는 전 범위 문법을 자동으로 허용한다
8. **배포 독립성**: 경로·base·네임스페이스를 설정으로 두어 저장소 이름 변경, 사용자 사이트, 커스텀 도메인 어디로 옮겨도 코드 수정 없이 동작한다

### 10.2 새 단원 추가 체크리스트 (예: b_07, 약 1~2시간)
1. `materials/lectures/b_07.ipynb` 복사
2. `uv run tools/extract_notebook.py b_07` → `content/units/b07.yaml` 초안
3. 개념과 허용 문법 확인(함수 단원이면 `FunctionDef`, `Return`, `Global` 등 추가)
4. `/make-problems b07 --count 20`을 2회(★1–3, ★3–5)
5. `uv run tools/build.py --unit b07` → 실패한 문제 수정을 반복
6. `content/exams/*.yaml`의 `pick`에 b07 추가
7. `content/notes/b07.md` 치트시트 작성
8. PR → CI → main 머지 → Pages 자동 배포

### 10.3 b_07 (함수) 대응
- `stdio` 문제(함수를 정의하고 호출 결과를 출력)가 기본이다. 여기에 `function` 채점기를 더한다. 사용자 코드를 한 번 실행한 뒤(입력이 있으면 테스트 stdin 공급) 숨은 테스트의 `call: "is_prime(97)"`을 평가해 `repr` 결과를 비교한다
- `requirements: { must_define: [is_prime], must_use: [return] }`처럼 구조 요구를 AST로 검사해 연습 모드에서 경고한다
- 출력 예측형 비중을 늘린다: 지역/전역, 가변 객체 전달, 반환값 None

### 10.4 기말 로드맵 (10/21 → 12/08)

| 시기 | 작업 |
|---|---|
| 10/21~10/25 | 중간고사 회고: 실제 시험 화면·유형 차이를 기록 → 스타일 가이드와 세트 규칙 보정 |
| 매주 화요일 | 새 ipynb → 10.2 절차로 20~40문제 |
| NumPy 단원 전 | `packages` 지연 로딩, `script` 채점기(`np.allclose`·shape 검사), 배열 출력 비교 |
| Pandas 단원 전 | `files` 마운트(`data/*.csv`), DataFrame 출력 비교(`to_string` 정규화) + `script` 검사(`df.equals`) |
| Matplotlib 단원 전 | `elice_utils` shim(`send_image`)과 `plt.show()` 가로채기 → 이미지 패널, 그래프 속성 검사(제목·축 라벨·데이터) |
| 11월 말 | `final-mock.yaml`과 전 범위 모의고사 |

**기말 핵심 리스크 1 — 패키지 버전.** elice는 Python 3.6 환경이므로 numpy 1.19 이하, pandas 1.1 이하일 가능성이 높다. 반면 Pyodide에는 numpy 2.x, pandas 2.x가 들어 있다. numpy 2는 스칼라 repr이 다르다(`print([np.float64(1.0)])` → `[np.float64(1.0)]` vs 예전 `[1.0]`).
→ 해당 단원 시작 전에 elice에서 `np.__version__`, `pd.__version__`을 확인한다. 사이트는 `np.set_printoptions(legacy='1.25')` 같은 호환 설정과 출력 정규화로 맞추고, 차이 목록을 문서화한다.

**기말 핵심 리스크 2 — Pages 용량·로딩.** 패키지가 추가되면 배포물이 ≈85MB로 늘어난다. 한도 안이지만 첫 로딩이 길어지므로, 해당 문제를 열 때만 내려받고 진행률을 표시하며 S6 캐싱으로 재방문 비용을 없앤다.

---

## 11. 리스크와 대응

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| R1 | xterm.js 한글 IME 조합 오류 | 터미널에 `사과` 입력 불가 | Day 0 스파이크. 실패하면 자체 터미널(출력 `<pre>` + 네이티브 입력줄)로 교체 |
| R2 | **Pages에서 COOP/COEP 불가** → SAB 불가 | 블로킹 input·인터럽트 불가 | `coi-serviceworker`(계층 A) + 재실행 입력(계층 B) 자동 폴백, 모든 리소스 same-origin |
| R3 | Python 3.6 vs 3.12+ 차이 | 사이트를 통과한 코드가 시험장에서 오류 | 3.5절 3단 방어, 기대출력은 3.6 기준 |
| R4 | 채점 의미론 오해 | 엄격도 불일치 | 회귀 fixture와 설정화. 사이트는 같거나 더 엄격하게 |
| R5 | 생성 문제의 오류·모호함 | 잘못된 학습 | V1~V13, 이중 정답, 뮤턴트, blind 풀이, 신고 루프 |
| R6 | 12일이라는 짧은 일정 | 미완성 | 10/9 MVP 배포 고정, 9장의 컷 순서 |
| R7 | 저작권·학칙·Pages 정책 | 공개 사이트에서 문제 발생 | 12장 정책, 8.9 교육 예외 조건, leak guard |
| R8 | 컴퓨터실 네트워크·첫 로딩(~15MB) | 느린 시작 | self-host + 캐시, 진행률 표시, 미리 방문 |
| R9 | 실제 시험 화면이 실습 testroom과 다를 수 있음 | 연습과 불일치 | 레이아웃 컴포넌트화, 시험 직후 차이를 기록해 기말 전에 반영 |
| R10 | Pyodide 속도 | 시간 초과 오판 | 넉넉한 제한(2초), V13으로 정답 시간 확인 |
| R11 | elice 탐색 중 실수(제출·코드 변경) | 실습 점수 영향 | 탐색 원칙: **Submit·End Test 금지**, 미제출 빈 문제에서만 Run, 바꾼 코드는 즉시 원상복구 |
| R12 | `<id>.github.io` 공유 origin 충돌 | 다른 프로젝트 사이트와 저장소·서비스워커 간섭 | 네임스페이스, scope 한정(8.6) |
| R13 | `max-age=600` 때문에 배포 직후 옛 파일 혼재 | 화면·데이터 불일치 | 해시·버전 경로, manifest 재검증, 업데이트 토스트(8.4), 시험 전날 배포 동결 |
| R14 | 서비스워커 업데이트·첫 로드 리로드가 시험 중 발생 | 시험 흐름 끊김 | 시험 중 업데이트 보류, 리로드는 홈에서만, 상태 연속 저장 |
| R15 | private 저장소 선택 시 Actions 분 초과 | CI·배포 중단 | public 저장소(무제한) 또는 증분 검증·캐시(8.10) |
| R16 | 대량 공유 시 대역폭·429 | 사이트 일시 제한 | noindex, 용량 예산, 캐시. 필요하면 링크 공유 범위를 좁힘 |

---

## 12. 저작권 · 공개 정책 (GitHub 공개 전 필수)

- 강의 ipynb(교수 저작물)와 elice 실습 원문은 **저장소와 배포물 어디에도 넣지 않는다**. `materials/`와 현재의 `midterms/`는 `.gitignore`에 등록했다(작성 완료). CI의 leak guard가 이중으로 막는다
- 공개되는 문제는 모두 **새로 작성한 변형 문제**다(상황·데이터·출력 문구를 바꿈). 실습 원문을 그대로 쓰지 않는다
- 치트시트는 직접 요약한다(원문 문장·그림 복사 X). 강의 셀 참조(`lecture_ref`)는 위치 정보만 남긴다
- 강의 노트북의 이미지(Google Drive 링크)는 가져오지 않는다. 필요한 그림은 직접 만든다(COEP 환경에서도 외부 이미지는 막힘)
- elice의 코드·디자인 자산·로고는 쓰지 않는다(화면 배치와 흐름만 참고해 직접 구현). 모든 페이지에 고지문을 둔다(8.9)
- 회귀 테스트용 elice fixture는 비공개로 두고, CI에서는 fixture가 없으면 skip한다
- `docs/PLAN.md`에는 elice 관찰 결과를 **주제 요약 수준**으로만 적었다. 원문은 `materials/elice/`에 있다
- 라이선스(결정 필요): 코드 MIT, 자작 문제 CC BY-NC 4.0 권장

---

## 13. 결정 필요 사항과 다음 단계

### 13.1 결정이 필요한 사항 (괄호 안은 권장 기본값)
1. **GitHub 사용자명과 저장소 이름** — 사이트 URL과 base 경로가 정해진다 (`python-exam-lab` → `https://<id>.github.io/python-exam-lab/`)
2. **저장소 공개 여부** (public 권장 — Actions 무제한·설정 단순, 8.10)
3. 검색 노출 (`noindex` 권장)
4. 커스텀 도메인 사용 여부 (사용 안 함 권장 — origin이 바뀌면 기록 이전 필요)
5. 모의고사 기본값: 시험 시간·문항 수 (75분·5문항, 실제 공지가 나오면 수정)
6. elice 2~6주차 실습 원문 수집 여부 (권장: 수집. Chrome으로 텍스트만, 제출·수정 없이, 비공개 보관)
7. 라이선스 (코드 MIT, 문제 CC BY-NC 4.0)

### 13.2 바로 시작할 작업 (P0)
1. `git init`, `midterms/` → `materials/lectures/` 이동(`.gitignore`는 작성 완료), 첫 커밋 전에 `git status`로 비공개 자료가 빠졌는지 확인
2. GitHub 저장소 생성 → Pages Source를 GitHub Actions로 설정
3. **8.11 Pages 스파이크** (가장 큰 위험 R2를 첫날 확인)
4. `tools/runner/elice_semantics.py`(부록 A 기반)와 회귀 fixture 이식
5. `docs/AUTHORING.md` 초안 → 샘플 10문제 → MVP

---

## 부록 A. 채점 의미론 코어 (PoC 검증본, Python 3.6 호환 문법)

```python
# tools/runner/elice_semantics.py (요지) — CI(Python 3.6)와 Pyodide가 공유
import builtins, io, sys, traceback

def run_graded(code, stdin_text):
    lines = stdin_text.split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    feed = iter(lines)
    out = io.StringIO()

    def elice_input(prompt=''):
        out.write(str(prompt))
        try:
            line = next(feed)
        except StopIteration:
            raise EOFError('EOF when reading a line')
        out.write('\n')                      # 입력값은 에코하지 않고 줄바꿈만
        return line

    g = {'__name__': '__main__', '__builtins__': builtins}
    saved_input, saved_stdout = builtins.input, sys.stdout
    builtins.input, sys.stdout = elice_input, out
    status, tb = 'ok', None
    try:
        exec(compile(code, 'main.py', 'exec'), g)
    except SystemExit:
        pass
    except BaseException:
        status, tb = 'error', traceback.format_exc()
    finally:
        builtins.input, sys.stdout = saved_input, saved_stdout
    return status, out.getvalue(), tb

def normalize(s):
    return s.replace('\r\n', '\n').rstrip('\n')   # 끝 줄바꿈만 무시

def classify(expected, actual):
    e, a = normalize(expected), normalize(actual)
    if e == a:
        return 'PASS'
    if [l.rstrip() for l in e.split('\n')] == [l.rstrip() for l in a.split('\n')]:
        return 'TRAILING_WS'      # 줄 끝 공백만 다름 (elice에선 오답 가능성)
    if e.split() == a.split():
        return 'WHITESPACE'       # 공백·줄바꿈 배치만 다름
    if e.lower() == a.lower():
        return 'CASE'
    return 'WRONG'
```

PoC 결과: 6주차 만점 코드 4개 × elice 예시 입력 → **4/4 PASS** (프롬프트 끝 공백까지 일치).

---

## 부록 B. Python 3.6 비호환 목록 (사이트 경고 대상)

| 기능 | 도입 | 예 | elice(3.6)에서 | 대안 |
|---|---|---|---|---|
| f-string `=` | 3.8 | `f"{x=}"` | SyntaxError | `f"x={x}"` |
| f-string 중괄호 안 같은 따옴표 | 3.12 | `f"{d["a"]}"` | SyntaxError | `f"{d['a']}"` |
| f-string 중괄호 안 `\` | 3.12 | `f"{'\n'.join(a)}"` | SyntaxError | `'\n'.join(a)` 따로 계산 |
| f-string 중괄호 안 주석·여러 줄 | 3.12 | – | SyntaxError | 한 줄 표현식 |
| 바다코끼리 `:=` | 3.8 | `if (n := len(a)) > 3:` | SyntaxError | 먼저 대입 |
| 위치 전용 인자 `/` | 3.8 | `def f(a, /):` | SyntaxError | 일반 인자 |
| `match` 문 | 3.10 | `match x:` | SyntaxError | if/elif |
| `str.removeprefix/removesuffix` | 3.9 | `s.removeprefix('#')` | AttributeError | 슬라이싱 |
| `str.isascii` | 3.7 | – | AttributeError | `all(ord(c) < 128 ...)` |
| `math.prod/isqrt/comb/perm/dist` | 3.8 | `math.prod(a)` | AttributeError | 반복문 |
| `math.lcm`, 다인자 `math.gcd` | 3.9 | – | AttributeError / TypeError | 직접 구현 |
| `statistics.fmean/multimode` | 3.8 | – | AttributeError | `sum/len` |
| `dict \| dict`, `\|=` | 3.9 | `a \| b` | TypeError | `c = dict(a); c.update(b)` |
| `reversed(dict)` | 3.8 | – | TypeError | `reversed(list(d))` |
| `zip(strict=True)` | 3.10 | – | TypeError | 길이 확인 |
| `int.bit_count` | 3.10 | – | AttributeError | `bin(n).count('1')` |
| `itertools.pairwise` | 3.10 | – | AttributeError | `zip(a, a[1:])` |
| `Counter.total()` | 3.10 | – | AttributeError | `sum(c.values())` |
| `breakpoint()`, `dataclasses` | 3.7 | – | NameError / ImportError | – |
| 내장 제네릭 주석 `list[int]` | 3.9 | `def f(a: list[int]):` | TypeError | 주석 생략 |

동작 차이: 문자열 set의 출력 순서는 실행마다 다르다(정렬해서 출력). dict 순서는 같다. 오류 메시지 문구는 다르다(채점과 무관).

---

## 부록 C. 문제 YAML 예시

**C-1. stdio · 빈칸형 (b04)**
```yaml
id: b04-loop-gugudan-003
version: 1
title: 구구단 빈칸 채우기
unit: b04
tags: [loop.for-range, io.fstring-format]
difficulty: 1
grader: stdio
format: fill
style: elice-main
statement: |
  정수 n(2~9)을 입력받아 n단을 출력하도록 빈칸(`_____`)을 채우시오.
  - 프롬프트: `정수(2~9) 입력: `
  - 출력 형식: `n * i = 결과` (i는 1~9)
starter: |
  n = int(input("정수(2~9) 입력: "))
  for i in _____:
      print(f"{_____} * {_____} = {_____}")
solution: |
  n = int(input("정수(2~9) 입력: "))
  for i in range(1, 10):
      print(f"{n} * {i} = {n * i}")
alt_solutions:
  - |
    n = int(input("정수(2~9) 입력: "))
    i = 1
    while i <= 9:
        print(n, "*", i, "=", n * i)
        i += 1
mutants:
  - { name: range 끝값 실수, code: "n = int(input('정수(2~9) 입력: '))\nfor i in range(1, 9):\n    print(f'{n} * {i} = {n * i}')" }
tests:
  - { stdin: "2\n", public: true }
  - { stdin: "9\n" }
  - { stdin: "5\n" }
  - { stdin: "7\n" }
```

**C-2. function (b07)**
```yaml
id: b07-func-prime-001
title: 소수 판별 함수
unit: b07
grader: function
entry: is_prime
statement: |
  정수 n이 소수이면 True, 아니면 False를 반환하는 함수 `is_prime(n)`을 작성하시오.
  그리고 정수 m을 입력받아 2 이상 m 이하의 소수를 공백으로 구분해 한 줄로 출력하시오.
  - 프롬프트: `m: `
tests:
  - { stdin: "10\n", public: true }   # stdio 채점 (메인 출력)
  - { call: "is_prime(1)" }           # function 채점 (반환값 repr 비교)
  - { call: "is_prime(2)" }
  - { call: "is_prime(97)" }
  - { call: "is_prime(91)" }
requirements: { must_define: [is_prime], must_use: [return] }
```

**C-3. script (기말 · pandas)**
```yaml
id: f10-pandas-filter-001
title: 월별 매출 필터
unit: f10
grader: script
packages: [pandas]
files:
  data/sales.csv: |
    month,amount
    1,120
    2,80
    3,200
statement: |
  `data/sales.csv`를 읽어 DataFrame `df`를 만들고, amount가 100 이상인 행만 `high`에 저장하시오.
check: |
  # ns: 사용자 코드 실행 후 네임스페이스
  assert 'df' in ns and 'high' in ns, "df, high 변수를 만드세요"
  assert list(ns['high']['month']) == [1, 3], "필터 결과가 다릅니다"
```

---

## 부록 D. 문제 생성 스킬 골격 (`.claude/skills/make-problems/SKILL.md`)

```
역할: elice 시험 출제자. 단원 {unit}({title})의 개념 {concepts}로 문제 {count}개를 만든다.
반드시:
- docs/AUTHORING.md의 YAML 스키마 v1을 지킨다 (1문제 = 1파일, expected는 쓰지 않음)
- Python 3.6에서 동작해야 한다 (부록 B 금지 목록), 단원 allowed(누적) 문법만 쓴다
- elice 규칙 5개를 지킨다. 프롬프트·메시지 문자열은 지문에 글자 그대로 쓴다
- 지문만 읽고 출력이 완전히 결정되어야 한다 (구분자·공백·줄바꿈·소수점·정렬 기준)
- set을 그대로 출력하지 않는다. random은 random.seed(1)
- 외부 이미지·링크를 넣지 않는다 (필요하면 content/assets/에 직접 만든 그림)
- tests: 공개 1~2개 + 숨김 4~6개 (경계값, 즉시 종료, 빈 입력, 대소문자, 앞뒤 공백, 중복, 동률)
- alt_solutions 1개: 다른 접근으로 독립 작성. mutants 2~3개: 오답 카탈로그에서 고른다
- 기존 문제 목록(제목·태그)과 겹치지 않게 상황과 데이터를 다양화한다. 강의·elice 원문 문장을 쓰지 않는다
- 난이도 분포: ★1 {a}, ★2 {b}, ★3 {c}, ★4 {d}, ★5 {e}
절차: 생성 → uv run tools/build.py --unit {unit} → 실패 항목 수정 → 전부 통과까지 반복 → blind 검증
산출: content/problems/{unit}/{id}.yaml
```

---

## 부록 E. elice 화면 문구 사전 (재현용)

| 위치 | 문구 |
|---|---|
| 상단 | `{시험명} / {문제명}`, `Test Information`, `End Test` |
| 실행 바 | `Run`, `Submit`, `Stop`, `Remaining: mm:ss`, `Last submit score`, `Last submit datetime`(`MM/DD/YYYY, hh:mm:ss AM/PM`), `--` |
| 연결 상태 | `● Editor connected`, `Connecting to editor...` (사이트에서는 `● Saved locally` 등으로 대체) |
| 터미널 | `/* Code has not run yet. */`, `/* Code is running... */`, `/* Code running is complete! */` |
| 지문 | `예시 결과`, `Input`, `Output`, `TestCase`, `Test Case-1`, `Input Sample`, `Output Sample`, `Copy` |
| 하단 | `PREVIOUS`, `n / N`, `NEXT` |
| Test Info | `Test Info`, `Test period`, `Timeout`, `number of problems` |

---

## 부록 F. Pages 배포 워크플로 골격 (`.github/workflows/deploy.yml`)

```yaml
name: deploy
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
env:
  PYODIDE_VERSION: "X.Y.Z"            # 구현 시점 최신 안정판으로 고정
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4      # 액션 버전은 구현 시점 최신 메이저로
      - id: pages
        uses: actions/configure-pages@v5
      - uses: astral-sh/setup-uv@v6
      - name: Leak guard (tracked files)
        run: uv run tools/leak_guard.py --git
      - name: Build problems (Python 3.6 container = 기준)
        run: uv run tools/build.py --all --py36 docker --out web/public/data
      - uses: actions/cache@v4
        with: { path: .cache/pyodide, key: "pyodide-${{ env.PYODIDE_VERSION }}" }
      - name: Fetch pinned Pyodide (core + declared packages only)
        run: uv run tools/fetch_pyodide.py --version "$PYODIDE_VERSION" --cache .cache/pyodide --out "web/public/pyodide/v$PYODIDE_VERSION"
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm, cache-dependency-path: web/package-lock.json }
      - run: npm ci --prefix web
      - name: Build site
        run: npm run build --prefix web
        env:
          VITE_BASE: ${{ steps.pages.outputs.base_path }}/
          VITE_PYODIDE_VERSION: ${{ env.PYODIDE_VERSION }}
      - name: Leak guard (dist)
        run: uv run tools/leak_guard.py --dist web/dist
      - uses: actions/upload-pages-artifact@v3
        with: { path: web/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    outputs:
      page_url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
  smoke:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci --prefix web && npx --prefix web playwright install --with-deps chromium
      - name: Live smoke (crossOriginIsolated, Run, Submit)
        run: npx --prefix web playwright test --config e2e/live.config.ts
        env: { BASE_URL: "${{ needs.deploy.outputs.page_url }}" }
```

---

## 부록 G. 계층 B — 재실행 방식 input 알고리즘

```ts
// runtime/replay.ts (요지) — SharedArrayBuffer 없이 대화형 터미널을 흉내 낸다
async function runReplay(code: string, term: Terminal, worker: PyWorker) {
  const inputs: string[] = [];
  const sessionSeed = Date.now();          // 재실행마다 같은 시드 → 같은 무작위 흐름
  let shown = '';                          // 터미널에 이미 보여 준 '프로그램 stdout'(에코 제외)
  for (;;) {
    // 큐에 남은 입력이 있으면 input()은 출력 없이 그 값을 반환, 비면 NeedInput으로 중단
    const r = await worker.run({ code, inputs, seed: sessionSeed });
    if (r.stdout.startsWith(shown)) term.write(r.stdout.slice(shown.length));
    else term.write('\r\n(다시 실행됨)\r\n' + r.stdout);   // 시간·무작위 의존 프로그램
    shown = r.stdout;
    if (r.status !== 'need-input') { term.writeStatus(r); return; }
    inputs.push(await term.readLine());    // 터미널이 에코·백스페이스·Enter 처리
  }
}
```
- `NeedInput`은 `BaseException`을 상속한다. 사용자의 `except Exception:`에 잡히지 않는다(맨 `except:`는 예외적으로 잡힐 수 있으니 안내)
- 실행 시간이 Run 제한을 넘으면 워커를 종료하고 재생성한다

---

## 부록 H. base 경로 · 서비스워커 · 저장소 네임스페이스 골격

```ts
// web/vite.config.ts
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',              // Pages: '/<repo>/'
  worker: { format: 'es' },
  server: {                                        // 개발 서버만 헤더 직접 설정(계층 A 개발용)
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin',
               'Cross-Origin-Embedder-Policy': 'require-corp' },
  },
});

// web/src/lib/paths.ts — 절대경로 금지, 항상 BASE_URL 기준
export const asset = (p: string) => new URL(p, new URL(import.meta.env.BASE_URL, location.origin)).href;
export const pyodideIndexURL = asset(`pyodide/v${import.meta.env.VITE_PYODIDE_VERSION}/`);

// web/src/store/ns.ts — <id>.github.io 공유 origin 대비
export const NS = 'pyexamlab';
export const lsKey = (k: string) => `${NS}:${k}`;
export const dbName = `${NS}-db`;
export const cacheName = (v: string) => `${NS}-${v}`;

// web/src/runtime/tier.ts
export const tier = (): 'A' | 'B' => (self.crossOriginIsolated ? 'A' : 'B');
```

```html
<!-- web/index.html (head 맨 앞) -->
<meta name="robots" content="noindex, nofollow">
<script>
  // 시험 화면에서는 자동 리로드 대신 안내 (첫 방문 리로드는 홈에서만)
  window.coi = { doReload: () => { if (!location.hash.startsWith('#/exam/')) location.reload(); } };
</script>
<script src="%BASE_URL%coi-serviceworker.js"></script>
```
