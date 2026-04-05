const AuthTool = require('../authorization/auth.tool');
const HttpTool = require('../tools/http.tool');
const TradesController = require('./trades.controller');

exports.route = function (app) {
  app.get('/trades', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.attachAccessContext,
    TradesController.ListTrades,
  ]));

  app.get('/trades/:tradeId', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.attachAccessContext,
    TradesController.GetTrade,
  ]));

  app.post('/trades', app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.attachAccessContext,
    TradesController.CreateTrade,
  ]));

  app.post('/trades/:tradeId/accept', app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.attachAccessContext,
    TradesController.AcceptTrade,
  ]));

  app.post('/trades/:tradeId/decline', app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.attachAccessContext,
    TradesController.DeclineTrade,
  ]));

  app.post('/trades/:tradeId/cancel', app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.attachAccessContext,
    TradesController.CancelTrade,
  ]));
};
