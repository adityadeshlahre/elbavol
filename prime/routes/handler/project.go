package handler

import (
	"context"
	"log"

	"github.com/adityadeshlahre/elbavol/prime/clients"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"github.com/labstack/echo/v4"
	gonanoid "github.com/matoous/go-nanoid/v2"
)

var router *echo.Echo

func SetProjectRouter(r *echo.Echo) {
	router = r
}

func ProjectRoutes() {
	projectGroup := router.Group("/project")
	{
		projectGroup.POST("/create", CreateProjectHandler)
	}
}

func CreateProjectHandler(c echo.Context) error {

	id, err := gonanoid.Generate("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ", 10)
	if err != nil {
		return c.String(500, "Failed to generate ID")
	}

	err = clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(id), []byte(sharedTypes.CREATE_PROJECT))
	if err != nil {
		return c.String(500, "Failed to send message")
	}

	// Await response
	ctx := context.Background()
	for {
		msg, err := clients.KafkaReceiverClientFromOrchestrator.Reader.ReadMessage(ctx)
		if err != nil {
			log.Printf("Error reading message: %v", err)
			return c.String(500, "Failed to read response")
		}
		projectId := string(msg.Key)
		response := string(msg.Value)

		if projectId == id && response == sharedTypes.PROJECT_CREATED {
			return c.String(200, "Project created with ID: "+projectId)
		}
	}
}
