#!/bin/bash

# Lovable Clone (Elbavol) - Start All Services
# This script starts all backend components:
# - 2 TypeScript apps (control, serve) using bun
# - 3 Go apps (ingress, orchestrator, prime) using go run

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Directory paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTROL_DIR="$SCRIPT_DIR/runable/apps/control"
SERVE_DIR="$SCRIPT_DIR/runable/apps/serve"
INGRESS_DIR="$SCRIPT_DIR/ingress"
ORCHESTRATOR_DIR="$SCRIPT_DIR/orchestrator"
PRIME_DIR="$SCRIPT_DIR/prime"

# PIDs storage
declare -a PIDS=()
declare -a SERVICE_NAMES=()

# Function to print colored output
print_status() {
    echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} ✓ $1"
}

print_error() {
    echo -e "${RED}[$(date +%H:%M:%S)]${NC} ✗ $1"
}

print_warning() {
    echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} ⚠ $1"
}

# Function to cleanup all processes
cleanup() {
    echo ""
    print_warning "Shutting down all services..."
    
    # Kill all child processes
    for i in "${!PIDS[@]}"; do
        local pid="${PIDS[$i]}"
        local name="${SERVICE_NAMES[$i]}"
        
        if ps -p "$pid" > /dev/null 2>&1; then
            print_status "Stopping $name (PID: $pid)"
            kill -TERM "$pid" 2>/dev/null || true
        fi
    done
    
    # Wait a bit for graceful shutdown
    sleep 2
    
    # Force kill if still running
    for i in "${!PIDS[@]}"; do
        local pid="${PIDS[$i]}"
        local name="${SERVICE_NAMES[$i]}"
        
        if ps -p "$pid" > /dev/null 2>&1; then
            print_warning "Force killing $name (PID: $pid)"
            kill -9 "$pid" 2>/dev/null || true
        fi
    done
    
    print_success "All services stopped. Ports freed."
    exit 0
}

# Register cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

# Function to start a service
start_service() {
    local name=$1
    local dir=$2
    local cmd=$3
    
    print_status "Starting $name..."
    
    # Change to directory and run command in background
    (cd "$dir" && eval "$cmd" 2>&1 | sed "s/^/[$name] /") &
    
    local pid=$!
    PIDS+=("$pid")
    SERVICE_NAMES+=("$name")
    
    # Wait a moment and check if process is still running
    sleep 1
    if ps -p "$pid" > /dev/null 2>&1; then
        print_success "$name started (PID: $pid)"
        return 0
    else
        print_error "$name failed to start"
        return 1
    fi
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command -v bun &> /dev/null; then
    print_error "bun is not installed. Please install bun first."
    exit 1
fi

if ! command -v go &> /dev/null; then
    print_error "go is not installed. Please install Go first."
    exit 1
fi

print_success "All prerequisites met"
echo ""

# Display banner
echo "╔════════════════════════════════════════════════╗"
echo "║      Elbavol - Lovable Clone Backend          ║"
echo "║           Starting All Services...             ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Start TypeScript applications
print_status "=== Starting TypeScript Applications ==="
start_service "control-pod" "$CONTROL_DIR" "bun start"
start_service "serve-pod" "$SERVE_DIR" "bun start"
echo ""

# Start Go applications  
print_status "=== Starting Go Applications ==="
start_service "ingress" "$INGRESS_DIR" "go run cmd/ingress/main.go"
start_service "orchestrator" "$ORCHESTRATOR_DIR" "go run cmd/orchestrator/main.go"
start_service "prime" "$PRIME_DIR" "go run cmd/prime/main.go"
echo ""

# All services started
print_success "All services started successfully!"
echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║           Service Status Summary               ║"
echo "╠════════════════════════════════════════════════╣"
for i in "${!PIDS[@]}"; do
    printf "║  %-20s PID: %-8s         ║\n" "${SERVICE_NAMES[$i]}" "${PIDS[$i]}"
done
echo "╚════════════════════════════════════════════════╝"
echo ""
print_warning "Press Ctrl+C to stop all services and free ports"
echo ""

# Wait for all background processes
wait
