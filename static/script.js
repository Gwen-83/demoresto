// Slider
const slides = document.querySelectorAll('.slide');
let index = 0;

function showSlide(i) {
  slides.forEach((slide, idx) => {
    slide.classList.toggle('active', idx === i);
  });
}

function nextSlide() {
  index = (index + 1) % slides.length;
  showSlide(index);
}

setInterval(nextSlide, 4000);

document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.querySelector('.menu-toggle');
  const navLeft = document.querySelector('.nav-left');

  toggleButton.addEventListener('click', () => {
    navLeft.classList.toggle('show');
  });
});

// Auth utils
function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function logout() {
  const token = localStorage.getItem('token');
  const currentPage = window.location.pathname;

  let wasAdmin = false;

  if (token) {
    // Vérifie le rôle de l'utilisateur avant de supprimer le token
    fetch('https://demoresto.onrender.com/api/verify-token', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data && data.role === 'admin') {
        wasAdmin = true;
      }
    })
    .finally(() => {
      // Nettoyage côté client uniquement
      localStorage.removeItem('token');
      localStorage.removeItem('username');
      updateAuthButton();
      const status = document.getElementById('user-status');
      if (status) status.innerText = '';

      if (wasAdmin && currentPage.includes('admin.html')) {
        window.location.href = 'index.html';
      } else {
        location.reload();
      }
    });
  } else {
    // Pas de token : comportement par défaut
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    updateAuthButton();
    const status = document.getElementById('user-status');
    if (status) status.innerText = '';
    location.reload();
  }
}

function updateAuthButton() {
  const btn = document.getElementById('auth-button');
  const status = document.getElementById('user-status');
  const username = localStorage.getItem('username');
  const token = localStorage.getItem('token');

  if (!btn) return;

  if (username && token) {
    fetch('https://demoresto.onrender.com/api/verify-token', {
      headers: {
        'Authorization': 'Bearer ' + token
      }
    })
    .then(res => {
      if (res.ok) {
        res.json().then(data => {
          btn.textContent = 'Déconnexion';
          btn.onclick = logout;
          if (status) status.innerText = `Connecté à : ${username}`;

          // 👇 Affiche le lien admin si l'utilisateur est admin
          if (data.role === 'admin') {
            const adminLink = document.getElementById('admin-link');
            if (adminLink) adminLink.style.display = 'inline-block';
          }
        });
      }else {
        logout(); // Token invalide
      }
    })
    .catch(() => logout()); // Erreur réseau
  } else {
    btn.textContent = 'Connexion';
    btn.onclick = () => window.location.href = 'login.html';
    if (status) status.innerText = 'Déconnecté';
  }
}


window.addEventListener('DOMContentLoaded', updateAuthButton);

// Affichage du panier
if (window.location.pathname.includes('panier.html')) {
  loadCart();
}

function setQuantity(itemId, newQuantity) {
  newQuantity = parseInt(newQuantity);
  if (isNaN(newQuantity)) {
    loadCart(); // Remet la quantité précédente
    return;
  }

  updateCart(itemId, newQuantity);
}

function changeQuantity(itemId, currentQuantity, delta) {
  let newQuantity = currentQuantity + delta;
  if (newQuantity > 30) {
    newQuantity = 30;
  }
  if (newQuantity < 1) {
    newQuantity = 1;
  }
  updateCart(itemId, newQuantity);
}

function updateCart(cartItemId, newQuantity) {
  if (newQuantity > 30) {
    // Met à jour visuellement l’input s'il existe
    const input = document.querySelector(`input.quantity-input[onchange*="setQuantity(${cartItemId}"]`);
    if (input) {
      input.value = 30;
    }

    return;
  }

  if (newQuantity < 1) {
    // Rétablit la valeur minimale dans l'input
    const input = document.querySelector(`input.quantity-input[onchange*="setQuantity(${cartItemId}"]`);
    if (input) {
      input.value = 1;
    }

    return;
  }
  // Si la quantité est valide, on fait la requête
  fetch(`https://demoresto.onrender.com/api/cart/${cartItemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ quantity: newQuantity })
  })
  .then(res => res.json())
  .then(() => {
    loadCart();
  });
}

async function clearCartItems() {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];

  // S'il n'y a rien à supprimer
  if (cart.length === 0) {
    return Promise.resolve();
  }

  // Supprime chaque item via son ID (on suppose item.id est bien présent dans chaque élément)
  const deletePromises = cart.map(item =>
    fetch(`https://demoresto.onrender.com/api/cart/${item.id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + getToken()
      }
    })
  );

  // Attends que toutes les suppressions soient terminées
  await Promise.all(deletePromises);

  // Vide aussi localStorage côté client si nécessaire
  localStorage.removeItem('cart');

  return Promise.resolve();
}

