# Built from the repository root, because the API installs through the root workspace.
FROM node:24-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
# The lockfile covers every workspace, so npm ci needs the mobile manifest to validate it; nothing of it is installed.
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages packages
RUN npm ci --workspace @ferry/api --legacy-peer-deps --no-audit --no-fund --ignore-scripts
COPY apps/api apps/api
RUN npm --workspace @ferry/api run build

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/apps/api/node_modules apps/api/node_modules
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle
COPY apps/api/package.json apps/api/
WORKDIR /repo/apps/api
EXPOSE 8000
# Migrations run on every start through drizzle-orm's migrator (plain JS); applied ones are skipped.
CMD ["sh", "-c", "node dist/migrate && node dist/main"]
