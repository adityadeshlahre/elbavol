#!/bin/bash

# Script to create required Kafka topics for Elbavol
# Checks if topics exist, creates them if not
# Run this after Kafka is deployed and running

KAFKA_POD="kafka-0"
BOOTSTRAP_SERVER="kafka:9092"

# List of topics to create
TOPICS=(
  "PRIME_TO_ORCHESTRATOR"
  "ORCHESTRATOR_TO_PRIME"
  "ORCHESTRATOR_TO_CONTROL"
  "SERVING_TO_ORCHESTRATOR"
  "PROJECT_TOPIC"
  "PROJECT_RESPONSE_TOPIC"
  "CONTROL_TO_ORCHESTRATOR"
  "CONTROL_TO_SERVING"
  "SERVING_TO_CONTROL"
  "ORCHESTRATOR_TO_SERVING"
  "POD_TOPIC"
)

echo "Checking and creating Kafka topics..."

for topic in "${TOPICS[@]}"; do
  echo "Checking topic: $topic"
  if kubectl exec $KAFKA_POD -- /usr/bin/kafka-topics --list --bootstrap-server $BOOTSTRAP_SERVER | grep -q "^$topic$"; then
    echo "Topic $topic already exists"
  else
    echo "Creating topic $topic"
    kubectl exec $KAFKA_POD -- /usr/bin/kafka-topics --create --topic $topic --bootstrap-server $BOOTSTRAP_SERVER --partitions 1 --replication-factor 1
    if [ $? -eq 0 ]; then
      echo "Successfully created topic $topic"
    else
      echo "Failed to create topic $topic"
    fi
  fi
done

echo "Kafka topics setup complete."