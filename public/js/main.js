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
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                // Reset button if user navigates back without form submitting (browser specific)
                window.addEventListener('pageshow', function(pageEvent) { // Renamed event variable
                    if (pageEvent.persisted && submitButton.disabled) {
                        // Restore button only if it still has the loading state
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
            // Check if editing existing or adding new
            const isEditing = savedAddressDiv.querySelector('strong') !== null;
            addressForm.querySelector('h3').textContent = isEditing ? 'Edit Address' : 'Add Address';
            savedAddressDiv.classList.add('hidden');
            if (addAddressBtn) addAddressBtn.classList.add('hidden'); // Hide Add button when form is visible
            if (cancelAddressBtn) cancelAddressBtn.classList.remove('hidden'); // Always show Cancel when form is open

             // Trigger pincode check if pincode has value when form is shown for edit
             const pincodeInput = addressForm.querySelector('#profile-pincode');
             if (pincodeInput && pincodeInput.value.length === 6 && /^\d{6}$/.test(pincodeInput.value)) {
                 fetchPincodeData(pincodeInput.value, 'profile');
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
            // Clear status messages when hiding
            const statusElement = addressForm.querySelector('.pincode-status');
            if (statusElement) statusElement.textContent = '';
        };

        if (editAddressBtn) {
            editAddressBtn.addEventListener('click', showAddressForm);
        }
        if (addAddressBtn) {
             addAddressBtn.addEventListener('click', () => {
                 if(addressForm) addressForm.reset(); // Clear form fields when adding new
                 clearAutoFilledFields('profile'); // Clear auto-filled fields too
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
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn) return;
            nameForm.classList.remove('hidden');
            savedNameDisplaySpan.classList.add('hidden');
            editNameBtn.classList.add('hidden');
            if(displayUserNameStrong) nameInput.value = displayUserNameStrong.textContent;
            nameInput.focus();
        };

        const hideNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn || !displayUserNameStrong) return;
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
                checkoutAddressForm.querySelector('h3').textContent = 'Edit Address';
                if (checkoutCancelBtn) checkoutCancelBtn.classList.remove('hidden');
                // Trigger pincode check if pincode has value when form is shown for edit
                const pincodeInput = checkoutAddressForm.querySelector('#checkout-pincode');
                if (pincodeInput && pincodeInput.value.length === 6 && /^\d{6}$/.test(pincodeInput.value)) {
                    fetchPincodeData(pincodeInput.value, 'checkout');
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
                // Clear status messages when hiding
                const statusElement = checkoutAddressForm.querySelector('.pincode-status');
                if (statusElement) statusElement.textContent = '';
            });
        }

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
    }


    // --- Cart Update AJAX Logic ---
    const updateQtyButtons = document.querySelectorAll('.btn-update-qty');
    updateQtyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
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
                quantityInput.value = maxStock;
                 return;
             }
            updateCartItemQuantityAJAX(productId, newQuantity, button, quantityInput);
        });
    });


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
                    <img src="${safeImageUrl}" alt="${safeName}" loading="lazy">
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
             const link = e.target.closest('a');
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
    const toastContainer = document.querySelector('.toast-container');
    if (toastContainer) {
        const toastElements = toastContainer.querySelectorAll('.toast');

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
                        toastElement.remove();
                    }
                }, { once: true });
            };

            setTimeout(() => {
                if (toastElement.parentNode) {
                   toastElement.classList.add('show');
                }
            }, 0);

             hideTimeoutId = setTimeout(dismissToast, autoHideDelay);

            if (closeButton) {
                closeButton.addEventListener('click', dismissToast);
            }

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
            requestAnimationFrame(() => {
                 if(el.parentNode) {
                    el.style.width = width + '%';
                 }
            });
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
                return;
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

        function showSlide(index) {
            if (!slides || slides.length === 0) return;
            const newIndex = (index + slides.length) % slides.length;
            slides.forEach((slide, i) => { slide.classList.remove('active'); });
            dots.forEach(dot => { dot.classList.remove('active'); });
            slides[newIndex].classList.add('active');
            if (dots[newIndex]) { dots[newIndex].classList.add('active'); }
            currentSlideIndex = newIndex;
        }
        function nextSlide() { showSlide(currentSlideIndex + 1); }
        function prevSlide() { showSlide(currentSlideIndex - 1); }
        function startAutoSlide() {
            clearInterval(autoSlideInterval);
            if (slides.length > 1) { autoSlideInterval = setInterval(nextSlide, slideIntervalTime); }
        }
        if (slides.length > 0) { showSlide(0); startAutoSlide(); }
        if (nextBtn) { nextBtn.addEventListener('click', () => { nextSlide(); startAutoSlide(); }); }
        if (prevBtn) { prevBtn.addEventListener('click', () => { prevSlide(); startAutoSlide(); }); }
        if (dotsContainer) {
            dotsContainer.addEventListener('click', (e) => {
                const targetDot = e.target.closest('[data-slide-to]');
                if (targetDot) {
                    const index = parseInt(targetDot.dataset.slideTo, 10);
                    if (!isNaN(index)) { showSlide(index); startAutoSlide(); }
                }
            });
        }
        sliderContainer.addEventListener('mouseenter', () => { clearInterval(autoSlideInterval); });
        sliderContainer.addEventListener('mouseleave', () => { startAutoSlide(); });
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
        input.addEventListener('input', () => {
            clearTimeout(pincodeTimeout);
            const pincode = input.value.trim();
            const targetPrefix = input.dataset.targetPrefix;
            const statusElement = input.nextElementSibling;

            if (pincode.length < 6) {
                 clearAutoFilledFields(targetPrefix);
                 if (statusElement) statusElement.textContent = '';
                 if (pincode.length > 0 && !/^\d*$/.test(pincode)) {
                     if (statusElement) statusElement.textContent = 'Digits only';
                     statusElement?.classList.add('text-danger');
                     statusElement?.classList.remove('text-muted');
                 } else if (statusElement) {
                     statusElement?.classList.remove('text-danger');
                     statusElement?.classList.add('text-muted');
                 }
            }

            if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
                if (statusElement) statusElement.textContent = 'Looking up...';
                statusElement?.classList.remove('text-danger');
                statusElement?.classList.add('text-muted');
                pincodeTimeout = setTimeout(() => {
                    fetchPincodeData(pincode, targetPrefix);
                }, 500);
            }
        });

         input.addEventListener('blur', () => {
             clearTimeout(pincodeTimeout);
             const pincode = input.value.trim();
             const targetPrefix = input.dataset.targetPrefix;
             const statusElement = input.nextElementSibling;

             if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
                 if (statusElement) statusElement.textContent = 'Looking up...';
                 statusElement?.classList.remove('text-danger');
                 statusElement?.classList.add('text-muted');
                 fetchPincodeData(pincode, targetPrefix);
             } else if (pincode.length > 0) {
                 clearAutoFilledFields(targetPrefix);
                 if (statusElement) statusElement.textContent = 'Invalid Pincode';
                 statusElement?.classList.add('text-danger');
                 statusElement?.classList.remove('text-muted');
             } else {
                  clearAutoFilledFields(targetPrefix);
                  if (statusElement) statusElement.textContent = '';
             }
         });

        const initialPincode = input.value.trim();
        if (initialPincode.length === 6 && /^\d{6}$/.test(initialPincode)) {
            const targetPrefix = input.dataset.targetPrefix;
            fetchPincodeData(initialPincode, targetPrefix);
        }

    });

    async function fetchPincodeData(pincode, prefix) {
        const stateInput = document.getElementById(`${prefix}-state`);
        const districtInput = document.getElementById(`${prefix}-district`);
        const mandalInput = document.getElementById(`${prefix}-mandal`);
        const stateHiddenInput = document.getElementById(`${prefix}-state-hidden`);
        const districtHiddenInput = document.getElementById(`${prefix}-district-hidden`);
        const mandalHiddenInput = document.getElementById(`${prefix}-mandal-hidden`);
        const containerDiv = document.getElementById(`${prefix}-auto-filled-fields`);
        const pincodeStatusElement = document.getElementById(`${prefix}-pincode`)?.nextElementSibling;

        if (!stateInput || !districtInput || !mandalInput || !containerDiv || !pincodeStatusElement || !stateHiddenInput || !districtHiddenInput || !mandalHiddenInput) {
            console.error("Pincode target/hidden elements not found for prefix:", prefix);
            return;
        }

        pincodeStatusElement.textContent = 'Fetching...';
        pincodeStatusElement.classList.remove('text-danger', 'text-success');
        pincodeStatusElement.classList.add('text-muted');

        try {
            const response = await fetch(`/user/pincode-lookup/${pincode}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                 throw new Error(data.message || `Pincode ${response.statusText}`);
             }

            const location = data.location;
            stateInput.value = location.stateName || '';
            districtInput.value = location.districtName || '';
            mandalInput.value = location.mandalName || '';

            stateHiddenInput.value = location.stateName || '';
            districtHiddenInput.value = location.districtName || '';
            mandalHiddenInput.value = location.mandalName || '';

            containerDiv.style.display = 'block';
            pincodeStatusElement.textContent = `✓ Location found (${location.postOfficeName || 'Area'})`;
            pincodeStatusElement.classList.remove('text-danger', 'text-muted');
            pincodeStatusElement.classList.add('text-success');

        } catch (error) {
             console.error('Pincode lookup error:', error);
             clearAutoFilledFields(prefix);
             pincodeStatusElement.textContent = `Error: ${error.message}`;
             pincodeStatusElement.classList.remove('text-success', 'text-muted');
             pincodeStatusElement.classList.add('text-danger');
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
         const pincodeStatusElement = document.getElementById(`${prefix}-pincode`)?.nextElementSibling;

         if (stateInput) stateInput.value = '';
         if (districtInput) districtInput.value = '';
         if (mandalInput) mandalInput.value = '';
         if (stateHiddenInput) stateHiddenInput.value = '';
         if (districtHiddenInput) districtHiddenInput.value = '';
         if (mandalHiddenInput) mandalHiddenInput.value = '';
         if (containerDiv) containerDiv.style.display = 'none';
         if (pincodeStatusElement) {
             pincodeStatusElement.textContent = '';
             pincodeStatusElement.classList.remove('text-danger', 'text-success');
             pincodeStatusElement.classList.add('text-muted');
         }
     }
    // ========================================
    // End Pincode Lookup Logic
    // ========================================


}); // End DOMContentLoaded


// --- Cart Update AJAX Function ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement, quantityInputElement) {
     const originalButtonText = 'Update'; // Or use buttonElement.dataset.originalText if set
     const loadingButtonText = '<i class="fas fa-spinner fa-spin"></i>';
     const cartItemDiv = buttonElement.closest('.cart-item');

     buttonElement.disabled = true;
     buttonElement.innerHTML = loadingButtonText;
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
                    cartItemDiv.style.opacity = '0';
                    cartItemDiv.style.height = '0';
                    cartItemDiv.style.paddingTop = '0';
                    cartItemDiv.style.paddingBottom = '0';
                    cartItemDiv.style.marginBottom = '0';
                    cartItemDiv.style.borderWidth = '0';
                     setTimeout(() => {
                         if (cartItemDiv.parentNode) cartItemDiv.remove();
                         updateCartTotalAndBadge(data.cartTotal);
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
                    cartItemDiv.style.opacity = '0';
                    cartItemDiv.style.height = '0';
                    cartItemDiv.style.paddingTop = '0';
                    cartItemDiv.style.paddingBottom = '0';
                    cartItemDiv.style.marginBottom = '0';
                    cartItemDiv.style.borderWidth = '0';
                    setTimeout(() => {
                        if (cartItemDiv.parentNode) {
                           cartItemDiv.remove();
                        }
                        updateCartTotalAndBadge(data.cartTotal);
                        handleEmptyCartDisplay();
                        showToast('Item removed from cart.', 'success');
                    }, 300);
                     return;
                }
             } else {
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = (data.itemSubtotal !== undefined ? data.itemSubtotal : 0).toFixed(2);
                if(quantityInputElement) quantityInputElement.value = data.newQuantity;
                 updateCartTotalAndBadge(data.cartTotal);
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
             buttonElement.innerHTML = 'Update'; // Restore button text
             if(quantityInputElement) quantityInputElement.readOnly = false;
         }
     }
}

// --- Helper Function to Show Toasts Dynamically ---
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error("Toast container not found! Falling back to alert.");
        alert(message);
        return;
    }

    const toastElement = document.createElement('div');
    toastElement.className = `toast toast-${type}`;
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');

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

    const autoHideDelay = 5000;
    let hideTimeoutId;

    const dismissToast = () => {
        clearTimeout(hideTimeoutId);
        if (toastElement.classList.contains('hide') || !toastElement.parentNode) return;
        toastElement.classList.remove('show');
        toastElement.classList.add('hide');
        toastElement.addEventListener('transitionend', (event) => {
            if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && toastElement.classList.contains('hide') && toastElement.parentNode) {
                toastElement.remove();
            }
        }, { once: true });
    };

    setTimeout(() => {
        if (toastElement.parentNode) {
           toastElement.classList.add('show');
        }
    }, 0);

    hideTimeoutId = setTimeout(dismissToast, autoHideDelay);
    if (closeButton) { closeButton.addEventListener('click', dismissToast); }
    toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
    toastElement.addEventListener('mouseleave', () => hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2));
}


// --- Helper Functions for Cart Badge and Empty Display ---
function updateCartTotalAndBadge(newCartTotal) {
     const cartTotalSpan = document.getElementById('cart-total-value');
     if (cartTotalSpan) cartTotalSpan.textContent = (newCartTotal !== undefined ? newCartTotal : 0).toFixed(2);

     const newCartItemCount = calculateNewCartCount();
     const cartBadge = document.querySelector('.cart-badge');
     if (cartBadge) {
         if (newCartItemCount > 0) {
             cartBadge.textContent = newCartItemCount; // Use item count for badge
             cartBadge.classList.remove('hide');
         } else {
            cartBadge.textContent = '0';
            cartBadge.classList.add('hide');
         }
     }
}

function calculateNewCartCount() {
    const cartItems = document.querySelectorAll('.cart-item');
    let count = 0;
    cartItems.forEach(item => {
        const style = window.getComputedStyle(item);
        if (style.display !== 'none' && parseFloat(style.opacity) > 0) {
            count++; // Count items, not total quantity
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
             return style.display !== 'none' && parseFloat(style.opacity) > 0;
         });

         if (visibleItems.length === 0) {
             cartContainer.innerHTML = `
                <h1>Your Shopping Cart</h1>
                <p class="alert alert-info mt-3">
                    Your cart is empty. <a href="/" class="alert-link">Continue Shopping</a>
                </p>`;
             if(cartSummary) cartSummary.remove();
         }
     }
}