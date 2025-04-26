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
                 // Basic sanitization for display
                 const safeName = product.name ? product.name.replace(/</g, "<").replace(/>/g, ">") : '[No Name]';
                 const safeImageUrl = product.imageUrl ? product.imageUrl.replace(/</g, "<").replace(/>/g, ">") : '/images/placeholder.png';
                 item.innerHTML = `
                    <img src="${safeImageUrl}" alt="" loading="lazy"> <%# Alt left blank for brevity %>
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

     // Global click listener to close search/suggestions
     document.addEventListener('click', (e) => {
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
             } else {
                 // Allow link navigation and close dropdown/search
                 suggestionsDropdown.classList.remove('active');
                 if (searchContainer && window.innerWidth < 768) { // Only hide container on mobile
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
                    // Ensure removal only happens once and the element still exists
                    if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && toastElement.classList.contains('hide') && toastElement.parentNode) {
                         try { toastElement.remove(); } catch(e) { console.warn("Error removing toast:", e); }
                    }
                }, { once: true });
            };

            // Show toast initially
            setTimeout(() => {
                if (toastElement.parentNode) { // Check if still in DOM before showing
                   toastElement.classList.add('show');
                }
            }, 10); // Small delay to allow transition

             // Auto hide
             hideTimeoutId = setTimeout(dismissToast, autoHideDelay);

            // Manual close
            if (closeButton) {
                closeButton.addEventListener('click', dismissToast);
            }

             // Pause on hover
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
            // Use requestAnimationFrame for smoother rendering
            requestAnimationFrame(() => {
                 if(el.parentNode) { // Check if element is still in the DOM
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
            // Check if already loading to prevent multiple clicks
            if (proceedCheckoutBtn.classList.contains('loading')) {
                event.preventDefault();
                return;
            }
            proceedCheckoutBtn.classList.add('loading');
            proceedCheckoutBtn.innerHTML = loadingCheckoutText;
            proceedCheckoutBtn.style.pointerEvents = 'none'; // Disable further clicks via pointer
            proceedCheckoutBtn.setAttribute('aria-disabled', 'true');
            // Allow the default link navigation to proceed
        });

        // Handle browser back button scenario
        window.addEventListener('pageshow', function(pageEvent) {
            if (pageEvent.persisted && proceedCheckoutBtn.classList.contains('loading')) {
                // Reset button if the page was loaded from cache and button was loading
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
    // Homepage Banner Slider Logic (with Touch Events)
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
        const slideIntervalTime = 5000; // 5 seconds

        // --- Touch Swipe Variables ---
        let isDragging = false;
        let startX = 0;
        let currentX = 0;
        let diffX = 0;
        const swipeThreshold = 50; // Minimum pixels to swipe to change slide

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
            if (slides.length > 1) {
                autoSlideInterval = setInterval(nextSlide, slideIntervalTime);
            }
        }

        // --- Touch Event Handlers ---
        function handleTouchStart(event) {
            if (slides.length <= 1) return; // No swiping needed for single slide
            isDragging = true;
            startX = event.touches[0].pageX;
            currentX = startX; // Initialize currentX
            diffX = 0;
            clearInterval(autoSlideInterval); // Pause auto-slide on touch
        }

        function handleTouchMove(event) {
            if (!isDragging || slides.length <= 1) return;
            currentX = event.touches[0].pageX;
            diffX = startX - currentX;
            // Optional: prevent default if swipe is mainly horizontal
            if (Math.abs(diffX) > 10) {
               // consider event.preventDefault() here if needed, but touch-action: pan-y might suffice
            }
        }

        function handleTouchEnd() {
            if (!isDragging || slides.length <= 1) return;
            isDragging = false;
            if (Math.abs(diffX) > swipeThreshold) {
                if (diffX > 0) { // Swiped Left
                    nextSlide();
                } else { // Swiped Right
                    prevSlide();
                }
            }
            startX = 0;
            currentX = 0;
            diffX = 0;
            startAutoSlide(); // Resume auto-slide after interaction
        }

        // Initialize first slide and start auto-slide
        if (slides.length > 0) {
            showSlide(0);
            startAutoSlide();
        }

        // Event Listeners for Nav Buttons
        if (nextBtn) { nextBtn.addEventListener('click', () => { nextSlide(); startAutoSlide(); }); }
        if (prevBtn) { prevBtn.addEventListener('click', () => { prevSlide(); startAutoSlide(); }); }

        // Event Listener for Dots
        if (dotsContainer) {
            dotsContainer.addEventListener('click', (e) => {
                const targetDot = e.target.closest('[data-slide-to]');
                if (targetDot) {
                    const index = parseInt(targetDot.dataset.slideTo, 10);
                    if (!isNaN(index)) {
                        showSlide(index);
                        startAutoSlide();
                    }
                }
            });
        }

        // Event Listeners for Touch Swiping
        sliderContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
        sliderContainer.addEventListener('touchmove', handleTouchMove, { passive: false }); // Need false if preventDefault might be used
        sliderContainer.addEventListener('touchend', handleTouchEnd);
        sliderContainer.addEventListener('touchcancel', handleTouchEnd); // Handle interruption

        // Pause on hover (for desktop)
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
            const statusElement = input.nextElementSibling; // Assumes status is the next sibling

            // Basic validation and clearing
            if (pincode.length < 6) {
                 clearAutoFilledFields(targetPrefix); // Clear derived fields
                 if (statusElement) {
                    statusElement.textContent = ''; // Clear status message
                    statusElement.classList.remove('text-danger', 'text-success');
                    statusElement.classList.add('text-muted');
                 }
                 // Show digit-only error immediately if non-digits are entered
                 if (pincode.length > 0 && !/^\d*$/.test(pincode)) {
                     if (statusElement) {
                        statusElement.textContent = 'Digits only';
                        statusElement.classList.add('text-danger');
                        statusElement.classList.remove('text-muted');
                    }
                 }
                 return; // Stop processing if less than 6 digits
            }

            // If 6 digits and valid format, start fetch timeout
            if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
                if (statusElement) {
                    statusElement.textContent = 'Looking up...';
                    statusElement.classList.remove('text-danger', 'text-success');
                    statusElement.classList.add('text-muted');
                }
                pincodeTimeout = setTimeout(() => {
                    fetchPincodeData(pincode, targetPrefix);
                }, 500); // Wait 500ms after user stops typing
            } else if (pincode.length === 6) {
                 // If 6 chars but not all digits
                 clearAutoFilledFields(targetPrefix);
                 if (statusElement) {
                    statusElement.textContent = 'Invalid Pincode (digits only)';
                    statusElement.classList.add('text-danger');
                    statusElement.classList.remove('text-muted', 'text-success');
                 }
            }
        });

         // Optional: Fetch on blur if not already fetched/fetching
         input.addEventListener('blur', () => {
             clearTimeout(pincodeTimeout); // Clear any pending timeout
             const pincode = input.value.trim();
             const targetPrefix = input.dataset.targetPrefix;
             const statusElement = input.nextElementSibling;

             if (pincode.length === 6 && /^\d{6}$/.test(pincode)) {
                 // Fetch only if status isn't already success or currently fetching
                 if (statusElement && !statusElement.classList.contains('text-success') && statusElement.textContent !== 'Fetching...') {
                      statusElement.textContent = 'Looking up...';
                      statusElement.classList.remove('text-danger');
                      statusElement.classList.add('text-muted');
                      fetchPincodeData(pincode, targetPrefix);
                 }
             } else if (pincode.length > 0) {
                 // If left field with invalid pincode
                 clearAutoFilledFields(targetPrefix);
                 if (statusElement) {
                    statusElement.textContent = 'Invalid Pincode';
                    statusElement.classList.add('text-danger');
                    statusElement.classList.remove('text-muted', 'text-success');
                 }
             } else {
                  // If left field empty
                  clearAutoFilledFields(targetPrefix);
                  if (statusElement) statusElement.textContent = '';
             }
         });

        // Initial check on page load for pre-filled pincodes
        const initialPincode = input.value.trim();
        if (initialPincode.length === 6 && /^\d{6}$/.test(initialPincode)) {
            const targetPrefix = input.dataset.targetPrefix;
            // Optionally add 'Looking up...' status immediately on load
            const initialStatusElement = input.nextElementSibling;
            if (initialStatusElement) {
                initialStatusElement.textContent = 'Verifying...';
                initialStatusElement.classList.add('text-muted');
            }
            fetchPincodeData(initialPincode, targetPrefix);
        }

    }); // end pincodeInputs.forEach

    async function fetchPincodeData(pincode, prefix) {
        // Get references to all related elements using the prefix
        const stateInput = document.getElementById(`${prefix}-state`);
        const districtInput = document.getElementById(`${prefix}-district`);
        const mandalInput = document.getElementById(`${prefix}-mandal`);
        const stateHiddenInput = document.getElementById(`${prefix}-state-hidden`);
        const districtHiddenInput = document.getElementById(`${prefix}-district-hidden`);
        const mandalHiddenInput = document.getElementById(`${prefix}-mandal-hidden`);
        const containerDiv = document.getElementById(`${prefix}-auto-filled-fields`);
        const pincodeInput = document.getElementById(`${prefix}-pincode`);
        const pincodeStatusElement = pincodeInput?.nextElementSibling; // Status element is next sibling

        // Ensure all required elements are found
        if (!stateInput || !districtInput || !mandalInput || !containerDiv || !pincodeStatusElement || !stateHiddenInput || !districtHiddenInput || !mandalHiddenInput) {
            console.error("Pincode target/hidden elements not found for prefix:", prefix);
            if (pincodeStatusElement) pincodeStatusElement.textContent = 'Setup Error';
            return;
        }

        // Set status to fetching if not already success
        if (!pincodeStatusElement.classList.contains('text-success')) {
            pincodeStatusElement.textContent = 'Fetching...';
            pincodeStatusElement.classList.remove('text-danger', 'text-success');
            pincodeStatusElement.classList.add('text-muted');
        }

        try {
            const response = await fetch(`/user/pincode-lookup/${pincode}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                 // Throw error with message from server or default HTTP status text
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

            containerDiv.style.display = 'block'; // Show the container with derived fields
            pincodeStatusElement.textContent = `✓ Location found (${location.postOfficeName || 'Area'})`;
            pincodeStatusElement.classList.remove('text-danger', 'text-muted');
            pincodeStatusElement.classList.add('text-success');

        } catch (error) {
             console.error('Pincode lookup error:', error);
             clearAutoFilledFields(prefix); // Clear fields on error
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
        // Don't clear the pincode status here, let the input/blur handler manage it

         if (stateInput) stateInput.value = '';
         if (districtInput) districtInput.value = '';
         if (mandalInput) mandalInput.value = '';
         if (stateHiddenInput) stateHiddenInput.value = '';
         if (districtHiddenInput) districtHiddenInput.value = '';
         if (mandalHiddenInput) mandalHiddenInput.value = '';
         if (containerDiv) containerDiv.style.display = 'none'; // Hide the container
     }
    // ========================================
    // End Pincode Lookup Logic
    // ========================================


    // ========================================
    // Live Order Filtering Logic (Admin & Seller)
    // ========================================
    const orderFilterInput = document.getElementById('order-filter-input');
    const adminOrderTable = document.getElementById('admin-order-table');
    const sellerOrderTable = document.getElementById('seller-order-table');

    let targetOrderTableBody = null; // Renamed variable
    let noOrderResultsRow = null;    // Renamed variable

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
            // Select only rows meant to contain order data
            const rows = targetOrderTableBody.querySelectorAll('tr.order-row');
            let matchFound = false;

            rows.forEach(row => {
                const rowText = row.textContent.toLowerCase();
                if (filterValue === '' || rowText.includes(filterValue)) {
                    row.style.display = ''; // Use default display (table-row)
                    matchFound = true;
                } else {
                    row.style.display = 'none';
                }
            });

            // Show/hide the "no results" message row
            if (!matchFound && rows.length > 0) {
                noOrderResultsRow.classList.remove('hidden');
                // Ensure correct display for table row
                noOrderResultsRow.style.display = ''; // Let CSS handle it or use 'table-row'
            } else {
                noOrderResultsRow.classList.add('hidden');
                noOrderResultsRow.style.display = 'none';
            }
        });
    }
    // ========================================
    // End Live Order Filtering Logic
    // ========================================


    // ========================================
    // **** NEW: Live Product Filtering Logic (Admin & Seller) ****
    // ========================================
    function setupProductFilter(inputId, tableId, noResultsId) {
        const filterInput = document.getElementById(inputId);
        const productTable = document.getElementById(tableId);
        const noResultsRow = document.getElementById(noResultsId);

        if (filterInput && productTable && noResultsRow) {
            const tableBody = productTable.querySelector('tbody');
            if (!tableBody) return; // Exit if table body not found

            filterInput.addEventListener('input', () => {
                const filterValue = filterInput.value.trim().toLowerCase();
                // Target only rows with the 'product-row' class
                const rows = tableBody.querySelectorAll('tr.product-row');
                let matchFound = false;

                rows.forEach(row => {
                    const rowText = row.textContent.toLowerCase();
                    // Check if filter is empty or row text includes the filter
                    if (filterValue === '' || rowText.includes(filterValue)) {
                        row.style.display = ''; // Show row
                        matchFound = true;
                    } else {
                        row.style.display = 'none'; // Hide row
                    }
                });

                // Toggle the "no results" row visibility
                if (!matchFound && rows.length > 0) {
                    noResultsRow.classList.remove('hidden');
                    noResultsRow.style.display = ''; // Use default display (or 'table-row')
                } else {
                    noResultsRow.classList.add('hidden');
                    noResultsRow.style.display = 'none';
                }
            });
        }
    }

    // Setup filter for Admin Products page
    setupProductFilter('admin-product-filter-input', 'admin-product-table', 'no-admin-products-found');

    // Setup filter for Seller Products page
    setupProductFilter('seller-product-filter-input', 'seller-product-table', 'no-seller-products-found');
    // ========================================
    // **** End Live Product Filtering Logic ****
    // ========================================


    // ========================================
    // **** Product Image Slider Logic (UPDATED with Touch) ****
    // ========================================
    const imageSlider = document.querySelector('[data-product-image-slider]');
    if (imageSlider) {
        const slides = imageSlider.querySelectorAll('[data-product-slide]');
        const prevBtn = imageSlider.querySelector('[data-product-image-nav="prev"]');
        const nextBtn = imageSlider.querySelector('[data-product-image-nav="next"]');
        const dots = imageSlider.querySelectorAll('[data-product-image-dot]');
        let currentImageIndex = 0;

        // --- Touch Swipe Variables (Scoped to this slider) ---
        let isProductDragging = false;
        let productStartX = 0;
        let productCurrentX = 0;
        let productDiffX = 0;
        const productSwipeThreshold = 50; // Minimum pixels to swipe

        function showProductImage(index) {
            if (!slides || slides.length < 2) return; // Only run if multiple slides

            const newIndex = (index % slides.length + slides.length) % slides.length;

            slides.forEach((slide, i) => {
                slide.classList.toggle('active', i === newIndex);
            });
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === newIndex);
            });

            currentImageIndex = newIndex;
        }

        // --- Touch Event Handlers (Scoped to this slider) ---
        function handleProductTouchStart(event) {
            if (slides.length <= 1) return;
            isProductDragging = true;
            productStartX = event.touches[0].pageX;
            productCurrentX = productStartX;
            productDiffX = 0;
        }

        function handleProductTouchMove(event) {
            if (!isProductDragging || slides.length <= 1) return;
            productCurrentX = event.touches[0].pageX;
            productDiffX = productStartX - productCurrentX;
            // Optional: prevent default if swipe is mainly horizontal
            if (Math.abs(productDiffX) > 10) {
                // consider event.preventDefault() if needed
            }
        }

        function handleProductTouchEnd() {
            if (!isProductDragging || slides.length <= 1) return;
            isProductDragging = false;

            if (Math.abs(productDiffX) > productSwipeThreshold) {
                if (productDiffX > 0) { // Swiped Left
                    showProductImage(currentImageIndex + 1);
                } else { // Swiped Right
                    showProductImage(currentImageIndex - 1);
                }
            }
            productStartX = 0;
            productCurrentX = 0;
            productDiffX = 0;
            // No auto-slide to resume for product slider
        }

        // Add event listeners if buttons/dots exist and more than one slide
        if (slides.length > 1) {
            if (nextBtn) {
                nextBtn.addEventListener('click', () => showProductImage(currentImageIndex + 1));
            }
            if (prevBtn) {
                prevBtn.addEventListener('click', () => showProductImage(currentImageIndex - 1));
            }

            dots.forEach(dot => {
                dot.addEventListener('click', () => {
                    const index = parseInt(dot.dataset.productImageDot, 10);
                    if (!isNaN(index)) {
                        showProductImage(index);
                    }
                });
            });

            // Add Touch Listeners only if multiple slides
            imageSlider.addEventListener('touchstart', handleProductTouchStart, { passive: true });
            imageSlider.addEventListener('touchmove', handleProductTouchMove, { passive: false }); // Need false if preventDefault might be used
            imageSlider.addEventListener('touchend', handleProductTouchEnd);
            imageSlider.addEventListener('touchcancel', handleProductTouchEnd);
        } else {
            // Hide nav/dots if only one slide
            if (nextBtn) nextBtn.style.display = 'none';
            if (prevBtn) prevBtn.style.display = 'none';
            const dotsContainer = imageSlider.querySelector('.product-image-dots');
            if (dotsContainer) dotsContainer.style.display = 'none';
        }

        // Initialize the slider to the first image (always happens, even for one slide)
        if (slides.length > 0) {
             showProductImage(0);
        }
    }
    // ========================================
    // **** End Product Image Slider Logic ****
    // ========================================


}); // End DOMContentLoaded


