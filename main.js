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
const cron = require('node-cron');
const {google} = require('googleapis');
const ical = require('./lib/ical');
const caldav = require('./lib/caldav');
const util = require('./lib/utils');

let cronJob;
let server;

let adapter;
let systemConfig;

let oauth2;
const googleScope = 'https://www.googleapis.com/auth/calendar';

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
        // Initialize your adapter hereiobroker

        if(!String.prototype.startsWith) {
            String.prototype.startsWith = function(searchString, position) {
                position = position || 0;
                return this.indexOf(searchString, position) === position;
            };
        }

        if(this.config.googleActive) {
            oauth2 = getGoogleAuthentication(adapter.config);
        }

        if(hasCalendarWithoutGrantPermission(adapter.config)) {
            server = initServer(adapter.config);
        }

        try {
            systemConfig = await adapter.getForeignObjectAsync('system.config');
        } catch(error) {
            adapter.log.error(error);
        }

        for(let i = 0; i < adapter.config.caldav.length; i++) {

            if(systemConfig && systemConfig.native && systemConfig.native.secret) {
                adapter.config.caldav[i].password = decrypt(systemConfig.native.secret, adapter.config.caldav[i].password);
            } else {
                adapter.config.caldav[i].password = decrypt('Zgfr56gFe87jJOM', adapter.config.caldav[i].password);
            }
            
            const calendar = adapter.config.caldav[i];

            if(calendar.active && !calendar.listIsLoaded && calendar.hostname.startsWith('http')) {

                let ids;

                try {
                    ids = await getCaldavCalendarIds(calendar);
                } catch(err) {
                    adapter.log.error(err);
                }
                
                if(ids) {
                    await updateConfig({
                        caldav: handleCaldavCalendarIds(adapter.config, i, ids)
                    });
                }
            } else if(calendar.active && !calendar.listIsLoaded && !calendar.hostname.startsWith('http')) {
            
                let id = Buffer.from((calendar.hostname || '')).toString('base64').replace(/[+/= ]/g, '');
                id = id.substring(id.length - 31, id.length - 1);
    
                adapter.config.caldav[i].active = true;
                adapter.config.caldav[i].path = '';
                adapter.config.caldav[i].name = calendar.name;
                adapter.config.caldav[i].id =  id;
                adapter.config.caldav[i].ctag = calendar.ctag || '';
                adapter.config.caldav[i].color = calendar.color|| '#000000';
                adapter.config.caldav[i].listIsLoaded = true;

                await updateConfig({
                    caldav: adapter.config.caldav
                });
            }
        }

        const calendars = [
            ...adapter.config.google,
            ...adapter.config.caldav
        ];

        for(let i = 0; i < calendars.length; i++) {

            //const calendar = adapter.config.google[i];

            const calendar = calendars[i];
            
            if((adapter.config.caldavActive && calendar.active && calendar.username != '' && calendar.hostname != '' && calendar.password != ''
                && calendar.id != '' && calendar.path != '' && (calendar.hostname) ? calendar.hostname.startsWith('http') : false) ||
                (adapter.config.caldavActive && calendar.active && calendar.hostname != '' && calendar.id != '' && (calendar.hostname) ? !calendar.hostname.startsWith('http') : false) ||
                (adapter.config.googleActive && calendar.active && calendar.accessToken && calendar.refreshToken && calendar.id != '')) {
                addDevice(calendar.id, calendar.name);
                addState(`${calendar.id}.account`, 'E-Mail', 'string', 'calendar.account', calendar.username);
                addState(`${calendar.id}.name`, 'Calendar name', 'string', 'calendar.name', calendar.name);
                addState(`${calendar.id}.color`, 'Calendar color', 'string', 'calendar.color', calendar.color);
            } else {
                if(calendar.id != '') removeDevice(calendar.id);
            }
        }

        if(this.config.googleActive) {
            if(oauth2) {
                startCalendarSchedule(adapter.config, oauth2);
            } else if(this.config.caldavActive) {
                startCalendarSchedule(adapter.config);
            }
        } else if(this.config.caldavActive) {
            startCalendarSchedule(adapter.config);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if(cronJob) {
                cronJob.stop();
                adapter.log.debug('Cron job stopped');
            }

            if(server) {
                server.server.close();
                adapter.log.debug('Server stopped');
            }

            callback();
        } catch (e) {
            callback();
        }
    }
}