function removeFromCart(cartItemId) {
  fetch(`https://demoresto.onrender.com/api/cart/${cartItemId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + getToken()
    }
  })
  .then(() => location.reload());
}

function showNotification(message, type = "success") {
  const notif = document.getElementById('notification');
  const msg = document.getElementById('notification-message');

  if (!notif || !msg) return;

  msg.innerText = message;

  notif.classList.remove('hidden', 'success', 'error', 'info');
  notif.classList.add(type);

  setTimeout(() => {
    hideNotification();
  }, 4000); // Masque automatiquement après 4 sec
}

function hideNotification() {
  const notif = document.getElementById('notification');
  if (notif) notif.classList.add('hidden');
}

async function loginUser(username, password, redirectAfterLogin = true) {
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.access_token) {
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('username', username);

      if (redirectAfterLogin) {
        const roleRes = await fetch('/api/verify-token', {
          headers: {
            'Authorization': 'Bearer ' + data.access_token
          }
        });

        const info = await roleRes.json();

        if (info.role === 'admin') {
          window.location.href = "/admin.html";
        } else {
          window.location.href = "/index.html";
        }
      }
    } else {
      // Affiche le message renvoyé par le backend
      const message = data.message || "Échec de la connexion.";
      showNotification(message, "error");
    }
  } catch (err) {
    console.error("Erreur lors de la connexion :", err);
    showNotification("Erreur de connexion au serveur.", "error");
  }
}

function getActiveFilters() {
  const filters = {
    tags: [],
    allergens: []
  };
  
  // Récupérer les filtres de tags
  const tagCheckboxes = document.querySelectorAll('.filter-tag:checked');
  tagCheckboxes.forEach(cb => {
    filters.tags.push(cb.value);
  });
  
  // Récupérer les filtres d'allergènes
  const allergenCheckboxes = document.querySelectorAll('.filter-allergen:checked');
  allergenCheckboxes.forEach(cb => {
    filters.allergens.push(cb.value);
  });
  
  return filters;
}

function productMatchesFilters(product, filters) {
  // Si aucun filtre n'est actif, afficher tous les produits
  if (filters.tags.length === 0 && filters.allergens.length === 0) {
    return true;
  }
  
  // Vérifier les tags
  if (filters.tags.length > 0) {
    const productTags = product.tags || [];
    const hasMatchingTag = filters.tags.some(tag => productTags.includes(tag));
    if (!hasMatchingTag) return false;
  }
  
  // Vérifier les allergènes
  if (filters.allergens.length > 0) {
    const productAllergens = product.allergens || [];
    const hasExcludedAllergen = filters.allergens.some(allergen => 
      productAllergens.includes(allergen)
    );
    if (hasExcludedAllergen) return false;
  }
  
  return true;
}

document.querySelectorAll('.filter-tag, .filter-allergen').forEach(cb => {
  cb.addEventListener('change', () => {
    document.getElementById('menu-container').innerHTML = ''; // Reset
    fetchAndRenderProducts(); // Rappelle la fonction principale de rendu
  });
});

function fetchAndRenderProducts() {
  fetch('https://demoresto.onrender.com/api/products')
    .then(response => response.json())
    .then(products => {
      const menuContainer = document.getElementById('menu-container');
      
      // Vérifier si l'élément existe avant de le manipuler
      if (!menuContainer) {
        console.warn("Élément #menu-container non trouvé");
        return;
      }
      
      menuContainer.innerHTML = ''; // Vide le menu avant tout

      const categories = {
        entree: [],
        plat: [],
        dessert: [],
        boisson: []
      };

      const filters = getActiveFilters();
      products.forEach(product => {
        if (!productMatchesFilters(product, filters)) return;

        const cat = product.category?.toLowerCase();
        if (cat && categories[cat]) {
          categories[cat].push(product);
        }
      });

      const hasProducts = Object.values(categories).some(items => items.length > 0);
      const noProductsMessage = document.getElementById('no-products-message');
      if (noProductsMessage) {
        if (!hasProducts) {
          noProductsMessage.style.display = 'block';
          return;
        } else {
          noProductsMessage.style.display = 'none';
        }
      }

      for (const [category, items] of Object.entries(categories)) {
        if (items.length === 0) continue;
        
        const section = document.createElement('section');
        section.id = category + 's';
        section.classList.add('menu-section');

        const title = document.createElement('h2');
        title.textContent = capitalize(category);
        section.appendChild(title);

        const itemsContainer = document.createElement('div');
        itemsContainer.classList.add('menu-items');

        items.forEach(product => {
          const itemDiv = document.createElement('div');
          itemDiv.classList.add('menu-item');

          const img = document.createElement('img');
          img.src = product.image || 'public/placeholder.jpg';
          img.alt = product.name;
          itemDiv.appendChild(img);

          const name = document.createElement('h3');
          name.textContent = product.name;
          itemDiv.appendChild(name);

          const desc = document.createElement('p');
          desc.textContent = product.description;
          itemDiv.appendChild(desc);

          const price = document.createElement('span');
          price.classList.add('prix');
          price.textContent = `${product.price.toFixed(2)}€`;
          itemDiv.appendChild(price);

          const actionDiv = document.createElement('div');
          actionDiv.classList.add('product-action');

          const qtyInput = document.createElement('input');
          qtyInput.type = 'number';
          qtyInput.min = '1';
          qtyInput.value = '1';
          qtyInput.classList.add('product-qty');
          actionDiv.appendChild(qtyInput);

          const button = document.createElement('button');
          button.classList.add('add-to-cart');
          button.textContent = 'Ajouter au panier';
          button.setAttribute('data-name', product.name);
          button.setAttribute('data-price', product.price);
          actionDiv.appendChild(button);

          itemDiv.appendChild(actionDiv);
          itemsContainer.appendChild(itemDiv);
        });

        section.appendChild(itemsContainer);
        menuContainer.appendChild(section);
      }

      // Ajouter les event listeners aux boutons d'ajout au panier
      attachCartEventListeners();
    })
    .catch(error => {
      console.error('Erreur lors du chargement des produits:', error);
    });
}

function attachCartEventListeners() {
  document.querySelectorAll('.add-to-cart').forEach(button => {
    button.addEventListener('click', () => {
      const name = button.dataset.name;
      const price = parseFloat(button.dataset.price);
      const qtyInput = button.previousElementSibling;
      let quantity = parseInt(qtyInput.value);

      if (isNaN(quantity) || quantity < 1) {
        showNotification("La quantité minimale est 1.", "error");
        qtyInput.value = 1;
        return;
      }

      if (quantity > 30) {
        showNotification("La quantité maximale autorisée est 30.", "error");
        qtyInput.value = 30;
        return;
      }

      if (!getToken()) {
        showNotification("Veuillez vous connecter pour ajouter un produit au panier.", "error");
        return;
      }

      fetch('https://demoresto.onrender.com/api/products', {
        headers: {
          'Authorization': 'Bearer ' + getToken()
        }
      })
        .then(res => {
          if (!res.ok) {
            if (res.status === 401) {
              showNotification("Veuillez vous connecter pour voir les produits.", "error");
              return Promise.reject();
            }
            return Promise.reject('Erreur ' + res.status);
          }
          return res.json();
        })
        .then(products => {
          const product = products.find(p => p.name === name && p.price === price);
          if (!product) {
            showNotification("Produit introuvable.", "error");
            return;
          }

          const productId = product.id;

          fetch('https://demoresto.onrender.com/api/cart', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + getToken()
            },
            body: JSON.stringify({ product_id: productId, quantity })
          })
            .then(async res => {
              if (!res.ok) {
                let errorMsg = "Erreur lors de l'ajout au panier.";
                try {
                  const err = await res.json();
                  if (err.error) errorMsg = err.error;
                } catch { }
                if (res.status === 401) {
                  showNotification("Veuillez vous connecter ou créer un compte pour ajouter un produit au panier.");
                } else {
                  showNotification(errorMsg, "error");
                }
                return;
              }

              const data = await res.json();
              if (data.message) {
                showNotification(data.message, "success");
              } else {
                showNotification("Produit ajouté au panier !", "success");
              }
            });
        })
        .catch(error => {
          console.error(error);
        });
    });
  });
} 

document.addEventListener('DOMContentLoaded', function () {
  // Initialiser le menu des produits si on est sur la page menu
  if (document.getElementById('menu-container')) {
    fetchAndRenderProducts();
  }

  // Gestion du dropdown de filtres
  const dropdown = document.querySelector('.dropdown-filter');
  if (dropdown) {
    const button = dropdown.querySelector('.dropdown-button');
    const content = dropdown.querySelector('.dropdown-content');
    const checkboxes = content.querySelectorAll('input[type="checkbox"]');

    // Toggle menu on button click
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', function () {
      dropdown.classList.remove('open');
    });

    // Prevent closing when clicking inside
    content.addEventListener('click', function (e) {
      e.stopPropagation();
    });

    // Close the dropdown when any checkbox is clicked
    checkboxes.forEach(cb => {
      cb.addEventListener('change', function () {
        dropdown.classList.remove('open');
      });
    });
  }

  // Event listeners pour les filtres
  document.querySelectorAll('.filter-tag, .filter-allergen').forEach(cb => {
    cb.addEventListener('change', fetchAndRenderProducts);
  });
});

document.addEventListener('DOMContentLoaded', fetchAndRenderProducts);

document.querySelectorAll('.filter-tag, .filter-allergen').forEach(cb => {
  cb.addEventListener('change', fetchAndRenderProducts);
});


function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

if (window.location.pathname.endsWith('admin.html')) {
  loadProducts();
}

let isEditing = false;
let currentEditId = null;

function loadProducts() {
  const table = document.getElementById('productTable');
  if (!table) {
    console.warn("❗ Élément #productTable non trouvé dans le DOM.");
    return;
  }

  fetch('/api/products')
    .then(res => {
      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      table.innerHTML = `<tr><th>ID</th><th>Nom</th><th>Prix</th><th>Action</th></tr>`;
      
      // Vider la map et la remplir avec les nouveaux produits
      productMap.clear();
      
      data.forEach(p => {
        // Stocker le produit dans la map
        productMap.set(p.id, p);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td>${p.name}</td>
          <td>${p.price}€</td>
          <td>
            <button class="btn-delete" onclick="deleteProduct(${p.id})">Supprimer</button>
            <button class="btn-edit" onclick="startEditFromMap(${p.id})">Modifier</button>
          </td>
        `;
        table.appendChild(tr);
      });
    })
    .catch(error => {
      console.error('Erreur lors du chargement des produits:', error);
      if (table) {
        table.innerHTML = `<tr><td colspan="4">Erreur lors du chargement des produits</td></tr>`;
      }
    });
}

