// 자유 연습 IDE의 기본 파일 · 예제 · 코드 조각

export const WELCOME = {
  name: 'main.py',
  code: `# 🐍 자유 연습 IDE
# · Ctrl+Enter(⌘+Enter): 실행 — input()은 아래 터미널에서 입력합니다.
# · [한 줄씩 실행]: 줄마다 변수가 어떻게 바뀌는지 봅니다.
# · [테스트] 탭: 입력과 기대 출력을 적고 채점하면 elice와 같은 방식(공백까지)으로 비교합니다.
# · [파이썬 셸]: 식을 입력하면 결과가 바로 나옵니다. Run 뒤에는 이 프로그램의 변수도 쓸 수 있어요.

name = input("이름: ")
scores = [90, 85, 77]
total = 0
for s in scores:
    total += s
print(f"{name}님의 평균: {total / len(scores):.1f}")
`,
  tests: [{ stdin: '민수', expected: '이름: \n민수님의 평균: 84.0' }],
  traceInput: '민수',
};

/** 한 줄씩 실행으로 보면 좋은 예제 (새 파일로 열림) */
export const EXAMPLES = [
  {
    name: '리스트_복사.py',
    label: '리스트: 같은 객체 vs 복사',
    code: `a = [1, 2, 3]
b = a          # 같은 리스트를 가리킨다
c = a.copy()   # 새 리스트를 만든다
b.append(4)
c.append(5)
print(a)
print(b)
print(c)
`,
  },
  {
    name: '재귀_팩토리얼.py',
    label: '재귀 함수 호출과 반환',
    code: `def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)

print(factorial(4))
`,
  },
  {
    name: '버블_정렬.py',
    label: '버블 정렬 과정',
    code: `nums = [5, 2, 4, 1]
n = len(nums)
for i in range(n - 1):
    for j in range(n - 1 - i):
        if nums[j] > nums[j + 1]:
            nums[j], nums[j + 1] = nums[j + 1], nums[j]
print(nums)
`,
  },
  {
    name: '반환값과_print.py',
    label: 'return과 print의 차이',
    code: `def add_and_mul(a, b):
    return a + b, a * b

def show(x):
    print("값:", x)

s, m = add_and_mul(3, 4)
result = show(s)
print(result)
`,
  },
  {
    name: '글자_세기.py',
    label: '딕셔너리로 글자 세기 (입력 사용)',
    code: `text = input("문장: ")
counts = {}
for ch in text:
    if ch != " ":
        counts[ch] = counts.get(ch, 0) + 1
print(counts)
`,
    tests: [{ stdin: 'hello world', expected: "문장: \n{'h': 1, 'e': 1, 'l': 3, 'o': 2, 'w': 1, 'r': 1, 'd': 1}" }],
    traceInput: 'hello world',
  },
  {
    name: '클래스와_객체.py',
    label: '클래스·객체·메서드',
    code: `class Card:
    def __init__(self, owner, balance):
        self.owner = owner
        self.balance = balance

    def pay(self, amount):
        if amount <= self.balance:
            self.balance -= amount
            return True
        return False

card = Card("민수", 5000)
print(card.pay(3000), card.balance)
print(card.pay(3000), card.balance)
`,
  },
];

/** 커서 위치에 넣는 코드 조각 */
export const SNIPPETS = [
  { label: '정수 두 개 입력', code: 'a, b = map(int, input().split())\n' },
  { label: '정수 리스트 입력', code: 'nums = list(map(int, input().split()))\n' },
  { label: 'n줄 입력 반복', code: 'n = int(input())\nfor _ in range(n):\n    line = input()\n' },
  { label: 'f-string 소수 둘째 자리', code: 'print(f"평균: {avg:.2f}")\n' },
  { label: '구분자 넣어 출력', code: 'print(*items, sep=", ")\n' },
  { label: '딕셔너리로 개수 세기', code: 'counts = {}\nfor x in items:\n    counts[x] = counts.get(x, 0) + 1\n' },
  { label: '여러 기준 정렬', code: 'result = sorted(data, key=lambda x: (-x[1], x[0]))\n' },
  { label: '2차원 리스트 만들기', code: 'grid = [[0] * cols for _ in range(rows)]\n' },
  { label: '함수 정의', code: 'def solve(n):\n    result = n\n    return result\n' },
  { label: '클래스 정의', code: 'class Item:\n    def __init__(self, name):\n        self.name = name\n\n    def show(self):\n        return f"{self.name}"\n' },
  { label: 'try-except-else', code: 'try:\n    x = int(input())\nexcept ValueError:\n    print("정수를 입력하세요.")\nelse:\n    print(x)\n' },
  { label: 'random 시드 고정', code: 'import random\nrandom.seed(1)\nn = random.randint(1, 10)\n' },
  { label: '스택·큐 (deque)', code: 'from collections import deque\nq = deque()\nq.append(1)\nfirst = q.popleft()\n' },
];