function encrypt(key, value) {
    let result = '';
    for(let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

function decrypt(key, value) {
    let result = '';
    for(let i = 0; i < value.length; ++i) {
        result += String.fromCharCode(key[i % key.length].charCodeAt(0) ^ value.charCodeAt(i));
    }
    return result;
}

function getDatetime(add = 0, hours = 0, mins = 0, secs = 0, millisecs = 0) {
    // current timestamp in milliseconds
    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + add);
    dateObj.setHours(hours);
    dateObj.setMinutes(mins);
    dateObj.setSeconds(secs);
    dateObj.setMilliseconds(millisecs);
    
    /*const date = (`0${dateObj.getDate()}`).slice(-2);
    const month = (`0${dateObj.getMonth() + 1}`).slice(-2);
    const year = dateObj.getFullYear();
    const hour = (`0${dateObj.getHours()}`).slice(-2);
    const min = (`0${dateObj.getMinutes()}`).slice(-2);
    const sec = (`0${dateObj.getSeconds()}`).slice(-2);
*/
    // prints date & time in YYYY-MM-DD format 2011-06-03T10:00:00Z
    //return `${year}-${month}-${date}T${hour}:${min}:${sec}Z`;
    return dateObj.toISOString();
}

async function updateConfig(newConfig) {
    // Create the config object
    const config = {
        ...adapter.config,
        ...newConfig,
    };

    // Update the adapter object
    const adapterObj = await adapter.getForeignObjectAsync(`system.adapter.${adapter.namespace}`);
    adapterObj.native = config;

    await adapter.setForeignObjectAsync(`system.adapter.${adapter.namespace}`, adapterObj);
}

async function startCalendarSchedule(config, auth = null) {

    const googleCalendars = config.google;
    const caldavCalendars = config.caldav;
    
    for(let i = 0; i < googleCalendars.length; i++) {
        if(googleCalendars[i].active) {

            try {
                const events = await getGoogleCalendarEvents(googleCalendars[i], auth, i);
                
                handleCalendarEvents(googleCalendars[i], events);
            } catch(error) {
                adapter.log.error(error);
            }
        }
    }

    for(let i = 0; i < caldavCalendars.length; i++) {

        if(caldavCalendars[i].active) {

            try {
                const events = await getCaldavCalendarEvents(caldavCalendars[i]);
                
                handleCalendarEvents(caldavCalendars[i], events);
            } catch(error) {
                adapter.log.error('ERROR ' + error);
            }
        }
    }

    cronJob = cron.schedule('*/10 * * * *', async () => {
        for(let i = 0; i < googleCalendars.length; i++) {
            if(googleCalendars[i].active) {

                try {
                    const events = await getGoogleCalendarEvents(googleCalendars[i], auth, i);

                    handleCalendarEvents(googleCalendars[i], events);
                } catch(err) {
                    adapter.log.error(err);
                }
            }
        }

        for(let i = 0; i < caldavCalendars.length; i++) {
            if(caldavCalendars[i].active) {
    
                try {
                    const events = await getCaldavCalendarEvents(caldavCalendars[i]);
    
                    handleCalendarEvents(caldavCalendars[i], events);
                } catch(err) {
                    adapter.log.error(err);
                }
            }
        }
    });

    adapter.log.debug('Cron job started');
}

async function getCaldavCalendarIds(calendar) {

    const username = calendar.username;
    const password = calendar.password;

    let calendarIds;

    try {

        const href = await caldav.getHref(calendar.hostname);
        
        adapter.log.debug(`HREF: ${href}`);
		
        const principal = await caldav.getUserPrincipal(href, username, password);
        
        adapter.log.debug(`PRINCIPAL: ${principal}`);
        
        const home = await caldav.getCalendarHome(principal, username, password);
        
        adapter.log.debug(`HOME: ${home}`);

        calendarIds = await caldav.queryCalendarList(home, username, password);
        
        adapter.log.debug(`CALENDARS: ${JSON.stringify(calendarIds)}`);
        
    } catch(err) {
        adapter.log.error(err);
    }

    return calendarIds;
}

function handleCaldavCalendarIds(config, index, ids) {

    let firstIsSet = false;

    const configCaldav = config.caldav;

    for(const i in ids) {

        const calendar = ids[i];

        if(!firstIsSet) {
            
            let id = Buffer.from((calendar.path || '')).toString('base64').replace(/[+/= ]/g, '');
            id = id.substring(id.length - 31, id.length - 1);
            
            adapter.log.info(`Set calendar name "${index}": Old name => "${configCaldav[index].name}" New name "${calendar.name}"`);
            
            configCaldav[index].active = true;
            configCaldav[index].path = calendar.path;
            configCaldav[index].name = calendar.name;
            configCaldav[index].id =  id;
            configCaldav[index].ctag = calendar.ctag || '';
            configCaldav[index].color = calendar.color|| '#000000';
            configCaldav[index].listIsLoaded = true;
            configCaldav[index].password = encrypt(systemConfig.native.secret, configCaldav[index].password);

            firstIsSet = true;
            
        } else {

            const configCalendar = {};
            
            adapter.log.info(`Found calendar in account "${configCaldav[index].username}": Calendar "${calendar.name}"`);
            adapter.log.info(`The calendar "${calendar.name}" was added. You can activate the calendar in the config.`);
            
            let id = Buffer.from((calendar.path || '')).toString('base64').replace(/[+/= ]/g, '');
            id = id.substring(id.length - 31, id.length - 1);

            configCalendar.active = false;
            configCalendar.name = calendar.name;
            configCalendar.id = id;
            configCalendar.hostname = configCaldav[index].hostname;
            configCalendar.username = configCaldav[index].username;
            configCalendar.password = configCaldav[index].password;
            configCalendar.ctag = calendar.ctag || '';
            configCalendar.days = configCaldav[index].days;
            configCalendar.color = calendar.color || '#000000';
            configCalendar.path = calendar.path;
            configCalendar.listIsLoaded = true;
            
            configCaldav.push(configCalendar);
        }

        
    }

    return configCaldav;
}

function sameDate(targetDate, calendarDate) {

    targetDate = targetDate.substr(0, 10);
    calendarDate = calendarDate.substr(0, 10);

    if(targetDate == calendarDate) {
        return true;
    } else return false;
}

async function addChannel(id, name) {

    //adapter.createChannel(device, id, {name: name});

    try {
        const result = await adapter.setObjectNotExistsAsync(id, {
            type: 'channel',
            common: {
                name: name,
            },
            native: {},
        });
        
        if(result) adapter.log.debug('Channel added => ' + result.id);
        
    } catch(error) {
        adapter.log.error(error);
    }
}

function addDevice(id, name) {
    //adapter.createDevice(id, {name: name});
    adapter.setObjectNotExistsAsync(id, {
        type: 'device',
        common: {
            name: name,
        },
        native: {},
    }).then((prom) => {
        if(prom) adapter.log.debug('Device added => ' + prom.id);
    });
}

function removeDevice(id) {

    if(!id.startsWith(adapter.namespace)) {
        id = adapter.namespace + '.' + id;
    }

    adapter.getStates(id + '*', (err, states) => {
        if(!err) {
            for (const id in states) {
                adapter.log.debug(`Delete state => ${id}`);
                adapter.delObject(id);
            }
        } else adapter.log.error(err);
    });

    adapter.getChannels(id, (err, states) => {
        if(!err) {
            for(const id in states) {
                adapter.log.debug(`Delete channel => ${states[id]._id}`);
                adapter.delObject(states[id]._id);
            }
        } else adapter.log.error(err);
    });

    adapter.log.debug(`Delete device => ${id}`);
    adapter.delObject(id);
}

function addState(id, name, type, role, value = null) {
    adapter.setObjectNotExistsAsync(id, {
        type: 'state',
        common: {
            name: name,
            type: type,
            role: role,
            read: true,
            write: false
        },
        native: {},
    }).then((prom) => {
        if(prom) adapter.log.debug('State added => ' + prom.id);
    });
    
    adapter.setStateAsync(id, { val: (value || ''), ack: true });
}

/**
 * Remove deleted events.
 * @param {Object} oldList
 * @param {Map} newList
 * @param {string} calendarId
 */
function removeDeleted(oldList, newList, calendarId) {

    if(oldList) {
        
        for(let i = oldList.length - 1; i >= 0; i--) {
            
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
                    adapter.log.debug(`Delete channel => ${oldList[i]._id}`);
                    adapter.delObject(oldList[i]._id);
                    adapter.getStates(oldList[i]._id + '*', (err, states) => {
                        for (const id in states) {
                            adapter.log.debug(`Delete state => ${id}`);
                            adapter.delObject(id);
                        }
                    });
                }
            }
        }
    }
}

