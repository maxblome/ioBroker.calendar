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

let adapter;

let socketUrl;
let ownSocket;

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

        // The adapters config (in the instance object everything under the attribute "native") is accessible via
        // this.config:
        this.log.info('config option1: ' + this.config.option1);
        this.log.info('config option2: ' + this.config.option2);

        // information about connected socket.io adapter
        if (this.config.socketio && this.config.socketio.match(/^system\.adapter\./)) {
            this.getForeignObject(this.config.socketio, function (err, obj) {
                if (obj && obj.common && obj.common.enabled && obj.native) socketUrl = ':' + obj.native.port;
            });
            // Listen for changes
            this.subscribeForeignObjects(this.config.socketio);
        } else {
            socketUrl = this.config.socketio;
            ownSocket = (socketUrl != 'none');
        }

        initWebServer(adapter.config);

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

function initWebServer(settings) {

    let server;
    const clientID = '990479440387-osl8j2k8q22851qalmke0j962jselom2.apps.googleusercontent.com';

    if(settings.port) {

        server = {
            app:       express(),
            server:    null,
            io:        null,
            settings:  settings
        };
        
        server.app.get('/login', function (req, res) {
            res.redirect('https://accounts.google.com/o/oauth2/v2/auth?client_id=' + clientID +
                                                            '&redirect_uri=http://localhost:' + settings.port + '/' +
                                                            '&scope=https://www.googleapis.com/auth/calendar' +
                                                            '&state=1' +
                                                            '&include_granted_scopes=true' +
                                                            '&response_type=token');
        });

        server.app.get('/success', function (req, res) {
            res.send('Done');
        });

        server.app.get('/', function (req, res) {
            console.log(req.originalUrl);
            console.log(req.params);
            console.log(req.query);
            console.log(req.path);
            console.log(req.url);
        
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
        adapter.log.error('port missing');
        process.exit(1);
    }

    if(server && server.server) {
        adapter.getPort(settings.port, function (port) {
            if (port != settings.port && !adapter.config.findNextPort) {
                adapter.log.error('port ' + settings.port + ' already in use');
                process.exit(1);
            }

            server.server.listen(port);

            const host = server.server.address();

            console.log('Please try to grant permission on http://%s', host);
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