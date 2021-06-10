import { AmfProxyService } from "./processes/AmfProxyService";

export interface AmfServiceInfo {
  /** the proxy service. */
  proxy: AmfProxyService;
  /**
   * The service timeout timer.
   */
  timeout: NodeJS.Timeout;
  /**
   * Whether the process is timed out.
   */
  timedOut: boolean;
}

export interface ProxyMessage {
  /**
   * The id of the created process.
   */
  id: string;
  /**
   * The function to call in the proxy.
   */
  type: string;
  /**
   * The function arguments.
   */
  args?: any[];
}
