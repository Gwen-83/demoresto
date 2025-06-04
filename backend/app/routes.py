from flask import Blueprint, jsonify, request, current_app, Flask, send_from_directory
from .models import Product, CartItem, User, TokenBlocklist, Reservation, Order, NewsletterSubscriber, OrderQuota, AdminActivity
from . import db
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import jwt_required, get_jwt_identity, get_jwt, create_access_token
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import stripe
from flask_limiter.util import get_remote_address
from flask_limiter import Limiter
import os
import re
import json
from sqlalchemy import or_
import csv
from io import StringIO
from datetime import datetime, timedelta
from sqlalchemy import func

limiter = Limiter(key_func=get_remote_address)

smtp_password = os.getenv("SMTP_PASSWORD")
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
smtp_sender = os.getenv("SMTP_SENDER")
receiver_email=os.getenv("RECEIVER_EMAIL")

bp = Blueprint("main", __name__)

@bp.route("/api/products")
@limiter.limit("5/minute")
@jwt_required(optional=True)
def get_products():
    user_id = get_jwt_identity()
    user = User.query.get(user_id) if user_id else None
    if user and user.is_admin:
        products = Product.query.all()
    else:
        products = Product.query.filter_by(is_active=True).all()
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
        is_active=data.get("is_active", True)  # Ajouté
    )

    db.session.add(product)
    db.session.commit()
    log_admin_activity(user.id, 'ajout', 'plat', product.id, f"{product.name}")
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

    if "is_active" in data:
        product.is_active = bool(data["is_active"])

    db.session.commit()
    log_admin_activity(user.id, 'modification', 'plat', product.id, f"{product.name}")
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
    log_admin_activity(user.id, 'suppression', 'plat', product.id, f"{product.name}")
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

    # Email admin (texte simple)
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

    # Email client (HTML)
    html_content = f"""
    <h2>Votre demande de réservation a bien été reçue !</h2>
    <p>Bonjour,</p>
    <p>Merci d'avoir réservé chez <b>Chez Mario</b>. Voici un récapitulatif de votre demande :</p>
    <ul>
        <li><b>Date :</b> {date}</li>
        <li><b>Heure :</b> {heure}</li>
        <li><b>Nombre de couverts :</b> {couverts}</li>
        <li><b>Téléphone :</b> {tel}</li>
        {f"<li><b>Commentaire :</b> {commentaire}</li>" if commentaire else ""}
    </ul>
    <p>Nous vous confirmerons votre réservation par email dans les plus brefs délais.<br>
    Merci pour votre confiance !</p>
    <hr>
    <p style="font-size:12px;color:#888;">Ceci est un accusé de réception automatique. Pour toute question, contactez-nous.</p>
    """
    send_email(sender_email, "Votre demande de réservation chez Chez Mario", html_content)

    return jsonify({
        "message": "Réservation envoyée avec succès.",
        "reservation_id": reservation_id
    }), 201
    
@bp.route("/api/user/profile", methods=["GET"])
@jwt_required()
def get_user_profile():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        return jsonify(user.to_dict()), 200

    except Exception as e:
        print("Erreur serveur dans /api/user/profile :", e)
        return jsonify({"error": str(e)}), 500

