# CONTRIBUTING.md

이 문서는 smp-pc-kitchen 저장소에 기여하는 방법과 배포/협업 규칙을 정리합니다.

## 요약
- 이 리포지토리는 main 브랜치를 보호하고, 모든 변경은 브랜치 → PR → 리뷰 → 머지 절차를 따릅니다.
- 커밋 메시지는 일관된 규칙을 사용합니다(아래 참조).
- 배포는 권한 있는 유지보수자가 수행합니다. (Fly.io 사용)

---

## 이슈 / 작업 시작
1. 문제는 Issue로 등록하세요. 가능한 경우 재현 단계, 스크린샷, 로그를 첨부합니다.
2. 작업은 main에서 브랜치를 분기해 진행합니다.

브랜치 네이밍:
- feature/<짧은-설명>
- fix/<이슈-번호>-<짧은-설명>
- hotfix/<짧은-설명>
- chore/<짧은-설명>

예: feature/add-inventory-filter, fix/123-handoff-dup

---

## 커밋 메시지 규칙 (권장: Conventional Commits)
형식: <type>(scope?): <설명>
- type: feat, fix, docs, style, refactor, perf, test, chore
예:
- feat(api): add priority-categories endpoint
- fix(checklist): ensure priority types are strings

PR 제목에도 이 규칙을 적용하면 좋습니다. 관련 이슈는 메시지에 `Fixes #123` 형식으로 연결하세요.

---

## 풀 리퀘스트(PR) 절차
1. 새 브랜치에서 작업 완료 후 push
2. PR 생성: 작업 목적, 변경 요약, 테스트 방법 및 스크린샷 포함
3. 체크리스트(예시)
   - [ ] 관련 이슈에 링크됨
   - [ ] 로컬/CI 테스트 통과 (pytest / npm test)
   - [ ] 포맷터/린트 적용 (black/isort, prettier/eslint)
   - [ ] 문서(README 등) 업데이트 필요 시 반영
   - [ ] 리뷰어 지정 및 최소 1명 승인
   - [ ] CI 빌드/테스트 통과
4. 병합 방식: Squash and merge 권장 (커밋 메시지는 PR 제목으로 요약)

---

## 코드 스타일 / 포맷터
- Python: black, isort 권장
- JavaScript: prettier + eslint 권장
- PR 전에 로컬에서 포맷 및 린트 실행 후 커밋하세요.

예:
- Python: pip install -r requirements.txt && black .
- JS: npm install && npm run lint && npm run format

(프로젝트에 설정 파일이 있으면 해당 설정을 따릅니다.)

---

## 테스트
- 백엔드: pytest (프로젝트에 테스트가 있으면 `pytest` 실행)
- 프론트엔드: npm 기반 테스트가 있으면 `npm test` 실행
- 모든 PR은 CI가 테스트를 돌리고 통과해야 병합 가능합니다.

---

## 로컬 실행 (간단 안내)
- Python:
  - python3 -m venv venv
  - source venv/bin/activate
  - pip install -r requirements.txt
  - export FLASK_APP=app.py
  - flask run
- Frontend(필요 시):
  - cd static (또는 해당 디렉토리)
  - npm install
  - npm run dev

(프로젝트 구조나 스크립트가 다르면 README의 실행법을 따르세요.)

---

## 환경 변수 / 비밀 정보
- 민감 정보는 절대 커밋하지 마세요.
- 저장소에 `.env.example`가 있다면 복사해 `instance/.env` 또는 로컬 `.env`에 적용하세요.
- CI/배포용 시크릿은 GitHub Secrets / Fly 환경설정에 저장하세요.

---

## 데이터베이스 / 마이그레이션
- 현재 DB는 `instance/smp.db` (SQLite)로 관리됩니다. Fly 배포 시 persistent volume이 `/app/instance`에 마운트됩니다.
- 마이그레이션 툴(예: alembic)이 있다면 migration 파일을 PR에 포함하세요.
- 배포 전 DB 백업을 권장합니다.

---

## 배포
- 권한이 있는 유지보수자(관리자)만 배포 수행
- 수동 배포 예시:
  - git push origin main
  - flyctl deploy --remote-only
- Fly.io에서 인스턴스 볼륨(/app/instance)이 영구 저장소로 사용됩니다. 배포 시 인스턴스 파일 경로와 환경 변수를 확인하세요.
- CI를 통해 자동 배포를 구성할 경우, PR 머지 후 CI가 main에 빌드/배포하도록 설정하세요.

---

## 권한 및 협업
- 협업자는 GitHub 웹 UI에서 초대합니다. (관리자 권한자가 수행)
- 요청에 따라 "THE-CELL-MASTER" 계정에 Write 권한을 부여해야 합니다 — 이 초대는 저장소 관리자(웹 UI)에서 수동으로 진행하세요.

---

## 보안 / 규칙
- 비밀(토큰, 비밀번호 등)은 커밋 금지
- 주요 변경(권한·배포·인프라)은 PR에 명시하고 리뷰를 받습니다.
- 외부 의존성 추가 시 보안 리스크를 점검하세요.

---

## 유지보수자 / 연락
- 긴급한 문제(서비스 중단 등)는 repo 관리자에게 직접 연락하세요.
- 일반 이슈/버그/개선 요청은 Issue로 남겨주세요.

---

간단한 PR 템플릿 / ISSUE 템플릿이 필요하면 이 파일에 추가합니다. 이 CONTRIBUTING은 저장소 운영을 위해 최소한의 규칙을 제시한 것이므로 팀 필요에 따라 업데이트 바랍니다.