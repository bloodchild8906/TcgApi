
const AuthController = require('./auth.controller');
const AuthTool = require('./auth.tool');
const HttpTool = require('../tools/http.tool');

exports.route = function (app) {
	
    //Body: username, password
    app.post('/auth', app.auth_limiter, ...HttpTool.wrap([
        AuthTool.isLoginValid,
        AuthController.Login
    ]));

    //Body: refresh_token
    app.post('/auth/refresh', app.auth_limiter, ...HttpTool.wrap([
        AuthTool.isRefreshValid,
        AuthController.Login
    ]));

    app.get('/auth/keep', ...HttpTool.wrap([ 
        AuthTool.isValidJWT,
        AuthController.KeepOnline
    ]));

    app.get('/auth/validate', ...HttpTool.wrap([ 
        AuthTool.isValidJWT,
        AuthController.ValidateToken
    ]));

    app.get("/auth/proof/create", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthController.CreateProof
    ]));

    app.get("/auth/proof/:username/:proof", ...HttpTool.wrap([
        AuthTool.isValidJWT,
        AuthController.ValidateProof
    ]));

    app.get('/version', ...HttpTool.wrap([
        AuthController.GetVersion
    ]));

    
};