@bp.route("/api/user/profile", methods=["PUT"])
@jwt_required()
def update_user_profile():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        data = request.get_json() or {}
        allergenes_exclus = data.get("allergenes_exclus")
        if isinstance(allergenes_exclus, list):
            user.allergenes_exclus = ",".join(allergenes_exclus)
        elif isinstance(allergenes_exclus, str):
            user.allergenes_exclus = allergenes_exclus
        db.session.commit()
        return jsonify(user.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500

@bp.route("/api/reservations", methods=["GET"])
@jwt_required()
def get_reservations():
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({"error": "Utilisateur introuvable"}), 404

        if user.is_admin:
            # Les admins voient toutes les réservations
            reservations = Reservation.query.order_by(Reservation.id.asc()).all()
        else:
            # Les utilisateurs normaux voient seulement leurs réservations (par email)
            reservations = Reservation.query.filter_by(email=user.email).order_by(Reservation.id.asc()).all()
            
            # Debug: afficher tous les emails des réservations existantes
            all_emails = [r.email for r in Reservation.query.all()]

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
        
        # Envoyer un email de confirmation au client (HTML)
        html_content = f"""
        <h2>Votre réservation chez Chez Mario est confirmée !</h2>
        <p>Bonjour,</p>
        <p>Nous avons le plaisir de vous confirmer votre réservation :</p>
        <ul>
            <li><b>Date :</b> {reservation.date}</li>
            <li><b>Heure :</b> {reservation.heure}</li>
            <li><b>Nombre de couverts :</b> {reservation.couverts}</li>
        </ul>
        <p>Nous vous attendons avec plaisir !</p>
        <hr>
        <p style="font-size:12px;color:#888;">Pour toute question, contactez-nous.<br>L'équipe Chez Mario</p>
        """
        send_email(reservation.email, "Confirmation de votre réservation - Chez Mario", html_content)
        
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
        
        # Envoyer un email au client (HTML)
        html_content = f"""
        <h2>Votre réservation chez Chez Mario n'a pas pu être confirmée</h2>
        <p>Bonjour,</p>
        <p>Nous sommes désolés, votre demande de réservation du <b>{reservation.date}</b> à <b>{reservation.heure}</b> n'a pas pu être confirmée.</p>
        {f"<p><b>Motif :</b> {reason}</p>" if reason else ""}
        <p>N'hésitez pas à nous contacter pour une nouvelle réservation.</p>
        <hr>
        <p style="font-size:12px;color:#888;">L'équipe Chez Mario - 04 68 12 34 56</p>
        """
        send_email(reservation.email, "Votre réservation n'a pas pu être confirmée - Chez Mario", html_content)
        
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

    # Email admin (texte simple)
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
    except Exception as e:
        return jsonify({"error": "Échec de l'envoi de l'email."}), 500

    # Email client (HTML)
    html_content = f"""
    <h2>Votre message a bien été reçu !</h2>
    <p>Bonjour {prenom},</p>
    <p>Merci de nous avoir contactés via notre site <b>Chez Mario</b>.</p>
    <p>Nous avons bien reçu votre message et nous vous répondrons dans les plus brefs délais.</p>
    <hr>
    <p><b>Récapitulatif de votre demande :</b></p>
    <ul>
        <li><b>Nom :</b> {prenom} {nom}</li>
        <li><b>Email :</b> {sender_email}</li>
        <li><b>Objet :</b> {objet}</li>
        <li><b>Message :</b> {message_content}</li>
    </ul>
    <hr>
    <p style="font-size:12px;color:#888;">Ceci est un accusé de réception automatique. Pour toute question, contactez-nous.</p>
    """
    send_email(sender_email, "Votre message a bien été reçu - Chez Mario", html_content)

    return jsonify({"message": "Contact envoyée avec succès."}), 200


@bp.route('/create-checkout-session', methods=['POST'])
@jwt_required()
def create_checkout_session():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    items = data.get('items', [])
    delivery = data.get('delivery', False)

    if not items:
        return jsonify({"error": "Panier vide"}), 400

    try:
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=items,
            mode='payment',
            success_url='https://demoresto.onrender.com/sucess.html',
            cancel_url='https://demoresto.onrender.com/cancel.html',
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

@bp.route('/dashboard')
def dashboard_page():
    return send_from_directory('static', 'dashboard.html')

def send_email(to_email, subject, html_content, cc_email=None):
    """Fonction utilitaire pour envoyer des emails"""
    try:
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_SENDER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        
        if not all([smtp_user, smtp_password]):
            raise ValueError("Configuration SMTP manquante")

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = to_email
        
        if cc_email:
            msg['Cc'] = cc_email

        html_part = MIMEText(html_content, 'html', 'utf-8')
        msg.attach(html_part)

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            recipients = [to_email]
            if cc_email:
                recipients.append(cc_email)
            server.send_message(msg, to_addrs=recipients)
            
        return True
    except Exception as e:
        current_app.logger.error(f"Erreur envoi email: {e}")
        return False

@bp.route('/api/send-delivery-email', methods=['POST'])
@jwt_required()
def send_delivery_email():
    try:
        data = request.get_json()
        delivery_info = data.get('deliveryInfo')
        cart_items = data.get('cartItems')
        timestamp = data.get('timestamp')
        
        if not all([delivery_info, cart_items]):
            return jsonify({"error": "Données manquantes"}), 400

        # Construction du HTML de l'email
        cart_items_html = ""
        total_price = 0
        
        for item in cart_items:
            item_total = item['product']['price'] * item['quantity']
            total_price += item_total
            cart_items_html += f"""
                <tr>
                    <td>{item['product']['name']}</td>
                    <td>{item['quantity']}</td>
                    <td>{item['product']['price']:.2f}€</td>
                    <td>{item_total:.2f}€</td>
                </tr>
            """

        # Construction de l'adresse complète à partir des 3 champs
        full_address = f"{delivery_info.get('address', '')}<br>{delivery_info.get('postal', '')} {delivery_info.get('city', '')}"

        email_html = f"""
            <h2>🚚 Nouvelle commande avec livraison - Chez Mario</h2>
            
            <h3>📋 Détails de la commande</h3>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th>Produit</th>
                        <th>Quantité</th>
                        <th>Prix unitaire</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {cart_items_html}
                </tbody>
                <tfoot>
                    <tr style="background-color: #f9f9f9; font-weight: bold;">
                        <td colspan="3">Sous-total</td>
                        <td>{total_price:.2f}€</td>
                    </tr>
                    <tr style="background-color: #f9f9f9; font-weight: bold;">
                        <td colspan="3">Frais de livraison</td>
                        <td>5.00€</td>
                    </tr>
                    <tr style="background-color: #e6f3ff; font-weight: bold; font-size: 16px;">
                        <td colspan="3">TOTAL</td>
                        <td>{total_price + 5:.2f}€</td>
                    </tr>
                </tfoot>
            </table>
            
            <h3>📍 Informations de livraison</h3>
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
                <p><strong>📧 Email :</strong> {delivery_info['email']}</p>
                <p><strong>📞 Téléphone :</strong> {delivery_info['phone']}</p>
                <p><strong>🏠 Adresse :</strong><br>{full_address}</p>
                <p><strong>📅 Date :</strong> {delivery_info['date']}</p>
                <p><strong>🕐 Heure :</strong> {delivery_info['time']}</p>
                {f"<p><strong>📝 Instructions :</strong><br>{delivery_info.get('instructions', '').replace(chr(10), '<br>')}</p>" if delivery_info.get('instructions') else ''}
            </div>
            
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
                <strong>Commande passée le :</strong> {timestamp}<br>
            </p>
        """

        # Envoi de l'email
        restaurant_email = os.environ.get('RECEIVER_EMAIL', 'restaurant@chezmario.fr')
        subject = f"🚚 Nouvelle commande avec livraison - {delivery_info['date']} à {delivery_info['time']}"
        
        msg = MIMEText(email_html, 'html', 'utf-8')
        msg['Subject'] = subject
        msg['From'] = smtp_sender
        msg['To'] = restaurant_email
        msg['Cc'] = delivery_info['email']

        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(smtp_sender, smtp_password)
                recipients = [restaurant_email, delivery_info['email']]
                server.send_message(msg, to_addrs=recipients)
            return jsonify({"success": True, "message": "Email envoyé avec succès"}), 200
        except Exception as e:
            current_app.logger.error(f"Erreur envoi email: {e}")
            return jsonify({"success": False, "error": "Erreur lors de l'envoi de l'email"}), 500
            
    except Exception as e:
        current_app.logger.error(f"Erreur send_delivery_email: {e}")
        return jsonify({"success": False, "error": "Erreur serveur"}), 500
    
@bp.route('/api/user/order-history', methods=['GET'])
@jwt_required()
def get_user_order_history():
    try:
        user_id = int(get_jwt_identity())
        print(f"[DEBUG] get_user_order_history: user_id={user_id}")

        orders = Order.query.filter_by(user_id=user_id).order_by(Order.created_at.desc()).all()
        print(f"[DEBUG] Orders trouvées: {len(orders)}")
        for o in orders:
            print(f"[DEBUG] Order id={o.id}, items={len(o.items)}")

        result = []
        for order in orders:
            # Utiliser la date/heure demandée si présente, sinon fallback sur created_at
            requested_date = order.requested_date
            requested_time = order.requested_time
            if requested_date and requested_time:
                date_label = f"{requested_date} {requested_time}"
            elif requested_date:
                date_label = requested_date
            else:
                date_label = order.created_at.strftime('%d/%m/%Y %H:%M')

            order_data = {
                'id': order.id,
                'date': date_label,
                'status': order.status,
                'items': [],
                'total': 0,
                'requested_date': order.requested_date,
                'requested_time': order.requested_time
            }
            for item in order.items:
                product = item.product
                item_total = item.quantity * product.price
                order_data['total'] += item_total
                order_data['items'].append({
                    'product_name': product.name,
                    'quantity': item.quantity,
                    'unit_price': product.price,
                    'total_price': item_total
                })
            order_data['total'] = round(order_data['total'], 2)
            result.append(order_data)
        print(f"[DEBUG] Payload envoyé: {result}")
        return jsonify(result), 200
    except Exception as e:
        print(f"Erreur lors de la récupération de l'historique des commandes: {e}")
        return jsonify({"error": str(e)}), 500

@bp.route('/api/validate-order', methods=['POST'])
@jwt_required()
def validate_order():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    # Récupérer tous les CartItems du panier de l'utilisateur (order_id=None)
    cart_items = CartItem.query.filter_by(user_id=user_id, order_id=None).all()
    if not cart_items:
        return jsonify({"error": "Panier vide"}), 400

    # Ajout : récupérer la date/heure demandée depuis le frontend
    requested_date = data.get('requested_date')
    requested_time = data.get('requested_time')

    # Créer la commande
    order = Order(
        user_id=user_id,
        status='en attente',
        requested_date=requested_date,
        requested_time=requested_time
    )
    db.session.add(order)
    db.session.flush()  # Pour obtenir l'id de la commande

    # Associer les CartItems à la commande
    for item in cart_items:
        item.order_id = order.id

    db.session.commit()
    return jsonify({"message": "Commande validée", "order_id": order.id}), 201

@bp.route('/api/send-order-email', methods=['POST'])
@jwt_required()
def send_order_email():
    try:
        data = request.get_json()
        delivery = data.get('delivery', False)
        delivery_info = data.get('deliveryInfo')
        pickup_info = data.get('pickupInfo')
        cart_items = data.get('cartItems')
        timestamp = data.get('timestamp')

        if not cart_items:
            return jsonify({"error": "Données panier manquantes"}), 400

        # Construction du HTML de l'email
        cart_items_html = ""
        total_price = 0
        for item in cart_items:
            item_total = item['product']['price'] * item['quantity']
            total_price += item_total
            cart_items_html += f"""
                <tr>
                    <td>{item['product']['name']}</td>
                    <td>{item['quantity']}</td>
                    <td>{item['product']['price']:.2f}€</td>
                    <td>{item_total:.2f}€</td>
                </tr>
            """

        if delivery:
            # Livraison
            extra_fees = 5.00
            total_final = total_price + extra_fees
            # Construction de l'adresse complète à partir des 3 champs
            full_address = f"{delivery_info.get('address', '')}<br>{delivery_info.get('postal', '')} {delivery_info.get('city', '')}"
            details_html = f"""
                <h3>📍 Informations de livraison</h3>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
                    <p><strong>📧 Email :</strong> {delivery_info['email']}</p>
                    <p><strong>📞 Téléphone :</strong> {delivery_info['phone']}</p>
                    <p><strong>🏠 Adresse :</strong><br>{full_address}</p>
                    <p><strong>📅 Date :</strong> {delivery_info['date']}</p>
                    <p><strong>🕐 Heure :</strong> {delivery_info['time']}</p>
                    {f"<p><strong>📝 Instructions :</strong><br>{delivery_info.get('instructions', '').replace(chr(10), '<br>')}</p>" if delivery_info.get('instructions') else ''}
                </div>
            """
            date_str = delivery_info['date']
            time_str = delivery_info['time']
            client_email = delivery_info['email']
        else:
            # Retrait sur place
            extra_fees = 0
            total_final = total_price
            details_html = f"""
                <h3>🛍️ Retrait sur place</h3>
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 10px 0;">
                    <p><strong>📅 Date de retrait :</strong> {pickup_info['date']}</p>
                    <p><strong>🕐 Heure :</strong> {pickup_info['time']}</p>
                </div>
            """
            date_str = pickup_info['date']
            time_str = pickup_info['time']
            # On tente de récupérer l'email utilisateur
            user_id = int(get_jwt_identity())
            user = User.query.get(user_id)
            client_email = user.email if user else None

        email_html = f"""
            <h2>{'🚚 Nouvelle commande avec livraison' if delivery else '🛍️ Nouvelle commande à emporter'} - Chez Mario</h2>
            <h3>📋 Détails de la commande</h3>
            <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%;">
                <thead>
                    <tr style="background-color: #f2f2f2;">
                        <th>Produit</th>
                        <th>Quantité</th>
                        <th>Prix unitaire</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {cart_items_html}
                </tbody>
                <tfoot>
                    <tr style="background-color: #f9f9f9; font-weight: bold;">
                        <td colspan="3">Sous-total</td>
                        <td>{total_price:.2f}€</td>
                    </tr>
                    {f'<tr style="background-color: #f9f9f9; font-weight: bold;"><td colspan="3">Frais de livraison</td><td>5.00€</td></tr>' if delivery else ''}
                    <tr style="background-color: #e6f3ff; font-weight: bold; font-size: 16px;">
                        <td colspan="3">TOTAL</td>
                        <td>{total_final:.2f}€</td>
                    </tr>
                </tfoot>
            </table>
            {details_html}
            <hr style="margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
                <strong>Commande passée le :</strong> {timestamp}<br>
            </p>
        """

        restaurant_email = os.environ.get('RECEIVER_EMAIL', 'restaurant@chezmario.fr')
        subject = f"{'🚚 Livraison' if delivery else '🛍️ Retrait'} - {date_str} à {time_str}"

        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_sender
        msg['To'] = restaurant_email
        if client_email:
            msg['Cc'] = client_email

        html_part = MIMEText(email_html, 'html', 'utf-8')
        msg.attach(html_part)

        try:
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(smtp_sender, smtp_password)
                recipients = [restaurant_email]
                if client_email:
                    recipients.append(client_email)
                server.send_message(msg, to_addrs=recipients)
            return jsonify({"success": True, "message": "Email envoyé avec succès"}), 200
        except Exception as e:
            current_app.logger.error(f"Erreur envoi email: {e}")
            return jsonify({"success": False, "error": "Erreur lors de l'envoi de l'email"}), 500

    except Exception as e:
        current_app.logger.error(f"Erreur send_order_email: {e}")
        return jsonify({"success": False, "error": "Erreur serveur"}), 500

@bp.route('/api/user/delete', methods=['DELETE'])
@jwt_required()
def delete_user_account():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "Utilisateur introuvable"}), 404

    try:
        # Supprimer tous les CartItems de l'utilisateur (panier et commandes)
        CartItem.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        db.session.commit()
        # Supprimer les commandes (les CartItems sont supprimés via cascade)
        orders = Order.query.filter_by(user_id=user_id).all()
        for order in orders:
            db.session.delete(order)
        db.session.commit()
        # Supprimer les réservations associées à l'email utilisateur
        from .models import Reservation
        Reservation.query.filter_by(email=user.email).delete(synchronize_session=False)
        db.session.commit()
        # Supprimer l'utilisateur
        db.session.delete(user)
        db.session.commit()
        log_admin_activity(user.id, 'suppression', 'utilisateur', user.id, f"Suppression compte utilisateur: {user.username}")
        return jsonify({'message': 'Compte supprimé'}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"Erreur lors de la suppression du compte: {str(e)}"}), 500

