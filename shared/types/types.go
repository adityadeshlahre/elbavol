package types

import "github.com/segmentio/kafka-go"


type KafkaClient struct {
	Reader *kafka.Reader
	Writer *kafka.Writer
}


type PubSubIncomingMessage struct {
	Topic   string
	Message []byte
}

// topic

const (
	PROJECT_TOPIC = "PROJECT_TOPIC"
	BROCKER_TOPIC = "BROCKER_TOPIC"
	POD_TOPIC     = "POD_TOPIC"
)

// gourpId

const (
	PROJECT_GROUP_ID = "PROJECT_GROUP_ID"
	BROCKER_GROUP_ID = "BROCKER_GROUP_ID"
	POD_GROUP_ID     = "POD_GROUP_ID"
)
