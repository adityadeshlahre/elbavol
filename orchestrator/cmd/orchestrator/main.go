package main

import (
	"context"
	"log"
	"strings"

	"github.com/adityadeshlahre/elbavol/orchestrator/handlers"
	shared "github.com/adityadeshlahre/elbavol/shared"
	k8sShared "github.com/adityadeshlahre/elbavol/shared/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	"github.com/adityadeshlahre/elbavol/shared/prompt"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

var KafkaReceiverClientFromBackend *kafkaShared.KafkaClientReader
var KafkaSenderClientToBackend *kafkaShared.KafkaClientWriter
var KafkaReceiverClientFromControl *kafkaShared.KafkaClientReader
var KafkaSenderClientToControl *kafkaShared.KafkaClientWriter
var KafkaReceiverClientFromServing *kafkaShared.KafkaClientReader
var KafkaSenderClientToServing *kafkaShared.KafkaClientWriter

var K8sClient *kubernetes.Clientset

func main() {
	KafkaReceiverClientFromBackend = shared.NewReader(sharedTypes.PRIME_TO_ORCHESTRATOR, sharedTypes.PROJECT_GROUP_ID)
	KafkaSenderClientToBackend = shared.NewWriter(sharedTypes.ORCHESTRATOR_TO_PRIME, sharedTypes.PROJECT_GROUP_ID)
	KafkaReceiverClientFromControl = shared.NewReader(
		sharedTypes.CONTROL_TO_ORCHESTRATOR,
		sharedTypes.ORCHESTRATOR_GROUP_ID,
	)
	KafkaSenderClientToControl = shared.NewWriter(
		sharedTypes.ORCHESTRATOR_TO_CONTROL,
		sharedTypes.ORCHESTRATOR_GROUP_ID,
	)
	KafkaReceiverClientFromServing = shared.NewReader(
		sharedTypes.SERVING_TO_ORCHESTRATOR,
		sharedTypes.ORCHESTRATOR_GROUP_ID,
	)
	KafkaSenderClientToServing = shared.NewWriter(
		sharedTypes.ORCHESTRATOR_TO_SERVING,
		sharedTypes.ORCHESTRATOR_GROUP_ID,
	)
	K8sClient = k8sShared.CreateK8sClient()

	go func() {
		for {
			msg, err := KafkaReceiverClientFromServing.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message from serving: %v", err)
				continue
			}
			pId := string(msg.Key)
			response := string(msg.Value)

			log.Printf("Received message from serving pod for project %s: %s", pId, response)

			if ch, ok := handlers.ServerResponses[pId]; ok {
				select {
				case ch <- response:
					log.Printf("Sent response to waiting channel for project %s", pId)
				default:
					log.Printf("No waiting channel or channel closed for project %s", pId)
				}
				delete(handlers.ServerResponses, pId)
			}

			switch response {
			case sharedTypes.PROJECT_CREATED:
				log.Printf("Forwarding PROJECT_CREATED to backend for project %s", pId)
				err := KafkaSenderClientToBackend.WriteMessage([]byte(pId), []byte(sharedTypes.PROJECT_CREATED))
				if err != nil {
					log.Printf("Failed to send PROJECT_CREATED message to backend for project %s: %v", pId, err)
				} else {
					log.Printf("Successfully sent PROJECT_CREATED to backend for project %s", pId)
				}

			case sharedTypes.PROJECT_FAILED:
				log.Printf("Forwarding PROJECT_FAILED to backend for project %s", pId)
				err := KafkaSenderClientToBackend.WriteMessage([]byte(pId), []byte(sharedTypes.PROJECT_FAILED))
				if err != nil {
					log.Printf("Failed to send PROJECT_FAILED message to backend for project %s: %v", pId, err)
				}

			// case sharedTypes.PROJECT_RUN:
			// 	log.Printf("Forwarding PROJECT_RUN to backend for project %s", pId)
			// 	err := KafkaSenderClientToBackend.WriteMessage([]byte(pId), []byte(sharedTypes.PROJECT_RUN))
			// 	if err != nil {
			// 		log.Printf("Failed to send PROJECT_RUN message to backend for project %s: %v", pId, err)
			// 	}

			case sharedTypes.PROJECT_RUN_SUCCESS:
				log.Printf("Forwarding PROJECT_RUN_SUCCESS to backend for project %s", pId)
				err := KafkaSenderClientToBackend.WriteMessage([]byte(pId), []byte(sharedTypes.PROJECT_RUN_SUCCESS))
				if err != nil {
					log.Printf("Failed to send PROJECT_RUN_SUCCESS message to backend for project %s: %v", pId, err)
				}

			case sharedTypes.PROJECT_RUN_FAILED:
				log.Printf("Forwarding PROJECT_RUN_FAILED to backend for project %s", pId)
				err := KafkaSenderClientToBackend.WriteMessage([]byte(pId), []byte(sharedTypes.PROJECT_RUN_FAILED))
				if err != nil {
					log.Printf("Failed to send PROJECT_RUN_FAILED message to backend for project %s: %v", pId, err)
				}

			default:
				log.Printf("Unknown response from serving pod for project %s: %s", pId, response)
			}
		}
	}()

	go func() {
		for {
			msg, err := KafkaReceiverClientFromControl.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message from control: %v", err)
				continue
			}
			responseId := string(msg.Key)
			response := string(msg.Value)
			sepIndex := strings.Index(response, "|")
			if sepIndex == -1 {
				continue
			}
			header := strings.TrimSpace(response[:sepIndex])
			payload := strings.TrimSpace(response[sepIndex+1:])
			if strings.Contains(header, sharedTypes.PROMPT_RESPONSE) {
				if ch, ok := handlers.ControlResponses[responseId]; ok {
					ch <- payload
					delete(handlers.ControlResponses, responseId)
				}
			}
			switch response {
			case sharedTypes.PROMPT_RESPONSE:
				err := KafkaSenderClientToBackend.WriteMessage([]byte(responseId), []byte(sharedTypes.PROMPT_RESPONSE+"|"+payload))
				if err != nil {
					log.Printf("Failed to send PROMPT_RESPONSE message to backend for project %s: %v", responseId, err)
				}

			case sharedTypes.PROJECT_FAILED:
				err := KafkaSenderClientToBackend.WriteMessage([]byte(responseId), []byte(sharedTypes.PROJECT_FAILED)) // project failed has smoe extra things to send
				if err != nil {
					log.Printf("Failed to send PROJECT_FAILED message to backend for project %s: %v", responseId, err)
				}

			case sharedTypes.PROJECT_BUILD_SUCCESS:
				err := KafkaSenderClientToBackend.WriteMessage([]byte(responseId), []byte(sharedTypes.PROJECT_BUILD_SUCCESS))
				if err != nil {
					log.Printf("Failed to send PROJECT_BUILD_SUCCESS message to backend for project %s: %v", responseId, err)
				}

			case sharedTypes.PROJECT_BUILD_FAILED:
				err := KafkaSenderClientToBackend.WriteMessage([]byte(responseId), []byte(sharedTypes.PROJECT_BUILD_FAILED))
				if err != nil {
					log.Printf("Failed to send PROJECT_BUILD_FAILED message to backend for project %s: %v", responseId, err)
				}

			default:
				log.Printf("Unknown response from control pod for project %s: %s", responseId, response)
			}
		}
	}()

	go func() {
		for {
			msg, err := KafkaReceiverClientFromBackend.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message from backend: %v", err)
				continue
			}
			projectId := string(msg.Key)
			request := string(msg.Value)

			switch request {
			case sharedTypes.CREATE_PROJECT:
				log.Printf("Processing CREATE_PROJECT request for project %s", projectId)
				go handlers.CreateProjectHandler(
					projectId,
					K8sClient,
					KafkaSenderClientToControl,
					KafkaReceiverClientFromServing,
					KafkaSenderClientToBackend,
				)

			case sharedTypes.DELETE_PROJECT:
				log.Printf("Processing DELETE_PROJECT request for project %s", projectId)
				go handlers.DeleteProjectHandler(
					projectId,
					K8sClient,
					// KafkaSenderClientToControl,
					// KafkaReceiverClientFromServing,
					KafkaSenderClientToBackend,
				)

			case sharedTypes.PROMPT:
				log.Printf("Processing PROMPT request for project %s", projectId)
				go handlers.ReceivePromptAndSendLLMResponseAndSendToProjectNodeAndToBackendAgainPubSubHandler(
					projectId,
					prompt.GetPromptFromBackendMessage(request),
					KafkaSenderClientToControl,
					KafkaReceiverClientFromControl,
					KafkaSenderClientToControl,
				)

			case sharedTypes.PROJECT_BUILD:
				log.Printf("Processing PROJECT_BUILD request for project %s", projectId)
				go handlers.BuildProjectHandler(
					projectId,
					KafkaSenderClientToControl,
					KafkaSenderClientToServing,
					KafkaSenderClientToBackend,
				)

			case sharedTypes.PROJECT_RUN:
				log.Printf("Processing PROJECT_RUN request for project %s", projectId)
				go handlers.RunProjectHandler(
					projectId,
					KafkaSenderClientToServing,
					KafkaSenderClientToBackend,
				)
			default:
				log.Printf("Unknown request type: %s for project %s", request, projectId)
			}
		}
	}()

	// defer KafkaReceiverClientFromBackend.Close()
	// defer KafkaSenderClientToBackend.Close()
	// defer KafkaReceiverClientFromControl.Close()
	// defer KafkaSenderClientToControl.Close()
	// defer KafkaReceiverClientFromServing.Close()
	// defer KafkaSenderClientToServing.Close()
	// defer KafkaClientBetweenPods.Reader.Close()
	// defer KafkaClientBetweenPods.Writer.Close()

	// Block forever to keep the application running
	select {}
}
