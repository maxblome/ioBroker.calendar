//const vtimezone = require('./vtimezone');

const dateTimeType = 'DATE-TIME';
const dateType = 'DATE';

class DateTime {
    /**
     * 
     * @param {number} year 
     * @param {number} month 
     * @param {number} date 
     * @param {number} hours 
     * @param {number} minutes 
     * @param {number} seconds 
     * @param {object} params 
     */
    constructor(year, month, date, hours, minutes, seconds, params, timezone) {
        
        this.type = (params && (params.value === dateType || params.value === dateTimeType)) ? params.value : dateTimeType;

        this.year = year;
        this.month = month;
        this.date = date;
        this.hours = (this.type === dateTimeType && typeof hours === 'number') ? hours : null;
        this.minutes = (this.type === dateTimeType && typeof minutes === 'number') ? minutes : null;
        this.seconds = (this.type === dateTimeType && typeof seconds === 'number') ? seconds : null;
        this.params = params || null;
        this.utc = (timezone) ? false : true;
        this.timezone = timezone;
    }

    /**
     * 
     * @param {string} string 
     * @param {object} params 
     */
    static fromString(string, params, timezone) {

        const year = parseInt(string.substr(0, 4));
        const month = parseInt(string.substr(4, 2));
        const date = parseInt(string.substr(6, 2));

        let hours, minutes, seconds;

        timezone = (string.endsWith('Z')) ? null : timezone;

        if(string.length > 8) {
            hours = parseInt(string.substr(9, 2));
            minutes = parseInt(string.substr(11, 2));
            seconds = parseInt(string.substr(13, 2));
        }

        return new DateTime(year, month, date, hours, minutes, seconds, params, timezone);
    }

    static fromISOString(string, params, timezone) {

        const year = parseInt(string.substr(0, 4));
        const month = parseInt(string.substr(5, 2));
        const date = parseInt(string.substr(8, 2));

        let hours, minutes, seconds;

        if(string.length > 10) {
            hours = parseInt(string.substr(11, 2));
            minutes = parseInt(string.substr(14, 2));
            seconds = parseInt(string.substr(17, 2));
        }
        
        return new DateTime(year, month, date, hours, minutes, seconds, params, timezone);
    }

    clone() {
        return  new DateTime(this.year, this.month, this.date, this.hours, this.minutes, this.seconds, this.params, this.timezone);
    }

    getUTCDateTime() {

        let utcDateTime;

        if(this.utc) {

            utcDateTime = `${this.year.pad(4)}-${this.month.pad(2)}-${this.date.pad(2)}`;

            if(this.type === dateTimeType) {
                utcDateTime = utcDateTime + `T${this.hours.pad(2)}:${this.minutes.pad(2)}:${this.seconds.pad(2)}Z`;
            }
        } else {
            if(this.timezone) {
                if(this.type == dateTimeType) {
                    
                    const date = new Date(Date.UTC(this.year, this.month - 1, this.date,
                        this.hours - this.timezone.getHourOffset(this), this.minutes - this.timezone.getMinuteOffset(this), this.seconds));
                    
                    utcDateTime = `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).pad(2)}-${date.getUTCDate().pad(2)}` +
                        `T${date.getUTCHours().pad(2)}:${date.getUTCMinutes().pad(2)}:${date.getUTCSeconds().pad(2)}Z`;
                } else {
                    throw 'Wrong type was specified.';
                }
            } else {
                throw 'No time zone was specified.';
            }
        }

        return utcDateTime;
    }

    getDateTime() {

        let dateTime;

        if(this.type === dateType) {
            dateTime = `${this.year.pad(4)}-${this.month.pad(2)}-${this.date.pad(2)}`;
        } else if(this.type === dateTimeType) {

            let date;

            if(this.utc) {
                date = new Date(Date.UTC(this.year, this.month - 1,
                    this.date, this.hours, this.minutes, this.seconds));
            } else if(this.timezone) {
                    
                date = new Date(Date.UTC(this.year, this.month - 1, this.date,
                    this.hours - this.timezone.getHourOffset(this), this.minutes - this.timezone.getMinuteOffset(this), this.seconds));
            } else {
                throw 'No time zone was specified.';
            }

            dateTime = `${date.getFullYear().pad(4)}-${(date.getMonth() + 1).pad(2)}-${date.getDate().pad(2)}` +
                `T${date.getHours().pad(2)}:${date.getMinutes().pad(2)}:${date.getSeconds().pad(2)}` +
                `${DateTime.getDateOffset(date)}`;
        } else {
            throw 'Wrong type was specified.';
        }

        return dateTime;
    }

