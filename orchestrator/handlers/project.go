package handlers

import (
	"context"
	"log"
	"strings"

	"github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

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

	namespace := "default"

	// Create development deployment
	err := k8s.CreateNodeDevelopmentDeployment(k8sClient, namespace, projectId)
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
	ctx := context.Background()
	for {
		msg, err := recevingFromControl.Reader.ReadMessage(ctx)
		if err != nil {
			log.Printf("Error reading message from control pod: %v", err)
			continue
		}
		responseId := string(msg.Key)
		response := string(msg.Value)

		sepIndex := strings.Index(response, "|")
		if sepIndex == -1 {
			log.Printf("Malformed response: %v", response)
			continue
		}

		header := strings.TrimSpace(response[:sepIndex])
		payload := strings.TrimSpace(response[sepIndex+1:])

		if responseId == projectId && strings.Contains(header, sharedTypes.PROMPT_RESPONSE) {
			err = senderToBackend.WriteMessage(
				[]byte(projectId),
				[]byte(payload),
			)

			if err != nil {
				log.Printf("Failed to send LLM response to backend: %v", err)
				return
			}

			log.Printf("Sent LLM response back to backend for project %s", projectId)
			return
		}
	}
}
