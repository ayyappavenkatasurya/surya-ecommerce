// public/js/main.js

console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {

    // --- NEW Cart +/- Button Logic ---
    document.querySelectorAll('.cart-item-quantity').forEach(container => {
        const decreaseBtn = container.querySelector('.btn-qty-decrease');
        const increaseBtn = container.querySelector('.btn-qty-increase');
        const quantityInput = container.querySelector('.quantity-display');
        // Ensure all elements exist before adding listeners
        if (!decreaseBtn || !increaseBtn || !quantityInput) {
            console.warn('Missing quantity control elements in a cart item container.');
            return;
        }
        const productId = quantityInput.dataset.productId; // Get product ID from input

        decreaseBtn.addEventListener('click', () => {
            let currentQuantity = parseInt(quantityInput.value, 10);
            if (currentQuantity > 1) {
                const newQuantity = currentQuantity - 1;
                // Disable buttons temporarily before AJAX
                disableQuantityButtons(productId, true);
                updateCartItemQuantityAJAX(productId, newQuantity, decreaseBtn); // Pass button for context if needed later
            }
        });

        increaseBtn.addEventListener('click', () => {
            let currentQuantity = parseInt(quantityInput.value, 10);
            const maxStock = parseInt(quantityInput.dataset.stock, 10);
            // Check if stock data is valid
            if (isNaN(maxStock)) {
                console.error(`Invalid stock data for product ${productId}`);
                alert('Could not verify stock limit. Please refresh the page.');
                return;
            }

            if (currentQuantity < maxStock) {
                const newQuantity = currentQuantity + 1;
                 // Disable buttons temporarily before AJAX
                disableQuantityButtons(productId, true);
                updateCartItemQuantityAJAX(productId, newQuantity, increaseBtn); // Pass button for context if needed later
            } else {
                // Optional: Flash a temporary message or visually indicate max stock reached
                console.warn(`Max stock (${maxStock}) reached for product ${productId}`);
                // You could temporarily change the button style here if desired
                // e.g., increaseBtn.classList.add('max-reached-indicator'); setTimeout(() => increaseBtn.classList.remove('max-reached-indicator'), 1000);
            }
        });
    });
    // --- END NEW Cart +/- Button Logic ---


    // --- Generic Form Submission Spinner ---
    document.querySelectorAll('form.form-submit-spinner').forEach(form => {
        form.addEventListener('submit', (event) => {
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton && !submitButton.disabled) {
                // Basic client-side validation check before showing spinner
                if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
                    // Let browser handle HTML5 validation messages, don't show spinner
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
                    // Ensure we don't overwrite data-label if already set or if header is empty/out of bounds
                    if (!cell.hasAttribute('data-label') && headers[index] !== undefined && headers[index] !== '') {
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
                    // Don't show fallback if user simply cancelled the share dialog
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

    // --- Checkout Address Form Toggle ---
    const editBtn = document.getElementById('edit-address-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const addressForm = document.getElementById('address-form');
    // Select *potential* address displays (one might not exist depending on page)
    const profileSavedAddressDiv = document.getElementById('saved-address-display');
    const checkoutSavedAddressDiv = document.querySelector('.checkout-address .saved-address');
    const placeOrderBtn = document.querySelector('.btn-place-order');
    const formTitle = addressForm?.querySelector('h3');
    const addressSourceInput = addressForm?.querySelector('input[name="source"]');

    const isProfilePage = addressSourceInput?.value === 'profile';

    // Determine which address div is relevant for the current page
    let initialAddressDiv = isProfilePage ? profileSavedAddressDiv : checkoutSavedAddressDiv;
    const hasInitialAddress = initialAddressDiv && !initialAddressDiv.classList.contains('hidden');

    // Edit Button Logic
    if (editBtn && addressForm && initialAddressDiv) {
        editBtn.addEventListener('click', () => {
            addressForm.classList.remove('hidden');
            initialAddressDiv.classList.add('hidden');
            if (placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = true; // Disable place order only on checkout page
            if (formTitle) formTitle.textContent = 'Edit Address';
        });
    }

    // Cancel Button Logic
    if (cancelBtn && addressForm && initialAddressDiv) {
        cancelBtn.addEventListener('click', () => {
            addressForm.classList.add('hidden');
            if (hasInitialAddress) {
                initialAddressDiv.classList.remove('hidden');
                 // Only re-enable place order button if NOT on profile page and address existed
                if(placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = false;
            } else {
                 // If cancelling and there was no initial address, keep place order disabled (checkout only)
                 if(placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = true;
            }
            // Reset form fields? Optional, but good practice if needed
            // addressForm.reset();
        });
    }

     // Initial State Logic:
     // On Checkout: If no initial address, show form, ensure button is disabled
     if (!isProfilePage && !hasInitialAddress && addressForm && placeOrderBtn) {
         addressForm.classList.remove('hidden');
         placeOrderBtn.disabled = true;
         if (formTitle) formTitle.textContent = 'Add Address';
     } else if (!isProfilePage && hasInitialAddress && placeOrderBtn) {
         placeOrderBtn.disabled = false; // Ensure enabled if address exists initially on checkout
     }
     // On Profile: If no address, show form (cancel button might be hidden by EJS)
      if (isProfilePage && !hasInitialAddress && addressForm) {
         addressForm.classList.remove('hidden');
         if (formTitle) formTitle.textContent = 'Add Address';
         // Hide cancel button explicitly if no initial address on profile
         if (cancelBtn) cancelBtn.classList.add('hidden');
     } else if (isProfilePage && hasInitialAddress && addressForm){
        // Ensure cancel button is shown if address exists on profile
        if (cancelBtn) cancelBtn.classList.remove('hidden');
     }


    // --- Auto-close Flash Messages ---
    const autoCloseAlerts = document.querySelectorAll('.alert[role="alert"]'); // Select alerts intended as messages

    autoCloseAlerts.forEach(alertElement => {
        // Set timeout to start fade out after 5 seconds
        const fadeTimeout = setTimeout(() => {
            alertElement.style.opacity = '0'; // Trigger the CSS fade transition

            // Set another timeout to remove the element after the fade completes
            const removeTimeout = setTimeout(() => {
                // Check if the element still exists in the DOM (user might have clicked close)
                if (alertElement.parentNode) {
                     alertElement.remove(); // Remove the element completely
                }
            }, 500); // This duration MUST match the CSS transition duration (0.5s = 500ms)

            // Store removeTimeout ID on the element for potential clearing
            alertElement.dataset.removeTimeoutId = removeTimeout;

        }, 5000); // 5000 milliseconds = 5 seconds

        // Store fadeTimeout ID on the element for potential clearing
        alertElement.dataset.fadeTimeoutId = fadeTimeout;

        // Add event listener to the close button (if it exists) to clear timers
        const closeButton = alertElement.querySelector('.close-alert');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                // Clear the timeouts using the stored IDs
                const fadeId = parseInt(alertElement.dataset.fadeTimeoutId, 10);
                const removeId = parseInt(alertElement.dataset.removeTimeoutId, 10);
                if (!isNaN(fadeId)) clearTimeout(fadeId);
                if (!isNaN(removeId)) clearTimeout(removeId);
                // The button's default action (removing parent via inline onclick or separate listener) will still occur
            }, { once: true }); // Ensure listener only runs once per button
        }
    });
    // --- END Auto-close ---

    // --- Initial Button State Update for +/- buttons ---
    // Call this function after the initial page load to set correct disabled states
    document.querySelectorAll('.quantity-display').forEach(input => {
         updateQuantityButtonStates(input.dataset.productId);
     });

}); // End DOMContentLoaded


// --- Helper function to disable/enable +/- buttons during AJAX ---
function disableQuantityButtons(productId, disabled) {
    // Find the specific container for the product
    const container = document.querySelector(`.cart-item[data-product-id="${productId}"] .cart-item-quantity`);
    if (container) {
        const decreaseBtn = container.querySelector('.btn-qty-decrease');
        const increaseBtn = container.querySelector('.btn-qty-increase');
        if(decreaseBtn) decreaseBtn.disabled = disabled;
        if(increaseBtn) increaseBtn.disabled = disabled;
        // Optional: Add/remove a visual indicator class during update
        // if (disabled) { container.classList.add('updating'); }
        // else { container.classList.remove('updating'); }
    } else {
        console.warn(`Quantity container not found for product ID: ${productId} during disable/enable.`);
    }
}


// --- Helper function to update button disabled states based on quantity ---
function updateQuantityButtonStates(productId) {
     const container = document.querySelector(`.cart-item[data-product-id="${productId}"] .cart-item-quantity`);
     if (!container) return; // Exit if container not found (e.g., item removed)

     const decreaseBtn = container.querySelector('.btn-qty-decrease');
     const increaseBtn = container.querySelector('.btn-qty-increase');
     const quantityInput = container.querySelector('.quantity-display');

     // Ensure all elements are still present
     if (!decreaseBtn || !increaseBtn || !quantityInput) return;

     const currentQuantity = parseInt(quantityInput.value, 10);
     const maxStock = parseInt(quantityInput.dataset.stock, 10);

     // Validate parsed numbers
     if (isNaN(currentQuantity)) {
        console.error(`Invalid quantity value for product ${productId}: ${quantityInput.value}`);
        return;
     }
     if (isNaN(maxStock)) {
        console.error(`Invalid stock value for product ${productId}: ${quantityInput.dataset.stock}`);
        // Optionally disable increase button as a fallback if stock is unknown
        increaseBtn.disabled = true;
        decreaseBtn.disabled = (currentQuantity <= 1); // Still handle decrease
        return;
     }


     decreaseBtn.disabled = (currentQuantity <= 1);
     increaseBtn.disabled = (currentQuantity >= maxStock);
}


// --- Cart AJAX Update Function (Using +/- Buttons) ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
     // Note: buttonElement is passed but not strictly needed for text changes anymore

     const quantityInput = document.getElementById(`quantity-${productId}`); // Still useful for reading value

    // Buttons are already disabled by the caller function (disableQuantityButtons)

    try {
        const response = await fetch('/user/cart/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Include CSRF token header if you implement CSRF protection
            },
            body: JSON.stringify({ productId, quantity })
         });

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Failed to update cart. Server error.' }));
            throw new Error(errorData.message || `Update failed (Status: ${response.status})`);
        }

         const data = await response.json();

         if (data.success) {
            const cartItemDiv = document.querySelector(`.cart-item[data-product-id="${productId}"]`); // Find parent cart item

             // Update input value with the confirmed quantity from the server
             if(quantityInput) {
                 quantityInput.value = data.newQuantity; // Use the quantity from the response
             } else {
                 console.warn(`Quantity input not found for product ${productId} after update.`);
             }

             // Update subtotal (find the specific span)
             if (cartItemDiv) {
                 const subtotalSpan = cartItemDiv.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = data.itemSubtotal.toFixed(2);
             } else {
                console.warn(`Cart item div not found for product ${productId} after update.`);
             }

             // Update total and badge
             updateCartTotalAndBadge(data.cartTotal);

         } else {
             // Server responded with success: false but OK status
             alert(`Update failed: ${data.message}`);
             // Reverting the input value here is complex as we don't have the pre-click value readily available
             // Best approach is to rely on the subsequent updateQuantityButtonStates call in finally
             // to potentially disable buttons if the server state mismatch leads to hitting limits.
         }

    } catch (error) {
         // Network error or other exception during fetch/processing
         console.error('Error updating cart quantity:', error);
         alert(`Error: ${error.message}`);
         // Handle error - perhaps try to fetch the cart again or prompt user to refresh?
         // Reverting state is difficult without knowing the true server state.
    } finally {
         // Always re-enable buttons and update their states based on the *final* quantity
         // This ensures buttons reflect the actual state after the update attempt.
         disableQuantityButtons(productId, false);
         updateQuantityButtonStates(productId);
     }
}

// --- Helper Function: Update Cart Total Display and Header Badge ---
function updateCartTotalAndBadge(newCartTotal) {
    // Update Cart Total Display (in cart page/checkout)
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
         // console.warn("Cart badge element not found in header."); // Reduce noise
     }
}


// --- Helper function: Calculate cart count from input fields ---
// Calculates total number of *items* (sum of quantities), not just distinct products
function calculateNewCartCount() {
    const quantityInputs = document.querySelectorAll('.cart-item .quantity-display'); // Use new class
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
     if (calculateNewCartCount() === 0 && cartContainer && cartItemsContainer) {
         // Replace entire cart content if empty
         cartContainer.innerHTML = '<h1>Your Shopping Cart</h1><p>Your cart is empty. <a href="/">Continue Shopping</a></p>';
         // No need to hide summary as it's removed along with the container content
     }
}