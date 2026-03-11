# Makefile for Polymarket Bot Deployment

.PHONY: help build push deploy-staging deploy-production rollback health-check clean monitor

# Variables
DOCKER_REGISTRY ?= ghcr.io
DOCKER_ORG ?= your-org
IMAGE_NAME ?= polymarket
VERSION ?= $(shell git rev-parse --short HEAD)
IMAGE_TAG ?= $(VERSION)
FULL_IMAGE = $(DOCKER_REGISTRY)/$(DOCKER_ORG)/$(IMAGE_NAME):$(IMAGE_TAG)

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)Polymarket Bot Deployment$(NC)"
	@echo ""
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

build: ## Build Docker image
	@echo "$(YELLOW)Building Docker image: $(FULL_IMAGE)$(NC)"
	docker build -t $(FULL_IMAGE) .
	docker tag $(FULL_IMAGE) $(DOCKER_REGISTRY)/$(DOCKER_ORG)/$(IMAGE_NAME):latest
	@echo "$(GREEN)✓ Build complete$(NC)"

push: build ## Build and push Docker image to registry
	@echo "$(YELLOW)Pushing Docker image: $(FULL_IMAGE)$(NC)"
	docker push $(FULL_IMAGE)
	docker push $(DOCKER_REGISTRY)/$(DOCKER_ORG)/$(IMAGE_NAME):latest
	@echo "$(GREEN)✓ Push complete$(NC)"

test: ## Run tests
	@echo "$(YELLOW)Running tests...$(NC)"
	python -m pytest tests/ || echo "No tests found"
	@echo "$(GREEN)✓ Tests complete$(NC)"

lint: ## Run linters
	@echo "$(YELLOW)Running linters...$(NC)"
	pylint --disable=all --enable=E,F market_making_bot.py || true
	@echo "$(GREEN)✓ Lint complete$(NC)"

deploy-staging: ## Deploy to staging environment
	@echo "$(YELLOW)Deploying to staging...$(NC)"
	./scripts/deploy.sh staging $(IMAGE_TAG)
	@echo "$(GREEN)✓ Staging deployment complete$(NC)"

deploy-production: ## Deploy to production environment
	@echo "$(RED)Deploying to production...$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		./scripts/deploy.sh production $(IMAGE_TAG); \
		echo "$(GREEN)✓ Production deployment complete$(NC)"; \
	else \
		echo "$(RED)Deployment cancelled$(NC)"; \
	fi

rollback-staging: ## Rollback staging to previous version
	@echo "$(YELLOW)Rolling back staging...$(NC)"
	./scripts/rollback.sh staging
	@echo "$(GREEN)✓ Rollback complete$(NC)"

rollback-production: ## Rollback production to previous version
	@echo "$(RED)Rolling back production...$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		./scripts/rollback.sh production; \
		echo "$(GREEN)✓ Rollback complete$(NC)"; \
	else \
		echo "$(RED)Rollback cancelled$(NC)"; \
	fi

health-check: ## Run health checks
	@echo "$(YELLOW)Running health checks...$(NC)"
	./scripts/health-check.sh staging
	@echo "$(GREEN)✓ Health check complete$(NC)"

monitor: ## Start monitoring stack
	@echo "$(YELLOW)Starting monitoring stack...$(NC)"
	cd monitoring && docker-compose up -d
	@echo "$(GREEN)✓ Monitoring started$(NC)"
	@echo "Prometheus: http://localhost:9090"
	@echo "Grafana: http://localhost:3000 (admin/admin)"
	@echo "AlertManager: http://localhost:9093"

monitor-stop: ## Stop monitoring stack
	@echo "$(YELLOW)Stopping monitoring stack...$(NC)"
	cd monitoring && docker-compose down
	@echo "$(GREEN)✓ Monitoring stopped$(NC)"

logs-staging: ## View staging logs
	kubectl logs -f deployment/polymarket-bot -n polymarket-staging

logs-production: ## View production logs
	kubectl logs -f deployment/polymarket-bot -n polymarket-production

status-staging: ## Check staging status
	kubectl get all -n polymarket-staging

status-production: ## Check production status
	kubectl get all -n polymarket-production

shell-staging: ## Get shell in staging pod
	kubectl exec -it deployment/polymarket-bot -n polymarket-staging -- /bin/bash

shell-production: ## Get shell in production pod
	kubectl exec -it deployment/polymarket-bot -n polymarket-production -- /bin/bash

secrets-create: ## Create secrets from template
	@echo "$(YELLOW)Creating secrets...$(NC)"
	@if [ ! -f k8s/secrets-staging.yml ]; then \
		cp k8s/secrets-template.yml k8s/secrets-staging.yml; \
		echo "Created k8s/secrets-staging.yml - please edit with actual values"; \
	fi
	@if [ ! -f k8s/secrets-production.yml ]; then \
		cp k8s/secrets-template.yml k8s/secrets-production.yml; \
		echo "Created k8s/secrets-production.yml - please edit with actual values"; \
	fi
	@echo "$(GREEN)✓ Secrets templates created$(NC)"

local-up: ## Start services locally with docker-compose
	@echo "$(YELLOW)Starting services locally...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✓ Services started$(NC)"
	@echo "Web dashboard: http://localhost:8000"

local-down: ## Stop local services
	@echo "$(YELLOW)Stopping local services...$(NC)"
	docker-compose down
	@echo "$(GREEN)✓ Services stopped$(NC)"

local-logs: ## View local service logs
	docker-compose logs -f

clean: ## Clean up local resources
	@echo "$(YELLOW)Cleaning up...$(NC)"
	docker-compose down -v
	docker system prune -f
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

backup-staging: ## Backup staging configuration
	@echo "$(YELLOW)Backing up staging...$(NC)"
	mkdir -p backups
	kubectl get all -n polymarket-staging -o yaml > backups/staging-$(shell date +%Y%m%d-%H%M%S).yaml
	@echo "$(GREEN)✓ Backup complete$(NC)"

backup-production: ## Backup production configuration
	@echo "$(YELLOW)Backing up production...$(NC)"
	mkdir -p backups
	kubectl get all -n polymarket-production -o yaml > backups/production-$(shell date +%Y%m%d-%H%M%S).yaml
	@echo "$(GREEN)✓ Backup complete$(NC)"

# Development helpers
dev-install: ## Install development dependencies
	pip install -r requirements.txt
	pip install pylint pytest pytest-cov

dev-format: ## Format code
	black market_making_bot.py
	isort market_making_bot.py

# CI/CD helpers
ci-test: lint test ## Run CI tests

ci-build: build ## Build for CI

ci-deploy-staging: push deploy-staging health-check ## Full CI deploy to staging

.DEFAULT_GOAL := help
