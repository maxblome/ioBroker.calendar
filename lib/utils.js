/**
 * Parse iCal to Json.
 * @param {string} summary
 * @param {string} description
 * @param {string} startTime
 * @param {string} endTime
 * @returns {Object}
 */
function normalizeEvent(summary, description, startTime, endTime) {

    const object = {};

    object.summary = summary;
    object.description = description;

    let tmpStart = {};

    if(startTime.includes('-')) {
        object.startTime = startTime;
    } else {
        if(startTime.includes('T')) {

            const tmp = startTime.split('T');

            const date = `${tmp[0].substring(0, 4)}-${tmp[0].substring(4, 6)}-${tmp[0].substring(6, 8)}`;
            const time = `${tmp[1].substring(0, 2)}:${tmp[1].substring(2, 4)}:${tmp[1].substring(4, 6)}`;

            object.startTime = `${date}T${time}`;

            tmpStart = {
                year: parseInt(tmp[0].substring(0, 4)),
                month: parseInt(tmp[0].substring(4, 6)) - 1,
                date: parseInt(tmp[0].substring(6, 8)),
                hours: parseInt(tmp[1].substring(0, 2)),
                minutes: parseInt(tmp[1].substring(2, 4)),
                seconds: parseInt(tmp[1].substring(4, 6))
            };
        } else {

            const date = `${startTime.substring(0, 4)}-${startTime.substring(4, 6)}-${startTime.substring(6, 8)}`;

            object.startTime = date;

            tmpStart = {
                year: parseInt(startTime.substring(0, 4)),
                month: parseInt(startTime.substring(4, 6)) - 1,
                date: parseInt(startTime.substring(6, 8))
            };
        }
    }

    if(endTime.includes('-')) {
        object.endTime = endTime;
    } else if(endTime.startsWith('P')) { //End Time is a duration
        
        const splitted = endTime.split('T');

        let period = splitted[0].replace('P', '');
        let time = splitted[1] ? splitted[1] : '';
        let week, day, hour, minute, second;

        const periodType = period.endsWith('W') ? 'W' : period.endsWith('D') ? 'D' : '';
        period = period.replace(periodType, '');

        if(periodType == 'W') {
            week = parseInt(period);
        }

        if(periodType == 'D') {
            day = parseInt(period);
        }

        if(time.includes('H')) {
            const tmp = time.split('H');
            hour = parseInt(tmp[0]);
            time = tmp[1] ? tmp[1] : '';
        }

        if(time.includes('M')) {
            const tmp = time.split('M');
            minute = parseInt(tmp[0]);
            time = tmp[1] ? tmp[1] : '';
        }

        if(time.includes('S')) {
            const tmp = time.split('S');
            second = parseInt(tmp[0]);
            time = '';
        }

        object.endTime = new Date(Date.UTC(tmpStart.year, tmpStart.month,
            tmpStart.date + (week ? week * 7 : 0) + (day ? day : 0), tmpStart.hours + (hour ? hour : 0),
            tmpStart.minutes + (minute ? minute : 0), tmpStart.seconds + (second ? second : 0))).toISOString().replace('.000Z', '');

    } else {
        if(endTime.includes('T')) {

            const tmp = endTime.split('T');

            const date = `${tmp[0].substring(0, 4)}-${tmp[0].substring(4, 6)}-${tmp[0].substring(6, 8)}`;
            const time = `${tmp[1].substring(0, 2)}:${tmp[1].substring(2, 4)}:${tmp[1].substring(4, 6)}`;

            object.endTime = `${date}T${time}`;
        } else {

            const date = `${endTime.substring(0, 4)}-${endTime.substring(4, 6)}-${endTime.substring(6, 8)}`;
            
            object.endTime = date;
        }
    }

    return object;
}

function getDatetime(add = 0, hours = 0, mins = 0, secs = 0, millisecs = 0) {
    // current timestamp in milliseconds
    const dateObj = new Date();
    dateObj.setDate(dateObj.getDate() + add);
    dateObj.setHours(hours);
    dateObj.setMinutes(mins);
    dateObj.setSeconds(secs);
    dateObj.setMilliseconds(millisecs);

    return dateObj.toISOString();
}

function getCalDAVDatetime(add = 0, hours = 0, mins = 0, secs = 0, millisecs = 0) {
    
    let date = getDatetime(add, hours, mins, secs, millisecs);

    date = date.replace(/000/g, '');
    date = date.replace(/[-:.]/g, '');

    return date;
}

function sameDate(targetDate, calendarDate) {

    targetDate = targetDate.substr(0, 10);
    calendarDate = calendarDate.substr(0, 10);

    if(targetDate == calendarDate) {
        return true;
    } else return false;
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

module.exports = {
    normalizeEvent,
    getDatetime,
    getCalDAVDatetime,
    sameDate,
    encrypt,
    decrypt
};