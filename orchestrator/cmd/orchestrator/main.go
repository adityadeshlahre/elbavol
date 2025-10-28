package orchestrator

import (
	"context"
	"log"

	"github.com/adityadeshlahre/elbavol/orchestrator/handlers"
	shared "github.com/adityadeshlahre/elbavol/shared"
	k8sShared "github.com/adityadeshlahre/elbavol/shared/k8s"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	kubernetes "k8s.io/client-go/kubernetes"
)

var KafkaReceiverClientFromBackend *kafkaShared.KafkaClientReader
var KafkaSenderClientToBackend *kafkaShared.KafkaClientWriter
var KafkaReceiverClientFromBrocker *kafkaShared.KafkaClientReader
var KafkaSenderClientToBrocker *kafkaShared.KafkaClientWriter

var KafkaClientBetweenPods *sharedTypes.KafkaClient

var K8sClient *kubernetes.Clientset

func main() {
	KafkaReceiverClientFromBackend = shared.NewReader(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	KafkaSenderClientToBackend = shared.NewWriter(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	KafkaReceiverClientFromBrocker = shared.NewReader(sharedTypes.BROKER_TOPIC, sharedTypes.BROKER_GROUP_ID)
	KafkaSenderClientToBrocker = shared.NewWriter(sharedTypes.BROKER_TOPIC, sharedTypes.BROKER_GROUP_ID)
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
			if request == "Create Project Request" {
				handlers.CreateProjectHandler(projectId, KafkaSenderClientToBrocker, K8sClient)
				// Send response
				err = KafkaSenderClientToBackend.WriteMessage([]byte(projectId), []byte("Project created successfully"))
				if err != nil {
					log.Printf("Error sending response to backend: %v", err)
				}
			}
		}
	}()

	// defer KafkaReceiverClientFromBackend.Close()
	// defer KafkaSenderClientToBackend.Close()
	// defer KafkaReceiverClientFromBrocker.Close()
	// defer KafkaSenderClientToBrocker.Close()
	// defer KafkaClientBetweenPods.Reader.Close()
	// defer KafkaClientBetweenPods.Writer.Close()
}
