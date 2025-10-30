package main

import (
	"context"
	"log"

	shared "github.com/adityadeshlahre/elbavol/shared"
	k8sShared "github.com/adityadeshlahre/elbavol/shared/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	"k8s.io/client-go/kubernetes"
)

var KafkaReceiverClientFromOrchestrator *kafkaShared.KafkaClientReader
var KafkaSenderClientToOrchestrator *kafkaShared.KafkaClientWriter

var K8sClient *kubernetes.Clientset

func main() {

	// this will route the projectId.domain.com to the correct service based on projectId in the pod

	KafkaReceiverClientFromOrchestrator = shared.NewReader(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	KafkaSenderClientToOrchestrator = shared.NewWriter(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	// defer KafkaReceiverClientFromOrchestrator.Close()
	// defer KafkaSenderClientToOrchestrator.Close()

	projectIdToServiceIPMap := make(map[string]string)

	K8sClient = k8sShared.CreateK8sClient()
	// Start consumer from orchestrator
	go func() {
		for {
			msg, err := KafkaReceiverClientFromOrchestrator.Reader.ReadMessage(context.Background())
			if err != nil {
				log.Printf("Error reading message from orchestrator: %v", err)
				continue
			}
			projectId := string(msg.Key)
			serviceName := string(msg.Value)
			// Update the map
			projectIdToServiceIPMap[projectId] = serviceName
			log.Printf("Mapped projectId %s to service %s", projectId, serviceName)
		}
	}()

	select {}
}
