const GameStore = require('../game/game.store');

const collection = GameStore.collection('market');

const exactCaseInsensitive = (value) => new RegExp(`^${String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

exports.getById = async (offerId) => collection.get(offerId);

exports.getOffer = async (user, card_tid, variant_id) => collection.findOne({
  seller: exactCaseInsensitive(user),
  card: card_tid,
  variant: variant_id,
});

exports.getBySeller = async (user) => collection.find({
  seller: exactCaseInsensitive(user),
});

exports.getByCard = async (card_tid, variant_id) => collection.find({
  card: card_tid,
  variant: variant_id,
});

exports.getAll = async () => collection.find({});

exports.getAllLimit = async (perPage, page) => collection.find({}, {
  limit: perPage,
  skip: perPage * page,
});

exports.add = async (user, card, variant, data) => {
  let offer = await exports.getOffer(user, card, variant);

  if (!offer) {
    return collection.create({
      ...data,
      seller: user,
      card,
      variant,
      time: new Date(),
    });
  }

  offer.quantity += data.quantity;
  offer.price = data.price;
  offer.time = new Date();
  return collection.save(offer);
};

exports.reduce = async (user, card, variant, quantity) => {
  const offer = await exports.getOffer(user, card, variant);
  if (!offer) {
    return null;
  }

  offer.quantity -= quantity;
  if (offer.quantity > 0) {
    offer.time = new Date();
    return collection.save(offer);
  }

  return collection.remove(offer.offer_id || `${String(offer.seller || '').toLowerCase()}::${offer.card}::${offer.variant}`, offer.$meta);
};

exports.remove = async (user, card, variant) => {
  const offer = await exports.getOffer(user, card, variant);
  if (!offer) {
    return false;
  }

  return collection.remove(offer.offer_id || `${String(offer.seller || '').toLowerCase()}::${offer.card}::${offer.variant}`, offer.$meta);
};
