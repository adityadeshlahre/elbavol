package main

import (
	"context"
	"log"
	"os"
	"strings"

	"github.com/adityadeshlahre/elbavol/prime/clients"
	"github.com/adityadeshlahre/elbavol/prime/response"
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

	responseManager := response.NewResponseManager()
	go func() {
		for {
			msg, err := clients.KafkaReceiverClientFromOrchestrator.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message: %v", err)
				continue
			}
			projectId := string(msg.Key)
			response := string(msg.Value)
			log.Printf("Received response for project %s: %s", projectId, response)

			if ch, ok := responseManager.GetAndDelete(projectId); ok {
				select {
				case ch <- response:
					log.Printf("Successfully sent response to channel for project %s", projectId)
				default:
					log.Printf("Channel was closed for project %s", projectId)
				}
			} else {
				if strings.HasPrefix(response, "AI_RESPONSE: ") {
					file, err := os.OpenFile("/tmp/"+projectId+".txt", os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
					if err != nil {
						log.Printf("Failed to open file for project %s: %v", projectId, err)
						return
					}
					defer file.Close()

					if _, err := file.WriteString(response + "\n"); err != nil {
						log.Printf("Failed to write AI response to file for project %s: %v", projectId, err)
					}
					log.Printf("Saved AI response for project %s", projectId)
				} else {
					log.Printf("No waiting channel found for project %s", projectId)
				}
			}
		}
	}()

	// Start Server
	e := server.NewServer()
	e.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set("responseManager", responseManager)
			return next(c)
		}
	})

	e.Logger.Fatal(e.Start(":8080"))
}
