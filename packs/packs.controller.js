const PackModel = require("./packs.model");

exports.AddPack = async(req, res) => 
{
    const tid = req.body.tid;
    const cards = req.body.cards || 1;
    const cost = req.body.cost || 1;
    const random = req.body.random || false;
    const rarities_1st = req.body.rarities_1st || [];
    const rarities = req.body.rarities || [];
    const variants = req.body.variants || [];

    if(!tid || typeof tid !== "string")
        return res.status(400).send({error: "Invalid parameters"});

    if(!Number.isInteger(cards) || !Number.isInteger(cost))
        return res.status(400).send({ error: "Invalid parameters" });

    if(typeof random !== "boolean")
        return res.status(400).send({error: "Invalid parameters"});

    if(!Array.isArray(rarities_1st) || !Array.isArray(rarities) || !Array.isArray(variants))
        return res.status(400).send({error: "Invalid parameters"});

    const data = {
        tid: tid,
        cards: cards,
        cost: cost,
        random: random,
        rarities_1st: rarities_1st,
        rarities: rarities,
        variants: variants,
    };

    //Update or create
    let pack = await PackModel.get(tid);
    if(pack)
        pack = await PackModel.update(pack, data);
    else
        pack = await PackModel.create(data);
    
    if(!pack)
        return res.status(500).send({error: "Error updating pack"});
    
    return res.status(200).send(pack.toObj());
};

exports.DeletePack = async(req, res) => 
{
    await PackModel.remove(req.params.tid);
    return res.status(204).end();
};

exports.DeleteAll = async(req, res) => 
{
    await PackModel.removeAll();
    return res.status(204).end();
};

exports.GetPack = async(req, res) => 
{
    const tid = req.params.tid;

    if(!tid)
        return res.status(400).send({error: "Invalid parameters"});

    const pack = await PackModel.get(tid);
    if(!pack)
        return res.status(404).send({error: "Pack not found: " + tid});

    return res.status(200).send(pack.toObj());
};

exports.GetAll = async(req, res) => 
{
    const packs = await PackModel.getAll();

    for(let i=0; i<packs.length; i++){
        packs[i] = packs[i].toObj();
    }

    return res.status(200).send(packs);
};
