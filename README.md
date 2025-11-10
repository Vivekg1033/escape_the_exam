# Escape the Exam - PWA Game

A Progressive Web App endless runner game where you play as a college student escaping from exams!

## Quick Start

1. Clone and navigate to project folder
2. Create virtual environment: python -m venv venv
3. Activate: venv\Scripts\activate (Windows) or source venv/bin/activate (Mac/Linux)
4. Install dependencies: pip install -r requirements.txt
5. Set up MongoDB Atlas and add connection string to .env file
6. Run: python app.py
7. Open: http://localhost:5000

## Features

- Endless runner gameplay
- Progressive Web App (installable)
- Online leaderboard with MongoDB Atlas
- Responsive design
- Offline gameplay support
- Score tracking and high scores

## Tech Stack

- Frontend: HTML5 Canvas, JavaScript, CSS3
- Backend: Python Flask
- Database: MongoDB Atlas
- PWA: Service Workers, Manifest

## Setup MongoDB Atlas

1. Create free account at mongodb.com/cloud/atlas
2. Create cluster and database: escape_exam_db
3. Create collection: scores
4. Get connection string and add to .env file
5. Whitelist your IP address in Network Access

## Deployment

Works with Heroku, Railway, Render, or any Python hosting platform.

## How to Play

- Press SPACE or tap Jump button to jump
- Avoid obstacles (books, coffee spills, assignments)
- Collect snacks for bonus points
- Survive as long as you can!

## License

MIT License - free to use for learning or commercial purposes