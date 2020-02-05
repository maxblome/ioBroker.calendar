const request = require('request');
const xml2js = require('xml2js');

/**
 * @param {Array} array Array to be checked
 * @returns {Boolean}
 */
function isArray(array) {
    return (!!array) && (array.constructor === Array);
}

/**
 * @param {Object} object Object to be checked
 * @returns {Boolean}
 */
function isObject(object) {
    return (!!object) && (object.constructor === Object);
}

/**
 * @param object Object to be checked
 * @returns Returns the normalized object
 */
function normalize(object) {
	
    let result;

    if(isArray(object)) {
        
        result = [];
        
        for(let i = 0; i < object.length; i++) {
            
            const entry = object[i];
            
            result[i] = (isArray(entry) || isObject(entry)) ? normalize(entry) : entry;
        }
    } else if(isObject(object)) {
        
        result = {};
        
        for(let key in object) {
            
            const entry = object[key];
            const keyArray = key.split(':');
            const newKey = (keyArray.length > 1) ? keyArray[1] : keyArray[0];
            
            result[newKey] = (isArray(entry) || isObject(entry)) ? normalize(entry) : entry;	
        }	
    }

    return result;
}

/**
 * @param object Object to be normalized
 * @returns Returns the normalized object
 */
function normalizeCalendarList(href, object) {
	
    const result = [];

    for(const key in object) {

        const resultEntry = {};

        const entry = object[key];

        let path = (entry.href[0]) ? entry.href[0] : '';

        if(!path.startsWith('http')) {
        
            const protocol = href.split('//')[0];
            const server = href.split('//')[1].split('/')[0];
        
            if(!path.startsWith('/')) {
                path = '/' + path;
            }
            
            path = protocol + '//' + server + path;
        }

        let name = '';
        let color = '#000000';
        let ctag = '';

        for(const propstatKey in entry.propstat) {

            const prop = entry.propstat[propstatKey];

            if(prop.status[0].includes('200')) {

                for(const propKey in prop.prop) {

                    const propEntry = prop.prop[propKey];

                    for(const propEntryKey in propEntry) {

                        if(propEntryKey == 'displayname') {
                            if(Object.keys(propEntry[propEntryKey][0]).includes('_')) {
                                name = propEntry[propEntryKey][0]['_'];
                            } else {
                                name = propEntry[propEntryKey][0];
                            }
                        } else if(propEntryKey == 'calendar-color') {
                            if(Object.keys(propEntry[propEntryKey][0]).includes('_')) {
                                color = propEntry[propEntryKey][0]['_'];
                            } else {
                                color = propEntry[propEntryKey][0];
                            }
                        } else if(propEntryKey == 'getctag') {
                            if(Object.keys(propEntry[propEntryKey][0]).includes('_')) {
                                ctag = propEntry[propEntryKey][0]['_'];
                            } else {
                                ctag = propEntry[propEntryKey][0];
                            }
                        }
                    }
                }
            }
        }

        if(ctag && ctag != '') {
            resultEntry.path = path;
            resultEntry.name = name;
            resultEntry.color = color;
            resultEntry.ctag = ctag;

            result.push(resultEntry);
        }
    }

    return result;
}

/**
 * @param {string} host The host of the caldav server like https://caldav.example.com
 * @returns {Promise<String>} String
 */
