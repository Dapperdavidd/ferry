# Built from the repository root, because the API installs through the root workspace.
FROM node:24-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages
RUN npm ci --workspace @ferry/api --no-audit --no-fund --ignore-scripts
COPY apps/api apps/api
RUN npm --workspace @ferry/api run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
COPY apps/api/drizzle.config.ts apps/api/package.json apps/api/
COPY apps/api/src/db/schema.ts apps/api/src/db/schema.ts
WORKDIR /repo/apps/api
EXPOSE 8000
# Migrations run on every start; drizzle-kit skips the ones already applied.
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/main"]
