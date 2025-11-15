package handler

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/adityadeshlahre/elbavol/prime/clients"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"github.com/labstack/echo/v4"
)

func BuildHandler(c echo.Context) error {
	projectId := c.QueryParam("projectId")
	if projectId == "" {
		return c.String(400, "projectId required")
	}

	if _, err := os.Stat("/tmp/" + projectId + ".txt"); os.IsNotExist(err) {
		return c.String(404, "project not found")
	}

	err := clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_BUILD))
	if err != nil {
		return c.String(500, "failed to trigger build")
	}

	log.Printf("Triggered build for project %s", projectId)

	responseManager := c.Get("responseManager").(ResponseManager)
	ch := make(chan string, 1)
	responseManager.SetChannel(projectId, ch)

	select {
	case response := <-ch:
		log.Printf("Received build response for project %s: %s", projectId, response)
		switch response {
		case sharedTypes.PROJECT_BUILD_SUCCESS:
			log.Printf("Build succeeded for project %s", projectId)
			err = clients.KafkaSenderClientToOrchestrator.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_RUN))
			if err != nil {
				log.Printf("Failed to trigger run for project %s: %v", projectId, err)
				return c.String(500, "failed to trigger run")
			}
			log.Printf("Triggered run for project %s", projectId)

			ch = make(chan string, 1)
			responseManager.SetChannel(projectId, ch)

			select {
			case runResponse := <-ch:
				log.Printf("Received run response for project %s: %s", projectId, runResponse)
				switch runResponse {
				case sharedTypes.PROJECT_RUN_SUCCESS:
					return c.String(200, fmt.Sprintf("%s.localhost:3000", projectId))
				case sharedTypes.PROJECT_RUN_FAILED:
					log.Printf("Run failed for project %s", projectId)
					errorMsg := "unknown error"
					if idx := strings.Index(runResponse, "|"); idx != -1 {
						errorMsg = runResponse[idx+1:]
					}
					return c.String(500, "run failed: "+errorMsg)
				case sharedTypes.PROJECT_FAILED:
					log.Printf("Run failed for project %s", projectId)
					errorMsg := "unknown error"
					if idx := strings.Index(runResponse, "|"); idx != -1 {
						errorMsg = runResponse[idx+1:]
					}
					return c.String(500, "run failed: "+errorMsg)
				default:
					log.Printf("Unknown run response for project %s: %s", projectId, runResponse)
					return c.String(500, "unknown run response")
				}
			case <-c.Request().Context().Done():
				log.Printf("Run request for project %s timed out", projectId)
				return c.String(504, "run timed out")
			}
		case sharedTypes.PROJECT_BUILD_FAILED:
			log.Printf("Build failed for project %s", projectId)
			errorMsg := "unknown error"
			if idx := strings.Index(response, "|"); idx != -1 {
				errorMsg = response[idx+1:]
			}
			return c.String(500, "build failed: "+errorMsg)
		default:
			log.Printf("Unknown build response for project %s: %s", projectId, response)
			return c.String(500, "unknown build response")
		}
	case <-c.Request().Context().Done():
		log.Printf("Build request for project %s timed out", projectId)
		return c.String(504, "build timed out")
	}
}
