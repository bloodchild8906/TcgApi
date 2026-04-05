// MODELS / TOOLS
const Activity = require("./activity.model");

exports.GetAllActivities = async (req, res) => {
  
  const source = req.method === "GET" ? req.query : req.body;
  let activityRequest;
  if (source.type) {
    activityRequest = { type: source.type };
  } else if (source.username) {
    activityRequest = { username: source.username };
  }
  else {
    activityRequest = { };
  }

  const a = await Activity.Get(activityRequest);
  if (!a) return res.status(500).send({ error: "Failed!!" });

  let list = a;
  if (source.limit) {
    const limit = Number.parseInt(source.limit, 10);
    if (Number.isInteger(limit) && limit > 0) {
      list = list.slice(0, limit);
    }
  }

  list = list.map((entry) => entry.toObj());

  return res.status(200).send(list);
};

