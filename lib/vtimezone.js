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

        if(this.daylight[0].rrule) {
            this.daylight[0].dtstart = datetime.fromString(this.daylight[0].dtstart.values, this.daylight[0].dtstart.params, this);
            this.daylight[0].rrule = rrulestr('DTSTART' + this.daylight[0].dtstart + '\nRRULE:' + this.daylight[0].rrule.values);
        }

        if(this.standard[0].rrule) {
            this.standard[0].dtstart = datetime.fromString(this.standard[0].dtstart.values, this.standard[0].dtstart.params, this);
            this.standard[0].rrule = rrulestr('DTSTART' + this.standard[0].dtstart + '\nRRULE:' + this.standard[0].rrule.values);
        }
    }

    getId() {
        return this.tzid.values;
    }

    getOffset(date) {

        if(this.daylight[0]) {

            const oldDate = new Date(Date.UTC(date.getYear(), date.getMonth() - 1, date.getDate(),
                date.getHours(), date.getMinutes(), date.getSeconds()));
            const newDate = new Date(Date.UTC(date.getYear() + 1, date.getMonth() - 1, date.getDate(),
                date.getHours(), date.getMinutes(), date.getSeconds()));

            const standard = this.standard[0].rrule.between(oldDate, newDate);
            
            const daylight = this.daylight[0].rrule.between(oldDate, newDate);

            if(standard[0] < daylight[0]) {
                return this.daylight[0].tzoffsetto.values;
            }
        }

        return this.standard[0].tzoffsetto.values;
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

module.exports = VTimezone;