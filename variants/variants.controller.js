const VariantModel = require("./variants.model");

exports.AddVariant = async(req, res) => 
{
    const tid = req.body.tid;
    const cost_factor = req.body.cost_factor || 1;
    const is_default = req.body.is_default || false;

    if(!tid || typeof tid !== "string")
        return res.status(400).send({error: "Invalid parameters"});

    if(!Number.isInteger(cost_factor))
        return res.status(400).send({ error: "Invalid parameters" });

    if(typeof is_default !== "boolean")
        return res.status(400).send({error: "Invalid parameters"});

    const data = {
        tid: tid,
        cost_factor: cost_factor,
        is_default: is_default,
    };

    //Update or create
    let variant = await VariantModel.get(tid);
    if(variant)
        variant = await VariantModel.update(variant, data);
    else
        variant = await VariantModel.create(data);
    
    if(!variant)
        return res.status(500).send({error: "Error updating variant"});
    
    return res.status(200).send(data);
};

exports.DeleteVariant = async(req, res) => 
{
    await VariantModel.remove(req.params.tid);
    return res.status(204).end();
};

exports.DeleteAll = async(req, res) => 
{
    await VariantModel.removeAll();
    return res.status(204).end();
};

exports.GetVariant = async(req, res) => 
{
    const tid = req.params.tid;

    if(!tid)
        return res.status(400).send({error: "Invalid parameters"});

    const variant = await VariantModel.get(tid);
    if(!variant)
        return res.status(404).send({error: "Variant not found: " + tid});

    return res.status(200).send(variant.toObj());
};

exports.GetAll = async(req, res) => 
{
    const variants = await VariantModel.getAll();

    for(let i=0; i<variants.length; i++){
        variants[i] = variants[i].toObj();
    }

    return res.status(200).send(variants);
};
