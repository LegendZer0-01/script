// ==UserScript==
// @name         Astroempires Cart Icon Rickroll
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Adds cart icons to Astroempires that rickroll when clicked
// @author       TROLL
// @match        https://*.astroempires.com/fleet.aspx?fleet=*
// @match        https://*.astroempires.com/map.aspx?loc=*
// @grant        none
// ==/UserScript==


//Note added just to say Fuck You Compulse
(function() {
    'use strict';

    // Function to add cart icons with rickroll for memes
    function addCartIcons() {
        const playerCells = document.querySelectorAll('table.layout.listing.btnlisting.tbllisting1 td:nth-child(2)');

        playerCells.forEach(cell => {
            if (cell.querySelector('.cart-icon')) return;

            const icon = document.createElement('a');
            icon.className = 'cart-icon';
            icon.innerHTML = '🛒';
            icon.href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1';
            icon.target = '_blank';
            icon.style.cssText = `
                margin-left: 8px;
                font-size: 1.2em;
                vertical-align: middle;
                display: inline-block;
                opacity: 0.7;
                cursor: pointer;
                text-decoration: none;
                transition: all 0.2s ease;
            `;

            // Add hover effects
            icon.addEventListener('mouseenter', function() {
                this.style.opacity = '1';
                this.style.transform = 'scale(1.2)';
            });

            icon.addEventListener('mouseleave', function() {
                this.style.opacity = '0.7';
                this.style.transform = 'scale(1)';
            });

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
        .cart-icon:hover {
            text-decoration: none;
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
