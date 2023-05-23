import type { CredentialListRenderSchema, CredentialRenderMap } from "$shared/schema";
import type { z } from "zod";

export type CredentialListRenderType = z.infer<typeof CredentialListRenderSchema>;
export type CredentialRenderMapType = z.infer<typeof CredentialRenderMap>;
