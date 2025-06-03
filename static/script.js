// --- SLIDER ---
// Gère l'affichage automatique des slides sur la page d'accueil
const slides = document.querySelectorAll('.slide');
let index = 0;
function showSlide(i) {
  slides.forEach((slide, idx) => slide.classList.toggle('active', idx === i));
}
function nextSlide() {
  index = (index + 1) % slides.length;
  showSlide(index);
}
setInterval(nextSlide, 4000);

// --- MENU BURGER (mobile) ---
// Affiche/masque la navigation latérale sur mobile
document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.querySelector('.menu-toggle');
  const navLeft = document.querySelector('.nav-left');
  toggleButton.addEventListener('click', () => navLeft.classList.toggle('show'));
});

// --- AUTHENTIFICATION ---
// Gestion du token utilisateur dans le localStorage
function getToken() { return localStorage.getItem('token'); }
function setToken(token) { localStorage.setItem('token', token); }

// Déconnexion utilisateur, redirige si admin sur page admin
function logout() {
  const token = getToken();
  const currentPage = window.location.pathname;
  let wasAdmin = false;
  if (token) {
    fetch('https://demoresto.onrender.com/api/verify-token', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => res.ok ? res.json() : null)
    .then(data => { if (data && data.role === 'admin') wasAdmin = true; })
    .finally(() => {
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
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    updateAuthButton();
    const status = document.getElementById('user-status');
    if (status) status.innerText = '';
    location.reload();
  }
}

// Met à jour le bouton Connexion/Déconnexion selon l'état utilisateur
function updateAuthButton() {
  const btn = document.getElementById('auth-button');
  const status = document.getElementById('user-status');
  const username = localStorage.getItem('username');
  const token = getToken();
  if (!btn) return;
  if (username && token) {
    fetch('https://demoresto.onrender.com/api/verify-token', {
      headers: { 'Authorization': 'Bearer ' + token }
    })
    .then(res => {
      if (res.ok) {
        res.json().then(data => {
          btn.textContent = 'Déconnexion';
          btn.onclick = logout;
          if (status) status.innerText = `Connecté à : ${username}`;
          if (data.role === 'admin') {
            const adminLink = document.getElementById('admin-link');
            if (adminLink) adminLink.style.display = 'inline-block';
          }
        });
      } else {
        logout();
      }
    })
    .catch(() => logout());
  } else {
    btn.textContent = 'Connexion';
    btn.onclick = () => window.location.href = 'login.html';
    if (status) status.innerText = 'Déconnecté';
  }
}
window.addEventListener('DOMContentLoaded', updateAuthButton);

// --- PANIER ---
// Chargement du panier si sur la page panier
if (window.location.pathname.includes('panier.html')) loadCart();

// Met à jour la quantité d'un article dans le panier
function setQuantity(itemId, newQuantity) {
  newQuantity = parseInt(newQuantity);
  if (isNaN(newQuantity)) { loadCart(); return; }
  updateCart(itemId, newQuantity);
}

// Incrémente/décrémente la quantité d'un article
function changeQuantity(itemId, currentQuantity, delta) {
  let newQuantity = Math.max(1, Math.min(30, currentQuantity + delta));
  updateCart(itemId, newQuantity);
}

// Met à jour la quantité côté serveur et recharge le panier
function updateCart(cartItemId, newQuantity) {
  if (newQuantity > 30 || newQuantity < 1) {
    const input = document.querySelector(`input.quantity-input[onchange*="setQuantity(${cartItemId}"]`);
    if (input) input.value = Math.max(1, Math.min(30, newQuantity));
    return;
  }
  fetch(`https://demoresto.onrender.com/api/cart/${cartItemId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + getToken()
    },
    body: JSON.stringify({ quantity: newQuantity })
  })
  .then(res => res.json())
  .then(() => loadCart());
}

// Vide tous les articles du panier côté serveur et localStorage
async function clearCartItems() {
  const cart = JSON.parse(localStorage.getItem('cart')) || [];
  if (cart.length === 0) return Promise.resolve();
  const deletePromises = cart.map(item =>
    fetch(`https://demoresto.onrender.com/api/cart/${item.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + getToken() }
    })
  );
  await Promise.all(deletePromises);
  localStorage.removeItem('cart');
  return Promise.resolve();
}