// --- Helper Functions (Outside DOMContentLoaded) ---

// --- Cart Update AJAX Function ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement, quantityInputElement) {
     const originalButtonText = 'Add'; // Changed default text back to 'Add'
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
                     return; // Important: exit after starting removal animation
                 }
             } else {
                 throw new Error(data.message || `Update failed (Status: ${response.status})`);
             }
        }

         if (data.success) {
             if(quantityInputElement) quantityInputElement.dataset.originalValue = data.newQuantity; // Update original value on success

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
                     return; // Important: exit after starting removal animation
                }
             } else {
                 // Update UI for non-zero quantity
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = (data.itemSubtotal !== undefined ? data.itemSubtotal : 0).toFixed(2);
                 if(quantityInputElement) quantityInputElement.value = data.newQuantity;
                 updateCartTotalAndBadge(data.cartTotal);
             }
         } else {
              // Handle failure case from server (e.g., validation error on server side)
              showToast(`Update failed: ${data.message || 'Unknown error'}`, 'danger');
              if(quantityInputElement && quantityInputElement.dataset.originalValue) {
                  quantityInputElement.value = quantityInputElement.dataset.originalValue; // Revert to original value
              }
         }

    } catch (error) {
         // Handle network errors or unexpected issues
         console.error('Error updating cart quantity:', error);
          showToast(`Error: ${error.message}`, 'danger');
          if(quantityInputElement && quantityInputElement.dataset.originalValue) {
            quantityInputElement.value = quantityInputElement.dataset.originalValue; // Revert on error
          }

    } finally {
         // Ensure button and input are re-enabled unless the item is being removed
         if (cartItemDiv && (!cartItemDiv.style.opacity || parseFloat(cartItemDiv.style.opacity) !== 0)) {
             buttonElement.disabled = false;
             buttonElement.innerHTML = originalButtonText; // Restore button text
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

    // Basic sanitization
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
                try { toastElement.remove(); } catch(e) { console.warn("Error removing toast:", e); }
            }
        }, { once: true });
    };

    // Trigger the show animation
    setTimeout(() => {
        if (toastElement.parentNode) {
           toastElement.classList.add('show');
        }
    }, 10); // Small delay ensures transition happens

    // Auto hide
    hideTimeoutId = setTimeout(dismissToast, autoHideDelay);
    // Manual close
    if (closeButton) { closeButton.addEventListener('click', dismissToast); }
    // Pause on hover
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

