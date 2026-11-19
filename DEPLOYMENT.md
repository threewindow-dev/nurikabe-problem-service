# Docker 배포

## 준비물

- Docker Engine
- Docker Compose v2 (`docker compose`)

## 로컬 이미지 빌드 및 실행

```bash
docker compose up --build -d
```

실행 후 `http://localhost:8080`에서 확인합니다.

## 상태 확인과 중지

```bash
docker compose ps
docker compose logs -f web
curl --fail http://localhost:8080
docker compose down
```

## 서버 배포

소스를 서버로 복사한 뒤 저장소 루트에서 실행합니다.

```bash
docker compose pull
docker compose up --build -d
```

이 구성은 Nginx가 Vite의 정적 빌드 파일을 서빙합니다. 도메인과 TLS가 필요한
경우 외부 리버스 프록시 또는 이 서비스 앞단의 HTTPS 프록시에서
`web` 컨테이너의 8080 포트로 전달하도록 구성합니다.