async function getHref(host) {

    const options = {
        url: host,
        method: 'HEAD'
    };

    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {	
            if(!error && (response.statusCode == 200 || response.statusCode == 401)) {
                resolve(response.request.uri.href);
            } else {
                reject(`${response.statusCode} ${error}`);
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
 * @param {string} href The url of the calendar like https://caldav.example.com/user/home
 * @param {string} username Username
 * @param {string} password Password
 * @returns {Promise<Number>} Number
 */
async function getCtag(href, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const options = {
        url: href,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': 0,
            'Prefer': 'return-minimal'
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/">
                    <d:prop>
                        <d:displayname />
                        <cs:getctag />
                    </d:prop>
                </d:propfind>`
    };

    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
			
            if(!error && (response.statusCode == 200 || response.statusCode == 207)) {
				
                const parser = new xml2js.Parser();
                
                parser.parseString(body, (error, result) => {
					
                    if(error) {
                        reject(error);
                    } else {
						
                        const propstat = normalize(result).multistatus.response[0].propstat[0];
                        
                        for(let key in propstat) {
                            const prop = propstat[key];
                            
                            for(let propKey in prop) {
                                const propEntry = prop[propKey];
                                
                                for(let propEntryKey in propEntry) {
                                    
                                    if(propEntryKey.includes('getctag')) {
                                        
                                        if(Object.keys(propEntry[propEntryKey][0]).includes('_')) {
                                            resolve(propEntry[propEntryKey][0]['_']);
                                        } else {
                                            resolve(propEntry[propEntryKey][0]);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });

            } else {
                reject(error);
            }
        });
    });
}

/**
 * @param {string} href The href of the caldav server like https://caldav.example.com/user/
 * @param {string} username Username
 * @param {string} password Password
 * @returns {Promise<Object>} Object
 */
async function queryCalendarList(href, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const options = {
        url: href,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': 1
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:x1="http://apple.com/ns/ical/" xmlns:c="urn:ietf:params:xml:ns:xcaldavoneandone">
                    <d:prop>
                        <d:displayname />
                        <x1:calendar-color/>
						<c:calendar-color/>
                        <cs:getctag />
                    </d:prop>
                </d:propfind>`
    };

    return new Promise((resolve, reject) => {

        request(options, (error, response, body) => {
			
            if(!error && (response.statusCode == 200 || response.statusCode == 207)) {

                const parser = new xml2js.Parser();
                
                parser.parseString(body, (error, result) => {
					
                    if(error) {
                        reject(error);
                    } else {                        
                        resolve(normalizeCalendarList(href, normalize(result).multistatus.response));
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
 * @param {string} href The path to the calendar path
 * @param {string} username Username
 * @param {string} password Password
 * @returns {Promise<Object>} Object
 */
async function queryEvents(href, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');

    const options = {
        url: href,
        method: 'REPORT',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': 1,
            'Prefer': 'return-minimal'
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

                parser.parseString(body, (error, result) => {
                    
                    if(error) {
                        reject(error);
                    } else {
                        resolve(normalize(result));
                    }
                });

            } else {
                reject(error);
            }
        });
    });
}

/**
 * Get the calendar home path
 * @param {string} href The path to the calendar path
 * @param {string} username Username
 * @param {string} password Password
 * @returns {Promise<Object>} Object
 */
async function getCalendarHome(href, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
	
    const options = {
        url: href,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': 0
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
                    <d:prop>
                        <d:displayname />
                        <c:calendar-home-set />
                    </d:prop>
                </d:propfind>`
    };

    return new Promise((resolve, reject) => {
        request(options, (error, response, body) => {
			
            if(!error && (response.statusCode == 200 || response.statusCode == 207)) {

                const parser = new xml2js.Parser();
                
                parser.parseString(body, (error, result) => {
					
                    if(error) {
                        reject(error);
                    } else {
                        
                        let calendarHome = normalize(result).multistatus.response[0].propstat[0].prop[0]['calendar-home-set'][0].href[0];
                        
                        if(calendarHome.startsWith('http')) {
                            
                            resolve(calendarHome);
                            
                        } else {
                        
                            const protocol = href.split('//')[0];
                            const server = href.split('//')[1].split('/')[0];
                        
                            if(!calendarHome.startsWith('/')) {
                                calendarHome = '/' + calendarHome;
                            }
                            
                            resolve(protocol + '//' + server + calendarHome);
                        }
                    }
                });

            } else {
                reject(error);
            }
        });
    });
}

/**
 * Get the current user principal
 * @param {string} href The path to the calendar path
 * @param {string} username Username
 * @param {string} password Password
 * @returns {Promise<Object>} Object
 */
async function getUserPrincipal(href, username, password) {

    const auth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
	
    const options = {
        url: href ,
        method: 'PROPFIND',
        headers: {
            'Authorization' : auth,
            'Content-Type' : 'application/xml;charset=utf-8',
            'Depth': 0
        },
        body: `<?xml version="1.0" encoding="UTF-8"?>
                <d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
                    <d:prop>
						<d:current-user-principal />
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
						
                        let principal = normalize(result).multistatus.response[0].propstat[0].prop[0]['current-user-principal'][0].href[0];
                        
                        if(principal.startsWith('http')) {
                            
                            resolve(principal);
                            
                        } else {
                        
                            const protocol = href.split('//')[0];
                            const server = href.split('//')[1].split('/')[0];
                        
                            if(!principal.startsWith('/')) {
                                principal = '/' + principal;
                            }
                            
                            resolve(protocol + '//' + server + principal);
                        }
                    }
                });

            } else {
                reject(error);
            }
        });
    });
}

module.exports = {
    getHref,
    queryCalendarList,
    queryEvents,
    getCalendarHome,
    getCtag,
    getUserPrincipal
};