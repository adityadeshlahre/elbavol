package handlers

import (
	"log"

	"github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

var ServeResponses = make(map[string]chan string)
var ControlResponses = make(map[string]chan string)

func CreateProjectHandler(
	projectId string,
	k8sClient *kubernetes.Clientset,
	senderToControl *kafkaShared.KafkaClientWriter,
	receiverFromServing *kafkaShared.KafkaClientReader,
	senderToBackend *kafkaShared.KafkaClientWriter,
) {
	// create /tmp/{projectId}.txt file for storing conversation history
	// file, err := os.Create("/tmp/" + projectId + ".txt")
	// if err != nil {
	// 	log.Printf("Error creating file for project %s: %v", projectId, err)
	// 	return
	// }
	// file.Close()

	// namespace := "default"

	// Create development deployment
	// err := k8s.CreateNodeDevelopmentDeployment(k8sClient, namespace, projectId)
	// if err != nil {
	// 	log.Printf("Error creating development deployment for project %s: %v", projectId, err)
	// 	return
	// }

	// Send message to control pod
	err := senderToControl.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_INITIALIZED))
	if err != nil {
		log.Printf("Error sending project initialized message to control pod for project %s: %v", projectId, err)
		return
	}

	// Await confirmation from serving pod
	ch := make(chan string, 1)
	ServeResponses[projectId] = ch
	response := <-ch

	if response == sharedTypes.PROJECT_CREATED {
		err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_CREATED))
		if err != nil {
			log.Printf("Error sending project created confirmation to backend: %v", err)
		}
		return
	}
}

func DeleteProjectHandler(projectId string,
	k8sClient *kubernetes.Clientset,
	senderToBackend *kafkaShared.KafkaClientWriter) {
	namespace := "default"

	// Delete development deployment
	err := k8s.DeleteNodeDevelopmentDeployment(k8sClient, namespace, projectId)
	if err != nil {
		log.Printf("Error deleting development deployment for project %s: %v", projectId, err)
		return
	}

	// Send deletion confirmation to backend
	err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_DELETED))
	if err != nil {
		log.Printf("Error sending project deleted confirmation to backend: %v", err)
		return
	}

}

func ReceivePromptAndSendLLMResponseAndSendToProjectNodeAndToBackendAgainPubSubHandler(
	projectId string,
	prompt string,
	senderToControl *kafkaShared.KafkaClientWriter,
	recevingFromControl *kafkaShared.KafkaClientReader,
	senderToBackend *kafkaShared.KafkaClientWriter,
) {
	err := senderToControl.WriteMessage(
		[]byte(projectId),
		[]byte(sharedTypes.PROMPT+"|"+prompt),
	)
	if err != nil {
		log.Printf("Failed to send prompt to control pod for project %s: %v", projectId, err)
		return
	}

	// Await response from control pod
	ch := make(chan string, 1)
	ControlResponses[projectId] = ch
	payload := <-ch

	err = senderToBackend.WriteMessage(
		[]byte(projectId),
		[]byte(payload),
	)

	if err != nil {
		log.Printf("Failed to send LLM response to backend: %v", err)
		return
	}

	log.Printf("Sent LLM response back to backend for project %s", projectId)
}
