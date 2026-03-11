# Deployment Checklist

## Pre-Deployment

### Repository Setup
- [ ] Repository created and code pushed
- [ ] README.md reviewed and updated
- [ ] .gitignore configured (merge .gitignore-deployment)
- [ ] Dependencies listed in requirements.txt

### Secrets Configuration
- [ ] GitHub secrets added:
  - [ ] `KUBE_CONFIG_STAGING` 
  - [ ] `KUBE_CONFIG_PRODUCTION`
  - [ ] `POLYMARKET_API_KEY`
  - [ ] `POLYMARKET_PRIVATE_KEY`
  - [ ] `SLACK_WEBHOOK_URL` (optional)
- [ ] Kubernetes secrets created:
  - [ ] `k8s/secrets-staging.yml` created and applied
  - [ ] `k8s/secrets-production.yml` created and applied

### Environment Configuration
- [ ] Staging config: `deploy/.env.staging` created from template
- [ ] Production config: `deploy/.env.production` created from template
- [ ] Environment variables reviewed and customized
- [ ] Trading parameters set appropriately for each environment

### Docker Configuration
- [ ] Dockerfile reviewed
- [ ] Image registry updated in:
  - [ ] `.github/workflows/ci.yml`
  - [ ] `.github/workflows/cd.yml`
  - [ ] `k8s/deployment-*.yml`
  - [ ] `Makefile`

### Kubernetes Setup
- [ ] Clusters created (staging and production)
- [ ] kubectl configured for both clusters
- [ ] Namespaces created:
  - [ ] `polymarket-staging`
  - [ ] `polymarket-production`
- [ ] Storage class configured for PersistentVolumes
- [ ] Ingress controller installed (if using ingress)
- [ ] Cert-manager installed (for TLS, optional)

## Initial Deployment

### Staging Environment
- [ ] Deploy secrets: `kubectl apply -f k8s/secrets-staging.yml`
- [ ] Deploy ConfigMaps: `kubectl apply -f k8s/configmap.yml -n polymarket-staging`
- [ ] Run deployment: `make deploy-staging` or `./scripts/deploy.sh staging`
- [ ] Verify pods running: `kubectl get pods -n polymarket-staging`
- [ ] Check logs: `kubectl logs -f deployment/polymarket-bot -n polymarket-staging`
- [ ] Run health checks: `make health-check`
- [ ] Test web dashboard access (if deployed)

### Production Environment
- [ ] Deploy secrets: `kubectl apply -f k8s/secrets-production.yml`
- [ ] Deploy ConfigMaps: `kubectl apply -f k8s/configmap.yml -n polymarket-production`
- [ ] Create backup of current state (if updating): `make backup-production`
- [ ] Run deployment: `make deploy-production` or via GitHub Actions
- [ ] Verify pods running: `kubectl get pods -n polymarket-production`
- [ ] Check logs: `kubectl logs -f deployment/polymarket-bot -n polymarket-production`
- [ ] Run health checks: `./scripts/health-check.sh production`
- [ ] Verify trading is working
- [ ] Monitor for 1 hour for any issues

## Monitoring Setup

### Monitoring Stack
- [ ] Update `monitoring/prometheus.yml` with your cluster details
- [ ] Update `monitoring/alertmanager.yml` with your Slack webhook
- [ ] Start monitoring: `make monitor` or `cd monitoring && docker-compose up -d`
- [ ] Access Grafana: http://localhost:3000 (admin/admin)
- [ ] Change default Grafana password
- [ ] Add Prometheus data source in Grafana
- [ ] Import or create dashboards
- [ ] Test alert notifications

### Alerts Configuration
- [ ] Review alert rules in `monitoring/alerts.yml`
- [ ] Adjust thresholds based on your requirements
- [ ] Configure notification channels (Slack, email, PagerDuty)
- [ ] Test critical alerts
- [ ] Set up on-call rotation (if applicable)

## GitHub Actions

### CI Pipeline
- [ ] Push to trigger CI pipeline
- [ ] Verify linting passes
- [ ] Verify Docker build succeeds
- [ ] Verify security scan passes
- [ ] Check that images are pushed to registry

### CD Pipeline
- [ ] Test automatic staging deployment
- [ ] Test manual production deployment
- [ ] Verify rollback functionality
- [ ] Test health check integration

## Post-Deployment

