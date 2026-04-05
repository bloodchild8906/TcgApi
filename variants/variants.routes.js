const config = require("../config");
const VariantsController = require("./variants.controller");
const AuthTool = require("../authorization/auth.tool");
const HttpTool = require("../tools/http.tool");

const ADMIN = config.permissions.ADMIN; //Highest permision, can read and write all users
const SERVER = config.permissions.SERVER; //Higher permission, can read all users
const USER = config.permissions.USER; //Lowest permision, can only do things on same user

exports.route = (app) => {

  app.get("/variants", ...HttpTool.wrap([
    VariantsController.GetAll
  ]));

  app.get("/variants/:tid", ...HttpTool.wrap([
    VariantsController.GetVariant
  ]));

  app.post("/variants/add", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    VariantsController.AddVariant
  ]));

  app.delete("/variants/:tid", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    VariantsController.DeleteVariant
  ]));

  app.delete("/variants", ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.content.manage'),
    VariantsController.DeleteAll
  ]));
};
