package orchestrator

import (
	k8s "github.com/adityadeshlahre/elbavol/orchestrator/k8s"
	shared "github.com/adityadeshlahre/elbavol/shared"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
	kubernetes "k8s.io/client-go/kubernetes"
)

var kafkaReceiverClientFromBackend *kafkaShared.KafkaClientReader
var kafkaSenderClientToBackend *kafkaShared.KafkaClientWriter
var kafkaReceiverClientFromBrocker *kafkaShared.KafkaClientReader
var kafkaSenderClientToBrocker *kafkaShared.KafkaClientWriter

var kafkaClientBetweenPods *sharedTypes.KafkaClient

var k8sClient *kubernetes.Clientset

func main() {
	kafkaReceiverClientFromBackend = shared.NewReader(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	kafkaSenderClientToBackend = shared.NewWriter(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	kafkaReceiverClientFromBrocker = shared.NewReader(sharedTypes.BROCKER_TOPIC, sharedTypes.BROCKER_GROUP_ID)
	kafkaSenderClientToBrocker = shared.NewWriter(sharedTypes.BROCKER_TOPIC, sharedTypes.BROCKER_GROUP_ID)
	kafkaClientBetweenPods = shared.NewClient(sharedTypes.POD_TOPIC, sharedTypes.POD_GROUP_ID)
	k8sClient = k8s.CreateK8sClient()

	// defer kafkaReceiverClientFromBackend.Close()
	// defer kafkaSenderClientToBackend.Close()
	// defer kafkaReceiverClientFromBrocker.Close()
	// defer kafkaSenderClientToBrocker.Close()
	// defer kafkaClientBetweenPods.Reader.Close()
	// defer kafkaClientBetweenPods.Writer.Close()
}
