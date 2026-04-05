const SummaryService = require('./admin.summary.service');
const ManagementService = require('./admin.management.service');

exports.GetSummary = async (req, res) => {
  return res.status(200).send(await SummaryService.getSummary());
};

exports.ResetDatabase = async (req, res) => {
    return res.status(200).send(await ManagementService.resetDatabase(req.jwt.username));
};

exports.ListPlayers = async (req, res) => {
    return res.status(200).send(await ManagementService.listPlayers(req.query || {}));
};

exports.ListStaff = async (req, res) => {
    return res.status(200).send(await ManagementService.listStaff(req.query || {}));
};

exports.UpdatePlayer = async (req, res) => {
  return res.status(200).send(await ManagementService.updatePlayer(
    req.params.userId,
    req.body || {},
    req.jwt.username
  ));
};

exports.BanPlayer = async (req, res) => {
    return res.status(200).send(await ManagementService.banPlayer(
        req.params.userId,
        req.body.type,
        req.body.reason,
        req.jwt.username,
        {
            notes: req.body.notes,
            linked_chats: req.body.linked_chats
        }
    ));
};

exports.UnbanPlayer = async (req, res) => {
    return res.status(200).send(await ManagementService.unbanPlayer(
        req.params.userId,
        req.jwt.username
    ));
};

exports.KickPlayer = async (req, res) => {
    return res.status(200).send(await ManagementService.kickPlayer(
        req.params.userId,
        req.body.reason,
        req.jwt.username
    ));
};

exports.GetPlayerHistory = async (req, res) => {
    return res.status(200).send(await ManagementService.getPlayerHistory(req.params.userId));
};

exports.GetPlayerFriends = async (req, res) => {
    return res.status(200).send(await ManagementService.getPlayerFriends(req.params.userId));
};

exports.GetPlayerDeck = async (req, res) => {
    return res.status(200).send(await ManagementService.getPlayerDeck(req.params.userId, req.params.deckTid));
};

exports.GiveReward = async (req, res) => {
    return res.status(200).send(await ManagementService.giveReward(
        req.params.userId,
        req.body.reward,
        req.jwt.username
    ));
};

exports.ListGames = async (req, res) => {
  return res.status(200).send({
    matches: await ManagementService.listGames(req.query || {}),
  });
};

exports.GetGameEvents = async (req, res) => {
    return res.status(200).send({
        events: await ManagementService.getGameEvents(req.params.matchId)
    });
};

exports.DeleteGame = async (req, res) => {
  return res.status(200).send({
    success: true,
    match: await ManagementService.deleteGame(req.params.matchId, req.jwt.username),
  });
};

// Card Suite Suite Endpoints
exports.ListKeywords = async (req, res) => {
    return res.status(200).send({ keywords: await ManagementService.listKeywords() });
};
exports.SaveKeyword = async (req, res) => {
    return res.status(200).send(await ManagementService.saveKeyword(req.body || {}, req.jwt.username));
};

exports.ListSets = async (req, res) => {
    return res.status(200).send({ sets: await ManagementService.listSets() });
};
exports.SaveSet = async (req, res) => {
    return res.status(200).send(await ManagementService.saveSet(req.body || {}, req.jwt.username));
};

exports.ListPacks = async (req, res) => {
    return res.status(200).send({ packs: await ManagementService.listPacks() });
};
exports.SavePack = async (req, res) => {
    return res.status(200).send(await ManagementService.savePack(req.body || {}, req.jwt.username));
};

exports.ListCardTypes = async (req, res) => {
    return res.status(200).send({ types: await ManagementService.listCardTypes() });
};
exports.SaveCardType = async (req, res) => {
    return res.status(200).send(await ManagementService.saveCardType(req.body || {}, req.jwt.username));
};

// Game Flow Endpoints
exports.ListGameFlows = async (req, res) => {
    return res.status(200).send({ flows: await ManagementService.listGameFlows() });
};
exports.GetGameFlow = async (req, res) => {
    return res.status(200).send(await ManagementService.getGameFlow(req.params.tid));
};
exports.SaveGameFlow = async (req, res) => {
    return res.status(200).send(await ManagementService.saveGameFlow(req.body || {}, req.jwt.username));
};
exports.DeleteGameFlow = async (req, res) => {
    return res.status(200).send(await ManagementService.deleteGameFlow(req.params.tid, req.jwt.username));
};

exports.ListCards = async (req, res) => {
    return res.status(200).send({
        cards: await ManagementService.listCards(req.query || {})
    });
};

exports.GetCard = async (req, res) => {
    return res.status(200).send(await ManagementService.getCard(req.params.tid));
};

exports.SaveCard = async (req, res) => {
    return res.status(200).send(await ManagementService.saveCard(req.body || {}, req.jwt.username));
};

exports.DeleteCard = async (req, res) => {
    return res.status(200).send(await ManagementService.deleteCard(req.params.tid, req.jwt.username));
};

exports.ListOffers = async (req, res) => {
  return res.status(200).send({
    offers: await ManagementService.listOffers(req.query || {}),
  });
};

exports.DeleteOffer = async (req, res) => {
  return res.status(200).send({
    success: true,
    offer: await ManagementService.deleteOffer(req.params.offerId, req.jwt.username),
  });
};
