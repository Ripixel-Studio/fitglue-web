# Bootstrap Guide

This document explains how to set up the IAM configuration for CircleCI deployments.

## Overview

The `scripts/setup_web_deployer.sh` script creates the necessary service account and IAM bindings for CircleCI to deploy the web frontend via OIDC (OpenID Connect) authentication.

## Prerequisites

- `gcloud` CLI installed and authenticated
- Access to the GCP projects (fitglue-server-dev, fitglue-server-test, fitglue-server-prod)
- The workload identity pool must already exist (created by the server repo's `setup_oidc.sh`)

## Running the Bootstrap Script

Run the script for each environment:

```bash
# Dev environment
./scripts/setup_web_deployer.sh dev

# Test environment
./scripts/setup_web_deployer.sh test

# Prod environment
./scripts/setup_web_deployer.sh prod
```

## What the Script Creates

For each environment, the script:

1. **Verifies workload identity pool exists**
   - Pool: `circleci-pool`
   - Provider: `circleci-provider`
   - Created by server repo

2. **Enables required APIs**
   - `firebasehosting.googleapis.com`
   - `firebase.googleapis.com`
   - `storage.googleapis.com`
   - `iamcredentials.googleapis.com`

3. **Creates service account**
   - Name: `circleci-web-deployer`
   - Purpose: Deploy web frontend via CircleCI

4. **Grants IAM roles**
   - `roles/firebasehosting.admin` - Deploy to Firebase Hosting
   - `roles/storage.objectAdmin` - Upload hosting files

   Firestore **rules** deployment (`firebase deploy --only hosting,firestore:rules`)
   needs `roles/firebaserules.admin`, which is granted to this SA by fitglue-server's
   `terraform/iam.tf`, not this script. Firestore **indexes** are owned by
   fitglue-server terraform (ADR 011), so the web deployer has no `datastore.*` role.

5. **Configures workload identity bindings**
   - `roles/iam.workloadIdentityUser` - Allow OIDC impersonation
   - `roles/iam.serviceAccountTokenCreator` - Generate access tokens
   - Member pattern: `principalSet://iam.googleapis.com/projects/{PROJECT_NUMBER}/locations/global/workloadIdentityPools/circleci-pool/*`

## Key Design Decisions

### Wildcard Member Pattern

The script uses a **wildcard (`/*`)** for the workload identity binding instead of a specific attribute filter. This matches the server repo's configuration and is required for proper OIDC authentication.

**Correct**:
```
principalSet://iam.googleapis.com/projects/911679924866/locations/global/workloadIdentityPools/circleci-pool/*
```

**Incorrect** (doesn't work):
```
principalSet://iam.googleapis.com/projects/911679924866/locations/global/workloadIdentityPools/circleci-pool/attribute.project_id/ecdc6640-c8ad-40c7-8710-b28261eb9107
```

### Shared Workload Identity Pool

The web and server repos share the same workload identity pool (`circleci-pool`). Separation is achieved through:
- Different service accounts (`circleci-deployer` vs `circleci-web-deployer`)
- Different permissions (server has broad Editor role, web has limited Firebase/Storage)
- CircleCI specifies which service account to use in the credential config

### Why Not Terraform?

The IAM configuration is managed by the bootstrap script instead of Terraform because:
1. **Chicken-and-egg problem**: Terraform needs the service account to authenticate, but can't create it without authentication
2. **Permission scoping**: The web deployer service account has minimal permissions (Firebase + Storage), not enough to create service accounts or manage IAM
3. **Simplicity**: One-time setup via script is simpler than managing state and imports

## Verification

After running the script, verify the configuration:

```bash
# Check service account exists
gcloud iam service-accounts describe circleci-web-deployer@fitglue-server-dev.iam.gserviceaccount.com

# Check IAM bindings
gcloud iam service-accounts get-iam-policy circleci-web-deployer@fitglue-server-dev.iam.gserviceaccount.com
```

Expected output should show:
- `roles/iam.workloadIdentityUser` with wildcard member
- `roles/iam.serviceAccountTokenCreator` with wildcard member

## Troubleshooting

### Workload Identity Pool Not Found

Error: `Workload Identity Pool 'circleci-pool' does not exist`

**Solution**: Run the server repo's `setup_oidc.sh` script first to create the pool.

### Permission Denied

Error: `Permission denied to create service account`

**Solution**: Ensure you're authenticated with an account that has `roles/iam.serviceAccountAdmin` or `roles/owner` on the project.

### Service Account Already Exists

The script handles this gracefully with `|| echo "Service account already exists, continuing..."`. It will update the IAM bindings even if the service account exists.

## Re-running the Script

It's safe to re-run the script multiple times. It will:
- Skip creating resources that already exist
- Update IAM bindings to ensure they're correct
- Add any missing permissions

This is useful for:
- Fixing permission issues
- Updating to new binding patterns
- Verifying configuration