async function getCaldavCalendarEvents(calendar) {

    let events;
    const list = [];

    if(adapter.config.caldavActive && calendar.active && calendar.username != '' &&
        calendar.hostname != '' && calendar.password != '' && calendar.id != '' && calendar.path != '' && calendar.hostname.startsWith('http')) {
        
        try {
            adapter.log.debug(`Read events of '${calendar.name}'`);
            events = await caldav.queryEvents(adapter, calendar.path, calendar.username, calendar.password);

        } catch(error) {
            adapter.log.error(error);
            return;
        }

        for(const i in events) {
            
            let calendar;

            adapter.log.debug('RAWDATA');
            adapter.log.debug(JSON.stringify(events[i]));

            if(Object.keys(events[i].propstat[0].prop[0]['calendar-data'][0]).includes('_')) {
                calendar = ical.parse(events[i].propstat[0].prop[0]['calendar-data'][0]['_']);
            } else {
                calendar = ical.parse(events[i].propstat[0].prop[0]['calendar-data'][0]);
            }

            adapter.log.debug('PARSED ICAL');
            adapter.log.debug(JSON.stringify(calendar));
            
            if(calendar.events) {
                for(const j in calendar.events) {
                    list.push(util.normalizeEvent(calendar.events[j].summary, calendar.events[j].description, calendar.events[j].dtstart.val, calendar.events[j].dtend.val));
                }
            }
        }

        adapter.log.info(`Updated calendar "${calendar.name}"`);
    } else if(adapter.config.caldavActive && calendar.active && calendar.hostname != '' && calendar.id != '' && !calendar.hostname.startsWith('http')) {

        try {
            adapter.log.debug(`Read events of '${calendar.name}'`);
            events = await ical.readFile(calendar.hostname);

            const parsedEvents = ical.parse(events);

            adapter.log.debug('PARSED ICAL');
            adapter.log.debug(JSON.stringify(parsedEvents));

            if(parsedEvents.events) {
                for(const i in parsedEvents.events) {
                    list.push(util.normalizeEvent(parsedEvents.events[i].summary, parsedEvents.events[i].description,
                        parsedEvents.events[i].dtstart.val, parsedEvents.events[i].dtend.val));
                }
            }
        } catch(error) {
            adapter.log.error(error);
        }

        adapter.log.info(`Updated calendar "${calendar.name}"`);
    }

    return list;
}

