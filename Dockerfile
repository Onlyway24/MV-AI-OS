# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

FROM ${NODE_IMAGE} AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM build AS verification
COPY eslint.config.js ./
COPY tests ./tests
COPY assets ./assets
COPY docs ./docs
COPY examples ./examples
COPY ops ./ops
COPY scripts ./scripts
COPY compose.production.yml Dockerfile ./
RUN npm run check

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
ENV TZ=Europe/Rome

RUN ! getent passwd 2001 >/dev/null \
    && ! getent group 2001 >/dev/null \
    && groupadd --gid 2001 onlyway \
    && useradd --uid 2001 --gid 2001 --system --home-dir /nonexistent \
      --no-create-home --shell /usr/sbin/nologin onlyway \
    && install -d -o root -g root -m 0755 /run/onlyway \
    && install -d -o 2001 -g 2001 -m 0700 \
      /var/lib/onlyway /var/backups/onlyway

WORKDIR /app
COPY --from=production-dependencies --chown=2001:2001 /app/node_modules ./node_modules
COPY --from=build --chown=2001:2001 /app/dist ./dist
COPY --chown=2001:2001 package.json ./package.json
COPY --chown=2001:2001 assets ./assets

USER 2001:2001
EXPOSE 43101
STOPSIGNAL SIGTERM
CMD ["node", "./dist/command-center/command-center-cli.js", "--config", "/etc/onlyway/runtime.json", "--host", "127.0.0.1", "--port", "43101", "--external-origin", "http://localhost:43100"]
