const fs = require('fs');

exports.readFileArraySync = function(filename){

    const data = fs.readFileSync(filename, {encoding: "utf8"});
    return data.split('\r\n');
};

exports.readFileArray = function(filename, callback){

    fs.readFile(filename, {encoding: "utf8"}, function(data){
        const adata = data.split('\r\n');
        callback(adata);
    });
};
