import amf from 'amf-client-js';
import { AmfService } from '@api-client/amf-store/src/AmfService.js';

/** @typedef {import('@api-client/amf-store').WorkerMessage} WorkerMessage */
/** @typedef {import('@api-client/amf-store').WorkerResponse} WorkerResponse */

let initialized = false;

class AmfProcess {
  /**
   * Initializes the AMF and the store service.
   */
  async init() {
    if (initialized) {
      return;
    }
    initialized = true;
    amf.plugins.document.WebApi.register();
    amf.plugins.document.Vocabularies.register();
    amf.plugins.features.AMFValidation.register();
    await amf.Core.init();
    this.service = new AmfService(amf);
  }

  /**
   * @param {Promise} promise 
   * @param {number} id 
   */
  async processTaskResult(promise, id) {
    const response = /** @type WorkerResponse */({
      id,
    });
    try {
      response.result = await promise;
    } catch (e) {
      response.error = true;
      response.message = e.message; 
      // eslint-disable-next-line no-console
      console.error(e);
    }
    process.send(response);
  }

  /**
   * @param {WorkerMessage} message
   */
  messageHandler(message) {
    if (!message.type || typeof message.id !== 'number') {
      process.send({
        error: true,
        message: 'invalid message',
        data: message,
      });
      return;
    }
    const args = message.arguments;
    if (message.type === 'init') {
      this.processTaskResult(this.init(), message.id);
      return;
    }
    if (typeof this.service[message.type] !== 'function') {
      process.send({
        error: true,
        message: `The ${message.type} is not callable in the store instance`,
      });
      return;
    }
    const promise = this.service[message.type].call(this.service, ...args);
    this.processTaskResult(promise, message.id);
  }
}
const worker = new AmfProcess();
process.on('message', worker.messageHandler.bind(worker));
process.send({
  result: 'ready',
});
