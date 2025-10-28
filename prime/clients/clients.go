package clients

import (
	kafkaShared "github.com/adityadeshlahre/elbavol/shared/kafka"
)

var KafkaReceiverClientFromOrchestrator *kafkaShared.KafkaClientReader
var KafkaSenderClientToOrchestrator *kafkaShared.KafkaClientWriter
