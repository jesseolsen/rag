#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if using Docker or local venv
USE_DOCKER=0

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --docker)
      USE_DOCKER=1
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: ./start-server.sh [--docker]"
      exit 1
      ;;
  esac
done

echo -e "${YELLOW}Starting Resume RAG Server...${NC}"

if [ $USE_DOCKER -eq 1 ]; then
  # Docker Compose mode
  echo -e "${GREEN}Using Docker Compose${NC}"

  # Check if docker is installed
  if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
  fi

  # Check if docker-compose is available
  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
  fi

  # Stop existing containers if running
  echo "Stopping any existing containers..."
  docker-compose down || true

  # Start containers
  echo "Starting containers..."
  docker-compose up -d

  # Wait for API to be ready
  echo "Waiting for API to be ready..."
  for i in {1..30}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
      echo -e "${GREEN}✓ Server is running at http://localhost:8000${NC}"
      exit 0
    fi
    echo "Waiting... ($i/30)"
    sleep 1
  done

  echo -e "${RED}Error: Server failed to start${NC}"
  docker-compose logs api
  exit 1

else
  # Local venv mode
  echo -e "${GREEN}Using local Python venv${NC}"

  # Check if Python is installed
  if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: Python 3 is not installed${NC}"
    exit 1
  fi

  # Check Python version (need 3.10+)
  PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}{sys.version_info.minor}")')
  if [ "$PYTHON_VERSION" -lt 310 ]; then
    echo -e "${RED}Error: Python 3.10+ required (you have $(python3 --version | cut -d' ' -f2))${NC}"
    echo "Try using: python3.10, python3.11, python3.12"
    echo "Or install via: brew install python@3.12"
    echo "Or use Docker: ./start-server.sh --docker"
    exit 1
  fi

  # Check if venv exists
  if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
  fi

  # Use full path to venv Python
  VENV_PIP="./venv/bin/pip"
  VENV_PYTHON="./venv/bin/python"

  # Install/update dependencies
  echo "Installing dependencies..."
  $VENV_PIP install -q -r requirements.txt

  # Start server
  echo -e "${GREEN}Starting uvicorn server...${NC}"
  $VENV_PYTHON -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
fi
