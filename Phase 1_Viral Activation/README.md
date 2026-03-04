# WC26_TeleCampaign

Monorepo khởi tạo cho WC26 TeleCampaign, gồm prototype hiện tại + khung phát triển fullstack.

## Structure

- `frontend/prototypes/` : toàn bộ file HTML prototype và asset hiện tại (đã chuyển từ Downloads).
- `frontend/app/` : app frontend chính thức (SPA/SSR) sẽ phát triển tiếp.
- `backend/` : API/backend services.
- `shared/` : schema, constants, DTO dùng chung frontend/backend.
- `docs/` : tài liệu chiến lược, policy, roadmap.
- `infra/` : docker, deployment, env templates.
- `scripts/` : script migrate/build/devops.

## Current Main Prototype

- `frontend/prototypes/WC26_Community_Platform.html`

## Next Backend Milestones

1. Define API contract (`auth`, `quiz`, `war`, `spin`, `penalty`, `referral`, `leaderboard`).
2. Add database schema + migrations.
3. Replace localStorage logic bằng backend persistence.
4. Add anti-sybil validation pipeline.

