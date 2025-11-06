// Fixed Caddyfile
package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"

	"github.com/joho/godotenv"
)

func main() {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, proceeding with environment variables")
	}

	domain := os.Getenv("DOMAIN")
	if domain == "" {
		domain = "localhost"
	}

	caddyfile := fmt.Sprintf(`*.%s {
		tls internal
		reverse_proxy {http.request.host.labels.3}.default.svc.cluster.local:3000
		handle_errors {
			respond "404 Not Found" 404
		}
	}
`, domain)

	err = os.WriteFile("/tmp/Caddyfile", []byte(caddyfile), 0644)
	if err != nil {
		log.Fatal("Failed to write Caddyfile:", err)
	}

	cmd := exec.Command("/usr/bin/caddy", "run", "--config", "/tmp/Caddyfile")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err = cmd.Run()
	if err != nil {
		log.Fatal("Failed to run Caddy:", err)
	}
}