function getSelectedAllergens() {
  const select = document.getElementById("allergens");
  const selected = Array.from(select.selectedOptions).map(option => option.value);
  return selected.join(",");
}

const productMap = new Map();

function addProduct() {
  const token = localStorage.getItem('token');
  const product = {
    name: document.getElementById('name').value,
    description: document.getElementById('description').value,
    price: parseFloat(document.getElementById('price').value),
    image: document.getElementById('image').value,
    category: document.getElementById('category').value,
    allergens: getSelectedAllergens(),
  };

  const url = isEditing ? `/api/products/${currentEditId}` : '/api/products';
  const method = isEditing ? 'PUT' : 'POST';

  fetch(url, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(product)
  })
  .then(res => {
    if (!res.ok) {
      throw new Error(`Erreur HTTP: ${res.status}`);
    }
    return res.json();
  })
  .then(() => {
    loadProducts();
    cancelEdit(); // Réinitialise tout
  })
  .catch(err => {
    console.error('Erreur lors de l’envoi du produit :', err);
  });
}

function deleteProduct(id) {
  const token = localStorage.getItem('token');
  fetch(`/api/products/${id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
  .then(res => {
    if (!res.ok) {
      throw new Error(`Erreur HTTP: ${res.status}`);
    }
    return res.json();
  })
  .then(() => loadProducts())
  .catch(err => {
    console.error('Erreur lors de la suppression du produit :', err);
  });
}

function startEdit(product) {
  document.getElementById('form-title').textContent = 'Modifier un produit';
  document.getElementById('name').value = product.name;
  document.getElementById('description').value = product.description;
  document.getElementById('price').value = product.price;
  document.getElementById('image').value = product.image;
  document.getElementById('category').value = product.category;

  const allergenSelect = document.getElementById('allergens');
  const allergensRaw = product.allergens || [];
  const allergenArray = Array.isArray(allergensRaw)
    ? allergensRaw
    : allergensRaw.split(',');

  Array.from(allergenSelect.options).forEach(option => {
    option.selected = allergenArray.includes(option.value);
  });

  document.getElementById('form-button').textContent = 'Modifier';
  document.getElementById('cancel-button').style.display = 'inline-block';
  isEditing = true;
  currentEditId = product.id;
}

function cancelEdit() {
  document.getElementById('form-title').textContent = 'Ajouter un produit';
  document.getElementById('name').value = '';
  document.getElementById('description').value = '';
  document.getElementById('price').value = '';
  document.getElementById('image').value = '';
  document.getElementById('category').value = '';
  const allergenSelect = document.getElementById('allergens');
  Array.from(allergenSelect.options).forEach(option => {
    option.selected = false;
  });

  document.getElementById('form-button').textContent = 'Ajouter';
  document.getElementById('cancel-button').style.display = 'none';
  isEditing = false;
  currentEditId = null;
}

window.onload = loadProducts;

function startEditFromMap(id) {
  const product = productMap.get(id);
  if (product) {
    startEdit(product);
  } else {
    console.error("Produit introuvable pour l'ID :", id);
  }
}

function updateCartTotalDisplay(cartTotal) {
  // Stocker le total de base (sans livraison)
  window.baseCartTotal = cartTotal;
  
  // Vérifier si la livraison est activée
  const deliveryCheckbox = document.getElementById('delivery-option');
  const deliveryEnabled = deliveryCheckbox ? deliveryCheckbox.checked : false;
  
  let finalTotal = cartTotal;
  if (deliveryEnabled) {
    finalTotal += 5.00;
  }
  
  document.getElementById('cart-total').textContent = `Total : ${finalTotal.toFixed(2)}€`;
}

function loadCart() {
  const token = getToken();
  const emptyMessage = document.getElementById('empty-cart-message');

  if (!token) {
    const tbody = document.getElementById('cart-body');
    tbody.innerHTML = `<tr><td colspan="5">Veuillez vous connecter pour voir votre panier.</td></tr>`;
    updateCartTotalDisplay(0);
    emptyMessage.style.display = "none";
    return;
  }

  fetch('https://demoresto.onrender.com/api/cart', {
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
  .then(res => {
    if (!res.ok) {
      throw new Error("Erreur lors de la récupération du panier.");
    }
    return res.json();
  })
  .then(data => {
    const tbody = document.getElementById('cart-body');
    let total = 0;
    tbody.innerHTML = '';

    if (data.length === 0) {
      emptyMessage.style.display = "block";
    } else {
      emptyMessage.style.display = "none";

      data.forEach(item => {
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;

        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${item.product.name}</td>
          <td>${item.quantity}</td>
          <td>${item.product.price.toFixed(2)}€</td>
          <td>${itemTotal.toFixed(2)}€</td>
          <td>
            <button class="btn-cart" onclick="changeQuantity(${item.id}, ${item.quantity}, 1)">+</button>
            <input type="number" class="quantity-input" value="${item.quantity}" min="1" max="30"
                   onchange="setQuantity(${item.id}, this.value)"
                   onkeydown="handleQuantityKey(event, ${item.id}, this.value)"/>
            <button class="btn-cart" onclick="changeQuantity(${item.id}, ${item.quantity}, -1)">-</button>
            <button class="btn-cart btn-delete" onclick="removeFromCart(${item.id})">Supprimer</button>
          </td>
        `;
        tbody.appendChild(row);
      });
    }

    // Mettre à jour le total global (avec ou sans livraison)
    updateCartTotalDisplay(total);
  })
  .catch(err => {
    console.error(err);
    const tbody = document.getElementById('cart-body');
    tbody.innerHTML = `<tr><td colspan="5">Erreur lors du chargement du panier.</td></tr>`;
    updateCartTotalDisplay(0);
    emptyMessage.style.display = "none";
  });
}

