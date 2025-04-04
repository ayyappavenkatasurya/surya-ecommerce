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
                    // Ensure we don't overwrite data-label if already set or if header is empty
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
    const savedAddressDiv = document.querySelector('.saved-address'); // Should be #saved-address-display? Check profile.ejs if issues
    const profileSavedAddressDiv = document.getElementById('saved-address-display'); // Specific ID for profile page
    const placeOrderBtn = document.querySelector('.btn-place-order');
    const formTitle = addressForm?.querySelector('h3');
    const addressSourceInput = addressForm?.querySelector('input[name="source"]');
    let isProfilePage = addressSourceInput?.value === 'profile'; // Check if on profile page

    let initialAddressDiv = isProfilePage ? profileSavedAddressDiv : savedAddressDiv;
    const hasInitialAddress = initialAddressDiv && !initialAddressDiv.classList.contains('hidden');

    if (editBtn && addressForm && initialAddressDiv) {
        editBtn.addEventListener('click', () => {
            addressForm.classList.remove('hidden');
            initialAddressDiv.classList.add('hidden');
            if(placeOrderBtn) placeOrderBtn.disabled = true; // Disable place order while editing checkout address
            if(formTitle) formTitle.textContent = 'Edit Address';
        });
    }

    if (cancelBtn && addressForm && initialAddressDiv) {
        cancelBtn.addEventListener('click', () => {
            addressForm.classList.add('hidden');
            if (hasInitialAddress) {
                initialAddressDiv.classList.remove('hidden');
                 // Only re-enable place order button if NOT on profile page and address existed
                if(placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = false;
            } else {
                 if(placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = true; // Keep disabled if there was no initial address on checkout
            }
            // Reset form fields? Optional, but good practice
            // addressForm.reset();
        });
    }

     // Initial state check:
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
     }


    // --- START: Bulk Order Assignment Logic ---
    const selectAllCheckbox = document.getElementById('select-all-orders');
    const orderCheckboxes = document.querySelectorAll('.order-checkbox');
    const bulkActionControls = document.getElementById('bulk-action-controls');
    const selectedCountSpan = document.getElementById('selected-count');
    const bulkAssignForm = document.getElementById('bulk-assign-form'); // Get the form
    const bulkAssignButton = bulkActionControls?.querySelector('button[type="submit"]');
    const bulkDeliveryAdminSelect = document.getElementById('bulkDeliveryAdminId');


    function updateBulkActionVisibility() {
        const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
        const count = selectedCheckboxes.length;

        if (selectedCountSpan) {
            selectedCountSpan.textContent = count;
        }

        if (bulkActionControls) {
            bulkActionControls.style.display = count > 0 ? 'block' : 'none';
        }

        // Enable/disable bulk assign button based on selection and admin choice
        if(bulkAssignButton && bulkDeliveryAdminSelect){
            bulkAssignButton.disabled = count === 0 || bulkDeliveryAdminSelect.value === '';
        }
    }

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            orderCheckboxes.forEach(checkbox => {
                checkbox.checked = isChecked;
                // Optional: Add/remove a highlight class to the row
                checkbox.closest('tr')?.classList.toggle('selected-row', isChecked);
            });
            updateBulkActionVisibility();
        });
    }

    orderCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            // Optional: Add/remove a highlight class to the row
             e.target.closest('tr')?.classList.toggle('selected-row', e.target.checked);

            // Check if *all* enabled checkboxes are now checked
            const allChecked = [...orderCheckboxes].every(cb => cb.checked);
             // Check if *any* checkbox is checked
            const anyChecked = [...orderCheckboxes].some(cb => cb.checked);

            if (selectAllCheckbox) {
                selectAllCheckbox.checked = allChecked;
                 // Handle indeterminate state (visual sugar)
                 // If some but not all are checked, set indeterminate
                 selectAllCheckbox.indeterminate = anyChecked && !allChecked;
            }
            updateBulkActionVisibility();
        });
    });

     // Add listener to the delivery admin dropdown in the bulk section
    if(bulkDeliveryAdminSelect){
        bulkDeliveryAdminSelect.addEventListener('change', () => {
            updateBulkActionVisibility(); // Re-check if button should be enabled
        });
     }


    // Initial check in case the page loads with some state or errors
    if (orderCheckboxes.length > 0) {
        updateBulkActionVisibility();
        // Disable select all if no orders are assignable
        const assignableCount = [...orderCheckboxes].length;
        if(selectAllCheckbox) selectAllCheckbox.disabled = assignableCount === 0;

    } else if (selectAllCheckbox) {
        selectAllCheckbox.disabled = true; // Disable if there are no checkboxes at all
    }

     // Optional: Add confirmation before bulk submitting
     if (bulkAssignForm) {
        bulkAssignForm.addEventListener('submit', (e) => {
             const selectedCheckboxes = document.querySelectorAll('.order-checkbox:checked');
             const count = selectedCheckboxes.length;
             const adminSelected = bulkDeliveryAdminSelect && bulkDeliveryAdminSelect.value !== '';

             if (count === 0) {
                 alert('Please select at least one order to assign.');
                 e.preventDefault();
                 return;
             }
             if (!adminSelected) {
                 alert('Please select a Delivery Admin to assign the orders to.');
                 e.preventDefault();
                 return;
             }

             if (!confirm(`Are you sure you want to assign ${count} order(s) to the selected Delivery Admin?`)) {
                 e.preventDefault(); // Stop submission if user cancels
             }
             // Spinner is handled by the generic form spinner logic already attached via class
         });
    }

    // --- END: Bulk Order Assignment Logic ---


}); // End DOMContentLoaded


// --- Cart AJAX Update Function (Revised Spinner/Button Handling) ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
     const originalButtonText = 'Update'; // Define original text
     const loadingButtonText = '<i class="fas fa-spinner fa-spin"></i>'; // Just spinner for small button
     const quantityInput = document.getElementById(`quantity-${productId}`); // Get input

     buttonElement.disabled = true;
     buttonElement.innerHTML = loadingButtonText;
     if(quantityInput) quantityInput.readOnly = true; // Make input readonly during update


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
            const cartItemDiv = buttonElement.closest('.cart-item'); // Find parent cart item

             if (quantity === 0) {
                if (cartItemDiv) {
                    cartItemDiv.style.transition = 'opacity 0.3s ease';
                    cartItemDiv.style.opacity = '0';
                    setTimeout(() => {
                        cartItemDiv.remove();
                         // Recalculate count and update UI after removing item
                        updateCartTotalAndBadge(data.cartTotal); // Pass the total from response
                        handleEmptyCartDisplay(); // Check if cart became empty
                    }, 300);
                     return; // Exit early as item is being removed
                }
             } else {
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = data.itemSubtotal.toFixed(2);
                if(quantityInput) {
                     quantityInput.value = data.newQuantity; // Update input with confirmed quantity
                 }

             }
             // Update total and badge for successful updates (non-zero quantity)
             updateCartTotalAndBadge(data.cartTotal);

         } else {
             // Server responded with success: false
             alert(`Update failed: ${data.message}`);
         }

    } catch (error) {
         // Network error or other exception during fetch/processing
         console.error('Error updating cart quantity:', error);
         alert(`Error: ${error.message}`);
    } finally {
         // Always re-enable button and input, restore original text
         buttonElement.disabled = false;
         buttonElement.innerHTML = originalButtonText;
         if(quantityInput) quantityInput.readOnly = false;
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
    const quantityInputs = document.querySelectorAll('.cart-item .quantity-input');
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
         // No need to hide summary as it's removed
     }
}