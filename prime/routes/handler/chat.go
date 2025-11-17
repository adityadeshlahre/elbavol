package handler

import (
	"encoding/json"
	"log"
	"os"

	"github.com/adityadeshlahre/elbavol/prime/clients"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"github.com/labstack/echo/v4"
)

func SetChatRouter(r *echo.Echo) {
	router = r
}

func ChatRoutes() {
	chatGroup := router.Group("/project")
	{
		chatGroup.POST("/:projectId", ChatMessageHandler)
		chatGroup.GET("/:projectId", GetProjectChatByIdHandler)
	}
}

type ChatReq struct {
	Prompt string `json:"prompt"`
}

type ChatMessage struct {
	Type    string `json:"type"`
	Payload string `json:"payload"`
}

func ChatMessageHandler(c echo.Context) error {

	projectId := c.Param("projectId")
	var chatReq ChatReq
	if err := c.Bind(&chatReq); err != nil {
		return c.String(400, "Invalid request")
	}
	prompt := chatReq.Prompt

	responseManagerInterface := c.Get("responseManager")
	if responseManagerInterface == nil {
		log.Printf("Response manager not found in context")
		return c.String(500, "Internal server error: Response manager not initialized")
	}

	responseManager, ok := responseManagerInterface.(interface {
		SetChannel(string, chan string)
		GetAndDelete(string) (chan string, bool)
		CleanupChannel(string)
	})
	if !ok {
		log.Printf("Failed to cast response manager")
		return c.String(500, "Internal server error: Invalid response manager")
	}

	go func() {
		file, err := os.OpenFile("/tmp/"+projectId+".txt", os.O_APPEND|os.O_WRONLY|os.O_CREATE, 0644)
		if err != nil {
			log.Printf("Failed to open file for project %s: %v", projectId, err)
			return
		}
		defer file.Close()

		if _, err := file.WriteString("USER_PROMPT : \"" + prompt + "\"\n"); err != nil {
			log.Printf("Failed to write prompt to file for project %s: %v", projectId, err)
		}
	}()

	responseCh := make(chan string, 1)
	responseManager.SetChannel(projectId, responseCh)
	defer responseManager.CleanupChannel(projectId)

	msg := sharedTypes.ChatMessage{
		Type:    sharedTypes.PROMPT,
		Payload: prompt,
	}
	data, _ := json.Marshal(msg)

	err := clients.KafkaSenderClientToOrchestrator.WriteMessage(
		[]byte(projectId),
		data,
	)
	if err != nil {
		return c.String(500, "Failed to send message")
	}

	ctx := c.Request().Context()
	select {
	case sseUrl := <-responseCh:
		log.Printf("Received SSE URL for project %s: %s", projectId, sseUrl)

		go func() {
			file, err := os.OpenFile("/tmp/"+projectId+".txt", os.O_APPEND|os.O_WRONLY, 0644)
			if err != nil {
				log.Printf("Failed to open file for SSE URL in project %s: %v", projectId, err)
				return
			}
			defer file.Close()

			if _, err := file.WriteString("SSE_URL : \"" + sseUrl + "\"\n"); err != nil {
				log.Printf("Failed to write SSE URL to file for project %s: %v", projectId, err)
			}
		}()

		return c.JSON(200, map[string]string{"sseUrl": sseUrl})

	case <-ctx.Done():
		log.Printf("Request cancelled for project %s", projectId)
		return c.String(408, "Request timeout")
	}
}

func GetProjectChatByIdHandler(c echo.Context) error {
	projectId := c.Param("projectId")
	filePath := "/tmp/" + projectId + ".txt"

	content, err := os.ReadFile(filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return c.String(404, "chat doesn't exist")
		}
		return c.String(500, "Failed to read file")
	}

	return c.String(200, string(content))
}
