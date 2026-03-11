# Deployment Pipeline Documentation

## Overview

This deployment pipeline provides a complete CI/CD solution for the Polymarket Prediction Market Bot Suite. It includes automated testing, building, security scanning, and deployment to both staging and production environments.

## Architecture

```
┌─────────────────┐
│   GitHub Code   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   CI Pipeline   │◄──── Pull Request / Push
│  (GitHub Actions)│
└────────┬────────┘
         │
         ├──► Lint & Test
         ├──► Build Docker Images
         └──► Security Scan
         │
         ▼
┌─────────────────┐
│   CD Pipeline   │
│  (GitHub Actions)│
└────────┬────────┘
         │
         ├──► Deploy to Staging
         └──► Deploy to Production (Manual)
         │
         ▼
┌─────────────────┐
│   Kubernetes    │
│    Cluster      │
└────────┬────────┘
         │
         ├──► Bot Service
         ├──► Web Dashboard
         └──► Data Trackers
```

## Components

### 1. CI Pipeline (`.github/workflows/ci.yml`)

Runs on every push and pull request:

- **Lint and Test**: Validates Python code
- **Build Docker Images**: Builds and pushes container images to GHCR
- **Security Scan**: Scans for vulnerabilities with Trivy

### 2. CD Pipeline (`.github/workflows/cd.yml`)

Deploys to environments:

- **Staging**: Automatic deployment after successful CI
- **Production**: Manual approval required

### 3. Kubernetes Manifests (`k8s/`)

- `configmap.yml`: Application configuration
- `secrets-template.yml`: Secret management template
- `deployment-bot.yml`: Trading bot deployment
- `deployment-sim.yml`: Web dashboard deployment
- `deployment-trackers.yml`: Data tracker deployments

### 4. Monitoring Stack (`monitoring/`)

- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **Loki**: Log aggregation
- **AlertManager**: Alert routing and notification

## Setup Instructions

### Prerequisites

1. **GitHub Repository**
   - Fork or create a repository
   - Enable GitHub Actions

2. **Container Registry**
   - GitHub Container Registry (GHCR) is used by default
   - Ensure packages are enabled on your repository

3. **Kubernetes Cluster**
   - Production and staging clusters
   - `kubectl` access configured

4. **Required Secrets**

Add these secrets to your GitHub repository:

```bash
# GitHub Settings > Secrets and variables > Actions

KUBE_CONFIG_STAGING      # Base64 encoded kubeconfig for staging
KUBE_CONFIG_PRODUCTION   # Base64 encoded kubeconfig for production
POLYMARKET_API_KEY       # Polymarket API key
POLYMARKET_PRIVATE_KEY   # Polymarket private key
SLACK_WEBHOOK_URL        # For alert notifications (optional)
```

To encode your kubeconfig:
```bash
cat ~/.kube/config | base64 -w 0
```

### Initial Setup

1. **Configure Secrets**

```bash
# Create secrets from template
cp k8s/secrets-template.yml k8s/secrets-staging.yml
cp k8s/secrets-template.yml k8s/secrets-production.yml

# Edit and add your actual secrets
vim k8s/secrets-staging.yml
vim k8s/secrets-production.yml

# Apply to cluster
kubectl apply -f k8s/secrets-staging.yml
kubectl apply -f k8s/secrets-production.yml
```

2. **Configure Environment Variables**

```bash
# Copy environment templates
cp deploy/.env.staging.template deploy/.env.staging
cp deploy/.env.production.template deploy/.env.production

# Edit with your values
vim deploy/.env.staging
vim deploy/.env.production
```

3. **Update Image Registry**

Update the image references in:
- `k8s/deployment-*.yml`
- `.github/workflows/*.yml`

Replace `ghcr.io/your-org/polymarket` with your actual registry path.

4. **Setup Monitoring**

```bash
# Start monitoring stack
cd monitoring
docker-compose up -d

# Access Grafana
open http://localhost:3000
# Default credentials: admin/admin
```

## Deployment Workflows

### Automatic Deployment (Staging)

1. Push code to `main` branch
2. CI pipeline runs automatically
3. On success, CD pipeline deploys to staging
4. Staging health checks run automatically

### Manual Deployment (Production)

1. Go to Actions tab in GitHub
2. Select "CD Pipeline" workflow
3. Click "Run workflow"
4. Select environment: `production`
5. Approve deployment in Environments tab
6. Production deployment proceeds

### Using Deployment Scripts

#### Deploy to Staging
```bash
./scripts/deploy.sh staging
```

#### Deploy to Production
```bash
./scripts/deploy.sh production latest
```

#### Health Check
```bash
./scripts/health-check.sh production
```

#### Rollback
```bash
# Rollback to previous version
./scripts/rollback.sh production

# Rollback to specific revision
./scripts/rollback.sh production 5
```