@bp.route('/api/admin/orders', methods=['GET'])
@jwt_required()
def get_all_orders():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403

    orders = Order.query.order_by(Order.created_at.desc()).all()
    result = []
    for order in orders:
        order_data = order.to_dict()
        # Ajout de l'email utilisateur pour l'admin
        order_data['user_email'] = order.user.email if order.user else None
        result.append(order_data)
    return jsonify(result), 200

@bp.route('/api/order/<int:order_id>/validate', methods=['POST'])
@jwt_required()
def validate_order_admin(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403

    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "Commande introuvable."}), 404

    order.status = 'validee'
    db.session.commit()
    log_admin_activity(user.id, 'modification', 'commande', order.id, f"Validation commande #{order.id}")
    # Envoi d'un email de confirmation à l'utilisateur
    if order.user and order.user.email:
        subject = "Votre commande a été validée"
        html_content = f"""
        <p>Bonjour,</p>
        <p>Votre commande <b>#{order.id}</b> a été <b>validée</b> par le restaurant.</p>
        <p>Merci pour votre confiance !</p>
        <hr>
        <h4>Détails de la commande :</h4>
        <ul>
        {''.join(f"<li>{item.quantity} x {item.product.name} ({item.product.price:.2f}€)</li>" for item in order.items)}
        </ul>
        <p><b>Total :</b> {order.total():.2f}€</p>
        """
        send_email(order.user.email, subject, html_content)
    return jsonify({"message": "Commande validée."}), 200

