FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

COPY shared ./shared

COPY ingress ./ingress

WORKDIR /app/ingress

RUN go mod download

RUN CGO_ENABLED=0 GOOS=linux go build -o ingress ./cmd/ingress

FROM alpine:latest

WORKDIR /root/

COPY --from=builder /app/ingress/ingress .

EXPOSE 8080

CMD ["./ingress"]