"""
Escape the Exam - Flask Backend
Main application file with MongoDB Atlas integration
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient, DESCENDING
from datetime import datetime
import os
from dotenv import load_dotenv
# Google auth is optional; import if available
try:
    from google.oauth2 import id_token
    from google.auth.transport import requests as grequests
    GOOGLE_AUTH_AVAILABLE = True
except Exception:
    GOOGLE_AUTH_AVAILABLE = False
import traceback

load_dotenv()

app = Flask(__name__)
CORS(app)

# MongoDB Atlas Connection
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017/')
DB_NAME = 'escape_exam_db'
COLLECTION_NAME = 'scores'

# Initialize MongoDB client
try:
    client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
    db = client[DB_NAME]
    scores_collection = db[COLLECTION_NAME]
    users_collection = db['users']
    client.server_info()
    print("Connected to MongoDB successfully!")
except Exception as e:
    print(f"MongoDB connection error: {e}")
    scores_collection = None

@app.route('/')
def index():
    # pass Google client id to template from env (so client-side GSI can render)
    google_client_id = os.getenv('GOOGLE_CLIENT_ID', '')
    return render_template('index.html', google_client_id=google_client_id)


@app.route('/api/auth/google', methods=['POST'])
def auth_google():
    if not GOOGLE_AUTH_AVAILABLE:
        return jsonify({"error": "Google auth not available on server"}), 501
    try:
        data = request.get_json()
        if not data or 'id_token' not in data:
            return jsonify({"error": "Missing id_token"}), 400
        token = data['id_token']
        CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID')
        if not CLIENT_ID:
            return jsonify({"error": "Server not configured for Google Sign-In"}), 500
        # verify token
        try:
            idinfo = id_token.verify_oauth2_token(token, grequests.Request(), CLIENT_ID)
        except Exception as e:
            print('Failed to verify id_token:', e)
            return jsonify({"error": "Invalid ID token"}), 400
        # idinfo contains 'sub' (user id), 'email', 'name'
        google_id = idinfo.get('sub')
        email = idinfo.get('email')
        name = idinfo.get('name') or email
        # upsert user
        user_doc = {
            'google_id': google_id,
            'email': email,
            'name': name,
            'last_login': datetime.utcnow()
        }
        try:
            existing = users_collection.find_one({'google_id': google_id})
            if existing:
                users_collection.update_one({'google_id': google_id}, {'$set': {'last_login': user_doc['last_login'], 'name': name}})
            else:
                users_collection.insert_one(user_doc)
        except Exception as e:
            print('User upsert error:', e)
            return jsonify({"error": "Database error"}), 500
        # return account name (use email) to frontend
        return jsonify({"success": True, "account": email, "name": name}), 200
    except Exception as e:
        print('auth_google unexpected error:', e)
        return jsonify({"error": "Auth error"}), 500

@app.route('/api/score', methods=['POST'])
def save_score():
    try:
        if scores_collection is None:
            print('Database not available')
            return jsonify({"error": "Database not available"}), 503
        data = request.get_json()
        print('Received score POST:', data)
        if not data or 'name' not in data or 'score' not in data:
            print('Missing name or score')
            return jsonify({"error": "Missing name or score"}), 400
        name = str(data['name']).strip()
        try:
            score = int(data['score'])
        except Exception as e:
            print('Score conversion error:', e)
            traceback.print_exc()
            return jsonify({"error": "Invalid score format"}), 400
        if not name:
            print('Name cannot be empty')
            return jsonify({"error": "Name cannot be empty"}), 400
        if score < 0:
            print('Invalid score')
            return jsonify({"error": "Invalid score"}), 400
        score_doc = {
            "name": name[:50],
            "score": score,
            "date": datetime.utcnow()
        }
        # Ensure single record per player name: update existing or insert
        try:
            existing = scores_collection.find_one({"name": name[:50]})
            if existing:
                # update only if new score is better
                if score > existing.get('score', 0):
                    result = scores_collection.update_one({"name": name[:50]}, {"$set": {"score": score, "date": datetime.utcnow()}})
                    print('Updated existing score for', name, 'modified_count=', result.modified_count)
                    return jsonify({"success": True, "id": str(existing.get('_id')), "message": "Score updated (higher)."}), 200
                else:
                    print('Existing score higher or equal; not updating for', name)
                    return jsonify({"success": False, "message": "Existing score is higher or equal; not updated."}), 200
            else:
                print('Inserting score doc:', score_doc)
                result = scores_collection.insert_one(score_doc)
                print('Insert result:', result.inserted_id)
                return jsonify({"success": True, "id": str(result.inserted_id), "message": "Score saved successfully!"}), 201
        except Exception:
            print('DB insert/update error')
            traceback.print_exc()
            return jsonify({"error": "Failed to save score (db)"}), 500
    except Exception as e:
        print(f"Error saving score: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to save score"}), 500

@app.route('/api/scores', methods=['GET'])
def get_leaderboard():
    try:
        if scores_collection is None:
            return jsonify({"error": "Database not available"}), 503
        
        top_scores = list(scores_collection.find(
            {},
            {'_id': 0, 'name': 1, 'score': 1, 'date': 1}
        ).sort('score', DESCENDING).limit(10))
        
        for score in top_scores:
            if 'date' in score:
                score['date'] = score['date'].isoformat()
        
        return jsonify({
            "success": True,
            "scores": top_scores
        }), 200
        
    except Exception as e:
        print(f"Error fetching leaderboard: {e}")
        return jsonify({"error": "Failed to fetch leaderboard"}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    db_status = "connected" if scores_collection is not None else "disconnected"
    return jsonify({
        "status": "healthy",
        "database": db_status
    }), 200

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=True)
