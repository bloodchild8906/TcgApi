const http = require('http');
const url = require('url');
const https = require('https');

const WebTool = {};

// -------- Http -----------------
WebTool.get = function(path, callback) {

    const hostname = url.parse(path).hostname;
    const pathname = url.parse(path).pathname;

    const post_options = {
        host: hostname,
        port: '80',
        path: pathname,
        method: 'GET'
    };

    const request = http.request(post_options, function (res) {
        res.setEncoding('utf8');
        let oData = "";
        res.on('data', function (chunk) {
            oData += chunk;
        });
        res.on('end', function () {
            callback(oData, res.statusCode);
        });
    });

    request.end();
};

WebTool.post = function(path, data, callback) {

    const post_data = JSON.stringify(data);
    const hostname = url.parse(path).hostname;
    const pathname = url.parse(path).pathname;

    const post_options = {
        host: hostname,
        port: '80',
        path: pathname,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': post_data.length
        }
    };

    const request = http.request(post_options, function (res) {
        res.setEncoding('utf8');
        let oData = "";
        res.on('data', function (chunk) {
            oData += chunk;
        });
        res.on('end', function () {
            callback(oData, res.statusCode);
        });
    });

    request.write(post_data);
  request.end();
};

WebTool.toObject = function(json)
{
  try{
      return JSON.parse(json);
  }
  catch{
    return {};
  }
}

WebTool.toJson = function(data)
{
  try{
      return JSON.stringify(data);
  }
  catch{
    return "";
  }
}

WebTool.GenerateUID = function(length, numberOnly)
{
    let result = '';
    let characters = 'abcdefghijklmnopqrstuvwxyz0123456789';
    if(numberOnly)
    characters       = '0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++ ) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

module.exports = WebTool;