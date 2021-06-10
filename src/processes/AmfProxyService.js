import { fork } from 'child_process';
import path from 'path';
import { 
  AmfStoreProxy, 
  workerValue, 
  createWorker, 
  responseHandler, 
  errorHandler, 
  processResponse, 
  sendMessage, 
  getId, 
  createResponsePromise, 
  ns,
  StoreEventTypes,
} from "@api-client/amf-store";

/** @typedef {import('child_process').ForkOptions} ForkOptions */
/** @typedef {import('child_process').ChildProcess} ChildProcess */
/** @typedef {import('@api-client/amf-store').WorkerResponse} WorkerResponse */
/** @typedef {import('@api-client/amf-store').WorkerMessage} WorkerMessage */
/** @typedef {import('@api-client/amf-store').ApiServerInit} ApiServerInit */
/** @typedef {import('@api-client/amf-store').ApiServer} ApiServer */
/** @typedef {import('@api-client/amf-store').EndPointInit} EndPointInit */
/** @typedef {import('@api-client/amf-store').ApiEndPoint} ApiEndPoint */
/** @typedef {import('@api-client/amf-store').OperationInit} OperationInit */
/** @typedef {import('@api-client/amf-store').ApiOperation} ApiOperation */
/** @typedef {import('@api-client/amf-store').OperationResponseInit} OperationResponseInit */
/** @typedef {import('@api-client/amf-store').ApiResponse} ApiResponse */
/** @typedef {import('@api-client/amf-store').OperationRequestInit} OperationRequestInit */
/** @typedef {import('@api-client/amf-store').ApiRequest} ApiRequest */
/** @typedef {import('@api-client/amf-store').ApiParameter} ApiParameter */
/** @typedef {import('@api-client/amf-store').ExampleInit} ExampleInit */
/** @typedef {import('@api-client/amf-store').ApiExample} ApiExample */
/** @typedef {import('@api-client/amf-store').ParameterInit} ParameterInit */
/** @typedef {import('@api-client/amf-store').ApiPayload} ApiPayload */
/** @typedef {import('@api-client/amf-store').PayloadInit} PayloadInit */
/** @typedef {import('@api-client/amf-store').DocumentationInit} DocumentationInit */
/** @typedef {import('@api-client/amf-store').ApiDocumentation} ApiDocumentation */
/** @typedef {import('@api-client/amf-store').ShapeInit} ShapeInit */
/** @typedef {import('@api-client/amf-store').ApiShapeUnion} ApiShapeUnion */
/** @typedef {import('@api-client/amf-store/worker.index').ApiStoreCreateRecord} ApiStoreCreateRecord */
/** @typedef {import('@api-client/amf-store/worker.index').ApiStoreDeleteRecord} ApiStoreDeleteRecord */
/** @typedef {import('@api-client/amf-store/worker.index').ApiStoreChangeRecord} ApiStoreChangeRecord */
/** @typedef {import('amf-client-js').model.document.Document} Document */
/** @typedef {import('amf-client-js').model.domain.WebApi} WebApi */
/** @typedef {import('amf-client-js').model.domain.EndPoint} EndPoint */
/** @typedef {import('amf-client-js').model.domain.Operation} Operation */
/** @typedef {import('amf-client-js').model.domain.CreativeWork} CreativeWork */
/** @typedef {import('amf-client-js').model.domain.Parameter} Parameter */
/** @typedef {import('amf-client-js').model.domain.Response} Response */
/** @typedef {import('amf-client-js').model.domain.Request} Request */
/** @typedef {import('amf-client-js').model.domain.Payload} Payload */
/** @typedef {import('amf-client-js').model.domain.Example} Example */
/** @typedef {import('../EventClient').EventClient} EventClient */

const basePath = path.dirname(import.meta.url.replace('file:/', ''));
const processPath = path.join(basePath, 'AmfProcess.js');
const exitHandler = Symbol('exitHandler');
const initQueue = Symbol('initQueue');
const processInitQueue = Symbol('processInitQueue');

export class AmfProxyService extends AmfStoreProxy {
  /**
   * @type {ChildProcess}
   */
  get worker() {
    if (!this[workerValue]) {
      this[workerValue] = this[createWorker]();
    }
    return this[workerValue];
  }

  /**
   * @param {() => void} onExit A function to call when the process finish.
   */
  constructor(onExit) {
    super();
    this.onExit = onExit;
    this.isReady = false;
    /** @type {WorkerMessage[]} */
    this[initQueue] = [];
    /** 
     * The list of SSE clients connected to this process.
     * They receive all change events when a proxy method is called.
     * @type {EventClient[]}
     */
    this.clients = [];
  }

