#!/bin/bash

set -e

echo "Starting deployment of Elbavol services..."

echo "Deploying Zookeeper..."
kubectl apply -f zookeeper.yaml

echo "Waiting for Zookeeper to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/zookeeper

echo "Deploying Kafka..."
kubectl apply -f kafka.yaml

echo "Waiting for Kafka to be ready..."
kubectl rollout status statefulset/kafka --timeout=300s

echo "Deploying MinIO..."
kubectl apply -f minio.yaml

echo "Waiting for MinIO to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/minio

echo "Deploying Orchestrator..."
kubectl apply -f orchestrator.yaml

echo "Waiting for Orchestrator to be ready..."
kubectl wait --for=condition=available --timeout=60s deployment/orchestrator

echo "Deploying Prime..."
kubectl apply -f prime.yaml

echo "Waiting for Prime to be ready..."
kubectl wait --for=condition=available --timeout=60s deployment/prime

echo "Deploying Ingress..."
kubectl apply -f ingress.yaml

echo "All services deployed successfully!"