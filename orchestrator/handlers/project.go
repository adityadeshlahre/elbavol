package handlers

import (
	"log"
	"os"

	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
)

func CreateProjectHandler(projectId string, senderToBroker *kafkaShared.KafkaClientWriter) {
	// create /tmp/{projectId}.txt file for storing conversation history
	file, err := os.Create("/tmp/" + projectId + ".txt")
	if err != nil {
		log.Printf("Error creating file for project %s: %v", projectId, err)
		return
	}
	file.Close()

	// send message to broker via pubsub to create a pod for this projectId
	err = senderToBroker.WriteMessage([]byte(projectId), []byte("Create Pod"))
	if err != nil {
		log.Printf("Error sending message to broker for project %s: %v", projectId, err)
	}
}

func GetProjectByIdHandler(projectId string) {
	// read projectId.txt file and return conversation history
}

func DeleteProjectHandler(projectId string) {
	// delete projectId.txt file
	// send message to brocker via pubsub to delete all pods related to this projectId (github repo deletion case)

}

func ReceivePromptAndSendToProjectNodePubSubHandler(projectId string, prompt string) {
	// this will receive prompt from backend and send to project node via pubsub

}

func SendLLMResponseFromProjectNodeToBackendPubSubHandler(projectId string, response string) {
	// this will receive llm response from project node via pubsub and send to backend via pubsub to do server-sent events

}
