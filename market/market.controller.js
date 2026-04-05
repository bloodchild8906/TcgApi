const UserModel = require('../users/users.model');
const MarketModel = require('./market.model');
const UserTool = require('../users/users.tool');
require('../tools/date.tool');
const Activity = require("../activity/activity.model");
require('../config');

exports.addOffer = async(req, res) => {

    const username = req.jwt.username;
    const card_tid = req.body.card;
    const variant = req.body.variant;
    const quantity = req.body.quantity;
    const price = req.body.price;

    //Validate params
    if (!username || !card_tid || !variant || !quantity || !price)
        return res.status(400).send({ error: "Invalid parameters" });

    if(typeof username !== "string"|| typeof quantity !== "number" || typeof price !== "number" || typeof card_tid !== "string" || typeof variant !== "string" )
        return res.status(400).send({ error: "Invalid parameters" });

    if(!Number.isInteger(quantity) || !Number.isInteger(price) || price <= 0 || quantity <= 0)
        return res.status(400).send({ error: "Invalid parameters" });

    //Get user
    const user = await UserModel.getByUsername(username);
    if (!user)
        return res.status(404).send({ error: "Can't find user " + username });

    if(!UserTool.hasCard(user, card_tid, variant, quantity))
        return res.status(400).send({ error: "You don't have those cards!" });

    //Offer
    const offer = {
        seller: username,
        card: card_tid,
        variant: variant,
        quantity: quantity,
        price: price,
    };

    //Remove card from user
    const removeCards = [{tid: card_tid, variant: variant, quantity: -quantity}];
    const addSucc = await UserTool.addCards(user, removeCards);
    if(!addSucc)
        return res.status(500).send({ error: "Error removing cards from user " + username });

    //Update database
    const uOffer = await MarketModel.add(username, card_tid, variant, offer);
    const uUser = await UserModel.update(user, {cards: user.cards,});

    if(!uUser || !uOffer)
        return res.status(500).send({ error: "Error creating market offer " + username });

    //Activity
    //var act = await Activity.LogActivity("market_add", req.jwt.username, uOffer.toObj());
    //if (!act) return res.status(500).send({ error: "Failed to log activity!" });
        
    return res.status(200).send(uOffer.toObj());
};

exports.removeOffer = async(req, res) => {

    const username = req.jwt.username;
    const card_tid = req.body.card;
    const variant = req.body.variant;

    //Validate params
    if (!username || !card_tid || !variant)
        return res.status(400).send({ error: "Invalid parameters" });

    if(typeof username !== "string"|| typeof card_tid !== "string" || typeof variant !== "string" )
        return res.status(400).send({ error: "Invalid parameters" });

    const user = await UserModel.getByUsername(username);
    if (!user)
        return res.status(404).send({ error: "Can't find user " + username });

    const offer = await MarketModel.getOffer(username, card_tid, variant);
    if (!offer)
        return res.status(404).send({ error: "No market offer for " + username + " " + card_tid });

    //Add cards user
    const addCards = [{tid: card_tid, variant: variant, quantity: offer.quantity}];
    const addSucc = await UserTool.addCards(user, addCards);
    if(!addSucc)
        return res.status(500).send({ error: "Error adding cards to user " + username });

    //Update database
    const uUser = await UserModel.update(user, {cards: user.cards});
    const uOffer = await MarketModel.remove(username, card_tid, variant);

    if(!uUser || !uOffer)
        return res.status(500).send({ error: "Error removing market offer " + username });

    //Activity
    //var act = await Activity.LogActivity("market_remove", req.jwt.username, {});
    //if (!act) return res.status(500).send({ error: "Failed to log activity!" });
        
    return res.status(200).send({success: uOffer});
};

exports.trade = async(req, res) => {

    const username = req.jwt.username;
    const seller_user = req.body.seller;
    const card_tid = req.body.card;
    const variant = req.body.variant;
    const quantity = req.body.quantity;

    //Validate params
    if (!username || !seller_user || !card_tid || !variant || !quantity)
        return res.status(400).send({ error: "Invalid parameters" });

    if(typeof seller_user !== "string" || typeof card_tid !== "string" || typeof variant !== "string" || typeof quantity !== "number")
        return res.status(400).send({ error: "Invalid parameters" });

    if(!Number.isInteger(quantity) || quantity <= 0)
        return res.status(400).send({ error: "Invalid parameters" });

    //Get user
    const user = await UserModel.getByUsername(username);
    const seller = await UserModel.getByUsername(seller_user);
    if (!user || !seller)
        return res.status(404).send({ error: "Can't find user " + username + " or " + seller_user });

    if(user.id === seller.id)
        return res.status(403).send({ error: "Can't trade with yourself!" });

    //Get offer
    const offer = await MarketModel.getOffer(seller_user, card_tid, variant);
    if (!offer)
        return res.status(404).send({ error: "No market offer for " + seller_user + " " + card_tid });

    const value = quantity * offer.price;
    if(user.coins < value)
        return res.status(403).send({ error: "Not enough coins to trade!" });
    if(quantity > offer.quantity)
        return res.status(403).send({ error: "Not enough cards to trade!" });
    
    //Add cards and coins
    const addCards = [{tid: card_tid, variant: variant, quantity: quantity}];
    const addSucc = await UserTool.addCards(user, addCards);
    if(!addSucc)
        return res.status(500).send({ error: "Error adding cards to user " + username });
        
    user.coins -= value;
    seller.coins += value;

    //Update database
    const uUser = await UserModel.update(user, {coins: user.coins, cards: user.cards});
    const uSeller = await UserModel.update(seller, {coins: seller.coins});
    const uOffer = await MarketModel.reduce(seller_user, card_tid, variant, quantity);
    if(!uUser || !uOffer || !uSeller)
        return res.status(500).send({ error: "Error trading market offer " + username + " " + seller_user });

    //Activity
    const aData = {buyer: username, seller: seller_user, card: card_tid, quantity: quantity, price: offer.price};
    const act = await Activity.LogActivity("market_trade", req.jwt.username, aData);
    if (!act) return res.status(500).send({ error: "Failed to log activity!" });

    return res.status(200).send(aData);
};

exports.getBySeller = async(req, res) => {

    if(!req.params.username)
        return res.status(400).send({ error: "Invalid parameters" });

    const list = await MarketModel.getBySeller(req.params.username);
    for(let i=0; i<list.length; i++){
        list[i] = list[i].toObj();
    }
    return res.status(200).send(list);
};

exports.getByCard = async(req, res) => {

    const tid = req.params.tid;
    const variant = req.params.variant;

    if(!tid || !variant)
        return res.status(400).send({ error: "Invalid parameters" });

    const list = await MarketModel.getByCard(tid, variant);
    for(let i=0; i<list.length; i++){
        list[i] = list[i].toObj();
    }
    return res.status(200).send(list);
};

exports.getOffer = async(req, res) => {

    const tid = req.params.tid;
    const variant = req.params.variant;
    const username = req.params.username;

    if(!tid || !variant || !username)
        return res.status(400).send({ error: "Invalid parameters" });

    const offer = await MarketModel.getOffer(username, tid, variant);
    if(!offer)
        return res.status(404).send({ error: "Offer not found" });

    return res.status(200).send(offer.toObj());
};

exports.getAll = async(req, res) => {
    const list = await MarketModel.getAll();
    for(let i=0; i<list.length; i++){
        list[i] = list[i].toObj();
    }
    return res.status(200).send(list);
};
