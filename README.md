# AI Voice Agent - Turborepo Monorepo

AI Voice Agent platform with real-time voice conversations using LiveKit, Google STT/TTS, and Gemini LLM.

## Quick Start (Vagrant VM)

1. **Start the VM:**
   ```sh
   vagrant up
   ```

2. **Configure LiveKit & Google API:**
   - Edit `.env` in the project root
   - Add your `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
   - Add your `GOOGLE_API_KEY` (already configured)

3. **Run the stack:**
   ```sh
   vagrant ssh
   cd /vagrant
   docker compose up --build
   ```

4. **Access the services:**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000/docs
   - pgAdmin: http://localhost:5050
   - Agent Worker: Runs automatically in background

## Architecture

The project includes:
- **Frontend** (Next.js): User interface at `apps/platform`
- **Backend** (FastAPI): REST API at `apps/backend`
- **Agent Worker**: LiveKit voice agent with Google STT/TTS
- **Database**: PostgreSQL with pgAdmin
- **LiveKit**: Real-time voice communication
- **Google APIs**: Speech-to-Text, Text-to-Speech, Gemini LLM

## Services

### Backend API (Port 8000)
REST endpoints for room creation and token generation:
- `POST /livekit/rooms` - Create a LiveKit room
- `POST /livekit/token` - Generate participant token
- `POST /livekit/agent-token` - Generate agent token

### Agent Worker
Automatically connects to LiveKit rooms and provides:
- Speech recognition (Google STT)
- Natural language understanding (Google Gemini)
- Speech synthesis (Google TTS)
- Real-time voice interaction

## Getting API Keys

### LiveKit
1. Sign up at [LiveKit Cloud](https://cloud.livekit.io)
2. Create a new project
3. Copy the WebSocket URL, API Key, and API Secret
4. Add to `.env` in project root

### Google API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and enable:
   - Cloud Speech-to-Text API
   - Cloud Text-to-Speech API
   - Vertex AI API (for Gemini)
3. Create an API key in "Credentials"
4. Add to `.env` as `GOOGLE_API_KEY`

## Vagrant Setup

Start Linux VM: vagrant up
Run stack inside VM: ```vagrant ssh``` then cd ```/vagrant && docker compose up --build```
Open on your Windows host browser: http://localhost:3000 (camera access uses your host browser/device)

## Run the whole app on Linux (Vagrant)

This repo includes a `Vagrantfile` that boots an Ubuntu VM and installs Docker + Compose.

1) Install prerequisites on your host:
- Vagrant
- VirtualBox

2) Boot the VM:

```sh
vagrant up
```

3) Run the full stack inside the VM:

```sh
vagrant ssh
cd /vagrant
docker compose up --build
```

4) Open from your host browser:
- Frontend: http://localhost:3000
- Backend: http://localhost:8000/docs
- pgAdmin: http://localhost:5050

If any of those ports are already in use on your host, run `vagrant port` to see the auto-corrected host port mappings.

### Public vs private forwarded ports

By default:
- **Public (LAN)**: `3000` (frontend), `8000` (backend) bind to `0.0.0.0`
- **Private (localhost-only)**: `5050` (pgAdmin), `5432` (Postgres) bind to `127.0.0.1`

You can override the bind IPs:

```sh
PUBLIC_HOST_IP=127.0.0.1 vagrant up
```

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build
yarn dlx turbo build
pnpm exec turbo build
```

You can build a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo build --filter=docs

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo build --filter=docs
yarn exec turbo build --filter=docs
pnpm exec turbo build --filter=docs
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev
yarn exec turbo dev
pnpm exec turbo dev
```

You can develop a specific package by using a [filter](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters):

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo dev --filter=web

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo dev --filter=web
yarn exec turbo dev --filter=web
pnpm exec turbo dev --filter=web
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo

# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo login

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo login
yarn exec turbo login
pnpm exec turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
# With [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation) installed (recommended)
turbo link

# Without [global `turbo`](https://turborepo.com/docs/getting-started/installation#global-installation), use your package manager
npx turbo link
yarn exec turbo link
pnpm exec turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
