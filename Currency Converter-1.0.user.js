// ==UserScript==
// @name         Universal Currency Converter
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  Converts USD prices to Norwegian Krone on hover - shows cart icon on all sites
// @author       LegendZer0
// @match        https://*.astroempires.com/*
// @match        https://*.amazon.com/*
// @match        https://*.ebay.com/*
// @match        https://*.walmart.com/*
// @match        https://*.bestbuy.com/*
// @match        https://*.newegg.com/*
// @match        https://*.aliexpress.com/*
// @match        https://*.etsy.com/*
// @match        https://*.steampowered.com/*
// @match        https://*.temu.com/*
// @match        https://*.wish.com/*
// @match        https://*.amazon.co.uk/*
// @match        https://*.ebay.co.uk/*
// @match        https://*.amazon.de/*
// @match        https://*.ebay.de/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      api.exchangerate.host
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    const CONVERSION_RATE_KEY = 'usd_to_nok_rate';
    const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    const IS_ASTROEMPIRES = window.location.hostname.includes('astroempires.com');

    let conversionRate = null;

    // Function to get conversion rate from API or cache
    async function getConversionRate() {
        const cached = GM_getValue(CONVERSION_RATE_KEY, null);

        if (cached && cached.timestamp > Date.now() - CACHE_DURATION) {
            return cached.rate;
        }

        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.exchangerate.host/latest?base=USD&symbols=NOK',
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.success && data.rates.NOK) {
                            const rate = data.rates.NOK;
                            GM_setValue(CONVERSION_RATE_KEY, {
                                rate: rate,
                                timestamp: Date.now()
                            });
                            resolve(rate);
                        } else {
                            throw new Error('API response invalid');
                        }
                    } catch (error) {
                        console.log('Failed to fetch exchange rate, using fallback');
                        resolve(cached ? cached.rate : 10.5);
                    }
                },
                onerror: function() {
                    console.log('API request failed, using fallback');
                    resolve(cached ? cached.rate : 10.5);
                }
            });
        });
    }

    // Function to find price elements on e-commerce sites
    function findPriceElements() {
        const priceSelectors = [
            // Amazon specific
            '.a-price[data-a-size="xl"]',
            '.a-price.aok-align-center',
            '.a-price',
            '.aok-align-center',
            '[data-a-color="price"]',
            '.a-section.a-spacing-none.aok-align-center',

            // eBay specific
            '.x-price-amount',
            '.s-item__price',
            '.s-item__detail--primary',
            '.display-price',
            '.item-price',

            // Walmart
            '[data-automation-id="product-price"]',
            '.price-current',

            // Best Buy
            '.pricing-price__regular',

            // Newegg
            '.price-current',

            // AliExpress
            '.product-price-value',

            // Etsy
            '.currency-value',

            // Steam
            '.game_purchase_price',
            '.discount_final_price',

            // Temu
            '[data-price]',
            '.price',
            '.TmV2UHJpY2U', // Temu's encoded class names
            '.JIIgO', // Another common Temu price class
            '[class*="price"]',
            '[class*="Price"]',

            // Wish
            '.ProductPrice__value',
            '.ProductPrice__convertedValue',
            '.price-container',
            '.selling-price',
            '[data-testid="product-price"]',

            // General selectors
            '[class*="price"]',
            '.price',
            '.Price',
            '.cost',
            '.amount',
            '.currency',
            '[data-price]'
        ];

        const elements = new Set();

        priceSelectors.forEach(selector => {
            try {
                const found = document.querySelectorAll(selector);
                found.forEach(el => {
                    if (isValidPriceElement(el)) {
                        elements.add(el);
                    }
                });
            } catch (e) {
                // Skip invalid selectors
            }
        });

        return Array.from(elements);
    }

    // Check if element contains a valid price
    function isValidPriceElement(element) {
        if (element.hasAttribute('data-currency-converter')) {
            return false;
        }

        // Get all text content including from child elements
        const text = element.textContent.trim();

        // Skip if no meaningful text
        if (text.length < 2) {
            return false;
        }

        // For Amazon specifically, check if this is a price container
        if (element.classList.contains('a-price') ||
            element.classList.contains('aok-align-center') ||
            element.querySelector('.a-price-whole, .a-price-fraction, .a-price-symbol')) {
            return true;
        }

        // For Temu and Wish, be more aggressive with detection
        if (window.location.hostname.includes('temu.com') ||
            window.location.hostname.includes('wish.com')) {
            if (text.match(/\d/)) {
                return true;
            }
        }

        // Look for price patterns in text
        const pricePatterns = [
            /\$\d+\.?\d*/i,                    // $19.99
            /USD\s*\d+\.?\d*/i,               // USD 19.99
            /\d+\.?\d*\s*(USD|dollars?)/i,    // 19.99 USD
            /price:\s*\$\d+\.?\d*/i,          // Price: $19.99
            /(\d{1,3}(?:,\d{3})*\.?\d{0,2})/  // Numbers that look like prices
        ];

        return pricePatterns.some(pattern => pattern.test(text));
    }

    // Improved function to extract price from complex structures
    function extractPrice(element) {
        // Special handling for Amazon's split price elements
        if (element.classList.contains('a-price') || element.querySelector('.a-price-whole')) {
            const wholePart = element.querySelector('.a-price-whole');
            const fractionPart = element.querySelector('.a-price-fraction');

            if (wholePart && fractionPart) {
                const whole = wholePart.textContent.replace(/[^\d]/g, '');
                const fraction = fractionPart.textContent.replace(/[^\d]/g, '');
                const price = parseFloat(whole + '.' + fraction);

                if (price > 0.01 && price < 1000000) {
                    return price;
                }
            }
        }

        // Special handling for Temu - they often use data attributes
        if (element.hasAttribute('data-price')) {
            const price = parseFloat(element.getAttribute('data-price'));
            if (price > 0.01 && price < 1000000) {
                return price;
            }
        }

        // Fallback: try to extract from text content
        const text = element.textContent.trim();
        const patterns = [
            /\$(\d+\.?\d*)/,                          // $19.99
            /USD\s*(\d+\.?\d*)/i,                     // USD 19.99
            /(\d+\.?\d*)\s*USD/i,                     // 19.99 USD
            /price:\s*\$?(\d+\.?\d*)/i,               // Price: 19.99
            /(\d+\.?\d{2})/,                          // 19.99 (with cents)
            /(\d+)/                                   // Plain numbers
        ];

        for (let pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
                const price = parseFloat(match[1]);
                if (price > 0.01 && price < 1000000) {
                    return price;
                }
            }
        }

        return null;
    }

    // Function to convert USD to NOK
    function convertToNOK(usdAmount, rate) {
        const nokAmount = usdAmount * rate;
        return nokAmount.toLocaleString('no-NO', {
            style: 'currency',
            currency: 'NOK',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Function to add cart icon next to price elements
    function addCurrencyIcons() {
        const priceElements = findPriceElements();
        console.log(`Found ${priceElements.length} potential price elements`);

        priceElements.forEach(element => {
            if (element.hasAttribute('data-currency-converter')) return;

            const price = extractPrice(element);

            if (price) {
                console.log(`Found price: $${price} in element:`, element);

                element.setAttribute('data-currency-converter', 'true');
                element.setAttribute('data-original-price', price);

                // Add shopping cart icon next to the price
                addIconToElement(element, price);
            }
        });
    }

    // Function to add shopping cart icon to a price element
    function addIconToElement(element, price) {
        // Create the icon
        const icon = document.createElement('span');
        icon.className = 'currency-converter-icon';
        icon.innerHTML = '🛒'; // Shopping cart emoji
        icon.style.cssText = `
            margin-left: 8px;
            cursor: pointer;
            text-decoration: none;
            font-size: 1.2em;
            vertical-align: middle;
            display: inline-block;
            transition: all 0.2s ease;
            opacity: 0.7;
        `;

        // Add hover events to the icon
        let hoverTimeout;

        icon.addEventListener('mouseenter', function(e) {
            e.stopPropagation();
            hoverTimeout = setTimeout(async () => {
                const rate = await getConversionRate();
                const nokAmount = convertToNOK(price, rate);
                showCustomTooltip(this, `$${price.toLocaleString()} = ${nokAmount}`);

                // Visual feedback
                this.style.transform = 'scale(1.2)';
                this.style.opacity = '1';
                if (element.style) {
                    element.style.backgroundColor = 'rgba(33, 150, 243, 0.1)';
                    element.style.outline = '1px dashed #2196F3';
                    element.style.borderRadius = '3px';
                }
            }, 100);
        });

        icon.addEventListener('mouseleave', function(e) {
            e.stopPropagation();
            clearTimeout(hoverTimeout);
            this.style.transform = 'scale(1)';
            this.style.opacity = '0.7';
            if (element.style) {
                element.style.backgroundColor = '';
                element.style.outline = '';
                element.style.borderRadius = '';
            }
            hideCustomTooltip();
        });

        // Add click event to toggle conversion display
        icon.addEventListener('click', async function(e) {
            e.stopPropagation();
            e.preventDefault();

            const rate = await getConversionRate();
            const nokAmount = convertToNOK(price, rate);

            // Remove any existing conversion display
            const existingDisplay = element.querySelector('.conversion-display');
            if (existingDisplay) {
                existingDisplay.remove();
            }

            // Temporary show conversion next to price
            const conversionDisplay = document.createElement('span');
            conversionDisplay.className = 'conversion-display';
            conversionDisplay.textContent = ` (${nokAmount})`;
            conversionDisplay.style.cssText = `
                color: #2196F3;
                font-size: 0.9em;
                margin-left: 4px;
                font-weight: normal;
            `;

            element.appendChild(conversionDisplay);

            // Remove after 5 seconds
            setTimeout(() => {
                if (conversionDisplay.parentElement) {
                    conversionDisplay.remove();
                }
            }, 5000);
        });

        // Insert the icon after the price element
        if (element.parentElement) {
            // Try to insert after the element, but before any existing icons
            const existingIcon = element.nextElementSibling?.classList?.contains('currency-converter-icon');
            if (!existingIcon) {
                element.parentElement.insertBefore(icon, element.nextSibling);
            }
        } else {
            element.appendChild(icon);
        }
    }

    // Custom tooltip functions
    function showCustomTooltip(element, text) {
        hideCustomTooltip();

        const tooltip = document.createElement('div');
        tooltip.id = 'currency-converter-tooltip';
        tooltip.textContent = text;
        tooltip.style.cssText = `
            position: fixed;
            background: #2196F3;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 10000;
            pointer-events: none;
            white-space: nowrap;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            font-family: Arial, sans-serif;
        `;

        document.body.appendChild(tooltip);

        // Position tooltip near cursor
        const updatePosition = (e) => {
            tooltip.style.left = (e.clientX + 15) + 'px';
            tooltip.style.top = (e.clientY + 15) + 'px';
        };

        element.addEventListener('mousemove', updatePosition);
        element._tooltipHandler = updatePosition;
    }

    function hideCustomTooltip() {
        const tooltip = document.getElementById('currency-converter-tooltip');
        if (tooltip) {
            tooltip.remove();
        }
    }

    // ASTROEMPIRES-SPECIFIC FUNCTIONALITY (updated to use cart)
    function addAstroempiresButtons() {
        const playerCells = document.querySelectorAll('table.layout.listing.btnlisting.tbllisting1 td:nth-child(2)');

        playerCells.forEach(cell => {
            if (cell.querySelector('.currency-btn')) return;

            const btn = document.createElement('a');
            btn.className = 'currency-btn';
            btn.innerHTML = '🛒'; // Shopping cart emoji
            btn.style.cssText = `
                margin-left: 8px;
                cursor: pointer;
                text-decoration: none;
                font-size: 1.2em;
                vertical-align: middle;
                display: inline-block;
                transition: all 0.2s ease;
                opacity: 0.7;
            `;

            btn.addEventListener('mouseenter', async function(e) {
                const number = findClosestNumber(this);
                if (number) {
                    const rate = await getConversionRate();
                    const nokAmount = convertToNOK(number, rate);
                    this.title = `$${number.toLocaleString()} = ${nokAmount}`;
                    this.style.opacity = '1';
                    this.style.transform = 'scale(1.2)';
                } else {
                    this.title = 'No number found to convert';
                }
            });

            btn.addEventListener('mouseleave', function() {
                this.removeAttribute('title');
                this.style.opacity = '0.7';
                this.style.transform = 'scale(1)';
            });

            cell.appendChild(btn);
        });
    }

    // Function to find closest number (Astroempires specific)
    function findClosestNumber(element) {
        let currentElement = element.parentElement;
        let textContent = '';

        while (currentElement && !textContent.match(/\d/)) {
            textContent = currentElement.textContent;

            if (currentElement.previousElementSibling) {
                const prevText = currentElement.previousElementSibling.textContent;
                if (prevText.match(/\d/)) {
                    textContent = prevText + ' ' + textContent;
                }
            }

            if (currentElement.nextElementSibling) {
                const nextText = currentElement.nextElementSibling.textContent;
                if (nextText.match(/\d/)) {
                    textContent = textContent + ' ' + nextText;
                }
            }

            currentElement = currentElement.parentElement;
        }

        const numbers = textContent.match(/\d{1,3}(?:,\d{3})*(?:\.\d+)?/g) || [];

        if (numbers.length > 0) {
            const parsedNumbers = numbers.map(num => {
                const cleanNum = parseFloat(num.replace(/,/g, ''));
                return cleanNum;
            }).filter(num => num > 0 && num < 1000000);

            if (parsedNumbers.length > 0) {
                return Math.min(...parsedNumbers);
            }
        }

        return null;
    }

    // Add global styles
    const style = document.createElement('style');
    style.textContent = `
        .currency-btn, .currency-converter-icon {
            color: #2196F3 !important;
            transition: all 0.2s ease !important;
            cursor: pointer !important;
            opacity: 0.7;
        }

        .currency-btn:hover, .currency-converter-icon:hover {
            transform: scale(1.2);
            opacity: 1;
            text-decoration: none;
        }

        [data-currency-converter="true"] {
            position: relative;
        }

        #currency-converter-tooltip {
            font-family: Arial, sans-serif !important;
        }

        .conversion-display {
            animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* Ensure the icon doesn't break layouts */
        .currency-converter-icon {
            vertical-align: middle;
        }
    `;
    document.head.appendChild(style);

    // Initialize based on website type
    if (IS_ASTROEMPIRES) {
        console.log('Running Astroempires currency converter');
        if (window.location.href.includes('map.aspx') || window.location.href.includes('fleet.aspx')) {
            addAstroempiresButtons();

            new MutationObserver(addAstroempiresButtons)
                .observe(document, { subtree: true, childList: true });

            setInterval(addAstroempiresButtons, 2000);
        }
    } else {
        console.log('Running universal currency converter with cart icons for:', window.location.hostname);

        // More aggressive initialization for e-commerce sites
        const initEcommerce = () => {
            setTimeout(addCurrencyIcons, 500);
            setTimeout(addCurrencyIcons, 1500);
            setTimeout(addCurrencyIcons, 3000);
        };

        initEcommerce();

        // Observe for dynamic content
        const observer = new MutationObserver(() => {
            setTimeout(addCurrencyIcons, 500);
        });

        observer.observe(document, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });

        // Check periodically
        setInterval(addCurrencyIcons, 2000);

        window.addEventListener('load', initEcommerce);
    }
})();