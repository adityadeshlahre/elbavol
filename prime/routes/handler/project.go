package handler

import (
	"log"
	"os"
	"time"

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

type ResponseManager interface {
	SetChannel(projectId string, ch chan string)
	GetAndDelete(projectId string) (chan string, bool)
	CleanupChannel(projectId string)
}

func CreateProjectHandler(c echo.Context) error {
	id, err := gonanoid.Generate("abcdefghijklmnopqrstuvwxyz", 10)
	if err != nil {
		log.Printf("Failed to generate project ID: %v", err)
		return c.String(500, "Failed to generate project ID")
	}

	log.Printf("Creating project with ID: %s", id)

	err = clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(id), []byte(sharedTypes.CREATE_PROJECT))
	if err != nil {
		log.Printf("Failed to send CREATE_PROJECT message for %s: %v", id, err)
		return c.String(500, "Failed to send project creation request")
	}

	log.Printf("Sent CREATE_PROJECT message for project %s", id)

	// Set up response channel with timeout
	responseManager := c.Get("responseManager").(ResponseManager)
	ch := make(chan string, 1)
	responseManager.SetChannel(id, ch)

	select {
	case response := <-ch:
		log.Printf("Received response for project %s: %s", id, response)

		if response == sharedTypes.PROJECT_CREATED {
			go func() {
				if file, err := os.Create("/tmp/" + id + ".txt"); err != nil {
					log.Printf("Error creating file for project %s: %v", id, err)
				} else {
					file.Close()
					log.Printf("Created project file for %s", id)
				}
			}()

			log.Printf("Successfully created project %s", id)
			return c.String(200, id)
		}

		log.Printf("Project creation failed for %s with response: %s", id, response)
		return c.String(500, "Project creation failed: "+response)

	case <-time.After(30 * time.Second):
		log.Printf("Timeout waiting for project creation response for %s", id)
		responseManager.CleanupChannel(id)
		return c.String(500, "Project creation timed out")
	}
}

func DeleteProjectHandler(c echo.Context) error {
	projectId := c.Param("projectId")

	if projectId == "" {
		return c.String(400, "Project ID is required")
	}

	log.Printf("Deleting project with ID: %s", projectId)

	err := clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(projectId), []byte(sharedTypes.DELETE_PROJECT))
	if err != nil {
		log.Printf("Failed to send DELETE_PROJECT message for %s: %v", projectId, err)
		return c.String(500, "Failed to send project deletion request")
	}

	log.Printf("Sent DELETE_PROJECT message for project %s", projectId)

	responseManager := c.Get("responseManager").(ResponseManager)
	ch := make(chan string, 1)
	responseManager.SetChannel(projectId, ch)

	select {
	case response := <-ch:
		log.Printf("Received delete response for project %s: %s", projectId, response)

		if response == sharedTypes.PROJECT_DELETED {
			err = os.Remove("/tmp/" + projectId + ".txt")
			if err != nil {
				log.Printf("Error deleting file for project %s: %v", projectId, err)
				log.Printf("Project %s deleted successfully (file cleanup failed)", projectId)
			}

			log.Printf("Successfully deleted project %s", projectId)
			return c.String(200, "Project deleted successfully")
		}

		log.Printf("Project deletion failed for %s with response: %s", projectId, response)
		return c.String(500, "Project deletion failed: "+response)

	case <-time.After(30 * time.Second):
		log.Printf("Timeout waiting for project deletion response for %s", projectId)
		responseManager.CleanupChannel(projectId)
		return c.String(500, "Project deletion timed out")
	}
}
