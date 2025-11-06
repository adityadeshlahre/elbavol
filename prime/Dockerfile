FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY shared ./shared

COPY prime ./prime

WORKDIR /app/prime

RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o prime ./cmd/prime

FROM alpine:latest

WORKDIR /root/

COPY --from=builder /app/prime/prime .

EXPOSE 8080

CMD ["./prime"]