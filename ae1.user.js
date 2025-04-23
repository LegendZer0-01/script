// ==UserScript==
// @name         Astro Empires Debris Analyzer
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Robust debris analysis with cross-system support
// @author       Your Name
// @match        https://*.astroempires.com/credits.aspx?view=debris_info*
// @icon         https://www.google.com/s2/favicons?domain=astroempires.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      *.astroempires.com
// @require      https://cdn.jsdelivr.net/npm/xpath@0.0.32
// ==/UserScript==

(function() {
    'use strict';

    // ========================
    // UI Configuration
    // ========================
    GM_addStyle(`
        .ae-progress-container {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 240px;
            background: rgba(0,0,0,0.95);
            padding: 15px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            z-index: 10000;
            color: #fff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        }
        .ae-progress-bar {
            height: 18px;
            background: #2a2a2a;
            border-radius: 4px;
            overflow: hidden;
            margin: 12px 0;
        }
        .ae-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4CAF50, #45a049);
            width: 0%;
            transition: width 0.4s ease;
        }
        .ae-status-text {
            font-size: 13px;
            text-align: center;
            line-height: 1.4;
            min-height: 36px;
        }
        .ae-status-error { color: #ff6666; }
        .ae-help-box {
            display: none;
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0,0,0,0.95);
            color: #fff;
            padding: 15px;
            border-radius: 8px;
            z-index: 10000;
            max-width: 300px;
        }
    `);

    const CONFIG = {
        REQUEST_DELAY: 700,
        MAX_RETRIES: 3,
        CREDIT_TOLERANCE: 0.05, // 5% 
        TIMEOUT: 15000
    };

    // ========================
    // Core System
    // ========================
    let state = {
        logs: [],
        processedFleets: 0,
        totalFleets: 0,
        progressUI: null
    };

    function createProgressUI() {
        const container = document.createElement('div');
        container.className = 'ae-progress-container';
        container.innerHTML = `
            <div class="ae-progress-bar">
                <div class="ae-progress-fill"></div>
            </div>
            <div class="ae-status-text">Initializing analyzer...</div>
        `;
        document.body.appendChild(container);
        return {
            container,
            bar: container.querySelector('.ae-progress-fill'),
            status: container.querySelector('.ae-status-text')
        };
    }

    function showHelp() {
        const help = document.createElement('div');
        help.className = 'ae-help-box';
        help.innerHTML = `
            <h3 style="margin:0 0 10px 0">Troubleshooting Guide</h3>
            <p>Common solutions:</p>
            <ul style="padding-left:20px;margin:0">
                <li>Disable ad/script blockers</li>
                <li>Refresh after login</li>
                <li>Check browser console (F12)</li>
            </ul>
            <button onclick="this.parentElement.remove()" 
                style="float:right; margin-top:10px; padding:4px 12px">
                Close
            </button>
        `;
        document.body.appendChild(help);
        setTimeout(() => help.style.display = 'block', 100);
    }

    // ========================
    // Environment Checks
    // ========================
    function verifyEnvironment() {
        const requiredElements = [
            '#credits_debris-info',
            '.box-title-center',
            'a[href^="fleet.aspx?fleet="]'
        ];

        const missing = requiredElements.filter(selector => 
            !document.querySelector(selector)
        );

        if (missing.length > 0) {
            throw new Error(`Missing elements: ${missing.join(', ')}`);
        }

        if (typeof GM_xmlhttpRequest === 'undefined') {
            showHelp();
            throw new Error('Tampermonkey API unavailable - check permissions');
        }
    }

    // ========================
    // Data Processing
    // ========================
    async function fetchWithRetry(url) {
        let retries = CONFIG.MAX_RETRIES;
        
        while (retries > 0) {
            try {
                return await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: url,
                        timeout: CONFIG.TIMEOUT,
                        onload: (res) => res.status >= 400 
                            ? reject(`HTTP ${res.status}`) 
                            : resolve(res.responseText),
                        onerror: reject
                    });
                });
            } catch (error) {
                retries--;
                if (retries === 0) throw error;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    function parsePlayer(fleetDoc) {
        const selectors = [
            // CSS Selectors
            'table.layout tr:nth-of-type(2) td:first-child a[href*="profile.aspx"]',
            'td:has(a[href^="profile.aspx?player="])',
            // XPath
            '//td[contains(., "Player")]/following-sibling::td//a[contains(@href, "profile")]'
        ];

        for (const selector of selectors) {
            try {
                const node = selector.startsWith('//')
                    ? document.evaluate(selector, fleetDoc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue
                    : fleetDoc.querySelector(selector);

                if (node) return node.textContent.trim();
            } catch (e) {
                state.logs.push(`Selector failed: ${selector} - ${e.message}`);
            }
        }
        return null;
    }

    function parseRecyclers(fleetDoc) {
        try {
            const rows = Array.from(fleetDoc.querySelectorAll('tr'));
            const recyclerRow = rows.find(tr => {
                const tds = tr.querySelectorAll('td');
                return tds.length >= 2 && 
                    (/recycler/i.test(tds[0].textContent) || 
                     tds[0].querySelector('b:contains("Recycler")'));
            });

            if (!recyclerRow) return 0;

            const countCell = recyclerRow.querySelector('td:nth-child(2)');
            return parseInt((countCell?.textContent || '0').replace(/\D/g, ''), 10) || 0;
        } catch (e) {
            state.logs.push(`Recycler parse error: ${e.message}`);
            return 0;
        }
    }

    // ========================
    // Core Logic
    // ========================
    async function processFleets(mapUrl) {
        try {
            const mapHTML = await fetchWithRetry(mapUrl);
            const mapDoc = new DOMParser().parseFromString(mapHTML, 'text/html');
            
            const fleetIds = new Set();
            const links = mapDoc.querySelectorAll('a[href^="fleet.aspx?fleet="]');
            links.forEach(link => {
                const url = new URL(link.href, mapUrl);
                const fleetId = url.searchParams.get('fleet');
                if (fleetId) fleetIds.add(fleetId);
            });

            const fleetEntries = [];
            const fleetUrls = Array.from(fleetIds).map(id => 
                new URL(`fleet.aspx?fleet=${id}`, mapUrl).href
            );

            state.totalFleets = fleetUrls.length;
            if (state.totalFleets === 0) throw new Error('No fleets found');

            for (const [index, url] of fleetUrls.entries()) {
                await new Promise(r => setTimeout(r, CONFIG.REQUEST_DELAY));
                
                try {
                    const fleetHTML = await fetchWithRetry(url);
                    const fleetDoc = new DOMParser().parseFromString(fleetHTML, 'text/html');
                    
                    const player = parsePlayer(fleetDoc);
                    if (!player) {
                        state.logs.push(`Skipped fleet: No player link (${url})`);
                        continue;
                    }

                    const recyclers = parseRecyclers(fleetDoc);
                    if (recyclers < 1) continue;

                    fleetEntries.push({
                        player,
                        recyclers,
                        credits: recyclers * 10,
                        fleetId: url.split('=')[1]
                    });

                    // Update progress
                    state.processedFleets = index + 1;
                    const percent = (state.processedFleets / state.totalFleets * 100).toFixed(1);
                    state.progressUI.bar.style.width = `${percent}%`;
                    state.progressUI.status.textContent = 
                        `Processed ${state.processedFleets}/${state.totalFleets} fleets`;

                } catch (error) {
                    state.logs.push(`Fleet error: ${error.message}`);
                }
            }

            return fleetEntries;

        } catch (error) {
            throw new Error(`Fleet processing failed: ${error.message}`);
        }
    }

    function matchUnknowns(fleetEntries) {
        const unknowns = Array.from(document.querySelectorAll('#credits_debris-info tr'))
            .map(row => {
                const cells = row.querySelectorAll('td');
                return cells.length === 2 && cells[0].textContent.trim() === 'Unknown'
                    ? { row, credits: parseInt(cells[1].textContent.replace(/\D/g, ''), 10) }
                    : null;
            })
            .filter(Boolean);

        let matches = 0;
        const usedIds = new Set();

        unknowns.forEach(entry => {
            const tolerance = entry.credits * CONFIG.CREDIT_TOLERANCE;
            const candidates = fleetEntries.filter(e => 
                !usedIds.has(e.fleetId) && 
                Math.abs(e.credits - entry.credits) <= tolerance
            );

            if (candidates.length > 0) {
                const bestMatch = candidates.reduce((a, b) => 
                    Math.abs(a.credits - entry.credits) < Math.abs(b.credits - entry.credits) ? a : b
                );
                
                entry.row.cells[0].innerHTML = `
                    <span style="color: #76ff03; font-weight:600">
                        ${bestMatch.player}
                    </span>
                `;
                usedIds.add(bestMatch.fleetId);
                matches++;
            }
        });

        return matches;
    }

    // ========================
    // Main Execution
    // ========================
    async function main() {
        try {
            verifyEnvironment();
            state.progressUI = createProgressUI();
            
            const titleEl = document.querySelector('.box-title-center');
            const coords = titleEl.textContent.match(/B\d+:\d+:\d+:\d+/)?.[0];
            if (!coords) throw new Error('Coordinates not found');
            
            const mapUrl = new URL(`map.aspx?loc=${coords}`, location.href).href;
            const fleetEntries = await processFleets(mapUrl);
            
            const matches = matchUnknowns(fleetEntries);
            state.progressUI.status.textContent = matches > 0
                ? `✅ Success: Matched ${matches} players`
                : "⚠️ No matches found - check console";
            
            // Final logging
            console.log('Processing complete');
            console.table(fleetEntries);
            console.log('System logs:', state.logs);

        } catch (error) {
            state.progressUI.status.classList.add('ae-status-error');
            state.progressUI.status.textContent = `❌ Error: ${error.message}`;
            console.error('Fatal error:', error, '\nLogs:', state.logs);
            showHelp();
        }
    }

    // Initialize
    const observer = new MutationObserver((_, obs) => {
        if (document.querySelector('#credits_debris-info')) {
            obs.disconnect();
            main();
        }
    });
    observer.observe(document, { childList: true, subtree: true });
})();
