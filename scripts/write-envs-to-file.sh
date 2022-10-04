#!/bin/sh

env | grep "_ISSUER" > .env
echo _COSMOS_PAYER_MNEMONIC=$_COSMOS_PAYER_MNEMONIC >> .env
echo _NETWORK_RPC_URL=$_NETWORK_RPC_URL >> .env