@bp.route('/api/order/<int:order_id>/reject', methods=['POST'])
@jwt_required()
def reject_order_admin(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403

    data = request.get_json()
    reason = sanitize_input(data.get('reason', ''), max_length=500) if data else ''

    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "Commande introuvable."}), 404

    order.status = 'refusee'
    db.session.commit()
    log_admin_activity(user.id, 'modification', 'commande', order.id, f"Refus commande #{order.id} - Motif: {reason}")
    # Envoi d'un email de refus à l'utilisateur
    if order.user and order.user.email:
        subject = "Votre commande a été refusée"
        html_content = f"""
        <p>Bonjour,</p>
        <p>Nous sommes désolés, votre commande <b>#{order.id}</b> a été <b>refusée</b> par le restaurant.<br> Veuillez nous contacter à l'adresse mail contact@chezmario.fr pour un remboursement.</p>
        {f"<p>Motif : {reason}</p>" if reason else ""}
        <hr>
        <h4>Détails de la commande :</h4>
        <ul>
        {''.join(f"<li>{item.quantity} x {item.product.name} ({item.product.price:.2f}€)</li>" for item in order.items)}
        </ul>
        <p><b>Total :</b> {order.total():.2f}€</p>
        <p>Pour toute question, contactez-nous.</p>
        """
        send_email(order.user.email, subject, html_content)
    return jsonify({"message": "Commande refusée."}), 200