function toggleDelivery() {
  const deliveryCheckbox = document.getElementById('delivery-option');
  const deliveryForm = document.getElementById('delivery-form');
  const pickupCheckbox = document.getElementById('pickup-option');
  if (deliveryCheckbox.checked) {
    deliveryForm.classList.add('active');
    // Désactive l'autre option
    pickupCheckbox.checked = false;
    document.getElementById('pickup-form').classList.remove('active');
    clearPickupForm();
    // Date min aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('delivery-date').min = today;
  } else {
    deliveryForm.classList.remove('active');
    clearDeliveryForm();
  }
  updateCartTotalDisplay(window.baseCartTotal || 0);
}

function togglePickup() {
  const pickupCheckbox = document.getElementById('pickup-option');
  const pickupForm = document.getElementById('pickup-form');
  const deliveryCheckbox = document.getElementById('delivery-option');
  if (pickupCheckbox.checked) {
    pickupForm.classList.add('active');
    // Désactive l'autre option
    deliveryCheckbox.checked = false;
    document.getElementById('delivery-form').classList.remove('active');
    clearDeliveryForm();
    // Date min aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('pickup-date').min = today;
  } else {
    pickupForm.classList.remove('active');
    clearPickupForm();
  }
  updateCartTotalDisplay(window.baseCartTotal || 0);
}

