import os
from flask import Flask, send_from_directory, request
from flask_cors import CORS
from app import create_app

app = create_app()
CORS(app)

# 🔧 Répertoires
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
STATIC_DIR = os.path.join(BASE_DIR, 'static')
PUBLIC_DIR = os.path.join(BASE_DIR, 'public')

@app.route('/')
def serve_root():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/<path:filename>')
def serve_static_file(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route('/public/<path:filename>')
def serve_public_file(filename):
    return send_from_directory(PUBLIC_DIR, filename)

if __name__ == "__main__":
    app.run(debug=True)
