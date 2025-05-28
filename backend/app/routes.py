from flask import Blueprint, jsonify, request, current_app, Flask, send_from_directory
from .models import Product, CartItem, User, TokenBlocklist, Reservation
from . import db
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, create_access_token
import smtplib
from email.mime.text import MIMEText
import stripe
from flask_limiter.util import get_remote_address
from flask_limiter import Limiter
import os
import re
import json

limiter = Limiter(key_func=get_remote_address)

smtp_password = os.getenv("SMTP_PASSWORD")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
smtp_sender = os.getenv("SMTP_SENDER")
receiver_email=os.getenv("RECEIVER_EMAIL")

bp = Blueprint("main", __name__)

@bp.route("/api/products")
@limiter.limit("5/minute")
def get_products():
    products = Product.query.all()
    return jsonify([p.to_dict() for p in products])

@bp.route("/api/products", methods=["POST"])
@limiter.limit("5/minute")
@jwt_required()
def add_product():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    
    data = request.json
    name = sanitize_input(data.get("name"))
    if not name:
        return jsonify({"error": "Nom invalide"}), 400

    product = Product(
        name=data["name"],
        description=data.get("description", ""),
        price=data["price"],
        image=data.get("image"),
        category=data.get("category"),
        allergens=','.join(data.get("allergens", [])),
    )

    db.session.add(product)
    db.session.commit()
    return jsonify(product.to_dict()), 201

