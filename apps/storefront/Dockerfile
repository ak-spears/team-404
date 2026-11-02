ARG NODE_IMAGE=harbor.capstone.uamishub.com/dockerhub-proxy/library/node:22-alpine
FROM ${NODE_IMAGE} AS deps
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV NEXT_TELEMETRY_DISABLED=1 \
    INTERNAL_API_KEY=build-time-placeholder \
    SESSION_SECRET=build-time-placeholder \
    ORDERS_API_URL=http://127.0.0.1:4000
RUN pnpm --filter @crimson-copies/shared build
RUN mkdir -p apps/storefront/public && pnpm --filter @crimson-copies/storefront build

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=65532:65532 /repo/apps/storefront/.next/standalone ./
COPY --from=build --chown=65532:65532 /repo/apps/storefront/.next/static ./apps/storefront/.next/static
COPY --from=build --chown=65532:65532 /repo/apps/storefront/public ./apps/storefront/public
USER 65532:65532
EXPOSE 3000
WORKDIR /app/apps/storefront
CMD ["node", "server.js"]