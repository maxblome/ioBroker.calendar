/*
    ioBroker.vis template Widget-Set

    version: '0.0.1'

    Copyright 2019 Author author@mail.com
*/
'use strict';

// add translations for edit mode
$.get( 'adapter/template/words.js', function(script) {
    let translation = script.substring(script.indexOf('{'), script.length);
    translation = translation.substring(0, translation.lastIndexOf(';'));
    $.extend(systemDictionary, JSON.parse(translation));
});

vis.binds.calendar = {
    initCalendar: function(wid) {
        const events = new Map();
        let date_memory;
        let color;
        let isLoaded = false;
        let returnModus = 0;

        const d = new Date();

        renderPage(wid);
        setDateToMemory(d);
        loadCalendar(wid);
        
        function renderPage(wid) {
            vis.conn.getStates(wid + '*', function (err, states) {

                for(const state in states) {
                    
                    if(state.endsWith('events')) {

                        const eventsObj = JSON.parse(states[state].val);
                        const dayObj = {};
                        const date = states[state.replace('.events', '') + '.date'].val;

                        dayObj.events = eventsObj;

                        events.set(date, dayObj);

                    } else if(state.endsWith('color')) {

                        color = states[state].val;
                    }
                }

                isLoaded = true;
            });
        }

        function colorizeEvents(color) {
            const calendarEvents = document.getElementsByClassName('calendar-event');
        
            for (let k = 0; k < calendarEvents.length; k++) {
                calendarEvents[k].style.backgroundColor = color;
            }
        }

        async function loadCalendar(wid) {
            //aktuelles Datum holen (1. des Monats)
            let d = getDateFromMemory();
            //Monat ermitteln aus this_date (zählen beginnt bei 0, daher +1)
            let m = d.getMonth();
            //Jahr ermitteln aus this_date (YYYY)
            let y = d.getFullYear();
            //Monat und Jahr eintragen
            //document.all.calendar_month.innerHTML = getMonthname(m+1) + ' ' + y;
            document.getElementById(wid + '-calendar-month').innerHTML = getMonthname(m + 1) + ' ' + y;
            
            //ersten Tag des Monats festlegen
            let firstD = d;
            firstD.setDate(1);
            //Wochentag ermitteln vom 1. des übergebenen Monats (Wochentag aus firstD)
            let dateDay = firstD.getDay(); //So = 0, Mo = 1 … Sa = 6
            //Sonntag soll den Wert 7 darstellen -> Mo = 1 … So = 7
            dateDay = (dateDay == 0) ? 7: dateDay;
            //Speicher für aktuelle Zelle
            let entry = '';
            //Speicher für aktuellen Tag
            let zahl = '';
            //heutiges Datum ermitteln
            let hD = new Date();
            //ist event
            //falls event, dann darf der Rahmen
            //nicht vom isHolyday überschrieben werden
            let bEvent = false;
        
            //Alle Kalender Spalten durchzählen
            for (let i = 1; i <= 42; i++) {
                bEvent = false;
        
                //holen der aktuellen Zelle
                entry = document.getElementById(wid + '-calendar-entry-' + i);
                //errechnen der Tages Zahl
                zahl = (i + 1) - dateDay;
                //datum zusammenschreiben
                let dx = new Date(y, m, zahl);
                
                //Eintragen der Daten ab ersten Tag im Monat und wenn es ein gültiges Datum ist
                if (i >= dateDay && isValidDate(y, m, zahl)) {

                    entry.innerHTML = '<div>' + zahl + '</div>';
        
                    if(entry.classList.contains('calendar-entry-invisible')) entry.classList.remove('calendar-entry-invisible');
                
                    //Listener hinzufügen
                    entry.onclick = function(event) {
                        openDateDetails(wid, event.currentTarget.children[0].innerHTML)
                    };
                
                    //heutiges Datum hervorheben
                    if (hD.getDate() == dx.getDate() &&
                        hD.getMonth() == dx.getMonth() &&
                        hD.getYear() == dx.getYear()) {
                        if(!entry.classList.contains('calendar-entry-today')) entry.classList.add('calendar-entry-today');
                    } else {
                        if(entry.classList.contains('calendar-entry-today')) entry.classList.remove('calendar-entry-today');
                    }
        
                    //Events hinzufügen
                    do {
                        if(isLoaded) {
                            entry.appendChild(getEvents(y, m, zahl));
                        } else {
                            await sleep(100);
                        }
                    
                    } while(isLoaded == false);
                    
                    //Events einfärben
                    colorizeEvents(color);        
                } else {
                    
                    entry.innerHTML = '';
        
                    if(i >= dateDay) {//Wenn Kalenderende

                        if(!entry.classList.contains('calendar-entry-invisible')) entry.classList.add('calendar-entry-invisible');
                    
                    } else {//Wenn Kalenderanfang
                    
                        if(!entry.classList.contains('calendar-entry-invisible')) entry.classList.add('calendar-entry-invisible');
                    }
                }
            }
        }

        function sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        function nextMonth() {
            let d = getDateFromMemory();
            let m = d.getMonth() + 1;
            let y = d.getFullYear();

            //Falls Jahres wechsel
            if((m + 1) > 12) {
                m = 0;
                y = y + 1;
            }

            d = new Date(y, m, 1);
            setDateToMemory(d);
            loadCalendar();
        }

        function prevMonth() {
            let d = getDateFromMemory();
            let m = d.getMonth()+1;
            let y = d.getFullYear();

            //Falls Jahres1wechsel
            if((m-1) < 1) {
                m = 11;
                y = y - 1;
            } else {
                m = m - 2;
            }

            d = new Date(y, m, 1);
            setDateToMemory(d);
            loadCalendar();
        }

        function isValidDate(y, m, d) {
            //–Gibt Datum des letzten Tag des Monats aus–
            let thisDate = new Date(y, m, 1);
            //einen Tag weiter schalten
            thisDate.setMonth(thisDate.getMonth() + 1);
            //vom ersten Tag des nächsten monats
            //ein Tag abziehen
            thisDate.setTime(thisDate.getTime() - 12*3600*1000)
    
            if(d > thisDate.getDate()) {
                return false;
            } else {
                return true;
            }
        }

        function setDateToMemory(d) {
            //document.getElementById('date_memory').innerHTML = d.getFullYear() + ',' + (d.getMonth() + 1) + ',' + d.getDate();
            date_memory = d.getFullYear() + ',' + (d.getMonth() + 1) + ',' + d.getDate();
        }

        function getDateFromMemory() {
            //var s = document.getElementById('date_memory').innerHTML;
            let s = date_memory;
            let z = s.split(',');
            return new Date(z[0], z[1] - 1, z[2]);
        }

        function getMonthname(monthnumber) {
            switch(monthnumber) {
                case 1: return 'Januar';
                case 2: return 'Februar';
                case 3: return 'März';
                case 4: return 'April';
                case 5: return 'Mai';
                case 6: return 'Juni';
                case 7: return 'Juli';
                case 8: return 'August';
                case 9: return 'September';
                case 10: return 'Oktober';
                case 11: return 'November';
                case 12: return 'Dezember';
                default: return '-';
            }
        }

        function openDateDetails(wid, n) {

            let d = getDateFromMemory();
            d.setDate(n);
            
            let calendarEntryDetailContainer = document.getElementById(wid + '-calendar-entry-detail-container');
        
            calendarEntryDetailContainer.children[0].children[0].innerHTML = ((d.getDate() < 10) ? '0' + d.getDate() : d.getDate()) + '.' + 
            ((d.getMonth() + 1 < 10) ? '0' + (d.getMonth() + 1) : d.getMonth() + 1) + '.' + d.getFullYear();
            
            if(calendarEntryDetailContainer.classList.contains('calendar-entry-detail-hidden')) calendarEntryDetailContainer.classList.remove('calendar-entry-detail-hidden');
        }

        function closeDateDetails() {

            let calendarEntryDetailContainer = document.getElementById('calendar-entry-detail-container');
            
            if(!calendarEntryDetailContainer.classList.contains('calendar-entry-detail-hidden')) calendarEntryDetailContainer.classList.add('calendar-entry-detail-hidden');
        }

        function isHoliday(m,d) {
            //Monate fangen bei 0 an zuzählen
            m++;
            //festlegen der Feiertage
            let h = new Array(7);

            h[0] = '1.1';
            h[1] = '6.1';
            h[2] = '1.5';
            h[3] = '3.10';
            h[4] = '1.11';
            h[5] = '25.12';
            h[6] = '26.12';
            h[7] = '31.12';

            let iD;
            //Alle Daten Testen
            for ( var i = 0; i < h.length; i++) {
                iH = h[i].split('.');
                if (iH[0] == d && iH[1] == m) {
                    return true;
                }
            }
            //Wenn kein Feiertag gefunden
            return false;
        }

        function setReturnModus(returnIndex) {
            returnModus = returnIndex;
        }

        function getEvents(y, m, d) {
            //convertieren in int-Zahlen
            y = parseInt(y);
            m = parseInt(m);
            d = parseInt(d);
        
            //Monate fangen bei 0 an zuzählen
            m++;
        
            m = (m < 10) ? '0' + m : m;
            d = (d < 10) ? '0' + d : d;
            
            const dayObj = events.get(y + '-' + m + '-' + d);
            
            if(dayObj) {
                const eventObj = dayObj.events;
    
                if(eventObj.length > 0) {
    
                    const nodeEvents = document.createElement('div');
                    nodeEvents.classList.add('calendar-event-container');
    
                    for(let j = 0; j < eventObj.length; j++) {
    
                        const element = document.createElement('div');
                        element.classList.add('calendar-event');
                        
                        const text = document.createTextNode(eventObj[j].summary);
    
                        element.appendChild(text);
    
                        nodeEvents.appendChild(element);
                    }
    
                    return nodeEvents;
                }            
            }
        
            return document.createTextNode('');
        }
    }
};

