# Polymarket Bot Deployment Pipeline

## 🚀 Quick Links

- **[Quick Start Guide](QUICKSTART.md)** - Get up and running in 5 minutes
- **[Full Deployment Documentation](DEPLOYMENT.md)** - Complete deployment guide
- **[Main Project README](README.md)** - Project overview and trading strategies

## 📋 What's Included

This deployment pipeline provides:

✅ **Complete CI/CD with GitHub Actions**
- Automated testing and linting
- Docker image building and publishing
- Security vulnerability scanning
- Automated staging deployments
- Manual production deployments with approval

✅ **Kubernetes Deployment**
- Production-ready K8s manifests
- Horizontal pod autoscaling
- Rolling updates with zero downtime
- Health checks and self-healing
- Persistent storage for positions

✅ **Monitoring & Observability**
- Prometheus for metrics collection
- Grafana dashboards for visualization
- Loki for log aggregation
- AlertManager for notifications
- Pre-configured alerts for trading and infrastructure

✅ **Deployment Scripts**
- One-command deployments
- Automated health checks
- Easy rollback procedures
- Backup and restore utilities

## 🏗️ Architecture

```
GitHub → CI/CD Pipeline → Container Registry → Kubernetes Cluster
                                                      ↓
                                    ┌─────────────────────────────┐
                                    │   Polymarket Bot Suite      │
                                    ├─────────────────────────────┤
                                    │  • Market Making Bot        │
                                    │  • BTC Tracker             │
                                    │  • Fed Rates Tracker       │
                                    │  • Hurricane Tracker       │
                                    │  • SpaceX Tracker          │
                                    │  • Outage Tracker          │
                                    │  • Elon Tweets Tracker     │
                                    │  • Web Dashboard           │
                                    └─────────────────────────────┘
                                               ↓
                                    ┌─────────────────────────────┐
                                    │   Monitoring Stack          │
                                    ├─────────────────────────────┤
                                    │  • Prometheus (Metrics)     │
                                    │  • Grafana (Dashboards)     │
                                    │  • Loki (Logs)             │
                                    │  • AlertManager (Alerts)    │
                                    └─────────────────────────────┘
```

## 🎯 Getting Started

### Prerequisites

- Docker & Docker Compose
- Kubernetes cluster (for production deployment)
- kubectl configured
- GitHub account (for CI/CD)

### Local Development

```bash
# 1. Start services locally
make local-up

# 2. View logs
make local-logs

# 3. Access dashboard
open http://localhost:8000

# 4. Stop services
make local-down
```

### Deploy to Staging

```bash
# Using Makefile
make deploy-staging

# Or using script directly
./scripts/deploy.sh staging
```

### Deploy to Production

```bash
# Using Makefile (with confirmation)
make deploy-production

# Or via GitHub Actions
# Go to Actions → CD Pipeline → Run workflow → Select production
```

## 📊 Monitoring

Start the monitoring stack:

```bash
make monitor
```

Access dashboards:
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin)
- **AlertManager**: http://localhost:9093

## 🛠️ Common Commands

```bash
# Build and push Docker image
make build push

# Run health checks
make health-check

# View logs
make logs-staging        # Staging logs
make logs-production     # Production logs

# Rollback deployment
make rollback-staging    # Rollback staging
make rollback-production # Rollback production

# Check status
make status-staging      # Check staging status
make status-production   # Check production status

# Backup configuration
make backup-production   # Backup production config
```

## 📁 Repository Structure

```
.
├── .github/
│   └── workflows/
│       ├── ci.yml                 # CI pipeline
│       └── cd.yml                 # CD pipeline
├── k8s/
│   ├── configmap.yml              # Configuration
│   ├── secrets-template.yml       # Secrets template
│   ├── deployment-bot.yml         # Bot deployment
│   ├── deployment-sim.yml         # Dashboard deployment
│   └── deployment-trackers.yml    # Trackers deployment
├── scripts/
│   ├── deploy.sh                  # Deployment script
│   ├── health-check.sh           # Health check script
│   └── rollback.sh               # Rollback script
├── monitoring/
│   ├── docker-compose.yml        # Monitoring stack
│   ├── prometheus.yml            # Prometheus config
│   ├── alerts.yml                # Alert rules
│   └── alertmanager.yml          # Alert routing
├── deploy/
│   ├── .env.staging.template     # Staging config
│   └── .env.production.template  # Production config
├── Makefile                       # Automation commands
├── DEPLOYMENT.md                  # Full documentation
└── QUICKSTART.md                 # Quick start guide
```

## 🔒 Security

- All secrets stored in Kubernetes secrets
- Security scanning in CI pipeline
- TLS/SSL for external endpoints
- Network policies for pod isolation
- RBAC for access control
- Regular vulnerability updates

## 📈 Monitoring & Alerts

### Pre-configured Alerts

- ⚠️ High error rates
- 🚨 Service downtime
- 💾 Memory/CPU exhaustion
- 💰 Large position sizes
- 📉 High PnL drawdown
- 🔄 Container restarts
- 💿 Low disk space
- 🌐 High API latency

### Notification Channels

- Slack (recommended)
- Email
- PagerDuty (optional)
- Custom webhooks

## 🧪 Testing

```bash
# Run tests
make test

# Run linters
make lint

# Run full CI suite
make ci-test
```

## 📚 Documentation

- **[QUICKSTART.md](QUICKSTART.md)** - Get started in 5 minutes
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide with troubleshooting
- **[README.md](README.md)** - Main project documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `make ci-test`
5. Submit a pull request

## 📝 Configuration

### Environment Variables

Key configuration in `deploy/.env.*.template`:

- `POLYMARKET_API_KEY` - API credentials
- `MIN_MERGE_SIZE` - Minimum position merge size
- `TRADE_INTERVAL` - Trading loop interval
- `MAX_POSITION_SIZE` - Maximum position limit
- `STOP_LOSS_THRESHOLD` - Stop loss percentage
- `TAKE_PROFIT_THRESHOLD` - Take profit percentage

See templates for full configuration options.

## 🐛 Troubleshooting

### Pod won't start
```bash
kubectl describe pod <pod-name> -n polymarket-staging
kubectl logs <pod-name> -n polymarket-staging
```

### Deployment stuck
```bash
# Check rollout status
kubectl rollout status deployment/polymarket-bot -n polymarket-staging

# Rollback if needed
make rollback-staging
```

### High resource usage
```bash
# Check resource usage
kubectl top pods -n polymarket-staging

# Adjust limits in k8s/deployment-*.yml
```

## 📞 Support

- GitHub Issues for bugs and features
- Check Grafana dashboards first for operational issues
- Review logs: `make logs-staging` or `make logs-production`

## 📄 License

[Your License]

## 🙏 Acknowledgments

Built for the Polymarket prediction market platform using modern DevOps practices and cloud-native technologies.

---

**Made with ❤️ by the Polymarket Trading Team**
