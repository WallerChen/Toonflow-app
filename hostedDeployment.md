# SiVideoGen hosted distribution

The MIT license and upstream copyright remain in LICENSE. This fork embeds the original Toonflow Vue canvas in SiVideoGen; it is not a link to a separate public account system.

## Runtime and trust boundary

The existing Cloudflare site forwards `/toonflow/*` and `/api/toonflow/*` through its authenticated Stories Worker. Each request carries a short-lived HMAC grant bound to user, tenant, method and path. Railway accepts only signed requests; its public `/health` exposes no workspace data.

`hostedStart.ts` prepares the Railway volume and drops root privileges to UID/GID 1000. `hosted.ts` starts a separate Bun editor process and workspace directory for each account. This is application-level separation, not an OS container per user. Actor environments exclude owner/provider secrets. Browser settings redact bridge credentials. Desktop connection, provider installation, raw FFmpeg, MCP and A2A entry points are unavailable. Workspace file operations retain upstream path and symlink checks.

Managed plugins synchronize by build-content revision while project documents and media remain on the volume. Idle editor processes stop after ten minutes, except during generation. The initial pool allows two concurrent accounts; this is a small first deployment, not a high-concurrency service.

## Models and billing

The actor reads `/api/studio/catalog` from the existing site. Image/video jobs and narration use the site's existing job ledger, ownership checks, moderation and refund behavior. No manual release queue is introduced.

- Seedream 5 Flash: images and image references.
- MiniMax H3 Max Turbo: silent video, 5/10 seconds, supported resolutions.
- xAI narration: seven languages, Eve/Leo/Ara, MP3 at 44.1 kHz; 50–6000 characters. Voice cloning is unavailable.
- Story writer: Workers AI Qwen3 30B A3B for text; Scout for image-bearing messages. The site limits writing to 30 model requests/day/account, including tool continuations. Tool results must be successful before the assistant claims changes.

Every media request queries the current fal base endpoint unit price, compares it with the site's credit catalog, and journals the quote before submission. Unsupported units or increases above the catalog charge stop the request. This is not a comparison of every resolution-specific tier or every provider. SeeAPI's actual paid conversion cost is unconfirmed; no plan was purchased and no SeeAPI route is claimed to be cheaper.

The canvas shows the credit estimate before the generation button. A request journal prevents automatic paid resubmission after ambiguous submission. The original video history remains the recovery surface for interrupted jobs. Two to six finished own shots can be ordered and stitched into an MP4 using the existing free stitch endpoint. Trimming, extracting audio and changing speed are hidden until those capabilities have a managed implementation.

## Railway service

Project: `sivideogen-studio` (`9d4beb33-3a5c-4916-97d1-170f3d1edf8c`). Service: `toonflow` (`1c6ddea0-1318-4fe7-9b50-7b853f23d21f`). Production environment: `4266e264-fe2a-4f83-aed7-0a147f35ddb2`.

Volume: `/app/data`, 5 GB. Region: Singapore. Runtime limit: 1 CPU / 1,000,000,000 bytes RAM, one replica. Healthcheck: `/health`, timeout 120 seconds. Restart: on failure, max three retries. Application sleeping is enabled. These caps do not impose a dollar budget; Railway continues normal usage billing, including storage.

Build with `hostedDockerfile`, Bun 1.3.14. The Docker build replaces npm mirror URLs with the official npm registry without changing package versions or hashes. Build output and data are excluded from uploads by `.railwayignore`.

Required server variables:

- `CFS_SITE_ORIGIN=https://sivideogen.com`
- `CFS_STUDIO_DATA=/app/data`
- `CFS_STUDIO_HOST=0.0.0.0`
- `CFS_MAX_EDITORS=2`
- `PORT=4390`
- `RAILWAY_DOCKERFILE_PATH=hostedDockerfile`
- `RAILWAY_RUN_UID=0` (entrypoint drops privileges)
- `CFS_STUDIO_PROXY_KEY`: private shared signing key, equal to Cloudflare's `STUDIO_PROXY_KEY`.

Never configure `CFS_LOCAL_SESSION_FILE` in production. It is a loopback-only development shortcut using a local QA session file.

Deploy from this repository using `railway up --service toonflow --detach --yes`. An alternative local Docker deployment is in `hostedCompose.yaml`. Do not expose the upstream standalone server directly.

## Verification

Server and web typechecks; standalone web/server/plugin build; authenticated Linux actor startup on Railway; unauthenticated public editor denial; browser creation and persistence of a text node through real writer/tool calls; mock-account image and two video jobs with visible credit prices; narration controls and MP4 assembly flow. QA mock outputs are explicitly labelled and are not real model quality examples. No paid fal or SeeAPI media test was run for this integration. Writing verification uses Workers AI allowance/usage, and hosting has normal Railway usage costs.

The surrounding site has English, Chinese, Spanish and Portuguese text. Native editor UI uses upstream English/Chinese dictionaries; the two additional editor dictionaries are not supplied by this change.