  [createWorker]() {
    // const options = /** @type ForkOptions */ ({
    //   stdio: [ 'pipe', 'pipe', 'pipe', 'ipc' ],
    // });
    // const parameters = [];
    const process = fork(processPath); // , parameters, options
    process.on('message', this[responseHandler].bind(this));
    process.on('exit', this[exitHandler].bind(this));
    process.on('error', this[errorHandler].bind(this));
    return process;
  }

  [processInitQueue]() {
    const { worker } = this;
    this[initQueue].forEach((cmd) => worker.send(cmd));
  }

  /**
   * A handler for the exit event of the child process
   */
  [exitHandler]() {
    this.onExit();
  }

  /**
   * @param {WorkerResponse} message
   */
  [responseHandler](message) {
    if (!message.id && message.result === 'ready') {
      this.isReady = true;
      this[processInitQueue]();
    } else {
      this[processResponse](message);
    }
  }

  /**
   * Sends a message to the worker.
   * @param {string} type The type of the message
   * @param {...any} args A list of optional arguments.
   */
  [sendMessage](type, ...args) {
    const { worker } = this;
    const id = this[getId]();
    const result = this[createResponsePromise](id);
    const message = /** @type WorkerMessage */ ({
      id,
      type,
      arguments: args,
    });
    if (this.isReady){
      worker.send(message);
    } else {
      this[initQueue].push(message);
    }
    return result;
  }

  /**
   * @param {string} type
   * @param {any} data
   */
  notifyClients(type, data) {
    this.clients.forEach((c) => c.notify(type, data));
  }

