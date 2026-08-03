# Storage Tiering & HDD Backup Guide

This guide describes how to configure hot SSD execution alongside cold HDD long-term storage and 12-hour backups for the Sovereign Trading Platform.

## Storage Architecture Overview

| Tier | Device | Default Path | Purpose |
| :--- | :--- | :--- | :--- |
| **Hot Tier (Fast)** | NVMe / SSD | `/home/vgbn-server/.../personal_finance_draft` | Repository code, Docker runtime, 1m/5m live data polling, active strategy state |
| **Cold Tier (Archive)** | HDD | `/mnt/hdd_data/sovereign/` | Long-term historical archives, database backups, snapshot retentions |

---

## Setup Instructions

### 1. Mount HDD and Set Permissions

Create the HDD mount point and set owner permissions:

```bash
sudo mkdir -p /mnt/hdd_data/sovereign/backups
sudo chown -R $USER:$USER /mnt/hdd_data/sovereign
```

### 2. Configure 12-Hour Backup in `.env` / `.env.central`

Update `.env` (or `.env.central`):

```env
# Path on the host pointing to the mounted HDD
HOST_BACKUP_ROOT=/mnt/hdd_data/sovereign/backups

# Backup interval set to 12 hours (43,200 seconds)
HOST_BACKUP_INTERVAL_SECS=43200
HOST_BACKUP_RETENTION_DAYS=90
```

### 3. Update `docker-compose.yml` Bind Mounts

In `infra/docker/docker-compose.yml`, mount the HDD volume into `host-backup`:

```yaml
  host-backup:
    profiles: [monitoring]
    image: ${SOVEREIGN_IMAGE_REF:-personal_finance:latest}
    volumes:
      - ../../storage:/app/storage
      - /mnt/hdd_data/sovereign/backups:/app/storage/backups
```

### 4. Enable Automatic HDD Spin-Down (Sleep Mode)

Set a 15-minute idle spindown timeout on Linux so the drive sleeps when not performing backups:

```bash
sudo hdparm -S 180 /dev/sdb
```
