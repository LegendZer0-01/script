// ==UserScript==
// @name         Astro Empires Debris Analyzer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Monitor the hourly credit grab from all shared guilds.
// @author       LegendZer0
// @match        https://*.astroempires.com/credits.aspx?view=debris_info*
// @icon         https://www.google.com/s2/favicons?domain=astroempires.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *.astroempires.com
// ==/UserScript==

(function() {
    'use strict';

    GM_addStyle(`
        .ae-progress-container {
            position: fixed;
            top: 10px;
            left: 10px;
            width: 150px;
            background: rgba(0,0,0,0.9);
            padding: 10px;
            border-radius: 5px;
            font-family: Arial;
            z-index: 9999;
            color: white;
        }
        .ae-progress-bar {
            height: 15px;
            background: #333;
            border-radius: 3px;
            overflow: hidden;
            margin: 5px 0;
        }
        .ae-progress-fill {
            height: 100%;
            background: #4CAF50;
            width: 0%;
            transition: width 0.3s ease;
        }
        .ae-status-text {
            font-size: 12px;
            text-align: center;
            margin-top: 5px;
        }
        .ae-status-error { color: #ff4444; }
    `);

    const REQUEST_DELAY = 150;
    let logs = [];
    let processedFleets = 0;
    let totalFleets = 0;

    function createProgressUI() {
        const container = document.createElement('div');
        container.className = 'ae-progress-container';

        container.innerHTML = `
            <div class="ae-progress-bar">
                <div class="ae-progress-fill"></div>
            </div>
            <div class="ae-status-text">Initializing...</div>
        `;

        document.body.appendChild(container);
        return {
            bar: container.querySelector('.ae-progress-fill'),
            status: container.querySelector('.ae-status-text')
        };
    }

    function updateProgress(progress, message, isError = false) {
        const percentage = totalFleets > 0
            ? Math.min(100, (processedFleets / totalFleets * 100)).toFixed(1)
            : 0;

        progress.bar.style.width = `${percentage}%`;
        progress.status.textContent = message;
        progress.status.className = `ae-status-text${isError ? ' ae-status-error' : ''}`;

        logs.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    }

    async function fetchUrl(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response.responseText);
                    } else {
                        reject(`HTTP ${response.status}`);
                    }
                },
                onerror: (error) => reject(error)
            });
        });
    }

    function parseHTML(html) {
        return new DOMParser().parseFromString(html, "text/html");
    }

    async function processFleets(mapUrl, progress) {
        const fleetEntries = [];
        try {
            const mapHTML = await fetchUrl(mapUrl);
            const mapDoc = parseHTML(mapHTML);

            const fleetIds = new Set();
            const allLinks = mapDoc.querySelectorAll('a[href^="fleet.aspx?fleet="]');
            allLinks.forEach(link => {
                const url = new URL(link.href, mapUrl);
                const fleetId = url.searchParams.get('fleet');
                if (fleetId) fleetIds.add(fleetId);
            });

            const uniqueFleetUrls = Array.from(fleetIds).map(id =>
                new URL(`fleet.aspx?fleet=${id}`, mapUrl).href
            );

            totalFleets = uniqueFleetUrls.length;
            processedFleets = 0;

            if (totalFleets === 0) {
                updateProgress(progress, "❌ No fleets found", true);
                return fleetEntries;
            }

            updateProgress(progress, "🚀 Starting fleet processing...");

            for (const [index, fleetUrl] of uniqueFleetUrls.entries()) {
                try {
                    if (index > 0) await new Promise(r => setTimeout(r, REQUEST_DELAY));

                    const fleetId = fleetUrl.split('=')[1];
                    processedFleets = index + 1;

                    const fleetHTML = await fetchUrl(fleetUrl);
                    const fleetDoc = parseHTML(fleetHTML);

                    // Player detection
                    const layoutTable = fleetDoc.querySelector('table.layout');
                    const dataRow = layoutTable?.querySelector('tr:not(:first-child)');
                    const playerLink = dataRow?.querySelector('td:first-child a[href^="profile.aspx?player="]');

                    if (!playerLink) {
                        console.log(`Skipped fleet ${fleetId} (no player link)`);
                        continue;
                    }

                    // Recycler detection
                    let recyclers = 0;
                    const recyclerRow = [...fleetDoc.querySelectorAll('tr')].find(tr => {
                        const tds = tr.querySelectorAll('td');
                        return tds.length >= 2 &&
                            (tds[0].textContent.trim() === 'Recycler' ||
                             tds[0].innerHTML === '<b>Recycler</b>');
                    });

                    if (recyclerRow) {
                        const countStr = recyclerRow.querySelector('td:nth-child(2)')?.textContent.replace(/,/g, '');
                        recyclers = parseInt(countStr, 10) || 0;
                    }

                    if (recyclers > 0) {
                        const playerName = playerLink.textContent.trim();
                        fleetEntries.push({
                            player: playerName,
                            recyclers: recyclers,
                            credits: recyclers * 10,
                            fleetId: fleetId
                        });
                        console.log(`Processed: ${playerName} (${recyclers} recyclers)`);
                    }

                    updateProgress(progress, `🛸 Processed ${processedFleets}/${totalFleets} fleets`);

                } catch (error) {
                    console.error(`Fleet error: ${error}`);
                    logs.push(`Fleet error: ${error}`);
                }
            }

            return fleetEntries;

        } catch (error) {
            updateProgress(progress, "❌ Failed to load map", true);
            console.error('Map error:', error);
            return fleetEntries;
        }
    }

    function updateUnknownPlayers(fleetEntries) {
        const unknownRows = Array.from(document.querySelectorAll('#credits_debris-info tr'))
            .filter(row => {
                const cells = row.querySelectorAll('td');
                return cells.length === 2 &&
                    cells[0].textContent.trim().toLowerCase() === 'unknown' &&
                    !isNaN(parseInt(cells[1].textContent.replace(/,/g, '')));
            });

        let matches = 0;
        const usedFleets = new Set();

        unknownRows.forEach(row => {
            const credits = parseInt(row.cells[1].textContent.replace(/,/g, ''), 10);
            const match = fleetEntries.find(entry =>
                entry.credits === credits &&
                !usedFleets.has(entry.fleetId)
            );

            if (match) {
                row.cells[0].innerHTML = `<span style="color: #c4ff7c;">${match.player}</span>`;
                usedFleets.add(match.fleetId);
                matches++;
            }
        });

        console.log(`Matched ${matches} of ${unknownRows.length} unknown players`);
        return matches;
    }

    async function main() {
        const progressUI = createProgressUI();

        try {
            // Get coordinates
            const titleEl = document.querySelector('.box-title-center');
            if (!titleEl) throw new Error("Debris title not found");
            const coords = titleEl.textContent.match(/B\d+:\d+:\d+:\d+/)?.[0] || 'unknown';

            // Process fleets
            const mapUrl = new URL(`map.aspx?loc=${encodeURIComponent(coords)}`, location.href).href;
            const fleetEntries = await processFleets(mapUrl, progressUI);

            // Update UI
            const matchedCount = updateUnknownPlayers(fleetEntries);
            updateProgress(progressUI, `✅ Done! <br /> Matched ${matchedCount} players`);

            // Final logging
            console.table(fleetEntries);
            console.log('Complete logs:', logs);

        } catch (error) {
            updateProgress(progressUI, `❌ Error: ${error.message}`, true);
            console.error('Main error:', error);
        }
    }

    // Start when debris table loads
    const observer = new MutationObserver((mutations, obs) => {
        if (document.querySelector('#credits_debris-info')) {
            obs.disconnect();
            main();
        }
    });

    observer.observe(document, {
        childList: true,
        subtree: true
    });
})();
