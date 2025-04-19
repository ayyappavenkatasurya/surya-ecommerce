console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {

    // --- Keep Existing Button Spinner Logic ---
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
            }
        });
    });

    // --- Keep Existing Responsive Table Logic ---
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

    // --- Keep Existing Share Button Logic ---
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
                         fallbackLinks.classList.remove('hidden'); // Use hidden consistently
                    }
                }
            } else {
                console.log('Web Share API not supported, showing fallback links.');
                fallbackLinks.classList.remove('hidden'); // Use hidden consistently
            }
        });
    }

    // --- Keep Existing Profile Address Toggle Logic ---
    const profileEditBtn = document.getElementById('edit-address-btn');
    const profileAddBtn = document.getElementById('add-address-btn');
    const profileCancelBtn = document.getElementById('cancel-edit-btn');
    const profileAddressForm = document.getElementById('address-form'); // Use ID on profile page too
    const profileSavedAddressDiv = document.getElementById('saved-address-display');

    if (document.body.contains(profileAddressForm)) { // Check if on a page with the address form
        const showProfileForm = () => {
            profileAddressForm.classList.remove('hidden');
            profileAddressForm.querySelector('h3').textContent = profileSavedAddressDiv.querySelector('strong') ? 'Edit Address' : 'Add Address';
            profileSavedAddressDiv?.classList.add('hidden'); // Optional chaining for safety
            if (profileCancelBtn && profileSavedAddressDiv?.querySelector('strong')) {
                profileCancelBtn.classList.remove('hidden');
            } else if (profileCancelBtn) {
                 profileCancelBtn.classList.add('hidden');
            }
        };

        const hideProfileForm = () => {
            profileAddressForm.classList.add('hidden');
            if (profileSavedAddressDiv) {
                 if (profileSavedAddressDiv.querySelector('strong')) { // Check if address actually exists
                     profileSavedAddressDiv.classList.remove('hidden');
                 } else {
                    // If no address exists, keep the "No address saved" section visible potentially
                    // This part depends on whether savedAddressDiv contains the "No address" message
                    profileSavedAddressDiv.classList.remove('hidden'); // Re-evaluate if this should be hidden
                 }
            }
             if (profileCancelBtn) profileCancelBtn.classList.add('hidden'); // Always hide cancel when form is hidden
        };

        if (profileEditBtn) {
            profileEditBtn.addEventListener('click', showProfileForm);
        }
        if (profileAddBtn) {
             profileAddBtn.addEventListener('click', () => {
                profileAddressForm.reset(); // Clear form fields when adding new
                showProfileForm();
             });
        }
        if (profileCancelBtn) {
            profileCancelBtn.addEventListener('click', hideProfileForm);
        }

        // Initial state for profile page add button
        if (profileSavedAddressDiv && !profileSavedAddressDiv.querySelector('strong') && profileAddressForm.classList.contains('hidden') && profileAddBtn) {
           profileAddBtn.classList.remove('hidden'); // Ensure add button is visible if no address
        } else if (profileAddBtn) {
             profileAddBtn.classList.add('hidden'); // Hide add button if address exists or form is shown
        }
    }

    // --- Keep Existing Checkout Address Toggle Logic ---
    const checkoutEditBtn = document.querySelector('.checkout-address #edit-address-btn'); // More specific selector
    const checkoutCancelBtn = document.querySelector('.checkout-address #cancel-edit-btn');
    const checkoutAddressForm = document.querySelector('.checkout-address #address-form');
    const checkoutSavedAddressDiv = document.querySelector('.checkout-address .saved-address');
    const placeOrderBtn = document.querySelector('.btn-place-order');

    if (document.body.contains(checkoutAddressForm)) { // Check if on checkout page
        const hasInitialAddress = checkoutSavedAddressDiv && !checkoutSavedAddressDiv.classList.contains('hidden');

        if (checkoutEditBtn) {
            checkoutEditBtn.addEventListener('click', () => {
                checkoutAddressForm.classList.remove('hidden');
                checkoutSavedAddressDiv.classList.add('hidden');
                if(placeOrderBtn) placeOrderBtn.disabled = true;
                checkoutAddressForm.querySelector('h3').textContent = 'Edit Address';
            });
        }

        if (checkoutCancelBtn) {
            checkoutCancelBtn.addEventListener('click', () => {
                checkoutAddressForm.classList.add('hidden');
                if (hasInitialAddress) {
                    checkoutSavedAddressDiv.classList.remove('hidden');
                    if(placeOrderBtn) placeOrderBtn.disabled = false;
                } else {
                    // If there was no initial address, cancelling means keep form hidden and button disabled
                    if(placeOrderBtn) placeOrderBtn.disabled = true;
                }
            });
        }

        // Initial state for checkout page
        if (!hasInitialAddress && checkoutAddressForm && placeOrderBtn) {
            checkoutAddressForm.classList.remove('hidden'); // Show form if no address saved
            placeOrderBtn.disabled = true; // Disable place order
            checkoutAddressForm.querySelector('h3').textContent = 'Add Address';
            if(checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden'); // Hide cancel btn if adding new
        } else if (hasInitialAddress && placeOrderBtn) {
            placeOrderBtn.disabled = false; // Enable if address exists
            if(checkoutCancelBtn) checkoutCancelBtn.classList.add('hidden'); // Ensure cancel is hidden initially
        }
    }

    // --- Keep Existing Cart Update AJAX Logic ---
    const updateQtyButtons = document.querySelectorAll('.btn-update-qty');
    updateQtyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent potential form submission if it's somehow in a form
            const productId = button.dataset.productId;
            const quantityInput = document.getElementById(`quantity-${productId}`);
            if (!quantityInput) return;

            const newQuantity = parseInt(quantityInput.value, 10);

            if (isNaN(newQuantity) || newQuantity < 0) {
                 alert('Invalid quantity.');
                // Restore original value maybe?
                // quantityInput.value = quantityInput.dataset.originalValue || 1;
                return;
             }
            const maxStock = parseInt(quantityInput.max, 10);
            if (!isNaN(maxStock) && newQuantity > maxStock) {
                alert(`Only ${maxStock} items available in stock.`);
                quantityInput.value = maxStock;
                 return; // Don't proceed with AJAX call
             }

            updateCartItemQuantityAJAX(productId, newQuantity, button);
        });
    });


    // ========================================
    // Dynamic Search Bar Logic (NEW)
    // ========================================
    const searchContainer = document.getElementById('dynamic-search-container');
    const searchToggleBtn = document.getElementById('search-toggle-btn');
    const searchForm = document.getElementById('dynamic-search-form');
    const searchInput = document.getElementById('search-input-dynamic');
    const suggestionsDropdown = document.getElementById('suggestions-dropdown');
    let suggestionFetchTimeout; // For debouncing

    // --- Toggle Search Bar (Mobile) ---
    if (searchToggleBtn && searchContainer) {
        searchToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering document click listener immediately
            searchContainer.classList.toggle('active');
            if (searchContainer.classList.contains('active')) {
                // Only focus if search form is actually becoming visible (check opacity/visibility)
                // Use setTimeout to allow transition to potentially complete
                setTimeout(() => { searchInput.focus(); }, 50);
            } else {
                suggestionsDropdown.classList.remove('active'); // Hide suggestions when closing
            }
        });
    }

    // --- Handle Search Input ---
    if (searchInput && suggestionsDropdown) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.trim();

            // Clear previous debounce timeout
            clearTimeout(suggestionFetchTimeout);

            if (query.length >= 2) { // Only search if query is long enough
                suggestionsDropdown.innerHTML = '<div class="suggestion-item"><i>Loading...</i></div>'; // Basic loading indicator
                suggestionsDropdown.classList.add('active');

                // Debounce the fetch request (e.g., 300ms delay)
                suggestionFetchTimeout = setTimeout(() => {
                    fetchSuggestions(query);
                }, 300);

            } else {
                suggestionsDropdown.innerHTML = '';
                suggestionsDropdown.classList.remove('active');
            }
        });

        // Keep suggestions open when focusing input (if suggestions exist)
        searchInput.addEventListener('focus', () => {
             const query = searchInput.value.trim();
              // Check if there are actual suggestion items, not just loading/error message
              const hasActualSuggestions = suggestionsDropdown.querySelector('a.suggestion-item');
              if (query.length >= 2 && hasActualSuggestions) {
                 suggestionsDropdown.classList.add('active');
             }
        });
    }

     // --- Fetch Suggestions from Backend ---
     async function fetchSuggestions(query) {
         try {
             // Use encodeURIComponent to handle special characters in query
             const response = await fetch(`/products/suggestions?q=${encodeURIComponent(query)}`);
             if (!response.ok) {
                 // Try to parse error message from backend if available
                 let errorMsg = `HTTP error! status: ${response.status}`;
                 try {
                     const errorData = await response.json();
                     errorMsg = errorData.error || errorMsg;
                 } catch (parseError) {
                     // Ignore if response body is not JSON
                 }
                 throw new Error(errorMsg);
             }
             const suggestions = await response.json();
             displaySuggestions(suggestions);
         } catch (error) {
             console.error('Error fetching suggestions:', error);
             suggestionsDropdown.innerHTML = `<div class="suggestion-item text-danger">Error: ${error.message}</div>`;
             suggestionsDropdown.classList.add('active'); // Keep open to show error
         }
     }

     // --- Display Suggestions ---
     function displaySuggestions(suggestions) {
         suggestionsDropdown.innerHTML = ''; // Clear previous/loading
         if (suggestions.length > 0) {
             suggestions.forEach(product => {
                 const item = document.createElement('a');
                 item.classList.add('suggestion-item');
                 item.href = `/products/${product._id}`; // Link to product detail page

                 // Add image
                 const img = document.createElement('img');
                 // Provide a default/placeholder if imageUrl is missing
                 img.src = product.imageUrl || '/images/placeholder.png'; // Adjust placeholder path if needed
                 img.alt = product.name;
                 img.loading = 'lazy'; // Add lazy loading
                 item.appendChild(img);

                 // Add name
                 const nameSpan = document.createElement('span');
                 nameSpan.textContent = product.name;
                 item.appendChild(nameSpan);

                 suggestionsDropdown.appendChild(item);
             });
             suggestionsDropdown.classList.add('active');
         } else {
             // Show "No results" message
              suggestionsDropdown.innerHTML = '<div class="suggestion-item text-muted">No matching products found.</div>';
              suggestionsDropdown.classList.add('active'); // Keep open to show message
         }
     }

     // --- Close Search/Suggestions on Outside Click ---
     document.addEventListener('click', (e) => {
         if (searchContainer && !searchContainer.contains(e.target) && !searchToggleBtn.contains(e.target)) {
             // Clicked outside the search container AND outside the toggle button
             searchContainer.classList.remove('active'); // Deactivate container (hides form on mobile)
             suggestionsDropdown.classList.remove('active'); // Always hide suggestions
         }
     });

     // Prevent closing when clicking inside suggestions dropdown
     if(suggestionsDropdown) {
         suggestionsDropdown.addEventListener('click', (e) => {
             // Allow clicks on links within the dropdown to navigate
             // but stop propagation otherwise to keep it open
             if (!e.target.closest('a')) {
                 e.stopPropagation();
             }
         });
     }

    // ========================================
    // End Dynamic Search Bar Logic
    // ========================================

}); // End DOMContentLoaded