// Supprime un article du panier
function removeFromCart(cartItemId) {
  fetch(`https://demoresto.onrender.com/api/cart/${cartItemId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + getToken() }
  })
  .then(() => location.reload());
}

// --- NOTIFICATIONS ---
// Affiche une notification temporaire
function showNotification(message, type = "success") {
  const notif = document.getElementById('notification');
  const msg = document.getElementById('notification-message');
  if (!notif || !msg) return;
  msg.innerText = message;
  notif.classList.remove('hidden', 'success', 'error', 'info');
  notif.classList.add(type);
  setTimeout(hideNotification, 4000);
}
function hideNotification() {
  const notif = document.getElementById('notification');
  if (notif) notif.classList.add('hidden');
}

// --- LOGIN ---
// Connexion utilisateur, stockage du token et redirection selon le rôle
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
          headers: { 'Authorization': 'Bearer ' + data.access_token }
        });
        const info = await roleRes.json();
        window.location.href = info.role === 'admin' ? "/admin.html" : "/index.html";
      }
    } else {
      showNotification(data.message || "Échec de la connexion.", "error");
    }
  } catch (err) {
    console.error("Erreur lors de la connexion :", err);
    showNotification("Erreur de connexion au serveur.", "error");
  }
}

// --- FILTRES PRODUITS ---
// Récupère les filtres actifs (tags, allergènes, recherche
function getActiveFilters() {
  const filters = { tags: [], allergens: [] };
  document.querySelectorAll('.filter-tag:checked').forEach(cb => filters.tags.push(cb.value));
  document.querySelectorAll('.filter-allergen:checked').forEach(cb => filters.allergens.push(cb.value));
  // Ajout : mot-clé de recherche
  const searchInput = document.getElementById('menu-search-input');
  filters.search = searchInput ? searchInput.value.trim().toLowerCase() : "";
  return filters;
}

// Vérifie si un produit correspond aux filtres actifs (tags, allergènes, recherche)
function productMatchesFilters(product, filters) {
  // Recherche par mot-clé (dans le nom ou la description)
  if (filters.search && filters.search.length > 0) {
    const name = (product.name || "").toLowerCase();
    const desc = (product.description || "").toLowerCase();
    if (!name.includes(filters.search) && !desc.includes(filters.search)) {
      return false;
    }
  }
  if (filters.tags.length === 0 && filters.allergens.length === 0) return true;
  if (filters.tags.length > 0 && !filters.tags.some(tag => (product.tags || []).includes(tag))) return false;
  if (filters.allergens.length > 0 && filters.allergens.some(allergen => (product.allergens || []).includes(allergen))) return false;
  return true;
}

// --- TOP PRODUITS (populaires) ---
let topProductIds = [];
async function fetchTopProducts() {
  try {
    const res = await fetch('/api/products/top');
    if (res.ok) {
      topProductIds = await res.json();
    } else {
      topProductIds = [];
    }
  } catch (e) {
    topProductIds = [];
  }
}

// Rafraîchit la liste des produits selon les filtres et la recherche
async function fetchAndRenderProducts() {
  await fetchTopProducts();
  fetch('https://demoresto.onrender.com/api/products')
    .then(response => response.json())
    .then(products => {
      const menuContainer = document.getElementById('menu-container');
      if (!menuContainer) { console.warn("Élément #menu-container non trouvé"); return; }
      menuContainer.innerHTML = '';
      const categories = { entree: [], plat: [], dessert: [], boisson: [] };
      const filters = getActiveFilters();
      products.forEach(product => {
        if (!product.is_active) return; // Ne pas afficher les produits inactifs
        if (!productMatchesFilters(product, filters)) return;
        const cat = product.category?.toLowerCase();
        if (cat && categories[cat]) categories[cat].push(product);
      });
      const hasProducts = Object.values(categories).some(items => items.length > 0);
      const noProductsMessage = document.getElementById('no-products-message');
      if (noProductsMessage) {
        noProductsMessage.style.display = hasProducts ? 'none' : 'block';
        if (!hasProducts) return;
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
          // --- Ajout de l'icône "🔥" si produit populaire ---
          if (topProductIds.includes(product.id)) {
            name.innerHTML = `${product.name} <span title="Plat populaire" style="font-size:1.1em;">🔥</span>`;
          } else {
            name.textContent = product.name;
          }
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
      attachCartEventListeners();
    })
    .catch(error => console.error('Erreur lors du chargement des produits:', error));
}

// Ajoute les listeners sur les boutons "Ajouter au panier"
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
        headers: { 'Authorization': 'Bearer ' + getToken() }
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
                try { const err = await res.json(); if (err.error) errorMsg = err.error; } catch { }
                if (res.status === 401) {
                  showNotification("Veuillez vous connecter ou créer un compte pour ajouter un produit au panier.");
                } else {
                  showNotification(errorMsg, "error");
                }
                return;
              }
              const data = await res.json();
              showNotification(data.message || "Produit ajouté au panier !", "success");
            });
        })
        .catch(error => console.error(error));
    });
  });
}

// --- INITIALISATION DES FILTRES ET MENU ---
// Gestion du dropdown de filtres et des listeners de filtres
document.addEventListener('DOMContentLoaded', function () {
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

  // Ajout : gestion de la barre de recherche dynamique
  const searchInput = document.getElementById('menu-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function () {
      fetchAndRenderProducts();
    });
  }

  // --- Allergènes auto : si connecté, coche les filtres selon le profil ---
  const token = localStorage.getItem('token');
  if (token && window.location.pathname.includes('menu.html')) {
    fetch('https://demoresto.onrender.com/api/user/profile', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    .then(res => res.ok ? res.json() : null)
    .then(user => {
      if (user && user.allergenes_exclus && Array.isArray(user.allergenes_exclus)) {
        user.allergenes_exclus.forEach(allergene => {
          const cb = Array.from(document.querySelectorAll('.filter-allergen')).find(c => c.value === allergene);
          if (cb) cb.checked = true;
        });
        fetchAndRenderProducts();
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', fetchAndRenderProducts);

// --- UTILITAIRE ---
// Met la première lettre en majuscule
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// --- ADMINISTRATION PRODUITS ---
// Chargement des produits pour l'admin
if (window.location.pathname.endsWith('admin.html')) loadProducts();

let isEditing = false;
let currentEditId = null;
const productMap = new Map();

// Charge les produits dans le tableau admin
function loadProducts() {
  const table = document.getElementById('productTable');
  if (!table) {
    console.warn("❗ Élément #productTable non trouvé dans le DOM.");
    return;
  }

  fetch('/api/products', {
    headers: {
      'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
    }
  })
    .then(res => {
      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      table.innerHTML = `<tr><th>ID</th><th>Nom</th><th>Prix</th><th>Statut</th><th>Action</th></tr>`;
      productMap.clear();
      data.forEach(p => {
        productMap.set(p.id, p);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td>${p.name}</td>
          <td>${p.price}€</td>
          <td>
            <span style="color:${p.is_active ? '#2e7d32' : '#d32f2f'};font-weight:bold;">
              ${p.is_active ? 'Actif' : 'Inactif'}
            </span>
          </td>
          <td>
            <button class="btn-delete" onclick="deleteProduct(${p.id})">Supprimer</button>
            <button class="btn-edit" onclick="startEditFromMap(${p.id})">Modifier</button>
            <button class="btn-toggle-active" onclick="toggleProductActive(${p.id})">
              ${p.is_active ? 'Désactiver' : 'Réactiver'}
            </button>
          </td>
        `;
        table.appendChild(tr);
      });
    })
    .catch(error => {
      console.error('Erreur lors du chargement des produits:', error);
      if (table) {
        table.innerHTML = `<tr><td colspan="5">Erreur lors du chargement des produits</td></tr>`;
      }
    });
}

