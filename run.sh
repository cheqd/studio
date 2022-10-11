#!/bin/bash

# This hack is the only way I could make it run.
env > .env
miniflare worker.js --env=.env
