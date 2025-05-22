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
  const allergenCheckboxes = document.querySelectorAll('.filter-allergen');
  const allergens = Array.from(allergenCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value.toLowerCase());
  return { allergens };
}

function productMatchesFilters(product, filters) {
  if (!filters.allergens || filters.allergens.length === 0) {
    return true;
  }

  const productAllergens = (product.allergens || []).map(a => a.toLowerCase());
  for (const allergen of filters.allergens) {
    if (productAllergens.includes(allergen)) {
      return false;
    }
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
      if (!hasProducts) {
        noProductsMessage.style.display = 'block'; // Affiche le message
        return;
      } else {
        noProductsMessage.style.display = 'none'; // Cache le message
      }

      for (const [category, items] of Object.entries(categories)) {
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
    });
}

document.addEventListener('DOMContentLoaded', function () {
  const dropdown = document.querySelector('.dropdown-filter');
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
    .then(res => res.json())
    .then(data => {
      table.innerHTML = `<tr><th>ID</th><th>Nom</th><th>Prix</th><th>Action</th></tr>`;
      
      data.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${p.id}</td>
          <td>${p.name}</td>
          <td>${p.price}</td>
          <td>
            <button onclick="deleteProduct(${p.id})">Supprimer</button>
            <button class="edit-button" data-product="${encodeURIComponent(JSON.stringify(p))}">Modifier</button>
          </td>
        `;
        table.appendChild(tr);
      });

      document.querySelectorAll('.edit-button').forEach(btn => {
        btn.addEventListener('click', () => {
          try {
            const encoded = btn.getAttribute('data-product');
            const decodedProduct = JSON.parse(decodeURIComponent(encoded));
            startEdit(decodedProduct);
          } catch (e) {
            console.error("Erreur lors du décodage du produit :", e);
          }
        });
      });
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

function loadCart() {
  const token = getToken();

  const emptyMessage = document.getElementById('empty-cart-message');

  if (!token) {
    const tbody = document.getElementById('cart-body');
    tbody.innerHTML = `<tr><td colspan="5">Veuillez vous connecter pour voir votre panier.</td></tr>`;
    document.getElementById('cart-total').textContent = "Total : 0.00€";
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

    document.getElementById('cart-total').textContent = `Total : ${total.toFixed(2)}€`;
  })
  .catch(err => {
    console.error(err);
    const tbody = document.getElementById('cart-body');
    tbody.innerHTML = `<tr><td colspan="5">Erreur lors du chargement du panier.</td></tr>`;
    document.getElementById('cart-total').textContent = "Total : 0.00€";
    emptyMessage.style.display = "none";
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

const confirmButton = document.getElementById("confirm-order-button");
if (confirmButton) {
  confirmButton.addEventListener("click", () => {
    fetch('https://demoresto.onrender.com/api/cart', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + getToken()
      }
    })
    .then(res => res.json())
    .then(cart => {
      if (!cart || cart.length === 0) {
        showNotification("Votre panier est vide","error");
      } else {
        // Enregistre le panier pour la page paiement
        localStorage.setItem("cart", JSON.stringify(cart));
        window.location.href = "paiement.html";
      }
    })
    .catch(err => {
      console.error("Erreur lors de la récupération du panier :", err);
      showNotification("Impossible de vérifier le panier","error");
    });
  });
}

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
  async function loadSchedules() {
    const response = await fetch('/horaires.json');
    const horaires = await response.json();
    const scheduleFields = document.getElementById('schedule-fields');
    if (!scheduleFields) return;

    scheduleFields.innerHTML = '';
    for (const [day, hours] of Object.entries(horaires)) {
      scheduleFields.innerHTML += `
        <label for="${day}">${day} :</label>
        <input type="text" id="${day}" name="${day}" value="${hours}" required>
      `;
    }
  }

  async function loadHorairesContact() {
    const response = await fetch('/horaires.json');
    const horaires = await response.json();
    const container = document.getElementById('opening-hours');
    if (!container) return;

    container.innerHTML = '';
    for (const [day, hours] of Object.entries(horaires)) {
      container.innerHTML += `<p><strong>${day}</strong> : ${hours}</p>`;
    }
  }

  const scheduleForm = document.getElementById('schedule-form');
  if (scheduleForm) {
    loadSchedules();

    scheduleForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const horaires = {};
      for (const [day, value] of formData.entries()) {
        horaires[day] = value;
      }

      await fetch('/update-horaires', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(horaires),
      });

      alert("Horaires mis à jour !");
    });
  }

  if (document.getElementById('opening-hours')) {
    loadHorairesContact();
  }
});