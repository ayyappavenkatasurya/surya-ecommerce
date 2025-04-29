// public/js/main.js
console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {

    // --- Button Spinner Logic ---
    document.querySelectorAll('form.form-submit-spinner').forEach(form => {
        form.addEventListener('submit', (event) => {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton && !submitButton.disabled) {
                // Basic HTML5 validation check
                if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
                    // If form is invalid, don't disable button or show spinner
                    return;
                }
                const originalText = submitButton.innerHTML;
                submitButton.dataset.originalText = originalText; // Store original HTML
                submitButton.disabled = true;
                submitButton.classList.add('loading'); // Optional: Add class for specific styling
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                // Reset button if user navigates back without form submitting (browser specific)
                window.addEventListener('pageshow', function(pageEvent) { // Renamed event variable
                    if (pageEvent.persisted && submitButton.disabled) {
                        // Restore button only if it still has the loading state
                        if (submitButton.dataset.originalText) {
                            submitButton.innerHTML = submitButton.dataset.originalText;
                        }
                        submitButton.disabled = false;
                        submitButton.classList.remove('loading');
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
                // Skip 'no results' row if it exists in tbody
                if(row.id && row.id.startsWith('no-')) return;

                const cells = row.querySelectorAll('td');
                cells.forEach((cell, index) => {
                    // Add data-label only if it doesn't exist and header exists
                    if (!cell.hasAttribute('data-label') && headers[index] !== undefined && headers[index] !== '') {
                         cell.setAttribute('data-label', headers[index]);
                    }
                });
            });
        });
    }
     if (document.querySelector('.data-table')) {
         responsiveTables();
         // Re-run if content is dynamically added (e.g., via AJAX, though not currently used for tables)
         // const observer = new MutationObserver(responsiveTables);
         // observer.observe(document.body, { childList: true, subtree: true });
     }

    // --- Share Button Logic ---
    const shareButton = document.getElementById('share-product-btn');
    const fallbackLinks = document.getElementById('fallback-share-links');
    if (shareButton && fallbackLinks) {
        shareButton.addEventListener('click', async () => {
            const title = shareButton.dataset.title || document.title; // Fallback to page title
            const text = shareButton.dataset.text || `Check out ${title}`; // Fallback text
            const url = shareButton.dataset.url || window.location.href; // Fallback url

            if (navigator.share) {
                try {
                    await navigator.share({ title, text, url });
                    console.log('Product shared successfully!');
                    showToast('Link shared!', 'success'); // Optional feedback
                } catch (error) {
                    console.error('Error sharing:', error);
                    // Don't show fallback if user explicitly cancelled (AbortError)
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
    const profilePage = document.querySelector('.profile-container'); // Check if we are on profile page
    if (profilePage) {
        // --- Address Edit/Add Logic ---
        const editAddressBtn = document.getElementById('edit-address-btn');
        const addAddressBtn = document.getElementById('add-address-btn'); // Get the Add button
        const cancelAddressBtn = document.getElementById('cancel-edit-btn');
        const addressForm = document.getElementById('address-form');
        const savedAddressDiv = document.getElementById('saved-address-display');

        const showAddressForm = () => {
            if (!addressForm || !savedAddressDiv) return;
            addressForm.classList.remove('hidden');
            const isEditing = savedAddressDiv.querySelector('strong') !== null;
            addressForm.querySelector('h3').textContent = isEditing ? 'Edit Address' : 'Add Address';
            savedAddressDiv.classList.add('hidden');
            if (addAddressBtn) addAddressBtn.classList.add('hidden'); // Hide Add button when form is visible
            if (cancelAddressBtn) cancelAddressBtn.classList.remove('hidden'); // Always show Cancel when form is open

            // Trigger pincode check for edit if pincode exists
            const pincodeInput = addressForm.querySelector('#profile-pincode');
            const localitySelect = addressForm.querySelector('#profile-locality');
            // Get the potentially pre-filled value from the EJS render
            const savedLocality = localitySelect ? localitySelect.dataset.savedValue : null;

            if (pincodeInput && pincodeInput.value.length === 6 && /^\d{6}$/.test(pincodeInput.value)) {
                fetchPincodeData(pincodeInput.value, 'profile', savedLocality); // Pass saved locality
            } else if (localitySelect) {
                // Ensure locality is reset if pincode isn't valid when opening form
                clearAutoFilledFields('profile'); // Use helper to clear derived fields
            }
        };

        const hideAddressForm = () => {
            if (!addressForm || !savedAddressDiv) return;
            addressForm.classList.add('hidden');
            savedAddressDiv.classList.remove('hidden'); // Show the container (has address or "No address" text)
            if (cancelAddressBtn) cancelAddressBtn.classList.add('hidden');
            // Show Add button only if there's no saved address content
            if (!savedAddressDiv.querySelector('strong') && addAddressBtn) {
                 addAddressBtn.classList.remove('hidden');
            }
            // Clear status messages and derived fields when hiding
            clearAutoFilledFields('profile');
            const pincodeInput = addressForm.querySelector('#profile-pincode');
            const statusElement = pincodeInput?.nextElementSibling;
            if (statusElement) statusElement.textContent = '';
        };

        if (editAddressBtn) {
            editAddressBtn.addEventListener('click', showAddressForm);
        }
        if (addAddressBtn) {
             addAddressBtn.addEventListener('click', () => {
                 if(addressForm) {
                     addressForm.reset(); // Clear form fields when adding new
                     clearAutoFilledFields('profile'); // Clear auto-filled fields too
                     // Manually clear pincode status as reset() doesn't trigger input event
                     const statusElement = addressForm.querySelector('.pincode-status');
                     if (statusElement) statusElement.textContent = '';
                 }
                 showAddressForm();
             });
        }
        if (cancelAddressBtn) {
            cancelAddressBtn.addEventListener('click', hideAddressForm);
        }

        // Initial state check: Show Add button only if no address exists and form is hidden
        if (savedAddressDiv && addressForm && addAddressBtn) {
            if (!savedAddressDiv.querySelector('strong') && addressForm.classList.contains('hidden')) {
                addAddressBtn.classList.remove('hidden');
            } else {
                 addAddressBtn.classList.add('hidden');
            }
        }


        // --- Name Edit Logic ---
        const editNameBtn = document.getElementById('edit-name-btn');
        const cancelNameBtn = document.getElementById('cancel-edit-name-btn');
        const nameForm = document.getElementById('name-form');
        const savedNameDisplaySpan = document.getElementById('saved-name-display');
        const nameInput = document.getElementById('name-input');
        const displayUserNameStrong = document.getElementById('display-user-name');

        const showNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn || !displayUserNameStrong) return;
            nameForm.classList.remove('hidden');
            savedNameDisplaySpan.classList.add('hidden');
            editNameBtn.classList.add('hidden');
            nameInput.value = displayUserNameStrong.textContent.trim(); // Use trim
            nameInput.focus();
        };

        const hideNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn || !displayUserNameStrong) return;
            nameForm.classList.add('hidden');
            savedNameDisplaySpan.classList.remove('hidden');
            editNameBtn.classList.remove('hidden');
            // No need to reset input value here, keep original name display
        };

        if (editNameBtn) {
            editNameBtn.addEventListener('click', showNameForm);
        }

        if (cancelNameBtn) {
            cancelNameBtn.addEventListener('click', hideNameForm);
        }
    } // End if (profilePage)

    // --- Checkout Address Toggle Logic ---
    const checkoutPage = document.querySelector('.checkout-container'); // Check if on checkout page
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
                checkoutAddressForm.querySelector('h3').textContent = 'Edit Shipping Address'; // Update title
                if (checkoutCancelBtn) checkoutCancelBtn.classList.remove('hidden');

                // Trigger pincode check for edit if pincode exists
                const pincodeInput = checkoutAddressForm.querySelector('#checkout-pincode');
                const localitySelect = checkoutAddressForm.querySelector('#checkout-locality');
                const savedLocality = localitySelect ? localitySelect.dataset.savedValue : null;

                if (pincodeInput && pincodeInput.value.length === 6 && /^\d{6}$/.test(pincodeInput.value)) {
                    fetchPincodeData(pincodeInput.value, 'checkout', savedLocality); // Pass saved locality
                } else if (localitySelect){
                    clearAutoFilledFields('checkout'); // Clear derived fields
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
                    // If there was no initial address, hiding the form means they can't checkout
                    if(placeOrderBtn) placeOrderBtn.disabled = true;
                }
                checkoutCancelBtn.classList.add('hidden');
                // Clear status messages and derived fields when hiding
                clearAutoFilledFields('checkout');
                const pincodeInput = checkoutAddressForm.querySelector('#checkout-pincode');
                const statusElement = pincodeInput?.nextElementSibling;
                if (statusElement) statusElement.textContent = '';
            });
        }

        // Initialize form state on page load
        if (!hasInitialAddress && checkoutAddressForm) {
            checkoutAddressForm.classList.remove('hidden');
            if (placeOrderBtn) placeOrderBtn.disabled = true;
            checkoutAddressForm.querySelector('h3').textContent = 'Add Shipping Address';
            if (checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden');
        } else if (hasInitialAddress && checkoutAddressForm) {
            checkoutAddressForm.classList.add('hidden');
            if (placeOrderBtn) placeOrderBtn.disabled = false;
            if (checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden');
        }
    } // End if(checkoutPage)


    // --- Cart Update AJAX Logic ---
    const cartItemsContainer = document.querySelector('.cart-items');
    if (cartItemsContainer) {
        cartItemsContainer.addEventListener('click', (e) => {
            // Delegate event for update buttons
            if (e.target.classList.contains('btn-update-qty')) {
                e.preventDefault();
                const button = e.target;
                const quantityInput = button.previousElementSibling; // Find the input just before the button
                if (!quantityInput || !quantityInput.matches('.quantity-input')) return; // Ensure it's the correct input

                const productId = quantityInput.dataset.productId;
                const newQuantity = parseInt(quantityInput.value, 10);

                if (!quantityInput.dataset.originalValue) {
                    quantityInput.dataset.originalValue = quantityInput.value;
                }

                if (isNaN(newQuantity) || newQuantity < 0) {
                    showToast('Invalid quantity entered.', 'danger');
                    quantityInput.value = quantityInput.dataset.originalValue || '1'; // Fallback to 1 if original is missing
                    return;
                }
                const maxStock = parseInt(quantityInput.max, 10);
                if (!isNaN(maxStock) && newQuantity > maxStock) {
                    showToast(`Only ${maxStock} items available in stock.`, 'warning');
                    quantityInput.value = maxStock;
                    return;
                }
                updateCartItemQuantityAJAX(productId, newQuantity, button, quantityInput);
            }
        });
    }


    // ========================================
    // Dynamic Search Bar Logic
    // ========================================
    const searchContainer = document.getElementById('dynamic-search-container');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchForm = document.getElementById('dynamic-search-form');
    const searchInput = document.getElementById('search-input-dynamic');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');
    let suggestionFetchTimeout;

    if (searchToggleBtn && searchContainer) {
        searchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent body click listener from closing it immediately
            searchContainer.classList.toggle('active');
            if (searchContainer.classList.contains('active')) {
                // Use requestAnimationFrame for smoother focus transition after style changes
                requestAnimationFrame(() => { if(searchInput) searchInput.focus(); });
            } else {
                if(suggestionsDropdown) suggestionsDropdown.classList.remove('active');
            }
        });
    }

    if (searchInput && suggestionsDropdown && searchForm) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            clearTimeout(suggestionFetchTimeout);

            if (query.length >= 2) {
                suggestionsDropdown.innerHTML = '<div class="suggestion-item text-muted"><i>Loading...</i></div>';
                suggestionsDropdown.classList.add('active');
                suggestionFetchTimeout = setTimeout(() => {
                    fetchSuggestions(query);
                }, 300); // Debounce API calls
            } else {
                suggestionsDropdown.innerHTML = '';
                suggestionsDropdown.classList.remove('active');
            }
        });

        searchInput.addEventListener('focus', () => {
             const query = searchInput.value.trim();
              // Show suggestions on focus only if there's a query and suggestions are already rendered
              const hasActualSuggestions = suggestionsDropdown.querySelector('a.suggestion-item');
              if (query.length >= 2 && hasActualSuggestions) {
                 suggestionsDropdown.classList.add('active');
             }
        });

         // Optional: Prevent form submission if user clicks a suggestion link quickly
         searchForm.addEventListener('submit', (e) => {
             // If suggestions are visible, maybe delay submit slightly or check click target
             if (suggestionsDropdown.classList.contains('active')) {
                // Potentially add logic here if needed, but default browser behavior usually handles it
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
             if (!suggestionsDropdown.classList.contains('active')) {
                 suggestionsDropdown.classList.add('active'); // Ensure dropdown is visible for error
             }
         }
     }

     function displaySuggestions(suggestions) {
          if (!suggestionsDropdown) return;
         suggestionsDropdown.innerHTML = ''; // Clear previous results/loading
         if (suggestions.length > 0) {
             suggestions.forEach(product => {
                 const item = document.createElement('a');
                 item.classList.add('suggestion-item');
                 item.href = `/products/${product._id}`;
                 // Basic sanitization for display (more robust needed for complex HTML injection)
                 const safeName = product.name ? product.name.replace(/</g, "<").replace(/>/g, ">") : '[No Name]';
                 const safeImageUrl = product.imageUrl ? product.imageUrl.replace(/</g, "<").replace(/>/g, ">") : '/images/placeholder.png';
                 item.innerHTML = `
                    <img src="${safeImageUrl}" alt="" loading="lazy">
                    <span>${safeName}</span>
                 `;
                 suggestionsDropdown.appendChild(item);
             });
             if (!suggestionsDropdown.classList.contains('active')) {
                suggestionsDropdown.classList.add('active'); // Ensure dropdown visible
             }
         } else {
              suggestionsDropdown.innerHTML = '<div class="suggestion-item text-muted"><i>No matching products found.</i></div>';
              if (!suggestionsDropdown.classList.contains('active')) {
                suggestionsDropdown.classList.add('active'); // Ensure dropdown visible
             }
         }
     }

     // Global click listener to close search/suggestions
     document.addEventListener('click', (e) => {
         // Close if click is outside the search container AND outside the toggle button
         if (searchContainer && suggestionsDropdown && searchToggleBtn && !searchContainer.contains(e.target) && !searchToggleBtn.contains(e.target)) {
             searchContainer.classList.remove('active');
             suggestionsDropdown.classList.remove('active');
         }
     });

     // Handle clicks within the suggestions dropdown
     if(suggestionsDropdown) {
         suggestionsDropdown.addEventListener('click', (e) => {
             const link = e.target.closest('a.suggestion-item');
             if (!link) {
                 // Prevent closing if clicking inside the dropdown but not on a link
                 e.stopPropagation();
             }
             // Browser default action will navigate if 'link' is clicked
         });
     }
    // ========================================
    // End Dynamic Search Bar Logic
    // ========================================


    // ========================================
    // Toast Notification Logic (Initial Setup)
    // ========================================
    const toastContainer = document.querySelector('.toast-container');
    if (toastContainer) {
        const toastElements = toastContainer.querySelectorAll('.toast');

        toastElements.forEach((toastElement) => {
            const closeButton = toastElement.querySelector('.toast-close-btn');
            const autoHideDelay = 5000; // 5 seconds
            let hideTimeoutId;

            const dismissToast = () => {
                clearTimeout(hideTimeoutId);
                if (toastElement.classList.contains('hide') || !toastElement.parentNode) return;
                toastElement.classList.remove('show');
                toastElement.classList.add('hide');
                // Use transitionend event for reliable removal after animation
                toastElement.addEventListener('transitionend', (event) => {
                    // Check event target and property to avoid multiple removals if transitions apply to child elements
                    if (event.target === toastElement && (event.propertyName === 'opacity' || event.propertyName === 'transform')) {
                        if (toastElement.classList.contains('hide') && toastElement.parentNode) {
                           try { toastElement.remove(); } catch(e) { console.warn("Error removing toast:", e); }
                        }
                    }
                }, { once: true });
            };

            // Show toast initially with a slight delay for animation
            setTimeout(() => {
                if (toastElement.parentNode) { // Check if still in DOM
                   toastElement.classList.add('show');
                }
            }, 10); // Short delay

             // Auto hide
             hideTimeoutId = setTimeout(dismissToast, autoHideDelay);

            // Manual close
            if (closeButton) {
                closeButton.addEventListener('click', dismissToast);
            }

             // Pause on hover, resume on leave
             toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
             toastElement.addEventListener('mouseleave', () => {
                 clearTimeout(hideTimeoutId); // Clear any previous timeout
                 hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2); // Resume timeout (can adjust duration)
            });

        });
    }
    // ========================================
    // End Toast Notification Logic (Initial Setup)
    // ========================================

    // --- Rating Stats Bar Animation ---
    document.querySelectorAll('.rating-bar-fill').forEach(function(el) {
        const width = el.getAttribute('data-width');
        if (width) {
            // Use requestAnimationFrame for smoother animation start
            requestAnimationFrame(() => {
                 if(el.parentNode) { // Check if element is still in DOM
                    el.style.width = width + '%';
                 }
            });
        }
    });

    // ========================================
    // Loading State for Non-Form Actions (e.g., Proceed to Checkout)
    // ========================================
    const proceedCheckoutBtn = document.getElementById('btn-proceed-checkout');
    if (proceedCheckoutBtn) {
        const originalCheckoutText = proceedCheckoutBtn.innerHTML;
        const loadingCheckoutText = proceedCheckoutBtn.dataset.loadingText || '<i class="fas fa-spinner fa-spin"></i> Loading...';

        proceedCheckoutBtn.addEventListener('click', function(event) {
            // Prevent multiple clicks while loading
            if (proceedCheckoutBtn.classList.contains('loading')) {
                event.preventDefault();
                return;
            }
            // Add loading state
            proceedCheckoutBtn.classList.add('loading');
            proceedCheckoutBtn.innerHTML = loadingCheckoutText;
            proceedCheckoutBtn.style.pointerEvents = 'none'; // Disable clicks via CSS
            proceedCheckoutBtn.setAttribute('aria-disabled', 'true'); // Accessibility
        });

        // Handle browser back button potentially showing stale loading state
        window.addEventListener('pageshow', function(pageEvent) {
            if (pageEvent.persisted && proceedCheckoutBtn.classList.contains('loading')) {
                // Restore button if the page was loaded from bfcache and button is still loading
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
    // Pincode Lookup Logic (UPDATED for Locality)
    // ========================================
    const pincodeInputs = document.querySelectorAll('.pincode-input');
    let pincodeTimeout;

    pincodeInputs.forEach(input => {
        const targetPrefix = input.dataset.targetPrefix;
        if (!targetPrefix) {
            console.warn("Pincode input missing data-target-prefix:", input);
            return;
        }

        // Get Locality Select Element and status element
        const localitySelect = document.getElementById(`${targetPrefix}-locality`);
        const pincodeStatusElement = input.nextElementSibling?.classList.contains('pincode-status') ? input.nextElementSibling : null; // Safer check

        if (!localitySelect) {
            console.warn(`Locality select not found for prefix ${targetPrefix}`);
            return; // Skip this input if locality select is missing
        }

        input.addEventListener('input', () => {
            clearTimeout(pincodeTimeout);
            const pincode = input.value.trim();

            // Basic validation and clearing/resetting fields
            clearAutoFilledFields(targetPrefix); // Always clear derived fields on input change
            if (pincodeStatusElement) { // Reset status on input
                pincodeStatusElement.textContent = '';
                pincodeStatusElement.className = 'pincode-status text-muted';
            }

            if (pincode.length === 0) {
                 return; // Do nothing more if empty
            }

            if (!/^\d*$/.test(pincode)) { // Check for non-digits
                 if (pincodeStatusElement) {
                    pincodeStatusElement.textContent = 'Digits only';
                    pincodeStatusElement.className = 'pincode-status text-danger';
                 }
                 return;
            }

            if (pincode.length === 6) { // Only trigger lookup when exactly 6 digits
                if (pincodeStatusElement) {
                    pincodeStatusElement.textContent = 'Looking up...';
                    pincodeStatusElement.className = 'pincode-status text-muted';
                }
                localitySelect.disabled = true;
                localitySelect.innerHTML = '<option value="" selected disabled>Looking up Pincode...</option>';

                pincodeTimeout = setTimeout(() => {
                    fetchPincodeData(pincode, targetPrefix, null); // Pass null for savedLocalityValue on input trigger
                }, 500); // Debounce API call
            } else if (pincode.length > 6) {
                 if (pincodeStatusElement) {
                     pincodeStatusElement.textContent = 'Max 6 digits';
                     pincodeStatusElement.className = 'pincode-status text-danger';
                 }
            }
            // No status message needed if < 6 digits and valid
        });

        // Optional: Re-validate or fetch on blur if needed, but input event is usually sufficient
        // input.addEventListener('blur', () => { ... });

        // Initial check on page load for pre-filled pincodes
        const initialPincode = input.value.trim();
        // Get saved locality value from data attribute set in EJS
        const savedLocality = localitySelect.dataset.savedValue || null;

        if (initialPincode.length === 6 && /^\d{6}$/.test(initialPincode)) {
            if (pincodeStatusElement) {
                pincodeStatusElement.textContent = 'Verifying...';
                 pincodeStatusElement.className = 'pincode-status text-muted';
            }
            localitySelect.disabled = true;
            localitySelect.innerHTML = '<option value="" selected disabled>Verifying Pincode...</option>';
            // Fetch data on load for pre-filled valid pincode
            fetchPincodeData(initialPincode, targetPrefix, savedLocality); // Pass saved locality
        } else {
             // Ensure dropdown is disabled if pincode is initially invalid/empty
             localitySelect.disabled = true;
             localitySelect.innerHTML = '<option value="" selected disabled>Enter Pincode First</option>';
        }

    }); // end pincodeInputs.forEach

    async function fetchPincodeData(pincode, prefix, savedLocalityValue = null) {
        // Find all related elements using the prefix
        const stateInput = document.getElementById(`${prefix}-state`);
        const districtInput = document.getElementById(`${prefix}-district`);
        const mandalInput = document.getElementById(`${prefix}-mandal`);
        const stateHiddenInput = document.getElementById(`${prefix}-state-hidden`);
        const districtHiddenInput = document.getElementById(`${prefix}-district-hidden`);
        const mandalHiddenInput = document.getElementById(`${prefix}-mandal-hidden`);
        const containerDiv = document.getElementById(`${prefix}-auto-filled-fields`);
        const pincodeInput = document.getElementById(`${prefix}-pincode`);
        const pincodeStatusElement = pincodeInput?.nextElementSibling?.classList.contains('pincode-status') ? pincodeInput.nextElementSibling : null;
        const localitySelect = document.getElementById(`${prefix}-locality`);

        // Basic check if all necessary elements exist
        if (!stateInput || !districtInput || !mandalInput || !containerDiv || !pincodeStatusElement || !localitySelect || !stateHiddenInput || !districtHiddenInput || !mandalHiddenInput) {
            console.error("Pincode related elements not found for prefix:", prefix);
            if (pincodeStatusElement) { pincodeStatusElement.textContent = 'Page Setup Error'; pincodeStatusElement.className = 'pincode-status text-danger'; }
            if (localitySelect) { localitySelect.innerHTML = '<option value="" selected disabled>Page Setup Error</option>'; localitySelect.disabled = true; }
            return;
        }

        // Update status only if not already success (prevents flicker on load)
        if (!pincodeStatusElement.classList.contains('text-success')) {
            pincodeStatusElement.textContent = 'Fetching...';
            pincodeStatusElement.className = 'pincode-status text-muted';
        }

        try {
            const response = await fetch(`/user/pincode-lookup/${pincode}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                 throw new Error(data.message || `Pincode ${response.statusText}`);
             }

            const location = data.location;

            // Update visible readonly fields
            stateInput.value = location.stateName || '';
            districtInput.value = location.districtName || '';
            mandalInput.value = location.mandalName || '';

             // Update hidden fields for form submission
            stateHiddenInput.value = location.stateName || '';
            districtHiddenInput.value = location.districtName || '';
            mandalHiddenInput.value = location.mandalName || '';

            // Populate Locality Dropdown using the helper
            populateLocalityDropdown(localitySelect, location.localities, savedLocalityValue);

            containerDiv.style.display = 'block'; // Show the container
            const firstLocality = location.localities && location.localities.length > 0 ? location.localities[0] : 'Area';
            pincodeStatusElement.textContent = `✓ Location Found`; // Simpler success message
            pincodeStatusElement.className = 'pincode-status text-success';

        } catch (error) {
             console.error('Pincode lookup error:', error);
             clearAutoFilledFields(prefix); // Clear derived fields on error
             pincodeStatusElement.textContent = `Error: ${error.message}`;
             pincodeStatusElement.className = 'pincode-status text-danger';
             localitySelect.innerHTML = '<option value="" selected disabled>Pincode Error</option>';
             localitySelect.disabled = true;
        }
    }

    function populateLocalityDropdown(selectElement, localities, valueToSelect = null) {
        if (!selectElement) return;
        selectElement.innerHTML = ''; // Clear existing options

        if (localities && localities.length > 0) {
            // Add the default "Select..." option
            const defaultOption = document.createElement('option');
            defaultOption.value = "";
            defaultOption.textContent = "Select Locality / Post Office...";
            defaultOption.disabled = true;
            // Select default option initially only if no specific value needs selecting
            defaultOption.selected = !valueToSelect;
            selectElement.appendChild(defaultOption);

            let valueMatched = false;
            localities.forEach(locality => {
                const option = document.createElement('option');
                option.value = locality; // Use locality name as value
                option.textContent = locality; // Display locality name
                if (valueToSelect && locality === valueToSelect) {
                    option.selected = true; // Pre-select if value matches
                    valueMatched = true;
                }
                selectElement.appendChild(option);
            });

            // If a specific value was provided and matched, unselect the default option
             if (valueMatched) {
                 defaultOption.selected = false;
             }

            selectElement.disabled = false; // Enable the dropdown
        } else {
            // Handle case where API returns success but no localities
            selectElement.innerHTML = '<option value="" selected disabled>No Localities Found</option>';
            selectElement.disabled = true;
        }
    }

    function clearAutoFilledFields(prefix) {
        const stateInput = document.getElementById(`${prefix}-state`);
        const districtInput = document.getElementById(`${prefix}-district`);
        const mandalInput = document.getElementById(`${prefix}-mandal`);
        const stateHiddenInput = document.getElementById(`${prefix}-state-hidden`);
        const districtHiddenInput = document.getElementById(`${prefix}-district-hidden`);
        const mandalHiddenInput = document.getElementById(`${prefix}-mandal-hidden`);
        const containerDiv = document.getElementById(`${prefix}-auto-filled-fields`);
        const localitySelect = document.getElementById(`${prefix}-locality`);

        if (stateInput) stateInput.value = '';
        if (districtInput) districtInput.value = '';
        if (mandalInput) mandalInput.value = '';
        if (stateHiddenInput) stateHiddenInput.value = '';
        if (districtHiddenInput) districtHiddenInput.value = '';
        if (mandalHiddenInput) mandalHiddenInput.value = '';
        if (containerDiv) containerDiv.style.display = 'none'; // Hide the container

        // Reset the locality dropdown
        if (localitySelect) {
            localitySelect.innerHTML = '<option value="" selected disabled>Enter Pincode First</option>';
            localitySelect.disabled = true;
            localitySelect.value = ''; // Ensure value is cleared
            localitySelect.dataset.savedValue = ''; // Clear saved value tracker
        }
        // Pincode status is usually cleared by the input event handler itself
    }
    // ========================================
    // End Pincode Lookup Logic
    // ========================================

    // ========================================
    // Generic Live Table Filtering Logic
    // ========================================
    /**
     * Sets up live filtering for a table based on text input.
     * @param {string} inputId ID of the filter input element.
     * @param {string} tableId ID of the table element.
     * @param {string} noResultsId ID of the 'no results' <tr> element.
     * @param {string} rowSelectorClass CSS class used to identify data rows in the tbody.
     */
    function setupGenericTableFilter(inputId, tableId, noResultsId, rowSelectorClass) {
        const filterInput = document.getElementById(inputId);
        const table = document.getElementById(tableId);
        const noResultsRow = document.getElementById(noResultsId);

        if (!filterInput || !table || !noResultsRow) {
            // console.warn(`Filter setup skipped for ${inputId}. Missing elements.`); // Optional warning
            return; // Exit if any required element is missing
        }

        const tableBody = table.querySelector('tbody');
        if (!tableBody) {
            // console.warn(`Filter setup skipped for ${tableId}. Missing tbody.`); // Optional warning
            return; // Exit if table structure is unexpected
        }

        filterInput.addEventListener('input', () => {
            const filterValue = filterInput.value.trim().toLowerCase();
            const rows = tableBody.querySelectorAll(`tr.${rowSelectorClass}`); // Select only data rows
            let matchFound = false;

            rows.forEach(row => {
                const rowText = row.textContent.toLowerCase();
                if (filterValue === '' || rowText.includes(filterValue)) {
                    row.style.display = ''; // Show row (reverts to default display)
                    matchFound = true;
                } else {
                    row.style.display = 'none'; // Hide row
                }
            });

            // Toggle the 'no results' row visibility
            if (!matchFound && rows.length > 0) { // Only show 'no results' if there were rows to filter
                noResultsRow.classList.remove('hidden');
                noResultsRow.style.display = ''; // Use default display (usually table-row)
            } else {
                noResultsRow.classList.add('hidden');
                noResultsRow.style.display = 'none'; // Hide 'no results' row
            }
        });
    }

    // --- Call the setup function for ALL tables that need filtering ---
    setupGenericTableFilter('order-filter-input', 'admin-order-table', 'no-admin-orders-found', 'order-row');
    setupGenericTableFilter('order-filter-input', 'seller-order-table', 'no-seller-orders-found', 'order-row'); // Assumes same input ID pattern
    setupGenericTableFilter('admin-product-filter-input', 'admin-product-table', 'no-admin-products-found', 'product-row');
    setupGenericTableFilter('seller-product-filter-input', 'seller-product-table', 'no-seller-products-found', 'product-row');
    setupGenericTableFilter('user-filter-input', 'admin-user-table', 'no-admin-users-found', 'user-row'); // User filter

    // ========================================
    // End Live Table Filtering Logic
    // ========================================


    // ========================================
    // Generic Infinite Sliding Logic (Handles Banner & Product Images)
    // ========================================
    /**
     * Initializes an infinite sliding carousel.
     * @param {string} containerSelector - CSS selector for the main slider container element.
     * @param {object} options - Configuration options.
     * @param {number} [options.slideIntervalTime=5000] - Autoplay interval in ms (0 to disable).
     * @param {string} [options.slideClass='[data-slide]'] - CSS selector for individual slide elements.
     * @param {string} [options.wrapperClass='[data-slides-wrapper]'] - CSS selector for the wrapper holding the slides.
     * @param {string} [options.prevBtnClass='[data-slider-prev]'] - CSS selector for the previous button.
     * @param {string} [options.nextBtnClass='[data-slider-next]'] - CSS selector for the next button.
     * @param {string} [options.dotsContainerClass='[data-slider-dots]'] - CSS selector for the dots container.
     * @param {string} [options.dotClass='[data-slide-to]'] - CSS selector for individual dot elements.
     * @param {string} [options.dotDataAttribute='data-slide-to'] - Data attribute on dots containing the target index.
     */
    function initializeInfiniteSlider(containerSelector, options = {}) {
        const sliderContainer = document.querySelector(containerSelector);
        if (!sliderContainer) {
            // console.log(`Slider container "${containerSelector}" not found.`);
            return;
        }

        const config = {
            slideIntervalTime: 5000,
            slideClass: '[data-slide]', // Default to data-slide used in banner
            wrapperClass: '[data-slides-wrapper]',
            prevBtnClass: '[data-slider-prev]',
            nextBtnClass: '[data-slider-next]',
            dotsContainerClass: '[data-slider-dots]',
            dotClass: '[data-slide-to]', // Use the data attribute itself as selector part
            dotDataAttribute: 'data-slide-to',
            ...options // Override defaults with provided options
        };

        const slidesWrapper = sliderContainer.querySelector(config.wrapperClass);
        const originalSlides = Array.from(sliderContainer.querySelectorAll(`${config.wrapperClass} > ${config.slideClass}`)); // Select direct children matching slideClass

        const prevBtn = sliderContainer.querySelector(config.prevBtnClass);
        const nextBtn = sliderContainer.querySelector(config.nextBtnClass);
        const dotsContainer = sliderContainer.querySelector(config.dotsContainerClass);
        let dots = dotsContainer ? Array.from(dotsContainer.querySelectorAll(config.dotClass)) : [];

        if (!slidesWrapper || originalSlides.length === 0) {
            // console.log(`Slider "${containerSelector}" missing wrapper or slides.`);
            // Optionally hide controls if no slides
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
            return;
        }

        let totalOriginalSlides = originalSlides.length;
        let currentIndex = 1; // Start at the first *original* slide (index 1 after cloning)
        let totalSlidesIncludingClones = totalOriginalSlides;
        let isTransitioning = false;
        let autoSlideInterval = null;
        let isDragging = false;
        let startX = 0;
        let currentX = 0;
        let diffX = 0;
        const swipeThreshold = 50; // Min pixels to swipe

        // --- Setup Clones for Infinite Loop (only if more than 1 slide) ---
        if (totalOriginalSlides > 1) {
            const firstClone = originalSlides[0].cloneNode(true);
            const lastClone = originalSlides[totalOriginalSlides - 1].cloneNode(true);

            // Remove data attributes from clones if they cause issues (e.g., duplicate IDs)
            firstClone.removeAttribute(config.slideClass.replace(/[\[\]]/g, '')); // Remove data-slide attribute if that's the selector
            lastClone.removeAttribute(config.slideClass.replace(/[\[\]]/g, ''));
            // Ensure specific dot data attributes are removed if they exist
             const dotAttr = config.dotDataAttribute;
             if (dotAttr) {
                 firstClone.removeAttribute(dotAttr);
                 lastClone.removeAttribute(dotAttr);
                 // Also check children if necessary, although unlikely for slides
             }

            slidesWrapper.appendChild(firstClone);
            slidesWrapper.insertBefore(lastClone, originalSlides[0]);
            totalSlidesIncludingClones = totalOriginalSlides + 2;
        } else {
            // Only one slide, disable controls and interval
            currentIndex = 0; // Only one slide at index 0
            if (prevBtn) prevBtn.style.display = 'none';
            if (nextBtn) nextBtn.style.display = 'none';
            if (dotsContainer) dotsContainer.style.display = 'none';
            config.slideIntervalTime = 0; // Disable autoslide
        }

        // --- Initial Positioning ---
        function setInitialPosition() {
            slidesWrapper.style.transition = 'none'; // No transition for initial set
            slidesWrapper.style.transform = `translateX(-${currentIndex * 100}%)`;
            // Force reflow/repaint before re-enabling transitions
            void slidesWrapper.offsetWidth;
            // Set transition after initial position is set
            slidesWrapper.style.transition = 'transform 0.5s ease-in-out';
        }

        // --- Update Dots ---
        function updateDots(targetOriginalIndex) {
            if (dots.length !== totalOriginalSlides) return; // Ensure dots match original slides
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === targetOriginalIndex);
            });
        }

        // --- Go To Slide Function ---
        function goToSlide(index, withTransition = true) {
            if (isTransitioning || totalSlidesIncludingClones <= 1) return; // Prevent multiple transitions / no slides
            isTransitioning = true;

            slidesWrapper.style.transition = withTransition ? 'transform 0.5s ease-in-out' : 'none';
            slidesWrapper.style.transform = `translateX(-${index * 100}%)`;
            currentIndex = index;

            // Calculate the corresponding dot index (0-based for original slides)
            let targetOriginalIndex = (currentIndex - 1 + totalOriginalSlides) % totalOriginalSlides;
            updateDots(targetOriginalIndex);

            // If not using transition (jump), reset isTransitioning immediately
             if (!withTransition) {
                setTimeout(() => { isTransitioning = false; }, 50); // Small delay to ensure styles apply
             }
        }

        // --- Handle Transition End for Infinite Loop Jump ---
        slidesWrapper.addEventListener('transitionend', () => {
            isTransitioning = false; // Transition finished

             if (totalOriginalSlides <= 1) return; // No jump needed for single slide

            // Jump from last clone to original first slide
            if (currentIndex === totalSlidesIncludingClones - 1) {
                 goToSlide(1, false); // Jump to index 1 (first original) without transition
            }
            // Jump from first clone to original last slide
            else if (currentIndex === 0) {
                 goToSlide(totalOriginalSlides, false); // Jump to index totalOriginalSlides (last original) without transition
            }
        });

        // --- Navigation Button Listeners ---
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                if (isTransitioning || totalSlidesIncludingClones <= 1) return;
                goToSlide(currentIndex + 1);
                resetAutoSlide(); // Reset timer on manual interaction
            });
        }
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (isTransitioning || totalSlidesIncludingClones <= 1) return;
                goToSlide(currentIndex - 1);
                resetAutoSlide();
            });
        }

        // --- Dot Navigation Listeners ---
        if (dotsContainer && dots.length > 0) {
            dots.forEach((dot) => {
                dot.addEventListener('click', (e) => {
                    if (isTransitioning || totalSlidesIncludingClones <= 1) return;
                     // Use closest to ensure we get the button even if user clicks inner element like <i>
                    const targetDotButton = e.target.closest(`[${config.dotDataAttribute}]`);
                    if (targetDotButton) {
                        const targetOriginalIndex = parseInt(targetDotButton.getAttribute(config.dotDataAttribute), 10);
                        if (!isNaN(targetOriginalIndex)) {
                            goToSlide(targetOriginalIndex + 1); // Go to actual index (+1 for clone)
                            resetAutoSlide();
                        }
                    }
                });
            });
        }


        // --- Auto Sliding ---
        function startAutoSlide() {
            if (config.slideIntervalTime <= 0 || totalSlidesIncludingClones <= 1) return; // Only if interval > 0 and more than one slide
            clearInterval(autoSlideInterval); // Clear previous interval
            autoSlideInterval = setInterval(() => {
                goToSlide(currentIndex + 1);
            }, config.slideIntervalTime);
        }

        function resetAutoSlide() {
            clearInterval(autoSlideInterval);
            startAutoSlide();
        }

        // Pause on hover
        sliderContainer.addEventListener('mouseenter', () => clearInterval(autoSlideInterval));
        sliderContainer.addEventListener('mouseleave', startAutoSlide);
        // Also pause on focus within slider elements (accessibility)
        sliderContainer.addEventListener('focusin', () => clearInterval(autoSlideInterval));
        sliderContainer.addEventListener('focusout', startAutoSlide);


        // --- Touch/Swipe Listeners ---
        function handleTouchStart(event) {
            if (totalSlidesIncludingClones <= 1) return;
            isDragging = true;
            startX = event.touches[0].pageX;
            currentX = startX;
            diffX = 0;
            clearInterval(autoSlideInterval); // Pause auto slide
            slidesWrapper.style.transition = 'none'; // Disable transition during drag
        }

        function handleTouchMove(event) {
             if (!isDragging || totalSlidesIncludingClones <= 1) return;
             currentX = event.touches[0].pageX;
             diffX = startX - currentX;
             // Apply drag effect directly to transform
             const currentTranslate = -currentIndex * slidesWrapper.offsetWidth; // Base position
             slidesWrapper.style.transform = `translateX(${currentTranslate - diffX}px)`;
             // Simple check to prevent vertical scroll during horizontal swipe
             if (Math.abs(diffX) > 10) {
                // Note: preventDefault() here can block vertical scrolling, use carefully
                // event.preventDefault();
             }
        }

        function handleTouchEnd() {
             if (!isDragging || totalSlidesIncludingClones <= 1) return;
             isDragging = false;
             slidesWrapper.style.transition = 'transform 0.5s ease-in-out'; // Re-enable transition

             if (Math.abs(diffX) > swipeThreshold) {
                 if (diffX > 0) { goToSlide(currentIndex + 1); } // Swipe Left -> Next
                 else { goToSlide(currentIndex - 1); } // Swipe Right -> Prev
             } else {
                 // Didn't swipe enough, snap back to current slide
                 goToSlide(currentIndex);
             }
             // Reset variables and restart auto-slide
             startX = 0; currentX = 0; diffX = 0;
             resetAutoSlide();
         }

        if (totalSlidesIncludingClones > 1) {
            sliderContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
            sliderContainer.addEventListener('touchmove', handleTouchMove, { passive: true }); // Use passive: true if not preventing default
            sliderContainer.addEventListener('touchend', handleTouchEnd);
            sliderContainer.addEventListener('touchcancel', handleTouchEnd); // Handle cancelled touches
        }

        // --- Initialize ---
        setInitialPosition(); // Set initial position without transition
        updateDots(0); // Update dots for the first original slide
        startAutoSlide(); // Start auto-slide if applicable

         // --- Make Controls Visible After Setup (if applicable) ---
         if (totalOriginalSlides > 1) {
            if (prevBtn) prevBtn.style.display = 'flex'; // Or 'block'/'inline-flex' as needed
            if (nextBtn) nextBtn.style.display = 'flex';
            if (dotsContainer) dotsContainer.style.display = 'flex';
        }

    } // --- End initializeInfiniteSlider ---


    // --- Call the function for the Banner Slider ---
    initializeInfiniteSlider('[data-slider-container]', {
        // Options specific to banner slider if needed, otherwise defaults are used
        // Example: slideIntervalTime: 6000
    });

    // --- Call the function for the Product Detail Slider ---
    initializeInfiniteSlider('[data-product-image-slider]', {
        slideClass: '[data-product-slide]', // Specify the slide selector used here
        wrapperClass: '[data-product-slides-wrapper]',
        prevBtnClass: '[data-product-image-nav="prev"]',
        nextBtnClass: '[data-product-image-nav="next"]',
        dotsContainerClass: '.product-image-dots', // Class selector for dots container
        dotClass: '[data-product-image-dot]', // Selector for dots
        dotDataAttribute: 'data-product-image-dot', // Attribute containing index
        slideIntervalTime: 0 // Disable auto-slide for product images
    });

    // ========================================
    // End Generic Infinite Sliding Logic
    // ========================================


}); // End DOMContentLoaded


// ===================================================
// Helper Functions (Defined outside DOMContentLoaded)
// ===================================================

// --- Cart Update AJAX Function ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement, quantityInputElement) {
     // Use the button's text or a default
     const originalButtonText = quantityInputElement?.dataset.originalButtonText || 'Update';
     const loadingButtonText = '<i class="fas fa-spinner fa-spin"></i>';
     const cartItemDiv = buttonElement.closest('.cart-item');

     if (!quantityInputElement?.dataset.originalButtonText) {
         quantityInputElement.dataset.originalButtonText = buttonElement.textContent.trim() || 'Update';
     }

     buttonElement.disabled = true;
     buttonElement.innerHTML = loadingButtonText;
     if(quantityInputElement) quantityInputElement.readOnly = true;

    try {
        const response = await fetch('/user/cart/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json' // Indicate expected response type
            },
            body: JSON.stringify({ productId, quantity })
         });

        const data = await response.json(); // Assume server always sends JSON

        if (!response.ok) {
             // Handle specific case where item becomes unavailable during update
             if (data.removal === true && cartItemDiv) {
                 showToast(data.message || 'Item unavailable and removed.', 'warning');
                 // Animate removal
                 cartItemDiv.style.transition = 'opacity 0.3s ease, height 0.3s ease, margin 0.3s ease, padding 0.3s ease, border 0.3s ease';
                 cartItemDiv.style.opacity = '0';
                 cartItemDiv.style.height = '0';
                 cartItemDiv.style.marginTop = '0';
                 cartItemDiv.style.marginBottom = '0';
                 cartItemDiv.style.paddingTop = '0';
                 cartItemDiv.style.paddingBottom = '0';
                 cartItemDiv.style.borderWidth = '0';
                 setTimeout(() => {
                     if (cartItemDiv.parentNode) cartItemDiv.remove();
                     updateCartTotalAndBadge(data.cartTotal); // Update total from response
                     handleEmptyCartDisplay(); // Check if cart is now empty
                 }, 300); // Match transition duration
                 return; // Exit function after initiating removal
             } else {
                 // General error handling
                 throw new Error(data.message || `Update failed (Status: ${response.status})`);
             }
        }

         // --- Handle successful update ---
         if (data.success) {
             if(quantityInputElement) {
                 quantityInputElement.dataset.originalValue = data.newQuantity; // Update original value tracker
             }

             if (quantity === 0 && cartItemDiv) { // Handle removal via quantity 0
                 // Animate removal (same as above)
                 cartItemDiv.style.transition = 'opacity 0.3s ease, height 0.3s ease, margin 0.3s ease, padding 0.3s ease, border 0.3s ease';
                 cartItemDiv.style.opacity = '0';
                 cartItemDiv.style.height = '0';
                 cartItemDiv.style.marginTop = '0';
                 cartItemDiv.style.marginBottom = '0';
                 cartItemDiv.style.paddingTop = '0';
                 cartItemDiv.style.paddingBottom = '0';
                 cartItemDiv.style.borderWidth = '0';
                 setTimeout(() => {
                     if (cartItemDiv.parentNode) cartItemDiv.remove();
                     updateCartTotalAndBadge(data.cartTotal);
                     handleEmptyCartDisplay();
                     showToast('Item removed from cart.', 'success');
                 }, 300);
                 return; // Exit after starting removal animation
             } else if (cartItemDiv) {
                 // Update UI for non-zero quantity
                 const subtotalSpan = cartItemDiv.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = (data.itemSubtotal !== undefined ? data.itemSubtotal : 0).toFixed(2);
                 if(quantityInputElement) quantityInputElement.value = data.newQuantity;
                 updateCartTotalAndBadge(data.cartTotal); // Update total from response
                 // showToast('Cart quantity updated.', 'success'); // Optional success message
             }
         } else {
              // Handle cases where data.success might be false but response was 200 OK (less common)
              showToast(`Update failed: ${data.message || 'Unknown error'}`, 'danger');
              if(quantityInputElement && quantityInputElement.dataset.originalValue) {
                  quantityInputElement.value = quantityInputElement.dataset.originalValue;
              }
         }

    } catch (error) {
         console.error('Error updating cart quantity:', error);
          showToast(`Error: ${error.message}`, 'danger');
          // Restore input value on error
          if(quantityInputElement && quantityInputElement.dataset.originalValue) {
            quantityInputElement.value = quantityInputElement.dataset.originalValue;
          }

    } finally {
         // Re-enable button only if the item wasn't removed
         if (cartItemDiv && (!cartItemDiv.style.opacity || parseFloat(cartItemDiv.style.opacity) !== 0)) {
             buttonElement.disabled = false;
             buttonElement.innerHTML = quantityInputElement?.dataset.originalButtonText || 'Update'; // Restore original text
             if(quantityInputElement) quantityInputElement.readOnly = false;
         }
     }
}

// --- Helper Function to Show Toasts Dynamically ---
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error("Toast container not found! Falling back to alert.");
        alert(`${type.toUpperCase()}: ${message}`); // Fallback alert
        return;
    }

    const toastElement = document.createElement('div');
    toastElement.className = `toast toast-${type}`; // e.g., toast-success, toast-danger
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');

    // Basic sanitization to prevent HTML injection from the message
    const sanitizedMessage = typeof message === 'string'
        ? message.replace(/</g, "<").replace(/>/g, ">")
        : 'An unexpected error occurred.';

    toastElement.innerHTML = `
        <div class="toast-body">
            ${sanitizedMessage}
            <button type="button" class="toast-close-btn" aria-label="Close">×</button>
        </div>
    `;

    const closeButton = toastElement.querySelector('.toast-close-btn');
    toastContainer.appendChild(toastElement);

    const autoHideDelay = 5000; // 5 seconds
    let hideTimeoutId;

    const dismissToast = () => {
        clearTimeout(hideTimeoutId);
        if (toastElement.classList.contains('hide') || !toastElement.parentNode) return;
        toastElement.classList.remove('show');
        toastElement.classList.add('hide');
        toastElement.addEventListener('transitionend', (event) => {
             // Ensure removal only happens once and for the correct transition
            if (event.target === toastElement && (event.propertyName === 'opacity' || event.propertyName === 'transform')) {
                if (toastElement.classList.contains('hide') && toastElement.parentNode) {
                   try { toastElement.remove(); } catch(e) { console.warn("Error removing toast:", e); }
                }
            }
        }, { once: true });
    };

    // Trigger the show animation shortly after appending
    setTimeout(() => {
        if (toastElement.parentNode) { // Check if still in DOM
           toastElement.classList.add('show');
        }
    }, 10); // Short delay

    // Set auto-hide timer
    hideTimeoutId = setTimeout(dismissToast, autoHideDelay);

    // Add close button functionality
    if (closeButton) { closeButton.addEventListener('click', dismissToast); }

    // Pause timer on hover, resume on leave
    toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
    toastElement.addEventListener('mouseleave', () => {
        clearTimeout(hideTimeoutId); // Clear existing timeout
        hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2); // Resume with potentially shorter delay
    });
}


// --- Helper Functions for Cart Badge and Empty Display ---
function updateCartTotalAndBadge(newCartTotal) {
     const cartTotalSpan = document.getElementById('cart-total-value');
     // Update Cart Total Display if element exists
     if (cartTotalSpan) {
         cartTotalSpan.textContent = (newCartTotal !== undefined && typeof newCartTotal === 'number' ? newCartTotal : 0).toFixed(2);
     }

     const newCartItemCount = calculateNewCartCount();
     const cartBadge = document.querySelector('.cart-badge');
     // Update Header Cart Badge
     if (cartBadge) {
         if (newCartItemCount > 0) {
             cartBadge.textContent = newCartItemCount;
             cartBadge.classList.remove('hide');
         } else {
            cartBadge.textContent = '0'; // Keep badge structure but hide content visually or via class
            cartBadge.classList.add('hide');
         }
     }
}

function calculateNewCartCount() {
    // Calculate count based on *visible* cart items in the DOM
    // This is simpler than trying to sync perfectly with server/session state
    const cartItems = document.querySelectorAll('.cart-item');
    let count = 0;
    cartItems.forEach(item => {
        // Check if the item is currently displayed and not marked for removal (e.g., opacity 0)
        const style = window.getComputedStyle(item);
        if (style.display !== 'none' && (!item.style.opacity || parseFloat(item.style.opacity) > 0)) {
            count++;
        }
    });
    return count;
}

function handleEmptyCartDisplay() {
    const cartItemsContainer = document.querySelector('.cart-items');
    const cartContainer = document.querySelector('.cart-container');
    const cartSummary = document.querySelector('.cart-summary');

    // Check if the main containers exist
    if (cartItemsContainer && cartContainer) {
        // Check if there are any visible items left
        const visibleItems = Array.from(cartItemsContainer.querySelectorAll('.cart-item')).filter(item => {
            const style = window.getComputedStyle(item);
            return style.display !== 'none' && (!item.style.opacity || parseFloat(item.style.opacity) > 0);
        });

        if (visibleItems.length === 0) {
            // Only add the "empty" message if it's not already there
            if (!cartContainer.querySelector('.alert-info')) {
                // Clear the items container specifically
                cartItemsContainer.innerHTML = '';
                // Remove the summary section if it exists
                if (cartSummary) cartSummary.remove();

                // Create and insert the "empty cart" message
                const emptyCartHTML = `
                    <p class="alert alert-info mt-3">
                        Your cart is empty. <a href="/" class="alert-link">Continue Shopping</a>
                    </p>`;
                 // Insert after the H1 title
                 const h1 = cartContainer.querySelector('h1');
                 if (h1) {
                     h1.insertAdjacentHTML('afterend', emptyCartHTML);
                 } else {
                     // Fallback if H1 isn't found (less likely)
                     cartContainer.insertAdjacentHTML('beforeend', emptyCartHTML);
                 }
            }
        }
    }
}