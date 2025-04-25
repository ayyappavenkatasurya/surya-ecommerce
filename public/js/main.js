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

    // --- Profile Address Toggle Logic ---
    const profilePage = document.querySelector('.profile-container'); // Check if we are on profile page
    if (profilePage) {
        const profileEditBtn = profilePage.querySelector('#edit-address-btn');
        const profileAddBtn = profilePage.querySelector('#add-address-btn');
        const profileCancelBtn = profilePage.querySelector('#cancel-edit-btn');
        const profileAddressForm = profilePage.querySelector('#address-form');
        const profileSavedAddressDiv = profilePage.querySelector('#saved-address-display');

        const showProfileForm = () => {
            if (!profileAddressForm || !profileSavedAddressDiv) return; // Safety check
            profileAddressForm.classList.remove('hidden');
            // Check if saved address has actual content besides the button
            const hasSavedContent = profileSavedAddressDiv.querySelector('p strong');
            profileAddressForm.querySelector('h3').textContent = hasSavedContent ? 'Edit Address' : 'Add Address';
            profileSavedAddressDiv.classList.add('hidden');
            if (profileCancelBtn && hasSavedContent) {
                profileCancelBtn.classList.remove('hidden'); // Show cancel only when editing existing
            } else if (profileCancelBtn) {
                profileCancelBtn.classList.add('hidden'); // Hide cancel when adding new
            }
            if (profileAddBtn) profileAddBtn.classList.add('hidden'); // Hide Add button when form is shown
        };

        const hideProfileForm = () => {
            if (!profileAddressForm || !profileSavedAddressDiv) return; // Safety check
            profileAddressForm.classList.add('hidden');
            profileSavedAddressDiv.classList.remove('hidden'); // Always show the container (it shows "No address" or the address)
            if (profileCancelBtn) profileCancelBtn.classList.add('hidden');
            // Show Add button only if no address content exists
            if (!profileSavedAddressDiv.querySelector('p strong') && profileAddBtn) {
                 profileAddBtn.classList.remove('hidden');
            } else if(profileAddBtn) {
                 profileAddBtn.classList.add('hidden'); // Ensure add button is hidden if address exists
            }
        };

        if (profileEditBtn) {
            profileEditBtn.addEventListener('click', showProfileForm);
        }
        if (profileAddBtn) {
             profileAddBtn.addEventListener('click', () => {
                 if(profileAddressForm) profileAddressForm.reset(); // Clear form fields when adding new
                showProfileForm();
             });
        }
        if (profileCancelBtn) {
            profileCancelBtn.addEventListener('click', hideProfileForm);
        }

        // Initial state check
        if (profileAddressForm && profileSavedAddressDiv && profileAddBtn) {
            if (!profileSavedAddressDiv.querySelector('p strong') && profileAddressForm.classList.contains('hidden')) {
                profileAddBtn.classList.remove('hidden'); // Show add button if no address
            } else {
                profileAddBtn.classList.add('hidden'); // Hide add button if address exists or form is shown
            }
        }

        // Name Edit Logic (Profile Page Only)
        const editNameBtn = document.getElementById('edit-name-btn');
        const cancelNameBtn = document.getElementById('cancel-edit-name-btn');
        const nameForm = document.getElementById('name-form');
        const savedNameDisplaySpan = document.getElementById('saved-name-display'); // The span containing the welcome text
        const nameInput = document.getElementById('name-input'); // The input field
        const displayUserNameStrong = document.getElementById('display-user-name'); // The strong tag holding the name

        const showNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn) return;
            nameForm.classList.remove('hidden');        // Show the form
            savedNameDisplaySpan.classList.add('hidden'); // Hide the "Welcome, Name" span
            editNameBtn.classList.add('hidden');        // Hide the edit icon button
            nameInput.focus();                          // Focus the input field
        };

        const hideNameForm = () => {
            if (!nameForm || !savedNameDisplaySpan || !editNameBtn || !displayUserNameStrong) return;
            nameForm.classList.add('hidden');            // Hide the form
            savedNameDisplaySpan.classList.remove('hidden'); // Show the "Welcome, Name" span
            editNameBtn.classList.remove('hidden');      // Show the edit icon button again
            // Reset input value to the currently displayed name when cancelling
            if(displayUserNameStrong) nameInput.value = displayUserNameStrong.textContent;
        };

        if (editNameBtn) {
            editNameBtn.addEventListener('click', showNameForm);
        }

        if (cancelNameBtn) {
            cancelNameBtn.addEventListener('click', hideNameForm);
        }
    }

    // --- Checkout Address Toggle Logic ---
    const checkoutPage = document.querySelector('.checkout-container'); // Check if on checkout page
    if (checkoutPage) {
        const checkoutEditBtn = checkoutPage.querySelector('.checkout-address #edit-address-btn');
        const checkoutCancelBtn = checkoutPage.querySelector('.checkout-address #cancel-edit-btn');
        const checkoutAddressForm = checkoutPage.querySelector('.checkout-address #address-form');
        const checkoutSavedAddressDiv = checkoutPage.querySelector('.checkout-address .saved-address');
        const placeOrderBtn = checkoutPage.querySelector('.btn-place-order');

        // Check if an address is initially displayed (not hidden)
        const hasInitialAddress = checkoutSavedAddressDiv && !checkoutSavedAddressDiv.classList.contains('hidden');

        if (checkoutEditBtn) {
            checkoutEditBtn.addEventListener('click', () => {
                if (!checkoutAddressForm || !checkoutSavedAddressDiv) return;
                checkoutAddressForm.classList.remove('hidden');
                checkoutSavedAddressDiv.classList.add('hidden');
                if(placeOrderBtn) placeOrderBtn.disabled = true; // Disable place order when editing
                checkoutAddressForm.querySelector('h3').textContent = 'Edit Address';
                if (checkoutCancelBtn) checkoutCancelBtn.classList.remove('hidden'); // Show cancel button
            });
        }

        if (checkoutCancelBtn) {
            checkoutCancelBtn.addEventListener('click', () => {
                if (!checkoutAddressForm || !checkoutSavedAddressDiv) return;
                checkoutAddressForm.classList.add('hidden');
                if (hasInitialAddress) { // Only show saved div if it existed initially
                    checkoutSavedAddressDiv.classList.remove('hidden');
                    if(placeOrderBtn) placeOrderBtn.disabled = false; // Re-enable place order
                } else {
                    // If there was no initial address, cancelling means keep form hidden and button disabled
                    if(placeOrderBtn) placeOrderBtn.disabled = true;
                }
                checkoutCancelBtn.classList.add('hidden'); // Hide cancel button again
            });
        }

        // Initial state for checkout page
        if (!hasInitialAddress && checkoutAddressForm) {
            checkoutAddressForm.classList.remove('hidden'); // Show form if no address saved
            if (placeOrderBtn) placeOrderBtn.disabled = true; // Disable place order
            checkoutAddressForm.querySelector('h3').textContent = 'Add Shipping Address'; // Clearer label
            if (checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden'); // Hide cancel btn if adding new
        } else if (hasInitialAddress && checkoutAddressForm) {
            checkoutAddressForm.classList.add('hidden'); // Ensure form is hidden initially
            if (placeOrderBtn) placeOrderBtn.disabled = false; // Enable if address exists
            if (checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden'); // Ensure cancel is hidden initially
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

            // Store original value in case of error
            if (!quantityInput.dataset.originalValue) {
                quantityInput.dataset.originalValue = quantityInput.value;
            }


            if (isNaN(newQuantity) || newQuantity < 0) {
                 showToast('Invalid quantity entered.', 'danger');
                 quantityInput.value = quantityInput.dataset.originalValue; // Restore original
                return;
             }
            const maxStock = parseInt(quantityInput.max, 10);
            if (!isNaN(maxStock) && newQuantity > maxStock) {
                showToast(`Only ${maxStock} items available in stock.`, 'warning');
                quantityInput.value = maxStock; // Correct to max stock, don't restore original
                 return; // Don't proceed with AJAX call yet, let user confirm or re-update
             }
            updateCartItemQuantityAJAX(productId, newQuantity, button, quantityInput); // Pass input element
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

    // --- Toggle Search Bar (Mobile) ---
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

    // --- Handle Search Input ---
    if (searchInput && suggestionsDropdown) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();
            clearTimeout(suggestionFetchTimeout);

            if (query.length >= 2) {
                suggestionsDropdown.innerHTML = '<div class="suggestion-item"><i>Loading...</i></div>';
                suggestionsDropdown.classList.add('active');
                suggestionFetchTimeout = setTimeout(() => {
                    fetchSuggestions(query);
                }, 300); // Debounce
            } else {
                suggestionsDropdown.innerHTML = '';
                suggestionsDropdown.classList.remove('active');
            }
        });

        // Keep suggestions open on focus if suggestions exist
        searchInput.addEventListener('focus', () => {
             const query = searchInput.value.trim();
              const hasActualSuggestions = suggestionsDropdown.querySelector('a.suggestion-item');
              if (query.length >= 2 && hasActualSuggestions) {
                 suggestionsDropdown.classList.add('active');
             }
        });
    }

     // --- Fetch Suggestions ---
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

     // --- Display Suggestions ---
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

     // --- Close Search/Suggestions on Outside Click ---
     document.addEventListener('click', (e) => {
         // Ensure all elements exist before checking contains
         if (searchContainer && suggestionsDropdown && searchToggleBtn && !searchContainer.contains(e.target) && !searchToggleBtn.contains(e.target)) {
             searchContainer.classList.remove('active');
             suggestionsDropdown.classList.remove('active');
         }
     });

     // --- Handle Clicks Inside Suggestions ---
     if(suggestionsDropdown) {
         suggestionsDropdown.addEventListener('click', (e) => {
             const link = e.target.closest('a');
             if (!link) {
                 e.stopPropagation(); // Don't close if click is not on a link itself
             } else {
                 // Hide dropdown after clicking a link
                 suggestionsDropdown.classList.remove('active');
                 if (searchContainer && window.innerWidth < 768) { // Also hide mobile search bar
                    searchContainer.classList.remove('active');
                 }
             }
         });
     }
    // ========================================
    // End Dynamic Search Bar Logic
    // ========================================


    // ========================================
    // Toast Notification Logic (FASTER APPEARANCE)
    // ========================================
    const toastContainer = document.querySelector('.toast-container');
    if (toastContainer) {
        const toastElements = toastContainer.querySelectorAll('.toast');

        toastElements.forEach((toastElement) => { // No index needed now
            const closeButton = toastElement.querySelector('.toast-close-btn');
            const autoHideDelay = 5000; // 5 seconds
            let hideTimeoutId;

            const dismissToast = () => {
                clearTimeout(hideTimeoutId);
                if (toastElement.classList.contains('hide') || !toastElement.parentNode) return; // Already hiding or removed
                toastElement.classList.remove('show');
                toastElement.classList.add('hide');
                toastElement.addEventListener('transitionend', (event) => {
                    // Check propertyName to ensure it's the opacity/transform transition
                    if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && toastElement.classList.contains('hide') && toastElement.parentNode) {
                        toastElement.remove();
                    }
                }, { once: true });
            };

            // --- Show Animation (IMMEDIATE TRIGGER using setTimeout 0) ---
            setTimeout(() => {
                // Check if element is still in DOM before showing
                if (toastElement.parentNode) {
                   toastElement.classList.add('show');
                }
            }, 0); // Minimal delay to allow rendering initial state

            // --- Auto Hide Timer ---
             hideTimeoutId = setTimeout(dismissToast, autoHideDelay);

            // --- Manual Close Button ---
            if (closeButton) {
                closeButton.addEventListener('click', dismissToast);
            }

             // --- Prevent auto-hide on hover ---
             toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
             toastElement.addEventListener('mouseleave', () => hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2)); // Restart timer on mouse out

        });
    }
    // ========================================
    // End Toast Notification Logic
    // ========================================

    // --- Rating Stats Bar Animation ---
    document.querySelectorAll('.rating-bar-fill').forEach(function(el) {
        var width = el.getAttribute('data-width');
        if (width) {
            // Allow the browser a moment to render before starting animation
            requestAnimationFrame(() => {
                 if(el.parentNode) { // Check if element still exists
                    el.style.width = width + '%';
                 }
            });
        }
    });

    // ========================================
    // Loading State for Non-Form Actions (e.g., Proceed to Checkout Link)
    // ========================================
    const proceedCheckoutBtn = document.getElementById('btn-proceed-checkout');
    if (proceedCheckoutBtn) {
        const originalCheckoutText = proceedCheckoutBtn.innerHTML;
        // Retrieve loading text safely, provide default
        const loadingCheckoutText = proceedCheckoutBtn.dataset.loadingText || '<i class="fas fa-spinner fa-spin"></i> Loading...';

        proceedCheckoutBtn.addEventListener('click', function(event) {
            // Check if already loading
            if (proceedCheckoutBtn.classList.contains('loading')) {
                return;
            }

            // Apply loading state
            proceedCheckoutBtn.classList.add('loading');
            proceedCheckoutBtn.innerHTML = loadingCheckoutText;
            proceedCheckoutBtn.style.pointerEvents = 'none'; // Visually disable link
            proceedCheckoutBtn.setAttribute('aria-disabled', 'true'); // Accessibility

            // Allow navigation to proceed naturally
        });

        // Reset button on page show (e.g., back navigation)
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
    // Homepage Banner Slider Logic            <--- NEW SECTION
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
        const slideIntervalTime = 5000; // Time in ms (e.g., 5 seconds)

        function showSlide(index) {
            if (!slides || slides.length === 0) return; // Exit if no slides

            // Wrap index around if it goes out of bounds
            const newIndex = (index + slides.length) % slides.length;

            slides.forEach((slide, i) => {
                slide.classList.remove('active');
            });
            dots.forEach(dot => {
                dot.classList.remove('active');
            });

            slides[newIndex].classList.add('active');
            if (dots[newIndex]) {
                dots[newIndex].classList.add('active');
            }
            currentSlideIndex = newIndex;
        }

        function nextSlide() {
            showSlide(currentSlideIndex + 1);
        }

        function prevSlide() {
            showSlide(currentSlideIndex - 1);
        }

        function startAutoSlide() {
            // Clear any existing interval before starting a new one
            clearInterval(autoSlideInterval);
            if (slides.length > 1) { // Only auto-slide if more than one banner
                autoSlideInterval = setInterval(nextSlide, slideIntervalTime);
            }
        }

        // Initial setup
        if (slides.length > 0) {
             showSlide(0); // Show the first slide initially
             startAutoSlide(); // Start automatic sliding
        }

        // Event Listeners for Arrows
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                nextSlide();
                startAutoSlide(); // Reset interval on manual click
            });
        }
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                prevSlide();
                startAutoSlide(); // Reset interval on manual click
            });
        }

        // Event Listener for Dots
        if (dotsContainer) {
            dotsContainer.addEventListener('click', (e) => {
                const targetDot = e.target.closest('[data-slide-to]');
                if (targetDot) {
                    const index = parseInt(targetDot.dataset.slideTo, 10);
                    if (!isNaN(index)) {
                        showSlide(index);
                        startAutoSlide(); // Reset interval on manual click
                    }
                }
            });
        }

        // Pause on Hover
        sliderContainer.addEventListener('mouseenter', () => {
            clearInterval(autoSlideInterval);
        });

        sliderContainer.addEventListener('mouseleave', () => {
            startAutoSlide();
        });

    } // End if (sliderContainer)
    // ========================================
    // End Homepage Banner Slider Logic
    // ========================================


}); // End DOMContentLoaded


