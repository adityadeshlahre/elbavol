package main

import (
	"context"
	"log"

	"github.com/adityadeshlahre/elbavol/prime/clients"
	"github.com/adityadeshlahre/elbavol/prime/server"
	shared "github.com/adityadeshlahre/elbavol/shared"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"github.com/labstack/echo/v4"
)

func main() {

	clients.KafkaReceiverClientFromOrchestrator = shared.NewReader(
		sharedTypes.ORCHESTRATOR_TO_PRIME,
		sharedTypes.PROJECT_GROUP_ID,
	)
	clients.KafkaSenderClientToOrchestrator = shared.NewWriter(
		sharedTypes.PRIME_TO_ORCHESTRATOR,
		sharedTypes.PROJECT_GROUP_ID,
	)
	// defer clients.KafkaReceiverClientFromOrchestrator.Close()
	// defer clients.KafkaSenderClientToOrchestrator.Close()

	// Start message dispatcher
	responses := make(map[string]chan string)
	go func() {
		for {
			msg, err := clients.KafkaReceiverClientFromOrchestrator.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message: %v", err)
				continue
			}
			projectId := string(msg.Key)
			response := string(msg.Value)
			if ch, ok := responses[projectId]; ok {
				ch <- response
				delete(responses, projectId)
			}
		}
	}()

	// Start Server
	e := server.NewServer()
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set("responses", responses)
			return next(c)
		}
	})

	e.Logger.Fatal(e.Start(":8080"))
}