function clearPickupForm() {
  const fields = [
    'pickup-date',
    'pickup-time'
  ];
  fields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) field.value = '';
  });
}

// Nouvelle validation combinée
function validateOrderChoice() {
  const deliveryChecked = document.getElementById('delivery-option').checked;
  const pickupChecked = document.getElementById('pickup-option').checked;
  if (!deliveryChecked && !pickupChecked) {
    showNotification("Veuillez choisir entre la livraison et le retrait sur place avant de continuer", "error");
    return false;
  }
  if (deliveryChecked) {
    return validateDeliveryForm();
  }
  if (pickupChecked) {
    // Validation des champs de retrait
    const date = document.getElementById('pickup-date').value;
    const time = document.getElementById('pickup-time').value;
    if (!date) {
      showNotification("Veuillez choisir une date de retrait", "error");
      document.getElementById('pickup-date').focus();
      return false;
    }
    if (!time) {
      showNotification("Veuillez choisir une heure de retrait", "error");
      document.getElementById('pickup-time').focus();
      return false;
    }
    // Date pas dans le passé
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) {
      showNotification("La date de retrait ne peut pas être dans le passé", "error");
      document.getElementById('pickup-date').focus();
      return false;
    }
    return true;
  }
  return false;
}

function getPickupInfo() {
  const pickupChecked = document.getElementById('pickup-option').checked;
  if (!pickupChecked) return null;
  return {
    date: document.getElementById('pickup-date').value,
    time: document.getElementById('pickup-time').value
  };
}

