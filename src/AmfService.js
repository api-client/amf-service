import { AmfProxyService } from './processes/AmfProxyService.js';
import { randomString } from './Utils.js';
import { logger } from '../lib/logging.js';

/** @typedef {import('./types').AmfServiceInfo} AmfServiceInfo */
/** @typedef {import('./EventClient').EventClient} EventClient */

const timeoutHandler = Symbol('timeoutHandler');

/**
 * AMF service class that creates a multiple threads with the API instance,
 * each identified by its id. 
 * When a process is creates it runs the timer that automatically kills the process
 * after `defaultTimeout` milliseconds. This timer is reset each time the `proxy` method is called.
 */
export class AmfService {
  /**   
   * @returns {number} The default timeout after which the process is killed.
   */
  get defaultTimeout() {
    return  30 * 60 * 1000;
  }

  constructor() {
    /** 
     * @type {Map<string, AmfServiceInfo>}
     */
    this.processes = new Map();

    this[timeoutHandler] = this[timeoutHandler].bind(this);
  }

  /**
   * @param {string} id The process id to test
   * @returns {boolean} True id the child process exists and is connected
   */
  hasProcess(id) {
    if (!this.processes.has(id)) {
      return false;
    }
    const info = this.processes.get(id);
    const { timedOut, proxy } = info;
    if (timedOut) {
      return false;
    }
    const { worker } = proxy;
    return !worker.killed && worker.connected;
  }

  /**
   * Checks whether a process has connected SSE clients.
   * @param {string} id The process id
   * @returns {boolean} True when the process has SSE client.
   */
  hasClients(id) {
    if (!this.processes.has(id)) {
      return false;
    }
    const info = this.processes.get(id);
    const { proxy } = info;
    return !!proxy.clients.length;
  }

  /**
   * Sets a timeout after which the child process is destroyed.
   * @param {string} id The process id.
   * @returns {NodeJS.Timeout} 
   */
  setTimeout(id) {
    return setTimeout(this[timeoutHandler].bind(this, id), this.defaultTimeout);
  }

  /**
   * A function called when a process time out.
   * @param {string} id The process id.
   */
  [timeoutHandler](id) {
    if (!this.processes.has(id)) {
      return;
    }
    const info = this.processes.get(id);
    info.timedOut = true;
    this.kill(id);
    logger.debug(`The process ${id} timed out`);
  }

  /**
   * Called to re-set the timeout of a process.
   * @param {string} id The process id.
   */
  resetTimeout(id) {
    if (!this.processes.has(id)) {
      throw new Error(`Process ${id} does not exist or already timed out.`);
    }
    const info = this.processes.get(id);
    if (info.timedOut) {
      throw new Error('The process is closing due to inactivity.');
    }
    clearTimeout(info.timeout);
    info.timeout = this.setTimeout(id);
  }

  /**
   * Proxies a function call to the child process.
   * @param {string} id The id returned by the `addProcess()` function.
   * @param {string} type The call type (the function name)
   * @param {any[]=} args Function call arguments.
   * @returns {Promise<any>} 
   */
  async proxy(id, type, ...args) {
    this.resetTimeout(id);
    const info = this.processes.get(id);
    const { proxy } = info;
    if (typeof proxy[type] !== 'function') {
      throw new Error(`The ${type} operation is not supported.`);
    }
    logger.debug(`Calling service proxy method: ${type}`);
    return proxy[type](...args);
  }

  /**
   * Kills a process for a given id.
   * @param {string} id
   */
  kill(id) {
    if (!this.processes.has(id)) {
      return;
    }
    const info = this.processes.get(id);
    const { worker } = info.proxy;
    if (worker.killed) {
      return;
    }
    logger.debug(`Killing a service process: ${id}`);
    worker.kill();
  }

  /**
   * Cleans up after process is removed.
   * @param {string} id The process id.
   */
  removeProcess(id) {
    if (!this.processes.has(id)) {
      return;
    }
    logger.debug(`Removing a service process: ${id}`);
    const info = this.processes.get(id);
    if (info.timeout) {
      clearTimeout(info.timeout);
    }
    this.processes.delete(id);
  }

  /**
   * Creates a new AMF process, adds it to the processes list, and returns the id.
   * @returns {Promise<string>} The internal id of the process. This is not the `pid`.
   */
  async addProcess() {
    const id = randomString();
    const proxy = new AmfProxyService(() => {
      this.removeProcess(id);
    });
    const timeout = this.setTimeout(id);
    this.processes.set(id, {
      proxy,
      timeout,
      timedOut: false,
    });
    logger.debug(`Added a service process: ${id}`);
    await proxy.init();
    return id;
  }

  /**
   * @param {EventClient} client
   */
  registerEventClient(client) {
    if (!this.hasProcess(client.pid)) {
      throw new Error('The client process is timed out, destroyed, or never created.');
    }
    logger.debug(`Registering SSE client: ${client.id} ${client.pid}`);
    const info = this.processes.get(client.pid);
    const { proxy } = info;
    proxy.clients.push(client);
  }

  /**
   * Removes a reference to a client.
   * @param {string} cid Client id.
   * @param {string} pid Process id.
   */
  unregisterEventClient(cid, pid) {
    if (!this.processes.has(pid)) {
      throw new Error('The process does not exist.');
    }
    logger.debug(`Un-registering SSE client: ${cid} ${pid}`);
    const info = this.processes.get(pid);
    const { proxy } = info;
    const index = proxy.clients.findIndex((item) => item.id === cid);
    if (index !== -1) {
      proxy.clients.splice(index, 1);
    }
  }
}
