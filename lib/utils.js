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

    if(startTime.includes('-')) {
        object.startTime = startTime;
    } else {
        if(startTime.includes('T')) {

            const tmp = startTime.split('T');

            const date = `${tmp[0].substring(0, 4)}-${tmp[0].substring(4, 6)}-${tmp[0].substring(6, 8)}`;
            const time = `${tmp[1].substring(0, 2)}:${tmp[1].substring(2, 4)}:${tmp[1].substring(4, 6)}`;

            object.startTime = `${date}T${time}`;
        } else {

            const date = `${startTime.substring(0, 4)}-${startTime.substring(4, 6)}-${startTime.substring(6, 8)}`;

            object.startTime = date;
        }
    }

    if(endTime.includes('-')) {
        object.endTime = endTime;
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

function sameDate(targetDate, calendarDate) {

    targetDate = targetDate.substr(0, 10);
    calendarDate = calendarDate.substr(0, 10);

    if(targetDate == calendarDate) {
        return true;
    } else return false;
}

module.exports = {
    normalizeEvent,
    getDatetime,
    sameDate
};