async function getGoogleCalendarEvents(calendar, auth, index) {

    return new Promise((resolve, reject) => {

        if(calendar.accessToken && calendar.accessToken != '' && calendar.refreshToken && calendar.refreshToken != '' && calendar.id != '') {
            
            const oauth2 = auth;
            
            oauth2.setCredentials({
                access_token: calendar.accessToken,
                refresh_token: calendar.refreshToken
            });
    
            const cal = google.calendar({
                version: 'v3',
                auth: oauth2
            });
    
            cal.events.list({
                calendarId: calendar.email,
                timeMin: getDatetime(),
                timeMax: getDatetime(((parseInt(calendar.days) > 0) ? parseInt(calendar.days) : 7), 23, 59, 59),
                singleEvents: true,
                orderBy: 'startTime'
            }, (err, res) => {
                if(err) {
                    adapter.log.error(`The Google API returned an error. Affected calendar: ${calendar.name}`);
                    reject(err);
                } else if(res) {
                    
                    const list = [];

                    for(let i = 0; i < res.data.items.length; i++) {
                        list.push(util.normalizeEvent(res.data.items[i].summary, res.data.items[i].description,
                            (res.data.items[i].start.date || res.data.items[i].start.dateTime), (res.data.items[i].end.date || res.data.items[i].end.dateTime)));
                    }

                    resolve(list);
    
                    adapter.log.info(`Updated calendar "${calendar.name}"`);
                }
            });
        } else {
            adapter.log.warn(`No permission granted for calendar "${calendar.name}". Please visit http://${adapter.config.fqdn}:${adapter.config.port}/google/login/${index}`);
            reject('No permission granted.');
        }
    });
}

