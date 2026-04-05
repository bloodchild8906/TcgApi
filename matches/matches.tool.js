const UserTool = require('../users/users.tool');
const config = require('../config.js');


const MatchTool = {};


MatchTool.calculateELO = (player_elo, opponent_elo, progress, won, lost) =>
{
    const p_elo = player_elo || 1000;
    const o_elo = opponent_elo || 1000;

    const p_elo_log = Math.pow(10.0, p_elo / 400.0);
    const o_elo_log = Math.pow(10.0, o_elo / 400.0);
    const p_expected = p_elo_log / (p_elo_log + o_elo_log);
    const p_score = won ? 1.0 : (lost ? 0.0 : 0.5);

    progress = Math.min(Math.max(progress, 0.0), 1.0);
    const elo_k = progress * config.elo_k + (1.0 - progress) * config.elo_ini_k;
    return Math.round(p_elo + elo_k * (p_score - p_expected));
}

MatchTool.GetPlayerData = (player) => 
{
    const data = {};
    data.username = player.username;
    data.elo = player.elo;
    data.reward = {};
    return data;
}

MatchTool.GainMatchReward = async(player, opponent, winner_username) => {

    const player_elo = player.elo;
    const opponent_elo = opponent.elo;
    const won = winner_username === player.username;
    const lost = winner_username === opponent.username;

    //Rewards
    const xp = won ? config.xp_victory : config.xp_defeat;
    const coins = won ? config.coins_victory : config.coins_defeat;

    player.xp += xp;
    player.coins += coins;

    //Match winrate
    player.matches +=1;

    if(won)
        player.victories += 1;
    else if (lost)
        player.defeats += 1;
    
    //Calculate elo
    const match_count = player.matches || 0;
    const match_progress = Math.min(Math.max(match_count / config.elo_ini_match, 0.0), 1.0);
    player.elo = MatchTool.calculateELO(player_elo, opponent_elo, match_progress, won, lost);
    player.save();

    return {
        elo: player.elo,
        xp: xp,
        coins: coins
    };
};

module.exports = MatchTool;