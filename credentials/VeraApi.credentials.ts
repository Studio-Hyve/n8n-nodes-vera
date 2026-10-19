import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

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
				'Create a key under API keys in your Vera workspace. New accounts get 3,000 free credits at https://vera.waggle.ae/signup.',
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
			baseURL: 'https://vera.waggle.ae/api/vera/v1',
			url: '/usage',
			method: 'GET',
		},
	};
}
