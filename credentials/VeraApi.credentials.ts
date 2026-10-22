import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

import { VERA_BASE_URL } from '../nodes/Vera/constants';

export class VeraApi implements ICredentialType {
	name = 'veraApi';

	displayName = 'Vera API';

	icon: Icon = { light: 'file:../nodes/Vera/vera.svg', dark: 'file:../nodes/Vera/vera.dark.svg' };

	documentationUrl = 'https://vera.waggle.ae/docs';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			placeholder: 'vera_live_...',
			description:
				'Create a key under API keys in your Vera workspace. New accounts get free credits when they sign up at https://vera.waggle.ae/signup.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: VERA_BASE_URL,
			placeholder: VERA_BASE_URL,
			description:
				'The Vera API address. Leave it as it is unless you were given a different one, for example for a staging Vera. The key is sent to this address, so it must be https.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// GET /usage needs a valid key and costs no credits.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/usage',
			method: 'GET',
		},
	};
}
