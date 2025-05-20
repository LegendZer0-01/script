// ==UserScript==
// @name         Fleet Scan Table
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Show all fleets with arrival time features. Filter by Guild & Filter only fleet that will arrive within a certain timeframe. Works on all Servers and on Any Skin.
// @author       LegendZer0
// @match        https://*.astroempires.com/map.aspx*
// @grant        GM_xmlhttpRequest
// @connect      astroempires.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function () {
    'use strict';
    const $ = window.jQuery;

    // Default player/guild values to fall back on if unknown
    let defaultPlayer = '[Unknown]';
    let defaultGuild = 'UNK';

    function fetchDefaultPlayer() {
        GM_xmlhttpRequest({
            method: 'GET',
            url: 'https://' + location.hostname + '/profile.aspx?empty=empty',
            onload: function (response) {
                const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                const $doc = $(doc);

                let playerName = $doc.find('.profile_box-title-center').text().trim();
                if (!playerName) {
                    playerName = $doc.find('th.th_header2').eq(1).text().trim();
                }

                if (playerName) {
                    defaultPlayer = playerName;
                    const match = playerName.match(/^\[(.+?)\]/);
                    if (match) defaultGuild = match[1];
                }
            }
        });
    }

    fetchDefaultPlayer();

    // --- CSS ---
    $('<style>').text(`
        #fleetscan {text-align:center;}
        #fleetscan table {margin:auto;}
        #fleetscan table td, #fleetscan table th {
            border: 1px solid #555;
            padding: 4px 6px;
            text-align: right;
        }
        #fleetscan table th:first-child, #fleetscan table td:first-child {
            text-align: left;
        }
        #fleetscan table tr th:nth-child(even),
        #fleetscan table tr td:nth-child(even) {
            background-color: #1a1a1a;
        }
        #fleetscan table tr th:nth-child(odd),
        #fleetscan table tr td:nth-child(odd) {
            background-color: #111;
        }
        #guildFilter {
            background: #444;
            color: #fff;
            padding: 5px;
            margin-bottom: 10px;
            margin-right: 10px;
        }
        .fleet-status {
            font-weight: bold;
        }
        .status-inbound {
            color: #ff9;
        }
        .status-landed {
            color: #9f9;
        }
        .arrival-time {
            font-size: 0.8em;
            color: #ccc;
            display: block;
        }
        .controls-row {
            margin-bottom: 10px;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-wrap: wrap;
        }
        .time-input {
            background: #444;
            color: #fff;
            border: 1px solid #888;
            padding: 5px;
            margin-right: 10px;
            width: 120px;
        }
        .sort-btn {
            background: #444;
            color: #fff;
            border: 1px solid #888;
            padding: 5px 10px;
            cursor: pointer;
            margin-right: 10px;
        }
    `).appendTo('head');

    const unitOrder = ['FT', 'BO', 'HB', 'IB', 'CV', 'RC', 'DE', 'FR', 'IF', 'SS', 'OS', 'CR', 'CA', 'HC', 'BS', 'FC', 'DN', 'TI', 'LE', 'DS'];
    const unitMap = {
        'Fighters': 'FT', 'Bombers': 'BO', 'Heavy Bombers': 'HB', 'Ion Bombers': 'IB',
        'Corvette': 'CV', 'Recycler': 'RC', 'Destroyer': 'DE', 'Frigate': 'FR',
        'Ion Frigate': 'IF', 'Scout Ship': 'SS', 'Outpost Ship': 'OS', 'Cruiser': 'CR', 'Carrier': 'CA',
        'Heavy Cruiser': 'HC', 'Battleship': 'BS', 'Fleet Carrier': 'FC',
        'Dreadnought': 'DN', 'Titan': 'TI', 'Leviathan': 'LE', 'Death Star': 'DS'
    };

    const container = $('<div id="fleetscan">', {
        css: {
            width: '800px',
            margin: 'auto',
            marginBottom: '200px',
            background: '#222',
            color: '#fff',
            padding: '10px',
            zIndex: 10000,
            border: '1px solid #555',
            borderRadius: '6px',
            maxHeight: '90%',
            overflow: 'auto'
        }
    }).appendTo('#move_to_destination_container');

    const startButton = $('<button>', {
        text: 'Scan Fleets',
        css: {
            background: '#444',
            color: '#fff',
            border: '1px solid #888',
            padding: '5px 10px',
            cursor: 'pointer',
            marginBottom: '10px',
            marginTop: '10px'
        }
    }).appendTo(container);

    // Create controls row
    const controlsRow = $('<div class="controls-row">').appendTo(container);

    // Guild Filter Dropdown
    const guildFilterLabel = $('<label>', {
        text: 'Filter by Guild: ',
        css: { color: '#fff', marginRight: '10px' }
    }).appendTo(controlsRow);

    const guildFilter = $('<select id="guildFilter">').appendTo(controlsRow);

    // Time Filter Input
    $('<label>', {
        text: 'Show inbound fleets landing before: ',
        css: { color: '#fff', marginRight: '10px' }
    }).appendTo(controlsRow);

    const timeFilter = $('<input type="text" class="time-input" placeholder="HH:MM:SS">').appendTo(controlsRow);

    // Sort Buttons
    $('<button class="sort-btn">').text('Sort by Arrival').click(() => {
        sortByArrival();
    }).appendTo(controlsRow);

    $('<button class="sort-btn">').text('Sort by Guild').click(() => {
        sortByGuild();
    }).appendTo(controlsRow);

    const resultsDiv = $('<div>', { css: { fontSize: '12px', marginTop: '10px', color: '#ccc' } }).appendTo(container);
    const table = $('<table>', {
        border: 1,
        cellpadding: 5,
        cellspacing: 0,
        css: {
            marginTop: '10px',
            fontSize: '11px',
            borderCollapse: 'collapse',
            border: 'solid',
            background: '#111',
            color: '#ccc'
        }
    }).appendTo(container);

    const headerRow = $('<tr>').appendTo(table);
    $('<th>').text('Player').appendTo(headerRow);
    unitOrder.forEach(u => $('<th>').text(u).appendTo(headerRow));
    $('<th>').text('Fleet Size').appendTo(headerRow);
    $('<th>').text('Status').appendTo(headerRow);

    let fleetData = [];
    let guilds = new Set();

    // Convert time string to seconds
    function timeToSeconds(timeStr) {
        if (!timeStr) return Infinity;
        const parts = timeStr.split(':').map(Number);
        if (parts.length !== 3) return Infinity;
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }

    // Parse arrival time text to seconds
    function parseArrivalTime(text) {
        if (!text) return Infinity;
        // Match formats like "0:01:00" or "1:23:45"
        const match = text.match(/(\d+):(\d+):(\d+)/);
        if (!match) return Infinity;
        return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
    }

    function sortByArrival() {
        fleetData.sort((a, b) => {
            // Landed fleets go to the bottom
            if (a.status === 'Landed' && b.status === 'Inbound') return 1;
            if (a.status === 'Inbound' && b.status === 'Landed') return -1;
            if (a.status === 'Landed' && b.status === 'Landed') return 0;

            // Sort inbound fleets by arrival time
            const aTime = parseArrivalTime(a.arrivalTime);
            const bTime = parseArrivalTime(b.arrivalTime);
            return aTime - bTime;
        });
        renderTable(fleetData);
    }

    function sortByGuild() {
        fleetData.sort((a, b) => {
            const guildCompare = a.guild.localeCompare(b.guild);
            if (guildCompare !== 0) return guildCompare;
            return a.player.localeCompare(b.player);
        });
        renderTable(fleetData);
    }

    startButton.click(() => {
        resultsDiv.html('Scanning fleets...');
        table.find('tr:gt(0)').remove();

        // Get all fleet rows from the map page
        const fleetRows = $('table.listing tr:has(a[href*="fleet.aspx?fleet="])');
        if (fleetRows.length === 0) {
            resultsDiv.text('No fleets found.');
            return;
        }

        fleetData = []; // Reset fleet data
        guilds = new Set();

        // Process each fleet row
        fleetRows.each(function() {
            const $row = $(this);
            const fleetLink = $row.find('a[href*="fleet.aspx?fleet="]').attr('href');
            const playerLink = $row.find('a[href*="profile.aspx?player="]').attr('href');
            const player = $row.find('a[href*="profile.aspx?player="]').text().trim() || defaultPlayer;

            // Check for arrival time (inbound fleet)
            const arrivalCell = $row.find('td[id^="timer"]');
            const status = arrivalCell.length > 0 ? 'Inbound' : 'Landed';
            const arrivalTime = arrivalCell.length > 0 ? arrivalCell.text().trim() : '';

            // Handle guild detection
            let guild = player.match(/^\[(.+?)\]/)?.[1] || 'Unguilded';
            guilds.add(guild);

            // Create fleet object
            const fleet = {
                player: player,
                guild: guild,
                playerLink: playerLink || 'profile.aspx?player=0',
                status: status,
                arrivalTime: arrivalTime,
                arrivalSeconds: parseArrivalTime(arrivalTime),
                fleetLink: fleetLink,
                units: {} // Will be populated when we scan the fleet page
            };

            fleetData.push(fleet);
        });

        // Now scan each fleet page to get unit composition
        const processNextFleet = (i) => {
            if (i >= fleetData.length) {
                resultsDiv.text('Done.');
                renderTable(fleetData);
                populateGuildFilter(guilds);
                return;
            }

            const fleet = fleetData[i];
            const url = new URL(fleet.fleetLink, location.origin).href;

            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                onload: function (response) {
                    const doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                    const $fleet = $(doc);

                    // Parse units
                    $fleet.find('table.layout tr').each(function () {
                        const unitName = $(this).find('td').first().text().trim();
                        const shortName = unitMap[unitName];
                        if (!shortName) return;

                        const qty = parseInt($(this).find('td').eq(1).text().replace(/,/g, ''), 10) || 0;
                        if (qty > 0) {
                            fleet.units[shortName] = qty;
                        }
                    });

                    resultsDiv.text(`Processed ${i + 1} of ${fleetData.length} fleets...`);
                    setTimeout(() => processNextFleet(i + 1), Math.random() * 500 + 100);
                }
            });
        };

        processNextFleet(0);
    });

    const unitValues = {
        FT: 5, BO: 10, HB: 30, IB: 60, CV: 20, RC: 30, DE: 40, FR: 80,
        IF: 120, SS: 40, OS: 100, CR: 200, CA: 400, HC: 500,
        BS: 2000, FC: 2500, DN: 10000, TI: 50000, LE: 200000, DS: 500000
    };

    function renderTable(data) {
        const filteredGuild = $('#guildFilter').val();
        const filterTime = timeToSeconds(timeFilter.val());

        table.find('tr:gt(0)').remove();

        data.forEach(fleet => {
            // Apply guild filter
            if (filteredGuild && filteredGuild !== '' && fleet.guild !== filteredGuild) return;

            // Apply time filter (only to inbound fleets, landed fleets always show)
            if (fleet.status === 'Inbound' && filterTime !== Infinity && fleet.arrivalSeconds > filterTime) {
                return;
            }

            const row = $('<tr>').appendTo(table);

            // Player column with link
            $('<td>').append(
                $('<a>').attr('href', fleet.playerLink).text(fleet.player)
            ).appendTo(row);

            // Unit columns
            let total = 0;
            unitOrder.forEach(unit => {
                const qty = fleet.units[unit] || 0;
                total += qty * (unitValues[unit] || 0);
                $('<td>').text(qty ? qty.toLocaleString() : '').appendTo(row);
            });

            // Fleet size column
            $('<td>').text(total.toLocaleString()).appendTo(row);

            // Status column
            const statusClass = fleet.status === 'Inbound' ? 'status-inbound' : 'status-landed';
            const statusCell = $('<td>').append(
                $('<span>').addClass('fleet-status ' + statusClass).text(fleet.status)
            );

            if (fleet.status === 'Inbound' && fleet.arrivalTime) {
                statusCell.append(
                    $('<span>').addClass('arrival-time').text(fleet.arrivalTime)
                );
            }

            statusCell.appendTo(row);
        });
    }

    function populateGuildFilter(guilds) {
        guildFilter.empty();
        $('<option>').val('').text('-- All --').appendTo(guildFilter);
        [...guilds].sort().forEach(g => $('<option>').val(g).text(g).appendTo(guildFilter));
    }

})();
