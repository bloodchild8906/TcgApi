const MarketController = require('./market.controller');
const AuthTool = require('../authorization/auth.tool');
const config = require('../config');
const HttpTool = require('../tools/http.tool');

// noinspection JSUnusedLocalSymbols
const ADMIN = config.permissions.ADMIN; //Highest permision, can read and write all users
// noinspection JSUnusedLocalSymbols
const SERVER = config.permissions.SERVER; //Middle permission, can read all users and grant rewards
// noinspection JSUnusedLocalSymbols
const USER = config.permissions.USER; //Lowest permision, can only do things on same user

exports.route = function (app) {

  app.post("/market/cards/add", app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.addOffer,
  ]));
  app.post("/market/cards/remove", app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.removeOffer,
  ]));
  app.post("/market/cards/trade", app.post_limiter, ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.trade,
  ]));

  app.get("/market/cards/", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.getAll,
  ]));

  app.get("/market/cards/user/:username", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.getBySeller,
  ]));

  app.get("/market/cards/card/:tid", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.getByCard,
  ]));

  app.get("/market/cards/offer/:username/:tid", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isPermissionLevel(USER),
    MarketController.getOffer,
  ]));

};
