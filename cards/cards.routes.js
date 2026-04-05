const CardController = require('./cards.controller');
const AuthTool = require('../authorization/auth.tool');
const config = require('../config');
const HttpTool = require('../tools/http.tool');

const ADMIN = config.permissions.ADMIN; //Highest permision, can read and write all users
const SERVER = config.permissions.SERVER; //Higher permission, can read all users
const USER = config.permissions.USER; //Lowest permision, can only do things on same user

exports.route = function (app) {

    app.get('/cards/:tid', ...HttpTool.wrap([
        CardController.GetCard
    ]));

    app.get('/cards', ...HttpTool.wrap([
        CardController.GetAll
    ]));

    app.post('/cards/add', ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        CardController.AddCard
    ]));

    app.post('/cards/add/list', ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        CardController.AddCardList
    ]));

    app.delete("/cards/:tid", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        CardController.DeleteCard
    ]));

    app.delete("/cards", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        CardController.DeleteAll
    ]));
};
