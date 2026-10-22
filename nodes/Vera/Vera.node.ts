import type {
	IExecuteFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { veraProperties } from './descriptions';
import {
	apiErrorToJson,
	buildRequestSpec,
	errorToJson,
	isSuccess,
	mapApiError,
	parseSuccess,
	resolveBaseUrl,
	toHttpOptions,
	VeraApiError,
	VeraInputError,
	type VeraOperation,
} from './GenericFunctions';

export class Vera implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Vera',
		name: 'vera',
		icon: { light: 'file:vera.svg', dark: 'file:vera.dark.svg' },
		group: ['input'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Scrape pages, search the web, get search results pages, keyword ideas and AI answers with Vera by Waggle',
		defaults: { name: 'Vera' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'veraApi', required: true }],
		properties: veraProperties,
	};

	// Programmatic style rather than declarative: the node assembles the extraction-rule map from a
	// repeating field list, checks the API's combination rules before spending a request, adds the
	// credits used to every result and turns API failures into actionable errors.
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// The API address comes from the credential (production unless it was changed).
		const credentials = await this.getCredentials('veraApi');

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const operation = this.getNodeParameter('operation', itemIndex) as VeraOperation;
				const baseUrl = resolveBaseUrl(credentials.baseUrl);
				const spec = buildRequestSpec(operation, (name, fallback) =>
					this.getNodeParameter(name, itemIndex, fallback),
				);
				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'veraApi',
					toHttpOptions(spec, baseUrl),
				)) as IN8nHttpFullResponse;

				if (!isSuccess(response)) {
					const info = mapApiError(response);
					if (this.continueOnFail()) {
						returnData.push({ json: apiErrorToJson(info), pairedItem: { item: itemIndex } });
						continue;
					}
					throw new NodeApiError(
						this.getNode(),
						{ message: info.message, httpCode: String(info.httpCode) } as JsonObject,
						{
							message: info.message,
							description: info.description,
							httpCode: String(info.httpCode),
							itemIndex,
						},
					);
				}

				returnData.push({ json: parseSuccess(response), pairedItem: { item: itemIndex } });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: errorToJson(error), pairedItem: { item: itemIndex } });
					continue;
				}
				if (error instanceof VeraInputError) {
					throw new NodeOperationError(this.getNode(), error.message, {
						description: error.description,
						itemIndex,
					});
				}
				if (error instanceof VeraApiError) {
					throw new NodeApiError(
						this.getNode(),
						{ message: error.info.message, httpCode: String(error.info.httpCode) } as JsonObject,
						{
							message: error.info.message,
							description: error.info.description,
							httpCode: String(error.info.httpCode),
							itemIndex,
						},
					);
				}
				// A transport failure before any answer (DNS, reset, client timeout), or an error
				// n8n already wrapped, which NodeApiError hands back as it is.
				throw new NodeApiError(this.getNode(), error as JsonObject, {
					description: 'The request to Vera did not complete. Check the connection and try again.',
					itemIndex,
				});
			}
		}

		return [returnData];
	}
}
