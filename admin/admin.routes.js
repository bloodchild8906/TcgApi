const AdminController = require('./admin.controller');
const AuthTool = require('../authorization/auth.tool');
const HttpTool = require('../tools/http.tool');

exports.route = function (app) {
  app.get('/admin/api/summary', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.dashboard.read'),
    AdminController.GetSummary,
  ]));

  app.post('/admin/api/reset-database', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.system.reset'),
    AdminController.ResetDatabase,
  ]));

  app.get('/admin/api/players', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.ListPlayers,
  ]));

  app.get('/admin/api/staff', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.roles.read'),
    AdminController.ListStaff,
  ]));

  app.post('/admin/api/players/:userId', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.UpdatePlayer,
  ]));

  app.post('/admin/api/players/:userId/ban', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.BanPlayer,
  ]));

  app.post('/admin/api/players/:userId/unban', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.UnbanPlayer,
  ]));

  app.post('/admin/api/players/:userId/kick', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.KickPlayer,
  ]));

  app.get('/admin/api/players/:userId/history', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.audit.read'),
    AdminController.GetPlayerHistory,
  ]));

  app.get('/admin/api/players/:userId/friends', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.GetPlayerFriends,
  ]));

  app.get('/admin/api/players/:userId/decks/:deckTid', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.GetPlayerDeck,
  ]));

  app.post('/admin/api/players/:userId/reward', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.users.manage'),
    AdminController.GiveReward,
  ]));

  app.get('/admin/api/games', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.games.manage'),
    AdminController.ListGames,
  ]));

  app.get('/admin/api/games/:matchId/events', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.games.manage'),
    AdminController.GetGameEvents,
  ]));

  app.delete('/admin/api/games/:matchId', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.games.manage'),
    AdminController.DeleteGame,
  ]));

  // Card Suite Editor Routes
  app.get('/admin/api/suite/keywords', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.ListKeywords,
  ]));
  app.post('/admin/api/suite/keywords', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.SaveKeyword,
  ]));

  app.get('/admin/api/suite/sets', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.ListSets,
  ]));
  app.post('/admin/api/suite/sets', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.SaveSet,
  ]));

  app.get('/admin/api/suite/packs', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.ListPacks,
  ]));
  app.post('/admin/api/suite/packs', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.SavePack,
  ]));

  app.get('/admin/api/suite/types', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.ListCardTypes,
  ]));
  app.post('/admin/api/suite/types', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.SaveCardType,
  ]));

  // Game Flow Designer Routes
  app.get('/admin/api/flows', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.game_flows.manage'),
    AdminController.ListGameFlows,
  ]));
  app.get('/admin/api/flows/:tid', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.game_flows.manage'),
    AdminController.GetGameFlow,
  ]));
  app.post('/admin/api/flows', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.game_flows.manage'),
    AdminController.SaveGameFlow,
  ]));
  app.delete('/admin/api/flows/:tid', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.game_flows.manage'),
    AdminController.DeleteGameFlow,
  ]));

  app.get('/admin/api/cards', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.ListCards,
  ]));

  app.get('/admin/api/cards/:tid', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.GetCard,
  ]));

  app.post('/admin/api/cards', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.SaveCard,
  ]));

  app.delete('/admin/api/cards/:tid', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    AdminController.DeleteCard,
  ]));

  app.get('/admin/api/offers', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.market.manage'),
    AdminController.ListOffers,
  ]));

  app.delete('/admin/api/offers/:offerId', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.market.manage'),
    AdminController.DeleteOffer,
  ]));
};
