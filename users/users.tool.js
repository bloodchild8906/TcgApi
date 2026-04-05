const config = require('../config.js');
const crypto = require('crypto');
const Email = require('../tools/email.tool');
const AuthTool = require('../authorization/auth.tool');
const DeckModel = require('../decks/decks.model');
const Validator = require('../tools/validator.tool');
const VariantModel = require('../variants/variants.model.js');

const UserTool = {};

UserTool.generateID = function(length, easyRead) {
    let result = '';
    let characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    if(easyRead)
        characters  = 'abcdefghijklmnpqrstuvwxyz123456789'; //Remove confusing characters like 0 and O
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) {
       result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
 }

UserTool.setUserPassword = (user, password) =>
{
    user.password = AuthTool.hashPassword(password);
    user.password_recovery_key = ""; //After changing password, disable recovery until inited again
    user.refresh_key = crypto.randomBytes(16).toString('base64'); //Logout previous logins by changing the refresh_key
}

//--------- Rewards -----------

UserTool.GainUserReward = async(user, reward) =>
{
    //Add reward to user
    user.coins += reward.coins || 0;
    user.xp += reward.xp || 0;
    
    UserTool.addAvatars(user, reward.avatars);
    UserTool.addCardbacks(user, reward.card_backs);

    //Add cards and decks
    const valid_c = await UserTool.addCards(user, reward.cards || []);
    const valid_p = await UserTool.addPacks(user, reward.packs || []);
    const valid_d = await UserTool.addDecks(user, reward.decks || []);
    return valid_c && valid_p && valid_d;
};

//--------- Cards, Packs and Decks --------

//newCards is just an array of string (card tid), or an array of object {tid: "", quantity: 1}
UserTool.addCards = async(user, newCards) =>
{
    const cards = user.cards;

    if(!Array.isArray(cards) || !Array.isArray(newCards))
        return false; //Wrong params

    if(newCards.length === 0)
        return true; //No card to add, succeeded

    //Count quantities
    const prevTotal = Validator.countQuantity(cards);
    const addTotal = Validator.countQuantity(newCards);

    const variant_default = await VariantModel.getDefault();
    const default_tid = variant_default ? variant_default.tid : "";

    //Loop on cards to add
    for (let c = 0; c < newCards.length; c++) {

        const cardAdd = newCards[c];
        const cardAddTid = typeof cardAdd === 'object' ? cardAdd.tid : cardAdd;
        const cardAddVariant = typeof cardAdd === 'object' ? cardAdd.variant : default_tid;
        const cardAddQ = typeof cardAdd === 'object' ? cardAdd.quantity : 1;

        if (cardAddTid && typeof cardAddTid === "string") {
            const quantity = cardAddQ || 1; //default is 1
            let found = false;

            for (let i = 0; i < cards.length; i++) {
                if (cards[i].tid === cardAddTid && cards[i].variant === cardAddVariant) {
                    cards[i].quantity += quantity;
                    found = true;
                    break;
                }
            }

            if (!found) {
                cards.push({
                    tid: cardAddTid,
                    variant: cardAddVariant,
                    quantity: quantity,
                });
            }
        }
    }

    //Remove empty
    for(let i=cards.length-1; i>=0; i--)
    {
        const card = cards[i];
        if(!card.quantity || card.quantity <= 0)
            cards.splice(i, 1);
    }

    //Validate quantities to make sure the array was updated correctly, this is to prevent users from loosing all their cards because of server error which would be terrible.
    return Validator.validateArray(cards, prevTotal + addTotal);
};

UserTool.addPacks = async (user, newPacks) => {

    const packs = user.packs;

    if(!Array.isArray(packs) || !Array.isArray(newPacks))
        return false; //Wrong params

    if(newPacks.length === 0)
        return true; //No pack to add, succeeded
  
    //Count quantities
    const prevTotal = Validator.countQuantity(packs);
    const addTotal = Validator.countQuantity(newPacks);

    //Loop on packs to add
    for (let c = 0; c < newPacks.length; c++) {

        const packAdd = newPacks[c];
        const packAddTid = typeof packAdd === 'object' ? packAdd.tid : packAdd;
        const packAddQ = typeof packAdd === 'object' ? packAdd.quantity : 1;

        if (packAddTid && typeof packAddTid === "string") {
            const quantity = packAddQ || 1; //default is 1
            let found = false;

            for (let i = 0; i < packs.length; i++) {
                if (packs[i].tid === packAddTid) {
                    packs[i].quantity += quantity;
                    found = true;
                }
            }

            if (!found) {
                packs.push({
                    tid: packAddTid,
                    quantity: quantity,
                });
            }
        }
    }

    //Remove empty
    for(let i=packs.length-1; i>=0; i--)
    {
        const pack = packs[i];
        if(!pack.quantity || pack.quantity <= 0)
            packs.splice(i, 1);
    }

    //Validate quantities to make sure the array was updated correctly, this is to prevent users from loosing all their packs because of server error which would be terrible.
    return Validator.validateArray(packs, prevTotal + addTotal);
};

