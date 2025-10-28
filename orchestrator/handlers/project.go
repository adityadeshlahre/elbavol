package handlers

import (
	"log"
	"os"

	"github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	"k8s.io/client-go/kubernetes"
)

func CreateProjectHandler(projectId string, senderToBroker *kafkaShared.KafkaClientWriter, k8sClient *kubernetes.Clientset) {
	// create /tmp/{projectId}.txt file for storing conversation history
	file, err := os.Create("/tmp/" + projectId + ".txt")
	if err != nil {
		log.Printf("Error creating file for project %s: %v", projectId, err)
		return
	}
	file.Close()

	// Create deployments for the project: global-broker (if not exists), project-controller, and project-serving
	namespace := projectId

	// Create global-broker deployment (only once, but for simplicity, create per project or check existence)
	// For scalability, assume global-broker is pre-deployed or create it here
	err = k8s.CreateGlobalBrokerDeployment(k8sClient, namespace)
	if err != nil {
		log.Printf("Error creating global-broker deployment: %v", err)
		// Continue, as it might already exist
	}

	// Create project-controller deployment
	err = k8s.CreateProjectControllerDeployment(k8sClient, namespace, projectId)
	if err != nil {
		log.Printf("Error creating controller deployment for project %s: %v", projectId, err)
		return
	}

	// Create project-serving deployment
	err = k8s.CreateProjectServingDeployment(k8sClient, namespace, projectId)
	if err != nil {
		log.Printf("Error creating serving deployment for project %s: %v", projectId, err)
		return
	}

	// The pods will handle Kafka communication internally
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
