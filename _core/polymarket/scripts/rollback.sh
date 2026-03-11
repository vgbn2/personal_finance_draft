#!/bin/bash
# Rollback script for Polymarket Bot Suite

set -e

ENVIRONMENT=${1:-staging}
NAMESPACE="polymarket-${ENVIRONMENT}"
REVISION=${2:-0}  # 0 means previous revision

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}=========================================${NC}"
echo -e "${RED}Rolling back deployment in ${ENVIRONMENT}${NC}"
echo -e "${RED}=========================================${NC}"

# Check if kubectl is configured
if ! kubectl cluster-info &> /dev/null; then
    echo -e "${RED}Error: kubectl is not configured or cluster is unreachable${NC}"
    exit 1
fi

# Show current revision
echo -e "${YELLOW}Current deployment status:${NC}"
kubectl rollout history deployment/polymarket-bot -n ${NAMESPACE}

# Perform rollback
if [ "$REVISION" -eq 0 ]; then
    echo -e "${YELLOW}Rolling back to previous revision...${NC}"
    kubectl rollout undo deployment/polymarket-bot -n ${NAMESPACE}
else
    echo -e "${YELLOW}Rolling back to revision ${REVISION}...${NC}"
    kubectl rollout undo deployment/polymarket-bot -n ${NAMESPACE} --to-revision=${REVISION}
fi

# Wait for rollout
echo -e "${YELLOW}Waiting for rollback to complete...${NC}"
kubectl rollout status deployment/polymarket-bot -n ${NAMESPACE} --timeout=5m

# Run health checks
echo -e "${YELLOW}Running health checks...${NC}"
./scripts/health-check.sh ${ENVIRONMENT}

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Rollback completed successfully!${NC}"
echo -e "${GREEN}=========================================${NC}"
