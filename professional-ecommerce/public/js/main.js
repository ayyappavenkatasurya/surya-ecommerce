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

    async function updateCartItemQuantityAJAX(productId, quantity, buttonElement) {
        buttonElement.disabled = true;
         buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

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
                throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
            }

             const data = await response.json();


             if (data.success) {
                const cartItemDiv = document.querySelector(`.cart-item[data-product-id="${productId}"]`);

                 if (quantity === 0) {
                    if (cartItemDiv) {
                        cartItemDiv.style.transition = 'opacity 0.3s ease';
                        cartItemDiv.style.opacity = '0';
                        setTimeout(() => cartItemDiv.remove(), 300);
                     }
                 } else {
                     const subtotalSpan = cartItemDiv?.querySelector('.item-subtotal-value');
                     if (subtotalSpan) subtotalSpan.textContent = data.itemSubtotal.toFixed(2);
                    const quantityInput = document.getElementById(`quantity-${productId}`);
                    if(quantityInput) quantityInput.value = data.newQuantity;

                 }

                const cartTotalSpan = document.getElementById('cart-total-value');
                if (cartTotalSpan) cartTotalSpan.textContent = data.cartTotal.toFixed(2);


                 const cartBadge = document.querySelector('.cart-badge');
                 const newCartItemCount = calculateNewCartCount();
                 if (cartBadge) {
                     if (newCartItemCount > 0) {
                         cartBadge.textContent = newCartItemCount;
                         cartBadge.style.display = 'inline-block';
                     } else {
                        cartBadge.textContent = '0';
                        cartBadge.style.display = 'none';
                     }
                 } else if (newCartItemCount > 0) {
                    // If badge didn't exist, create it? Less likely, assuming it's in header.ejs
                 }


                  console.log("Cart updated:", data.message);


                  // Handle empty cart state
                  const cartItemsContainer = document.querySelector('.cart-items');
                  if (calculateNewCartCount() === 0 && cartItemsContainer) {
                       cartItemsContainer.innerHTML = '<p>Your cart is empty. <a href="/">Continue Shopping</a></p>';
                       const cartSummary = document.querySelector('.cart-summary');
                       if (cartSummary) cartSummary.style.display = 'none';
                   }


             } else {
                alert(`Update failed: ${data.message}`);
                  const quantityInput = document.getElementById(`quantity-${productId}`);
                 if(quantityInput){
                   // Attempt to revert quantity to previous state maybe? Needs storing old value.
                  // Simple revert could just fetch cart data again or reload page.
                 }

             }

        } catch (error) {
            console.error('Error updating cart quantity:', error);
             alert(`Error: ${error.message}`);

        } finally {
             buttonElement.disabled = false;
             buttonElement.innerHTML = 'Update';
         }
    }


     function calculateNewCartCount() {
         const quantityInputs = document.querySelectorAll('.cart-item .quantity-input');
        let count = 0;
        quantityInputs.forEach(input => {
            const value = parseInt(input.value, 10);
            if (!isNaN(value)) {
              count += value;
            }
        });
        return count;
     }


      // Make tables responsive on small screens by adding data-label attributes
      function responsiveTables() {
         const tables = document.querySelectorAll('.data-table');
         tables.forEach(table => {
            const headers = Array.from(table.querySelectorAll('th')).map(th => th.textContent);
             const rows = table.querySelectorAll('tbody tr');
             rows.forEach(row => {
                 const cells = row.querySelectorAll('td');
                 cells.forEach((cell, index) => {
                     cell.setAttribute('data-label', headers[index] || '');
                });
             });
        });
      }
      if (window.innerWidth <= 768) { // Apply only on smaller screens
        responsiveTables();
     }
     window.addEventListener('resize', () => { // Re-apply if needed on resize? Less critical
        // Simple check might suffice for initial load. Full dynamic resize handling adds complexity.
     });

});
