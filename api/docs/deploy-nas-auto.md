# works-api NAS 자동 배포

개념·흐름 설명(다른 사람에게 이해시킬 때): **[docs/nas-auto-deploy-explained.md](../../docs/nas-auto-deploy-explained.md)**

`git push`만 하면 NAS가 알아서 `api/`를 pull하고, **API 코드가 바뀐 경우에만** `docker compose up -d --build` 합니다.  
(프론트 `dddit/`만 바뀐 push는 GitHub Pages만 갱신되고 NAS는 스킵)

| 방식 | 속도 | 난이도 |
|------|------|--------|
| **A. DSM 작업 스케줄러** | 최대 10분 | 쉬움 (추천) |
| **B. GitHub Actions + Tailscale** | 1~3분 | 보통 (sgb와 동일 Secrets 재사용 가능) |

---

## 사전 준비 (한 번)

NAS에 **works-site 전체** git clone:

```bash
cd /volume1/docker
git clone https://github.com/Mansejin/works-site.git works-site
cd works-site/api
cp .env.example .env
# .env 편집 (GEMINI_API_KEY, 시트, YOUTUBE_API_KEY 등)
docker compose up -d --build
```

`.env`에 선택 항목:

```env
WORKS_DEPLOY_BRANCH=main
WORKS_DOCKER_SUDO=1
```

---

## A. DSM 작업 스케줄러 (가장 확실)

sgb(`auto_script`)와 같은 방식입니다.

### 1. 스크립트 복사

```bash
curl -fsSL https://raw.githubusercontent.com/Mansejin/works-site/main/api/scripts/nas-dsm-task.sh \
  -o /volume1/docker/works-site/api/scripts/nas-dsm-task.sh
chmod +x /volume1/docker/works-site/api/scripts/nas-dsm-task.sh
```

### 2. DSM → 작업 스케줄러

| 항목 | 값 |
|------|-----|
| 이름 | `works-api-auto-pull` |
| 사용자 | **root** |
| 일정 | 10분마다 (또는 5분) |
| 명령 | `sh /volume1/docker/works-site/api/scripts/nas-dsm-task.sh` |

### 3. 이후

```
api/ 수정 → git push → (최대 10분) → works-api.mansejin.com 반영
```

로그:

- `/volume1/docker/works-site/api/logs/scheduled-pull.log`
- `/volume1/docker/works-site/api/logs/deploy.log`

---

## B. GitHub Actions + Tailscale (push 후 1~3분)

sgb 배포에 이미 쓰는 Secrets가 있으면 **그대로 재사용**할 수 있습니다.

### Secrets (works-site 저장소)

| Secret | 값 |
|--------|-----|
| `TAILSCALE_AUTHKEY` | Tailscale ephemeral key |
| `NAS_SSH_HOST` | NAS Tailscale IP (`100.x.x.x`) |
| `NAS_SSH_USER` | SSH 사용자 |
| `NAS_SSH_KEY` | SSH private key 전체 |
| `NAS_REPO_PATH` | `/volume1/docker/works-site` |

`api/**` 경로가 바뀐 push에만 워크플로가 실행됩니다.

수동 실행: Actions → **Deploy works-api to NAS** → Run workflow

---

## 수동 배포 (긴급)

NAS SSH:

```bash
cd /volume1/docker/works-site
sh api/scripts/nas-docker-update.sh
```

강제 재빌드:

```bash
sh api/scripts/nas-docker-update.sh --full-build
```

---

## 문제 해결

| 증상 | 해결 |
|------|------|
| `no .git in ...` | `git clone`으로 전체 repo 받기 (api 폴더만 복사 X) |
| `cannot access docker daemon` | DSM 작업 사용자 **root**, 또는 `.env`에 `WORKS_DOCKER_SUDO=1` |
| push 했는데 API 안 바뀜 | `deploy.log` 확인, `api/` 경로가 포함됐는지 확인 |
| 프론트만 바꿨는데 NAS가 돌아감 | 정상 — docker build는 스킵되고 pull만 함 |

---

## 관련 파일

- `api/scripts/nas-docker-update.sh` — pull + 조건부 docker rebuild
- `api/scripts/nas-dsm-task.sh` — DSM 스케줄러용
- `.github/workflows/deploy-nas.yml` — Actions (Tailscale + SSH)
