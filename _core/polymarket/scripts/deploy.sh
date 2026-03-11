#!/bin/bash
# Deploy script for Polymarket Bot Suite

set -e

ENVIRONMENT=${1:-staging}
NAMESPACE="polymarket-${ENVIRONMENT}"
IMAGE_TAG=${2:-latest}

echo "========================================="
echo "Deploying Polymarket Bot to ${ENVIRONMENT}"
echo "========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(staging|production)$ ]]; then
    echo -e "${RED}Error: Environment must be 'staging' or 'production'${NC}"
    exit 1
fi

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: kubectl is not configured or cluster is unreachable${NC}"
    exit 1
fi

# Create namespace if it doesn't exist
echo -e "${YELLOW}Ensuring namespace exists...${NC}"
kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -

# Apply secrets (if they exist)
if [ -f "k8s/secrets-${ENVIRONMENT}.yml" ]; then
    echo -e "${YELLOW}Applying secrets...${NC}"
    kubectl apply -f k8s/secrets-${ENVIRONMENT}.yml -n ${NAMESPACE}
fi

# Apply ConfigMaps
echo -e "${YELLOW}Applying ConfigMaps...${NC}"
kubectl apply -f k8s/configmap.yml -n ${NAMESPACE}

# Apply Deployments
echo -e "${YELLOW}Applying Deployments...${NC}"
for service in elon-tracker btc-tracker fed-tracker hurricane-tracker outage-tracker spacex-tracker polym-sim bot; do
    if [ -f "k8s/deployment-${service}.yml" ]; then
        kubectl apply -f k8s/deployment-${service}.yml -n ${NAMESPACE}
    fi
done

# Apply Services
echo -e "${YELLOW}Applying Services...${NC}"
kubectl apply -f k8s/service.yml -n ${NAMESPACE}

# Wait for rollout
echo -e "${YELLOW}Waiting for rollout to complete...${NC}"
kubectl rollout status deployment/polymarket-bot -n ${NAMESPACE} --timeout=5m

# Run health checks
echo -e "${YELLOW}Running health checks...${NC}"
./scripts/health-check.sh ${ENVIRONMENT}

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"

# Display status
kubectl get pods -n ${NAMESPACE}
