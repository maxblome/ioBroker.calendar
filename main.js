'use strict';

/*
 * Created with @iobroker/create-adapter v1.18.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const express = require('express');
const fs = require('fs');
const http = require('http');
const cron = require('node-cron');
const os = require('os');
const request = require('request');
const {google} = require('googleapis');

let adapter;

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
        this.on('objectChange', this.onObjectChange.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter hereiobroker

        if (!adapter.config.ip) {
            const ifaces = os.networkInterfaces();
            for (const eth in ifaces) {
                if (!ifaces.hasOwnProperty(eth)) continue;
                for (let num = 0; num < ifaces[eth].length; num++) {
                    if (ifaces[eth][num].family !== 'IPv6' && ifaces[eth][num].address !== '127.0.0.1' && ifaces[eth][num].address !== '0.0.0.0') {
                        adapter.config.ip = ifaces[eth][num].address;
                        break;
                    }
                }
                if (adapter.config.ip) break;
            }
        }
        
        if(adapter.config.calendars) {

            for(const calendar in adapter.config.calendars) {

                if(calendar.provider == 'Google') {
                    if(!calendar.refreshToken) {
                        const workflow = initServer(adapter.config);
                        adapter.log.warn('No permission granted for calendar "' + calendar.name + '". Please visit http://');
                    }
                }

            }

        }

        registerGoogleAuthentication(adapter.config);

        initServer(adapter.config);

        cron.schedule('* * * * *', () => {

            if(oauth2) {
                const options = {
                    url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
                    method: 'GET',
                    qs: {
                        access_token: adapter.config.calendars[0].accessToken
                    }
                };

                adapter.log.info(adapter.config.calendars[0].accessToken);
                adapter.log.info(options.toString());

                request(options, (err, res, body) => {
                    adapter.log.info(body);
                    if(err) return adapter.log.error('Can\'t read calendar list');
                    
                    if(res.statusCode == 200) {
                        adapter.log.info(body);
                    }
                });
            }
        });

        /*
        For every state in the system there has to be also an object of type state
        Here a simple template for a boolean variable named "testVariable"
        Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
        */
        await this.setObjectAsync('testVariable', {
            type: 'state',
            common: {
                name: 'testVariable',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: true,
            },
            native: {},
        });

        // in this template all states changes inside the adapters namespace are subscribed
        this.subscribeStates('*');

        /*
        setState examples
        you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
        */
        // the variable testVariable is set to true as command (ack=false)
        await this.setStateAsync('testVariable', true);

        // same thing, but the value is flagged "ack"
        // ack should be always set to true if the value is received from or acknowledged from the target system
        await this.setStateAsync('testVariable', { val: true, ack: true });

        // same thing, but the state is deleted after 30s (getState will return null afterwards)
        await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

        // examples for the checkPassword/checkGroup functions
        let result = await this.checkPasswordAsync('admin', 'iobroker');
        this.log.info('check user admin pw ioboker: ' + result);

        result = await this.checkGroupAsync('admin', 'admin');
        this.log.info('check group user admin group admin: ' + result);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.log.info('cleaned everything up...');
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed object changes
     * @param {string} id
     * @param {ioBroker.Object | null | undefined} obj
     */
    onObjectChange(id, obj) {
        if (obj) {
            // The object was changed
            this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
        } else {
            // The object was deleted
            this.log.info(`object ${id} deleted`);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.message" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    // 	if (typeof obj === 'object' && obj.message) {
    // 		if (obj.command === 'send') {
    // 			// e.g. send email or pushover or whatever
    // 			this.log.info('send command');

    // 			// Send response in callback if required
    // 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    // 		}
    // 	}
    // }

    

}

function registerGoogleAuthentication(settings) {
    if(settings.googleClientID && settings.googleClientSecret && settings.fqdn && settings.port)  {
        oauth2 = new google.auth.OAuth2(settings.googleClientID, settings.googleClientSecret, `http://${settings.fqdn}:${settings.port}/google`);
    } else adapter.log.warn('Client id, client secret, fqdn or port missing for google calendar.');
}

function initServer(settings) {

    let server;

    if(settings.port) {

        server = {
            app: express(),
            server: null ,
            settings:  settings
        };

        if(oauth2) {
            server.app.get('/google/login/:id', function (req, res) {

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

            server.app.get('/google/success', function (req, res) {
                res.send('Done');
            });

            server.app.get('/google', function (req, res) {
                if(req.query) {
                    if(req.query.state) {
                        if(req.query.state < settings.google.length && req.query.state >= 0) {
                            if(req.query.scope) {
                                const scope = req.query.scope.split(' ');
                                let isRightScope = false;

                                for(let i = 0; i < scope.length; i++) {
                                    if(scope[i] == googleScope) {

                                        settings.google[req.query.state].accessToken = req.query.access_token;

                                        oauth2.getToken(req.query.code, function(err, tokens) {
                                            if (err) {
                                                adapter.log.error(err);
                                                res.send(err);
                                                return;
                                            }
                                        
                                            adapter.log.info(`Received rights for google calendar ${req.query.state} (${settings.google[req.query.state].name})`);
                                            
                                            settings.google[req.query.state].oauth2 = oauth2;
                                            settings.google[req.query.state].oauth2.setCredentials(tokens);

                                            const cal = google.calendar({
                                                version: 'v3',
                                                auth: settings.google[req.query.state].oauth2
                                            });
                                            
                                            cal.calendarList.list((err, res) => {
                                                if (err) {
                                                    adapter.log.error('The Google API returned an error.');
                                                    adapter.log.error(err);
                                                    return;
                                                }

                                                if(res) {
                                                    const items = res.data.items;
                                                    if(items) {
                                                        if(items.length === 0) {
                                                            adapter.log.warn('No accounts found.');
                                                        } else {
                                                            let accounts = [];
                                                            for (let i = 0; i < items.length; i++) {
                                                                accounts[i] = items[i].id;
                                                            }

                                                            adapter.log.info(accounts);
                                                            adapter.log.info(accounts[0]);
                                                            settings.google[req.query.state].accounts = accounts;
                                                            adapter.log.info(settings.google[req.query.state].accounts);

                                                        }
                                                    }
                                                }
                                            });
                                        });

                                        isRightScope = true;
                                    }
                                }

                                if(isRightScope) {
                                    res.redirect('/google/success');
                                } else res.send('Wrong scope were defined');
                            } else res.send('No scope were defined');
                        } else res.send(`Calendar ${req.query.state} not found`);
                    } else res.send('No calendar defined');
                } else res.send('No parameters were passed');            
            });
        }

        server.app.get('/', function (req, res) {
        
            const buffer = fs.readFileSync(__dirname + '/www/index.html');
        
            if (buffer === null || buffer === undefined) {
                res.contentType('text/html');
                res.send('File not found', 404);
            } else {
                // Store file in cache
                res.contentType('text/html');
                res.send(buffer.toString());
            }
        });

        server.server = http.createServer(server.app);
    } else {
        adapter.log.error('Port is missing');
    }

    if(server && server.server) {
        adapter.getPort(settings.port, function (port) {
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

    adapter = new Calendar(options);

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