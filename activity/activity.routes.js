const ActivityController = require("./activity.controller");
const AuthTool = require("../authorization/auth.tool");
const HttpTool = require("../tools/http.tool");

exports.route = function (app) {

app.get("/activity", ...HttpTool.wrap([
  AuthTool.isValidJWT,
  AuthTool.isAdminPermission('admin.audit.read'),  
  ActivityController.GetAllActivities,
]));

}