@bp.route('/api/newsletter/subscribe', methods=['POST'])
@jwt_required()
def newsletter_subscribe():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    data = request.get_json() or {}
    email = user.email if user else None
    consent = data.get('consent', False)
    if not email:
        return jsonify({"error": "Email requis"}), 400
    existing = NewsletterSubscriber.query.filter_by(email=email).first()
    if consent:
        if existing:
            if not existing.consent:
                existing.consent = True
                db.session.commit()
            return jsonify({"message": "Déjà abonné"}), 200
        sub = NewsletterSubscriber(email=email, consent=True)
        db.session.add(sub)
        db.session.commit()
        log_admin_activity(user.id, 'ajout', 'newsletter', sub.id, f"Abonnement newsletter: {sub.email}")
        return jsonify({"message": "Abonnement réussi"}), 201
    else:
        # Désabonnement
        if existing and existing.consent:
            existing.consent = False
            db.session.commit()
            log_admin_activity(user.id, 'suppression', 'newsletter', existing.id, f"Désabonnement newsletter: {existing.email}")
        return jsonify({"message": "Déjà désabonné"}), 200

@bp.route('/api/admin/newsletter/subscribers', methods=['GET'])
@jwt_required()
def newsletter_list():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    subs = NewsletterSubscriber.query.filter_by(consent=True).order_by(NewsletterSubscriber.subscribed_at.desc()).all()
    return jsonify([s.to_dict() for s in subs])

