const { google } = require('googleapis');
const utils = require('./utils');

const calendarScope = 'https://www.googleapis.com/auth/calendar';

class Google {
    constructor(clientId, clientSecret, fqdn, port) {

        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.fqdn = fqdn;
        this.port = port;

        this.oauth2 = this._loadAuthentication();
    }

    async loadAuthenticationTokens(code) {
        return new Promise((resolve, reject) => {
            this.oauth2.getToken(code, (error, tokens) => {
                if(error) {
                    reject(error);
                } else {
                    // @ts-ignore
                    this.oauth2.setCredentials(tokens);
                    resolve(tokens);
                }
            });
        });
    }

    _loadAuthentication() {
        if(this.clientId && this.clientSecret)  {
            return new google.auth.OAuth2(this.clientId, this.clientSecret, 'urn:ietf:wg:oauth:2.0:oob');
        } else {
            throw 'Client id or client secret missing.';
        }
    }

    generateAuthUrl(state) {
        return this.oauth2.generateAuthUrl({
            scope: calendarScope,
            state: state,
            access_type: 'offline'
        });
    }

    getScope() {
        return calendarScope;
    }

    async getCalendarIds(accessToken = null, refreshToken = null) {

        return new Promise((resolve, reject) => {
    
            if(accessToken && refreshToken) {
                this.oauth2.setCredentials({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
            }

            const cal = google.calendar({
                version: 'v3',
                auth: this.oauth2
            });
    
            cal.calendarList.list((error, res) => {
                if(error) {
                    reject(error);
                } else if(res) {
    
                    const id = {};
    
                    const items = res.data.items;
        
                    if(items && items.length > 0) {
            
                        const calendars = [];
        
                        for(let i = 0; i < items.length; i++) {
                            
                            const calendar = {};
    
                            if(items[i].primary) {
                                id.account = items[i].id;
                            }
    
                            calendar.email = items[i].id;
                            calendar.id = Buffer.from((items[i].id || '')).toString('base64').replace(/[+/= ]/g, '').substring(0, 30);
                            calendar.summary = items[i].summaryOverride || items[i].summary;
                            calendar.color = items[i].backgroundColor || '#000000';
    
                            calendars.push(calendar);
                        }
        
                        id.calendars = calendars;
    
                        resolve(id);
    
                    } else reject('No calendar found.');
                }
            });
        });
    }

    async getCalendarEvents(email, accessToken, refreshToken, dayCount) {

        return new Promise((resolve, reject) => {
            
            if(accessToken && refreshToken) {
                
                this.oauth2.setCredentials({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
                
                const cal = google.calendar({
                    version: 'v3',
                    auth: this.oauth2
                });
                
                cal.events.list({
                    calendarId: email,
                    timeMin: utils.getDatetime(),
                    timeMax: utils.getDatetime(((parseInt(dayCount) > 0) ? parseInt(dayCount) : 7), 23, 59, 59),
                    singleEvents: true,
                    orderBy: 'startTime'
                }, (error, res) => {
                    if(error) {
                        reject(error);
                    } else if(res) {
                        
                        const list = [];
    
                        for(let i = 0; i < res.data.items.length; i++) {
                            list.push(utils.normalizeEvent(res.data.items[i].summary, res.data.items[i].description,
                                (res.data.items[i].start.date || res.data.items[i].start.dateTime), (res.data.items[i].end.date || res.data.items[i].end.dateTime)));
                        }
    
                        resolve(list);
                    }
                });
            } else {
                reject('No permission granted.');
            }
        });
    }
}

module.exports = Google;