// --- Cart Update AJAX Function ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement, quantityInputElement) { // Pass input el
     const originalButtonText = 'Add';
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

        const data = await response.json(); // Always parse response

        if (!response.ok) {
            throw new Error(data.message || `Update failed (Status: ${response.status})`);
        }

         // --- Show toast AFTER response is received ---
         if (data.success) {
             // Update original value dataset if successful
             if(quantityInputElement) quantityInputElement.dataset.originalValue = data.newQuantity;

             if (quantity === 0) {
                 // Handle removal animation and DOM update
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
                        showToast('Item removed from cart.', 'success'); // Show toast after removing
                    }, 300); // Wait for CSS transition
                     return; // Exit early
                }
             } else {
                 // Update quantity input and subtotal
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = (data.itemSubtotal !== undefined ? data.itemSubtotal : 0).toFixed(2);
                if(quantityInputElement) quantityInputElement.value = data.newQuantity;
                 // Update total and badge
                 updateCartTotalAndBadge(data.cartTotal);
                 // showToast('Cart quantity updated.', 'success'); // Optional success message
             }
         } else {
              // Show failure toast using backend message
              showToast(`Update failed: ${data.message || 'Unknown error'}`, 'danger');
              // Restore original value on backend failure
              if(quantityInputElement && quantityInputElement.dataset.originalValue) {
                  quantityInputElement.value = quantityInputElement.dataset.originalValue;
              }
         }

    } catch (error) {
         console.error('Error updating cart quantity:', error);
          // Show error toast
          showToast(`Error: ${error.message}`, 'danger');
          // Restore original value on fetch error
          if(quantityInputElement && quantityInputElement.dataset.originalValue) {
            quantityInputElement.value = quantityInputElement.dataset.originalValue;
          }

    } finally {
         // Re-enable button and input (unless item was removed)
         // Ensure this runs only if the item wasn't removed
         if (cartItemDiv && (!cartItemDiv.style.opacity || parseFloat(cartItemDiv.style.opacity) !== 0)) {
             buttonElement.disabled = false;
             buttonElement.innerHTML = originalButtonText;
             if(quantityInputElement) quantityInputElement.readOnly = false;
         }
     }
}