const confirmButton = document.getElementById("confirm-order-button");
if (confirmButton) {
  confirmButton.addEventListener("click", () => {
    // Nouvelle validation combinée
    if (!validateOrderChoice()) {
      return;
    }
    fetch('https://demoresto.onrender.com/api/cart', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + getToken()
      }
    })
    .then(res => res.json())
    .then(cart => {
      if (!cart || cart.length === 0) {
        showNotification("Votre panier est vide", "error");
      } else {
        const deliveryChecked = document.getElementById('delivery-option').checked;
        const pickupChecked = document.getElementById('pickup-option').checked;
        const baseTotal = window.baseCartTotal || 0;
        const deliveryFee = deliveryChecked ? 5.00 : 0;
        // Préparer les données de commande
        const orderData = {
          cart: cart,
          delivery: deliveryChecked ? getDeliveryInfo() : null,
          pickup: pickupChecked ? getPickupInfo() : null,
          baseTotal: baseTotal,
          deliveryFee: deliveryFee,
          finalTotal: baseTotal + deliveryFee
        };
        // Enregistrer les données pour la page paiement
        localStorage.setItem("cart", JSON.stringify(cart));
        localStorage.setItem("orderData", JSON.stringify(orderData));
        // Envoyer l'email de livraison si activée
        if (deliveryChecked) {
          sendDeliveryEmail(getDeliveryInfo(), cart);
          showNotification("Informations de livraison enregistrées !", "success");
        }
        // Rediriger vers la page de paiement
        setTimeout(() => {
          window.location.href = "paiement.html";
        }, 1000);
      }
    })
    .catch(err => {
      console.error("Erreur lors de la récupération du panier :", err);
      showNotification("Impossible de vérifier le panier", "error");
    });
  });
}


document.addEventListener("DOMContentLoaded", function() {
  const form = document.getElementById("form-contact");
  if (form) {
    form.addEventListener("submit", function(e) {
      e.preventDefault();
      const lastSubmission = parseInt(localStorage.getItem("lastContactTime"), 10);
      const nowTimestamp = Date.now();
      const spamTimeout = 10 * 60 * 1000;

      if (lastSubmission && nowTimestamp - lastSubmission < spamTimeout) {
        const remainingTime = spamTimeout - (nowTimestamp - lastSubmission);
        const minutes = Math.floor(remainingTime / 60000);
        const seconds = Math.floor((remainingTime % 60000) / 1000);

        showNotification(
          `Veuillez attendre encore ${minutes} minute${minutes !== 1 ? "s" : ""} et ${seconds} seconde${seconds !== 1 ? "s" : ""} avant de réserver à nouveau.`,
          "info"
        );
        return;
      }

      const formData = new FormData(this);

      showNotification("Envoi en cours...", "info");

      fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prenom: formData.get("prenom"),
          nom: formData.get("nom"),
          adresse: formData.get("email"),
          objet: formData.get("objet"),
          message: formData.get("message")
        })
      })
      .then(res => res.json().then(data => {
        if (res.ok) {
          localStorage.setItem("lastContactTime", Date.now().toString());
          showNotification(data.message || "La demande a été envoyée !");
          this.reset();
        } else {
          showNotification(data.error || "Une erreur est survenue.", "error");
        }
      }))
      .catch(err => {
        console.error(err);
        showNotification("Erreur lors de l'envoi du formulaire de contact.", "error");
      });
    });
  }
});

