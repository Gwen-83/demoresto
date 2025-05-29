from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_migrate import Migrate
import stripe
from dotenv import load_dotenv
import os
from datetime import timedelta

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    CORS(app, supports_credentials=True)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY')
    app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')
    app.config['STRIPE_SECRET_KEY'] = os.getenv('STRIPE_SECRET_KEY')
    app.config['SMTP_SENDER'] = os.getenv('SMTP_SENDER')
    app.config['RECEIVER_EMAIL'] = os.getenv('RECEIVER_EMAIL')
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=30)
    stripe.api_key = app.config['STRIPE_SECRET_KEY']

    db.init_app(app)
    jwt = JWTManager(app)

    @jwt.token_in_blocklist_loader
    def check_if_token_revoked(jwt_header, jwt_payload):
        from .models import TokenBlocklist
        jti = jwt_payload["jti"]
        token = db.session.query(TokenBlocklist.id).filter_by(jti=jti).scalar()
        return token is not None

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        return {"msg": "Token révoqué"}, 401

    migrate.init_app(app, db)

    from .routes import bp as main_bp
    app.register_blueprint(main_bp)

    return app