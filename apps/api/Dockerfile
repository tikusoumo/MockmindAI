FROM oven/bun:latest AS base
WORKDIR /usr/src/app

FROM base AS install
ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

# Copy root files
COPY package.json bun.lock* ./

# Copy workspace package.json
COPY apps/api/package.json apps/api/

# Install dependencies
RUN bun install

FROM base AS prerelease
COPY --from=install /usr/src/app/node_modules node_modules
COPY --from=install /usr/src/app/apps/api/node_modules apps/api/node_modules
COPY . .

# Build the specific app
WORKDIR /usr/src/app/apps/api
RUN bunx prisma generate
RUN bun run build

FROM base AS release
WORKDIR /usr/src/app

COPY --from=prerelease /usr/src/app/node_modules node_modules
COPY --from=prerelease /usr/src/app/apps/api/node_modules apps/api/node_modules
COPY --from=prerelease /usr/src/app/apps/api/dist apps/api/dist
COPY --from=prerelease /usr/src/app/apps/api/package.json apps/api/
COPY --from=prerelease /usr/src/app/apps/api/prisma apps/api/prisma
COPY --from=prerelease /usr/src/app/package.json .

# Expose port
EXPOSE 3001

# Start the application
WORKDIR /usr/src/app/apps/api
CMD [ "bun", "run", "start:prod" ]
