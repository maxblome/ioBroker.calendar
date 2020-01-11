const request = require('request');
const xml2js = require('xml2js');

/**
 * Get the contact list.
 * @param {string} host The host of the Nexcloud server like https://nextcloud.example.com
 * @param {string} username Username of the Nextcloud account
 * @param {string} password Password of the Nextcloud account
 * @returns {Promise<Object>} Object
 */
async function queryCalendarList(host, username, password) {

    const path = '/remote.php/dav/calendars/' + username;
    const url = host + path;

    const auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');

    const options = {
        url: url,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
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

    return new Promise(function (resolve, reject) {

        request(options, (error, response, body) => {

            if(!error && (response.statusCode == 200 || response.statusCode == 207)) {

                const parser = new xml2js.Parser();
                
                parser.parseString(body, function (err, result) {
                    
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

    const auth = 'Basic ' + new Buffer(username + ':' + password).toString('base64');

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

    return new Promise(function (resolve, reject) {

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
    queryCalendarList,
    queryEvents
};