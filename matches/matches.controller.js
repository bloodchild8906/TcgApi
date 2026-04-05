const MatchModel = require('./matches.model');
const MatchmakingService = require('../matchmaking/matchmaking.service');
const MatchFlowService = require('./match-flow.service');
const MatchTool = require('./matches.tool');
const UserModel = require('../users/users.model');
const DateTool = require('../tools/date.tool');
require('../config');

exports.addMatch = async(req, res) => {

    const tid = req.body.tid;
    const players = req.body.players;
    const ranked = req.body.ranked === true;
    const mode = req.body.mode || "";

    if (!tid || !players || !Array.isArray(players) || players.length !== 2)
        return res.status(400).send({ error: "Invalid parameters" });

    if (mode && typeof mode !== "string")
        return res.status(400).send({ error: "Invalid parameters" });

    const fmatch = await MatchModel.get(tid);
    if(fmatch)
        return res.status(400).send({error:"Match already exists: " + tid});

    const player0 = await UserModel.getByUsername(players[0]);
    const player1 = await UserModel.getByUsername(players[1]);
    if(!player0 || !player1)
        return res.status(404).send({error:"Can't find players"});

    if(player0.id === player1.id)
        return res.status(400).send({error:"Can't play against yourself"});

    let match = {};
    match.tid = tid;
    match.players = players;
    match.winner = "";
    match.completed = false;
    match.ranked = ranked;
    match.mode = mode;
    match.flow_tid = typeof req.body.flow_tid === 'string' ? req.body.flow_tid.trim() : '';
    match.start = Date.now();
    match.end = Date.now();
    match.udata = [];
    match.udata.push(MatchTool.GetPlayerData(player0));
    match.udata.push(MatchTool.GetPlayerData(player1));

    let curr_match = await MatchModel.create(match);
    if(!curr_match)
        return res.status(500).send({error:"Unable to create match"});

    if (match.flow_tid) {
        curr_match = await MatchFlowService.startMatchFlow(curr_match, req.jwt.username || 'system');
    }

    res.status(200).send(curr_match);

};

exports.completeMatch = async(req, res) => {

    const matchId = req.body.tid;
    const winner = req.body.winner;
    const winnerSideInput = typeof req.body.winner_side === 'string' ? req.body.winner_side.trim().toLowerCase() : '';

    if (!matchId || (!winner && !winnerSideInput))
        return res.status(400).send({ error: "Invalid parameters" });
	
	if(typeof matchId != "string" || (winner !== undefined && typeof winner != "string"))
        return res.status(400).send({error: "Invalid parameters" });

    const match = await MatchModel.get(matchId);
    if(!match)
        return res.status(404).send({error: "Match not found"});

    if(match.completed)
        return res.status(400).send({error: "Match already completed"});

    const resolveWinnerSide = () => {
        if (winnerSideInput === 'solo' || winnerSideInput === 'opponent') {
            return winnerSideInput;
        }

        if (!winner) {
            return '';
        }

        const participant = (Array.isArray(match.udata) ? match.udata : []).find((entry) => entry.username === winner);
        const teamKey = String(participant?.team_key || participant?.requested_side || '').trim().toLowerCase();
        return teamKey === 'solo' || teamKey === 'opponent' ? teamKey : '';
    };

    const winnerSide = resolveWinnerSide();

    match.end = Date.now();
    match.winner = winner || '';
    match.winner_side = winnerSide;
    match.completed = true;
    
    //Add Rewards
    if(match.ranked && Array.isArray(match.players) && match.players.length === 2 && !match.matchmaking)
    {
        const player0 = await UserModel.getByUsername(match.players[0]);
        const player1 = await UserModel.getByUsername(match.players[1]);
        if(!player0 || !player1)
            return res.status(404).send({error:"Can't find players"});
        match.udata[0].reward = await MatchTool.GainMatchReward(player0, player1, winner);
        match.udata[1].reward = await MatchTool.GainMatchReward(player1, player0, winner);
        match.markModified('udata');
    }

    //Save match
    const uMatch = await match.save();

    let finalMatch = uMatch;

    if (uMatch.matchmaking || winnerSide) {
        finalMatch = await MatchmakingService.applyMatchOutcome(uMatch, {
            actor: req.jwt.username || 'system',
            winnerSide,
            winnerUsername: winner,
        });
    }

    if (finalMatch.flow_tid) {
        finalMatch = await MatchFlowService.completeMatchFlow(finalMatch, req.jwt.username || 'system');
    }

    //Return
    res.status(200).send(finalMatch);
};

exports.advancePhase = async (req, res) => {
    const matchId = req.params.tid;
    const targetNodeId = req.body?.to;

    if (!matchId || typeof matchId !== 'string' || !targetNodeId || typeof targetNodeId !== 'string')
        return res.status(400).send({ error: "Invalid parameters" });

    const result = await MatchFlowService.advanceMatchFlow(matchId, targetNodeId, req.jwt.username || 'system');
    return res.status(200).send(result);
};

exports.getAll = async(req, res) => {

    const start = req.query.start ? DateTool.tagToDate(req.query.start) : null;
    const end = req.query.end ? DateTool.tagToDate(req.query.end) : null;

    const matches = await MatchModel.list(start, end);
    if(!matches)
        return res.status(400).send({error: "Invalid Parameters"});

    return res.status(200).send(matches);
};

exports.getByTid = async(req, res) => {

    const match = await MatchModel.get(req.params.tid);
    if(!match)
        return res.status(404).send({error: "Match not found " + req.params.tid});
    
    return res.status(200).send(match);
};

exports.getMatchCount = async(req, res) => {

    const count = await MatchModel.count();
    if(count === undefined)
        return res.status(500).send({error: "Error getting match count"});
    
    return res.status(200).send({count: count});
};

exports.getMatchCount = async(req, res) => {

    const count = await MatchModel.count();
    if(count === undefined)
        return res.status(500).send({error: "Error getting match count"});
    
    return res.status(200).send({count: count});
};

exports.getLatest = async(req, res) => {

    const match = await MatchModel.getLast(req.params.userId);
    if(!match)
        return res.status(404).send({error: "Match not found for user " + req.params.userId});
    
    return res.status(200).send(match);
};
