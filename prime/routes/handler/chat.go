package handler

import (
	"context"
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
	chatGroup := router.Group("/{projectId}")
	{
		chatGroup.POST("", ChatMessageHandler)
		chatGroup.GET("", GetProjectChatByIdHandler)
	}
}

type ChatReq struct {
	Prompt string `json:"prompt"`
}

func ChatMessageHandler(c echo.Context) error {

	projectId := c.Param("projectId")
	var chatReq ChatReq
	if err := c.Bind(&chatReq); err != nil {
		return c.String(400, "Invalid request")
	}
	prompt := chatReq.Prompt

	file, err := os.OpenFile("/tmp/"+projectId+".txt", os.O_APPEND|os.O_WRONLY, 0644)
	if err != nil {
		if os.IsNotExist(err) {
			return c.String(404, "project doesn't exist")
		}
		return c.String(500, "Failed to open file")
	}
	defer file.Close()

	if _, err := file.WriteString("User: " + prompt + "\n"); err != nil {
		return c.String(500, "Failed to write to file")
	}

	err = clients.KafkaSenderClientToOrchestrator.WriteMessage(
		[]byte(projectId),
		[]byte(sharedTypes.PROMPT+"|"+prompt),
	)
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
		responseId := string(msg.Key)
		response := string(msg.Value)

		if responseId == projectId && response != "" {
			if _, err := file.WriteString("AI: " + response + "\n"); err != nil {
				return c.String(500, "Failed to write to file")
			}
			return c.String(200, response)
		}
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