function updateEmptyCartMessage() {
  const cartBody = document.getElementById("cart-body");
  const emptyMessage = document.getElementById("empty-cart-message");

  if (cartBody.children.length === 0) {
    emptyMessage.style.display = "block";
  } else {
    emptyMessage.style.display = "none";
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  let horairesTemp = {};
  let horairesIncohérents = [];

  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  const formatTime = (time) => time.replace(':', 'h');

  async function loadSchedules() {
    const response = await fetch('/api/horaires.json');
    const horaires = await response.json();
    const scheduleFields = document.getElementById('schedule-fields');
    if (!scheduleFields) return;

    scheduleFields.innerHTML = '';

    for (const day of jours) {
      let s1 = "00:00", e1 = "00:00", s2 = "00:00", e2 = "00:00";
      const value = horaires[day];

      if (value && value !== "Fermé" && !value.includes("erreur")) {
        const [part1, part2] = value.split('/');
        const [h1, h2] = part1.trim().split('-').map(t => t.trim().replace('h', ':'));
        s1 = h1;
        e1 = h2;
        if (part2) {
          const [h3, h4] = part2.trim().split('-').map(t => t.trim().replace('h', ':'));
          s2 = h3;
          e2 = h4;
        }
      }

      scheduleFields.innerHTML += `
        <div class="day-block">
          <label>${day} :</label>
          <input type="time" name="${day}-start1" value="${s1}" required>
          <input type="time" name="${day}-end1" value="${e1}" required>
          <span>/</span>
          <input type="time" name="${day}-start2" value="${s2}" required>
          <input type="time" name="${day}-end2" value="${e2}" required>
        </div>
      `;
    }
  }

  function showConfirmationNotification(joursIncohérents) {
    const message = `
      <p>Êtes-vous sûr des horaires mis pour les jours suivants ?</p>
      <ul>
        ${joursIncohérents.map(jour => `<li><strong>${jour}</strong> : ${horairesTemp[jour]}</li>`).join('')}
      </ul>
      <div class="notif-buttons">
        <button id="confirmer-incoherences">Valider quand même</button>
        <button id="annuler-incoherences">Modifier</button>
      </div>
    `;

    const notif = document.createElement('div');
    notif.classList.add('notification1', 'visible');
    notif.innerHTML = message;
    document.body.appendChild(notif);

    document.getElementById('confirmer-incoherences').onclick = async () => {
      document.body.removeChild(notif);
      await enregistrerHoraires(horairesTemp);
    };

    document.getElementById('annuler-incoherences').onclick = () => {
      document.body.removeChild(notif);
    };
  }

  async function enregistrerHoraires(horaires) {
    await fetch('/api/update-horaires', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(horaires),
    });
    showNotification("Horaires mis à jour !","success");
  }

  const scheduleForm = document.getElementById('schedule-form');
  if (scheduleForm) {
    loadSchedules();

    scheduleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const horaires = {};
      horairesIncohérents = [];

      for (const day of jours) {
        const s1 = formData.get(`${day}-start1`);
        const e1 = formData.get(`${day}-end1`);
        const s2 = formData.get(`${day}-start2`);
        const e2 = formData.get(`${day}-end2`);

        if ([s1, e1, s2, e2].every(t => t === '00:00')) {
          horaires[day] = "Fermé";
          continue;
        }

        const mS1 = toMinutes(s1);
        const mE1 = toMinutes(e1);
        const mS2 = toMinutes(s2);
        const mE2 = toMinutes(e2);

        let isIncohérent = false;
        if (
          mS1 >= mE1 || mS2 >= mE2 ||
          (mS2 > 0 && mS2 < mE1) ||
          mS1 < 360 || // avant 6h du matin
          mS2 < 360
        ) {
          isIncohérent = true;
        }

        const part1 = `${formatTime(s1)}-${formatTime(e1)}`;
        const part2 = `${formatTime(s2)}-${formatTime(e2)}`;
        let horaire;

        if (mS2 === 0 && mE2 === 0) {
          horaire = part1;
        } else if (mE1 === mS2) {
          horaire = `${formatTime(s1)}-${formatTime(e2)}`;
        } else {
          horaire = `${part1}/${part2}`;
        }

        horaires[day] = horaire;
        if (isIncohérent) {
          horairesIncohérents.push(day);
        }
      }

      horairesTemp = horaires;

      if (horairesIncohérents.length > 0) {
        showConfirmationNotification(horairesIncohérents);
      } else {
        await enregistrerHoraires(horaires);
      }
    });
  }

  if (document.getElementById('opening-hours')) {
    loadHorairesContact();
  }

  async function loadHorairesContact() {
    const response = await fetch('/api/horaires.json');
    const horaires = await response.json();
    const container = document.getElementById('opening-hours');
    if (!container) return;

    container.innerHTML = '';
    for (const day of jours) {
      container.innerHTML += `<p><strong>${day}</strong> : ${horaires[day]}</p>`;
    }
  }
});

let currentUserData = null;
let userAuthenticationToken = null;

// Fonction pour récupérer le token d'authentification
function getUserAuthenticationToken() {
  return localStorage.getItem("token");
}

// Fonction pour vérifier l'authentification utilisateur
async function verifyUserAuthentication() {
  const token = getUserAuthenticationToken();
  
  if (!token) {
    displayErrorMessage("Vous devez être connecté pour accéder à cette page.");
    setTimeout(() => {
      redirectToLoginPage();
    }, 2000);
    return false;
  }

  try {
    const response = await fetch("https://demoresto.onrender.com/api/verify-token", {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("token");
        localStorage.removeItem("username");
        displayErrorMessage("Votre session a expiré. Veuillez vous reconnecter.");
        setTimeout(() => {
          redirectToLoginPage();
        }, 2000);
        return false;
      }
      throw new Error(`Erreur ${response.status}: ${response.statusText}`);
    }

    const userData = await response.json();
    console.log("Réponse de vérification:", userData);
    
    // Stocker les données utilisateur
    currentUserData = {
      username: userData.username,
      role: userData.role,
      is_admin: userData.role === 'admin'
    };

    return true;

  } catch (error) {
    console.error("Erreur de vérification:", error);
    displayErrorMessage("Erreur de connexion. Veuillez vous reconnecter.");
    setTimeout(() => {
      redirectToLoginPage();
    }, 2000);
    return false;
  }
}

