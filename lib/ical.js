/**
 * Parse iCal to Json.
 * @param {string} data iCal data
 * @returns {Object} Object
 */
function parse(data) {

    const object = {};

    const dataList = data.split((data.includes('\r\n')) ? '\r\n' : (data.includes('\n')) ? '\n' : '\r');

    for(let i = 0; i < dataList.length; i++) {
        
        let dataLine = dataList[i].split(':');
        
        if(dataList[i].startsWith('PRODID')) object.prodid = dataLine[1];
        if(dataList[i].startsWith('VERSION')) object.version = dataLine[1];
        if(dataList[i].startsWith('CALSCALE')) object.calscale = dataLine[1];
        if(dataList[i].startsWith('METHOD')) object.method = dataLine[1];

        if(dataList[i].startsWith('BEGIN:VEVENT')) {
            
            const event = {};
            
            do {
                i++;
                
                dataLine = dataList[i].split(':');
                
                if(dataList[i].startsWith('CREATED')) event.created = dataLine[1];
                if(dataList[i].startsWith('DTSTAMP')) event.dtstamp = dataLine[1];
                if(dataList[i].startsWith('LAST-MODIFIED')) event.lastModified = dataLine[1];
                if(dataList[i].startsWith('UID')) event.uid = dataLine[1];
                if(dataList[i].startsWith('SUMMARY')) event.summary = dataLine[1];
                if(dataList[i].startsWith('CLASS')) event.class = dataLine[1];
                if(dataList[i].startsWith('DESCRIPTION')) event.description = dataLine[1];
                if(dataList[i].startsWith('LOCATION')) event.location = dataLine[1];
                if(dataList[i].startsWith('SEQUENCE')) event.sequence = dataLine[1];
                if(dataList[i].startsWith('STATUS')) event.status = dataLine[1];
                if(dataList[i].startsWith('TRANSP')) event.transp = dataLine[1];
                
                if(dataList[i].startsWith('DTSTART')) {
                    
                    const dtstart = {};

                    if(dataLine[0].includes(';')) {
                        
                        const dtstartLine = dataLine[0].split(';');
                        
                        if(dtstartLine[1].startsWith('TZID')) dtstart.tzid = dtstartLine[1].split('=')[1];
                        if(dtstartLine[1].startsWith('VALUE')) dtstart.value = dtstartLine[1].split('=')[1];						
                       
                    }

                    dtstart.val = dataLine[1];
                        
                    event.dtstart = dtstart;
                }
                
                if(dataList[i].startsWith('DTEND')) {
                    
                    const dtend = {};

                    if(dataLine[0].includes(';')) {
                        
                        const dtendLine = dataLine[0].split(';');
                        
                        if(dtendLine[1].startsWith('TZID')) dtend.tzid = dtendLine[1].split('=')[1];
                        if(dtendLine[1].startsWith('VALUE')) dtend.value = dtendLine[1].split('=')[1];						
                    }
                    
                    dtend.val = dataLine[1];

                    event.dtend = dtend;
                }
                
            } while(!dataList[i].startsWith('END:VEVENT'));
            
            if(!object.events) object.events = [];
            
            object.events.push(event);
        }
        
    }

    return object;
}

module.exports = {
    parse
};