const DeckController = require('./decks.controller');
const AuthTool = require('../authorization/auth.tool');
const config = require('../config');
const HttpTool = require('../tools/http.tool');

const ADMIN = config.permissions.ADMIN; //Highest permision, can read and write all users
const SERVER = config.permissions.SERVER; //Higher permission, can read all users
const USER = config.permissions.USER; //Lowest permision, can only do things on same user

exports.route = function (app) {

    app.get('/decks/:tid', ...HttpTool.wrap([
        DeckController.GetDeck
    ]));

    app.get('/decks', ...HttpTool.wrap([
        DeckController.GetAll
    ]));

    app.post('/decks/add', ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        DeckController.AddDeck
    ]));

    app.delete("/decks/:tid", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        DeckController.DeleteDeck
    ]));

    app.delete("/decks", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        DeckController.DeleteAll
    ]));
};