@bp.route('/api/admin/newsletter/export', methods=['GET'])
@jwt_required()
def newsletter_export():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    subs = NewsletterSubscriber.query.filter_by(consent=True).all()
    si = StringIO()
    writer = csv.writer(si)
    writer.writerow(['email', 'subscribed_at'])
    for s in subs:
        writer.writerow([s.email, s.subscribed_at.isoformat() if s.subscribed_at else ""])
    output = si.getvalue()
    return current_app.response_class(
        output,
        mimetype='text/csv',
        headers={"Content-Disposition": "attachment;filename=newsletter_subscribers.csv"}
    )

@bp.route('/api/admin/newsletter/send', methods=['POST'])
@jwt_required()
def newsletter_send():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    data = request.get_json() or {}
    subject = data.get('subject')
    content = data.get('content')
    if not subject or not content:
        return jsonify({"error": "Sujet et contenu requis"}), 400
    subs = NewsletterSubscriber.query.filter_by(consent=True).all()
    emails = [s.email for s in subs]
    if not emails:
        return jsonify({"error": "Aucun abonné"}), 400
    # Envoi en BCC pour confidentialité
    try:
        smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        smtp_user = os.environ.get('SMTP_SENDER')
        smtp_password = os.environ.get('SMTP_PASSWORD')
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = smtp_user
        msg['To'] = smtp_user
        msg['Bcc'] = ','.join(emails)
        html_part = MIMEText(content, 'html', 'utf-8')
        msg.attach(html_part)
        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.send_message(msg, to_addrs=emails)
        
        # Envoi d'un mail de confirmation à l'admin
        try:
            confirmation_subject = f"Confirmation d'envoi de la newsletter : {subject}"
            confirmation_content = (
                "<h2>La newsletter a bien été envoyée à tous les abonnés.</h2>"
                f"<p><b>Sujet :</b> {subject}</p>"
                f"<p><b>Nombre d'abonnés :</b> {len(emails)}</p>"
                "<hr>"
                "<div style='background:#f8f8f8;padding:10px;border-radius:6px;'>"
                "<b>Contenu envoyé :</b><br>"
                f"{content}"
                "</div>"
            )
            # Utilise la fonction utilitaire d'envoi d'email déjà définie
            send_email(smtp_user, confirmation_subject, confirmation_content)
        except Exception as e:
            current_app.logger.error(f"Erreur envoi email confirmation newsletter admin: {e}")
        db.session.commit()
        log_admin_activity(user.id, 'envoi', 'newsletter', None, f"Envoi newsletter: {subject}")
        return jsonify({"message": "Newsletter envoyée"}), 200
    except Exception as e:
        current_app.logger.error(f"Erreur envoi newsletter: {e}")
        return jsonify({"error": "Erreur lors de l'envoi"}), 500

