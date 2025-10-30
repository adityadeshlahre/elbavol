package handlers

import (
	"context"
	"log"
	"os"

	"github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

func CreateProjectHandler(projectId string, k8sClient *kubernetes.Clientset, senderToControl *kafkaShared.KafkaClientWriter, receiverFromServing *kafkaShared.KafkaClientReader, senderToBackend *kafkaShared.KafkaClientWriter) {
	// create /tmp/{projectId}.txt file for storing conversation history
	file, err := os.Create("/tmp/" + projectId + ".txt")
	if err != nil {
		log.Printf("Error creating file for project %s: %v", projectId, err)
		return
	}
	file.Close()

	namespace := "default"

	// Create development deployment
	err = k8s.CreatePodDevelopmentDeployment(k8sClient, namespace, projectId)
	if err != nil {
		log.Printf("Error creating development deployment for project %s: %v", projectId, err)
		return
	}

	// Send message to control pod
	err = senderToControl.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_INITIALIZED))
	if err != nil {
		log.Printf("Error sending project initialized message to control pod for project %s: %v", projectId, err)
		return
	}

	// Await confirmation from serving pod
	ctx := context.Background()
	for {
		msg, err := receiverFromServing.Reader.ReadMessage(ctx)
		if err != nil {
			log.Printf("Error reading message from serving pod: %v", err)
			continue
		}
		pId := string(msg.Key)
		response := string(msg.Value)

		if pId == projectId && response == sharedTypes.PROJECT_CREATED {
			err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_CREATED))
			if err != nil {
				log.Printf("Error sending project created confirmation to backend: %v", err)
			}
			return
		}
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
