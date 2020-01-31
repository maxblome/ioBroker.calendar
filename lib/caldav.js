const request = require('request');
const xml2js = require('xml2js');

/**
 * @param {string} host The host of the caldav server like https://caldav.example.com
 * @returns {Promise<String>} String
 */
async function getHref(host) {

    const options = {
        url: host
    };

    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if(!error) {
                resolve(response.request.uri.href);
            } else {
                reject(error);
            }
        });
    });
}

/**
 * @param {string} href The href of the caldav server like https://caldav.example.com/user/
 * @param {string} username Username of the caldav server
 * @param {string} password Password of the caldav server
 * @returns {Promise<Number>} Number
 */
async function getDepth(href, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const options = {
        url: href + username,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': 1
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:x1="http://apple.com/ns/ical/">
                    <d:prop>
                        <d:displayname />
                        <x1:calendar-color/>
                        <cs:getctag />
                    </d:prop>
                </d:propfind>`
    };

    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
            if(!error) {
                if(response.statusCode == 200 || response.statusCode == 207) {
                    resolve(1);
                } else {
                    
                    options.headers.Depth = 0;
                    
                    request(options, (error, response, body) => {
                        if(response.statusCode == 200 || response.statusCode == 207) {
                            resolve(0);
                        } else {
                            reject((error) ? error : 'An error occurred while querying the depth.');
                        }
                    });
                }
            } else {
                reject(error);
            }
        });
    });
}

/**
 * @param {string} href The href of the caldav server like https://caldav.example.com/user/
 * @param {number} depth Depth of the caldav server
 * @param {string} username Username of the caldav server
 * @param {string} password Password of the caldav server
 * @returns {Promise<Object>} Object
 */
async function queryCalendarList(href, depth, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const options = {
        url: href + username,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': depth
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:x1="http://apple.com/ns/ical/">
                    <d:prop>
                        <d:displayname />
                        <x1:calendar-color/>
                        <cs:getctag />
                    </d:prop>
                </d:propfind>`
    };

    return new Promise((resolve, reject) => {

        request(options, (error, response, body) => {

            if(!error && (response.statusCode == 200 || response.statusCode == 207)) {

                const parser = new xml2js.Parser();
                
                parser.parseString(body, (err, result) => {
                    
                    if(err) {
                        reject(err);
                    } else {
                        
                        const response = JSON.parse(JSON.stringify(result).replace(/d:/g, '').replace(/xmlns:/g, '').replace(/cs:/g, '').replace(/x1:/g, '')).multistatus.response;
                        
                        resolve(response);
                    }
                });

            } else {
                reject(error);
            }
        });
    });
}

/**
 * Get the event list.
 * @param {string} host The host of the Nexcloud server like https://nextcloud.example.com
 * @param {string} path The path to the calendar path
 * @param {string} username Username of the Nextcloud account
 * @param {string} password Password of the Nextcloud account
 * @returns {Promise<Object>} Object
 */
async function queryEvents(host, path, username, password) {
    
    const url = host + path;

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const options = {
        url: url,
        method: 'REPORT',
        headers: {
            'Authorization' : auth,
            'Depth': 1
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
                    <d:prop>
                        <d:getetag />
                        <c:calendar-data />
                    </d:prop>
                    <c:filter>
                        <c:comp-filter name="VCALENDAR">
                        </c:comp-filter>
                    </c:filter>
                </c:calendar-query>`
    };

    return new Promise((resolve, reject) => {

        request(options, (error, response, body) => {
            if (!error && (response.statusCode == 200 || response.statusCode == 207)) {

                const parser = new xml2js.Parser();

                parser.parseString(body, function (err, result) {
                    
                    if(err) {
                        reject(err);
                    } else {

                        const response = JSON.parse(JSON.stringify(result).replace(/d:/g, '').replace(/xmlns:/g, '').replace(/cal:/g, '').replace(/\\"/g, '')).multistatus.response;
                        
                        resolve(response);
                    }
                });

            } else {
                reject(error);
            }
        });
    });
}

module.exports = {
    getDepth,
    getHref,
    queryCalendarList,
    queryEvents
};