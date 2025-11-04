package handler

import (
	"context"
	"log"

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

	err := clients.KafkaSenderClientToOrchestrator.WriteMessage(
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

		if responseId == projectId && response == sharedTypes.PROMPT_RESPONSE {
			return c.String(200, response)
		}
	}
}