// --- Keep Existing Cart Update AJAX Function ---
async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
     const originalButtonText = 'Update'; // Keep original text simple
     const loadingButtonText = '<i class="fas fa-spinner fa-spin"></i>'; // Spinner icon
     const quantityInput = document.getElementById(`quantity-${productId}`);
     const cartItemDiv = buttonElement.closest('.cart-item');

     buttonElement.disabled = true;
     buttonElement.innerHTML = loadingButtonText;
     if(quantityInput) quantityInput.readOnly = true; // Disable input during update

    try {
        const response = await fetch('/user/cart/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add CSRF token header if you implement CSRF protection
            },
            body: JSON.stringify({ productId, quantity })
         });

        // Always try to parse JSON, even for errors, to get backend message
        const data = await response.json();

        if (!response.ok) {
            // Throw error with message from backend if available
            throw new Error(data.message || `Update failed (Status: ${response.status})`);
        }

         // Success case (response.ok is true)
         if (data.success) {
             // Handle item removal (quantity is 0)
             if (quantity === 0) {
                if (cartItemDiv) {
                    cartItemDiv.style.transition = 'opacity 0.3s ease, height 0.3s ease';
                    cartItemDiv.style.opacity = '0';
                    cartItemDiv.style.height = '0'; // Collapse height
                    cartItemDiv.style.padding = '0';
                    cartItemDiv.style.margin = '0';
                    cartItemDiv.style.border = 'none';
                    setTimeout(() => {
                        cartItemDiv.remove();
                        updateCartTotalAndBadge(data.cartTotal); // Update after removing
                        handleEmptyCartDisplay(); // Check if cart is now empty
                    }, 300); // Wait for animation
                     return; // Exit early as element is being removed
                }
             } else {
                 // Update quantity input and subtotal for existing item
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = (data.itemSubtotal !== undefined ? data.itemSubtotal : 0).toFixed(2); // Use data from response
                if(quantityInput) {
                     quantityInput.value = data.newQuantity; // Update input value from response
                 }
             }
             // Update total and badge for both add/update cases (except removal handled above)
             updateCartTotalAndBadge(data.cartTotal);
         } else {
             // Handle cases where response is ok, but backend indicates failure (e.g., validation)
             alert(`Update failed: ${data.message}`);
             // Optional: Restore original quantity in input?
             // if (quantityInput) quantityInput.value = quantityInput.dataset.originalValue || 1;
         }

    } catch (error) {
         console.error('Error updating cart quantity:', error);
         alert(`Error: ${error.message}`);
          // Optional: Restore original quantity in input on error?
          // if (quantityInput) quantityInput.value = quantityInput.dataset.originalValue || 1;
    } finally {
         // Re-enable button and input regardless of success/error (unless item removed)
         if (!cartItemDiv || quantity !== 0) { // Check if item wasn't removed
             buttonElement.disabled = false;
             buttonElement.innerHTML = originalButtonText;
             if(quantityInput) quantityInput.readOnly = false;
         }
     }
}

