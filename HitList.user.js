// ==UserScript==
// @name         HitList Manager Pro
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds hitlist management and safe fleet removal system
// @author       LegendZer0
// @match        https://*.astroempires.com/fleet.aspx?fleet=*
// @match        https://*.astroempires.com/map.aspx?loc=*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const HITLIST_KEY = 'fleetHitlist';
    const HIGHLIGHT_CLASS = 'custom-hitlist';
    const SAFE_CLASS = 'safe';
    const TABLE_SELECTOR = 'table.layout.listing.btnlisting.tbllisting1';

    let hitlist = GM_getValue(HITLIST_KEY, []);

    function saveHitlist() {
        GM_setValue(HITLIST_KEY, hitlist);
    }

    function addHitlistButtons() {
        const playerCells = document.querySelectorAll(`${TABLE_SELECTOR} td:nth-child(2)`);

       playerCells.forEach(cell => {
    if (cell.querySelector('.hitlist-btn')) return;

    const playerName = cell.textContent.trim();
    const btn = document.createElement('a'); // Changed to anchor for better text styling
    btn.className = `hitlist-btn ${hitlist.includes(playerName) ? 'active' : ''}`;
    btn.innerHTML = hitlist.includes(playerName) ? '❌' : '🛒';
    btn.style.cssText = `
        margin-left: 8px;
        cursor: pointer;
        text-decoration: none;
        font-size: 1.2em;
        vertical-align: middle;
    `;

    btn.onclick = (e) => {
        e.preventDefault();
        const index = hitlist.indexOf(playerName);
        if (index > -1) {
            hitlist.splice(index, 1);
            btn.innerHTML = '🛒';
            btn.classList.remove('active');
        } else {
            hitlist.push(playerName);
            btn.innerHTML = '❌';
            btn.classList.add('active');
        }
        saveHitlist();

        setTimeout(() => {
            if (window.location.href.includes('fleet.aspx')) {
                styleTableRows();
            }
        }, 100);
    };

    cell.appendChild(btn);
});
    }

    function styleTableRows() {
        const tables = document.querySelectorAll(TABLE_SELECTOR);
        tables.forEach(table => {
            const rows = table.querySelectorAll('tr:not(.listing-header)');
            let hasVisibleRows = false;

            rows.forEach(row => {
                row.classList.remove(HIGHLIGHT_CLASS, SAFE_CLASS);
                const playerCell = row.querySelector('td:nth-child(2)');
                const playerName = playerCell?.textContent.trim();

                if (playerName && hitlist.includes(playerName)) {
                    row.classList.add(HIGHLIGHT_CLASS);
                    hasVisibleRows = true;
                } else {
                    row.classList.add(SAFE_CLASS);
                }
            });

            // Prevent entire table from disappearing
            if (!hasVisibleRows) {
                tables.forEach(t => t.querySelectorAll('tr').forEach(tr => {
                    tr.classList.remove(SAFE_CLASS);
                    tr.style.display = '';
                }));
            }
        });
    }

    const style = document.createElement('style');
    style.textContent = `
        .${SAFE_CLASS} {
            display: none !important;
        }
        .${HIGHLIGHT_CLASS} {
            display: table-row !important;
            border-left: 3px solid #cc0000 !important;
        }
        .hitlist-btn {
        color: #2196F3; /* Blue color for cart */
        transition: transform 0.2s ease;
        display: inline-block;
        }

        .hitlist-btn.active {
        color: #ff4444; /* Red color for X */
        }

        .hitlist-btn:hover {
        transform: scale(1.2);
        text-decoration: none;
        }
    `;
    document.head.appendChild(style);

    if (window.location.href.includes('map.aspx')) {
        addHitlistButtons();
        new MutationObserver(addHitlistButtons)
            .observe(document, { subtree: true, childList: true });
    } else {
        styleTableRows();
        setInterval(() => {
            hitlist = GM_getValue(HITLIST_KEY, []);
            styleTableRows();
        }, 1000);
    }
})();
