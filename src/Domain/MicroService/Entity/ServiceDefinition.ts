/** A monitored microservice, as discovered from its container. */
export interface ServiceDefinition {
  name: string;
  displayName: string;
  targetUrl: string;
  containerNamePattern?: string;
  containerIps?: string[];
  defaultPort: number;
  healthPath?: string;
}
