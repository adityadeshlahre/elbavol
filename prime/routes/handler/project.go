package handler

import (
	"context"
	"log"

	"github.com/adityadeshlahre/elbavol/prime/clients"
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

	// Send request
	err = clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(id), []byte("Create Project Request"))
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
		if string(msg.Key) == id {
			return c.String(200, string(msg.Value))
		}
	}
}