// --- Helper Function to Show Toasts Dynamically (FASTER APPEARANCE) ---
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        console.error("Toast container not found! Falling back to alert.");
        alert(message); // Fallback
        return;
    }

    // Create elements
    const toastElement = document.createElement('div');
    toastElement.className = `toast toast-${type}`; // Apply classes
    toastElement.setAttribute('role', 'alert');
    toastElement.setAttribute('aria-live', 'assertive');
    toastElement.setAttribute('aria-atomic', 'true');

    // Basic sanitization - Replace with a more robust library (like DOMPurify) if needed for complex user-generated content
    const sanitizedMessage = typeof message === 'string'
        ? message.replace(/</g, "<").replace(/>/g, ">")
        : 'An unexpected error occurred.'; // Default message for non-strings

    // Set inner HTML safely
    toastElement.innerHTML = `
        <div class="toast-body">
            ${sanitizedMessage}
            <button type="button" class="toast-close-btn" aria-label="Close">×</button>
        </div>
    `;

    const closeButton = toastElement.querySelector('.toast-close-btn');
    toastContainer.appendChild(toastElement);

    // --- Logic to show and hide the new toast ---
    const autoHideDelay = 5000;
    let hideTimeoutId;

    const dismissToast = () => {
        clearTimeout(hideTimeoutId);
        // Check if already hiding or removed to prevent errors/multiple executions
        if (toastElement.classList.contains('hide') || !toastElement.parentNode) return;
        toastElement.classList.remove('show');
        toastElement.classList.add('hide');
        toastElement.addEventListener('transitionend', (event) => {
            // Ensure transition is for opacity/transform and element still exists with 'hide' class
            if ((event.propertyName === 'opacity' || event.propertyName === 'transform') && toastElement.classList.contains('hide') && toastElement.parentNode) {
                toastElement.remove();
            }
        }, { once: true }); // Use 'once' to ensure listener is removed after firing
    };

    // Show animation (using setTimeout 0 for immediate trigger)
    setTimeout(() => {
        // Check if element is still in DOM before adding 'show'
        if (toastElement.parentNode) {
           toastElement.classList.add('show');
        }
    }, 0); // Minimal delay

    // Auto Hide Timer
    hideTimeoutId = setTimeout(dismissToast, autoHideDelay);

    // Manual Close Button
    if (closeButton) { // Check if button exists
        closeButton.addEventListener('click', dismissToast);
    }

    // Prevent auto-hide on hover
    toastElement.addEventListener('mouseenter', () => clearTimeout(hideTimeoutId));
    toastElement.addEventListener('mouseleave', () => hideTimeoutId = setTimeout(dismissToast, autoHideDelay / 2)); // Restart timer on mouse out
}