async function handleCalendarEvents(calendar, events) {

    if(events) {

        const dayCount = new Map();

        const dayEvents = new Map();

        for(let i = 0; i <= ((calendar.days > 0) ? calendar.days : 7); i++) {
            dayEvents.set(i, []);
        }
        
        for(const i in events) {

            for(let j = 0; j <= ((calendar.days > 0) ? calendar.days : 7); j++) {

                if(sameDate(getDatetime(j), events[i].startTime)) {

                    const dayObj = dayEvents.get(j) || [];

                    dayObj.push(events[i]);

                    dayEvents.set(j, dayObj);

                    dayCount.set(j, (dayCount.get(j) > 0) ? dayCount.get(j) + 1: 1);
                }
            }
        }

        for(let i = 0; i < dayEvents.size; i++) {
            addChannel(`${calendar.id}.${i}`, `Day ${i}`);
            addState(`${calendar.id}.${i}.events`, 'Events', 'string', 'calendar.events', JSON.stringify(dayEvents.get(i)));
            addState(`${calendar.id}.${i}.date`, 'Date', 'string', 'calendar.date', getDatetime(i).substring(0, 10));
            addState(`${calendar.id}.${i}.eventsNumber`, 'Number of events', 'number', 'calendar.events', (dayCount.has(i)) ? dayCount.get(i) : '0');
        }

        adapter.getChannels((err, channels) => {
            if(err) {
                adapter.log.error(err);
            } else removeDeleted(channels, dayCount, calendar.id);
        });
    }
}

function hasCalendarWithoutGrantPermission(config) {

    if(config.googleActive) {

        const googleCalendars = config.google;

        for(let i = 0; i < googleCalendars.length; i++) {
            if(googleCalendars[i].active) {
                if(!googleCalendars[i].accessToken || googleCalendars[i].accessToken == '' ||
                    !googleCalendars[i].refreshToken || googleCalendars[i].refreshToken == '') {
                    return true;
                }
            }
        }
    }

    return false;
}

async function getGoogleAuthenticationTokens(code) {
    
    return new Promise((resolve, reject) => {

        oauth2.getToken(code, (err, tokens) => {
            if (err) {
                reject(err);
            } else {
            
                adapter.log.debug(`Received tokens for google calendar`);

                resolve(tokens);
            }
        });

    });
}

function getGoogleAuthentication(settings) {

    let oauth2 = null;

    if(settings.googleClientID && settings.googleClientSecret && settings.fqdn && settings.port)  {
        oauth2 = new google.auth.OAuth2(settings.googleClientID, settings.googleClientSecret, `http://${settings.fqdn}:${settings.port}/google`);
    } else adapter.log.warn('Client id, client secret, fqdn or port missing for google calendar.');

    return oauth2;
}

