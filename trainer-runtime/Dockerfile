FROM node:22-bookworm-slim AS node

FROM golang:1.25-bookworm AS go-job
COPY --from=node /usr/local/bin/node /usr/local/bin/node
WORKDIR /runtime
COPY go-worker.mjs ./
# Warm the standard-library cache once; no module downloads during jobs.
RUN printf 'package main\nimport("fmt";"bufio";"os";"sort";"strings";"strconv";"math";"encoding/json";"container/heap")\nfunc main(){fmt.Println(bufio.NewReader(os.Stdin),sort.Ints,strings.TrimSpace,strconv.Atoi,math.Abs,json.Marshal,heap.Init)}\n' > /tmp/warm.go \
    && CGO_ENABLED=0 go build -trimpath -ldflags='-s -w' -o /tmp/warm /tmp/warm.go \
    && chmod -R a+rX /root/.cache/go-build \
    && cp -a /root/.cache/go-build /opt/go-cache
ENV GOCACHE=/tmp/go-cache GOMODCACHE=/tmp/go-mod HOME=/tmp GOENV=off GOPROXY=off GOSUMDB=off CGO_ENABLED=0
USER 10001:10001
ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "180s", "node", "/runtime/go-worker.mjs"]

FROM mcr.microsoft.com/playwright:v1.58.2-noble AS frontend-job
WORKDIR /runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && chmod -R a+rX /runtime
COPY frontend-worker.mjs frontend.mjs native-style.mjs ./
ENV HOME=/tmp NODE_ENV=production
USER 10001:10001
ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "180s", "node", "/runtime/frontend-worker.mjs"]

FROM node:22-alpine AS gateway
RUN apk add --no-cache docker-cli
WORKDIR /runtime
COPY server.mjs gateway.mjs validation.mjs next-runtime.mjs runtime-limits.mjs ./
ENV NODE_ENV=production PORT=3100
EXPOSE 3100
CMD ["node", "server.mjs"]
