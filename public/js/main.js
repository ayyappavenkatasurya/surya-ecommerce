// public/js/main.js
console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {

    // --- Cart Update AJAX Logic (Enhanced Spinner) ---
    const updateQtyButtons = document.querySelectorAll('.btn-update-qty');
    updateQtyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = button.dataset.productId;
            const quantityInput = document.getElementById(`quantity-${productId}`);
            const newQuantity = parseInt(quantityInput.value, 10);

            if (isNaN(newQuantity) || newQuantity < 0) {
                 alert('Invalid quantity');
                // Revert input if possible? Or just return.
                // quantityInput.value = button.dataset.previousValue || 1; // Needs previous value storage
                return;
             }
            const maxStock = parseInt(quantityInput.max, 10);
            if(newQuantity > maxStock){
                alert(`Only ${maxStock} items available in stock.`);
                quantityInput.value = maxStock; // Correct input to max stock
                 return;
             }

            updateCartItemQuantityAJAX(productId, newQuantity, button);
        });
        // Store initial value for potential revert on error (optional)
        // const quantityInput = document.getElementById(`quantity-${button.dataset.productId}`);
        // if(quantityInput) button.dataset.previousValue = quantityInput.value;
    });


    // --- Generic Form Submission Spinner ---
    document.querySelectorAll('form.form-submit-spinner').forEach(form => {
        form.addEventListener('submit', (event) => {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton && !submitButton.disabled) {
                // Basic client-side validation check before showing spinner
                if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
                    // Let browser handle HTML5 validation messages, don't show spinner
                    // Need to explicitly trigger the browser's validation UI if needed
                    form.reportValidity();
                    return;
                }

                const originalText = submitButton.innerHTML;
                // Store original text in case we need to revert *without* page load (e.g., advanced client-side errors)
                submitButton.dataset.originalText = originalText;
                submitButton.disabled = true;
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

                // Spinner will generally be reset by page reload/redirect.
                // No explicit reset here simplifies things for standard forms.
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
                    // Ensure header exists for the index and cell doesn't already have the attribute
                    if (headers[index] !== undefined && !cell.hasAttribute('data-label')) {
                         cell.setAttribute('data-label', headers[index]);
                    }
                });
            });
        });
    }
     // Run on load and potentially on resize if needed
     if (document.querySelector('.data-table')) {
         responsiveTables();
         // Consider adding resize listener if layout changes dynamically often
         // window.addEventListener('resize', responsiveTables);
     }


    // --- Share Button Logic ---
    const shareButton = document.getElementById('share-product-btn');
    const fallbackLinks = document.getElementById('fallback-share-links');

    if (shareButton && fallbackLinks) {
        shareButton.addEventListener('click', async () => {
            const title = shareButton.dataset.title;
            const text = shareButton.dataset.text;
            const url = shareButton.dataset.url;

            if (navigator.share) {
                try {
                    await navigator.share({ title, text, url });
                    console.log('Product shared successfully!');
                } catch (error) {
                    console.error('Error sharing:', error);
                    if (error.name !== 'AbortError') {
                         fallbackLinks.classList.remove('hidden');
                    }
                }
            } else {
                console.log('Web Share API not supported, showing fallback links.');
                fallbackLinks.classList.remove('hidden');
            }
        });
    }

    // --- Checkout Address Form Toggle (Keep Existing for Checkout Page) ---
    const checkoutEditBtn = document.querySelector('.checkout-container #edit-address-btn');
    const checkoutCancelBtn = document.querySelector('.checkout-container #cancel-edit-btn');
    const checkoutAddressForm = document.querySelector('.checkout-container #address-form');
    const checkoutSavedAddressDiv = document.querySelector('.checkout-container .saved-address');
    const checkoutPlaceOrderBtn = document.querySelector('.checkout-container .btn-place-order');
    const checkoutHasInitialAddress = checkoutSavedAddressDiv && !checkoutSavedAddressDiv.classList.contains('hidden');

    if (checkoutEditBtn && checkoutAddressForm && checkoutSavedAddressDiv && checkoutPlaceOrderBtn) {
        checkoutEditBtn.addEventListener('click', () => {
            checkoutAddressForm.classList.remove('hidden');
            checkoutSavedAddressDiv.classList.add('hidden');
            checkoutPlaceOrderBtn.disabled = true;
            const formTitle = checkoutAddressForm.querySelector('h3');
            if(formTitle) formTitle.textContent = 'Edit Address';
        });
    }
     if (checkoutCancelBtn && checkoutAddressForm && checkoutSavedAddressDiv && checkoutPlaceOrderBtn) {
        checkoutCancelBtn.addEventListener('click', () => {
            checkoutAddressForm.classList.add('hidden');
            if (checkoutHasInitialAddress) {
                 checkoutSavedAddressDiv.classList.remove('hidden');
                 checkoutPlaceOrderBtn.disabled = false;
            } else {
                 // If no initial address, cancelling edit means button should remain disabled
                 checkoutPlaceOrderBtn.disabled = true;
            }
        });
    }
    // Initial state check for checkout: If no initial address, show form, ensure button is disabled
    if (!checkoutHasInitialAddress && checkoutAddressForm && checkoutPlaceOrderBtn) {
         checkoutAddressForm.classList.remove('hidden');
         checkoutPlaceOrderBtn.disabled = true;
         const formTitle = checkoutAddressForm.querySelector('h3');
         if (formTitle) formTitle.textContent = 'Add Address';
         // Hide cancel button if adding new on checkout
         if(checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden');
     } else if (checkoutHasInitialAddress && checkoutPlaceOrderBtn) {
         // Ensure form hidden and button enabled if address exists initially
         if(checkoutAddressForm) checkoutAddressForm.classList.add('hidden');
         checkoutPlaceOrderBtn.disabled = false;
         // Ensure cancel button is visible for editing on checkout
         if(checkoutCancelBtn) checkoutCancelBtn.classList.remove('hidden');
     }


    // --- NEW: Profile Page Address Form Toggle ---
    const profileEditBtn = document.querySelector('.profile-container #edit-address-btn');
    const profileCancelBtn = document.querySelector('.profile-container #cancel-edit-btn');
    const profileAddressForm = document.querySelector('.profile-container #address-form');
    const profileSavedAddressDiv = document.querySelector('.profile-container #saved-address-display');
    // Check if address display div is VISIBLE on load
    const profileHasInitialAddress = profileSavedAddressDiv && !profileSavedAddressDiv.classList.contains('hidden');

    if (profileEditBtn && profileAddressForm && profileSavedAddressDiv) {
        profileEditBtn.addEventListener('click', () => {
            profileAddressForm.classList.remove('hidden');
            profileSavedAddressDiv.classList.add('hidden');
            const formTitle = profileAddressForm.querySelector('h3');
            if(formTitle) formTitle.textContent = 'Edit Address';
            // Ensure cancel button is visible when editing
            if(profileCancelBtn) profileCancelBtn.classList.remove('hidden');
        });
    }

    if (profileCancelBtn && profileAddressForm && profileSavedAddressDiv) {
        profileCancelBtn.addEventListener('click', () => {
            profileAddressForm.classList.add('hidden');
            // Only show the saved address div if it actually existed initially
            if (profileHasInitialAddress) {
                profileSavedAddressDiv.classList.remove('hidden');
            }
            // If there was no initial address, clicking cancel just hides the form
        });
    }

     // Initial state for profile page: If no address displayed, ensure form is shown
     if (!profileHasInitialAddress && profileAddressForm) {
         profileAddressForm.classList.remove('hidden');
          const formTitle = profileAddressForm.querySelector('h3');
         if (formTitle) formTitle.textContent = 'Add Address';
          // Hide cancel button if we are adding address for the first time
          if(profileCancelBtn) profileCancelBtn.classList.add('hidden');
     } else if (profileHasInitialAddress && profileAddressForm){
          // Ensure form is hidden if address exists initially
          profileAddressForm.classList.add('hidden');
          // Ensure cancel button is visible if editing existing address (and it exists)
          if(profileCancelBtn) profileCancelBtn.classList.remove('hidden');
     }
     // --- END NEW PROFILE ADDRESS TOGGLE ---


}); // End DOMContentLoaded


