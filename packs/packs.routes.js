const config = require("../config");
const PacksController = require("./packs.controller");
const AuthTool = require("../authorization/auth.tool");
const HttpTool = require("../tools/http.tool");

const ADMIN = config.permissions.ADMIN; //Highest permision, can read and write all users
const SERVER = config.permissions.SERVER; //Higher permission, can read all users
const USER = config.permissions.USER; //Lowest permision, can only do things on same user

exports.route = (app) => {

  app.get("/packs", ...HttpTool.wrap([
    PacksController.GetAll
  ]));

  app.get("/packs/:tid", ...HttpTool.wrap([
    PacksController.GetPack
  ]));

  app.post("/packs/add", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    PacksController.AddPack
  ]));

  app.delete("/packs/:tid", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    PacksController.DeletePack
  ]));

  app.delete("/packs", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    PacksController.DeleteAll
  ]));
};
