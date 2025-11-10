package handler

import (
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
	responses := c.Get("responses").(map[string]chan string)
	ch := make(chan string, 1)
	responses[id] = ch
	response := <-ch

	file, err := os.Create("/tmp/" + id + ".txt")
	if err != nil {
		log.Printf("Error creating file for project %s: %v", id, err)
		return c.String(500, "Failed to create project file")
	}
	defer file.Close()

	if response == sharedTypes.PROJECT_CREATED {
		return c.String(200, id)
	}

	return c.String(500, "Unexpected response")
}

func DeleteProjectHandler(c echo.Context) error {
	projectId := c.Param("projectId")

	err := clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(projectId), []byte(sharedTypes.DELETE_PROJECT))
	if err != nil {
		return c.String(500, "Failed to send delete message")
	}

	responses := c.Get("responses").(map[string]chan string)
	ch := make(chan string, 1)
	responses[projectId] = ch
	response := <-ch

	err = os.Remove("/tmp/" + projectId + ".txt")
	if err != nil {
		log.Printf("Error deleting file for project %s: %v", projectId, err)
		return c.String(500, "Failed to delete project file")
	}

	if response == sharedTypes.PROJECT_DELETED {
		return c.String(200, "Project deleted successfully")
	}

	return c.String(500, "Unexpected response")
}