// --- Cart AJAX Update Function (Revised Spinner/Button Handling) ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
     const originalButtonText = 'Update'; // Define original text
     const loadingButtonText = '<i class="fas fa-spinner fa-spin"></i>'; // Just spinner for small btn
     const quantityInput = document.getElementById(`quantity-${productId}`); // Get input

     // Store previous value *before* making the request
     const previousValue = quantityInput ? quantityInput.value : null;

     buttonElement.disabled = true;
     buttonElement.innerHTML = loadingButtonText;
     if(quantityInput) quantityInput.readOnly = true; // Make input readonly during update


    try {
        const response = await fetch('/user/cart/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Include CSRF token header if you implement CSRF protection
                // 'CSRF-Token': csrfToken // Example
            },
            body: JSON.stringify({ productId, quantity })
         });

        const data = await response.json(); // Try to parse JSON regardless of status

        if (!response.ok) {
            // --- Attempt to revert visual quantity on server error ---
             if (quantityInput && previousValue !== null) {
                quantityInput.value = previousValue;
             }
            // --------------------------------------------------------
            throw new Error(data.message || `Update failed (Status: ${response.status})`);
        }

         // --- SUCCESS CASE (response.ok is true) ---
         if (data.success) {
            const cartItemDiv = document.querySelector(`.cart-item[data-product-id="${productId}"]`);

             if (quantity === 0) { // Handle item removal
                if (cartItemDiv) {
                    cartItemDiv.style.transition = 'opacity 0.3s ease';
                    cartItemDiv.style.opacity = '0';
                    setTimeout(() => {
                        cartItemDiv.remove();
                         // Recalculate count and update UI after removing item
                        updateCartTotalAndBadge(data.cartTotal); // Pass the total from response
                        handleEmptyCartDisplay(); // Check if cart became empty
                    }, 300);
                     // No need to re-enable button/input as the row is removed
                     return; // Exit early as item is being removed
                }
             } else { // Handle quantity update (quantity > 0)
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = data.itemSubtotal.toFixed(2);
                if(quantityInput) {
                     quantityInput.value = data.newQuantity; // Update input with confirmed quantity
                 }
             }
             // Update total and badge for successful updates (non-zero quantity)
             updateCartTotalAndBadge(data.cartTotal);

         } else {
             // Server responded with success: false (but response.ok was true - less common)
             alert(`Update failed: ${data.message}`);
              // Revert visual quantity on server-reported failure
             if (quantityInput && previousValue !== null) {
                quantityInput.value = previousValue;
             }
         }

    } catch (error) {
         // Network error or other exception during fetch/processing
         console.error('Error updating cart quantity:', error);
         alert(`Error: ${error.message}`);
          // Revert visual quantity on exception
         if (quantityInput && previousValue !== null) {
            quantityInput.value = previousValue;
         }
    } finally {
         // Always re-enable button and input, restore original text
         // This runs even if the item was removed, but the elements might be gone
         if (buttonElement) {
             buttonElement.disabled = false;
             buttonElement.innerHTML = originalButtonText;
         }
         if(quantityInput) {
             quantityInput.readOnly = false;
         }
     }
}

