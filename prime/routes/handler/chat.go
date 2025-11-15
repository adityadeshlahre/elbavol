package handler

import (
	"context"
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
			go func() {
				file, err := os.OpenFile("/tmp/"+projectId+".txt", os.O_APPEND|os.O_WRONLY, 0644)
				if err != nil {
					log.Printf("Failed to open file for response in project %s: %v", projectId, err)
					return
				}
				defer file.Close()

				if _, err := file.WriteString("AGENT_RESPONSE : \"" + response + "\"\n"); err != nil {
					log.Printf("Failed to write response to file for project %s: %v", projectId, err)
				}
			}()
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
