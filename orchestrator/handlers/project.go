package handlers

import (
	"log"
	"os"

	"github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	"k8s.io/client-go/kubernetes"
)

func CreateProjectHandler(projectId string, senderToControlPod *kafkaShared.KafkaClientWriter, k8sClient *kubernetes.Clientset) {
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

	// Send message to broker via pubsub that project is created
	err = senderToControlPod.WriteMessage([]byte(projectId), []byte("Project Created "+projectId))
	if err != nil {
		log.Printf("Error sending project created message to broker for project %s: %v", projectId, err)
		return
	}

	// await confirmation from serving pod that it has received the message

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
