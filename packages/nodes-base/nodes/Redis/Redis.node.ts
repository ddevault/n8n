import { IExecuteFunctions } from 'n8n-core';
import {
	GenericValue,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

import { set } from 'lodash';
import * as redis from 'redis';

import * as util from 'util';

export class Redis implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Redis',
		name: 'redis',
		icon: 'file:redis.png',
		group: ['input'],
		version: 1,
		description: 'Gets, sends data to Redis and receives generic information.',
		defaults: {
			name: 'Redis',
			color: '#0033AA',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'redis',
				required: true,
			}
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				options: [
					{
						name: 'Delete',
						value: 'delete',
						description: 'Deletes a key from Redis.',
					},
					{
						name: 'Get',
						value: 'get',
						description: 'Returns the value of a key from Redis.',
					},
					{
						name: 'Info',
						value: 'info',
						description: 'Returns generic information about the Redis instance.',
					},
					{
						name: 'Keys',
						value: 'keys',
						description: 'Returns all the keys matching a pattern.',
					},
					{
						name: 'Set',
						value: 'set',
						description: 'Sets the value of a key in redis.',
					},
				],
				default: 'info',
				description: 'The operation to perform.',
			},

			// ----------------------------------
			//         get
			// ----------------------------------
			{
				displayName: 'Name',
				name: 'propertyName',
				type: 'string',
				displayOptions: {
					show: {
						operation: [
							'get'
						],
					},
				},
				default: 'propertyName',
				required: true,
				description: 'Name of the property to write received data to.<br />Supports dot-notation.<br />Example: "data.person[0].name"',
			},
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				displayOptions: {
					show: {
						operation: [
							'delete'
						],
					},
				},
				default: '',
				required: true,
				description: 'Name of the key to delete from Redis.',
			},
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				displayOptions: {
					show: {
						operation: [
							'get'
						],
					},
				},
				default: '',
				required: true,
				description: 'Name of the key to get from Redis.',
			},
			{
				displayName: 'Key Type',
				name: 'keyType',
				type: 'options',
				displayOptions: {
					show: {
						operation: [
							'get'
						],
					},
				},
				options: [
					{
						name: 'Automatic',
						value: 'automatic',
						description: 'Requests the type before requesting the data (slower).',
					},
					{
						name: 'Hash',
						value: 'hash',
						description: 'Data in key is of type "hash".',
					},
					{
						name: 'String',
						value: 'string',
						description: 'Data in key is of type "string".',
					},
					{
						name: 'List',
						value: 'list',
						description: 'Data in key is of type "lists".',
					},
					{
						name: 'Sets',
						value: 'sets',
						description: 'Data in key is of type "sets".',
					},
				],
				default: 'automatic',
				description: 'The type of the key to get.',
			},

			// ----------------------------------
			//         keys
			// ----------------------------------
			{
				displayName: 'Key Pattern',
				name: 'keyPattern',
				type: 'string',
				displayOptions: {
					show: {
						operation: [
							'keys'
						],
					},
				},
				default: '',
				required: true,
				description: 'The key pattern for the keys to return.',
			},

			// ----------------------------------
			//         set
			// ----------------------------------
			{
				displayName: 'Key',
				name: 'key',
				type: 'string',
				displayOptions: {
					show: {
						operation: [
							'set'
						],
					},
				},
				default: '',
				required: true,
				description: 'Name of the key to set in Redis.',
			},
			{
				displayName: 'Value',
				name: 'value',
				type: 'string',
				displayOptions: {
					show: {
						operation: [
							'set'
						],
					},
				},
				default: '',
				description: 'The value to write in Redis.',
			},
			{
				displayName: 'Key Type',
				name: 'keyType',
				type: 'options',
				displayOptions: {
					show: {
						operation: [
							'set'
						],
					},
				},
				options: [
					{
						name: 'Automatic',
						value: 'automatic',
						description: 'Tries to figure out the type automatically depending on the data.',
					},
					{
						name: 'Hash',
						value: 'hash',
						description: 'Data in key is of type "hash".',
					},
					{
						name: 'String',
						value: 'string',
						description: 'Data in key is of type "string".',
					},
					{
						name: 'List',
						value: 'list',
						description: 'Data in key is of type "lists".',
					},
					{
						name: 'Sets',
						value: 'sets',
						description: 'Data in key is of type "sets".',
					},
				],
				default: 'automatic',
				description: 'The type of the key to set.',
			},
		]
	};


	execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		// Parses the given value in a number if it is one else returns a string
		function getParsedValue (value: string): string | number {
			if (value.match(/^[\d\.]+$/) === null) {
				// Is a string
				return value;
			} else {
				// Is a number
				return parseFloat(value);
			}
		}

		// Converts the Redis Info String into an object
		function convertInfoToObject(stringData: string): IDataObject {
			const returnData: IDataObject = {};

			let key:string, value:string;
			for (const line of stringData.split('\n')) {
				if (['#', ''].includes(line.charAt(0))) {
					continue;
				}
				[key, value] = line.split(':');
				if (key === undefined || value === undefined) {
					continue;
				}
				value = value.trim();

				if (value.includes('=')) {
					returnData[key] = {};
					let key2: string, value2: string;
					for (const keyValuePair of value.split(',')) {
						[key2, value2] = keyValuePair.split('=');
						(returnData[key] as IDataObject)[key2] = getParsedValue(value2);
					}
				} else {
					returnData[key] = getParsedValue(value);
				}
			}

			return returnData;
		}

		async function getValue(client: redis.RedisClient, keyName: string, type?: string) {
			if (type === undefined || type === 'automatic') {
				// Request the type first
				const clientType = util.promisify(client.type).bind(client);
				type = await clientType(keyName);
			}

			console.log(keyName + ': ' + type);


			if (type === 'string') {
				const clientGet = util.promisify(client.get).bind(client);
				return await clientGet(keyName);
			} else if (type === 'hash') {
				const clientHGetAll = util.promisify(client.hgetall).bind(client);
				return await clientHGetAll(keyName);
			} else if (type === 'list') {
				const clientLRange = util.promisify(client.lrange).bind(client);
				return await clientLRange(keyName, 0, -1);
			} else if (type === 'sets') {
				const clientSMembers = util.promisify(client.smembers).bind(client);
				return await clientSMembers(keyName);
			}
		}


		async function setValue(client: redis.RedisClient, keyName: string, value: string | number | object | string[] | number[], type?: string) {
			if (type === undefined || type === 'automatic') {
				// Request the type first
				if (typeof value === 'string') {
					type = 'string';
				} else if (Array.isArray(value)) {
					type = 'list';
				} else if (typeof value === 'object') {
					type = 'hash';
				} else {
					throw new Error('Could not identify the type to set. Please set it manually!');
				}
			}

			if (type === 'string') {
				const clientSet = util.promisify(client.set).bind(client);
				return await clientSet(keyName, value.toString());
			} else if (type === 'hash') {
				const clientHset = util.promisify(client.hset).bind(client);
				for (const key of Object.keys(value)) {
					await clientHset(keyName, key, (value as IDataObject)[key]!.toString());
				}
				return;
			} else if (type === 'list') {
				const clientLset = util.promisify(client.lset).bind(client);
				for (let index = 0; index < (value as string[]).length; index++) {
					await clientLset(keyName, index, (value as IDataObject)[index]!.toString());
				}
				return;
			}
		}


		return new Promise((resolve, reject) => {
			// TODO: For array and object fields it should not have a "value" field it should
			//       have a parameter field for a path. Because it is not possible to set
			//       array, object via parameter directly (should maybe be possible?!?!)
			//       Should maybe have a parameter which is JSON.
			const credentials = this.getCredentials('redis');

			if (credentials === undefined) {
				throw new Error('No credentials got returned!');
			}

			const redisOptions: redis.ClientOpts = {
				host: credentials.host as string,
				port: credentials.port as number,
			};

			if (credentials.password) {
				redisOptions.password = credentials.password as string;
			}

			const client = redis.createClient(redisOptions);

			const operation = this.getNodeParameter('operation', 0) as string;

			client.on('error', (err: Error) => {
				reject(err);
			});

			client.on('ready', async (err: Error | null) => {

				if (operation === 'info') {
					const clientInfo = util.promisify(client.info).bind(client);
					const result = await clientInfo();

					resolve(this.prepareOutputData([{ json: convertInfoToObject(result as unknown as string) }]));
					client.quit();

				} else if (['delete', 'get', 'keys', 'set'].includes(operation)) {
					const items = this.getInputData();

					let item: INodeExecutionData;
					for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
						item = { json: {} };

						if (operation === 'delete') {
							const keyDelete = this.getNodeParameter('key', itemIndex) as string;

							const clientDel = util.promisify(client.del).bind(client);
							// @ts-ignore
							await clientDel(keyDelete);
						} else if (operation === 'get') {
							const propertyName = this.getNodeParameter('propertyName', itemIndex) as string;
							const keyGet = this.getNodeParameter('key', itemIndex) as string;
							const keyType = this.getNodeParameter('keyType', itemIndex) as string;

							const value = await getValue(client, keyGet, keyType);
							set(item.json, propertyName, value);
						} else if (operation === 'keys') {
							const keyPattern = this.getNodeParameter('keyPattern', itemIndex) as string;

							const clientKeys = util.promisify(client.keys).bind(client);
							const keys = await clientKeys(keyPattern);

							const promises: {
								[key: string]: GenericValue;
							} = {};

							for (const keyName of keys) {
								promises[keyName] = await getValue(client, keyName);
								console.log(promises[keyName]);

							}

							for (const keyName of keys) {
								set(item.json, keyName, await promises[keyName]);
							}
						} else if (operation === 'set') {
							const keySet = this.getNodeParameter('key', itemIndex) as string;
							const value = this.getNodeParameter('value', itemIndex) as string;
							const keyType = this.getNodeParameter('keyType', itemIndex) as string;

							await setValue(client, keySet, value, keyType);
						}
					}

					resolve(this.prepareOutputData(items));
				}
			});
		});
	}
}