// Fonction pour afficher les informations de l'utilisateur
function displayUserProfileInformation() {
  if (!currentUserData) {
    console.error("Aucune donnée utilisateur disponible");
    return;
  }

  document.getElementById('username-info-display').textContent = currentUserData.username;
  document.getElementById('user-role-display').textContent = currentUserData.role;
  document.getElementById('profile-welcome-message').textContent = `Bienvenue, ${currentUserData.username}!`;
  
  // Afficher l'initiale du nom d'utilisateur dans l'avatar
  document.getElementById('user-avatar-display').textContent = currentUserData.username.charAt(0).toUpperCase();

  // Afficher le lien admin si l'utilisateur est admin
  if (currentUserData.is_admin) {
    document.getElementById('admin-link').style.display = 'inline-block';
  }

  // Afficher la date/heure actuelle comme dernière connexion
  document.getElementById('last-login-timestamp').textContent = new Date().toLocaleString('fr-FR');
  
  // Mettre à jour le statut utilisateur dans la navigation
  document.getElementById('user-status').textContent = `Connecté: ${currentUserData.username}`;
}

// Fonction pour afficher un message d'erreur
function displayErrorMessage(message) {
  document.getElementById('profile-loading-state').style.display = 'none';
  document.getElementById('profile-content-section').style.display = 'none';
  const errorElement = document.getElementById('profile-error-display');
  errorElement.textContent = message;
  errorElement.style.display = 'block';
}

// Fonction pour rediriger vers la page de connexion
function redirectToLoginPage() {
  window.location.href = "login.html";
}

// Fonctions de navigation
function navigateToMenu() {
  window.location.href = "menu.html";
}

function navigateToCart() {
  window.location.href = "panier.html";
}

// Initialisation au chargement de la page
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Page chargée, vérification de l'authentification...");
  
  const isUserAuthenticated = await verifyUserAuthentication();
  console.log("Utilisateur authentifié:", isUserAuthenticated);
  
  if (isUserAuthenticated) {
    document.getElementById('profile-loading-state').style.display = 'none';
    document.getElementById('profile-content-section').style.display = 'block';
    displayUserProfileInformation();
  }
});

let inactivityTimer;
const INACTIVITY_LIMIT = 20 * 60 * 1000; // 20 minutes

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    // Supprimer le token et rediriger l'utilisateur vers la page de connexion
    localStorage.removeItem("token");
    showNotification("Vous avez été déconnecté pour cause d'inactivité.", "error");
    window.location.href = "login.html"; // à adapter selon ton appli
  }, INACTIVITY_LIMIT);
}

// Événements utilisateur qui réinitialisent le timer
["mousemove", "keydown", "click", "scroll"].forEach(event => {
  document.addEventListener(event, resetInactivityTimer);
});

resetInactivityTimer(); // Lancer le timer au chargement de la page

function validateDeliveryForm() {
  const email = document.getElementById('delivery-email').value.trim();
  const phone = document.getElementById('delivery-phone').value.trim();
  const address = document.getElementById('delivery-address').value.trim();
  const date = document.getElementById('delivery-date').value;
  const time = document.getElementById('delivery-time').value;

  if (!email) {
    showNotification("Veuillez saisir votre email pour la livraison.", "error");
    document.getElementById('delivery-email').focus();
    return false;
  }
  if (!phone) {
    showNotification("Veuillez saisir votre numéro de téléphone pour la livraison.", "error");
    document.getElementById('delivery-phone').focus();
    return false;
  }
  if (!address) {
    showNotification("Veuillez saisir votre adresse de livraison.", "error");
    document.getElementById('delivery-address').focus();
    return false;
  }
  if (!date) {
    showNotification("Veuillez choisir une date de livraison.", "error");
    document.getElementById('delivery-date').focus();
    return false;
  }
  if (!time) {
    showNotification("Veuillez choisir une heure de livraison.", "error");
    document.getElementById('delivery-time').focus();
    return false;
  }
  // Date pas dans le passé
  const selectedDate = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (selectedDate < today) {
    showNotification("La date de livraison ne peut pas être dans le passé", "error");
    document.getElementById('delivery-date').focus();
    return false;
  }
  return true;
}

