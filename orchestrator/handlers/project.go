package handlers

import (
	"log"
	"strings"

	"github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

var ServerResponses = make(map[string]chan string)
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
		// Send failure message back to backend
		senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_FAILED))
		return
	}

	log.Printf("Sent PROJECT_INITIALIZED message to control pod for project %s", projectId)

	// The response will be handled by the serving message listener in main.go
	// This prevents blocking and allows concurrent project creation
	log.Printf("Project creation initiated for %s, waiting for serving pod confirmation", projectId)
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

	// Await SSE URL from control pod
	ch := make(chan string, 1)
	ControlResponses[projectId] = ch
	payload := <-ch

	// Parse "PROMPT_RESPONSE|<sseUrl>"
	parts := strings.Split(payload, "|")
	var sseUrl string
	if len(parts) >= 2 && parts[0] == sharedTypes.PROMPT_RESPONSE {
		sseUrl = parts[1]
	} else {
		sseUrl = payload // fallback
	}

	err = senderToBackend.WriteMessage(
		[]byte(projectId),
		[]byte(sseUrl),
	)

	if err != nil {
		log.Printf("Failed to send SSE URL to backend: %v", err)
		return
	}

	log.Printf("Sent SSE URL back to backend for project %s", projectId)
}

func BuildProjectHandler(
	projectId string,
	senderToControl *kafkaShared.KafkaClientWriter,
	senderToServing *kafkaShared.KafkaClientWriter,
	senderToBackend *kafkaShared.KafkaClientWriter,
) error {
	err := senderToControl.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_BUILD))
	if err != nil {
		log.Printf("Failed to send PROJECT_BUILD message to control pod for project %s: %v", projectId, err)
		return err
	}

	ch := make(chan string, 1)
	ControlResponses[projectId] = ch
	payload := <-ch

	if payload != sharedTypes.PROJECT_BUILD_SUCCESS {
		log.Printf("Project build failed for project %s: %s", projectId, payload)
		err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_BUILD_FAILED))
		if err != nil {
			log.Printf("Failed to send PROJECT_FAILED message to backend for project %s: %v", projectId, err)
		}
		return nil
	} else {
		log.Printf("Project build succeeded for project %s", projectId)
		err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_BUILD_SUCCESS))
		if err != nil {
			log.Printf("Failed to send PROJECT_BUILD_SUCCESS message to backend for project %s: %v", projectId, err)
			return err
		}
	}

	// err = senderToServing.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_RUN))
	// if err != nil {
	// 	log.Printf("Failed to send PROJECT_BUILD message to serving pod for project %s: %v", projectId, err)
	// 	return err
	// }

	// ch = make(chan string, 1)
	// ServerResponses[projectId] = ch
	// payload = <-ch

	// if payload != sharedTypes.PROJECT_RUN_SUCCESS {
	// 	log.Printf("Project run failed for project %s: %s", projectId, payload)
	// 	err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_FAILED))
	// 	if err != nil {
	// 		log.Printf("Failed to send PROJECT_FAILED message to backend for project %s: %v", projectId, err)
	// 	}
	// 	return err
	// } else {
	// 	log.Printf("Project run succeeded for project %s", projectId)
	// 	err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_RUN_SUCCESS))
	// 	if err != nil {
	// 		log.Printf("Failed to send PROJECT_RUN_SUCCESS message to backend for project %s: %v", projectId,
	// 			err)
	// 		return err
	// 	}
	// }

	log.Printf("Sent PROJECT_BUILD message to serving pod for project %s", projectId)
	return nil
}

func RunProjectHandler(
	projectId string,
	senderToServing *kafkaShared.KafkaClientWriter,
	senderToBackend *kafkaShared.KafkaClientWriter,
) error {
	err := senderToServing.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_RUN))
	if err != nil {
		log.Printf("Failed to send PROJECT_RUN message to serving pod for project %s: %v", projectId, err)
		return err
	}

	ch := make(chan string, 1)
	ServerResponses[projectId] = ch
	payload := <-ch

	if payload != sharedTypes.PROJECT_RUN_SUCCESS {
		log.Printf("Project run failed for project %s: %s", projectId, payload)
		err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_FAILED))
		if err != nil {
			log.Printf("Failed to send PROJECT_FAILED message to backend for project %s: %v", projectId, err)
		}
		return err
	} else {
		log.Printf("Project run succeeded for project %s", projectId)
		err = senderToBackend.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_RUN_SUCCESS))
		if err != nil {
			log.Printf("Failed to send PROJECT_RUN_SUCCESS message to backend for project %s: %v", projectId,
				err)
			return err
		}
	}

	log.Printf("Sent PROJECT_RUN message to serving pod for project %s", projectId)
	return nil
}