    toString() {

        let result = '';
        
        if(this.params) {
            for(const i in this.params) {
                result = `${result};${i.toHyphenUpperCase()}=${this.params[i]}`;
            }
        }

        result = `${result}:${this.year.pad(4)}${this.month.pad(2)}${this.date.pad(2)}`;
    
        if(this.type === dateTimeType) {
            result = `${result}T${this.hours.pad(2)}${this.minutes.pad(2)}${this.seconds.pad(2)}`;

            if(this.utc) {
                result = result + 'Z';
            }
        }

        return result;
    }

    addYear(year) {
        this.year = this.year + year;
    }

    addMonth(month) {
        this.month = this.month + month;
    }

    addDate(date) {

        const monthDays = {
            1: 31,
            2: (this.year % 400 === 0) ? 29 : (this.year % 100 === 0) ? 28 : (this.year % 4 === 0) ? 29 : 28,
            3: 31,
            4: 30,
            5: 31,
            6: 30,
            7: 31,
            8: 31,
            9: 30,
            10: 31,
            11: 30,
            12: 31
        };

        date = date + this.date;

        let month;

        if(date > monthDays[this.month]) {

            month = (date - date % (monthDays[this.month] + 1)) / (monthDays[this.month] + 1);
            date = date % (monthDays[this.month] + 1);

        } else if(date < 1) {
    
            date = date - monthDays[this.month];
            month = (date - date % (monthDays[this.month] + 1)) / (monthDays[this.month] + 1);
            date = monthDays[this.month] + date % (monthDays[this.month] + 1);
        }

        if(month) this.addMonth(month);

        this.date = date;
    }

    addHours(hours) {

        hours = hours + this.hours;

        let date;

        if(hours >= 24) {

            date = (hours - hours % 24) / 24;
            hours = hours % 24;

        } else if(hours < 0) {
    
            hours = hours - 23;
            date = (hours - hours % 24) / 24;
            hours = 23 + hours % 24;
        }

        if(date) this.addDate(date);

        this.hours = hours;
    }

    addMinutes(minutes) {

        minutes = minutes + this.minutes;

        let hours;

        if(minutes >= 60) {

            hours = (minutes - minutes % 60) / 60;
            minutes = minutes % 60;

        } else if(minutes < 0) {
    
            minutes = minutes - 59;
            hours = (minutes - minutes % 60) / 60;
            minutes = 59 + minutes % 60;
        }

        if(hours) this.addHours(hours);

        this.minutes = minutes;
    }

    addSeconds(seconds) {

        seconds = seconds + this.seconds;

        let minutes;

        if(seconds >= 60) {

            minutes = (seconds - seconds % 60) / 60;
            seconds = seconds % 60;

        } else if(seconds < 0) {
    
            seconds = seconds - 59;
            minutes = (seconds - seconds % 60) / 60;
            seconds = 59 + seconds % 60;
        }

        if(minutes) this.addMinutes(minutes);

        this.seconds = seconds;
    }

    setYear(year) {
        this.year = year;
    }

    setMonth(month) {
        this.month = month;
    }

    setDate(date) {
        this.date = date;
    }

    setHours(hours) {
        this.hours = hours;
    }

    setMinutes(minutes) {
        this.minutes = minutes;
    }

    setSeconds(seconds) {
        this.seconds = seconds;
    }

    getTimezone() {
        return this.timezone;
    }

    /**
     * @returns {string}
     */
    getType() {
        return this.type;
    }

    getYear() {
        return this.year;
    }

    getUTCYear() {
        if(!this.utc && this.timezone) {
            
        } else if(this.utc) {
            this.year;
        } else {
            throw 'No time zone was specified.';
        }
    }

    getMonth() {
        return this.month;
    }

    getDate() {
        return this.date;
    }

    getHours() {
        return this.hours;
    }

    getMinutes() {
        return this.minutes;
    }

    getSeconds() {
        return this.seconds;
    }

    static getDateOffset(date) {

        const offset = date.getTimezoneOffset() * -1;

        if(Math.sign(offset) === 0) {
            return 'Z';
        }
    
        let hours = offset / 60 - offset % 60 / 60;
        let minutes = offset % 60;
        const sign = (Math.sign(offset) === 1) ? '+' : '-';
    
        if(hours < 0) hours *= -1;
        if(minutes < 0) minutes *= -1;
    
        return sign + hours.pad(2) + ':' + minutes.pad(2);
    }
}

module.exports = DateTime;