// Désactive/réactive un produit (admin)
function toggleProductActive(id) {
  const token = localStorage.getItem('token');
  fetch(`/api/products/${id}/toggle-active`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token
    }
  })
    .then(async res => {
      if (!res.ok) {
        // Affiche une erreur plus claire si la méthode n'est pas autorisée
        const text = await res.text();
        console.error('Erreur HTTP:', res.status, text);
        showNotification("Erreur lors du changement de statut du produit", "error");
        return;
      }
      // Essaye de parser le JSON, sinon recharge la liste
      try {
        await res.json();
      } catch (e) {}
      loadProducts();
    })
    .catch(err => {
      console.error('Erreur lors du changement de statut du produit :', err);
      showNotification("Erreur lors du changement de statut du produit", "error");
    });
}

// Récupère les allergènes sélectionnés dans le formulaire admin
function getSelectedAllergens() {
  const select = document.getElementById("allergens");
  const selected = Array.from(select.selectedOptions).map(option => option.value);
  return selected.join(",");
}

// Ajoute ou modifie un produit (admin)
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

// Supprime un produit (admin)
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

// Prépare le formulaire pour modification d'un produit (admin)
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

// Annule la modification en cours (admin)
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

// Lance l'édition depuis la map (admin)
function startEditFromMap(id) {
  const product = productMap.get(id);
  if (product) {
    startEdit(product);
  } else {
    console.error("Produit introuvable pour l'ID :", id);
  }
}