// --- Helper Functions for Cart Badge and Empty Display ---
function updateCartTotalAndBadge(newCartTotal) {
     const cartTotalSpan = document.getElementById('cart-total-value');
     if (cartTotalSpan) cartTotalSpan.textContent = (newCartTotal !== undefined ? newCartTotal : 0).toFixed(2);

     const newCartItemCount = calculateNewCartCount();
     const cartBadge = document.querySelector('.cart-badge');
     if (cartBadge) {
         if (newCartItemCount > 0) {
             cartBadge.textContent = newCartItemCount;
             cartBadge.classList.remove('hide');
         } else {
            cartBadge.textContent = '0';
            cartBadge.classList.add('hide');
         }
     }
}

function calculateNewCartCount() {
    // Count only items currently visible and not marked for removal
    const cartItems = document.querySelectorAll('.cart-item');
    let count = 0;
    cartItems.forEach(item => {
        // Check opacity style directly for cross-browser compatibility during transition
        const style = window.getComputedStyle(item);
        if (style.display !== 'none' && parseFloat(style.opacity) > 0) {
            const quantityInput = item.querySelector('input[name="quantity"]');
            if (quantityInput) {
                const value = parseInt(quantityInput.value, 10);
                if (!isNaN(value) && value > 0) {
                    // Update count based on the QUANTITY of each item
                    count += value; // THIS IS THE KEY CHANGE - SUM QUANTITIES, NOT ITEMS
                }
            }
        }
    });
    return count;
}

function handleEmptyCartDisplay() {
    const cartItemsContainer = document.querySelector('.cart-items');
     const cartContainer = document.querySelector('.cart-container');
     const cartSummary = document.querySelector('.cart-summary');

     // Check if the items container exists and has no *cart-item* children left
     // or only children that are hidden/fading out
     if (cartItemsContainer && cartContainer) {
         const visibleItems = Array.from(cartItemsContainer.querySelectorAll('.cart-item')).filter(item => {
             const style = window.getComputedStyle(item);
             return style.display !== 'none' && parseFloat(style.opacity) > 0;
         });

         if (visibleItems.length === 0) {
             // Use innerHTML carefully, ensure no user input is directly included here
             cartContainer.innerHTML = `
                <h1>Your Shopping Cart</h1>
                <p class="alert alert-info mt-3">
                    Your cart is empty. <a href="/" class="alert-link">Continue Shopping</a>
                </p>`;
             if(cartSummary) cartSummary.remove();
         }
     }
}