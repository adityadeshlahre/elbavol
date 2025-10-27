package kafka

import (
	"github.com/adityadeshlahre/elbavol/shared/types"
	"github.com/segmentio/kafka-go"
)

type KafkaClientReader struct {
	Reader *kafka.Reader
}

type KafkaClientWriter struct {
	Writer *kafka.Writer
}

func NewKafkaClientReader(kafkaURL string, topic string, groupID string) *KafkaClientReader {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{kafkaURL},
		Topic:   topic,
		GroupID: groupID,
	})

	return &KafkaClientReader{
		Reader: reader,
	}
}

func NewKafkaClientWriter(kafkaURL string, topic string, groupID string) *KafkaClientWriter {

	writer := &kafka.Writer{
		Addr:     kafka.TCP(kafkaURL),
		Topic:    topic,
		Balancer: &kafka.LeastBytes{},
	}

	return &KafkaClientWriter{
		Writer: writer,
	}
}

func (kcr *KafkaClientReader) Close() error {
	return kcr.Reader.Close()
}

func (kcw *KafkaClientWriter) Close() error {
	return kcw.Writer.Close()
}

func NewKafkaClient(kafkaURL string, topic string, groupID string) *types.KafkaClient {
	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers: []string{kafkaURL},
		Topic:   topic,
		GroupID: groupID,
	})

	writer := &kafka.Writer{
		Addr:     kafka.TCP(kafkaURL),
		Topic:    topic,
		Balancer: &kafka.LeastBytes{},
	}

	return &types.KafkaClient{
		Reader: reader,
		Writer: writer,
	}
}

func CloseKafkaClient(kc *types.KafkaClient) error {
	if err := kc.Reader.Close(); err != nil {
		return err
	}
	if err := kc.Writer.Close(); err != nil {
		return err
	}
	return nil
}
