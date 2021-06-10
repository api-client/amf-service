# AMF service

> This is a work in progress.

A node service that act as a backed for an AMF graph stores.
The service support multiple graph instances at once. After initializing a graph session a unique identifier is issued to the client. This identifier is then used to connect to a specific graph instance.
This is done so multiple clients can operate on the same graph instance.

The server support SSE (server-sent events). An event is dispatched to connected clients when the store object is modified. To register a client use the `v1/store/events/{pid}` endpoint, where the `pid` is the id received from the session initialization.

## Examples

### Session initialization

```http
GET http://localhost:8080/v1/store/start-session
```

Response

```json
{
  "kind":"AMF#SessionStatus",
  "status":"created",
  "id":"[PID]",
  "timeout":1800000
}
```

### Initialize an empty API

```http
POST http://localhost:8080/v1/store/
content-type: application/json

{
  "id": "[PID]",
  "type": "createWebApi"
}
```

Response

```json
{
  "kind":"AMF#ProxyResponse",
  "id":"[PID]",
  "timeout":1800000,
  "result":"null#/web-api"
}
```

### Adding an endpoint

```http
POST http://localhost:8080/v1/store/
content-type: application/json

{
  "id": "[PID]",
  "type": "addEndpoint",
  "args": ["/test", { "name": "A new endpoint" }]
}
```

Response

```json
{
  "kind": "AMF#ProxyResponse",
  "id": "[PID]",
  "timeout": 1800000,
  "result": {
    "id": "null#/web-api/end-points/%2Ftest",
    "types": ["http://a.ml/vocabularies/apiContract#EndPoint","http://a.ml/vocabularies/document#DomainElement"],
    "path": "/test",
    "relativePath": "/test",
    "operations":[],
    "parameters":[], 
    "payloads":[],
    "servers":[],
    "security":[],
    "name":"A new endpoint"
  }
}
```

### Adding an operation

```http
POST http://localhost:8080/v1/store/
content-type: application/json

{
  "id": "[PID]",
  "type": "addOperation",
  "args": ["/test", { "method": "get", "name": "Read resource" }]
}
```

Response

```json
{
  "kind": "AMF#ProxyResponse",
  "id": "[PID]",
  "timeout": 1800000,
  "result": {
    "id": "null#/web-api/end-points/%2Ftest/get",
    "types": [
      "http://a.ml/vocabularies/apiContract#Operation",
      "http://a.ml/vocabularies/document#DomainElement"
    ],
    "method": "get",
    "deprecated": false,
    "callbacks": [],
    "responses": [],
    "servers": [],
    "security": [],
    "customDomainProperties": [],
    "accepts": [],
    "schemes": [],
    "contentType": [],
    "name": "Read resource"
  }
}
```

### Listing endpoints with operations

```http
POST http://localhost:8080/v1/store/
content-type: application/json

{
  "id": "[PID]",
  "type": "listEndpointsWithOperations"
}
```

Response

```json
{
  "kind": "AMF#ProxyResponse",
  "id": "[PID]",
  "timeout": 1800000,
  "result": [
    {
      "id": "null#/web-api/end-points/%2Ftest",
      "path": "/test",
      "operations": [
        {
          "id": "null#/web-api/end-points/%2Ftest/get",
          "method": "get",
          "name": "Read resource"
        }
      ],
      "name": "A new endpoint"
    }
  ]
}
```

### Closing the session

Note, you need to disconnect your SSE client before closing the session or otherwise the session persist until the timeout. When where are clients connected to the session (a store process) the session does not timeout.

```http
DELETE http://localhost:8080/v1/store/[PID]
```

Response

```json
{
  "kind": "AMF#SessionStatus",
  "status": "closed",
  "id": "[PID]"
}
```

### Event message

Each store mutation dispatches an event which is the same as the DOM events defined in the `@api-client/amf-store` package. The body of the event is also identical to a DOM event dispatched by the same module. This makes it easier to create a proxy on the client side using the same interfaces:

```javascript
import { StoreEventTypes } from "@api-client/amf-store";

const source = new EventSource("//localhost:8080/v1/store/events/[PID]", { withCredentials: true } );

source.addEventListener(StoreEventTypes.Endpoint.State.created, function(event) {
  const changeRecord = JSON.parse(event.data);
  document.body.dispatchEvent(event.type, changeRecord);
});
```

## Development

```sh
git clone https://github.com/@api-client/amf-service
cd amf-service
npm install
```

### Running the www server locally

```sh
node www.js
```

### Running the tests

```sh
npm test
```

## License

<!-- API Components © 2021 by Pawel Psztyc is licensed under CC BY 4.0. -->

<p xmlns:cc="http://creativecommons.org/ns#" xmlns:dct="http://purl.org/dc/terms/"><span property="dct:title">API Components</span> by <a rel="cc:attributionURL dct:creator" property="cc:attributionName" href="https://github.com/jarrodek">Pawel Psztyc</a> is licensed under <a href="http://creativecommons.org/licenses/by/4.0/?ref=chooser-v1" target="_blank" rel="license noopener noreferrer" style="display:inline-block;">CC BY 4.0<img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/cc.svg?ref=chooser-v1"><img style="height:22px!important;margin-left:3px;vertical-align:text-bottom;" src="https://mirrors.creativecommons.org/presskit/icons/by.svg?ref=chooser-v1"></a></p>
