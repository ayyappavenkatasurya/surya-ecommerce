

// public/js/main.js
console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {

    // --- Button Spinner Logic ---
    document.querySelectorAll('form.form-submit-spinner').forEach(form => {
        form.addEventListener('submit', (event) => {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton && !submitButton.disabled) {
                if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
                    return;
                }
                const originalText = submitButton.innerHTML;
                submitButton.dataset.originalText = originalText;
                submitButton.disabled = true;
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Working...';

                window.addEventListener('pageshow', function(pageEvent) {
                    if (pageEvent.persisted && submitButton.disabled) {
                        if (submitButton.dataset.originalText) {
                            submitButton.innerHTML = submitButton.dataset.originalText;
                        }
                        submitButton.disabled = false;
                    }
                });
            }
        });
    });

    // --- Responsive Table Logic ---
    function responsiveTables() {
        const tables = document.querySelectorAll('.data-table');
        tables.forEach(table => {
            const headerElements = table.querySelectorAll('thead th');
            if (!headerElements || headerElements.length === 0) return;

            const headers = Array.from(headerElements).map(th => th.textContent.trim());
            const rows = table.querySelectorAll('tbody tr');
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                    if (!cell.hasAttribute('data-label') && headers[index] !== undefined && headers[index] !== '') {
                         cell.setAttribute('data-label', headers[index]);
                    }
                });
            });
        });
    }
     if (document.querySelector('.data-table')) {
         responsiveTables();
     }

    // --- Share Button Logic ---
    const shareButton = document.getElementById('share-product-btn');
    const fallbackLinks = document.getElementById('fallback-share-links');
    if (shareButton && fallbackLinks) {
        shareButton.addEventListener('click', async () => {
            const title = shareButton.dataset.title || document.title;
            const text = shareButton.dataset.text || `Check out ${title}`;
            const url = shareButton.dataset.url || window.location.href;

            if (navigator.share) {
                try {
                    await navigator.share({ title, text, url });
                    console.log('Product shared successfully!');
                    showToast('Link shared!', 'success');
                } catch (error) {
                    console.error('Error sharing:', error);
                    if (error.name !== 'AbortError') {
                         fallbackLinks.classList.remove('hidden');
                         showToast('Sharing failed, use fallback links.', 'warning');
                    }
                }
            } else {
                console.log('Web Share API not supported, showing fallback links.');
                fallbackLinks.classList.remove('hidden');
                showToast('Web Share not supported, use link options.', 'info');
            }
        });
    }

    // --- Profile Page Specific Logic ---
    const profilePage = document.querySelector('.profile-container');
    if (profilePage) {
        const editAddressBtn = document.getElementById('edit-address-btn');
        const addAddressBtn = document.getElementById('add-address-btn');
        const cancelAddressBtn = document.getElementById('cancel-edit-btn');
        const addressForm = document.getElementById('address-form');
        const savedAddressDiv = document.getElementById('saved-address-display');

        const showAddressForm = () => {
            if (!addressForm || !savedAddressDiv) return;
            addressForm.classList.remove('hidden');
            const isEditing = savedAddressDiv.querySelector('strong') !== null;
            addressForm.querySelector('h3').textContent = isEditing ? 'Edit Address' : 'Add Address';
            savedAddressDiv.classList.add('hidden');
            if (addAddressBtn) addAddressBtn.classList.add('hidden');
            if (cancelAddressBtn) cancelAddressBtn.classList.remove('hidden');

            const pincodeInput = addressForm.querySelector('#profile-pincode');
            const localitySelect = addressForm.querySelector('#profile-locality');
            const savedLocality = localitySelect ? localitySelect.dataset.savedValue : null;

            if (pincodeInput && pincodeInput.value.length === 6 && /^\d{6}$/.test(pincodeInput.value)) {
                fetchPincodeData(pincodeInput.value, 'profile', savedLocality);
            } else if (localitySelect) {
                localitySelect.innerHTML = '<option value="" selected disabled>Enter Pincode First</option>';
                localitySelect.disabled = true;
            }
        };

        const hideAddressForm = () => {
            if (!addressForm || !savedAddressDiv) return;
            addressForm.classList.add('hidden');
            savedAddressDiv.classList.remove('hidden');
            if (cancelAddressBtn) cancelAddressBtn.classList.add('hidden');
            if (!savedAddressDiv.querySelector('strong') && addAddressBtn) {
                 addAddressBtn.classList.remove('hidden');
            }
            const statusElement = addressForm.querySelector('.pincode-status');
            if (statusElement) statusElement.textContent = '';
            clearAutoFilledFields('profile');
        };

        if (editAddressBtn) {
            editAddressBtn.addEventListener('click', showAddressForm);
        }
        if (addAddressBtn) {
             addAddressBtn.addEventListener('click', () => {
                 if(addressForm) addressForm.reset();
                 clearAutoFilledFields('profile');
                 showAddressForm();
             });
        }
        if (cancelAddressBtn) {
            cancelAddressBtn.addEventListener('click', hideAddressForm);
        }

        if (savedAddressDiv && addressForm && addAddressBtn) {
            if (!savedAddressDiv.querySelector('strong') && addressForm.classList.contains('hidden')) {
                addAddressBtn.classList.remove('hidden');
            } else {
                 addAddressBtn.classList.add('hidden');
            }
        }

        const editNameBtn = document.getElementById('edit-name-btn');
        const cancelNameBtn = document.getElementById('cancel-edit-name-btn');
        const nameForm = document.getElementById('name-form');
        const savedNameDisplaySpan = document.getElementById('saved-name-display');
        const nameInput = document.getElementById('name-input');
        const displayUserNameStrong = document.getElementById('display-user-name');

        const showNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn) return;
            nameForm.classList.remove('hidden');
            savedNameDisplaySpan.classList.add('hidden');
            editNameBtn.classList.add('hidden');
            if(displayUserNameStrong && nameInput) nameInput.value = displayUserNameStrong.textContent;
            if(nameInput) nameInput.focus();
        };

        const hideNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn || !displayUserNameStrong || !nameInput) return;
            nameForm.classList.add('hidden');
            savedNameDisplaySpan.classList.remove('hidden');
            editNameBtn.classList.remove('hidden');
            nameInput.value = displayUserNameStrong.textContent;
        };

        if (editNameBtn) {
            editNameBtn.addEventListener('click', showNameForm);
        }
        if (cancelNameBtn) {
            cancelNameBtn.addEventListener('click', hideNameForm);
        }
    }

    // --- Checkout Address Toggle Logic ---
    const checkoutPage = document.querySelector('.checkout-container');
    if (checkoutPage) {
        const checkoutEditBtn = checkoutPage.querySelector('.checkout-address #edit-address-btn');
        const checkoutCancelBtn = checkoutPage.querySelector('.checkout-address #cancel-edit-btn');
        const checkoutAddressForm = checkoutPage.querySelector('.checkout-address #address-form');
        const checkoutSavedAddressDiv = checkoutPage.querySelector('.checkout-address .saved-address');
        const placeOrderBtn = checkoutPage.querySelector('.btn-place-order');
        const hasInitialAddress = checkoutSavedAddressDiv && !checkoutSavedAddressDiv.classList.contains('hidden');

        if (checkoutEditBtn) {
            checkoutEditBtn.addEventListener('click', () => {
                if (!checkoutAddressForm || !checkoutSavedAddressDiv) return;
                checkoutAddressForm.classList.remove('hidden');
                checkoutSavedAddressDiv.classList.add('hidden');
                if(placeOrderBtn) placeOrderBtn.disabled = true;
                if(checkoutAddressForm.querySelector('h3')) checkoutAddressForm.querySelector('h3').textContent = 'Edit Address';
                if (checkoutCancelBtn) checkoutCancelBtn.classList.remove('hidden');

                const pincodeInput = checkoutAddressForm.querySelector('#checkout-pincode');
                const localitySelect = checkoutAddressForm.querySelector('#checkout-locality');
                const savedLocality = localitySelect ? localitySelect.dataset.savedValue : null;

                if (pincodeInput && pincodeInput.value.length === 6 && /^\d{6}$/.test(pincodeInput.value)) {
                    fetchPincodeData(pincodeInput.value, 'checkout', savedLocality);
                } else if (localitySelect){
                    localitySelect.innerHTML = '<option value="" selected disabled>Enter Pincode First</option>';
                    localitySelect.disabled = true;
                }
            });
        }

        if (checkoutCancelBtn) {
            checkoutCancelBtn.addEventListener('click', () => {
                if (!checkoutAddressForm || !checkoutSavedAddressDiv) return;
                checkoutAddressForm.classList.add('hidden');
                if (hasInitialAddress) {
                    checkoutSavedAddressDiv.classList.remove('hidden');
                    if(placeOrderBtn) placeOrderBtn.disabled = false;
                } else {
                    if(placeOrderBtn) placeOrderBtn.disabled = true;
                }
                checkoutCancelBtn.classList.add('hidden');
                const statusElement = checkoutAddressForm.querySelector('.pincode-status');
                if (statusElement) statusElement.textContent = '';
                clearAutoFilledFields('checkout');
            });
        }

        if (!hasInitialAddress && checkoutAddressForm) {
            checkoutAddressForm.classList.remove('hidden');
            if (placeOrderBtn) placeOrderBtn.disabled = true;
            if(checkoutAddressForm.querySelector('h3')) checkoutAddressForm.querySelector('h3').textContent = 'Add Shipping Address';
            if (checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden');
        } else if (hasInitialAddress && checkoutAddressForm) {
            checkoutAddressForm.classList.add('hidden');
            if (placeOrderBtn) placeOrderBtn.disabled = false;
            if (checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden');
        }
    }


    // --- Cart Update AJAX Logic (Using Event Delegation) ---
    const cartItemsContainer = document.querySelector('.cart-items');
    if (cartItemsContainer) {
        cartItemsContainer.addEventListener('click', (e) => {
            const button = e.target.closest('.btn-update-qty');
            if (button) {
                e.preventDefault();
                const productId = button.dataset.productId;
                const quantityInput = document.getElementById(`quantity-${productId}`);
                if (!quantityInput) return;
                
                const newQuantity = parseInt(quantityInput.value, 10);

                if (!quantityInput.dataset.originalValue) {
                    quantityInput.dataset.originalValue = quantityInput.value;
                }

                if (isNaN(newQuantity) || newQuantity < 0) {
                    showToast('Invalid quantity entered.', 'danger');
                    quantityInput.value = quantityInput.dataset.originalValue;
                    return;
                }
                const maxStock = parseInt(quantityInput.max, 10);
                if (!isNaN(maxStock) && newQuantity > maxStock) {
                    showToast(`Only ${maxStock} items available in stock.`, 'warning');
                    quantityInput.value = maxStock; // Correct to max stock
                    // Optionally, still proceed with update to maxStock if that's desired UX
                    // updateCartItemQuantityAJAX(productId, maxStock, button, quantityInput);
                    return; // Current logic: stop if user tries to go over max.
                }
                updateCartItemQuantityAJAX(productId, newQuantity, button, quantityInput);
            }
        });
    }
    // --- End Cart Update AJAX Logic ---


    // ========================================
    // Dynamic Search Bar Logic
    // ========================================
    const searchContainer = document.getElementById('dynamic-search-container');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchInput = document.getElementById('search-input-dynamic');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');
    let suggestionFetchTimeout;

    if (searchToggleBtn && searchContainer) {
        searchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            searchContainer.classList.toggle('active');
            if (searchContainer.classList.contains('active')) {
                requestAnimationFrame(() => { if(searchInput) searchInput.focus(); });
            } else {
                if(suggestionsDropdown) suggestionsDropdown.classList.remove('active');
            }
        });
    }

    if (searchInput && suggestionsDropdown) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            clearTimeout(suggestionFetchTimeout);

            if (query.length >= 2) {
                suggestionsDropdown.innerHTML = '<div class="suggestion-item"><i>Loading...</i></div>';
                suggestionsDropdown.classList.add('active');
                suggestionFetchTimeout = setTimeout(() => {
                    fetchSuggestions(query);
                }, 300);
            } else {
                suggestionsDropdown.innerHTML = '';
                suggestionsDropdown.classList.remove('active');
            }
        });

        searchInput.addEventListener('focus', () => {
             const query = searchInput.value.trim();
              const hasActualSuggestions = suggestionsDropdown.querySelector('a.suggestion-item');
              if (query.length >= 2 && hasActualSuggestions) {
                 suggestionsDropdown.classList.add('active');
             }
        });
    }

     async function fetchSuggestions(query) {
         if (!suggestionsDropdown) return;
         try {
             const response = await fetch(`/products/suggestions?q=${encodeURIComponent(query)}`);
             if (!response.ok) {
                 let errorMsg = `HTTP error! status: ${response.status}`;
                 try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (parseError) {}
                 throw new Error(errorMsg);
             }
             const suggestions = await response.json();
             displaySuggestions(suggestions);
         } catch (error) {
             console.error('Error fetching suggestions:', error);
             suggestionsDropdown.innerHTML = `<div class="suggestion-item text-danger"><i>Error: ${error.message || 'Failed to fetch'}</i></div>`;
             suggestionsDropdown.classList.add('active');
         }
     }

     function displaySuggestions(suggestions) {
          if (!suggestionsDropdown) return;
         suggestionsDropdown.innerHTML = '';
         if (suggestions.length > 0) {
             suggestions.forEach(product => {
                 const item = document.createElement('a');
                 item.classList.add('suggestion-item');
                 item.href = `/products/${product._id}`;
                 const safeName = product.name ? product.name.replace(/</g, "<").replace(/>/g, ">") : '[No Name]';
                 const safeImageUrl = product.imageUrl ? product.imageUrl.replace(/</g, "<").replace(/>/g, ">") : '/images/placeholder.png';
                 item.innerHTML = `
                    <img src="${safeImageUrl}" alt="" loading="lazy">
                    <span>${safeName}</span>
                 `;
                 suggestionsDropdown.appendChild(item);
             });
             suggestionsDropdown.classList.add('active');
         } else {
              suggestionsDropdown.innerHTML = '<div class="suggestion-item text-muted"><i>No matching products found.</i></div>';
              suggestionsDropdown.classList.add('active');
         }
     }

     document.addEventListener('click', (e) => {
         if (searchContainer && suggestionsDropdown && searchToggleBtn && !searchContainer.contains(e.target) && !searchToggleBtn.contains(e.target)) {
             searchContainer.classList.remove('active');
             suggestionsDropdown.classList.remove('active');
         }
     });

     if(suggestionsDropdown) {
         suggestionsDropdown.addEventListener('click', (e) => {
             const link = e.target.closest('a.suggestion-item');
             if (!link) {
                 e.stopPropagation();
             } else {
                 suggestionsDropdown.classList.remove('active');
                 if (searchContainer && window.innerWidth < 768) {
                    searchContainer.classList.remove('active');
                 }
             }
         });
     }
    // ========================================
    // End Dynamic Search Bar Logic
    // ========================================


    // ========================================
    // Toast Notification Logic
    // ========================================
    const toastContainerGlobal = document.querySelector('.toast-container'); // Renamed to avoid conflict
    if (toastContainerGlobal) {
        const toastElements = toastContainerGlobal.querySelectorAll('.toast');
        toastElements.forEach((toastElement) => {
            const closeButton = toastElement.querySelector('.toast-close-btn');
            const autoHideDelay = 5000;
            let hideTimeoutId;

            const dismissToast = () => {
                clearTimeout(hideTimeoutId);
                if (toastElement.classList.contains('hide') || !toastElement.parentNode) return;
                toastElement.classList.remove('show');
                toastElement.classList.add('hide');
                toastElement.addEventListener('transitionend', (event) => {
                    if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && toastElement.classList.contains('hide') && toastElement.parentNode) {
                         try { toastElement.remove(); } catch(e) { console.warn("Error removing toast:", e); }
                    }
                }, { once: true });
            };

            setTimeout(() => { if (toastElement.parentNode) toastElement.classList.add('show'); }, 10);
            hideTimeoutId = setTimeout(dismissToast, autoHideDelay);
            if (closeButton) closeButton.addEventListener('click', dismissToast);
            toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
            toastElement.addEventListener('mouseleave', () => hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2));
        });
    }
    // ========================================
    // End Toast Notification Logic
    // ========================================

    // --- Rating Stats Bar Animation ---
    document.querySelectorAll('.rating-bar-fill').forEach(function(el) {
        var width = el.getAttribute('data-width');
        if (width) {
            requestAnimationFrame(() => { if(el.parentNode) el.style.width = width + '%'; });
        }
    });

    // ========================================
    // Loading State for Non-Form Actions
    // ========================================
    const proceedCheckoutBtn = document.getElementById('btn-proceed-checkout');
    if (proceedCheckoutBtn) {
        const originalCheckoutText = proceedCheckoutBtn.innerHTML;
        const loadingCheckoutText = proceedCheckoutBtn.dataset.loadingText || '<i class="fas fa-spinner fa-spin"></i> Loading...';
        proceedCheckoutBtn.addEventListener('click', function(event) {
            if (proceedCheckoutBtn.classList.contains('loading')) {
                event.preventDefault(); return;
            }
            proceedCheckoutBtn.classList.add('loading');
            proceedCheckoutBtn.innerHTML = loadingCheckoutText;
            proceedCheckoutBtn.style.pointerEvents = 'none';
            proceedCheckoutBtn.setAttribute('aria-disabled', 'true');
        });
        window.addEventListener('pageshow', function(pageEvent) {
            if (pageEvent.persisted && proceedCheckoutBtn.classList.contains('loading')) {
                proceedCheckoutBtn.classList.remove('loading');
                proceedCheckoutBtn.innerHTML = originalCheckoutText;
                proceedCheckoutBtn.style.pointerEvents = 'auto';
                proceedCheckoutBtn.removeAttribute('aria-disabled');
            }
        });
    }
    // ========================================
    // End Loading State for Non-Form Actions
    // ========================================

    // ========================================
    // Homepage Banner Slider Logic
    // ========================================
    const sliderContainer = document.querySelector('[data-slider-container]');
    if (sliderContainer) {
        const slides = sliderContainer.querySelectorAll('[data-slide]');
        const prevBtn = sliderContainer.querySelector('[data-slider-prev]');
        const nextBtn = sliderContainer.querySelector('[data-slider-next]');
        const dotsContainer = sliderContainer.querySelector('[data-slider-dots]');
        const dots = dotsContainer ? dotsContainer.querySelectorAll('[data-slide-to]') : [];
        let currentSlideIndex = 0;
        let autoSlideInterval = null;
        const slideIntervalTime = 5000;
        let isDragging = false, startX = 0, currentX = 0, diffX = 0;
        const swipeThreshold = 50;

        function showSlide(index) {
            if (!slides || slides.length === 0) return;
            const newIndex = (index % slides.length + slides.length) % slides.length;
            slides.forEach((slide, i) => { slide.classList.toggle('active', i === newIndex); });
            dots.forEach((dot, i) => { dot.classList.toggle('active', i === newIndex); });
            currentSlideIndex = newIndex;
        }
        function nextSlide() { showSlide(currentSlideIndex + 1); }
        function prevSlide() { showSlide(currentSlideIndex - 1); }
        function startAutoSlide() {
            clearInterval(autoSlideInterval);
            if (slides.length > 1) autoSlideInterval = setInterval(nextSlide, slideIntervalTime);
        }
        function handleTouchStart(event) {
            if (slides.length <= 1) return; isDragging = true; startX = event.touches[0].pageX;
            currentX = startX; diffX = 0; clearInterval(autoSlideInterval);
        }
        function handleTouchMove(event) {
            if (!isDragging || slides.length <= 1) return; currentX = event.touches[0].pageX;
            diffX = startX - currentX; if (Math.abs(diffX) > 10) event.preventDefault();
        }
        function handleTouchEnd() {
            if (!isDragging || slides.length <= 1) return; isDragging = false;
            if (Math.abs(diffX) > swipeThreshold) { if (diffX > 0) nextSlide(); else prevSlide(); }
            startX = 0; currentX = 0; diffX = 0; startAutoSlide();
        }
        if (slides.length > 0) { showSlide(0); startAutoSlide(); }
        if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); startAutoSlide(); });
        if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); startAutoSlide(); });
        if (dotsContainer) {
            dotsContainer.addEventListener('click', (e) => {
                const targetDot = e.target.closest('[data-slide-to]');
                if (targetDot) {
                    const index = parseInt(targetDot.dataset.slideTo, 10);
                    if (!isNaN(index)) { showSlide(index); startAutoSlide(); }
                }
            });
        }
        sliderContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
        sliderContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        sliderContainer.addEventListener('touchend', handleTouchEnd);
        sliderContainer.addEventListener('touchcancel', handleTouchEnd);
        sliderContainer.addEventListener('mouseenter', () => clearInterval(autoSlideInterval));
        sliderContainer.addEventListener('mouseleave', () => startAutoSlide());
    }
    // ========================================
    // End Homepage Banner Slider Logic
    // ========================================

    // ========================================
    // Pincode Lookup Logic
    // ========================================
    const pincodeInputs = document.querySelectorAll('.pincode-input');
    let pincodeTimeout;
    pincodeInputs.forEach(input => {
        const targetPrefix = input.dataset.targetPrefix;
        if (!targetPrefix) { console.warn("Pincode input missing data-target-prefix:", input); return; }
        const localitySelect = document.getElementById(`${targetPrefix}-locality`);
        if (!localitySelect) { console.warn(`Locality select not found for prefix ${targetPrefix}`); return; }

        input.addEventListener('input', () => {
            clearTimeout(pincodeTimeout); const pincode = input.value.trim();
            const statusElement = input.nextElementSibling;
            if (pincode.length < 6) {
                clearAutoFilledFields(targetPrefix);
                if (statusElement) { statusElement.textContent = ''; statusElement.className = 'pincode-status text-muted'; }
                if (pincode.length > 0 && !/^\d*$/.test(pincode)) {
                    if (statusElement) { statusElement.textContent = 'Digits only'; statusElement.className = 'pincode-status text-danger';}
                } return;
            }
            if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
                if (statusElement) { statusElement.textContent = 'Looking up...'; statusElement.className = 'pincode-status text-muted'; }
                localitySelect.disabled = true; localitySelect.innerHTML = '<option value="" selected disabled>Looking up Pincode...</option>';
                pincodeTimeout = setTimeout(() => fetchPincodeData(pincode, targetPrefix, null), 500);
            } else if (pincode.length === 6) {
                clearAutoFilledFields(targetPrefix);
                if (statusElement) { statusElement.textContent = 'Invalid Pincode (digits only)'; statusElement.className = 'pincode-status text-danger';}
            }
        });
        input.addEventListener('blur', () => {
            clearTimeout(pincodeTimeout); const pincode = input.value.trim();
            const statusElement = input.nextElementSibling;
            if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
                if (statusElement && !statusElement.classList.contains('text-success') && statusElement.textContent !== 'Fetching...') {
                     statusElement.textContent = 'Looking up...'; statusElement.className = 'pincode-status text-muted';
                     fetchPincodeData(pincode, targetPrefix, null);
                }
            } else if (pincode.length > 0) {
                 clearAutoFilledFields(targetPrefix);
                 if (statusElement) { statusElement.textContent = 'Invalid Pincode'; statusElement.className = 'pincode-status text-danger';}
            } else { clearAutoFilledFields(targetPrefix); if (statusElement) statusElement.textContent = '';}
        });
        const initialPincode = input.value.trim();
        const savedLocality = localitySelect.dataset.savedValue || null;
        if (initialPincode.length === 6 && /^\d{6}$/.test(initialPincode)) {
            const initialStatusElement = input.nextElementSibling;
            if (initialStatusElement) { initialStatusElement.textContent = 'Verifying...'; initialStatusElement.className = 'pincode-status text-muted';}
            localitySelect.disabled = true; localitySelect.innerHTML = '<option value="" selected disabled>Verifying Pincode...</option>';
            fetchPincodeData(initialPincode, targetPrefix, savedLocality);
        } else {
             localitySelect.disabled = true; localitySelect.innerHTML = '<option value="" selected disabled>Enter Pincode First</option>';
        }
    });

    async function fetchPincodeData(pincode, prefix, savedLocalityValue = null) {
        const stateInput = document.getElementById(`${prefix}-state`), districtInput = document.getElementById(`${prefix}-district`),
              mandalInput = document.getElementById(`${prefix}-mandal`), stateHiddenInput = document.getElementById(`${prefix}-state-hidden`),
              districtHiddenInput = document.getElementById(`${prefix}-district-hidden`), mandalHiddenInput = document.getElementById(`${prefix}-mandal-hidden`),
              containerDiv = document.getElementById(`${prefix}-auto-filled-fields`), pincodeInputEl = document.getElementById(`${prefix}-pincode`), // Renamed to avoid conflict
              pincodeStatusElement = pincodeInputEl?.nextElementSibling, localitySelect = document.getElementById(`${prefix}-locality`);

        if (!stateInput || !districtInput || !mandalInput || !containerDiv || !pincodeStatusElement || !localitySelect || !stateHiddenInput || !districtHiddenInput || !mandalHiddenInput) {
            console.error("Pincode related elements not found for prefix:", prefix);
            if (pincodeStatusElement) { pincodeStatusElement.textContent = 'Setup Error'; pincodeStatusElement.className = 'pincode-status text-danger'; }
            if (localitySelect) { localitySelect.innerHTML = '<option value="" selected disabled>Setup Error</option>'; localitySelect.disabled = true; } return;
        }
        if (!pincodeStatusElement.classList.contains('text-success')) { pincodeStatusElement.textContent = 'Fetching...'; pincodeStatusElement.className = 'pincode-status text-muted';}
        try {
            const response = await fetch(`/user/pincode-lookup/${pincode}`); const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || `Pincode ${response.statusText}`);
            const location = data.location;
            stateInput.value = location.stateName || ''; districtInput.value = location.districtName || '';
            mandalInput.value = location.mandalName || ''; stateHiddenInput.value = location.stateName || '';
            districtHiddenInput.value = location.districtName || ''; mandalHiddenInput.value = location.mandalName || '';
            populateLocalityDropdown(localitySelect, location.localities, savedLocalityValue);
            containerDiv.style.display = 'block';
            pincodeStatusElement.textContent = `✓ Location found `; pincodeStatusElement.className = 'pincode-status text-success';
        } catch (error) {
             console.error('Pincode lookup error:', error); clearAutoFilledFields(prefix);
             pincodeStatusElement.textContent = `Error: ${error.message}`; pincodeStatusElement.className = 'pincode-status text-danger';
             localitySelect.innerHTML = '<option value="" selected disabled>Pincode Error</option>'; localitySelect.disabled = true;
        }
    }
    function populateLocalityDropdown(selectElement, localities, valueToSelect = null) {
        if (!selectElement) return; selectElement.innerHTML = '';
        if (localities && localities.length > 0) {
            const defaultOption = document.createElement('option'); defaultOption.value = "";
            defaultOption.textContent = "Select Locality / Post Office..."; defaultOption.disabled = true;
            defaultOption.selected = !valueToSelect; selectElement.appendChild(defaultOption);
            let valueMatched = false;
            localities.forEach(locality => {
                const option = document.createElement('option'); option.value = locality; option.textContent = locality;
                if (valueToSelect && locality === valueToSelect) { option.selected = true; valueMatched = true;}
                selectElement.appendChild(option);
            });
             if (valueMatched) defaultOption.selected = false;
            selectElement.disabled = false;
        } else {
            selectElement.innerHTML = '<option value="" selected disabled>No Localities Found</option>';
            selectElement.disabled = true;
        }
    }
    function clearAutoFilledFields(prefix) {
        const stateInput = document.getElementById(`${prefix}-state`), districtInput = document.getElementById(`${prefix}-district`),
              mandalInput = document.getElementById(`${prefix}-mandal`), stateHiddenInput = document.getElementById(`${prefix}-state-hidden`),
              districtHiddenInput = document.getElementById(`${prefix}-district-hidden`), mandalHiddenInput = document.getElementById(`${prefix}-mandal-hidden`),
              containerDiv = document.getElementById(`${prefix}-auto-filled-fields`), localitySelect = document.getElementById(`${prefix}-locality`);
        if (stateInput) stateInput.value = ''; if (districtInput) districtInput.value = ''; if (mandalInput) mandalInput.value = '';
        if (stateHiddenInput) stateHiddenInput.value = ''; if (districtHiddenInput) districtHiddenInput.value = '';
        if (mandalHiddenInput) mandalHiddenInput.value = ''; if (containerDiv) containerDiv.style.display = 'none';
        if (localitySelect) {
            localitySelect.innerHTML = '<option value="" selected disabled>Enter Pincode First</option>';
            localitySelect.disabled = true; localitySelect.value = ''; localitySelect.dataset.savedValue = '';
        }
    }
    // ========================================
    // End Pincode Lookup Logic
    // ========================================

    // ========================================
    // Live Order/Product/User Filtering Logic
    // ========================================
    const orderFilterInput = document.getElementById('order-filter-input');
    const adminOrderTable = document.getElementById('admin-order-table');
    const sellerOrderTable = document.getElementById('seller-order-table');
    let targetOrderTableBody = null, noOrderResultsRow = null;
    if (adminOrderTable) {
        targetOrderTableBody = adminOrderTable.querySelector('tbody');
        noOrderResultsRow = document.getElementById('no-admin-orders-found');
    } else if (sellerOrderTable) {
        targetOrderTableBody = sellerOrderTable.querySelector('tbody');
        noOrderResultsRow = document.getElementById('no-seller-orders-found');
    }
    if (orderFilterInput && targetOrderTableBody && noOrderResultsRow) {
        orderFilterInput.addEventListener('input', () => {
            const filterValue = orderFilterInput.value.trim().toLowerCase();
            const rows = targetOrderTableBody.querySelectorAll('tr.order-row'); let matchFound = false;
            rows.forEach(row => {
                const rowText = row.textContent.toLowerCase();
                if (filterValue === '' || rowText.includes(filterValue)) {
                    row.style.display = ''; matchFound = true;
                } else row.style.display = 'none';
            });
            if (!matchFound && rows.length > 0) {
                noOrderResultsRow.classList.remove('hidden'); noOrderResultsRow.style.display = '';
            } else {
                noOrderResultsRow.classList.add('hidden'); noOrderResultsRow.style.display = 'none';
            }
        });
    }
    function setupLiveFilter(inputId, tableId, noResultsId, rowSelector) {
        const filterInput = document.getElementById(inputId), table = document.getElementById(tableId),
              noResultsRow = document.getElementById(noResultsId);
        if (filterInput && table && noResultsRow) {
            const tableBody = table.querySelector('tbody'); if (!tableBody) return;
            filterInput.addEventListener('input', () => {
                const filterValue = filterInput.value.trim().toLowerCase();
                const rows = tableBody.querySelectorAll(rowSelector); let matchFound = false;
                rows.forEach(row => {
                    const rowText = row.textContent.toLowerCase();
                    if (filterValue === '' || rowText.includes(filterValue)) {
                        row.style.display = ''; matchFound = true;
                    } else row.style.display = 'none';
                });
                if (!matchFound && rows.length > 0) {
                    noResultsRow.classList.remove('hidden'); noResultsRow.style.display = '';
                } else {
                    noResultsRow.classList.add('hidden'); noResultsRow.style.display = 'none';
                }
            });
        }
    }
    setupLiveFilter('admin-product-filter-input', 'admin-product-table', 'no-admin-products-found', 'tr.product-row');
    setupLiveFilter('seller-product-filter-input', 'seller-product-table', 'no-seller-products-found', 'tr.product-row');
    setupLiveFilter('user-filter-input', 'admin-user-table', 'no-admin-users-found', 'tr.user-row');
    // ========================================
    // End Live Filtering Logic
    // ========================================

    // ========================================
    // Product Image Slider Logic
    // ========================================
    const imageSlider = document.querySelector('[data-product-image-slider]');
    if (imageSlider) {
        const slides = imageSlider.querySelectorAll('[data-product-slide]');
        const prevBtn = imageSlider.querySelector('[data-product-image-nav="prev"]');
        const nextBtn = imageSlider.querySelector('[data-product-image-nav="next"]');
        const dots = imageSlider.querySelectorAll('[data-product-image-dot]');
        let currentImageIndex = 0;
        let isProductDragging = false, productStartX = 0, productCurrentX = 0, productDiffX = 0;
        const productSwipeThreshold = 50;

        function showProductImage(index) {
            if (!slides || slides.length < 2) return;
            const newIndex = (index % slides.length + slides.length) % slides.length;
            slides.forEach((slide, i) => { slide.classList.toggle('active', i === newIndex); });
            dots.forEach((dot, i) => { dot.classList.toggle('active', i === newIndex); });
            currentImageIndex = newIndex;
        }
        function handleProductTouchStart(event) {
            if (slides.length <= 1) return; isProductDragging = true; productStartX = event.touches[0].pageX;
            productCurrentX = productStartX; productDiffX = 0;
        }
        function handleProductTouchMove(event) {
            if (!isProductDragging || slides.length <= 1) return; productCurrentX = event.touches[0].pageX;
            productDiffX = productStartX - productCurrentX; if (Math.abs(productDiffX) > 10) event.preventDefault();
        }
        function handleProductTouchEnd() {
            if (!isProductDragging || slides.length <= 1) return; isProductDragging = false;
            if (Math.abs(productDiffX) > productSwipeThreshold) {
                if (productDiffX > 0) showProductImage(currentImageIndex + 1);
                else showProductImage(currentImageIndex - 1);
            }
            productStartX = 0; productCurrentX = 0; productDiffX = 0;
        }
        if (slides.length > 1) {
            if (nextBtn) nextBtn.addEventListener('click', () => showProductImage(currentImageIndex + 1));
            if (prevBtn) prevBtn.addEventListener('click', () => showProductImage(currentImageIndex - 1));
            dots.forEach(dot => {
                dot.addEventListener('click', () => {
                    const index = parseInt(dot.dataset.productImageDot, 10);
                    if (!isNaN(index)) showProductImage(index);
                });
            });
            imageSlider.addEventListener('touchstart', handleProductTouchStart, { passive: true });
            imageSlider.addEventListener('touchmove', handleProductTouchMove, { passive: false });
            imageSlider.addEventListener('touchend', handleProductTouchEnd);
            imageSlider.addEventListener('touchcancel', handleProductTouchEnd);
        } else {
            if (nextBtn) nextBtn.style.display = 'none'; if (prevBtn) prevBtn.style.display = 'none';
            const dotsContainer = imageSlider.querySelector('.product-image-dots');
            if (dotsContainer) dotsContainer.style.display = 'none';
        }
        if (slides.length > 0) showProductImage(0);
    }
    // ========================================
    // End Product Image Slider Logic
    // ========================================

    // ========================================
    // Password Visibility Toggle
    // ========================================
    document.querySelectorAll('.password-toggle-btn').forEach(button => {
        button.addEventListener('click', () => {
            const passwordInput = button.previousElementSibling;
            if (passwordInput && (passwordInput.type === 'password' || passwordInput.type === 'text')) {
                const isPassword = passwordInput.type === 'password';
                passwordInput.type = isPassword ? 'text' : 'password';
                const icon = button.querySelector('i');
                if (icon) {
                    icon.classList.toggle('fa-eye', !isPassword);
                    icon.classList.toggle('fa-eye-slash', isPassword);
                }
            }
        });
    });
    // ========================================
    // End: Password Visibility Toggle
    // ========================================

    // ========================================
    // AJAX Add to Cart (Index Page - Event Delegation)
    // ========================================
    const productIndexContainer = document.querySelector('.product-index-container'); // Or a more specific parent like .product-grid
    if (productIndexContainer) {
        productIndexContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('.btn-ajax-add-to-cart');
            if (button) {
                if (!button.dataset.originalHtmlContent) {
                    button.dataset.originalHtmlContent = button.innerHTML;
                }
                const originalHtml = button.dataset.originalHtmlContent;
                const loadingHtml = '<i class="fas fa-spinner fa-spin"></i>';
                const successHtml = '<i class="fas fa-check"></i> Added';

                const isAuthenticated = document.body.dataset.isAuthenticated === 'true';
                if (!isAuthenticated) {
                    sessionStorage.setItem('showLoginRedirectToast', 'true');
                    window.location.href = `/auth/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                    return;
                }

                const productId = button.dataset.productId;
                if (!productId) { console.error('Product ID not found on button'); showToast('Could not add item (missing ID).', 'danger'); return; }
                const quantity = 1;

                button.disabled = true; button.classList.add('loading'); button.innerHTML = loadingHtml;
                try {
                    const response = await fetch('/user/cart/add-ajax', {
                        method: 'POST', headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ productId, quantity })
                    });
                    const data = await response.json();
                    if (!response.ok || !data.success) throw new Error(data.message || `Failed to add item (${response.status})`);
                    
                    showToast(data.message || 'Item added to cart!', 'success');
                    updateCartBadge(data.cartItemCount); // Server provides the new count
                    button.classList.remove('loading'); button.classList.add('success'); button.innerHTML = successHtml;
                    setTimeout(() => {
                        if (document.body.contains(button)) {
                            button.disabled = false; button.classList.remove('success'); button.innerHTML = originalHtml;
                        }
                    }, 1500);
                } catch (error) {
                    console.error("AJAX Add to Cart error:", error);
                    showToast(error.message || 'Could not add item to cart.', 'danger');
                    if (document.body.contains(button)) {
                        button.disabled = false; button.classList.remove('loading'); button.innerHTML = originalHtml;
                    }
                }
            }
        });
    }
    // ========================================
    // End: AJAX Add to Cart (Index Page)
    // ========================================

    // ========================================
    // Check for Login Redirect Toast on Page Load
    // ========================================
    if (window.location.pathname === '/auth/login') {
        const showToastFlag = sessionStorage.getItem('showLoginRedirectToast');
        if (showToastFlag === 'true') {
            showToast('Please log in to add items to your cart.', 'info');
            sessionStorage.removeItem('showLoginRedirectToast');
        }
    }
    // ========================================
    // End: Check for Login Redirect Toast
    // ========================================

}); // End DOMContentLoaded


// --- Helper Functions (Outside DOMContentLoaded) ---

// --- Cart Update AJAX Function ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement, quantityInputElement) {
    const cartItemDiv = buttonElement.closest('.cart-item');
    
    // Store original HTML content if not already stored
    if (!buttonElement.dataset.originalHtmlContent) {
        buttonElement.dataset.originalHtmlContent = buttonElement.innerHTML;
    }
    const originalButtonHtml = buttonElement.dataset.originalHtmlContent;
    const loadingButtonHtml = '<i class="fas fa-spinner fa-spin"></i>';

    buttonElement.disabled = true;
    buttonElement.innerHTML = loadingButtonHtml;
    if(quantityInputElement) quantityInputElement.readOnly = true;

    try {
        const response = await fetch('/user/cart/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', },
            body: JSON.stringify({ productId, quantity })
         });
        const data = await response.json();

        if (!response.ok) {
             if (data.removal === true) {
                 showToast(data.message || 'Item unavailable and removed.', 'warning');
                 if (cartItemDiv) {
                    cartItemDiv.style.transition = 'opacity 0.3s ease, height 0.3s ease, margin 0.3s ease, padding 0.3s ease, border 0.3s ease';
                    cartItemDiv.style.opacity = '0'; cartItemDiv.style.height = '0';
                    cartItemDiv.style.paddingTop = '0'; cartItemDiv.style.paddingBottom = '0';
                    cartItemDiv.style.marginBottom = '0'; cartItemDiv.style.borderWidth = '0';
                     setTimeout(() => {
                         if (cartItemDiv.parentNode) cartItemDiv.remove();
                         updateCartTotalAndBadge(data.cartTotal, data.cartItemCount);
                         handleEmptyCartDisplay();
                     }, 300);
                     return; 
                 }
             } else {
                 throw new Error(data.message || `Update failed (Status: ${response.status})`);
             }
        }

         if (data.success) {
             if(quantityInputElement) quantityInputElement.dataset.originalValue = data.newQuantity;
             if (quantity === 0) {
                if (cartItemDiv) {
                    cartItemDiv.style.transition = 'opacity 0.3s ease, height 0.3s ease, margin 0.3s ease, padding 0.3s ease, border 0.3s ease';
                    cartItemDiv.style.opacity = '0'; cartItemDiv.style.height = '0';
                    cartItemDiv.style.paddingTop = '0'; cartItemDiv.style.paddingBottom = '0';
                    cartItemDiv.style.marginBottom = '0'; cartItemDiv.style.borderWidth = '0';
                    setTimeout(() => {
                        if (cartItemDiv.parentNode) cartItemDiv.remove();
                        updateCartTotalAndBadge(data.cartTotal, data.cartItemCount);
                        handleEmptyCartDisplay();
                        showToast('Item removed from cart.', 'success');
                    }, 300);
                    return; 
                }
             } else {
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = (data.itemSubtotal !== undefined ? data.itemSubtotal : 0).toFixed(2);
                 if(quantityInputElement) quantityInputElement.value = data.newQuantity;
                 updateCartTotalAndBadge(data.cartTotal, data.cartItemCount);
             }
         } else {
              showToast(`Update failed: ${data.message || 'Unknown error'}`, 'danger');
              if(quantityInputElement && quantityInputElement.dataset.originalValue) {
                  quantityInputElement.value = quantityInputElement.dataset.originalValue;
              }
         }
    } catch (error) {
         console.error('Error updating cart quantity:', error);
          showToast(`Error: ${error.message}`, 'danger');
          if(quantityInputElement && quantityInputElement.dataset.originalValue) {
            quantityInputElement.value = quantityInputElement.dataset.originalValue;
          }
    } finally {
         if (cartItemDiv && (!cartItemDiv.style.opacity || parseFloat(cartItemDiv.style.opacity) !== 0)) {
             buttonElement.disabled = false;
             buttonElement.innerHTML = originalButtonHtml; // Restore original HTML
             if(quantityInputElement) quantityInputElement.readOnly = false;
         }
     }
}

// --- Helper Function to Show Toasts Dynamically ---
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) { console.error("Toast container not found! Falling back to alert."); alert(message); return; }
    const toastElement = document.createElement('div');
    toastElement.className = `toast toast-${type}`;
    toastElement.setAttribute('role', 'alert'); toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');
    const sanitizedMessage = typeof message === 'string' ? message.replace(/</g, "<").replace(/>/g, ">") : 'An unexpected error occurred.';
    toastElement.innerHTML = `<div class="toast-body">${sanitizedMessage}<button type="button" class="toast-close-btn" aria-label="Close">×</button></div>`;
    const closeButton = toastElement.querySelector('.toast-close-btn');
    toastContainer.appendChild(toastElement);
    const autoHideDelay = 5000; let hideTimeoutId;
    const dismissToast = () => {
        clearTimeout(hideTimeoutId);
        if (toastElement.classList.contains('hide') || !toastElement.parentNode) return;
        toastElement.classList.remove('show'); toastElement.classList.add('hide');
        toastElement.addEventListener('transitionend', (event) => {
            if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && toastElement.classList.contains('hide') && toastElement.parentNode) {
                try { toastElement.remove(); } catch(e) { console.warn("Error removing toast:", e); }
            }
        }, { once: true });
    };
    setTimeout(() => { if (toastElement.parentNode) toastElement.classList.add('show'); }, 10);
    hideTimeoutId = setTimeout(dismissToast, autoHideDelay);
    if (closeButton) closeButton.addEventListener('click', dismissToast);
    toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
    toastElement.addEventListener('mouseleave', () => hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2));
}

// --- Helper Functions for Cart Badge and Empty Display ---
// Updates BOTH cart total display (on cart page) and header badge
function updateCartTotalAndBadge(newCartTotal, newCartItemCount) { // Accepts newCartItemCount
     const cartTotalSpan = document.getElementById('cart-total-value');
     if (cartTotalSpan) cartTotalSpan.textContent = (newCartTotal !== undefined ? newCartTotal : 0).toFixed(2);

     if (newCartItemCount !== undefined) { // Prioritize server-sent count
         updateCartBadge(newCartItemCount);
     } else { // Fallback if server doesn't send it (should be avoided)
         updateCartBadgeOnly();
     }
}

// Function to ONLY update the header cart badge
function updateCartBadge(newCount) {
    const cartBadge = document.querySelector('.cart-badge');
    if (cartBadge) {
        const count = Number(newCount); // Ensure it's a number
        if (count > 0) {
            cartBadge.textContent = count;
            cartBadge.classList.remove('hide');
        } else {
            cartBadge.textContent = '0';
            cartBadge.classList.add('hide');
        }
    }
}

// Helper to update badge by recalculating from cart page elements (FALLBACK ONLY)
function updateCartBadgeOnly() {
     const newCartItemCount = calculateNewCartCount();
     updateCartBadge(newCartItemCount);
}

function calculateNewCartCount() { // This is a fallback and might be less accurate during animations
    const cartItems = document.querySelectorAll('.cart-item'); let count = 0;
    cartItems.forEach(item => {
        const style = window.getComputedStyle(item);
        if (style.display !== 'none' && (!item.style.opacity || parseFloat(item.style.opacity) > 0)) {
             const qtyInput = item.querySelector('.quantity-input');
             if (qtyInput) count += parseInt(qtyInput.value, 10) || 0;
             else count++;
        }
    });
    return count;
}

function handleEmptyCartDisplay() {
    const cartItemsContainer = document.querySelector('.cart-items');
     const cartContainer = document.querySelector('.cart-container');
     const cartSummary = document.querySelector('.cart-summary');
     if (cartItemsContainer && cartContainer) {
         const visibleItems = Array.from(cartItemsContainer.querySelectorAll('.cart-item')).filter(item => {
             const style = window.getComputedStyle(item);
             return style.display !== 'none' && (!item.style.opacity || parseFloat(item.style.opacity) > 0);
         });
         if (visibleItems.length === 0) {
             if (!cartContainer.querySelector('.alert-info')) {
                 cartItemsContainer.innerHTML = '';
                 if(cartSummary) cartSummary.remove();
                 const emptyCartHTML = `<h1>Your Shopping Cart</h1><p class="alert alert-info mt-3">Your cart is empty. <a href="/" class="alert-link">Continue Shopping</a></p>`;
                 const h1 = cartContainer.querySelector('h1');
                 if (h1) h1.insertAdjacentHTML('afterend', emptyCartHTML.substring(emptyCartHTML.indexOf('<p')));
                 else cartContainer.innerHTML = emptyCartHTML;
             }
         }
     }
}
