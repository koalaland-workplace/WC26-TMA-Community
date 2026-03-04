# Architecture Draft

## Domain boundaries

- Identity & Session
- Economy (KICK, WC26 conversion, caps)
- Gameplay (Quiz, War, Spin, Penalty)
- Social (Referral, Pulse, Telegram tasks)
- Compliance (Anti-sybil, audit log)

## Data flow (target)

Client -> API Gateway -> Domain Services -> DB/Cache/Queue -> Analytics Snapshot