//newDecks is just an array of string (deck tid)
UserTool.addDecks = async(user, newDecks) =>
{
    const decks = user.decks;

    if(!Array.isArray(decks) || !Array.isArray(newDecks))
        return false; //Wrong params

    if(newDecks.length === 0)
        return true; //No deck to add, succeeded

    const new_decks = await DeckModel.getList(newDecks);
    if(!new_decks)
        return false; //Decks not found

    //Loop on cards to add
    for (let c = 0; c < new_decks.length; c++) {

        const deckAdd = new_decks[c];
        const valid_c = await UserTool.addCards(user, deckAdd.cards);
        if(!valid_c)
            return false; //Failed adding cards

        decks.push({
            tid: deckAdd.tid + "_" + UserTool.generateID(5),
            title: deckAdd.title || "",
            hero: deckAdd.hero || {},
            cards: deckAdd.cards || [],
        });
    }

    return true;
};
  
UserTool.addAvatars = (user, avatars) =>
{
    if(!avatars || !Array.isArray(avatars))
        return;

    for (let i = 0; i < avatars.length; i++) {
        const avatar = avatars[i];
        if(avatar && typeof avatar === "string" && !user.avatars.includes(avatar))
            user.avatars.push(avatar);
    }
};

UserTool.addCardbacks = (user, card_backs) =>
{
    if(!card_backs || !Array.isArray(card_backs))
        return;

    for (let i = 0; i < card_backs.length; i++) {
        const card_back = card_backs[i];
        if(card_back && typeof card_back === "string" && !user.card_backs.includes(card_back))
            user.card_backs.push(card_back);
    }
};

UserTool.hasCard = (user, card_id, variant_id, quantity) =>
{
    for (let c = 0; c < user.cards.length; c++) {
        const acard = user.cards[c];
        const aquantity = acard.quantity || 1;
        if(acard.tid === card_id && acard.variant === variant_id && aquantity >= quantity)
            return true;
    }
    return false;
};

UserTool.hasPack = (user, card_tid, quantity) =>
{
    for (let c = 0; c < user.packs.length; c++) {
        const apack = user.packs[c];
        const aquantity = apack.quantity || 1;
        if(apack.tid === card_tid && aquantity >= quantity)
            return true;
    }
    return false;
};

UserTool.hasAvatar = (user, avatarId) =>
{
    return user.avatars.includes(avatarId);
}

UserTool.hasCardback = (user, cardbackId) =>
{
    return user.card_backs.includes(cardbackId);
}

UserTool.hasAssets = (user, assets = {}) =>
{
    const coins = Number.isInteger(assets.coins) ? assets.coins : 0;
    if (coins < 0 || user.coins < coins)
        return false;

    const cards = Array.isArray(assets.cards) ? assets.cards : [];
    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        if (!UserTool.hasCard(user, card.tid, card.variant, card.quantity))
            return false;
    }

    const packs = Array.isArray(assets.packs) ? assets.packs : [];
    for (let i = 0; i < packs.length; i++) {
        const pack = packs[i];
        if (!UserTool.hasPack(user, pack.tid, pack.quantity))
            return false;
    }

    const avatars = Array.isArray(assets.avatars) ? assets.avatars : [];
    for (let i = 0; i < avatars.length; i++) {
        if (!UserTool.hasAvatar(user, avatars[i]))
            return false;
    }

    const card_backs = Array.isArray(assets.card_backs) ? assets.card_backs : [];
    for (let i = 0; i < card_backs.length; i++) {
        if (!UserTool.hasCardback(user, card_backs[i]))
            return false;
    }

    return true;
};

const removeOwnedStrings = (list, values) =>
{
    for (let i = 0; i < values.length; i++) {
        const value = values[i];
        const index = list.indexOf(value);
        if (index >= 0)
            list.splice(index, 1);
    }
};

