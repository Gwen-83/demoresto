#!/bin/bash

# Attendre que la base de données soit prête
echo "Attente de la base de données..."
sleep 5

# Lancer Gunicorn avec le bon module
exec gunicorn run:app --bind 0.0.0.0:$PORT --worker-class gevent
