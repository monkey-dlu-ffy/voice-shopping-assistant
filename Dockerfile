# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# One image, two stages.
#
# The image built here is the single deployable artefact: `docker compose up`
# runs it locally against a Mongo container, and `gcloud run deploy` runs the
# exact same image in production. Express serves both the API and the built
# React app, so there is one process, one port and no CORS in production.
# ---------------------------------------------------------------------------

FROM node:24-alpine AS build
WORKDIR /app

# Copy manifests first so the dependency layer is cached independently of source.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY . .

# Fail the build on a type error or a failing test rather than shipping it.
RUN npm run typecheck && npm test && npm run build


FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# The workspace symlink at node_modules/@vsa/shared points into packages/shared,
# so that package's manifest and dist must both be present.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Drop build-only dependencies from the shipped image.
RUN npm prune --omit=dev && chown -R node:node /app

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
