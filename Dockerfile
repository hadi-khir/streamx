# Build stage
FROM node:22-bookworm-slim AS build
# Toolchain for native modules (better-sqlite3) when no prebuilt binary matches
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:22-bookworm-slim
# ffmpeg re-encodes audio browsers can't decode (AC-3, DTS) to AAC on the fly
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
ENV DATABASE_URL=/data/streamx.db

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/package.json ./

VOLUME /data
EXPOSE 3000

CMD ["node", "build"]
