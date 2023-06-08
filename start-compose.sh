#!/bin/bash

USE_EXTERNAL_DB="false"

if [[ "$USE_EXTERNAL_DB" == "true" ]]; then
  docker compose build && docker compose up -d
else
  docker compose up credential-service -d
fi