// --- PANIER (suite) ---
// Met à jour l'affichage du total panier (avec/sans livraison)
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

// Charge le panier de l'utilisateur
function loadCart() {
  const token = getToken();
  const emptyMessage = document.getElementById('empty-cart-message');

  if (!token) {
    const tbody = document.getElementById('cart-body');
    tbody.innerHTML = `<tr><td colspan="5">Veuillez vous connecter pour voir votre panier.</td></tr>`;
    updateCartTotalDisplay(0);
    if (emptyMessage) emptyMessage.style.display = "none";
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
      if (emptyMessage) emptyMessage.style.display = "block";
    } else {
      if (emptyMessage) emptyMessage.style.display = "none";

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
    if (emptyMessage) emptyMessage.style.display = "none";
  });
}

// --- LIVRAISON/RETRAIT ---
// Gère l'affichage des formulaires livraison/retrait et la validation des horaires
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

// --- HORAIRES OUVERTURE ---
// Gestion des horaires d'ouverture pour livraison/retrait
let horairesOuverture = {};
if (window.location.pathname.includes('panier.html')) {
  fetch('https://demoresto.onrender.com/api/horaires.json')
    .then(res => res.json())
    .then(data => {
      horairesOuverture = data;
      setupDeliveryPickupDateListeners();
    });
}

