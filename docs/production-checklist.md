# 프로덕션 배포 체크리스트

## 시크릿 설정 (필수)
- [ ] JWT_ACCESS_SECRET: `openssl rand -base64 64`로 생성
- [ ] JWT_REFRESH_SECRET: `openssl rand -base64 64`로 생성
- [ ] JWT_MFA_SECRET: `openssl rand -base64 64`로 생성
- [ ] ENCRYPTION_KEY: `openssl rand -hex 32`로 생성
- [ ] MFA_ENCRYPTION_KEY: `openssl rand -hex 32`로 생성
- [ ] POSTGRES_PASSWORD: 최소 16자, 특수문자 포함

## 네트워크 보안
- [ ] TLS 인증서 설치 (Let's Encrypt 또는 상용 인증서)
- [ ] ALLOWED_ORIGINS에 프로덕션 도메인만 설정
- [ ] 불필요한 포트 차단 (5432 외부 접근 차단)
- [ ] Nginx HTTPS 리다이렉트 활성화 (nginx.conf 주석 해제)

## 데이터베이스
- [ ] PostgreSQL 전용 서버 (공유 금지)
- [ ] 정기 백업 설정 (pg_dump cron)
- [ ] 연결 풀링 설정 (PgBouncer 권장)

## 모니터링
- [ ] /api/v1/health → 헬스체크 모니터링 등록
- [ ] 에러 로그 수집 (CloudWatch / ELK)
- [ ] 디스크/메모리/CPU 알림 설정

## 컨테이너
- [ ] Docker 이미지 취약점 스캔 (docker scout, trivy)
- [ ] non-root 사용자 실행 확인
- [ ] 리소스 제한 (memory, cpu) 설정

## PCI DSS 필수
- [ ] 결제 데이터 토큰화 확인
- [ ] AES-256-GCM 암호화 확인
- [ ] 감사 로그 5년 보관 설정
- [ ] MFA 활성화 (관리자 필수)
