FROM oven/bun:1.3.1

WORKDIR /app

# Copy workspace manifests first for better layer caching
COPY package.json bun.lock turbo.json ./
COPY apps/platform/package.json apps/platform/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN bun install

# Copy the full repo
COPY . .

ENV NODE_ENV=development
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Support both dev and production modes via NODE_ENV
CMD ["sh", "-c", "if [ \"$NODE_ENV\" = \"production\" ]; then cd apps/platform && bun run build && bun run start; else cd apps/platform && bun run dev; fi"]