// --- Helper Function: Update Cart Total Display and Header Badge ---
function updateCartTotalAndBadge(newCartTotal) {
    // Update Cart Total Display
     const cartTotalSpan = document.getElementById('cart-total-value');
     if (cartTotalSpan) cartTotalSpan.textContent = newCartTotal.toFixed(2);

    // Update Header Cart Count (Recalculate based on current DOM input values)
     const newCartItemCount = calculateNewCartCount();
     const cartBadge = document.querySelector('.cart-badge');
     if (cartBadge) {
         if (newCartItemCount > 0) {
             cartBadge.textContent = newCartItemCount;
             cartBadge.style.display = 'inline-block'; // Show badge
         } else {
            cartBadge.textContent = '0';
            cartBadge.style.display = 'none'; // Hide badge
         }
     } else {
         console.warn("Cart badge element not found in header.");
     }
}


// --- Helper function: Calculate cart count from input fields ---
function calculateNewCartCount() {
    // Select only quantity inputs *currently present* in the cart items container
    const quantityInputs = document.querySelectorAll('.cart-items .cart-item .quantity-input');
    let count = 0;
    quantityInputs.forEach(input => {
        const value = parseInt(input.value, 10);
        // Only count items with quantity >= 1
        if (!isNaN(value) && value > 0) {
          // Accumulate actual quantity (how many items total), not just number of rows
          count += value;
        }
    });
    return count;
}

// --- Helper function: Check and display empty cart message ---
function handleEmptyCartDisplay() {
    const cartItemsContainer = document.querySelector('.cart-items');
     const cartContainer = document.querySelector('.cart-container'); // Get the parent
     // Check count AFTER potential removal animation finishes
     // Also check if cartItemsContainer still exists (it might be removed if cart becomes empty)
     if (calculateNewCartCount() === 0 && cartContainer) {
         // Replace entire cart content if empty
         cartContainer.innerHTML = '<h1>Your Shopping Cart</h1><p>Your cart is empty. <a href="/">Continue Shopping</a></p>';
         // No need to hide summary as it's removed
     }
}

// --- Rating Bar Animation (Product Detail Page) ---
function animateRatingBars() {
    document.querySelectorAll('.rating-bar-fill').forEach(function(el) {
        var width = el.getAttribute('data-width');
        if (width) {
            // Apply width after a short delay for visual effect
            setTimeout(() => {
                el.style.width = width + '%';
            }, 100); // 100ms delay
        }
    });
}
// Check if on product detail page (or any page with rating bars) and run
if (document.querySelector('.rating-bars')) {
    animateRatingBars();
}