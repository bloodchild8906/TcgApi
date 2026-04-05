const TradesService = require('./trades.service');

const actorFromRequest = (req) => ({
  userId: req.jwt.userId,
  username: req.jwt.username,
  permission_level: req.jwt.permission_level,
});

exports.ListTrades = async (req, res) => {
  const trades = await TradesService.listTrades(actorFromRequest(req), req.access, req.query);
  return res.status(200).send(trades);
};

exports.GetTrade = async (req, res) => {
  const trade = await TradesService.getTrade(req.params.tradeId, actorFromRequest(req), req.access);
  if (!trade) {
    return res.status(404).send({ error: 'Trade not found' });
  }
  return res.status(200).send(trade);
};

exports.CreateTrade = async (req, res) => {
  const trade = await TradesService.createTrade(actorFromRequest(req), req.body || {});
  return res.status(201).send(trade);
};

exports.AcceptTrade = async (req, res) => {
  const trade = await TradesService.acceptTrade(req.params.tradeId, actorFromRequest(req), req.access);
  if (!trade) {
    return res.status(404).send({ error: 'Trade not found' });
  }
  return res.status(200).send(trade);
};

exports.DeclineTrade = async (req, res) => {
  const trade = await TradesService.declineTrade(req.params.tradeId, actorFromRequest(req), req.access);
  if (!trade) {
    return res.status(404).send({ error: 'Trade not found' });
  }
  return res.status(200).send(trade);
};

exports.CancelTrade = async (req, res) => {
  const trade = await TradesService.cancelTrade(req.params.tradeId, actorFromRequest(req), req.access);
  if (!trade) {
    return res.status(404).send({ error: 'Trade not found' });
  }
  return res.status(200).send(trade);
};
