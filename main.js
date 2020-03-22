'use strict';

/*
 * Created with @iobroker/create-adapter v1.18.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const express = require('express');
const http = require('http');

const googleAuth = require('./lib/google');
const ical = require('./lib/ical');
const caldav = require('./lib/caldav');
const util = require('./lib/utils');

class Calendar extends utils.Adapter {

    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'calendar',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {

        console.debug = (message) => {
            this.log.debug(message);
        };

        if(!String.prototype.startsWith) {
            String.prototype.startsWith = function(searchString, position) {
                position = position || 0;
                return this.indexOf(searchString, position) === position;
            };
        }
        
        if(this.config.googleActive) {
            this.google = new googleAuth(this.config.googleClientID, this.config.googleClientSecret, this.config.fqdn, this.config.port);
        }
        
        if(this.hasCalendarWithoutGrantPermission()) {
            this.server = this.initServer();
        }
        
        try {
            this.systemConfig = await this.getForeignObjectAsync('system.config');
        } catch(error) {
            this.log.error(error);
        }

        for(const i in this.config.caldav) {

            if(this.systemConfig && this.systemConfig.native && this.systemConfig.native.secret) {
                this.config.caldav[i].password = util.decrypt(this.systemConfig.native.secret, this.config.caldav[i].password);
            } else {
                this.config.caldav[i].password = util.decrypt('Zgfr56gFe87jJOM', this.config.caldav[i].password);
            }
            
            const calendar = this.config.caldav[i];

            if(calendar.active && !calendar.listIsLoaded && calendar.username != '' &&
                calendar.password != '' && calendar.hostname.startsWith('http')) {

                let ids;

                try {
                    ids = await this.getCaldavCalendarIds(calendar);
                } catch(err) {
                    this.log.error(err);
                }
                
                if(ids) {
                    this.updateConfiguration({
                        caldav: this.handleCaldavCalendarIds(i, ids)
                    });
                }
            } else if(calendar.active && !calendar.listIsLoaded && (!calendar.hostname.startsWith('http') ||
                calendar.hostname.startsWith('http') && calendar.username == '' && calendar.password == '')) {
            
                let id = Buffer.from((calendar.hostname || '')).toString('base64').replace(/[+/= ]/g, '');
                id = id.substring(id.length - 31, id.length - 1);
    
                this.config.caldav[i].active = true;
                this.config.caldav[i].path = '';
                this.config.caldav[i].name = calendar.name;
                this.config.caldav[i].id =  id;
                this.config.caldav[i].ctag = calendar.ctag || '';
                this.config.caldav[i].color = calendar.color|| '#000000';
                this.config.caldav[i].listIsLoaded = true;

                this.updateConfiguration({
                    caldav: this.config.caldav
                });
            }
        }

        const calendars = [
            ...this.config.google,
            ...this.config.caldav
        ];

        for(const i in calendars) {

            const calendar = calendars[i];
            
            if((this.config.caldavActive && calendar.active && calendar.username != '' && calendar.hostname != '' && calendar.password != ''
                && calendar.id != '' && calendar.path != '' && (calendar.hostname) ? calendar.hostname.startsWith('http') : false) ||
                (this.config.caldavActive && calendar.active && calendar.hostname != '' && calendar.id != '' && (calendar.hostname) ? (!calendar.hostname.startsWith('http') ||
                calendar.hostname.startsWith('http') && calendar.username == '' && calendar.password == '') : false) ||
                (this.config.googleActive && calendar.active && calendar.accessToken && calendar.refreshToken && calendar.id != '')) {
                this.addDevice(calendar.id, calendar.name);
                this.addState(`${calendar.id}.account`, 'E-Mail', 'string', 'calendar.account', calendar.username);
                this.addState(`${calendar.id}.name`, 'Calendar name', 'string', 'calendar.name', calendar.name);
                this.addState(`${calendar.id}.color`, 'Calendar color', 'string', 'calendar.color', calendar.color);
            } else {
                if(calendar.id != '') {
                    this.removeDevice(calendar.id);
                }
            }
        }

        const googleEnabled = this.config.googleActive && this.google;
        const caldavEnabled = this.config.caldavActive;

        if(googleEnabled || caldavEnabled) {
            await this.startCalendarSchedule(googleEnabled, caldavEnabled);
            this.schedule = setInterval(() => this.startCalendarSchedule(googleEnabled, caldavEnabled), 10 * 60000);
            this.log.debug('Schedule started');
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if(this.schedule) {
                clearInterval(this.schedule);
                this.log.debug('Schedule stopped');
            }

            if(this.server) {
                this.server.server.close();
                this.log.debug('Server stopped');
            }

            callback();
        } catch (e) {
            callback();
        }
    }

    updateConfiguration(newConfig) {

        // Create the config object
        const config = {
            ...this.config,
            ...newConfig,
        };

        for(const i in config.caldav) {
            config.caldav[i].password = util.encrypt(this.systemConfig.native.secret, config.caldav[i].password);
        }

        this.updateConfig(config);
    }

    async startCalendarSchedule(googleEnabled, caldavEnabled) {

        const google = this.config.google;
        const caldav = this.config.caldav;

        if(googleEnabled) {
            for(const i in google) {

                const calendar = google[i];
                
                if(calendar.active) {
                    try {
                        this.log.debug(`Read events of '${calendar.name}'`);

                        const events = await this.google.getCalendarEvents(calendar.email, calendar.accessToken, calendar.refreshToken, calendar.days);
                        
                        this.log.info(`Updated calendar "${calendar.name}"`);
        
                        this.handleCalendarEvents(calendar, events);
                    } catch(error) {
                        this.log.warn(`No permission granted for calendar "${calendar.name}". Please visit http://${this.config.fqdn}:${this.config.port}/google/login/${i}`);
                        this.log.error(error);
                    }
                }
            }
        }

        if(caldavEnabled) {
            for(const i in caldav) {

                if(caldav[i].active) {
        
                    try {
                        const events = await this.getCaldavCalendarEvents(caldav[i]);
                        
                        this.handleCalendarEvents(caldav[i], events);
                    } catch(error) {
                        this.log.error('ERROR ' + error);
                    }
                }
            }
        }
    }

    hasCalendarWithoutGrantPermission() {

        if(this.config && this.config.googleActive) {
    
            const google = this.config.google;
    
            for(const i in google) {
                if(google[i].active) {
                    if(!google[i].accessToken || google[i].accessToken == '' ||
                        !google[i].refreshToken || google[i].refreshToken == '') {
                        return true;
                    }
                }
            }
        }
    
        return false;
    }

    async getCaldavCalendarIds(calendar) {

        let calendarIds;
        
        try {
            
            const cal = new caldav(calendar.hostname, calendar.username, calendar.password, !calendar.ignoreCertificateErrors);
            
            calendarIds = await cal.getCalendarList();
            
            this.log.debug(`CALENDARS: ${JSON.stringify(calendarIds)}`);
            
        } catch(error) {
            this.log.error(error);
        }
    
        return calendarIds;
    }

    handleCaldavCalendarIds(index, ids) {

        let firstIsSet = false;
    
        const caldav = this.config.caldav.slice();
    
        for(const i in ids) {
    
            const calendar = ids[i];
    
            if(!firstIsSet) {
                
                let id = Buffer.from((calendar.path || '')).toString('base64').replace(/[+/= ]/g, '');
                id = id.substring(id.length - 31, id.length - 1);
                
                this.log.info(`Set calendar name "${index}": Old name => "${caldav[index].name}" New name "${calendar.name}"`);
                
                caldav[index].active = true;
                caldav[index].path = calendar.path;
                caldav[index].name = calendar.name;
                caldav[index].id =  id;
                caldav[index].ctag = calendar.ctag || '';
                caldav[index].color = calendar.color|| '#000000';
                caldav[index].listIsLoaded = true;
    
                firstIsSet = true;
                
            } else {
                
                this.log.info(`Found calendar in account "${caldav[index].username}": Calendar "${calendar.name}"`);
                this.log.info(`The calendar "${calendar.name}" was added. You can activate the calendar in the config.`);
                
                let id = Buffer.from((calendar.path || '')).toString('base64').replace(/[+/= ]/g, '');
                id = id.substring(id.length - 31, id.length - 1);
                
                const configCalendar = {
                    active: false,
                    name: calendar.name,
                    id: id,
                    hostname: caldav[index].hostname,
                    username: caldav[index].username,
                    password: caldav[index].password,
                    ctag: calendar.ctag || '',
                    days: caldav[index].days,
                    color: calendar.color || '#000000',
                    path: calendar.path,
                    listIsLoaded: true,
                    ignoreCertificateErrors: caldav[index].ignoreCertificateErrors
                };
                
                caldav.push(configCalendar);
            }
        }
        
        return caldav;
    }

    async getCaldavCalendarEvents(calendar) {

        let events;
        const list = [];
    
        if(this.config.caldavActive && calendar.active && calendar.username != '' &&
            calendar.hostname != '' && calendar.password != '' && calendar.id != '' && calendar.path != '' && calendar.hostname.startsWith('http')) {
            
            this.log.debug(`Read events of '${calendar.name}'`);

            try {

                const cal = new caldav(calendar.hostname, calendar.username, calendar.password, !calendar.ignoreCertificateErrors);

                events = await cal.getEvents(calendar.path, util.getCalDAVDatetime(), util.getCalDAVDatetime(calendar.days));
                
            } catch(error) {
                this.log.error(error);
                return;
            }
    
            for(const i in events) {
                
                let calendar;
    
                if(Object.keys(events[i].propstat[0].prop[0]['calendar-data'][0]).includes('_')) {
                    calendar = ical.parse(events[i].propstat[0].prop[0]['calendar-data'][0]['_']);
                } else {
                    calendar = ical.parse(events[i].propstat[0].prop[0]['calendar-data'][0]);
                }
    
                this.log.debug('PARSED ICAL');
                this.log.debug(JSON.stringify(calendar));
                
                if(calendar.events) {
                    for(const j in calendar.events) {

                        const event = calendar.events[j];

                        list.push(util.normalizeEvent(event.summary, event.description, event.dtstart.val, (event.dtend ? event.dtend.val : event.duration)));
                    }
                }
            }
    
            this.log.info(`Updated calendar "${calendar.name}"`);
        } else if(this.config.caldavActive && calendar.active && calendar.hostname != '' && calendar.id != '') {

            try {
                this.log.debug(`Read events of '${calendar.name}'`);
                events = calendar.hostname.startsWith('http') ? await ical.getFile(calendar.hostname) : await ical.readFile(calendar.hostname);
    
                const parsedEvents = ical.parse(events);
                
                this.log.debug('PARSED ICAL');
                this.log.debug(JSON.stringify(parsedEvents));
    
                if(parsedEvents.events) {
                    for(const i in parsedEvents.events) {
                        list.push(util.normalizeEvent(parsedEvents.events[i].summary, parsedEvents.events[i].description,
                            parsedEvents.events[i].dtstart.val, parsedEvents.events[i].dtend.val));
                    }
                }
            } catch(error) {
                this.log.error(error);
            }
    
            this.log.info(`Updated calendar "${calendar.name}"`);
        }
    
        return list;
    }

    handleCalendarIds(index, ids, tokens) {

        const google = this.config.google.slice();
    
        this.log.info(`Set calendar name "${index}": Old name => "${google[index].name}" New name "${ids.calendars[0].summary}"`);
        
        google[index].active = true;
        google[index].account = ids.account;
        google[index].name = ids.calendars[0].summary;
        google[index].id = ids.calendars[0].id;
        google[index].email = ids.calendars[0].email;
        google[index].accessToken = tokens.access_token;
        google[index].refreshToken = tokens.refresh_token;
        google[index].color = ids.calendars[0].color;
    
        for(const i in ids.calendars) {
            if(i != '0') {
                const calendar = ids.calendars[i];
                const configCalendar = {
                    active: false,
                    account: ids.account,
                    name: `${ids.calendars[0].summary} ${calendar.summary}`,
                    id: calendar.id,
                    email: calendar.email,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                    days: google[index].days,
                    color: calendar.color,
                    ctag: ''
                };
                
                this.log.info(`Found calendar in account "${ids.account}": Calendar "${calendar.summary}"`);
                this.log.info(`The calendar "${calendar.summary}" was added. You can activate the calendar in the config.`);
        
                google.push(configCalendar);
            }
        }
    
        return google;
    }

    async handleCalendarEvents(calendar, events) {

        if(events) {
    
            const dayCount = {};
    
            const dayEvents = {};
    
            for(let i = 0; i <= ((calendar.days > 0) ? calendar.days : 7); i++) {
                dayEvents[i] = [];
            }
            
            for(const i in events) {
    
                for(let j = 0; j <= ((calendar.days > 0) ? calendar.days : 7); j++) {
    
                    if(util.sameDate(util.getDatetime(j), events[i].startTime)) {
    
                        const dayObj = dayEvents[j] || [];
    
                        dayObj.push(events[i]);
                        
                        dayEvents[j] = dayObj;
    
                        dayCount[j] = dayCount[j] > 0 ? dayCount[j] + 1 : 1;
                    }
                }
            }
    
            for(const i in dayEvents) {
                this.addChannel(`${calendar.id}.${i}`, `Day ${i}`);
                this.addState(`${calendar.id}.${i}.events`, 'Events', 'string', 'calendar.events', JSON.stringify(dayEvents[i]));
                this.addState(`${calendar.id}.${i}.date`, 'Date', 'string', 'calendar.date', util.getDatetime(parseInt(i)).substring(0, 10));
                this.addState(`${calendar.id}.${i}.eventsNumber`, 'Number of events', 'number', 'calendar.events', dayCount[i] ? dayCount[i] : '0');
            }
    
            this.getChannels((error, channels) => {
                if(error) {
                    this.log.error(error);
                } else this.removeDeleted(channels, dayCount, calendar.id);
            });
        }
    }

    async addState(id, name, type, role, value = null) {
        try {
            const result = await this.setObjectNotExistsAsync(id, {
                type: 'state',
                common: {
                    name: name,
                    type: type,
                    role: role,
                    read: true,
                    write: false
                },
                native: {},
            });

            if(result) {
                this.log.debug('State added => ' + result.id);
            }

            this.setStateAsync(id, { val: (value || ''), ack: true });
        } catch(error) {
            this.log.error(error);
        }
    }

    async addChannel(id, name) {
        try {
            const result = await this.setObjectNotExistsAsync(id, {
                type: 'channel',
                common: {
                    name: name,
                },
                native: {},
            });
            
            if(result) {
                this.log.debug('Channel added => ' + result.id);
            }
        } catch(error) {
            this.log.error(error);
        }
    }

    async addDevice(id, name) {
        try {
            const result = await this.setObjectNotExistsAsync(id, {
                type: 'device',
                common: {
                    name: name,
                },
                native: {},
            });

            if(result) {
                this.log.debug('Device added => ' + result.id);
            }
        } catch(error) {
            this.log.error(error);
        }
    }

    /**
     * Remove deleted events.
     * @param {Object} oldList
     * @param {Object} newList
     * @param {string} calendarId
     */
    async removeDeleted(oldList, newList, calendarId) {

        if(oldList) {
            
            for(const i in oldList) {
                
                if(oldList[i]._id.split('.')[2] == calendarId && oldList[i]._id.split('.')[4]) {
                    
                    let event = false;

                    for(const j of newList.keys()) {
                        if(oldList[i]._id.split('.')[3] == j) {

                            for(let k = 0; k < newList.get(j); k++) {
                                if(oldList[i]._id.split('.')[4] == k) {

                                    event = true;
                                }
                            }
                        }
                    }

                    if(event == false) {                       
                        try {
                            await this.deleteObject(oldList[i]._id);  

                            this.log.debug(`Delete channel => ${oldList[i]._id}`);

                            const states = this.getStatesAsync(oldList[i]._id + '*');
                            
                            for(const id in states) {
                                await this.deleteObject(id);
                            }

                        } catch(error) {
                            this.log.error(error);
                        }
                    }
                }
            }
        }
    }

    async removeDevice(id) {

        if(!id.startsWith(this.namespace)) {
            id = this.namespace + '.' + id;
        }
    
        try {
            const states = await this.getStatesAsync(id + '*');
            
            for(const id in states) {
                await this.deleteObject(id);
            }
        
            const channels = await this.getChannelsOfAsync(id);
            
            for(const id in channels) {
                await this.deleteObject(channels[id]._id);
            }
            
            await this.deleteObject(id);
        } catch(error) {
            this.log.error(error);
        }
    }

    async deleteObject(id) {
        try {
            await this.delObjectAsync(id);
            this.log.debug(`Delete object => ${id}`);
        } catch(error) {
            if(error !== 'Not exists') {
                this.log.error(`[${id}] ${error}`);
            }
        }
    }

    initServer() {

        const server = {};
    
        if(this.config && this.config.port) {
    
            server.app = express();

            if(this.google) {
                server.app.get('/google/login/:id', (req, res) => {
    
                    const id = req.params.id;
                    
                    //Check if calendar id exists
                    if(id < this.config.google.length && id >= 0) {
    
                        const calendar = this.config.google[id];
    
                        //Check if a refresh token exists
                        if(!calendar.refreshToken) {
    
                            const url = this.google.generateAuthUrl(id);
    
                            res.redirect(url);
                        } else res.send(`The rights for calendar ${req.params.id} have already been granted.`); 
                    } else res.send(`Cannot find calendar ${req.params.id}.`);
                });
    
                server.app.get('/google/success', (req, res) => {
                    res.send('Done');
                });
    
                server.app.get('/google', async (req, res) => {
                    if(req.query) {
                        if(req.query.state) {
                            if(req.query.state < this.config.google.length && req.query.state >= 0) {
                                if(req.query.scope) {
    
                                    const scope = req.query.scope.split(' ');
                                    const index = req.query.state;
                                    let isRightScope = false;
                                    
                                    for(const i in scope) {
                                        if(scope[i] == this.google.getScope()) {
    
                                            isRightScope = true;
    
                                            break;
                                        }
                                    }
    
                                    if(isRightScope) {
    
                                        let tokens;
    
                                        try {
                                            tokens = await this.google.loadAuthenticationTokens(req.query.code);
    
                                            if(!tokens.refresh_token) {
    
                                                const errorMessage = `No refresh token received for google calendar "${index}" (${this.config.google[index].name}). Please remove app access from your google account and try again.`;
                                                
                                                this.log.error(errorMessage);
                                                res.send(errorMessage);
                                                return;
                                            } else {
                                                this.log.info(`Received tokens for google calendar "${index}" (${this.config.google[index].name})`);
                                            }
                                        } catch(err) {
                                            this.log.error(err);
                                            res.send(err);
                                            return;
                                        }
    
                                        let calendarIds;
    
                                        try {
                                            calendarIds = await this.google.getCalendarIds();
                                            this.log.info(`Received calender ids for google calendar "${index}" (${this.config.google[index].name})`);
                                        } catch (error) {
                                            this.log.error(error);
                                            res.send(error);
                                            return;
                                        }
    
                                        this.updateConfiguration({
                                            google: this.handleCalendarIds(index, calendarIds, tokens)
                                        });
    
                                        res.redirect('/google/success');
                                    } else res.send('Wrong scope were defined');
                                } else res.send('No scope were defined');
                            } else res.send(`Calendar ${req.query.state} not found`);
                        } else res.send('No calendar defined');
                    } else res.send('No parameters were passed');            
                });
            }
            
            server.server = http.createServer(server.app);
        } else {
            this.log.error('Port is missing');
        }
    
        if(server && server.server) {
            this.getPort(this.config.port, (port) => {
                if (port != this.config.port) {
                    this.log.error('Port ' + this.config.port + ' already in use');
                    process.exit(1);
                }
                
                server.server.listen(port);
            });
        }
    
        if(server && server.app) {
            return server;
        } else {
            return null;
        }
    }
}

// @ts-ignore parent is a valid property on module
if(module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Calendar(options);
} else {
    // otherwise start the instance directly
    new Calendar();
}