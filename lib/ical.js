const fs = require('fs');
const request = require('request');

/**
 * @param {string} path Path to iCal file
 * @returns {Promise<string>} Object
 */
function readFile(path) {

    return new Promise((resolve, reject) => {
        fs.readFile(path, {encoding: 'utf-8'}, (error,data) => {
            if (!error) {
                resolve(data);
            } else {
                reject(error);
            }
        });
    });
}

/**
 * @param {string} url URL to iCal file
 * @returns {Promise<string>} Object
 */
function getFile(url) {
    return new Promise((resolve, reject) => {
        request(url, (error, response, body) => {
            if(!error && response.statusCode == 200) {
                resolve(body);
            } else {
                reject(error);
            }
        });
    });
}

module.exports = {
    readFile,
    getFile
};