// Utilitaires horaires (conversion, parsing, validation)
function getDayName(dateStr) {
  const jours = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const date = new Date(dateStr);
  return jours[date.getDay()];
}
function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/^(\d{1,2})h(\d{2})$/);
  if (match) {
    const [, hours, minutes] = match;
    return `${hours.padStart(2, '0')}:${minutes}`;
  }
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  return null;
}
function parseHoraires(horaireStr) {
  if (!horaireStr || horaireStr === "Fermé") return null;
  const periods = [];
  const cleanedHoraire = horaireStr.replace(/\s+/g, ' ').trim();
  if (cleanedHoraire.includes('/')) {
    const parts = cleanedHoraire.split('/');
    for (const part of parts) {
      const times = part.trim().split(' - ');
      if (times.length === 2) {
        const start = parseTimeString(times[0].trim());
        const end = parseTimeString(times[1].trim());
        if (start && end) periods.push({ start, end });
      }
    }
  } else {
    const times = cleanedHoraire.split(' - ');
    if (times.length === 2) {
      const start = parseTimeString(times[0].trim());
      const end = parseTimeString(times[1].trim());
      if (start && end) periods.push({ start, end });
    }
  }
  return periods.length > 0 ? periods : null;
}
function isTimeInOpeningHours(selectedDate, selectedTime) {
  const dayName = getDayName(selectedDate);
  const horaireJour = horairesOuverture[dayName];
  if (!horaireJour || horaireJour === "Fermé") {
    return { valid: false, message: `Le restaurant est fermé le ${dayName.toLowerCase()}.` };
  }
  const periods = parseHoraires(horaireJour);
  if (!periods) {
    return { valid: false, message: `Horaires non disponibles pour le ${dayName.toLowerCase()}.` };
  }
  for (const period of periods) {
    if (selectedTime >= period.start && selectedTime <= period.end) {
      return { valid: true };
    }
  }
  const horaireDisplay = periods.map(p => `${p.start.replace(':', 'h')}-${p.end.replace(':', 'h')}`).join(' / ');
  return {
    valid: false,
    message: `L'heure sélectionnée n'est pas dans les horaires d'ouverture du ${dayName.toLowerCase()} (${horaireDisplay}).`
  };
}

// Désactive les heures non valides dans le select selon la date
function filterTimeOptions(dateInputId, timeSelectId, infoId) {
  const dateInput = document.getElementById(dateInputId);
  const timeSelect = document.getElementById(timeSelectId);
  const infoElem = infoId ? document.getElementById(infoId) : null;
  if (!dateInput || !timeSelect) return;
  if (!dateInput.value) {
    if (infoElem) infoElem.textContent = "Sélectionnez une date pour voir les horaires d'ouverture.";
    Array.from(timeSelect.options).forEach(opt => opt.disabled = false);
    return;
  }
  const dayName = getDayName(dateInput.value);
  const horaireJour = horairesOuverture[dayName];
  if (!horaireJour || horaireJour === "Fermé") {
    if (infoElem) {
      infoElem.textContent = `Le restaurant est fermé le ${dayName.toLowerCase()}.`;
      infoElem.style.color = "#d32f2f";
    }
    Array.from(timeSelect.options).forEach(opt => {
      if (opt.value) opt.disabled = true;
    });
    return;
  }
  if (infoElem) {
    infoElem.textContent = `Horaires d'ouverture le ${dayName.toLowerCase()} : ${horaireJour}`;
    infoElem.style.color = "#2e7d32";
  }
  const periods = parseHoraires(horaireJour);
  Array.from(timeSelect.options).forEach(opt => {
    if (!opt.value) {
      opt.disabled = false;
      return;
    }
    let valid = false;
    for (const period of periods) {
      if (opt.value >= period.start && opt.value <= period.end) {
        valid = true;
        break;
      }
    }
    opt.disabled = !valid;
  });
}

// Ajoute les listeners sur les inputs date pour livraison/retrait
function setupDeliveryPickupDateListeners() {
  // Livraison
  const deliveryDate = document.getElementById('delivery-date');
  const deliveryTime = document.getElementById('delivery-time');
  if (deliveryDate && deliveryTime) {
    deliveryDate.addEventListener('change', () => {
      filterTimeOptions('delivery-date', 'delivery-time', 'delivery-date-info');
      updateTimeOptions('delivery-date', 'delivery-time');
    });
    deliveryTime.addEventListener('focus', () => updateTimeOptions('delivery-date', 'delivery-time'));
    // Ajout d'un message info sous la date livraison
    if (!document.getElementById('delivery-date-info')) {
      const info = document.createElement('div');
      info.id = 'delivery-date-info';
      info.className = 'horaires-info';
      deliveryDate.parentNode.appendChild(info);
    }
    // Initialiser au chargement
    filterTimeOptions('delivery-date', 'delivery-time', 'delivery-date-info');
    updateTimeOptions('delivery-date', 'delivery-time');
  }
  // Retrait
  const pickupDate = document.getElementById('pickup-date');
  const pickupTime = document.getElementById('pickup-time');
  if (pickupDate && pickupTime) {
    pickupDate.addEventListener('change', () => {
      filterTimeOptions('pickup-date', 'pickup-time', 'pickup-date-info');
      updateTimeOptions('pickup-date', 'pickup-time');
    });
    pickupTime.addEventListener('focus', () => updateTimeOptions('pickup-date', 'pickup-time'));
    if (!document.getElementById('pickup-date-info')) {
      const info = document.createElement('div');
      info.id = 'pickup-date-info';
      info.className = 'horaires-info';
      pickupDate.parentNode.appendChild(info);
    }
    filterTimeOptions('pickup-date', 'pickup-time', 'pickup-date-info');
    updateTimeOptions('pickup-date', 'pickup-time');
  }
}