async function getGoogleCalendarIds(auth) {

    return new Promise((resolve, reject) => {

        const cal = google.calendar({
            version: 'v3',
            auth: auth
        });

        cal.calendarList.list((err, res) => {
            if(err) {
                adapter.log.error('The Google API returned an error.');
                reject(err);
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

function handleCalendarIds(config, index, ids, tokens) {

    const configGoogle = config.google;

    adapter.log.info(`Set calendar name "${index}": Old name => "${configGoogle[index].name}" New name "${ids.calendars[0].summary}"`);

    configGoogle[index].active = true;
    configGoogle[index].account = ids.account;
    configGoogle[index].name = ids.calendars[0].summary;
    configGoogle[index].id = ids.calendars[0].id;
    configGoogle[index].email = ids.calendars[0].email;
    configGoogle[index].accessToken = tokens.access_token;
    configGoogle[index].refreshToken = tokens.refresh_token;
    configGoogle[index].color = ids.calendars[0].color;

    for(let i = 1; i < ids.calendars.length; i++) {

        const calendar = ids.calendars[i];
        const configCalendar = {};
        
        adapter.log.info(`Found calendar in account "${ids.account}": Calendar "${calendar.summary}"`);
        adapter.log.info(`The calendar "${calendar.summary}" was added. You can activate the calendar in the config.`);

        configCalendar.active = false;
        configCalendar.account = ids.account;
        configCalendar.name = `${ids.calendars[0].summary} ${calendar.summary}`;
        configCalendar.id = calendar.id;
        configCalendar.email = calendar.email;
        configCalendar.accessToken = tokens.access_token;
        configCalendar.refreshToken = tokens.refresh_token;
        configCalendar.days = configGoogle[index].days;
        configCalendar.color = calendar.color;

        configGoogle.push(configCalendar);
    }

    return configGoogle;
}

function initServer(settings) {

    const server = {};

    if(settings.port) {

        server.app = express();
        server.settings = settings;

        if(oauth2) {
            server.app.get('/google/login/:id', (req, res) => {

                const id = req.params.id;
                
                //Check if calendar id exists
                if(id < settings.google.length && id >= 0) {

                    const calendar = settings.google[id];

                    //Check if a refresh token exists
                    if(!calendar.refreshToken) {

                        const url = oauth2.generateAuthUrl({
                            scope: googleScope,
                            //include_granted_scopes: true,
                            state: id,
                            //response_type: 'token',
                            access_type: 'offline'
                        });

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
                        if(req.query.state < settings.google.length && req.query.state >= 0) {
                            if(req.query.scope) {

                                const scope = req.query.scope.split(' ');
                                const index = req.query.state;
                                let isRightScope = false;
                                
                                for(let i = 0; i < scope.length; i++) {
                                    if(scope[i] == googleScope) {

                                        isRightScope = true;

                                        i = scope.length;
                                    }
                                }

                                if(isRightScope) {

                                    let tokens;

                                    try {
                                        tokens = await getGoogleAuthenticationTokens(req.query.code);

                                        if(!tokens.refresh_token) {

                                            const errorMessage = `No refresh token received for google calendar "${index}" (${settings.google[index].name}). Please remove app access from yout google account and try again.`;
                                            
                                            adapter.log.error(errorMessage);
                                            res.send(errorMessage);
                                            return;
                                        } else {
                                            adapter.log.info(`Received tokens for google calendar "${index}" (${settings.google[index].name})`);
                                        }
                                    } catch(err) {
                                        adapter.log.error(err);
                                        res.send(err);
                                        return;
                                    }

                                    oauth2.setCredentials(tokens);

                                    let calendarIds;

                                    try {
                                        calendarIds = await getGoogleCalendarIds(oauth2);
                                        adapter.log.info(`Received calender ids for google calendar "${index}" (${settings.google[index].name})`);
                                    } catch (err) {
                                        adapter.log.error(err);
                                        res.send(err);
                                        return;
                                    }

                                    updateConfig({
                                        google: handleCalendarIds(settings, index, calendarIds, tokens)
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
        adapter.log.error('Port is missing');
    }

    if(server && server.server) {
        adapter.getPort(settings.port, (port) => {
            if (port != settings.port && !adapter.config.findNextPort) {
                adapter.log.error('Port ' + settings.port + ' already in use');
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

function startAdapter(options) {

    const opts = options || {};

    adapter = new Calendar(opts);

    return adapter;
}


// @ts-ignore parent is a valid property on module
if (module.parent) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<ioBroker.AdapterOptions>} [options={}]
     */
    module.exports = (options) => startAdapter(options);
} else {
    // otherwise start the instance directly
    startAdapter();
}