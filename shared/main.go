package shared

import (
	"log"
	"os"

	"github.com/adityadeshlahre/elbavol/shared/kafka"
	"github.com/adityadeshlahre/elbavol/shared/types"
	"github.com/joho/godotenv"
)

var kafkaURL string

func init() {
	err := godotenv.Load()
	if err != nil {
		log.Fatal("Error loading .env file")
	}

	kafkaURL = os.Getenv("KAFKA_URL")
	if kafkaURL == "" {
		log.Fatal("KAFKA_URL not set in environment")
	}
}

func NewReader(topic string, groupID string) *kafka.KafkaClientReader {
	return kafka.NewKafkaClientReader(kafkaURL, topic, groupID)
}

func NewWriter(topic string, groupID string) *kafka.KafkaClientWriter {
	return kafka.NewKafkaClientWriter(kafkaURL, topic, groupID)
}

func NewClient(topic string, groupID string) *types.KafkaClient {
	return kafka.NewKafkaClient(kafkaURL, topic, groupID)
}
