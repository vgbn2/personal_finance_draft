# Quick Start Guide

## Deploy Locally with Docker Compose

```bash
# 1. Clone the repository
git clone https://github.com/your-org/polymarket.git
cd polymarket

# 2. Create environment file
cp deploy/.env.staging.template .env
# Edit .env with your API keys

# 3. Build and run
docker-compose up -d

# 4. View logs
docker-compose logs -f

# 5. Access web dashboard
open http://localhost:8000
```

## Deploy to Kubernetes (Staging)

```bash
# 1. Configure kubectl for your cluster
export KUBECONFIG=/path/to/kubeconfig

# 2. Create secrets
cp k8s/secrets-template.yml k8s/secrets-staging.yml
# Edit secrets-staging.yml with actual values
kubectl apply -f k8s/secrets-staging.yml

# 3. Deploy
./scripts/deploy.sh staging

# 4. Check status
kubectl get pods -n polymarket-staging

# 5. View logs
kubectl logs -f deployment/polymarket-bot -n polymarket-staging
```

## Deploy to Production

### Prerequisites
- Staging deployment successful and tested
- All secrets configured
- GitHub Actions secrets added

### Steps

1. **Via GitHub Actions** (Recommended)
   ```
   1. Go to Actions tab
   2. Select "CD Pipeline"
   3. Click "Run workflow"
   4. Select "production"
   5. Approve in Environments tab
   ```

2. **Via Command Line**
   ```bash
   ./scripts/deploy.sh production
   ```

## Quick Commands

```bash
# Health check
./scripts/health-check.sh staging

# Rollback
./scripts/rollback.sh production

# View metrics
kubectl port-forward svc/prometheus 9090:9090 -n monitoring
open http://localhost:9090

# View dashboards
kubectl port-forward svc/grafana 3000:3000 -n monitoring
open http://localhost:3000
```

## Troubleshooting

### Container won't start
```bash
kubectl describe pod <pod-name> -n polymarket-staging
kubectl logs <pod-name> -n polymarket-staging
```

### Service not accessible
```bash
kubectl get svc -n polymarket-staging
kubectl port-forward svc/polymarket-sim 8080:80 -n polymarket-staging
```

### Need to update secrets
```bash
kubectl edit secret polymarket-secrets -n polymarket-staging
# or
kubectl apply -f k8s/secrets-staging.yml
kubectl rollout restart deployment/polymarket-bot -n polymarket-staging
```

## Next Steps

- Read full [DEPLOYMENT.md](DEPLOYMENT.md) for detailed documentation
- Configure monitoring alerts in `monitoring/alertmanager.yml`
- Set up custom Grafana dashboards
- Review and adjust resource limits based on usage
