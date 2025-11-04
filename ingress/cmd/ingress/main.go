package main

import (
	"log"
	"os"
	"os/exec"
)

func main() {
	caddyfile := `*.localhost {
		tls internal
		reverse_proxy {http.request.host.labels.3}.default.svc.cluster.local:3000
	}

	respond "Not Found" 404
`

	err := os.WriteFile("/tmp/Caddyfile", []byte(caddyfile), 0644)
	if err != nil {
		log.Fatal("Failed to write Caddyfile:", err)
	}

	cmd := exec.Command("caddy", "run", "--config", "/tmp/Caddyfile")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	err = cmd.Run()
	if err != nil {
		log.Fatal("Failed to run Caddy:", err)
	}
}
