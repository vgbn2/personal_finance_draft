#!/bin/bash
# Health check script for Polymarket Bot Suite

set -e

ENVIRONMENT=${1:-staging}
NAMESPACE="polymarket-${ENVIRONMENT}"
TIMEOUT=300  # 5 minutes
INTERVAL=10

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Starting health checks for ${ENVIRONMENT}...${NC}"

# Function to check pod health
check_pod_health() {
    local pod_name=$1
    local status=$(kubectl get pod ${pod_name} -n ${NAMESPACE} -o jsonpath='{.status.phase}' 2>/dev/null)
    
    if [ "$status" == "Running" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check all pods in deployment
check_deployment_health() {
    local deployment=$1
    local replicas=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.replicas}' 2>/dev/null)
    local ready=$(kubectl get deployment ${deployment} -n ${NAMESPACE} -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
    
    if [ "$replicas" == "$ready" ] && [ "$ready" -gt 0 ]; then
        echo -e "${GREEN}✓ ${deployment}: ${ready}/${replicas} replicas ready${NC}"
        return 0
    else
        echo -e "${RED}✗ ${deployment}: ${ready:-0}/${replicas:-0} replicas ready${NC}"
        return 1
    fi
}

# Check if namespace exists
if ! kubectl get namespace ${NAMESPACE} &> /dev/null; then
    echo -e "${RED}Error: Namespace ${NAMESPACE} does not exist${NC}"
    exit 1
fi

# List of deployments to check
DEPLOYMENTS=("polymarket-elon" "polymarket-btc" "polymarket-fed" "polymarket-hurricane" "polymarket-outage" "polymarket-spacex" "polymarket-sim" "polymarket-bot")

# Check each deployment
FAILED=0
for deployment in "${DEPLOYMENTS[@]}"; do
    if kubectl get deployment ${deployment} -n ${NAMESPACE} &> /dev/null; then
        if ! check_deployment_health ${deployment}; then
            FAILED=$((FAILED + 1))
        fi
    else
        echo -e "${YELLOW}⚠ ${deployment}: Deployment not found (may not be deployed)${NC}"
    fi
done

# Check if the web service is accessible (if polym-sim is deployed)
if kubectl get service polymarket-sim -n ${NAMESPACE} &> /dev/null; then
    echo -e "${YELLOW}Checking web service accessibility...${NC}"
    
    # Port forward for health check
    kubectl port-forward -n ${NAMESPACE} service/polymarket-sim 8080:8000 &
    PF_PID=$!
    sleep 5
    
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 | grep -q "200"; then
        echo -e "${GREEN}✓ Web service is accessible${NC}"
    else
        echo -e "${RED}✗ Web service is not accessible${NC}"
        FAILED=$((FAILED + 1))
    fi
    
    kill $PF_PID 2>/dev/null || true
fi

# Final status
echo ""
echo "========================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All health checks passed!${NC}"
    echo "========================================="
    exit 0
else
    echo -e "${RED}Health checks failed for ${FAILED} component(s)${NC}"
    echo "========================================="
    exit 1
fi