@bp.route("/api/products/<int:id>/toggle-active", methods=["POST"])
@jwt_required()
def toggle_product_active(id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    product = Product.query.get_or_404(id)
    product.is_active = not product.is_active
    db.session.commit()
    log_admin_activity(user.id, 'modification', 'plat', product.id, f"Activation {'oui' if product.is_active else 'non'}: {product.name}")
    return jsonify({"id": product.id, "is_active": product.is_active})

@bp.route('/api/order-quota', methods=['GET', 'POST'])
@jwt_required()
def order_quota():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403

    quota = OrderQuota.query.first()
    if request.method == 'GET':
        if not quota:
            # Valeur par défaut si non configuré
            return jsonify({"max_orders_per_hour": 3})
        return jsonify(quota.to_dict())
    else:
        data = request.get_json() or {}
        max_orders = int(data.get("max_orders_per_hour", 3))
        if not quota:
            quota = OrderQuota(max_orders_per_hour=max_orders)
            db.session.add(quota)
        else:
            quota.max_orders_per_hour = max_orders
        db.session.commit()
        log_admin_activity(user.id, 'modification', 'quota', quota.id, f"Quota commandes/heure: {quota.max_orders_per_hour}")
        return jsonify(quota.to_dict())

@bp.route('/api/orders/count', methods=['GET'])
@jwt_required(optional=True)
def count_orders_for_slot():
    date = request.args.get('date')
    time = request.args.get('time')
    if not date or not time:
        return jsonify({"error": "Date et heure requises"}), 400
    count = Order.query.filter_by(requested_date=date, requested_time=time).count()
    return jsonify({"count": count})

@bp.route("/api/products/top")
def get_top_products():
    # Calcule la date il y a 7 jours
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    # Jointure Order <-> CartItem, filtre sur les 7 derniers jours
    top_products = (
        db.session.query(
            CartItem.product_id,
            func.sum(CartItem.quantity).label('total_qty')
        )
        .join(Order, CartItem.order_id == Order.id)
        .filter(Order.created_at >= seven_days_ago)
        .group_by(CartItem.product_id)
        .order_by(func.sum(CartItem.quantity).desc())
        .limit(3)
        .all()
    )
    # Retourne la liste des IDs des produits populaires
    top_ids = [pid for pid, _ in top_products]
    return jsonify(top_ids)

@bp.route("/api/products/with-order-count")
@jwt_required()
def get_products_with_order_count():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403

    # Récupère tous les produits et le nombre total commandé pour chacun
    products = (
        db.session.query(
            Product,
            func.coalesce(func.sum(CartItem.quantity), 0).label('order_count')
        )
        .outerjoin(CartItem, (CartItem.product_id == Product.id) & (CartItem.order_id != None))
        .group_by(Product.id)
        .all()
    )
    result = []
    for product, order_count in products:
        prod_dict = product.to_dict()
        prod_dict['order_count'] = int(order_count)
        result.append(prod_dict)
    return jsonify(result)

@bp.route('/api/admin/activities/export', methods=['GET'])
@jwt_required()
def export_admin_activities():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user or not user.is_admin:
        return jsonify({"error": "Accès interdit"}), 403
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    activities = AdminActivity.query.filter(AdminActivity.timestamp >= seven_days_ago).order_by(AdminActivity.timestamp.desc()).all()
    si = StringIO()
    writer = csv.writer(si)
    writer.writerow(['date', 'heure', 'action', 'cible', 'id_cible', 'détails', 'admin'])
    for act in activities:
        date_str = act.timestamp.strftime('%Y-%m-%d') if act.timestamp else ''
        time_str = act.timestamp.strftime('%H:%M:%S') if act.timestamp else ''
        writer.writerow([
            date_str,
            time_str,
            act.action_type,
            act.target_type,
            act.target_id or '',
            act.details or '',
            act.admin.username if act.admin else ''
        ])
    output = si.getvalue()
    return current_app.response_class(
        output,
        mimetype='text/csv',
        headers={"Content-Disposition": "attachment;filename=admin_activities.csv"}
    )

def log_admin_activity(admin_id, action_type, target_type, target_id=None, details=None):
    activity = AdminActivity(
        admin_id=admin_id,
        action_type=action_type,
        target_type=target_type,
        target_id=target_id,
        details=details
    )
    db.session.add(activity)
    db.session.commit()