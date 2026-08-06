# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:24.4.1-bookworm-slim@sha256:36ae19f59c91f3303c7a648f07493fe14c4bd91320ac8d898416327bacf1bbfa AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV CI=true
WORKDIR /app
RUN npm install --global pnpm@10.13.1
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.build.json ./
COPY apps ./apps
COPY packages ./packages
COPY drizzle ./drizzle
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM workspace AS runtime
ENV NODE_ENV=production
ENV LOCAL_ENGINEERING_MODE=false
ENV HOST=0.0.0.0
USER node

FROM runtime AS api
EXPOSE 3001
CMD ["pnpm", "--filter", "@legacy/api", "start"]

FROM runtime AS web
EXPOSE 3000
CMD ["pnpm", "--filter", "@legacy/web", "start"]

FROM runtime AS worker
CMD ["pnpm", "--filter", "@legacy/worker", "start"]

FROM runtime AS release
EXPOSE 3000 3001
CMD ["node", "scripts/run-release-stack.mjs"]
