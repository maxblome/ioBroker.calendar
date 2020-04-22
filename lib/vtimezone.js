const datetime = require('./datetime');
const { rrulestr } = require('rrule');

class VTimezone {
    constructor(vtimezone) {

        this.tzid = null;
        this.daylight = null;
        this.standard = null;

        for(const i in vtimezone) {
            this[i] = vtimezone[i];
        }

        if(this.daylight && this.daylight[0]) {

            if(this.daylight[0].dtstart) {
                this.daylight[0].dtstart = datetime.fromString(this.daylight[0].dtstart.values, this.daylight[0].dtstart.params, this);
            } else {
                throw new VTimezoneError('DTSTART is missing in the daylight component.');
            }

            if(this.daylight[0].rrule) {
                this.daylight[0].rrule = rrulestr('DTSTART' + this.daylight[0].dtstart + '\nRRULE:' + this.daylight[0].rrule.values);
            }
        }

        if(this.standard && this.standard[0]) {

            if(this.standard[0].dtstart) {
                this.standard[0].dtstart = datetime.fromString(this.standard[0].dtstart.values, this.standard[0].dtstart.params, this);
            } else {
                throw new VTimezoneError('DTSTART is missing in the standard component.');
            }

            if(this.standard[0].rrule) {
                this.standard[0].rrule = rrulestr('DTSTART' + this.standard[0].dtstart + '\nRRULE:' + this.standard[0].rrule.values);
            }
        }
    }

    getId() {
        return this.tzid.values;
    }

    getOffset(date) {

        if(this.standard && this.standard[0] && this.standard[0].tzoffsetto &&
            this.daylight && this.daylight[0] && this.daylight[0].tzoffsetto) {

            const oldDate = new Date(Date.UTC(date.getYear(), date.getMonth() - 1, date.getDate(),
                date.getHours(), date.getMinutes(), date.getSeconds()));
            const newDate = new Date(Date.UTC(date.getYear() + 1, date.getMonth() - 1, date.getDate(),
                date.getHours(), date.getMinutes(), date.getSeconds()));

            let standard = [];
            
            if(this.standard[0].rrule) {
                standard = this.standard[0].rrule.between(oldDate, newDate);
            } else {

                const dtstart = this.standard[0].dtstart;

                standard[0] = new Date(Date.UTC(dtstart.getYear(), dtstart.getMonth() - 1, dtstart.getDate(),
                    dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds()));
            }
            
            let daylight = [];
            
            if(this.daylight[0].rrule) {
                daylight = this.daylight[0].rrule.between(oldDate, newDate);
            } else {
                const dtstart = this.daylight[0].dtstart;

                daylight[0] = new Date(Date.UTC(dtstart.getYear(), dtstart.getMonth() - 1, dtstart.getDate(),
                    dtstart.getHours(), dtstart.getMinutes(), dtstart.getSeconds()));
            }
            
            if(standard[0] < daylight[0]) {
                return this.daylight[0].tzoffsetto.values;
            }
        }

        if(this.standard && this.standard[0] && this.standard[0].tzoffsetto) {
            return this.standard[0].tzoffsetto.values;
        } else if(this.daylight && this.daylight[0] && this.daylight[0].tzoffsetto) {
            return this.daylight[0].tzoffsetto.values;
        } else {
            throw new VTimezoneError('Standard or daylight is missing.');
        }
    }

    getHourOffset(date) {

        const offset = this.getOffset(date);

        const hour = parseInt(offset.substr(1, 2));

        if(Math.sign(offset) === -1) {
            return -hour;
        }

        return hour;
    }

    getMinuteOffset(date) {

        const offset = this.getOffset(date);

        const minute = parseInt(offset.substr(3, 2));

        if(Math.sign(offset) === -1) {
            return -minute;
        }

        return minute;
    }

    getOffsetString(date) {

        const offset = this.getOffset(date);

        return `${offset.substr(0, 3)}:${offset.substr(3, 2)}`;
    }
}

class VTimezoneError extends Error {
    constructor(message) {
        super(message);
        this.name = 'VTimezoneError';
    }
}

module.exports = VTimezone;