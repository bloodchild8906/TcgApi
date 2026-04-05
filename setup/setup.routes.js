const HttpTool = require('../tools/http.tool');
const SetupController = require('./setup.controller');

exports.route = (app, runtime) => {
  app.get('/setup/api/status', ...HttpTool.wrap(SetupController.getStatus(runtime)));
  app.post('/setup/api/validate', ...HttpTool.wrap(SetupController.validateConnections(runtime)));
  app.post('/setup/api/apply', ...HttpTool.wrap(SetupController.applySetup(runtime)));
};