// Calculates based on visible items in the DOM
function calculateNewCartCount() {
    const cartItems = document.querySelectorAll('.cart-item');
    let count = 0;
    cartItems.forEach(item => {
        // Check if item is potentially visible (not explicitly display:none or fully transparent)
        const style = window.getComputedStyle(item);
        if (style.display !== 'none' && (!item.style.opacity || parseFloat(item.style.opacity) > 0)) {
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
         // Use the same visibility check as calculateNewCartCount
         const visibleItems = Array.from(cartItemsContainer.querySelectorAll('.cart-item')).filter(item => {
             const style = window.getComputedStyle(item);
             return style.display !== 'none' && (!item.style.opacity || parseFloat(item.style.opacity) > 0);
         });

         if (visibleItems.length === 0) {
             // Only update if the empty message isn't already there
             if (!cartContainer.querySelector('.alert-info')) {
                 // Clear existing items and summary before adding the message
                 cartItemsContainer.innerHTML = '';
                 if(cartSummary) cartSummary.remove();

                 const emptyCartHTML = `
                    <h1>Your Shopping Cart</h1>
                    <p class="alert alert-info mt-3">
                        Your cart is empty. <a href="/" class="alert-link">Continue Shopping</a>
                    </p>`;
                  // Insert the message after the h1
                  const h1 = cartContainer.querySelector('h1');
                  if (h1) {
                      h1.insertAdjacentHTML('afterend', emptyCartHTML.substring(emptyCartHTML.indexOf('<p')));
                  } else {
                      // Fallback if h1 not found (shouldn't happen usually)
                      cartContainer.innerHTML = emptyCartHTML;
                  }
             }
         }
     }
}