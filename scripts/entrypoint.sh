#!/bin/sh

sh write-envs-to-file.sh
miniflare /app/worker.js --env .env
