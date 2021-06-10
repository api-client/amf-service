/** @typedef {import('express').Response} Response */

import { randomString } from './Utils.js';

export class EventClient {
  /**
   * @param {string} pid The worker process id.
   * @param {Response} res The server response.
   */
  constructor(pid, res) {
    this.id = randomString();
    this.pid = pid;
    this.res = res;
  }

  /**
   * Notifies the client about an event.
   * @param {string} type
   * @param {any} data
   */
  notify(type, data) {
    const eventPart = `event: ${type}\n`;
    const dataPart = `data: ${JSON.stringify(data)}\n\n`;
    this.res.write(`${eventPart}${dataPart}`);
  }

  /**
   * Closes the connection.
   */
  close() {
    this.res.destroy();
  }
}