## Monitoring and Observability

### Prometheus Metrics

Access at: `http://localhost:9090`

Key metrics:
- `polymarket_position_size`: Current position sizes
- `polymarket_pnl_percent`: Profit/Loss percentage
- `polymarket_failed_trades_total`: Failed trade counter
- `polymarket_api_latency_seconds`: API response times

### Grafana Dashboards

Access at: `http://localhost:3000`

Pre-configured dashboards:
1. **Trading Overview**: PnL, positions, order flow
2. **System Health**: CPU, memory, disk usage
3. **Application Logs**: Aggregated logs from all services

### Alerts

Configured alerts in `monitoring/alerts.yml`:
- High error rates
- Service downtime
- Resource exhaustion
- Large position sizes
- High PnL drawdown
- Container restarts

Notifications sent to Slack channels:
- `#polymarket-critical`: Critical issues
- `#polymarket-warnings`: Warning level alerts
- `#polymarket-trading`: Trading-specific alerts

## Architecture Decisions

### Why Kubernetes?

- **Scalability**: Easy horizontal scaling of services
- **Reliability**: Self-healing and automatic restarts
- **Isolation**: Each tracker runs in its own container
- **Resource Management**: Fine-grained control over CPU/memory

### Why Docker Compose for Monitoring?

- **Simplicity**: Easy to set up on a single monitoring server
- **Self-contained**: All monitoring tools in one stack
- **Development**: Can run locally for testing

### Deployment Strategy

**Rolling Updates**:
- Zero-downtime deployments
- `maxSurge: 1`: One extra pod during update
- `maxUnavailable: 0`: No pods go down during update

**Health Checks**:
- Liveness probes: Restart unhealthy pods
- Readiness probes: Route traffic only to ready pods

## Troubleshooting

### Deployment Fails

```bash
# Check pod status
kubectl get pods -n polymarket-production

# View pod logs
kubectl logs -f deployment/polymarket-bot -n polymarket-production

# Describe pod for events
kubectl describe pod <pod-name> -n polymarket-production
```

### Service Not Accessible

```bash
# Check service
kubectl get svc -n polymarket-production

# Port forward for testing
kubectl port-forward svc/polymarket-sim 8080:80 -n polymarket-production

# Check ingress
kubectl get ingress -n polymarket-production
```

### High Memory/CPU Usage

```bash
# View resource usage
kubectl top pods -n polymarket-production

# Adjust limits in deployment files
vim k8s/deployment-bot.yml
# Update resources.limits section
kubectl apply -f k8s/deployment-bot.yml
```

### Failed Health Checks

```bash
# Check health check configuration
kubectl describe deployment polymarket-bot -n polymarket-production

# Adjust probe settings if needed
# Edit initialDelaySeconds, periodSeconds, failureThreshold
```

## Security Best Practices

1. **Secrets Management**
   - Never commit secrets to Git
   - Use Kubernetes secrets or external secret managers
   - Rotate credentials regularly

2. **Image Security**
   - Use specific image tags, not `latest`
   - Run security scans in CI pipeline
   - Use minimal base images

3. **Network Policies**
   - Implement pod-to-pod network policies
   - Restrict egress traffic
   - Use service mesh for advanced security

4. **RBAC**
   - Use least-privilege access
   - Separate service accounts per component
   - Regular audit of permissions

## Maintenance

### Regular Tasks

**Daily**:
- Monitor dashboard for anomalies
- Check alert notifications
- Review position sizes

**Weekly**:
- Review deployment logs
- Check resource usage trends
- Update dependencies if needed

**Monthly**:
- Rotate credentials
- Review and update alerts
- Backup configuration
- Update Docker base images

### Backup Strategy

```bash
# Backup Kubernetes resources
kubectl get all -n polymarket-production -o yaml > backup-$(date +%Y%m%d).yaml

# Backup persistent volumes
kubectl get pvc -n polymarket-production -o yaml > backup-pvc-$(date +%Y%m%d).yaml

# Backup secrets (encrypted)
kubectl get secrets -n polymarket-production -o yaml > backup-secrets-$(date +%Y%m%d).yaml
```

## Cost Optimization

1. **Right-size Resources**
   - Monitor actual usage
   - Adjust CPU/memory requests and limits
   - Use node autoscaling

2. **Staging Environment**
   - Lower replica counts
   - Smaller resource limits
   - Can be shut down outside business hours

3. **Image Optimization**
   - Use multi-stage builds
   - Remove unnecessary dependencies
   - Leverage layer caching

## Support and Contact

For issues or questions:
- GitHub Issues: [Repository Issues Page]
- Documentation: This file and inline comments
- Monitoring: Check Grafana dashboards first

## License

[Your License Here]
