package main

import (
	"github.com/adityadeshlahre/elbavol/prime/clients"
	"github.com/adityadeshlahre/elbavol/prime/server"
	shared "github.com/adityadeshlahre/elbavol/shared"
	sharedTypes "github.com/adityadeshlahre/elbavol/shared/types"
)

func main() {

	clients.KafkaReceiverClientFromOrchestrator = shared.NewReader(sharedTypes.PROJECT_RESPONSE_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	clients.KafkaSenderClientToOrchestrator = shared.NewWriter(sharedTypes.PROJECT_TOPIC, sharedTypes.PROJECT_GROUP_ID)
	// defer clients.KafkaReceiverClientFromOrchestrator.Close()
	// defer clients.KafkaSenderClientToOrchestrator.Close()

	// Start Server
	e := server.NewServer()

	e.Logger.Fatal(e.Start(":8080"))
}
