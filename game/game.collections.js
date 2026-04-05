const config = require('../config');
const { createId } = require('./game.helpers');

const createOfferId = (data = {}) => `${String(data.seller || '').toLowerCase()}::${String(data.card || '')}::${String(data.variant || '')}`;

const toFiniteInteger = (value, fallback = 0) => {
  const numeric = Number.parseInt(value, 10);
  return Number.isInteger(numeric) ? numeric : fallback;
};

const ensureDeckDefaults = (deck = {}, user = {}) => {
  const rankedSeed = toFiniteInteger(deck.ranked_mmr, toFiniteInteger(user.elo, config.start_elo));
  const casualSeed = toFiniteInteger(deck.casual_mmr, toFiniteInteger(user.casual_mmr, toFiniteInteger(user.elo, config.start_elo)));
  return {
    ...deck,
    title: String(deck.title || ''),
    cards: Array.isArray(deck.cards) ? deck.cards : [],
    hero: deck.hero || {},
    ranked_mmr: rankedSeed,
    casual_mmr: casualSeed,
    ranked_matches: toFiniteInteger(deck.ranked_matches, 0),
    ranked_wins: toFiniteInteger(deck.ranked_wins, 0),
    ranked_losses: toFiniteInteger(deck.ranked_losses, 0),
    casual_matches: toFiniteInteger(deck.casual_matches, 0),
    casual_wins: toFiniteInteger(deck.casual_wins, 0),
    casual_losses: toFiniteInteger(deck.casual_losses, 0),
    ranked_provisional_matches: toFiniteInteger(deck.ranked_provisional_matches, 0),
    casual_provisional_matches: toFiniteInteger(deck.casual_provisional_matches, 0),
  };
};

const ensureUserDefaults = (data = {}) => {
  const rankedSeed = toFiniteInteger(data.elo, config.start_elo);
  const casualSeed = toFiniteInteger(data.casual_mmr, rankedSeed);
  return {
    ...data,
    elo: rankedSeed,
    casual_mmr: casualSeed,
    matches: toFiniteInteger(data.matches, 0),
    victories: toFiniteInteger(data.victories, 0),
    defeats: toFiniteInteger(data.defeats, 0),
    casual_matches: toFiniteInteger(data.casual_matches, 0),
    casual_wins: toFiniteInteger(data.casual_wins, 0),
    casual_losses: toFiniteInteger(data.casual_losses, 0),
    cards: Array.isArray(data.cards) ? data.cards : [],
    packs: Array.isArray(data.packs) ? data.packs : [],
    decks: (Array.isArray(data.decks) ? data.decks : []).map((deck) => ensureDeckDefaults(deck, {
      elo: rankedSeed,
      casual_mmr: casualSeed,
    })),
    avatars: Array.isArray(data.avatars) ? data.avatars : [],
    card_backs: Array.isArray(data.card_backs) ? data.card_backs : [],
    rewards: Array.isArray(data.rewards) ? data.rewards : [],
    friends: Array.isArray(data.friends) ? data.friends : [],
    friends_requests: Array.isArray(data.friends_requests) ? data.friends_requests : [],
  };
};

module.exports = {
  activity: {
    name: 'activity',
    collectionName: 'activities',
    keyField: 'id',
    dateFields: ['timestamp'],
    hiddenFields: ['id'],
    ensureKey: (data) => data.id || createId(),
  },
  bans: {
    name: 'bans',
    collectionName: 'bans',
    keyField: 'userId',
    dateFields: ['expiresAt', 'createdAt'],
    hiddenFields: [],
  },
  cards: {
    name: 'cards',
    collectionName: 'cards',
    keyField: 'tid',
    dateFields: [],
    hiddenFields: [],
  },
  card_types: {
      name: 'card_types',
      collectionName: 'card_types',
      keyField: 'tid',
      dateFields: [],
      hiddenFields: [],
  },
  card_frames: {
      name: 'card_frames',
      collectionName: 'card_frames',
      keyField: 'tid',
      dateFields: [],
      hiddenFields: [],
  },
  card_backs: {
      name: 'card_backs',
      collectionName: 'card_backs',
      keyField: 'tid',
      dateFields: [],
      hiddenFields: [],
  },
  game_flows: {
      name: 'game_flows',
      collectionName: 'game_flows',
      keyField: 'tid',
      dateFields: ['createdAt', 'updatedAt'],
      hiddenFields: [],
  },
  keywords: {
      name: 'keywords',
      collectionName: 'keywords',
      keyField: 'tid',
      dateFields: [],
      hiddenFields: [],
  },
  sets: {
      name: 'sets',
      collectionName: 'sets',
      keyField: 'tid',
      dateFields: ['releaseDate'],
      hiddenFields: [],
  },
  decks: {
    name: 'decks',
    collectionName: 'decks',
    keyField: 'tid',
    dateFields: [],
    hiddenFields: [],
  },
  market: {
    name: 'market',
    collectionName: 'markets',
    keyField: 'offer_id',
    dateFields: ['time'],
    hiddenFields: ['offer_id'],
    ensureKey: (data) => data.offer_id || createOfferId(data),
  },
  matches: {
    name: 'matches',
    collectionName: 'matches',
    keyField: 'tid',
    dateFields: ['start', 'end'],
    hiddenFields: [],
  },
  matchmaking_queue: {
    name: 'matchmaking_queue',
    collectionName: 'matchmaking_queue',
    keyField: 'tid',
    dateFields: ['queued_at', 'matched_at', 'updated_at'],
    hiddenFields: [],
  },
  matchmaking_settings: {
    name: 'matchmaking_settings',
    collectionName: 'matchmaking_settings',
    keyField: 'tid',
    dateFields: ['created_at', 'updated_at'],
    hiddenFields: [],
  },
  match_events: {
      name: 'match_events',
      collectionName: 'match_events',
      keyField: 'id',
      dateFields: ['timestamp'],
      hiddenFields: ['id'],
      ensureKey: (data) => data.id || createId(),
  },
  player_messages: {
    name: 'player_messages',
    collectionName: 'player_messages',
    keyField: 'id',
    dateFields: ['timestamp'],
    hiddenFields: ['id'],
    ensureKey: (data) => data.id || createId(),
  },
  packs: {
    name: 'packs',
    collectionName: 'packs',
    keyField: 'tid',
    dateFields: [],
    hiddenFields: [],
  },
  rewards: {
    name: 'rewards',
    collectionName: 'rewards',
    keyField: 'tid',
    dateFields: [],
    hiddenFields: [],
  },
  users: {
    name: 'users',
    collectionName: 'users',
    keyField: 'id',
    dateFields: ['account_create_time', 'last_login_time', 'last_online_time'],
    hiddenFields: [],
    type: 'user',
    ensureKey: (data) => data.id || createId(),
    normalizeOnLoad: ensureUserDefaults,
    normalizeOnSave: ensureUserDefaults,
  },
  variants: {
    name: 'variants',
    collectionName: 'variants',
    keyField: 'tid',
    dateFields: [],
    hiddenFields: [],
  },
};