@bp.route("/api/products/<int:id>", methods=["PUT"])
@limiter.limit("5/minute")
@jwt_required()
def update_product(id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    
    product = Product.query.get_or_404(id)
    data = request.json
    name = sanitize_input(data.get("name"))
    if not name:
        return jsonify({"error": "Nom invalide"}), 400

    product.name = data.get("name", product.name)
    product.description = data.get("description", product.description)
    product.price = data.get("price", product.price)
    product.image = data.get("image", product.image)
    product.category = data.get("category", product.category)

    allergens_data = data.get("allergens", [])
    if isinstance(allergens_data, list):
        product.allergens = ','.join(allergens_data)
    elif isinstance(allergens_data, str):
        product.allergens = allergens_data
    else:
        product.allergens = ""

    db.session.commit()
    return jsonify(product.to_dict())


@bp.route("/api/products/<int:id>", methods=["DELETE"])
@limiter.limit("5/minute")
@jwt_required()
def delete_product(id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    
    product = Product.query.get_or_404(id)
    db.session.delete(product)
    db.session.commit()
    return jsonify({"message": "Produit supprimé"}), 200

#Ajouter au panier
@bp.route("/api/cart", methods=["POST"])
@limiter.limit("5/minute")
@jwt_required()
def add_to_cart():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    product_id = data.get("product_id")
    quantity = data.get("quantity", 1)

    product = Product.query.get(product_id)
    if not product:
        return jsonify({"error": "Produit introuvable"}), 404

    existing_item = CartItem.query.filter_by(product_id=product_id, order_id=None, user_id=user_id).first()

    if existing_item:
        existing_item.quantity += quantity
        db.session.commit()
        return jsonify({"message": f"Quantité mise à jour à {existing_item.quantity}"}), 200
    else:
        new_item = CartItem(product_id=product_id, quantity=quantity, user_id=user_id)
        db.session.add(new_item)
        db.session.commit()
        return jsonify(new_item.to_dict()), 201

#Voir le panier
@bp.route('/api/cart', methods=['GET'])
@jwt_required()
def get_cart():
    user_id = int(get_jwt_identity())
    items = CartItem.query.filter_by(order_id=None, user_id=user_id).all()
    result = []
    for item in items:
        result.append({
            "id": item.id,
            "product": {
                "id": item.product.id,
                "name": item.product.name,
                "description": item.product.description,
                "price": item.product.price,
                "image": item.product.image,
                "category": item.product.category
            },
            "quantity": item.quantity,
            "total_price": item.quantity * item.product.price
        })
    return jsonify(result)

#Modifier la quantité dans le panier
@bp.route('/api/cart/<int:item_id>', methods=['PUT'])
@jwt_required()
def update_cart_item(item_id):
    user_id = int(get_jwt_identity())
    data = request.json
    quantity = data.get('quantity')

    if quantity is None or quantity < 1:
        return jsonify({'error': 'Quantité invalide'}), 400

    item = db.session.get(CartItem, item_id)
    if not item or item.order_id is not None or item.user_id != user_id:
        return jsonify({'error': 'Article non trouvé ou non autorisé'}), 404

    item.quantity = quantity
    db.session.commit()

    return jsonify({
        "id": item.id,
        "product": {
            "id": item.product.id,
            "name": item.product.name,
            "description": item.product.description,
            "price": item.product.price
        },
        "quantity": item.quantity,
        "total_price": item.quantity * item.product.price
    })

#Supprimer du panier
@bp.route('/api/cart/<int:item_id>', methods=['DELETE'])
@jwt_required()
def delete_cart_item(item_id):
    user_id = int(get_jwt_identity())
    item = db.session.get(CartItem, item_id)
    if not item or item.order_id is not None or item.user_id != user_id:
        return jsonify({'error': 'Article non trouvé ou non autorisé'}), 404


    db.session.delete(item)
    db.session.commit()

    return jsonify({'message': 'Article supprimé du panier'})

@bp.route('/api/register', methods=['POST'])
@limiter.limit("5/minute")
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')

    if not username or not password:
        return jsonify({'error': 'Nom d\'utilisateur et mot de passe requis.'}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Ce nom d\'utilisateur existe déjà.'}), 400

    if not email:
        return jsonify({'error': 'Adresse e-mail requise.'}), 400
    if User.query.filter_by(email=email).first():
        return jsonify({'error': 'Cet e-mail est déjà utilisé.'}), 400

    # Vérifie si c'est le premier utilisateur
    is_first_user = User.query.first() is None

    new_user = User(
        username=username,
        email=email,
        is_admin=is_first_user
    )
    new_user.set_password(password)

    db.session.add(new_user)
    db.session.commit()

    return jsonify({'message': 'Utilisateur créé avec succès !', 'admin': new_user.is_admin})


@bp.route("/api/login", methods=["POST"])
@limiter.limit("5/minute")
def login():
    data = request.json

    if not data or "username" not in data or "password" not in data:
        return jsonify({"message": "Nom d'utilisateur et mot de passe requis."}), 400

    user = User.query.filter_by(username=data["username"]).first()

    if not user or not user.check_password(data["password"]):
        return jsonify({"message": "Nom d'utilisateur ou mot de passe incorrect."}), 401

    additional_claims = {
        "is_admin": user.is_admin,
        "username": user.username
    }

    access_token = create_access_token(identity=str(user.id), additional_claims=additional_claims)

    return jsonify({
        "message": "Connexion réussie",
        "access_token": access_token
    }), 200


def sanitize_input(value, max_length=100):
    if not value or not isinstance(value, str):
        return None
    value = value.strip()
    if len(value) > max_length:
        return None
    if '\r' in value or '\n' in value:
        return None
    return value

def is_valid_email(email):
    regex = r'^[\w\.-]+@[\w\.-]+\.\w+$'
    return re.match(regex, email) is not None

@bp.route("/api/reservation", methods=["POST"])
@jwt_required()
@limiter.limit("3 per minute")
def send_reservation():
    data = request.get_json()
    print("Requête reçue :", data)
    if data.get("company"):
        return jsonify({"error": "Bot détecté."}), 400
    
    sender_email = sanitize_input(data.get("email"))
    tel = sanitize_input(data.get("telephone"), max_length=20)
    couverts = data.get("couverts")
    date = sanitize_input(data.get("date"), max_length=20)
    heure = sanitize_input(data.get("heure"), max_length=20)
    commentaire = sanitize_input(data.get("commentaire"), max_length=500)

    if not sender_email or not is_valid_email(sender_email):
        return jsonify({"error": "Adresse e-mail invalide."}), 400

    if not couverts or not date or not heure or not sender_email or not tel:
        return jsonify({"error": "Tous les champs obligatoires ne sont pas remplis."}), 400

    try:
        couverts = int(couverts)
        if couverts < 1 or couverts > 20:
            return jsonify({"error": "Le nombre de couverts doit être entre 1 et 20."}), 400
    except ValueError:
        return jsonify({"error": "Le nombre de couverts doit être un nombre entier."}), 400

    # Créer la réservation avec SQLAlchemy ORM
    try:
        reservation = Reservation(
            email=sender_email,
            telephone=tel,
            couverts=couverts,
            date=date,
            heure=heure,
            commentaire=commentaire,
            status='pending'  # Statut par défaut en attente
        )
        
        db.session.add(reservation)
        db.session.commit()
        
        reservation_id = reservation.id
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Erreur lors de la sauvegarde."}), 500

    # Envoyer l'email de notification à l'admin
    message = f"""
    Nouvelle réservation reçue (ID: {reservation_id}) :

    - Adresse mail du client : {sender_email}
    - Téléphone du client : {tel}
    - Nombre de couverts : {couverts}
    - Date : {date}
    - Heure : {heure}
    - Commentaire : {commentaire}
    
    Connectez-vous à votre espace admin pour valider ou refuser cette réservation.
    """

    msg = MIMEText(message)
    msg['Subject'] = f'Nouvelle réservation #{reservation_id}'
    msg['From'] = smtp_sender
    msg['To'] = receiver_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(smtp_sender, smtp_password)
            server.send_message(msg)
    except Exception as e:
        print(f"Erreur envoi email: {e}")  # Log l'erreur mais ne fait pas échouer la réservation

    return jsonify({
        "message": "Réservation envoyée avec succès.",
        "reservation_id": reservation_id
    }), 201
    

@bp.route("/api/reservations", methods=["GET"])
@jwt_required()
def get_reservations():
    try:
        user_id = int(get_jwt_identity())
        print("user_id:", user_id)
        user = User.query.get(user_id)
        print("user:", user)

        if not user or not user.is_admin:
            print("Accès refusé: pas admin ou user introuvable")
            return jsonify({"error": "Accès interdit"}), 403
        
        reservations = Reservation.query.order_by(Reservation.id.asc()).all()

        print("Nombre de réservations récupérées :", len(reservations))
        return jsonify([r.to_dict() for r in reservations]), 200

    except Exception as e:
        print("Erreur serveur dans /api/reservations :", e)
        return jsonify({"error": str(e)}), 500

# Route pour valider une réservation
@bp.route("/api/reservation/<int:reservation_id>/validate", methods=["POST"])
@jwt_required()
def validate_reservation(reservation_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    
    try:
        reservation = Reservation.query.get(reservation_id)
        
        if not reservation:
            return jsonify({"error": "Réservation introuvable."}), 404
        
        # Mettre à jour le statut
        reservation.status = 'validee'
        db.session.commit()
        
        # Envoyer un email de confirmation au client
        message = f"""
        Bonjour,

        Votre réservation chez Mario a été confirmée !

        Détails de votre réservation :
        - Date : {reservation.date}
        - Heure : {reservation.heure}
        - Nombre de couverts : {reservation.couverts}

        Nous vous attendons avec plaisir !

        L'équipe Chez Mario
        """
        
        msg = MIMEText(message)
        msg['Subject'] = 'Réservation confirmée - Chez Mario'
        msg['From'] = smtp_sender
        msg['To'] = reservation.email
        
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(smtp_sender, smtp_password)
                server.send_message(msg)
        except Exception as e:
            print(f"Erreur envoi email confirmation: {e}")
        
        return jsonify({"message": "Réservation validée avec succès."}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Erreur lors de la validation."}), 500

# Route pour refuser une réservation
@bp.route("/api/reservation/<int:reservation_id>/reject", methods=["POST"])
@jwt_required()
def reject_reservation(reservation_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)

    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    
    data = request.get_json()
    reason = sanitize_input(data.get('reason', ''), max_length=500) if data else ''
    
    try:
        reservation = Reservation.query.get(reservation_id)
        
        if not reservation:
            return jsonify({"error": "Réservation introuvable."}), 404
        
        # Mettre à jour le statut
        reservation.status = 'refusee'
        if reason:
            reservation.commentaire_admin = reason  # Nouveau champ pour stocker le motif
        db.session.commit()
        
        # Envoyer un email au client
        message = f"""
        Bonjour,

        Nous sommes désolés mais votre réservation du {reservation.date} à {reservation.heure} n'a pas pu être confirmée.
        
        """
        
        if reason:
            message += f"Motif : {reason}\n\n"
        
        message += """
        N'hésitez pas à nous contacter pour une nouvelle réservation.

        L'équipe Chez Mario
        04 68 12 34 56
        """
        
        msg = MIMEText(message)
        msg['Subject'] = 'Réservation non confirmée - Chez Mario'
        msg['From'] = smtp_sender
        msg['To'] = reservation.email
        
        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(smtp_sender, smtp_password)
                server.send_message(msg)
        except Exception as e:
            print(f"Erreur envoi email refus: {e}")
        
        return jsonify({"message": "Réservation refusée."}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "Erreur lors du refus."}), 500


@bp.route("/api/contact", methods=["POST"])
@limiter.limit("3 per minute")
def send_contact():
    data = request.get_json()
    if data.get("company"):
        return jsonify({"error": "Bot détecté."}), 400
    prenom = sanitize_input(data.get("prenom"))
    nom = sanitize_input(data.get("nom"))
    sender_email = sanitize_input(data.get("email"))
    objet = sanitize_input(data.get("objet"), max_length=150)
    message_content = sanitize_input(data.get("message"), max_length=500)

    if not prenom or not nom or not objet or not sender_email or not message_content:
        return jsonify({"error": "Tous les champs obligatoires ne sont pas remplis ou sont invalides."}), 400

    if not is_valid_email(sender_email):
        return jsonify({"error": "Adresse e-mail invalide."}), 400

    message = f"""
    Nouveau message de contact :

    - Prénom : {prenom}
    - Nom : {nom}
    - Adresse email : {sender_email}
    - Objet : {objet}
    - Message : {message_content}
    """

    msg = MIMEText(message)
    msg['Subject'] = 'Nouvelle demande de contact'
    msg['From'] = smtp_sender
    msg['To'] = receiver_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(smtp_sender, smtp_password)
            server.send_message(msg)
        return jsonify({"message": "Contact envoyée avec succès."}), 200
    except Exception as e:
        return jsonify({"error": "Échec de l'envoi de l'email."}), 500


@bp.route('/create-checkout-session', methods=['POST'])
@jwt_required()
def create_checkout_session():
    user_id = int(get_jwt_identity())

    # Récupérer les articles du panier en base (non commandés)
    cart_items = CartItem.query.filter_by(user_id=user_id, order_id=None).all()
    if not cart_items:
        return jsonify({"error": "Panier vide"}), 400

    line_items = []
    for item in cart_items:
        # On reconstruit chaque item pour Stripe en toute sécurité
        line_items.append({
            'price_data': {
                'currency': 'eur',
                'product_data': {
                    'name': item.product.name,
                    # tu peux ajouter plus d'infos si besoin (ex : description)
                },
                'unit_amount': int(item.product.price * 100),  # prix en centimes
            },
            'quantity': item.quantity,
        })

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=line_items,
            mode='payment',
            success_url='https://demoresto.onrender.com/sucess.html',
            cancel_url='https://demoresto.onrender.com/cancel.html',
            # tu peux associer la session au user avec client_reference_id si tu veux
            client_reference_id=str(user_id)
        )
        return jsonify({'id': session.id})
    except Exception as e:
        current_app.logger.error(f"Erreur Stripe: {e}")
        return jsonify({'error': 'Erreur lors de la création de la session Stripe'}), 500

@bp.route('/api/verify-token')
@jwt_required()
def verify_token():
    claims = get_jwt()
    is_admin = claims.get("is_admin", False)
    username = claims.get("username", "inconnu")
    return jsonify({"message": "Token valide", "role": "admin" if is_admin else "user", "username": username}), 200

@bp.route('/api/horaires.json')
def horaires():
    horaires_path = os.path.join(current_app.root_path, 'horaires.json')
    if not os.path.exists(horaires_path):
        return jsonify({"error": "Fichier horaires.json introuvable"}), 404

    with open(horaires_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return jsonify(data)

@bp.route('/api/update-horaires', methods=['POST'])
def update_horaires():
    horaires_path = os.path.join(current_app.root_path, 'horaires.json')
    try:
        horaires = request.get_json()

        if not isinstance(horaires, dict):
            return jsonify({"error": "Format de données invalide"}), 400

        # Vérification basique des valeurs
        heure_pattern = re.compile(r'^(\d{1,2}h\d{2})(-(\d{1,2}h\d{2}))?(\/(\d{1,2}h\d{2})-(\d{1,2}h\d{2}))?$')

        for jour, valeur in horaires.items():
            if valeur != "Fermé" and not heure_pattern.match(valeur):
                return jsonify({"error": f"Format invalide pour {jour} : {valeur}"}), 400

        with open(horaires_path, 'w', encoding='utf-8') as f:
            json.dump(horaires, f, ensure_ascii=False, indent=2)

        return '', 204

    except Exception as e:
        return jsonify({"error": str(e)}), 500