// this code can be placed directly in template.html
/*vis.binds['template'] = {
    version: '0.0.1',
    showVersion: function () {
        if (vis.binds['template'].version) {
            console.log('Version template: ' + vis.binds['template'].version);
            vis.binds['template'].version = null;
        }
    },
    createWidget: function (widgetID, view, data, style) {
        let $div = $('#' + widgetID);
        // if nothing found => wait
        if (!$div.length) {
            return setTimeout(function () {
                vis.binds['template'].createWidget(widgetID, view, data, style);
            }, 100);
        }

        let text = '';
        text += 'OID: ' + data.oid + '</div><br>';
        text += 'OID value: <span class='myset-value'>' + vis.states[data.oid + '.val'] + '</span><br>';
        text += 'Color: <span style='color: ' + data.myColor + ''>' + data.myColor + '</span><br>';
        text += 'extraAttr: ' + data.extraAttr + '<br>';
        text += 'Browser instance: ' + vis.instance + '<br>';
        text += 'htmlText: <textarea readonly style='width:100%'>' + (data.htmlText || '') + '</textarea><br>';

        $('#' + widgetID).html(text);

        // subscribe on updates of value
        if (data.oid) {
            vis.states.bind(data.oid + '.val', function (e, newVal, oldVal) {
                $div.find('.template-value').html(newVal);
            });
        }
    }
};

//vis.binds['template'].showVersion();*/