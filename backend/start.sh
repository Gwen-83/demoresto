#!/bin/bash

# Attendre que la base de données soit prête
echo "Attente de la base de données..."
sleep 5

# Lancer les migrations de la base de données
flask db upgrade

# Lancer Gunicorn avec le bon module, 1 worker, timeout 60 secondes, et gevent
exec gunicorn run:app --bind 0.0.0.0:$PORT --worker-class gevent --workers 1 --timeout 60
