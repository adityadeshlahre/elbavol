FROM oven/bun:1 AS base
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY runable/package.json runable/bun.lock /temp/dev/
COPY runable/packages /temp/dev/packages/
COPY runable/apps/sse/package.json /temp/dev/apps/sse/
RUN cd /temp/dev && bun install

RUN mkdir -p /temp/prod
COPY runable/package.json runable/bun.lock /temp/prod/
COPY runable/packages /temp/prod/packages/
COPY runable/apps/sse/package.json /temp/prod/apps/sse/
RUN cd /temp/prod && bun install

FROM base AS prerelease
COPY --from=install /temp/dev/package.json .
COPY --from=install /temp/dev/bun.lock .
COPY --from=install /temp/dev/node_modules node_modules
COPY --from=install /temp/dev/packages ./packages/
COPY runable/apps ./apps
RUN bun install

ENV NODE_ENV=production
RUN cd apps/sse && bun run compile

FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/packages ./packages/
COPY --from=prerelease /usr/src/app/apps ./apps
COPY --from=prerelease /usr/src/app/package.json .

RUN rm -rf apps/*/src apps/*/*.map packages/*/src packages/*/*.map *.map

WORKDIR /usr/src/app/apps/sse
USER bun
EXPOSE 3001/tcp
ENTRYPOINT [ "bun", "run", "index.js" ]