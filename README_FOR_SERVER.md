# smp-pc-kitchen — 서버 전달용 안내

간단 설명
- Flask 기반 체크리스트 서비스 (템플릿: templates/, 정적파일: static/).
- Docker/Docker Compose 구성 포함.

포함 파일(주요)
- app.py
- requirements.txt
- Dockerfile
- docker-compose.yml
- seed_data.py
- templates/
- static/
- .gitignore

권장 배포 방법 (Docker)
```bash
# Docker 사용(권장, 간단 재현)
cd smp-pc-kitchen
docker-compose up -d --build
# 로그 확인
docker-compose logs -f
```

가벼운 방식 (Python venv)
```bash
cd smp-pc-kitchen
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# 초기 데이터가 필요하면
python seed_data.py
# 앱 실행 (app.py에 run 블록이 있으면)
python app.py
# 또는 flask run
export FLASK_APP=app.py
flask run --host=0.0.0.0 --port=5000
```

포트 및 검증
- 기본 포트: 5000 (docker-compose.yml 또는 app.py에서 포트 확인)
- 동작 확인: http://<서버_IP>:5000/ 또는 내부 라우트 확인

데이터베이스/초기화
- seed_data.py를 통해 초기 데이터 생성 가능. (실행 전 DB 위치 확인)

환경변수
- .env 사용 시 포함하지 않았으니 필요하면 별도 전달 바랍니다.

전달 시 주의
- 소스 코드만 전달하면 되며, node_modules나 가상환경은 제외하세요.
- Docker 이미지를 바로 올릴 예정이라면 소스만 전달하면 됩니다.

문의
- 담당자: 성규