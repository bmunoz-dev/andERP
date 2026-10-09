# F07 CA-6: imagen de la API. Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t anderp-api .

# ── Build: dependencias completas, compila shared y la API, y aísla las de producción ──────
FROM node:24-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @anderp/api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @anderp/shared build \
 && pnpm --filter @anderp/api build \
 && pnpm --filter @anderp/api deploy --prod --legacy /out

# ── Runtime: solo dist y dependencias de producción, como usuario no root ────────────────
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out/package.json ./
COPY --from=build --chown=node:node /out/node_modules ./node_modules
COPY --from=build --chown=node:node /out/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/main.js"]
