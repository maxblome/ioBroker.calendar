const datetime = require('./datetime');
const { rrulestr } = require('rrule');

class VEvent {
    constructor(vevent, timezones) {

        this.timezones = timezones;

        this.description = null;
        this.location= null;
        this.uid = null;
        this.summary = null;

        for(const i in vevent) {
            this[i] = vevent[i];
        }

        if(vevent.dtstart && vevent.dtstart.values) {

            let timezone = null;

            if(vevent.dtstart.params && vevent.dtstart.params.tzid) {
                for(const i in timezones) {
                    if(timezones[i].getId() === vevent.dtstart.params.tzid) {
                        timezone = timezones[i];
                        break;
                    }
                }
            }

            this.dtstart = datetime.fromString(vevent.dtstart.values, vevent.dtstart.params, timezone);
        }

        if(vevent.dtend && vevent.dtend.values) {

            let timezone = null;

            if(vevent.dtstart.params && vevent.dtend.params.tzid) {
                for(const i in timezones) {
                    if(timezones[i].getId() === vevent.dtend.params.tzid) {
                        timezone = timezones[i];
                        break;
                    }
                }
            }

            this.dtend = datetime.fromString(vevent.dtend.values, vevent.dtend.params, timezone);
        }

        if(vevent.duration) {

            const duration = vevent.duration.values;

            let day = 0, hour = 0, minute = 0, second = 0;
            
            const numbers = duration.match(/\d+/g);
            const letters = duration.match(/[WHMSD]/g);

            for(const i in numbers) {
                switch(letters[i]) {
                    case 'W':
                        day = parseInt(numbers[i]) * 7;
                        break;
                    case 'D':
                        day = parseInt(numbers[i]);
                        break;
                    case 'H':
                        hour = parseInt(numbers[i]);
                        break;
                    case 'M':
                        minute = parseInt(numbers[i]);
                        break;
                    case 'S':
                        second = parseInt(numbers[i]);
                        break;
                    default:
                        break;
                }
            }
    
            const date = new Date(Date.UTC(this.dtstart.getYear(), this.dtstart.getMonth() - 1,
                this.dtstart.getDate()+ day, this.dtstart.getHours() + hour,
                this.dtstart.getMinutes() + minute, this.dtstart.getSeconds() + second));

            this.dtend = new datetime(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
                date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), null, this.dtstart.getTimezone());
        }

        if(!this.dtend) {
            this.dtend = this.dtstart.clone;
            this.dtend.setDate(this.dtend.getDate() + 1);
            if(this.dtend.getType() === 'DATE-TIME') {
                this.dtend.setHours(0);
                this.dtend.setMinutes(0);
                this.dtend.setSeconds(0);
            }
        }

        if(this.rrule && this.rrule.values) {
            this.rrule = rrulestr('DTSTART' + this.dtstart + '\nRRULE:' + this.rrule.values);
        }
    }

    handleRecurrences(data) {

        const recurrences = [];

        for(const i in data) {

            const start = new Date(Date.UTC(this.dtstart.getYear(), this.dtstart.getMonth() - 1,
                this.dtstart.getDate(), this.dtstart.getHours() || 0,
                this.dtstart.getMinutes() || 0, this.dtstart.getSeconds() || 0));
            const end = new Date(Date.UTC(this.dtend.getYear(), this.dtend.getMonth() - 1,
                this.dtend.getDate(), this.dtend.getHours() || 0,
                this.dtend.getMinutes() || 0, this.dtend.getSeconds() || 0));
            
            const diff = end - start;
            
            const event = new VEvent(this, this.timezones);
            
            event.dtstart = datetime.fromISOString(data[i].toISOString(), this.dtstart.params, this.dtstart.getTimezone());
            
            const endDate = new Date(Date.UTC(event.dtstart.getYear(), event.dtstart.getMonth() - 1,
                event.dtstart.getDate(), event.dtstart.getHours() || 0,
                event.dtstart.getMinutes() || 0, (event.dtstart.getSeconds() || 0) + diff / 1000));

            event.dtend = new datetime(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1, endDate.getUTCDate(),
                endDate.getUTCHours(), endDate.getUTCMinutes(), endDate.getUTCSeconds(), null, this.dtstart.getTimezone());

            recurrences.push(event);
        }

        return recurrences;
    }

    getRecurrences() {

        const now = new Date();

        const result = this.getRecurrencesUntil(new Date(now.getUTCFullYear() + 1,
            now.getUTCMonth(), now.getUTCDate()));

        const recurrences = (result) ? this.handleRecurrences(result) : null;

        return recurrences;
    }

    /**
     * 
     * @param {Date} from 
     * @param {Date} until 
     */
    getRecurrencesBetween(from, until) {
        return (this.rrule) ? this.rrule.between(from, until) : null;
    }

    /**
     * 
     * @param {Date} until 
     */
    getRecurrencesUntil(until) {
        const from = new Date(Date.UTC(this.dtstart.getYear(), this.dtstart.getMonth() - 1,
            this.dtstart.getDate(), this.dtstart.getHours(),
            this.dtstart.getMinutes(), this.dtstart.getSeconds()));

        const result = (this.rrule) ? this.rrule.between(from, until) : null;

        const recurrences = (result) ? this.handleRecurrences(result) : null;

        return recurrences;
    }

    getDescription() {
        return (this.description) ? this.description.values : '';
    }

    getSummary() {
        return (this.summary) ? this.summary.values : '';
    }

    getStartTime() {
        return this.dtstart.getDateTime();
    }

    getEndTime() {
        return this.dtend.getDateTime();
    }
}

module.exports = VEvent;