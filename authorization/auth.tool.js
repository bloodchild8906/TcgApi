const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const config = require('../config.js');
const HttpTool = require('../tools/http.tool');
const UserModel = require('../users/users.model');
const RbacService = require('../rbac/rbac.service');

//-----Validations------

var AuthTool = {};


AuthTool.isValidJWT = (req, res, next) => {

    const authorization = HttpTool.getAuthorizationToken(req);
    if (!authorization)
        return res.status(401).send();

    try {
        //Validate access token
        req.jwt = jwt.verify(authorization, config.jwt_secret);

        //Validate expiry time
        const nowSeconds = Math.round(Number(new Date()) / 1000);
        const expiration = req.jwt.iat + config.jwt_expiration;
        if(nowSeconds > expiration)
            return res.status(403).send({error: "Expired"});

    } catch (err) {
        return res.status(403).send({error: "Invalid Token"});
    }

    return next();
};

AuthTool.isLoginValid = async(req, res, next) => {

    if (!req.body || !req.body.password) 
        return res.status(400).send({error: 'Invalid params'});

    //Requires EITHER username or email, dont need both
    if (!req.body.email && !req.body.username) 
        return res.status(400).send({error: 'Invalid params'});

    var user = null;
    
    if(req.body.email)
        user = await UserModel.getByEmail(req.body.email);
    else if(req.body.username)
        user = await UserModel.getByUsername(req.body.username);
    if(!user)
        return res.status(404).send({error: "Invalid username or password"});

    let validPass = AuthTool.validatePassword(user, req.body.password);
    if(!validPass)
        return res.status(400).send({error: 'Invalid username or password'});

    if(user.permission_level <= 0)
        return res.status(403).send({error: "Your account has been disabled, please contact support!"});

    req.login = {
        userId: user.id,
        username: user.username,
        email: user.email,
        permission_level: user.permission_level,
        validation_level: user.validation_level,
        provider: req.body.email ? 'email' : 'username',
    };

    return next();
};

AuthTool.isRefreshValid = async(req, res, next) => {

    if (!req.body || !req.body.refresh_token)
        return res.status(400).send();

    const authorization = HttpTool.getAuthorizationToken(req);
    if (!authorization)
        return res.status(401).send();
	
	if (typeof req.body.refresh_token !== "string")
        return res.status(400).send();

    try {
        //Validate access token
        req.jwt = jwt.verify(authorization, config.jwt_secret);

        //Validate expiry time
        const nowUnixSeconds = Math.round(Number(new Date()) / 1000);
        const expiration = req.jwt.iat + config.jwt_refresh_expiration;
        if(nowUnixSeconds > expiration)
            return res.status(403).send({error: "Token Expired"});

        //Validate refresh token
        let refresh_token = req.body.refresh_token;
        let hash = crypto.createHmac('sha512', req.jwt.refresh_key).update(req.jwt.userId + config.jwt_secret).digest("base64");
        if (hash !== refresh_token)
            return res.status(403).send({error: 'Invalid refresh token'});
		
		//Validate refresh key in DB
        var user = await UserModel.getById(req.jwt.userId);
        if(!user)
            return res.status(404).send({error: "Invalid user"});
		
		if(user.refresh_key !== req.jwt.refresh_key)
            return res.status(403).send({error: 'Invalid refresh key'});

    } catch (err) {
        return res.status(403).send({error: "Invalid Token"});
    }

    req.login = req.jwt;
    delete req.login.iat; //Delete previous iat to generate a new one
    return next();
};

AuthTool.hashPassword = (password) => {
    let saltNew = crypto.randomBytes(16).toString('base64');
    let hashNew = crypto.createHmac('sha512', saltNew).update(password).digest("base64");
    let newPass = saltNew + "$" + hashNew;
    return newPass;
}

AuthTool.validatePassword = (user, password) =>
{
    let passwordFields = user.password.split('$');
    let salt = passwordFields[0];
    let hash = crypto.createHmac('sha512', salt).update(password).digest("base64");
    return hash === passwordFields[1];
}

//--- Permisions -----

AuthTool.isPermissionLevel = (required_permission) => {
    return (req, res, next) => {
        let user_permission_level = parseInt(req.jwt.permission_level);
        if (user_permission_level >= required_permission) {
            return next();
        } else {
            return res.status(403).send({error: "Permission Denied"});
        }
    };
};

const getJwtPermissionLevel = (req) => parseInt(req.jwt.permission_level, 10) || 0;

const ensureAccessContext = async (req) => {
    if (req.access) {
        return req.access;
    }

    req.access = await RbacService.getUserAccess({
        userId: req.jwt.userId,
        username: req.jwt.username,
        permission_level: req.jwt.permission_level,
    });

    return req.access;
};

AuthTool.isSameUserOr = (required_permission) => {
    return (req, res, next) => {
        let user_permission_level = getJwtPermissionLevel(req);
        let userId = req.params.userId || "";
        let same_user = (req.jwt.userId === userId || req.jwt.username.toLowerCase() === userId.toLowerCase());
        if (userId && same_user) {
            return next();
        } else {
            if (user_permission_level >= required_permission) {
                return next();
            } else {
                return res.status(403).send({error: "Permission Denied"});
            }
        }
    };
};

AuthTool.attachAccessContext = async (req, res, next) => {
    await ensureAccessContext(req);
    return next();
};

AuthTool.isAdminPermission = (requiredPermission) => {
    return async (req, res, next) => {
        let user_permission_level = getJwtPermissionLevel(req);
        if (user_permission_level < config.permissions.ADMIN) {
            return res.status(403).send({error: "Permission Denied"});
        }

        await ensureAccessContext(req);

        if (RbacService.hasPermission(req.access, requiredPermission)) {
            return next();
        }

        return res.status(403).send({error: "Permission Denied"});
    };
};

AuthTool.isPermissionLevelOrAdminPermission = (required_permission, requiredPermission) => {
    return async (req, res, next) => {
        const user_permission_level = getJwtPermissionLevel(req);

        if (user_permission_level >= required_permission && user_permission_level < config.permissions.ADMIN) {
            return next();
        }

        if (user_permission_level >= config.permissions.ADMIN) {
            const access = await ensureAccessContext(req);
            if (RbacService.hasPermission(access, requiredPermission)) {
                return next();
            }
        }

        return res.status(403).send({error: "Permission Denied"});
    };
};

AuthTool.isSameUserOrPermissionLevelOrAdminPermission = (required_permission, requiredPermission) => {
    return async (req, res, next) => {
        const userId = req.params.userId || "";
        const same_user = userId && (req.jwt.userId === userId || req.jwt.username.toLowerCase() === userId.toLowerCase());
        if (same_user) {
            return next();
        }

        return AuthTool.isPermissionLevelOrAdminPermission(required_permission, requiredPermission)(req, res, next);
    };
};

module.exports = AuthTool;
