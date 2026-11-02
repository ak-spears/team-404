# syntax=docker/dockerfile:1
ARG NODE_IMAGE=harbor.capstone.uamishub.com/dockerhub-proxy/library/node:22-alpine

FROM ${NODE_IMAGE} AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm --filter @crimson-copies/shared build
RUN pnpm --filter @crimson-copies/notify build

FROM build AS prune
RUN pnpm --filter @crimson-copies/notify --prod deploy /prod/notify

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prune --chown=65532:65532 /prod/notify ./
USER 65532:65532
EXPOSE 4100
CMD ["node", "dist/server.js"]