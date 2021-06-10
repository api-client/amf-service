import service from "./service.js";
(async () => {
  const id = await service.addProcess();
  // await service.proxy(id, 'init');
  await service.proxy(id, 'createWebApi');
  await service.proxy(id, 'addEndpoint', {
    path: '/test',
    name: 'A path'
  });
  const endpoints = await service.proxy(id, 'listEndpoints');
  console.log(endpoints);
  await service.proxy(id, 'addOperation', '/test', { method: 'get', name: 'READ' });
  const endpointsOperations = await service.proxy(id, 'listEndpointsWithOperations');
  console.log(endpointsOperations);
})();
