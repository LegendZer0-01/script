// ==UserScript==
// @name         Astroempires Cart Icon Only
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Adds cart icons to Astroempires without conversion
// @author       Troll
// @match        https://*.astroempires.com/fleet.aspx?fleet=*
// @match        https://*.astroempires.com/map.aspx?loc=*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to add cart icons
    function addCartIcons() {
        const playerCells = document.querySelectorAll('table.layout.listing.btnlisting.tbllisting1 td:nth-child(2)');

        playerCells.forEach(cell => {
            if (cell.querySelector('.cart-icon')) return;

            const icon = document.createElement('span');
            icon.className = 'cart-icon';
            icon.innerHTML = '🛒';
            icon.style.cssText = `
                margin-left: 8px;
                font-size: 1.2em;
                vertical-align: middle;
                display: inline-block;
                opacity: 0.7;
            `;

            cell.appendChild(icon);
        });
    }

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .cart-icon {
            color: #2196F3;
            vertical-align: middle;
        }
    `;
    document.head.appendChild(style);

    // Initialize
    if (window.location.href.includes('map.aspx') || window.location.href.includes('fleet.aspx')) {
        addCartIcons();

        // Observe for dynamic content
        new MutationObserver(addCartIcons)
            .observe(document, { subtree: true, childList: true });

        // Check periodically
        setInterval(addCartIcons, 2000);
    }
})();