# 협업 가이드 — SMP PC Kitchen

## 목차
1. [로컬 개발 환경 세팅](#1-로컬-개발-환경-세팅)
2. [브랜치 전략](#2-브랜치-전략)
3. [배포 (Fly.io)](#3-배포-flyio)
4. [DB 및 데이터 기준](#4-db-및-데이터-기준)
5. [AI 에이전트 사용](#5-ai-에이전트-사용)
6. [주의사항](#6-주의사항)

---

## 1. 로컬 개발 환경 세팅

### 사전 요구사항
- Python 3.10 이상
- Git

### 세팅 순서

```bash
# 1. 리포 클론
git clone https://github.com/<org>/<repo>.git
cd smp-pc-kitchen

# 2. 가상환경 생성 및 활성화
python3 -m venv venv
source venv/bin/activate       # macOS/Linux
# venv\Scripts\activate        # Windows

# 3. 패키지 설치
pip install -r requirements.txt

# 4. 환경변수 설정
cp .env.example .env
# .env 파일을 열어 ADMIN_PASSWORD, SECRET_KEY 값 설정

# 5. 서버 실행
python app.py
# → http://localhost:5000
```

---

## 2. 브랜치 전략

```
main          ← 항상 배포 가능한 상태. 직접 push 금지.
  └── feature/기능명   ← 신규 기능 개발
  └── fix/버그명       ← 버그 수정
```

### 작업 흐름

```bash
# 작업 시작 전 항상 최신 main 받기
git checkout main
git pull origin main

# 브랜치 생성
git checkout -b feature/night-shift-category

# 작업 후 커밋
git add .
git commit -m "feat: night shift category 렌더링 수정"

# 원격 push
git push origin feature/night-shift-category
```

GitHub에서 **Pull Request** 생성 → 상대방 확인 → merge

### 커밋 메시지 규칙
| 접두사 | 의미 |
|--------|------|
| `feat:` | 새 기능 |
| `fix:` | 버그 수정 |
| `chore:` | 빌드/설정 변경 |
| `docs:` | 문서 수정 |
| `style:` | 코드 포맷팅 (동작 변경 없음) |
| `refactor:` | 리팩터링 |

---

## 3. 배포 (Fly.io)

### flyctl 설치

```bash
# macOS
brew install flyctl

# 또는 공식 설치
curl -L https://fly.io/install.sh | sh
```

### 배포 토큰 사용

```bash
# 환경변수로 토큰 설정 (팀원에게 전달받은 토큰)
export FLY_API_TOKEN=<토큰값>

# 배포
flyctl deploy --remote-only
```

### 배포 전 확인 사항
- `main` 브랜치로 merge된 코드만 배포
- 배포 후 `flyctl logs -a smpckitchen --since 5m` 으로 로그 확인

---

## 4. DB 및 데이터 기준

- **운영 DB (`instance/smp.db`)**: Fly.io 서버 기준. git에 포함되지 않음.
- **로컬 개발**: `python app.py` 실행 시 자동으로 `instance/smp.db` 생성 (시드 데이터 포함).
- **우선순위 카테고리** (`instance/checklist_priority_categories.json`): 서버 파일 기준. git에 포함되지 않음.
- 로컬에서 테스트하고 실제 데이터 변경은 운영 서버에서 확인.

---

## 5. AI 에이전트 사용

Claude (Cline), ChatGPT, Cursor 등 어떤 AI 에이전트든 VS Code에서 동일하게 사용 가능합니다.

### 에이전트에게 컨텍스트 전달 팁
- 작업 시작 시 수정할 파일과 목표를 명확히 설명
- 서버 API 확인: `app.py` 참조
- 프론트엔드: `templates/`, `static/js/` 참조
- 배포: `flyctl deploy --remote-only`

---

## 6. 주의사항

- `.env` 파일은 절대 git에 올리지 않음 (비밀번호 포함)
- `instance/` 폴더 전체가 `.gitignore`에 포함되어 있음
- 같은 파일을 동시에 수정하면 merge 충돌 발생 → 작업 전 조율 필요
- 운영 데이터에 영향을 주는 DB 스키마 변경 시 팀원에게 사전 공지