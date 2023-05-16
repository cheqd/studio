import { env } from '$env/dynamic/public';
export const WaltIdTokenPath = 'waltid.token' as const;
export const DefaultIssuer = env.PUBLIC_ISSUER_TENANT_ID ?? ('acme' as const);
export const DefaultVerifier = env.PUBLIC_VERIFIER_TENANT_ID ?? ('acme' as const);
export const DefaultDiscordProfilePicture =
	'https://pub-a310c87fefe442578e00f33bf7bdf4e2.r2.dev/discord-default-profile-picture.png';
export const DefaultCheqdIssuerLogo =
	'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:mainnet:b8e398b3-8f67-44a0-97ac-0c0cc9a00917/resources/5e16a3f9-7c6e-4b6b-8e28-20f56780ee25';
