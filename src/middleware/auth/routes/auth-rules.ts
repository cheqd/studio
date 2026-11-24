import { AuthRuleRepository } from './auth-rule-repository.js';
import { AccountAuthProvider } from './api/account-auth.js';
import { KeyAuthProvider } from './api/key-auth.js';
import { FlagsAuthRuleProvider } from './api/flags-auth.js';
import { AdminAuthRuleProvider } from './admin/admin-auth.js';
import { DidAuthRuleProvider } from './api/did-auth.js';
import { PresentationAuthRuleProvider } from './api/presentation-auth.js';
import { ResourceAuthRuleProvider } from './api/resource-auth.js';
import { CredentialAuthRuleProvider } from './api/credential-auth.js';
import { CredentialStatusAuthRuleProvider } from './api/credential-status-auth.js';
import { AuthInfoProvider } from './api/auth-user-info.js';
import { AccreditationAuthRuleProvider } from './api/accreditation-auth.js';
import { AgentAuthRuleProvider } from './api/agent-auth.js';
import { EventAuthRuleProvider } from './api/event-auth.js';
import { ProvidersAuthRuleProvider } from './api/provider-auth.js';

/** Every auth rule the API guard applies, in matching order. */
export function createAuthRuleRepository(): AuthRuleRepository {
	const authRuleRepository = new AuthRuleRepository();

	authRuleRepository.push(new AuthInfoProvider());

	authRuleRepository.push(new AccountAuthProvider());
	authRuleRepository.push(new KeyAuthProvider());

	authRuleRepository.push(new DidAuthRuleProvider());
	authRuleRepository.push(new ResourceAuthRuleProvider());
	authRuleRepository.push(new CredentialAuthRuleProvider());
	authRuleRepository.push(new CredentialStatusAuthRuleProvider());
	authRuleRepository.push(new PresentationAuthRuleProvider());
	authRuleRepository.push(new AccreditationAuthRuleProvider());
	authRuleRepository.push(new EventAuthRuleProvider());
	authRuleRepository.push(new AgentAuthRuleProvider());

	authRuleRepository.push(new FlagsAuthRuleProvider());
	authRuleRepository.push(new AdminAuthRuleProvider());
	authRuleRepository.push(new ProvidersAuthRuleProvider());

	return authRuleRepository;
}
