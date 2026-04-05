const RateLimit = require('express-rate-limit');
//const Slowdown = require('express-slow-down');
const config = require('../config.js');

const normalizeIp = (value) => String(value || '').trim().replace(/^::ffff:/, '');

const listContainsIp = (list, ip) => {
    const normalizedIp = normalizeIp(ip);
    return list.some((entry) => normalizeIp(entry) === normalizedIp);
};

exports.limit = function(app)
{
    if(config.limiter_proxy)
        app.enable('trust proxy');

    //Restrict to access from domain only
    app.use(function(req, res, next)
    {
        const requestIp = normalizeIp(req.ip || req.socket.remoteAddress);
        req.clientIp = requestIp;

        if(listContainsIp(config.ip_blacklist, requestIp))
            return res.status(401).send("Forbidden");

        //Check server host
        const host = String(req.hostname || '').toLowerCase();
        if(config.api_host && host !== config.api_host)
            return res.status(401).send("Forbidden");
           
        next();
    });

    //Rate limiter
    app.use(RateLimit({
        windowMs: config.limiter_window,
        max: config.limiter_max, 
        skip: function(req) { return listContainsIp(config.ip_whitelist, req.ip || req.socket.remoteAddress); },
    }));
    app.auth_limiter = RateLimit({
        windowMs: config.limiter_window,  
        max: config.limiter_auth_max,
        skip: function(req) { return listContainsIp(config.ip_whitelist, req.ip || req.socket.remoteAddress); },
        handler: function (req, res) {
            res.status(429).send({error: "Too many requests!"});
        },
    });
    app.post_limiter = RateLimit({
        windowMs: config.limiter_window, 
        max: config.limiter_post_max, 
        skip: function(req) { return listContainsIp(config.ip_whitelist, req.ip || req.socket.remoteAddress); },
    });
}
