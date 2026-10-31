#!/usr/bin/env bash
# One-shot AWS deployment: API on App Runner (from ECR), frontend on Amplify Hosting (manual deploy).
# Requires: aws CLI v2 with credentials, docker, node/npm. Idempotent — re-run to redeploy.
#
#   ./infra/aws/deploy.sh                      # deploy both
#   ./infra/aws/deploy.sh api                  # API only
#   ./infra/aws/deploy.sh web                  # frontend only (uses the existing API URL)
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
APP_NAME="${APP_NAME:-weather-routing}"
REPO_NAME="${REPO_NAME:-weather-routing-api}"
ROLE_NAME="${ROLE_NAME:-${APP_NAME}-apprunner-ecr-access}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO_NAME}"
WHAT="${1:-all}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

deploy_api() {
  log "ECR repository ${REPO_NAME}"
  aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" >/dev/null 2>&1 \
    || aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION" \
         --image-scanning-configuration scanOnPush=true >/dev/null

  log "Building and pushing image"
  aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
  docker build --platform linux/amd64 -t "${ECR_URI}:latest" "${ROOT}/backend"
  docker push "${ECR_URI}:latest"

  log "IAM role for App Runner to pull from ECR"
  if ! aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
    aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }' >/dev/null
    aws iam attach-role-policy --role-name "$ROLE_NAME" \
      --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
    sleep 10  # IAM propagation
  fi
  ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query Role.Arn --output text)"

  SECRET_KEY="${SECRET_KEY:-$(python -c 'import secrets; print(secrets.token_urlsafe(48))')}"
  FRONTEND_ORIGIN="${FRONTEND_ORIGIN:-$(amplify_url || true)}"

  SERVICE_ARN="$(aws apprunner list-services --region "$REGION" \
    --query "ServiceSummaryList[?ServiceName=='${APP_NAME}-api'].ServiceArn | [0]" --output text)"

  ENV_JSON="$(printf '{"SECRET_KEY":"%s","DEBUG":"False","ALLOWED_HOSTS":".awsapprunner.com","CORS_ALLOWED_ORIGINS":"%s","NOMINATIM_USER_AGENT":"%s"}' \
    "$SECRET_KEY" "${FRONTEND_ORIGIN:-http://localhost:5173}" "${NOMINATIM_USER_AGENT:-weather-routing (set-your-email@example.com)}")"

  SOURCE_CONFIG="$(cat <<JSON
{
  "ImageRepository": {
    "ImageIdentifier": "${ECR_URI}:latest",
    "ImageRepositoryType": "ECR",
    "ImageConfiguration": { "Port": "8000", "RuntimeEnvironmentVariables": ${ENV_JSON} }
  },
  "AutoDeploymentsEnabled": true,
  "AuthenticationConfiguration": { "AccessRoleArn": "${ROLE_ARN}" }
}
JSON
)"

  if [[ "$SERVICE_ARN" == "None" || -z "$SERVICE_ARN" ]]; then
    log "Creating App Runner service ${APP_NAME}-api"
    SERVICE_ARN="$(aws apprunner create-service --region "$REGION" --service-name "${APP_NAME}-api" \
      --source-configuration "$SOURCE_CONFIG" \
      --instance-configuration '{"Cpu":"0.25 vCPU","Memory":"0.5 GB"}' \
      --health-check-configuration '{"Protocol":"HTTP","Path":"/api/health/","Interval":10,"Timeout":5,"HealthyThreshold":1,"UnhealthyThreshold":5}' \
      --query Service.ServiceArn --output text)"
  else
    log "Updating App Runner service"
    aws apprunner update-service --region "$REGION" --service-arn "$SERVICE_ARN" \
      --source-configuration "$SOURCE_CONFIG" >/dev/null
  fi

  log "Waiting for the service to be RUNNING"
  until [[ "$(aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" --query Service.Status --output text)" == "RUNNING" ]]; do
    sleep 15; printf '.'
  done
  API_URL="https://$(aws apprunner describe-service --region "$REGION" --service-arn "$SERVICE_ARN" --query Service.ServiceUrl --output text)"
  echo; log "API live at ${API_URL}  (health: ${API_URL}/api/health/)"
}

api_url() {
  aws apprunner list-services --region "$REGION" \
    --query "ServiceSummaryList[?ServiceName=='${APP_NAME}-api'].ServiceUrl | [0]" --output text 2>/dev/null \
    | sed -e 's/^None$//' -e 's#^#https://#' -e 's#^https://$##'
}

amplify_app_id() {
  aws amplify list-apps --region "$REGION" --query "apps[?name=='${APP_NAME}'].appId | [0]" --output text 2>/dev/null | sed 's/^None$//'
}

amplify_url() {
  local id; id="$(amplify_app_id)"
  [[ -n "$id" ]] && echo "https://main.${id}.amplifyapp.com"
}

deploy_web() {
  local API; API="${VITE_API_BASE_URL:-$(api_url)}"
  [[ -n "$API" ]] || { echo "No API URL found — deploy the API first or set VITE_API_BASE_URL"; exit 1; }

  log "Building frontend against ${API}"
  (cd "${ROOT}/frontend" && npm ci && VITE_API_BASE_URL="$API" npm run build)

  local APP_ID; APP_ID="$(amplify_app_id)"
  if [[ -z "$APP_ID" ]]; then
    log "Creating Amplify app ${APP_NAME}"
    APP_ID="$(aws amplify create-app --region "$REGION" --name "$APP_NAME" --platform WEB \
      --custom-rules '[{"source":"/<*>","target":"/index.html","status":"404-200"}]' \
      --query app.appId --output text)"
    aws amplify create-branch --region "$REGION" --app-id "$APP_ID" --branch-name main >/dev/null
  fi

  log "Uploading build"
  rm -f "${ROOT}/frontend/dist.zip"
  if command -v zip >/dev/null 2>&1; then
    (cd "${ROOT}/frontend/dist" && zip -qr ../dist.zip .)
  else
    # Git Bash on Windows has no zip; Python's zipfile CLI keeps index.html at the archive root.
    (cd "${ROOT}/frontend/dist" && python -m zipfile -c ../dist.zip ./*)
  fi
  read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment --region "$REGION" --app-id "$APP_ID" --branch-name main \
    --query '[jobId, zipUploadUrl]' --output text)
  curl -fsS -T "${ROOT}/frontend/dist.zip" "$UPLOAD_URL"
  aws amplify start-deployment --region "$REGION" --app-id "$APP_ID" --branch-name main --job-id "$JOB_ID" >/dev/null

  log "Waiting for Amplify deployment"
  until [[ "$(aws amplify get-job --region "$REGION" --app-id "$APP_ID" --branch-name main --job-id "$JOB_ID" --query job.summary.status --output text)" =~ ^(SUCCEED|FAILED|CANCELLED)$ ]]; do
    sleep 10; printf '.'
  done
  echo; log "Frontend live at https://main.${APP_ID}.amplifyapp.com"
  echo "If this is the first deploy, re-run './infra/aws/deploy.sh api' once so CORS_ALLOWED_ORIGINS picks up this URL."
}

case "$WHAT" in
  api) deploy_api ;;
  web) deploy_web ;;
  all) deploy_api; deploy_web ;;
  *) echo "usage: $0 [api|web|all]"; exit 2 ;;
esac
