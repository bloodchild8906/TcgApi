const UserModel = require("./users.model");
const PackModel = require("../packs/packs.model");
const CardModel = require("../cards/cards.model");
const VariantModel = require("../variants/variants.model");
const UserTool = require("./users.tool");
const CardTool = require("../cards/cards.tool");
const Activity = require("../activity/activity.model");
const config = require("../config");
exports.UpdateDeck = async(req, res) => {

    if(!req.params.deckId)
        return res.status(400).send({error: "Invalid parameters"});

  const userId = req.jwt.userId;
  const deckId = req.params.deckId;

  const newDeck = {
    tid: deckId,
    title: req.body.title || "Deck",
    hero: req.body.hero || {},
    cards: req.body.cards || [],
  };

  const user = await UserModel.getById(userId);
  if(!user)
      return res.status(404).send({error: "User not found: " + userId});

  const decks = user.decks || [];
  let found = false;
  let index = 0;
  const preserveDeckStats = (existingDeck = {}) => ({
    ranked_mmr: existingDeck.ranked_mmr,
    casual_mmr: existingDeck.casual_mmr,
    ranked_matches: existingDeck.ranked_matches,
    ranked_wins: existingDeck.ranked_wins,
    ranked_losses: existingDeck.ranked_losses,
    casual_matches: existingDeck.casual_matches,
    casual_wins: existingDeck.casual_wins,
    casual_losses: existingDeck.casual_losses,
    ranked_provisional_matches: existingDeck.ranked_provisional_matches,
    casual_provisional_matches: existingDeck.casual_provisional_matches,
  });

  for(let i=0; i<decks.length; i++){
      const deck = decks[i];
      if(deck.tid === deckId)
      {
         decks[i]= {
           ...deck,
           ...preserveDeckStats(deck),
           ...newDeck,
         };
          found = true;
          index = i;
       }
    }

    //Add new
    if(!found && newDeck.cards.length > 0)
      decks.push({
        ...newDeck,
        ranked_mmr: Number.isFinite(Number(user.elo)) ? Number(user.elo) : Number(config.start_elo || 1000),
        casual_mmr: Number.isFinite(Number(user.casual_mmr)) ? Number(user.casual_mmr) : (Number.isFinite(Number(user.elo)) ? Number(user.elo) : Number(config.start_elo || 1000)),
        ranked_matches: 0,
        ranked_wins: 0,
        ranked_losses: 0,
        casual_matches: 0,
        casual_wins: 0,
        casual_losses: 0,
        ranked_provisional_matches: 0,
        casual_provisional_matches: 0,
      });

    //Delete deck
    if(found && newDeck.cards.length === 0)
      decks.splice(index, 1);

  const userData = {decks: decks};
  const upUser = await UserModel.update(user, userData);
  if (!upUser) return res.status(500).send({ error: "Error updating user: " + userId });

    return res.status(200).send(upUser.decks);
};

exports.DeleteDeck = async(req, res) => {

    if(!req.params.deckId)
        return res.status(400).send({error: "Invalid parameters"});

  const userId = req.jwt.userId;
  const deckId = req.params.deckId;

  const user = await UserModel.getById(userId);
  if(!user)
        return res.status(404).send({error: "User not found: " + userId});

  const decks = user.decks || {};
  let index = -1;
  for(let i=0; i<decks.length; i++){
      const deck = decks[i];
      if(deck.tid === deckId)
      {
        index = i;
      }
    }
    
    if(index >= 0)
      decks.splice(index, 1);

  const userData = {decks: decks};
  const upUser = await UserModel.update(user, userData);
  if (!upUser) return res.status(500).send({ error: "Error updating user: " + userId });

    return res.status(200).send(upUser.decks);
};

