#!/usr/bin/env bash
set -Eeuo pipefail

required_variables=(
  PLESK_HOST
  PLESK_USER
  PLESK_TARGET_PATH
)

for variable in "${required_variables[@]}"; do
  if [[ -z "${!variable:-}" ]]; then
    echo "Missing required environment variable: ${variable}" >&2
    exit 1
  fi
done

PLESK_PORT="${PLESK_PORT:-22}"

if [[ ! -d dist ]]; then
  echo "dist/ does not exist. Run the production build first." >&2
  exit 1
fi

# / ต่อท้าย source สำคัญ: ส่งเฉพาะข้างใน dist ไปยัง document root
# --delete ทำให้ไฟล์เก่าที่มี content hash ถูกลบ แต่จะไม่แตะไฟล์นอก target path
rsync \
  --archive \
  --compress \
  --delete \
  --human-readable \
  --itemize-changes \
  -e "ssh -p ${PLESK_PORT} -o BatchMode=yes" \
  dist/ \
  "${PLESK_USER}@${PLESK_HOST}:${PLESK_TARGET_PATH%/}/"

echo "Deployment completed: ${PLESK_HOST}:${PLESK_TARGET_PATH%/}/"
