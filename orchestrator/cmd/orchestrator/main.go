package main

import (
	"context"
	"log"

	"github.com/adityadeshlahre/elbavol/orchestrator/handlers"
	shared "github.com/adityadeshlahre/elbavol/shared"
	k8sShared "github.com/adityadeshlahre/elbavol/shared/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

var KafkaReceiverClientFromBackend *kafkaShared.KafkaClientReader
var KafkaSenderClientToBackend *kafkaShared.KafkaClientWriter
var KafkaReceiverClientFromControl *kafkaShared.KafkaClientReader
var KafkaSenderClientToControl *kafkaShared.KafkaClientWriter
var KafkaReceiverClientFromServing *kafkaShared.KafkaClientReader
var KafkaSenderClientToServing *kafkaShared.KafkaClientWriter

var KafkaClientBetweenPods *sharedTypes.KafkaClient

var K8sClient *kubernetes.Clientset

func main() {
	KafkaReceiverClientFromBackend = shared.NewReader(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	KafkaSenderClientToBackend = shared.NewWriter(sharedTypes.PROJECT_RESPONSE_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	KafkaReceiverClientFromControl = shared.NewReader(sharedTypes.CONTROL_TO_ORCHESTRATOR, sharedTypes.ORCHESTRATOR_GROUP_ID)
	KafkaSenderClientToControl = shared.NewWriter(sharedTypes.ORCHESTRATOR_TO_CONTROL, sharedTypes.ORCHESTRATOR_GROUP_ID)
	KafkaReceiverClientFromServing = shared.NewReader(sharedTypes.SERVING_TO_ORCHESTRATOR, sharedTypes.ORCHESTRATOR_GROUP_ID)
	KafkaSenderClientToServing = shared.NewWriter(sharedTypes.ORCHESTRATOR_TO_SERVING, sharedTypes.ORCHESTRATOR_GROUP_ID)
	KafkaClientBetweenPods = shared.NewClient(sharedTypes.POD_TOPIC, sharedTypes.POD_GROUP_ID)
	K8sClient = k8sShared.CreateK8sClient()

	// Start consumer from backend
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
				handlers.CreateProjectHandler(projectId, K8sClient)
				err = KafkaSenderClientToControl.WriteMessage([]byte(projectId), []byte(sharedTypes.PROJECT_INITIALIZED))
				if err != nil {
					log.Printf("Error sending response to backend: %v", err)
				}
			default:
				log.Printf("Unknown request type: %s", request)
			}
		}
	}()

	go func() {
		for {
			msg, err := KafkaReceiverClientFromServing.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message from serving pod: %v", err)
				continue
			}
			projectId := string(msg.Key)
			response := string(msg.Value)

			switch response {
			case sharedTypes.PROJECT_CREATED:
				err = KafkaSenderClientToBackend.WriteMessage([]byte(projectId), []byte("Project Created successfully"))
				if err != nil {
					log.Printf("Error sending project created confirmation to backend: %v", err)
				}
			default:
				log.Printf("Unknown request type: %s", response)
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