  /**
   * Adds a server definition to the API.
   * @param {ApiServerInit} init 
   * @returns {Promise<ApiServer>} The instance of the created server
   */
  async addServer(init) {
    const result = await super.addServer(init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Server,
      item: result,
    });
    this.notifyClients(StoreEventTypes.Server.State.created, record);
    return result;
  }

  /**
   * Adds a new endpoint to the API and returns generated id for the endpoint.
   * @param {EndPointInit} init EndPoint init parameters
   * @returns {Promise<ApiEndPoint>}
   */
  async addEndpoint(init) {
    const endpoint = await super.addEndpoint(init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: endpoint.id,
      domainType: ns.aml.vocabularies.apiContract.EndPoint,
      item: endpoint,
    });
    this.notifyClients(StoreEventTypes.Endpoint.State.created, record);
    return endpoint;
  }

  /**
   * Removes endpoint from the API.
   * @param {string} id The endpoint domain id.
   * @returns {Promise<void>}
   */
  async deleteEndpoint(id) {
    await super.deleteEndpoint(id);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.EndPoint,
    });
    this.notifyClients(StoreEventTypes.Endpoint.State.deleted, record);
  }

  /**
   * Updates a scalar property of an endpoint.
   * @param {string} id The domain id of the endpoint.
   * @param {string} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiEndPoint>}
   */
  async updateEndpointProperty(id, property, value) {
    const endpoint = await super.updateEndpointProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.EndPoint,
      item: endpoint,
      property,
    });
    this.notifyClients(StoreEventTypes.Endpoint.State.updated, record);
    return endpoint;
  }

  /**
   * Adds an empty operation to an endpoint.
   * @param {string} pathOrId The path or domain id of the endpoint that is the parent of the operation.
   * @param {OperationInit} init The operation initialize options
   * @returns {Promise<ApiOperation>}
   */
  async addOperation(pathOrId, init) {
    const operation = await super.addOperation(pathOrId, init);
    const endpoint = await this.getEndpoint(pathOrId);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: operation.id,
      domainType: ns.aml.vocabularies.apiContract.Operation,
      item: operation,
      domainParent: endpoint.id,
    });
    this.notifyClients(StoreEventTypes.Operation.State.created, record);
    return operation;
  }

  /**
   * Removes an operation from the graph.
   * @param {string} id The operation id to remove.
   * @param {string} endpointId The domain id of the parent endpoint.
   * @returns {Promise<string|undefined>} The id of the affected endpoint. Undefined when operation or endpoint cannot be found.
   */
  async deleteOperation(id, endpointId) {
    const result = await super.deleteOperation(id, endpointId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Operation,
      domainParent: endpointId,
    });
    this.notifyClients(StoreEventTypes.Operation.State.deleted, record);
    return result;
  }

  /**
   * Updates a scalar property of an operation.
   * @param {string} id The domain id of the operation.
   * @param {string} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiOperation>}
   */
  async updateOperationProperty(id, property, value) {
    const updated = await super.updateOperationProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Operation,
      item: updated,
      property,
    });
    this.notifyClients(StoreEventTypes.Operation.State.updated, record);
    return updated;
  }

  /**
   * @param {string} operationId The operation domain id
   * @param {OperationResponseInit} init The response init options.
   * @returns {Promise<ApiResponse>} The domain id of the created response
   */
  async addResponse(operationId, init) {
    const result = await super.addResponse(operationId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Response,
      item: result,
      domainParent: operationId,
    });
    this.notifyClients(StoreEventTypes.Response.State.created, record);
    return result;
  }

  /**
   * Adds a header to the response.
   * @param {string} responseId The response domain id
   * @param {ParameterInit} init The Parameter init options.
   * @returns {Promise<ApiParameter>}
   */
  async addResponseHeader(responseId, init) {
    const result = await super.addResponseHeader(responseId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      item: result,
      domainParent: responseId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.created, record);
    return result;
  }

  /**
   * Removes a header from a response
   * @param {string} responseId The response id to remove the header from
   * @param {string} headerId The header id to remove.
   * @returns {Promise<ApiResponse>} Updated response
   */
  async removeResponseHeader(responseId, headerId) {
    const result = await super.removeResponseHeader(responseId, headerId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: headerId,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      domainParent: responseId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.deleted, record);
    return result;
  }

  /**
   * Creates a new payload in the response.
   * @param {string} responseId The response domain id
   * @param {PayloadInit} init The payload init options
   * @returns {Promise<ApiPayload>} Created payload object.
   */
  async addResponsePayload(responseId, init) {
    const result = await super.addResponsePayload(responseId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Payload,
      item: result,
      domainParent: responseId,
    });
    this.notifyClients(StoreEventTypes.Payload.State.created, record);
    return result;
  }

  /**
   * Removes a payload from a response object.
   * @param {string} responseId The response domain id
   * @param {string} payloadId The payload domain id.
   * @returns {Promise<void>}
   */
  async removeResponsePayload(responseId, payloadId) {
    await super.removeResponsePayload(responseId, payloadId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: payloadId,
      domainType: ns.aml.vocabularies.apiContract.Payload,
      domainParent: responseId,
    });
    this.notifyClients(StoreEventTypes.Payload.State.deleted, record);
  }

  /**
   * Updates a scalar property of a Response.
   * @param {string} id The domain id of the response.
   * @param {keyof Response} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiResponse>} The updated response
   */
  async updateResponseProperty(id, property, value) {
    const updated = await super.updateResponseProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Response,
      item: updated,
      property,
    });
    this.notifyClients(StoreEventTypes.Response.State.updated, record);
    return updated;
  }

  /**
   * @param {string} responseId The response id to delete
   * @param {string} operationId The id of the parent operation that has the response
   * @returns {Promise<void>}
   */
  async deleteResponse(responseId, operationId) {
    await super.deleteResponse(responseId, operationId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: responseId,
      domainType: ns.aml.vocabularies.apiContract.Response,
      domainParent: operationId,
    });
    this.notifyClients(StoreEventTypes.Response.State.deleted, record);
  }

  /**
   * Updates a scalar property of an Example.
   * @param {string} id The domain id of the response.
   * @param {keyof Example} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiExample>} The updated example
   */
  async updateExampleProperty(id, property, value) {
    const updated = await super.updateExampleProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Example,
      item: updated,
      property,
    });
    this.notifyClients(StoreEventTypes.Example.State.updated, record);
    return updated;
  }

  /**
   * Adds an example to a Payload
   * @param {string} id The if of the Payload to add the example to
   * @param {ExampleInit} init The example init options
   * @returns {Promise<ApiExample>}
   */
  async addPayloadExample(id, init) {
    const result = await super.addPayloadExample(id, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Example,
      item: result,
      domainParent: id,
    });
    this.notifyClients(StoreEventTypes.Example.State.created, record);
    return result;
  }

  /**
   * Removes an example from the Payload.
   * @param {string} payloadId The domain id of the Payload
   * @param {string} exampleId The domain id of the Example to remove.
   */
  async removePayloadExample(payloadId, exampleId) {
    await super.removePayloadExample(payloadId, exampleId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: exampleId,
      domainType: ns.aml.vocabularies.apiContract.Example,
      domainParent: payloadId,
    });
    this.notifyClients(StoreEventTypes.Example.State.deleted, record);
  }

  /**
   * Updates a scalar property of a Payload.
   * @param {string} id The domain id of the payload.
   * @param {keyof Payload} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiPayload>} The updated Payload
   */
  async updatePayloadProperty(id, property, value) {
    const result = await super.updatePayloadProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Payload,
      item: result,
      property,
    });
    this.notifyClients(StoreEventTypes.Payload.State.updated, record);
    return result;
  }

  /**
   * @param {string} operationId The operation domain id
   * @param {OperationRequestInit=} init The request init options. Optional.
   * @returns {Promise<ApiRequest>} The domain id of the created request
   */
  async addRequest(operationId, init={}) {
    const result = await super.addRequest(operationId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Request,
      item: result,
      domainParent: operationId,
    });
    this.notifyClients(StoreEventTypes.Request.State.created, record);
    return result;
  }

  /**
   * Adds a header to the request.
   * @param {string} requestId The request domain id
   * @param {ParameterInit} init The Parameter init options.
   * @returns {Promise<ApiParameter>}
   */
  async addRequestHeader(requestId, init) {
    const result = await super.addRequestHeader(requestId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      item: result,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.created, record);
    return result;
  }

  /**
   * Removes a header from a request
   * @param {string} requestId The request id to remove the header from
   * @param {string} headerId The header id to remove.
   * @returns {Promise<ApiRequest>} Updated request
   */
  async removeRequestHeader(requestId, headerId) {
    const result = await super.removeRequestHeader(requestId, headerId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: headerId,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.deleted, record);
    return result;
  }

  /**
   * Adds a query parameter to the request.
   * @param {string} requestId The request domain id
   * @param {ParameterInit} init The Parameter init options.
   * @returns {Promise<ApiParameter>}
   */
  async addRequestQueryParameter(requestId, init) {
    const result = await super.addRequestQueryParameter(requestId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      item: result,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.created, record);
    return result;
  }

  /**
   * Removes a query parameter from a request
   * @param {string} requestId The request id to remove the parameter from
   * @param {string} paramId The parameter id to remove.
   * @returns {Promise<ApiRequest>} Updated request
   */
  async removeRequestQueryParameter(requestId, paramId) {
    const result = await super.removeRequestQueryParameter(requestId, paramId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: paramId,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.deleted, record);
    return result;
  }

  /**
   * Adds a cookie to the request.
   * @param {string} requestId The request domain id
   * @param {ParameterInit} init The Parameter init options.
   * @returns {Promise<ApiParameter>}
   */
  async addRequestCookieParameter(requestId, init) {
    const result = await super.addRequestCookieParameter(requestId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      item: result,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.created, record);
    return result;
  }

  /**
   * Removes a cookie parameter from a request
   * @param {string} requestId The request id to remove the parameter from
   * @param {string} paramId The parameter id to remove.
   * @returns {Promise<ApiRequest>} Updated request
   */
  async removeRequestCookieParameter(requestId, paramId) {
    const result = await super.removeRequestCookieParameter(requestId, paramId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: paramId,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.deleted, record);
    return result;
  }

  /**
   * Creates a new payload in the request.
   * @param {string} requestId The request domain id
   * @param {PayloadInit} init The payload init options
   * @returns {Promise<ApiPayload>} Created payload object.
   */
  async addRequestPayload(requestId, init) {
    const result = await super.addRequestPayload(requestId, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Payload,
      item: result,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Payload.State.created, record);
    return result;
  }

  /**
   * Removes a payload from a request object.
   * @param {string} requestId The request domain id
   * @param {string} payloadId The payload domain id.
   * @returns {Promise<void>}
   */
  async removeRequestPayload(requestId, payloadId) {
    await super.removeRequestPayload(requestId, payloadId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: payloadId,
      domainType: ns.aml.vocabularies.apiContract.Payload,
      domainParent: requestId,
    });
    this.notifyClients(StoreEventTypes.Payload.State.deleted, record);
  }

  /**
   * @param {string} requestId The request id to delete
   * @param {string} operationId The id of the parent operation that has the request
   * @returns {Promise<void>}
   */
  async deleteRequest(requestId, operationId) {
    await super.deleteRequest(requestId, operationId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: requestId,
      domainType: ns.aml.vocabularies.apiContract.Request,
      domainParent: operationId,
    });
    this.notifyClients(StoreEventTypes.Request.State.deleted, record);
  }

  /**
   * Updates a scalar property of a Request.
   * @param {string} id The domain id of the request.
   * @param {keyof Request} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiRequest>} The updated request
   */
  async updateRequestProperty(id, property, value) {
    const updated = await super.updateRequestProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Request,
      item: updated,
      property,
    });
    this.notifyClients(StoreEventTypes.Request.State.updated, record);
    return updated;
  }

  /**
   * Updates a scalar property of a Parameter.
   * @param {string} id The domain id of the parameter.
   * @param {keyof Parameter} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiParameter>} The updated Parameter
   */
  async updateParameterProperty(id, property, value) {
    const updated = await super.updateParameterProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.apiContract.Parameter,
      item: updated,
      property,
    });
    this.notifyClients(StoreEventTypes.Parameter.State.updated, record);
    return updated;
  }

  /**
   * Adds an example to a Parameter
   * @param {string} id The if of the Parameter to add the example to
   * @param {ExampleInit} init The example init options
   * @returns {Promise<ApiExample>}
   */
  async addParameterExample(id, init) {
    const result = await super.addParameterExample(id, init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: ns.aml.vocabularies.apiContract.Example,
      item: result,
      domainParent: id,
    });
    this.notifyClients(StoreEventTypes.Example.State.created, record);
    return result;
  }

  /**
   * Removes an example from the parameter.
   * @param {string} paramId The domain id of the Parameter
   * @param {string} exampleId The domain id of the Example to remove.
   */
  async removeParameterExample(paramId, exampleId) {
    await super.removeParameterExample(paramId, exampleId);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: exampleId,
      domainType: ns.aml.vocabularies.apiContract.Example,
      domainParent: paramId,
    });
    this.notifyClients(StoreEventTypes.Example.State.deleted, record);
  }

  /**
   * Adds a new documentation object to the graph.
   * @param {DocumentationInit} init The initialization properties
   * @returns {Promise<ApiDocumentation>} The created documentation.
   */
  async addDocumentation(init) {
    const doc = await super.addDocumentation(init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: doc.id,
      domainType: ns.aml.vocabularies.core.CreativeWork,
      item: doc,
    });
    this.notifyClients(StoreEventTypes.Documentation.State.created, record);
    return doc;
  }

  /**
   * Updates a scalar property of a documentation.
   * @param {string} id The domain id of the documentation.
   * @param {keyof CreativeWork} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiDocumentation>}
   */
  async updateDocumentationProperty(id, property, value) {
    const updated = await super.updateDocumentationProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.core.CreativeWork,
      item: updated,
      property,
    });
    this.notifyClients(StoreEventTypes.Documentation.State.updated, record);
    return updated;
  }

  /**
   * Removes the documentation from the graph.
   * @param {string} id The domain id of the documentation object
   */
  async deleteDocumentation(id) {
    await super.deleteDocumentation(id);
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: id,
      domainType: ns.aml.vocabularies.core.CreativeWork,
    });
    this.notifyClients(StoreEventTypes.Documentation.State.deleted, record);
  }

  /**
   * Creates a new type in the API.
   * @param {ShapeInit=} init The Shape init options.
   * @returns {Promise<ApiShapeUnion>}
   */
  async addType(init) {
    const result = await super.addType(init);
    const record = /** @type ApiStoreCreateRecord */ ({
      graphId: result.id,
      domainType: result.types[0],
      item: result,
    });
    this.notifyClients(StoreEventTypes.Type.State.created, record);
    return result;
  }

  /**
   * Removes a type for a given domain id.
   * @param {string} id The type domain id.
   */
  async deleteType(id) {
    const type = await this.getType(id);
    const result = await super.deleteType(id);
    if (!result) {
      return false;
    }
    const record = /** @type ApiStoreDeleteRecord */ ({
      graphId: id,
      domainType: type.types[0],
    });
    this.notifyClients(StoreEventTypes.Type.State.deleted, record);
    return true;
  }

  /**
   * Updates a scalar property of a type.
   * @param {string} id The domain id of the type.
   * @param {string} property The property name to update
   * @param {any} value The new value to set.
   * @returns {Promise<ApiShapeUnion>}
   */
  async updateTypeProperty(id, property, value) {
    const type = await super.updateTypeProperty(id, property, value);
    const record = /** @type ApiStoreChangeRecord */ ({
      graphId: id,
      domainType: type.types[0],
      item: type,
      property,
    });
    this.notifyClients(StoreEventTypes.Type.State.updated, record);
    return type;
  }
}
