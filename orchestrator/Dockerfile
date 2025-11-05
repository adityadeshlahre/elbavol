FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY shared ./shared

COPY orchestrator ./orchestrator

WORKDIR /app/orchestrator

RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux go build -o orchestrator ./cmd/orchestrator

FROM alpine:latest

WORKDIR /root/

COPY --from=builder /app/orchestrator/orchestrator .

EXPOSE 8080

CMD ["./orchestrator"]