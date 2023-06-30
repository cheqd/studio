#!/bin/bash

set -euo pipefail

# Create blank custom CA certificate file
touch /usr/local/share/ca-certificates/external-db-cert.crt

# Insert custom CA certificate contents from environment variable into file
echo "$EXTERNAL_DB_CERT" | tee /usr/local/share/ca-certificates/external-db-cert.crt > /dev/null

# Update CA certificates
update-ca-certificates