// --- Keep Existing Helper Functions ---
function updateCartTotalAndBadge(newCartTotal) {
     const cartTotalSpan = document.getElementById('cart-total-value');
     if (cartTotalSpan) cartTotalSpan.textContent = (newCartTotal !== undefined ? newCartTotal : 0).toFixed(2);

     // Recalculate count from current cart items on page
     const newCartItemCount = calculateNewCartCount();
     const cartBadge = document.querySelector('.cart-badge');
     if (cartBadge) {
         if (newCartItemCount > 0) {
             cartBadge.textContent = newCartItemCount;
             cartBadge.classList.remove('hide'); // Use 'hide' class
         } else {
            cartBadge.textContent = '0';
            cartBadge.classList.add('hide'); // Use 'hide' class
         }
     } else {
         // console.warn("Cart badge element not found in header.");
     }
}

function calculateNewCartCount() {
    // Calculate based on visible cart items (more reliable after potential removals)
    const cartItems = document.querySelectorAll('.cart-item');
    let count = 0;
    cartItems.forEach(item => {
        const quantityInput = item.querySelector('.quantity-input');
        if (quantityInput) {
            const value = parseInt(quantityInput.value, 10);
            if (!isNaN(value) && value > 0) {
              count += 1; // Count items, not total quantity for badge usually
              // If badge should show total quantity: count += value;
            }
        }
    });
    return count;
}

function handleEmptyCartDisplay() {
    const cartItemsContainer = document.querySelector('.cart-items');
     const cartContainer = document.querySelector('.cart-container');
     const cartSummary = document.querySelector('.cart-summary');

     if (cartItemsContainer && cartItemsContainer.children.length === 0 && cartContainer) {
         cartContainer.innerHTML = '<h1>Your Shopping Cart</h1><p>Your cart is empty. <a href="/">Continue Shopping</a></p>';
         if(cartSummary) cartSummary.remove(); // Remove summary if cart is empty
     }
}