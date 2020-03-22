'use strict';

const request = require('request');
const xml2js = require('xml2js');

class CalDAV {

    constructor(url, username, password, rejectUnauthorized = true) {

        this.url = url;
        this.username = username;
        this.password = password;
        this.basicAuth = 'Basic ' + Buffer.from(username + ':' + password).toString('base64');
        this.rejectUnauthorized = rejectUnauthorized;

        this.location = null;
        this.principal = null;
        this.calendarHome = null;
    }
    
    async getLocation() {

        const options = {
            url: this.url,
            method: 'HEAD',
            rejectUnauthorized: this.rejectUnauthorized
        };
    
        return new Promise((resolve, reject) => {
            request(options, (error, response) => {	
                if(!error && response.request.uri.href) {
                    resolve(response.request.uri.href);
                } else {
                    reject(this.errorMessage(response, error));
                }
            });
        });
    }

    async getCalendarHome() {

        if(!this.principal) {
            this.principal = await this.getUserPrincipal();
            console.debug(this.principal);
        }

        if(this.principal) {
            const options = {
                url: this.principal,
                method: 'PROPFIND',
                rejectUnauthorized: this.rejectUnauthorized,
                headers: {
                    'Authorization': this.basicAuth,
                    'Content-Type': 'application/xml;charset=utf-8',
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
                                reject(this.errorMessage(response, error));
                            } else {
                                
                                let calendarHome = this.normalize(result).multistatus.response[0].propstat[0].prop[0]['calendar-home-set'][0].href[0];
                                
                                if(calendarHome.startsWith('http')) {
                                    resolve(calendarHome);
                                } else {
                                    
                                    const protocol = this.principal.split('//')[0];
                                    const server = this.principal.split('//')[1].split('/')[0];
                                    
                                    if(!calendarHome.startsWith('/')) {
                                        calendarHome = '/' + calendarHome;
                                    }
                                    
                                    resolve(protocol + '//' + server + calendarHome);
                                }
                            }
                        });

                    } else {
                        reject(this.errorMessage(response, error));
                    }
                });
            });
        } else {
            throw 'No user principal defined.';
        }
    }

    async getCalendarList() {

        if(!this.calendarHome) {
            this.calendarHome = await this.getCalendarHome();
            console.debug(this.calendarHome);
        }

        if(this.calendarHome) {
            const options = {
                url: this.calendarHome,
                method: 'PROPFIND',
                rejectUnauthorized: this.rejectUnauthorized,
                headers: {
                    'Authorization': this.basicAuth,
                    'Content-Type': 'application/xml;charset=utf-8',
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
                    
                    if(!error && response.statusCode >= 200 && response.statusCode < 300) {

                        console.debug('RAW XML - Calendar list');
                        console.debug(body);

                        const parser = new xml2js.Parser();
                        
                        parser.parseString(body, (error, result) => {
                            if(error) {
                                reject(this.errorMessage(response, error));
                            } else {                        
                                resolve(this.normalizeCalendarList(this.normalize(result).multistatus.response));
                            }
                        });

                    } else {
                        reject(this.errorMessage(response, error));
                    }
                });
            });
        } else {
            throw 'No calendar home defined.';
        }
    }

    async getEvents(calendarUrl, rangeStart, rangeEnd) {
        
        let range = '';
    
        if(rangeStart && rangeEnd) {
            range = `<c:time-range start="${rangeStart}" end="${rangeEnd}"></c:time-range>`;
        } else if(rangeStart) {
            range = `<c:time-range start="${rangeStart.year}"></c:time-range>`;
        }
        
        const options = {
            url: calendarUrl,
            method: 'REPORT',
            rejectUnauthorized: this.rejectUnauthorized,
            headers: {
                'Authorization': this.basicAuth,
                'Content-Type': 'application/xml;charset=utf-8',
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
                            <c:comp-filter name="VEVENT">
                                ${range}
                            </c:comp-filter>
                        </c:comp-filter>
                    </c:filter>
                </c:calendar-query>`
        };
    
        return new Promise((resolve, reject) => {
    
            request(options, (error, response, body) => {
    
                if(!error && (response.statusCode == 200 || response.statusCode == 207)) {
    
                    console.debug('RAW XML - Events');
                    console.debug(body);

                    const parser = new xml2js.Parser();
    
                    parser.parseString(body, (error, result) => {
                        if(error) {
                            reject(this.errorMessage(response, error));
                        } else {
                            resolve(this.normalize(result).multistatus.response);
                        }
                    });
                } else {
                    reject(this.errorMessage(response, error));
                }
            });
        });
    }

    async getUserPrincipal() {

        if(!this.location) {
            this.location = await this.getLocation();
            console.debug(this.location);
        }

        if(this.location) {
            const options = {
                url: this.location,
                method: 'PROPFIND',
                rejectUnauthorized: this.rejectUnauthorized,
                headers: {
                    'Authorization': this.basicAuth,
                    'Content-Type': 'application/xml;charset=utf-8',
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
                        
                        parser.parseString(body, (error, result) => {
                            
                            if(error) {
                                reject(this.errorMessage(response, error));
                            } else {
                                
                                let principal = this.normalize(result).multistatus.response[0].propstat[0].prop[0]['current-user-principal'][0].href[0];
                                
                                if(principal.startsWith('http')) {
                                    resolve(principal);
                                } else {
                                
                                    const protocol = this.location.split('//')[0];
                                    const server = this.location.split('//')[1].split('/')[0];
                                
                                    if(!principal.startsWith('/')) {
                                        principal = '/' + principal;
                                    }
                                    
                                    resolve(protocol + '//' + server + principal);
                                }
                            }
                        });
                    } else {
                        reject(this.errorMessage(response, error));
                    }
                });
            });
        } else {
            throw 'No location response from the server.';
        }
    }

    normalize(object) {
	
        let result;
    
        if(object instanceof Array) {
            
            result = [];
            
            for(let i = 0; i < object.length; i++) {
                
                const entry = object[i];
                
                result[i] = (entry instanceof Array || entry instanceof Object) ? this.normalize(entry) : entry;
            }
        } else if(object instanceof Object) {
            
            result = {};
            
            for(const key in object) {
                
                const entry = object[key];
                const keyArray = key.split(':');
                const newKey = (keyArray.length > 1) ? keyArray[1] : keyArray[0];
                
                result[newKey] = (entry instanceof Array || entry instanceof Object) ? this.normalize(entry) : entry;	
            }	
        }
    
        return result;
    }

    normalizeCalendarList(object) {
	
        const result = [];
    
        for(const key in object) {
    
            const entry = object[key];
    
            let path = (entry.href[0]) ? entry.href[0] : '';
    
            if(!path.startsWith('http')) {
            
                const protocol = this.location.split('//')[0];
                const server = this.location.split('//')[1].split('/')[0];
            
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
                const resultEntry = {
                    path: path,
                    name: name,
                    color: color,
                    ctag: ctag
                };

                result.push(resultEntry);
            }
        }
    
        return result;
    }

    errorMessage(response, error) {
        return `[${response && response.statusCode ? response.statusCode : null}] ${error}`;
    }
}

module.exports = CalDAV;