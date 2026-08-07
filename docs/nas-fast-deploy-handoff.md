# NAS 빠른 배포 최적화 — 로컬 에이전트 인계

> **목적:** Cloud Agent에서 머지까지 끝난 뒤, 배포가 느리고 Actions SSH가 깨져 있어서  
> **로컬(`ssh nas-local`)에서 이어서 고치고 배포**하기 위한 인수인계 문서입니다.  
> 아래 **프롬프트**를 로컬 Cursor 에이전트에 그대로 붙여 넣으면 됩니다.

---

## 프롬프트 (로컬 에이전트에 복붙)

```
works-site NAS 배포를 빠르게 고쳐줘. 기준 문서는 docs/nas-fast-deploy-handoff.md 야.

배경:
- PR #73(롱폼 광고 Analytics 추적) + #74(프로모션 데이터 2026-08-07) 는 이미 main에 머지됨.
- GitHub Actions 배포(deploy-nas.yml)가 실패 중: NAS에 .git 없음 / --full-build·harden force-recreate로 너무 느림.
- Cloud Agent에서는 ssh nas / nas-local 이 DNS 해석 안 됨. 로컬에서 nas-local 로 배포할 것.

해야 할 일:
1) ssh nas-local 로 /volume1/docker/works-site 상태 확인 (.git, api/.env, docker compose ps)
2) .git 없으면 clone 복구 (api/.env·logs 보존). 경로 기본값 /volume1/docker/works-site
3) 배포 스크립트 최적화 (api/scripts/nas-docker-update.sh + .github/workflows/deploy-nas.yml):
   - Actions/기본 경로에서 --full-build 강제 제거
   - re-exec 시 --full-build 강제하지 말 것
   - 변경 분류:
     · api/data/** 만 → git sync (+ 필요 시 works-api restart만, 빌드 금지)
     · api/app/**, server.py → 가능하면 volume 마운트 후 restart만 (Dockerfile/requirements 변경 시에만 --build)
     · Dockerfile / requirements.txt / conti-collab/** → 그때만 docker compose build
   - nas-harden-security-env.sh 는 키가 새로 생겼을 때만 recreate (매 배포 force-recreate 금지)
4) docker-compose.yml: ./data 는 이미 마운트됨. 빠른 코드 반영을 위해 ./app, ./server.py 바인드 마운트 검토(프로덕션 허용 범위에서)
5) ssh nas-local 로 실제 배포 실행해 main 최신(광고 추적 수정 + 프로모션 데이터) 반영 후
   curl -sS https://works-api.mansejin.com/health 및 리포트 recentVideosBar 광고 수치 확인
6) 의미 있는 변경은 커밋·push·PR. 비밀값(.env, 키) 커밋 금지.

SSH:
- 기본: ssh nas-local
- 원격 Tailscale만: ssh nas
- 레거시 saenggibu-nas* 별칭 쓰지 말 것
- 앱 경로: /volume1/docker/works-site (한 대 NAS)
```

---

## 현재 main 상태 (이미 반영됨)