UserTool.applyAssetBundle = async(user, assets = {}, direction = 1) =>
{
    if (!user || (direction !== 1 && direction !== -1))
        return false;

    const coins = Number.isInteger(assets.coins) ? assets.coins : 0;
    if (coins > 0)
    {
        user.coins += coins * direction;
        if (user.coins < 0)
            return false;
    }

    const cards = Array.isArray(assets.cards) ? assets.cards.map((card) => ({
        tid: card.tid,
        variant: card.variant,
        quantity: card.quantity * direction,
    })) : [];
    const packs = Array.isArray(assets.packs) ? assets.packs.map((pack) => ({
        tid: pack.tid,
        quantity: pack.quantity * direction,
    })) : [];

    const validCards = await UserTool.addCards(user, cards);
    const validPacks = await UserTool.addPacks(user, packs);
    if (!validCards || !validPacks)
        return false;

    const avatars = Array.isArray(assets.avatars) ? assets.avatars : [];
    const card_backs = Array.isArray(assets.card_backs) ? assets.card_backs : [];

    if (direction > 0)
    {
        UserTool.addAvatars(user, avatars);
        UserTool.addCardbacks(user, card_backs);
    }
    else
    {
        removeOwnedStrings(user.avatars, avatars);
        removeOwnedStrings(user.card_backs, card_backs);
    }

    return true;
};

UserTool.transferAssetBundle = async(fromUser, toUser, assets = {}) =>
{
    if (!UserTool.hasAssets(fromUser, assets))
        return false;

    const removed = await UserTool.applyAssetBundle(fromUser, assets, -1);
    if (!removed)
        return false;

    return await UserTool.applyAssetBundle(toUser, assets, 1);
};

UserTool.getDeck = (user, deck_tid) =>
{
    let deck = {};
    if(user && user.decks)
    {
        for(let i=0; i<user.decks.length; i++)
        {
            const a_deck = user.decks[i];
            if(a_deck.tid === deck_tid)
            {
                deck = a_deck;
            }
        }
    }  
    return deck;
};

UserTool.getData = (all_data, tid) =>
{
    for(let i=0; i<all_data.length; i++)
    {
        if(all_data[i].tid === tid)
            return all_data[i];
    }
    return null;
};

//--------- Emails --------

UserTool.sendEmailConfirmKey = (user, email, email_confirm_key) => {

    if(!email || !user) return;

    const subject = config.api_title + " - Email Confirmation";
    const http = config.allow_https ? "https://" : "http://";
    const confirm_link = http + config.api_url + "/users/email/confirm/" + user.id + "/" + email_confirm_key;

    let text = "Hello " + user.username + "<br>";
    text += "Welcome! <br><br>";
    text += "To confirm your email, click here: <br><a href='" + confirm_link + "'>" + confirm_link + "</a><br><br>";
    text += "Thank you and see you soon!<br>";

    Email.SendEmail(email, subject, text, function(result){
        console.log("Sent email to: " + email + ": " + result);
    });

};

UserTool.sendEmailChangeEmail = (user, email, new_email) => {

    if(!email || !user) return;

    const subject = config.api_title + " - Email Changed";

    let text = "Hello " + user.username + "<br>";
    text += "Your email was succesfully changed to: " + new_email + "<br>";
    text += "If you believe this is an error, please contact support immediately.<br><br>"
    text += "Thank you and see you soon!<br>";
    
    Email.SendEmail(email, subject, text, function(result){
        console.log("Sent email to: " + email + ": " + result);
    });
};

UserTool.sendEmailChangePassword = (user, email) => {

    if(!email || !user) return;

    const subject = config.api_title + " - Password Changed";

    let text = "Hello " + user.username + "<br>";
    text += "Your password was succesfully changed<br>";
    text += "If you believe this is an error, please contact support immediately.<br><br>"
    text += "Thank you and see you soon!<br>";

    Email.SendEmail(email, subject, text, function(result){
        console.log("Sent email to: " + email + ": " + result);
    });

};

UserTool.sendEmailPasswordRecovery = (user, email) => {

    if(!email || !user) return;

    const subject = config.api_title + " - Password Recovery";

    let text = "Hello " + user.username + "<br>";
    text += "Here is your password recovery code: " + user.password_recovery_key.toUpperCase() + "<br><br>";
    text += "Thank you and see you soon!<br>";

    Email.SendEmail(email, subject, text, function(result){
        console.log("Sent email to: " + email + ": " + result);
    });
};


module.exports = UserTool;
