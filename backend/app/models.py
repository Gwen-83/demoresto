from . import db
from datetime import datetime
import pytz
from werkzeug.security import generate_password_hash, check_password_hash

class Product(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    price = db.Column(db.Float, nullable=False)
    image = db.Column(db.String(255))
    category = db.Column(db.String(50))  # entrée, plat, dessert, boisson
    allergens = db.Column(db.String(255))  # ex: "gluten,lactose"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": self.price,
            "image": self.image,
            "category": self.category,
            "allergens": self.allergens.split(',') if self.allergens else [],
        }

class CartItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    order_id = db.Column(db.Integer, db.ForeignKey('order.id'), nullable=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    quantity = db.Column(db.Integer, default=1)

    product = db.relationship('Product', backref='cart_items')
    user = db.relationship('User', backref='cart_items')

    def to_dict(self):
        return {
            'id': self.id,
            'product': self.product.to_dict() if self.product else None,
            'quantity': self.quantity,
            'total_price': round(self.quantity * self.product.price, 2) if self.product else 0
        }

class Order(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(pytz.timezone('Europe/Paris')))
    status = db.Column(db.String(20), default='en attente')  # ex: "validée", "en cours", etc.
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)  # Ajouté

    # Ajout : champs pour la date/heure demandée de livraison/retrait
    requested_date = db.Column(db.String(20))  # format "YYYY-MM-DD"
    requested_time = db.Column(db.String(10))  # format "HH:MM"

    items = db.relationship('CartItem', backref='order', lazy=True)
    user = db.relationship('User', backref='orders')  # Ajouté

    def total(self):
        return sum(item.quantity * item.product.price for item in self.items)

    def to_dict(self):
        # Calculer le total à partir des items
        total_amount = 0
        items_data = []
        
        for item in self.items:
            product_data = None
            if item.product:
                product_data = item.product.to_dict()
                item_total = round(item.quantity * item.product.price, 2)
            else:
                # Produit supprimé
                product_data = {
                    "id": None,
                    "name": "Produit supprimé",
                    "description": "",
                    "price": 0,
                    "image": "",
                    "category": "",
                    "allergens": []
                }
                item_total = 0
            
            total_amount += item_total
            
            items_data.append({
                'id': item.id,
                'product': product_data,
                'quantity': item.quantity,
                'total_price': item_total
            })
        
        return {
            'id': self.id,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'status': self.status,
            'items': items_data,
            'total': round(total_amount, 2),
            'requested_date': self.requested_date,
            'requested_time': self.requested_time,
            'user_email': self.user.email if self.user else None
        }

class TokenBlocklist(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    jti = db.Column(db.String(36), nullable=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    allergenes_exclus = db.Column(db.String(255), default="")  # Allergènes à éviter (séparés par virgule)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "is_admin": self.is_admin,
            "allergenes_exclus": self.allergenes_exclus.split(',') if self.allergenes_exclus else []
        }

class Reservation(db.Model):
    __tablename__ = 'reservations'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False)
    telephone = db.Column(db.String(20), nullable=False)
    couverts = db.Column(db.Integer, nullable=False)
    date = db.Column(db.String(20), nullable=False)  # Ou db.Date si vous voulez un format date
    heure = db.Column(db.String(20), nullable=False)  # Ou db.Time si vous voulez un format time
    commentaire = db.Column(db.Text)
    commentaire_admin = db.Column(db.Text)  # Pour stocker les motifs de refus
    status = db.Column(db.String(20), default='pending')  # pending, validee, refusee
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def to_dict(self):
        return {
            'id': self.id,
            'email': self.email,
            'telephone': self.telephone,
            'couverts': self.couverts,
            'date': self.date,
            'heure': self.heure,
            'commentaire': self.commentaire,
            'commentaire_admin': self.commentaire_admin,
            'status': self.status,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
    
    def __repr__(self):
        return f'<Reservation {self.id}: {self.email} - {self.date} {self.heure}>'

class NewsletterSubscriber(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False)
    consent = db.Column(db.Boolean, default=False)
    subscribed_at = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "consent": self.consent,
            "subscribed_at": self.subscribed_at.isoformat() if self.subscribed_at else None
        }