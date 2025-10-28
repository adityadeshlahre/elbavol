package prime

import (
	"github.com/adityadeshlahre/elbavol/prime/server"
	shared "github.com/adityadeshlahre/elbavol/shared"
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
)

var KafkaReceiverClientFromOrchestrator *kafkaShared.KafkaClientReader
var KafkaSenderClientToOrchestrator *kafkaShared.KafkaClientWriter

func main() {

	KafkaReceiverClientFromOrchestrator = shared.NewReader(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	KafkaSenderClientToOrchestrator = shared.NewWriter(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	// defer KafkaReceiverClientFromOrchestrator.Close()
	// defer KafkaSenderClientToOrchestrator.Close()

	// Start Server
	e := server.NewServer()

	e.Logger.Fatal(e.Start(":8080"))
}
