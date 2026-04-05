const RewardController = require('./rewards.controller');
const AuthTool = require('../authorization/auth.tool');
const config = require('../config');
const HttpTool = require('../tools/http.tool');

const ADMIN = config.permissions.ADMIN; //Highest permision, can read and write all users
const SERVER = config.permissions.SERVER; //Higher permission, can read all users
const USER = config.permissions.USER; //Lowest permision, can only do things on same user

exports.route = function (app) {

    app.get('/rewards/:tid', ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isPermissionLevel(USER),
        RewardController.GetReward
    ]));

    app.get('/rewards', ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isPermissionLevel(SERVER),
        RewardController.GetAll
    ]));
    
    app.post('/rewards/add', ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        RewardController.AddReward
    ]));
    
    app.delete("/rewards/:tid", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        RewardController.DeleteReward
    ]));

    app.delete("/rewards", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthTool.isAdminPermission('admin.content.manage'),
        RewardController.DeleteAll
    ]));
};
