#!/bin/bash
set -e

# GCP OIDC Setup for CircleCI Web Deployer
# This script configures the web-specific service account and binds it to the existing
# Workload Identity Pool created by the server repo.
#
# Usage: ./scripts/setup_web_deployer.sh <environment>
# Example: ./scripts/setup_web_deployer.sh dev

# Validate environment argument
ENV=${1:-dev}
if [[ ! "$ENV" =~ ^(dev|test|prod)$ ]]; then
  echo "❌ Error: Invalid environment '$ENV'"
  echo "Usage: $0 <dev|test|prod>"
  exit 1
fi

PROJECT_ID="fitglue-server-${ENV}"
CIRCLECI_ORG_ID="ecdc6640-c8ad-40c7-8710-b28261eb9107"
POOL_NAME="circleci-pool"
SA_NAME="circleci-web-deployer"

echo "🔧 Setting up Web Deployer for CircleCI -> GCP authentication"
echo "Environment: $ENV"
echo "Project: $PROJECT_ID"
echo ""

# Get project number dynamically
echo "📊 Fetching project number..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
if [ -z "$PROJECT_NUMBER" ]; then
  echo "❌ Error: Could not fetch project number for $PROJECT_ID"
  echo "Make sure the project exists and you have access to it."
  exit 1
fi
echo "Project Number: $PROJECT_NUMBER"
echo ""

# Verify the workload identity pool exists (created by server repo)
echo "🔍 Verifying Workload Identity Pool exists..."
if ! gcloud iam workload-identity-pools describe "$POOL_NAME" \
  --project="$PROJECT_ID" \
  --location="global" &>/dev/null; then
  echo "❌ Error: Workload Identity Pool '$POOL_NAME' does not exist"
  echo "Please run the server repo's setup_oidc.sh script first to create the pool."
  exit 1
fi
echo "✓ Workload Identity Pool exists"
echo ""

# Enable required APIs for web deployment
echo "🔌 Enabling required APIs..."
gcloud services enable \
  firebasehosting.googleapis.com \
  firebase.googleapis.com \
  storage.googleapis.com \
  iamcredentials.googleapis.com \
  --project="$PROJECT_ID"
echo "APIs enabled"
echo ""

# Create Service Account
echo "👤 Creating Web Deployer Service Account..."
gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT_ID" \
  --display-name="CircleCI Web Deployer" \
  --description="Service account for CircleCI web frontend deployments" || echo "Service account already exists, continuing..."

# Grant Firebase Hosting Admin role
echo "🔐 Granting Firebase Hosting permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/firebasehosting.admin" \
  --condition=None

# Grant Storage Object Admin (for hosting files)
echo "🔐 Granting Storage permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin" \
  --condition=None

# Grant Cloud Datastore Index Admin (for firestore.indexes.json)
# `firebase deploy --only ...,firestore` provisions composite indexes. Creating a
# NEW index calls firestore.googleapis.com .../indexes, which needs
# datastore.indexes.create — not included in Firebase Hosting Admin. Without this
# role the deploy 403s the first time a non-empty index set must be created
# (an empty index set is a no-op and hides the gap). See firestore.indexes.json.
echo "🔐 Granting Firestore index permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.indexAdmin" \
  --condition=None

echo "Permissions granted"

# Allow CircleCI to impersonate the Web Deployer Service Account
# Note: Uses wildcard to allow any principal from the pool (matches server pattern)
echo "🎭 Configuring Workload Identity binding..."
gcloud iam service-accounts add-iam-policy-binding \
  "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_NAME/*"

# Grant Token Creator permission to the workload identity pool
# This allows the pool to generate access tokens for the service account
echo "🔐 Granting Token Creator permission to workload identity pool..."
gcloud iam service-accounts add-iam-policy-binding \
  "$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com" \
  --project="$PROJECT_ID" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_NAME/*"

echo ""
echo "🔥 Initializing Firebase for project..."
# Add Firebase to the GCP project using Firebase Management API
# This is equivalent to clicking "Add Firebase" in the console
ACCESS_TOKEN=$(gcloud auth application-default print-access-token)
curl -X POST \
  "https://firebase.googleapis.com/v1beta1/projects/$PROJECT_ID:addFirebase" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' || echo "Firebase already initialized or initialization failed (may already exist), continuing..."

echo ""
echo "🏠 Creating Firebase Hosting site..."
# Install firebase-tools if not already installed
if ! command -v firebase &> /dev/null; then
  echo "Installing Firebase CLI..."
  npm install -g firebase-tools
fi

# Create the hosting site (this is idempotent)
# Note: We don't need to authenticate separately - gcloud auth is sufficient
firebase hosting:sites:create "$PROJECT_ID" --project="$PROJECT_ID" --non-interactive || echo "Site already exists, continuing..."

echo ""
echo "✅ Web Deployer Setup Complete!"
echo ""
echo "📋 Configuration Summary:"
echo "  Workload Identity Pool: projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/$POOL_NAME (shared with server)"
echo "  Service Account: $SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"
echo "  Permissions: Firebase Hosting Admin, Storage Object Admin, Cloud Datastore Index Admin"
echo ""
echo "🔄 Next steps:"
echo "  1. Repeat for other environments: ./scripts/setup_web_deployer.sh test"
echo "  2. Repeat for other environments: ./scripts/setup_web_deployer.sh prod"
echo "  3. Push code to GitHub and configure CircleCI"
echo "  4. CircleCI will automatically authenticate using OIDC tokens"