| 항목 | 상태 | 메모 |
|------|------|------|
| 롱폼 광고 추적 수정 | **머지됨** (#73 → `52d61a3` / merge `43077f1`) | Analytics `video+insightTrafficSourceType` 합산, `max(analytics, promo)` |
| 프로모션 데이터 최신화 | **머지됨** (#74 → `1257279` / merge `060710b`) | 레노버·루메나·다이소·아이닉·저스에어빔 Studio 캡처 |
| deploy bootstrap (.git 없을 때 clone) | **main에 푸시됨** (`cc6d36b`) | Actions에서 raw curl 시 CDN/경로 이슈로 아직 NAS 반영 실패했을 수 있음 |
| Actions 배포 | **실패** | run `31164641522`, `31164777217` — `no .git in …` |

검증 시 기대 광고 비중(수정 후 Analytics 기준, 당시 실측):

| 영상 | adViews 대략 |
|------|----------------|
| 다이소 여름 꿀템 | ~19,880 (거의 전액 광고) |
| 루메나 오브제 | ~5,660 |
| 레노버 아이디어탭 | ~8,949 |
| 음쓰/아이닉 | 0 (광고 소스 없음; Studio 조회수 캠페인만 별도) |

프로모션 JSON: `api/data/youtube/promotions.json` — **NAS 로컬 런타임 파일**(git 추적 안 함). 배포 시 `.deploy-preserve`로 백업/복구. 시드(신규 설치): `promotions.seed.json`. overview in-memory cache TTL 900s라 즉시 반영엔 **restart**가 안전.

---

## 느린 이유 (고칠 포인트)

1. **`.github/workflows/deploy-nas.yml`**  
   - 매번 `sh …/nas-docker-update.sh --full-build`  
   - 이어서 `nas-harden-security-env.sh`가 **항상** `compose up -d --force-recreate`

2. **`nas-docker-update.sh` re-exec**  
   - git sync 후 rev가 바뀌면 `exec … --full-build` 로 다시 강제 빌드

3. **이미지에 코드 COPY** (`api/Dockerfile`)  
   - `app/`, `server.py` 변경마다 이미지 빌드 필요  
   - `data/` 만 볼륨 → 데이터 변경은 빌드 불필요

4. **NAS `.git` 유실**  
   - Actions가 pull/build 전에 실패  
   - `NAS_REPO_PATH` 시크릿이 비어 있거나 잘못된 경로면 재발 가능 (빈 문자열은 shell `:-` 기본값으로 안 떨어질 수 있음 → 방어 코드 권장)

---

## 권장 배포 경로 (로컬)

```bash
# 1) 상태
ssh nas-local 'ls -la /volume1/docker/works-site/.git; cd /volume1/docker/works-site/api && sudo docker compose ps'

# 2) 빠른 배포 (최적화 후 — 빌드 없이 sync + 필요 시 restart)
ssh nas-local 'cd /volume1/docker/works-site && WORKS_BRANCH=main WORKS_DOCKER_SUDO=1 sh api/scripts/nas-docker-update.sh'

# 강제 풀빌드는 꼭 필요할 때만
ssh nas-local 'cd /volume1/docker/works-site && WORKS_DOCKER_SUDO=1 sh api/scripts/nas-docker-update.sh --full-build'

# 3) 헬스
curl -sS https://works-api.mansejin.com/health
```

관련 기존 문서:

- 설치/개념: [`api/docs/deploy-nas-auto.md`](../api/docs/deploy-nas-auto.md), [`docs/nas-auto-deploy-explained.md`](./nas-auto-deploy-explained.md)
- 스크립트: `api/scripts/nas-docker-update.sh`, `nas-dsm-task.sh`, `nas-harden-security-env.sh`
- 워크플로: `.github/workflows/deploy-nas.yml`

---

## NAS 실경로 메모 (2026-08-07)

- Container Manager 프로젝트 실제 트리는 **`/volume1/docker/p8e1b72d`**
- 문서/Actions/DSM 기본값 `/volume1/docker/works-site` → `p8e1b72d` **심볼릭 링크**로 맞춤
- Synology 컨테이너/이미지 이름(`p8e1b72d-w1` 등)은 `api/docker-compose.override.yml`에 유지 (gitignore)
- `ohola`는 docker 소켓이 없어 **`sudo -n /usr/local/bin/docker`** (NOPASSWD) 사용

## 구현 체크리스트 (로컬 에이전트)

- [x] `nas-local`로 `.git` / `.env` / 컨테이너 상태 확인·복구 (`works-site` → `p8e1b72d` 링크)
- [x] 변경 분류(data / code / image) + `--full-build` 기본 제거
- [x] harden: 시크릿 **신규 생성 시에만** recreate
- [x] `app`·`server.py` 바인드 마운트로 코드 반영 = restart only
- [ ] main(또는 본 PR 브랜치) 동기화 후 health + 리포트 광고 차트 스모크
- [ ] 커밋·push (시크릿 제외)

---

## Cloud Agent가 못 한 것

- `ssh nas` / `ssh nas-local` DNS 미해석 (이 환경에 Tailscale·SSH config 없음)
- GitHub Actions secrets 읽기 권한 없음
- 따라서 **실제 NAS 배포·검증은 로컬에서만 가능**
