import express from 'express';
import service from '../service.js';
import { logger } from '../lib/logging.js';
import { EventClient } from '../src/EventClient.js';
import { BaseApi } from './BaseApi.js';

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */
/** @typedef {import('../src/types').ProxyMessage} ProxyMessage */

const router = express.Router();
export default router;

router.use(express.json());

/**
 * An API to support /me route
 */
class StoreApiRoute extends BaseApi {
  /**
   * Initializes a new session in the store.
   * @param {Request} req
   * @param {Response} res
   * @return {Promise<void>}
   */
  async startAmfSession(req, res) {
    try {
      const id = await service.addProcess();
      res.send({
        kind: 'AMF#SessionStatus',
        status: 'created',
        id,
        timeout: service.defaultTimeout,
      });
    } catch (e) {
      logger.error(e);
      this.sendError(res, 'Unable to create a store session', 500);
    }
  }

  /**
   * Proxies the request to the service
   * @param {Request} req
   * @param {Response} res
   * @return {Promise<void>}
   */
  async proxy(req, res) {
    try {
      const message = this.validateProxyMessage(req.body);
      const { id, type, args=[] } = message;
      const result = await service.proxy(id, type, ...args);
      res.send({
        kind: 'AMF#ProxyResponse',
        id,
        timeout: service.defaultTimeout,
        result,
      });
    } catch (e) {
      logger.error(e);
      this.sendError(res, e.message, 400);
    }
  }

  /**
   * Validates the incoming proxy message and throws an error when the types are invalid.
   * @param {any} message
   * @return {ProxyMessage} 
   */
  validateProxyMessage(message) {
    if (typeof message !== 'object') {
      throw new Error('The proxy message is missing.');
    }
    const { id, type } = message;
    const messages = [];
    if (typeof id !== 'string') {
      messages.push('Invalid process identifier. The "id" parameter must be a string.');
    }
    if (typeof type !== 'string') {
      messages.push('Invalid type declaration. The "type" parameter must be a string.');
    }
    if (messages.length) {
      throw new Error(messages.join('. '));
    }
    return /** @type ProxyMessage */ (message);
  }

  /**
   * Closes the AMF session.
   * @param {Request} req
   * @param {Response} res
   * @return {Promise<void>}
   */
  async endAmfSession(req, res) {
    const { id } = req.params;
    if (!service.hasProcess(id)) {
      this.sendError(res, `The process ${id} does not exist or is inactive`, 400);
      return;
    }
    if (service.hasClients(id)) {
      res.send({
        kind: 'AMF#SessionStatus',
        status: 'active',
        id,
      });
      return;
    }
    service.kill(id);
    res.send({
      kind: 'AMF#SessionStatus',
      status: 'closed',
      id,
    });
  }

  /**
   * Registers a SSE client.
   * @param {Request} req
   * @param {Response} res
   */
  events(req, res) {
    const { id } = req.params;
    if (!service.hasProcess(id)) {
      this.sendError(res, 'The AMF process does not exist', 400);
      return;
    }
    const client = new EventClient(id, res);
    try {
      service.registerEventClient(client);
    } catch (e) {
      this.sendError(res, `Unable to register the client. ${e.message}`, 400);
      return;
    }
    const headers = {
      'Content-Type': 'text/event-stream',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache'
    };
    res.writeHead(200, headers);
    const ack = {
      kind: 'AMF#Event',
      type: 'init'
    };
    const data = `data: ${JSON.stringify(ack)}\n\n`;
    res.write(data);
    
    req.once('close', () => {
      service.unregisterEventClient(client.id, client.pid);
    });
  }
}

const api = new StoreApiRoute();
api.setCors(router);
api.wrapApi(router, [
  ['/start-session', 'startAmfSession'],
  ['/:id', 'endAmfSession', 'delete'],
  ['/', 'proxy', 'post'],
  ['/events/:id', 'events']
]);