// --- QUOTA COMMANDES/HEURE (ADMIN) ---
document.addEventListener('DOMContentLoaded', function () {
  const quotaForm = document.getElementById('order-quota-form');
  const quotaInput = document.getElementById('max-orders-per-hour');
  const quotaMsg = document.getElementById('order-quota-message');
  if (quotaForm && quotaInput) {
    // Charger la valeur actuelle
    fetch('/api/order-quota', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    })
      .then(res => res.json())
      .then(data => {
        quotaInput.value = data.max_orders_per_hour || 3;
      });
    quotaForm.addEventListener('submit', function (e) {
      e.preventDefault();
      fetch('/api/order-quota', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + (localStorage.getItem('token') || '')
        },
        body: JSON.stringify({ max_orders_per_hour: quotaInput.value })
      })
        .then(res => res.json())
        .then(data => {
          quotaMsg.textContent = "Quota enregistré : " + data.max_orders_per_hour + " commandes/heure";
          setTimeout(() => quotaMsg.textContent = "", 3000);
        });
    });
  }
});

// --- QUOTA COMMANDES/HEURE (PANIER) ---
let maxOrdersPerHour = 3; // Valeur par défaut, sera chargée dynamiquement

async function fetchMaxOrdersPerHour() {
  try {
    const res = await fetch('/api/order-quota', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    if (res.ok) {
      const data = await res.json();
      maxOrdersPerHour = data.max_orders_per_hour || 3;
    }
  } catch (e) {}
}

// Désactive les heures pleines pour une date donnée (livraison ou retrait)
async function updateTimeOptions(dateInputId, timeSelectId) {
  await fetchMaxOrdersPerHour();
  const dateInput = document.getElementById(dateInputId);
  const timeSelect = document.getElementById(timeSelectId);
  if (!dateInput || !timeSelect || !dateInput.value) return;
  const options = Array.from(timeSelect.options).filter(opt => opt.value);
  await Promise.all(options.map(async opt => {
    try {
      const res = await fetch(`/api/orders/count?date=${encodeURIComponent(dateInput.value)}&time=${encodeURIComponent(opt.value)}`, {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
      });
      if (res.ok) {
        const data = await res.json();
        opt.disabled = (data.count >= maxOrdersPerHour);
        // Optionnel : indiquer "complet" dans le texte
        if (opt.disabled && !opt.textContent.includes(' (complet)')) {
          opt.textContent = opt.textContent.replace(' (complet)', '') + ' (complet)';
        } else if (!opt.disabled) {
          opt.textContent = opt.textContent.replace(' (complet)', '');
        }
      }
    } catch (e) {}
  }));
}

// --- Ajout dans setupDeliveryPickupDateListeners ---
function setupDeliveryPickupDateListeners() {
  // Livraison
  const deliveryDate = document.getElementById('delivery-date');
  const deliveryTime = document.getElementById('delivery-time');
  if (deliveryDate && deliveryTime) {
    deliveryDate.addEventListener('change', () => {
      filterTimeOptions('delivery-date', 'delivery-time', 'delivery-date-info');
      updateTimeOptions('delivery-date', 'delivery-time');
    });
    deliveryTime.addEventListener('focus', () => updateTimeOptions('delivery-date', 'delivery-time'));
    // Ajout d'un message info sous la date livraison
    if (!document.getElementById('delivery-date-info')) {
      const info = document.createElement('div');
      info.id = 'delivery-date-info';
      info.className = 'horaires-info';
      deliveryDate.parentNode.appendChild(info);
    }
    // Initialiser au chargement
    filterTimeOptions('delivery-date', 'delivery-time', 'delivery-date-info');
    updateTimeOptions('delivery-date', 'delivery-time');
  }
  // Retrait
  const pickupDate = document.getElementById('pickup-date');
  const pickupTime = document.getElementById('pickup-time');
  if (pickupDate && pickupTime) {
    pickupDate.addEventListener('change', () => {
      filterTimeOptions('pickup-date', 'pickup-time', 'pickup-date-info');
      updateTimeOptions('pickup-date', 'pickup-time');
    });
    pickupTime.addEventListener('focus', () => updateTimeOptions('pickup-date', 'pickup-time'));
    if (!document.getElementById('pickup-date-info')) {
      const info = document.createElement('div');
      info.id = 'pickup-date-info';
      info.className = 'horaires-info';
      pickupDate.parentNode.appendChild(info);
    }
    filterTimeOptions('pickup-date', 'pickup-time', 'pickup-date-info');
    updateTimeOptions('pickup-date', 'pickup-time');
  }
}

// --- QUOTA COMMANDES/HEURE (PANIER) ---
// Vérifie si un créneau horaire est disponible (nombre de commandes < quota)
async function isTimeSlotAvailable(date, time, cb) {
  fetchMaxOrdersPerHour().then(() => {
    fetch(`/api/orders/count?date=${encodeURIComponent(date)}&time=${encodeURIComponent(time)}`, {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    })
      .then(res => res.json())
      .then(data => {
        cb(data.count < maxOrdersPerHour);
      })
      .catch(() => cb(true));
  });
}

// --- VALIDATION FORMULAIRE LIVRAISON ---
function validateDeliveryForm() {
  const email = document.getElementById('delivery-email').value.trim();
  const phone = document.getElementById('delivery-phone').value.trim();
  const address = document.getElementById('delivery-address').value.trim();
  const postal = document.getElementById('delivery-postal').value.trim();
  const city = document.getElementById('delivery-city').value.trim();
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
    showNotification("Veuillez saisir votre adresse (numéro et rue) pour la livraison.", "error");
    document.getElementById('delivery-address').focus();
    return false;
  }
  if (!postal) {
    showNotification("Veuillez saisir votre code postal pour la livraison.", "error");
    document.getElementById('delivery-postal').focus();
    return false;
  }
  if (!city) {
    showNotification("Veuillez saisir votre ville pour la livraison.", "error");
    document.getElementById('delivery-city').focus();
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

// --- VALIDATION COMMANDE ---
function validateOrderChoice() {
  const deliveryChecked = document.getElementById('delivery-option').checked;
  const pickupChecked = document.getElementById('pickup-option').checked;
  if (!deliveryChecked && !pickupChecked) {
    showNotification("Veuillez choisir entre la livraison et le retrait sur place avant de continuer", "error");
    return false;
  }
  if (deliveryChecked) {
    const date = document.getElementById('delivery-date').value;
    const time = document.getElementById('delivery-time').value;
    // Vérification horaires ouverture
    const horaireCheck = isTimeInOpeningHours(date, time);
    if (!horaireCheck.valid) {
      showNotification(horaireCheck.message, "error");
      document.getElementById('delivery-time').focus();
      return false;
    }
    // Vérification du quota commandes/heure
    // --- AJOUT ---
    let valid = false;
    isTimeSlotAvailable(date, time, function (ok) {
      if (!ok) {
        showNotification("Le nombre maximum de commandes pour cette heure a été atteint. Veuillez choisir une autre heure.", "error");
        document.getElementById('delivery-time').focus();
        valid = false;
      } else {
        valid = validateDeliveryForm();
      }
    });
    // On retourne false pour bloquer la validation synchrone, la suite sera gérée dans le bouton de confirmation
    return false;
    // --- FIN AJOUT ---
  }
  if (pickupChecked) {
    const date = document.getElementById('pickup-date').value;
    const time = document.getElementById('pickup-time').value;
    // Vérification horaires ouverture
    const horaireCheck = isTimeInOpeningHours(date, time);
    if (!horaireCheck.valid) {
      showNotification(horaireCheck.message, "error");
      document.getElementById('pickup-time').focus();
      return false;
    }
    // Vérification du quota commandes/heure
    // --- AJOUT ---
    let valid = false;
    isTimeSlotAvailable(date, time, function (ok) {
      if (!ok) {
        showNotification("Le nombre maximum de commandes pour cette heure a été atteint. Veuillez choisir une autre heure.", "error");
        document.getElementById('pickup-time').focus();
        valid = false;
      } else {
        valid = true;
      }
    });
    return false;
    // --- FIN AJOUT ---
  }
  return false;
}

// --- Modification du bouton de confirmation pour gérer l'asynchronicité du quota ---
const confirmButton = document.getElementById("confirm-order-button");
if (confirmButton) {
  confirmButton.addEventListener("click", () => {
    const deliveryChecked = document.getElementById('delivery-option').checked;
    const pickupChecked = document.getElementById('pickup-option').checked;
    let date = "", time = "";
    if (deliveryChecked) {
      date = document.getElementById('delivery-date').value;
      time = document.getElementById('delivery-time').value;
    } else if (pickupChecked) {
      date = document.getElementById('pickup-date').value;
      time = document.getElementById('pickup-time').value;
    }
    if (!date || !time) {
      showNotification("Veuillez choisir une date et une heure.", "error");
      return;
    }
    isTimeSlotAvailable(date, time, function (ok) {
      if (!ok) {
        showNotification("Le nombre maximum de commandes pour cette heure a été atteint. Veuillez choisir une autre heure.", "error");
        return;
      }
      // Nouvelle validation combinée
      // On relance la validation classique (qui vérifiera aussi les autres champs)
      let valid = true;
      if (deliveryChecked) valid = validateDeliveryForm();
      // Pour le retrait, pas de formulaire à valider
      if (!valid) return;
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
          window.location.href = "paiement.html";
        }
      })
      .catch(err => {
        console.error("Erreur lors de la récupération du panier :", err);
        showNotification("Impossible de vérifier le panier", "error");
      });
    });
  });
}

