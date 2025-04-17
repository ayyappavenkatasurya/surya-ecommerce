console.log("Main JS loaded.");

document.addEventListener('DOMContentLoaded', () => {


    const updateQtyButtons = document.querySelectorAll('.btn-update-qty');
    updateQtyButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = button.dataset.productId;
            const quantityInput = document.getElementById(`quantity-${productId}`);
            const newQuantity = parseInt(quantityInput.value, 10);

            if (isNaN(newQuantity) || newQuantity < 0) {
                 alert('Invalid quantity');
                return;
             }
            const maxStock = parseInt(quantityInput.max, 10);
            if(newQuantity > maxStock){
                alert(`Only ${maxStock} items available in stock.`);
                quantityInput.value = maxStock;
                 return;
             }

            updateCartItemQuantityAJAX(productId, newQuantity, button);
        });
    });



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
                submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';


            }
        });
    });



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


    const editBtn = document.getElementById('edit-address-btn');
    const cancelBtn = document.getElementById('cancel-edit-btn');
    const addressForm = document.getElementById('address-form');
    const savedAddressDiv = document.querySelector('.saved-address');
    const profileSavedAddressDiv = document.getElementById('saved-address-display');
    const placeOrderBtn = document.querySelector('.btn-place-order');
    const formTitle = addressForm?.querySelector('h3');
    const addressSourceInput = addressForm?.querySelector('input[name="source"]');
    let isProfilePage = addressSourceInput?.value === 'profile';

    let initialAddressDiv = isProfilePage ? profileSavedAddressDiv : savedAddressDiv;
    const hasInitialAddress = initialAddressDiv && !initialAddressDiv.classList.contains('hidden');

    if (editBtn && addressForm && initialAddressDiv) {
        editBtn.addEventListener('click', () => {
            addressForm.classList.remove('hidden');
            initialAddressDiv.classList.add('hidden');
            if(placeOrderBtn) placeOrderBtn.disabled = true;
            if(formTitle) formTitle.textContent = 'Edit Address';
        });
    }

    if (cancelBtn && addressForm && initialAddressDiv) {
        cancelBtn.addEventListener('click', () => {
            addressForm.classList.add('hidden');
            if (hasInitialAddress) {
                initialAddressDiv.classList.remove('hidden');

                if(placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = false;
            } else {
                 if(placeOrderBtn && !isProfilePage) placeOrderBtn.disabled = true;
            }

        });
    }


     if (!isProfilePage && !hasInitialAddress && addressForm && placeOrderBtn) {
         addressForm.classList.remove('hidden');
         placeOrderBtn.disabled = true;
         if (formTitle) formTitle.textContent = 'Add Address';
     } else if (!isProfilePage && hasInitialAddress && placeOrderBtn) {
         placeOrderBtn.disabled = false;
     }

      if (isProfilePage && !hasInitialAddress && addressForm) {
         addressForm.classList.remove('hidden');
         if (formTitle) formTitle.textContent = 'Add Address';
     }




});


async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
     const originalButtonText = 'Update';
     const loadingButtonText = '<i class="fas fa-spinner fa-spin"></i>';
     const quantityInput = document.getElementById(`quantity-${productId}`);

     buttonElement.disabled = true;
     buttonElement.innerHTML = loadingButtonText;
     if(quantityInput) quantityInput.readOnly = true;


    try {
        const response = await fetch('/user/cart/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',

            },
            body: JSON.stringify({ productId, quantity })
         });

        if (!response.ok) {
             const errorData = await response.json().catch(() => ({ message: 'Failed to update cart. Server error.' }));
            throw new Error(errorData.message || `Update failed (Status: ${response.status})`);
        }

         const data = await response.json();

         if (data.success) {
            const cartItemDiv = buttonElement.closest('.cart-item');

             if (quantity === 0) {
                if (cartItemDiv) {
                    cartItemDiv.style.transition = 'opacity 0.3s ease';
                    cartItemDiv.style.opacity = '0';
                    setTimeout(() => {
                        cartItemDiv.remove();

                        updateCartTotalAndBadge(data.cartTotal);
                        handleEmptyCartDisplay();
                    }, 300);
                     return;
                }
             } else {
                 const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                 if (subtotalSpan) subtotalSpan.textContent = data.itemSubtotal.toFixed(2);
                if(quantityInput) {
                     quantityInput.value = data.newQuantity;
                 }

             }

             updateCartTotalAndBadge(data.cartTotal);

         } else {

             alert(`Update failed: ${data.message}`);
         }

    } catch (error) {

         console.error('Error updating cart quantity:', error);
         alert(`Error: ${error.message}`);
    } finally {

         buttonElement.disabled = false;
         buttonElement.innerHTML = originalButtonText;
         if(quantityInput) quantityInput.readOnly = false;
     }
}


function updateCartTotalAndBadge(newCartTotal) {

     const cartTotalSpan = document.getElementById('cart-total-value');
     if (cartTotalSpan) cartTotalSpan.textContent = newCartTotal.toFixed(2);


     const newCartItemCount = calculateNewCartCount();
     const cartBadge = document.querySelector('.cart-badge');
     if (cartBadge) {
         if (newCartItemCount > 0) {
             cartBadge.textContent = newCartItemCount;
             cartBadge.style.display = 'inline-block';
         } else {
            cartBadge.textContent = '0';
            cartBadge.style.display = 'none';
         }
     } else {
         console.warn("Cart badge element not found in header.");
     }
}



function calculateNewCartCount() {
    const quantityInputs = document.querySelectorAll('.cart-item .quantity-input');
    let count = 0;
    quantityInputs.forEach(input => {
        const value = parseInt(input.value, 10);

        if (!isNaN(value) && value > 0) {

          count += value;
        }
    });
    return count;
}


function handleEmptyCartDisplay() {
    const cartItemsContainer = document.querySelector('.cart-items');
     const cartContainer = document.querySelector('.cart-container');

     if (calculateNewCartCount() === 0 && cartContainer && cartItemsContainer) {

         cartContainer.innerHTML = '<h1>Your Shopping Cart</h1><p>Your cart is empty. <a href="/">Continue Shopping</a></p>';

     }
}