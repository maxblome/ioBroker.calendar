'use strict';

const vevent = require('./vevent');
const vtimezone = require('./vtimezone');

const HTAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const DQUOTE = String.fromCharCode(22);
const SPACE = String.fromCharCode(32);
const PLUS_SIGN = String.fromCharCode(43);
const COMMA = String.fromCharCode(44);
const HYPHEN_MINUS = String.fromCharCode(45);
const PERIOD = String.fromCharCode(46);
const SOLIDUS = String.fromCharCode(47);
const COLON = String.fromCharCode(58);
const SEMICOLON = String.fromCharCode(59);
const LATIN_CAPITAL_LETTER_N = String.fromCharCode(78);
const LATIN_CAPITAL_LETTER_T = String.fromCharCode(84);
const LATIN_CAPITAL_LETTER_X = String.fromCharCode(88);
const LATIN_CAPITAL_LETTER_Z = String.fromCharCode(90);
const BACKSLASH = String.fromCharCode(92);
const LATIN_SMALL_LETTER_N = String.fromCharCode(110);

const CRLF = CR + LF;

class VCalendar {

    constructor(data) {
        try {
            String.prototype.toCamelCase = function() {
                return this.toLowerCase().replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
                    return index === 0 ? word.toLowerCase() : word.toUpperCase();
                }).replace(/-/g, '');
            };

            String.prototype.toHyphenUpperCase = function() {
                return this.replace(/[A-Z]/g, (word) => {
                    return '-' + word;
                }).toUpperCase();
            };

            Number.prototype.pad = function(size) {
                let s = this + '';
                while (s.length < size) s = '0' + s;
                return s;
            };

            console.debug(data);

            this.vevent = null;
            this.vtimezone = null;

            this.parse(data);
        } catch(error) {
            throw new VCalendarError('<constructor> ' + error.message);
        }
    }

    parse(data) {
        try {
            data = data.replace(new RegExp(CRLF + HTAB, 'g'), '');
            data = data.replace(new RegExp(CRLF + SPACE, 'g'), '');

            const dataLines = data.split((data.includes(CRLF)) ? CRLF : LF);
            console.debug('STARING PARSING');
            const parsed = this.handleLine(dataLines).vcalendar[0];

            for(const i in parsed) {
                this[i] = parsed[i];
            }

            const vevents = [];
            const vtimezones = [];

            for(const i in this.vtimezone) {
                vtimezones.push(new vtimezone(this.vtimezone[i]));
            }

            this.vtimezone = vtimezones;

            for(const i in this.vevent) {
                vevents.push(new vevent(this.vevent[i], this.vtimezone));
            }

            this.vevent = vevents;
        } catch(error) {
            throw new VCalendarError('<parse> ' + error.message);
        }
    }

    handleLine(lines) {
        try {
            const result = {};
            
            //console.debug(lines);

            for(let i = 0; i < lines.length; i++) {

                const line = lines[i];

                //console.debug(line);

                if(line && line.startsWith('BEGIN:')) {

                    const type = this.getType(line);
                    const innerLines = [];

                    if(!result[type]) result[type] = [];
                    
                    i++;

                    while(!lines[i].startsWith('END:' + type.toUpperCase())) {

                        innerLines.push(lines[i]);

                        i++;
                    }

                    result[type].push(this.handleLine(innerLines));

                } else if(line !== '') {
                    result[this.getName(line)] = {
                        params: this.getParams(line),
                        values: this.getValues(line)
                    };
                }
            }
            
            return result;

        } catch(error) {
            throw new VCalendarError('<handleLines> ' + error.message);
        }
    }

    getEvents() {
        return this.vevent;
    }

    getType(line) {
        return line.split(':')[1].toCamelCase();
    }

    getName(line) {
        return line.split(':')[0].split(';')[0].toCamelCase();
    }

    getParams(line) {

        const params = {};

        const lineParams = line.split(':')[0].split(';').slice(1);

        for(const i in lineParams) {
            params[lineParams[i].split('=')[0].toCamelCase()] = lineParams[i].split('=')[1] || null;
        }

        return Object.keys(params).length > 0 ? params : null;
    }

    getValues(line) {
        const result = line.substring(line.indexOf(':') + 1).split(',');
        return result.length > 1 ? result : result[0];
    }

    /*uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }*/
}

class VCalendarError extends Error {
    constructor(message) {
        super(message);
        this.name = 'VCalendarError';
    }
}

module.exports = VCalendar;