// --- FORMULAIRE DE CONTACT ---
// Empêche le spam, envoie la demande de contact, affiche notification
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
          email: formData.get("email"),
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

// --- AFFICHAGE MESSAGE PANIER VIDE ---
function updateEmptyCartMessage() {
  const cartBody = document.getElementById("cart-body");
  const emptyMessage = document.getElementById("empty-cart-message");

  if (cartBody.children.length === 0) {
    emptyMessage.style.display = "block";
  } else {
    emptyMessage.style.display = "none";
  }
}

// --- HORAIRES (ADMIN & CONTACT) ---
// Gestion de l'affichage et modification des horaires d'ouverture
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

// --- VALIDATION FORMULAIRE LIVRAISON ---
function validateDeliveryForm() {
  const email = document.getElementById('delivery-email').value.trim();
  const phone = document.getElementById('delivery-phone').value.trim();
  const address = document.getElementById('delivery-address').value.trim();
  const postal = document.getElementById('delivery-postal').value.trim();
  const city = document.getElementById('delivery-city').value.trim();
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
    showNotification("Veuillez saisir votre adresse (numéro et rue) pour la livraison.", "error");
    document.getElementById('delivery-address').focus();
    return false;
  }
  if (!postal) {
    showNotification("Veuillez saisir votre code postal pour la livraison.", "error");
    document.getElementById('delivery-postal').focus();
    return false;
  }
  if (!city) {
    showNotification("Veuillez saisir votre ville pour la livraison.", "error");
    document.getElementById('delivery-city').focus();
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