exports.BuyCard = async (req, res) => {
  
  const userId = req.jwt.userId;
  const cardId = req.body.card;
  const variantId = req.body.variant;
  const quantity = req.body.quantity || 1;

  if (!cardId || typeof cardId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  if(!variantId || typeof variantId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  if(!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const card = await CardModel.get(cardId);
  if (!card)
    return res.status(404).send({ error: "Cant find card " + cardId });

  if(card.cost <= 0)
    return res.status(400).send({ error: "Can't be purchased" });

  const variant = await VariantModel.get(variantId);
  const factor = variant != null ? variant.cost_factor : 1;
  const cost = quantity * factor * card.cost;
  if(user.coins < cost)
    return res.status(400).send({ error: "Not enough coins" });

  user.coins -= cost;

  const valid = await UserTool.addCards(user, [{tid: cardId, variant: variantId, quantity: quantity}]);
  if (!valid)
    return res.status(500).send({ error: "Error when adding cards" });

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "cards"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {card: cardId, variant: variantId, quantity: quantity};
  const act = await Activity.LogActivity("user_buy_card", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  // -------------
  return res.status(200).send();

};

exports.SellCard = async (req, res) => {
  
  const userId = req.jwt.userId;
  const cardId = req.body.card;
  const variantId = req.body.variant;
  const quantity = req.body.quantity || 1;

  if (!cardId || typeof cardId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  if(!variantId || typeof variantId !== "string")
    return res.status(400).send({ error: "Invalid parameters" });

  if(!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const card = await CardModel.get(cardId);
  if (!card)
    return res.status(404).send({ error: "Cant find card " + cardId });

  if(card.cost <= 0)
    return res.status(400).send({ error: "Can't be sold" });

  const variant = await VariantModel.get(variantId);

  if(!UserTool.hasCard(user, cardId, variantId, quantity))
    return res.status(400).send({ error: "Not enough cards" });

  const factor = variant != null ? variant.cost_factor : 1;
  const cost = quantity * Math.round(card.cost * factor * config.sell_ratio);
  user.coins += cost;

  const valid = await UserTool.addCards(user, [{tid: cardId, variant: variantId, quantity: -quantity}]);
  if (!valid)
    return res.status(500).send({ error: "Error when removing cards" });

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "cards"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {card: cardId, variant: variantId, quantity: quantity};
  const act = await Activity.LogActivity("user_sell_card", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  // -------------
  return res.status(200).send();
};

exports.SellDuplicateCards = async (req, res) => {
  
  const userId = req.jwt.userId;
  const rarityId = req.body.rarity || "";    //If not set, will sell cards of all rarities
  const variantId = req.body.variant || ""; //If not set, will sell cards of all variants
  const keep = req.body.keep; //Number of copies to keep

  if(typeof rarityId !== "string")
    return res.status(400).send({ error: "Invalid parameters" });

  if(typeof variantId !== "string")
    return res.status(400).send({ error: "Invalid parameters" });

  if(!Number.isInteger(keep) || keep < 0)
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const all_variants = await VariantModel.getAll();
  if (!all_variants)
    return res.status(404).send({ error: "Cant find variants" });

  const all_cards = await CardModel.getAll();
  if (!all_cards)
    return res.status(404).send({ error: "Cant find cards" });

  const cards_to_sell = [];
  let coins = 0;
  for(let i=0; i<user.cards.length; i++)
  {
    const card = user.cards[i];
    const card_data = UserTool.getData(all_cards, card.tid);
    if(card_data && card_data.cost > 0 && card.quantity > keep)
    {
      if(!variantId || card.variant === variantId)
      {
        if(!rarityId || card_data.rarity === rarityId)
        {
          const variant = UserTool.getData(all_variants, card.variant);
          const quantity = card.quantity - keep;
          const sell = {tid: card.tid, variant: card.variant, quantity: -quantity};
          const factor = variant != null ? variant.cost_factor : 1;
          const cost = quantity * Math.round(card_data.cost * factor * config.sell_ratio);
          cards_to_sell.push(sell);
           coins += cost;
        }
      }
    }
  }

  if(cards_to_sell.length === 0)
    return res.status(200).send();

  user.coins += coins;

  const valid = await UserTool.addCards(user, cards_to_sell);
  if (!valid)
    return res.status(500).send({ error: "Error when removing cards" });

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "cards"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {rarity: rarityId, variant: variantId, keep: keep};
  const act = await Activity.LogActivity("user_sell_cards_duplicate", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  // -------------
  return res.status(200).send();
};

exports.BuyPack = async (req, res) => {
  
  const userId = req.jwt.userId;
  const packId = req.body.pack;
  const quantity = req.body.quantity || 1;

  if (!packId || typeof packId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  if(!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const pack = await PackModel.get(packId);
  if (!pack)
    return res.status(404).send({ error: "Cant find pack " + packId });

  if(pack.cost <= 0)
    return res.status(400).send({ error: "Can't be purchased" });

  const cost = quantity * pack.cost;
  if(user.coins < cost)
    return res.status(400).send({ error: "Not enough coins" });

  user.coins -= cost;

  const valid = await UserTool.addPacks(user, [{tid: packId, quantity: quantity}]);
  if (!valid)
    return res.status(500).send({ error: "Error when adding packs" });

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "packs"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {pack: packId, quantity: quantity};
  const act = await Activity.LogActivity("user_buy_pack", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  // -------------
  return res.status(200).send();

};

exports.SellPack = async (req, res) => {
  
  const userId = req.jwt.userId;
  const packId = req.body.pack;
  const quantity = req.body.quantity || 1;

  if (!packId || typeof packId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  if(!Number.isInteger(quantity) || quantity <= 0)
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const pack = await PackModel.get(packId);
  if (!pack)
    return res.status(404).send({ error: "Cant find pack " + packId });

  if(pack.cost <= 0)
    return res.status(400).send({ error: "Can't be sold" });

  if(!UserTool.hasPack(user, packId, quantity))
    return res.status(400).send({ error: "Not enough coins" });

  const cost = quantity * Math.round(pack.cost * config.sell_ratio);
  user.coins += cost;

  const valid = await UserTool.addPacks(user, [{tid: packId, quantity: -quantity}]);
  if (!valid)
    return res.status(500).send({ error: "Error when adding packs" });

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "packs"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {pack: packId, quantity: quantity};
  const act = await Activity.LogActivity("user_sell_pack", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  // -------------
  return res.status(200).send();

};

exports.OpenPack = async (req, res) => {
  
  const userId = req.jwt.userId;
  const packId = req.body.pack;

  if (!packId || typeof packId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const pack = await PackModel.get(packId);
  if (!pack)
    return res.status(404).send({ error: "Cant find pack " + packId });

  if(!UserTool.hasPack(user, packId, 1))
    return res.status(400).send({ error: "You don't have this pack" });

  const cardsToAdd = await CardTool.getPackCards(pack);
  const validCards = await UserTool.addCards(user, cardsToAdd);
  const validPacks = await UserTool.addPacks(user, [{tid: packId, quantity: -1}]);

  if (!validCards || !validPacks)
    return res.status(500).send({ error: "Error when adding cards" });

  //Update the user array
  const updatedUser = await UserModel.save(user, ["cards", "packs"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {pack: packId, cards: cardsToAdd};
  const act = await Activity.LogActivity("user_open_pack", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  // -------------
  return res.status(200).send(cardsToAdd);

};

exports.BuyAvatar = async (req, res) => {
  
  const userId = req.jwt.userId;
  const avatarId = req.body.avatar;

  if (!avatarId || typeof avatarId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const cost = config.avatar_cost;
  if(user.coins < cost)
    return res.status(400).send({ error: "Not enough coins" });

  if(UserTool.hasAvatar(user, avatarId))
    return res.status(400).send({ error: "Already have this avatar" });

  user.coins -= cost;
  UserTool.addAvatars(user, [avatarId]);

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "avatars"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {avatar: avatarId};
  const act = await Activity.LogActivity("user_buy_avatar", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  return res.status(200).send();
};

exports.BuyCardback = async (req, res) => {
  
  const userId = req.jwt.userId;
  const cardbackId = req.body.cardback;

  if (!cardbackId || typeof cardbackId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const cost = config.cardback_cost;
  if(user.coins < cost)
    return res.status(400).send({ error: "Not enough coins" });

  if(UserTool.hasCardback(user, cardbackId))
    return res.status(400).send({ error: "Already have this card back" });

  user.coins -= cost;
  UserTool.addCardbacks(user, [cardbackId]);

  //Update the user array
  const updatedUser = await UserModel.save(user, ["coins", "card_backs"]);
  if (!updatedUser) return res.status(500).send({ error: "Error updating user: " + userId });

  // Activity Log -------------
  const activityData =  {cardback: cardbackId};
  const act = await Activity.LogActivity("user_buy_cardback", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  return res.status(200).send();
};

//Fix variant from previous version
exports.FixVariants = async (req, res) =>
{
  const from = req.body.from || "";
  const to = req.body.to || "";

  if (from && typeof from !== "string")
    return res.status(400).send({ error: "Invalid parameters" });
  if (to && typeof to !== "string")
    return res.status(400).send({ error: "Invalid parameters" });

  const users = await UserModel.getAll();
  const default_variant = await VariantModel.getDefault();
  const default_tid = default_variant ? default_variant.tid : "";
  let count = 0;

  for(let u=0; u<users.length; u++)
  {
    const user = users[u];
    let changed = false;
    for(let i=0; i<user.cards.length; i++)
    {
      const card = user.cards[i];
      if(!card.variant)
      {
        card.variant = default_tid;
        changed = true;
      }
      if(from && to && card.variant === from)
      {
        card.variant = to;
        changed = true;
      }
    }

    if(changed)
    {
      const new_cards = user.cards;
      user.cards = [];
      await UserTool.addCards(user, new_cards);  //Re-add in correct format
      await UserModel.save(user, ["cards"]);
      count++;
    }
  }

  // Activity Log -------------
  const act = await Activity.LogActivity("fix_variants", req.jwt.username, {});
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  return res.status(200).send({updated: count});
}

exports.GetPackCards = async (req, res) => {
  
  const userId = req.jwt.userId;
  const packId = req.body.pack;

  if (!packId || typeof packId !== "string")
      return res.status(400).send({ error: "Invalid parameters" });

  //Get the user add update the array
  const user = await UserModel.getById(userId);
  if (!user)
    return res.status(404).send({ error: "Cant find user " + userId });

  const pack = await PackModel.get(packId);
  if (!pack)
    return res.status(404).send({ error: "Cant find pack " + packId });

  const cards = await CardTool.getPackCards(pack);

  // Activity Log -------------
  const activityData =  {pack: packId};
  const act = await Activity.LogActivity("user_get_pack_cards", req.jwt.username, activityData);
  if (!act) return res.status(500).send({ error: "Failed to log activity!!" });

  return res.status(200).send(cards);

}
