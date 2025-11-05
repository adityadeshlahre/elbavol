package handler

import (
	"context"
	"log"
	"os"

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
		projectGroup.DELETE("/delete/:projectId", DeleteProjectHandler)
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

		file, err := os.Create("/tmp/" + id + ".txt")
		if err != nil {
			log.Printf("Error creating file for project %s: %v", id, err)
			return c.String(500, "Failed to create project file")
		}
		defer file.Close()

		if projectId == id && response == sharedTypes.PROJECT_CREATED {
			return c.String(200, projectId)
		}
	}
}

func DeleteProjectHandler(c echo.Context) error {
	projectId := c.Param("projectId")

	err := clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(projectId), []byte(sharedTypes.DELETE_PROJECT))
	if err != nil {
		return c.String(500, "Failed to send delete message")
	}

	ctx := context.Background()
	for {
		msg, err := clients.KafkaReceiverClientFromOrchestrator.Reader.ReadMessage(ctx)
		if err != nil {
			log.Printf("Error reading message: %v", err)
			return c.String(500, "Failed to read response")
		}
		ProjectId := string(msg.Key)
		response := string(msg.Value)

		err = os.Remove("/tmp/" + ProjectId + ".txt")
		if err != nil {
			log.Printf("Error deleting file for project %s: %v", projectId, err)
			return c.String(500, "Failed to delete project file")
		}

		if projectId == ProjectId && response == sharedTypes.PROJECT_DELETED {
			return c.String(200, "Project deleted successfully")
		}
	}
}