### Verification
- [ ] All services running and healthy
- [ ] Trading bot making trades (check positions/)
- [ ] Data trackers collecting data
- [ ] Web dashboard accessible
- [ ] Logs being collected
- [ ] Metrics being reported
- [ ] Alerts working

### Documentation
- [ ] Update team documentation
- [ ] Document any custom configurations
- [ ] Share access credentials securely
- [ ] Create runbook for common issues

### Backup & Recovery
- [ ] Verify PersistentVolume backups
- [ ] Test restore procedure
- [ ] Document backup schedule
- [ ] Set up automated backups

### Security
- [ ] Review RBAC permissions
- [ ] Enable network policies
- [ ] Configure pod security policies
- [ ] Rotate initial secrets
- [ ] Set up secret rotation schedule
- [ ] Enable audit logging
- [ ] Review security scan results

### Monitoring
- [ ] Create custom Grafana dashboards
- [ ] Set up log queries in Loki
- [ ] Configure alert thresholds
- [ ] Test incident response procedures
- [ ] Document escalation procedures

## Regular Maintenance

### Daily
- [ ] Check Grafana dashboards
- [ ] Review alert notifications
- [ ] Monitor position sizes
- [ ] Check error logs

### Weekly
- [ ] Review resource usage
- [ ] Check for pending updates
- [ ] Review trading performance
- [ ] Analyze cost metrics

### Monthly
- [ ] Rotate secrets and credentials
- [ ] Update dependencies
- [ ] Review and update alerts
- [ ] Backup configuration
- [ ] Update base Docker images
- [ ] Security audit

## Troubleshooting Checklist

### Pod Issues
- [ ] Check pod status: `kubectl get pods -n <namespace>`
- [ ] Describe pod: `kubectl describe pod <pod-name> -n <namespace>`
- [ ] Check logs: `kubectl logs <pod-name> -n <namespace>`
- [ ] Check events: `kubectl get events -n <namespace>`

### Deployment Issues
- [ ] Check rollout status: `kubectl rollout status deployment/<name> -n <namespace>`
- [ ] Check replica sets: `kubectl get rs -n <namespace>`
- [ ] Verify image pull: `kubectl describe pod <pod-name> -n <namespace> | grep -A 10 Events`
- [ ] Check resource limits: `kubectl top pods -n <namespace>`

### Network Issues
- [ ] Check service: `kubectl get svc -n <namespace>`
- [ ] Check endpoints: `kubectl get endpoints -n <namespace>`
- [ ] Test connectivity: `kubectl exec -it <pod-name> -n <namespace> -- curl <service-url>`
- [ ] Check ingress: `kubectl get ingress -n <namespace>`

### Storage Issues
- [ ] Check PVC: `kubectl get pvc -n <namespace>`
- [ ] Check PV: `kubectl get pv`
- [ ] Describe PVC: `kubectl describe pvc <pvc-name> -n <namespace>`

## Emergency Procedures

### Rollback
1. [ ] Identify the issue
2. [ ] Check recent changes: `kubectl rollout history deployment/<name> -n <namespace>`
3. [ ] Execute rollback: `make rollback-production` or `./scripts/rollback.sh production`
4. [ ] Verify rollback: `./scripts/health-check.sh production`
5. [ ] Document incident

### Scale Down (Emergency Stop)
1. [ ] Scale to zero: `kubectl scale deployment/<name> --replicas=0 -n <namespace>`
2. [ ] Verify stopped: `kubectl get pods -n <namespace>`
3. [ ] Investigate issue
4. [ ] Scale back up when ready: `kubectl scale deployment/<name> --replicas=<N> -n <namespace>`

### High Resource Usage
1. [ ] Identify resource hog: `kubectl top pods -n <namespace>`
2. [ ] Check logs for issues: `kubectl logs <pod-name> -n <namespace>`
3. [ ] Restart pod: `kubectl delete pod <pod-name> -n <namespace>`
4. [ ] If persistent, scale down or adjust limits

## Sign-off

- [ ] Staging deployment successful
- [ ] Production deployment successful
- [ ] Monitoring active and alerting
- [ ] Team trained on operations
- [ ] Documentation complete
- [ ] Backup/recovery tested
- [ ] On-call schedule established

---

**Deployment Lead**: _________________  
**Date**: _________________  
**Environment**: [ ] Staging [ ] Production  
**Status**: [ ] Success [ ] Failed [ ] Partial
