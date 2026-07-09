from flask import Flask, render_template, request, jsonify
import sqlite3
import pandas as pd
import pickle
import os
from datetime import datetime
import json
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import LabelEncoder
import traceback

app = Flask(__name__)

# Initialize database
def init_db():
    conn = sqlite3.connect('expenses.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS expenses
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  date TEXT,
                  category TEXT,
                  amount REAL,
                  description TEXT,
                  payment_method TEXT)''')
    conn.commit()
    conn.close()

# Load or train AI model
def get_model():
    try:
        if os.path.exists('model.pkl'):
            with open('model.pkl', 'rb') as f:
                return pickle.load(f)
        else:
            return train_model()
    except Exception as e:
        print(f"Error loading model: {e}")
        return None

def train_model():
    try:
        # Create sample training data if no dataset exists
        if not os.path.exists('dataset/expenses.csv'):
            sample_data = pd.DataFrame({
                'day': list(range(1, 31)),
                'month': [1]*30,
                'category': ['Food']*10 + ['Transport']*10 + ['Entertainment']*10,
                'amount': [200, 150, 300, 250, 180, 220, 350, 280, 190, 210,
                          50, 60, 45, 55, 70, 65, 80, 90, 75, 85,
                          500, 450, 600, 550, 480, 520, 650, 580, 490, 510]
            })
            os.makedirs('dataset', exist_ok=True)
            sample_data.to_csv('dataset/expenses.csv', index=False)
        
        # Load and train model
        df = pd.read_csv('dataset/expenses.csv')
        
        # Encode categorical variables
        le = LabelEncoder()
        df['category_encoded'] = le.fit_transform(df['category'])
        
        # Prepare features
        X = df[['day', 'month', 'category_encoded']]
        y = df['amount']
        
        # Train model
        model = LinearRegression()
        model.fit(X, y)
        
        # Save model and encoder
        with open('model.pkl', 'wb') as f:
            pickle.dump(model, f)
        
        # Save encoder for later use
        with open('encoder.pkl', 'wb') as f:
            pickle.dump(le, f)
        
        return model
    except Exception as e:
        print(f"Error training model: {e}")
        return None

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/add_expense', methods=['POST'])
def add_expense():
    try:
        data = request.json
        date = data.get('date')
        category = data.get('category')
        amount = float(data.get('amount'))
        description = data.get('description', '')
        payment_method = data.get('payment_method', 'Cash')
        
        conn = sqlite3.connect('expenses.db')
        c = conn.cursor()
        c.execute('''INSERT INTO expenses (date, category, amount, description, payment_method)
                     VALUES (?, ?, ?, ?, ?)''',
                  (date, category, amount, description, payment_method))
        conn.commit()
        conn.close()
        
        return jsonify({'success': True, 'message': 'Expense added successfully!'})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/get_expenses')
def get_expenses():
    try:
        conn = sqlite3.connect('expenses.db')
        c = conn.cursor()
        c.execute('SELECT * FROM expenses ORDER BY date DESC')
        expenses = c.fetchall()
        conn.close()
        
        expenses_list = []
        for exp in expenses:
            expenses_list.append({
                'id': exp[0],
                'date': exp[1],
                'category': exp[2],
                'amount': exp[3],
                'description': exp[4],
                'payment_method': exp[5]
            })
        
        return jsonify(expenses_list)
    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/delete_expense/<int:id>', methods=['DELETE'])
def delete_expense(id):
    try:
        conn = sqlite3.connect('expenses.db')
        c = conn.cursor()
        c.execute('DELETE FROM expenses WHERE id = ?', (id,))
        conn.commit()
        conn.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})

@app.route('/predict', methods=['POST'])
def predict_expense():
    try:
        data = request.json
        model = get_model()
        
        if model is None:
            return jsonify({'error': 'AI model not available. Please add some expenses first.'})
        
        # Get current date info
        date_str = data.get('date')
        if not date_str:
            date_str = datetime.now().strftime('%Y-%m-%d')
        
        date = datetime.strptime(date_str, '%Y-%m-%d')
        day = date.day
        month = date.month
        
        # Get category
        category = data.get('category', 'Food')
        
        # Load encoder
        try:
            with open('encoder.pkl', 'rb') as f:
                le = pickle.load(f)
            
            # Check if category exists in encoder
            if category in le.classes_:
                category_encoded = le.transform([category])[0]
            else:
                # If new category, use a default encoding
                category_encoded = 0
        except:
            # Simple encoding fallback
            category_dict = {'Food': 0, 'Transport': 1, 'Entertainment': 2, 
                            'Shopping': 3, 'Utilities': 4, 'Other': 5}
            category_encoded = category_dict.get(category, 0)
        
        # Make prediction
        prediction = model.predict([[day, month, category_encoded]])[0]
        
        # Ensure prediction is positive
        prediction = max(0, prediction)
        
        return jsonify({
            'predicted_amount': round(prediction, 2),
            'message': f'Predicted expense for {category} on {date.strftime("%B %d, %Y")}',
            'details': {
                'day': day,
                'month': month,
                'category': category
            }
        })
    except Exception as e:
        print(f"Prediction error: {traceback.format_exc()}")
        return jsonify({'error': f'Prediction failed: {str(e)}'})

@app.route('/stats')
def get_stats():
    try:
        conn = sqlite3.connect('expenses.db')
        
        # Total expenses
        total = pd.read_sql_query('SELECT SUM(amount) as total FROM expenses', conn)
        
        # Category breakdown
        categories = pd.read_sql_query('SELECT category, SUM(amount) as amount FROM expenses GROUP BY category', conn)
        
        # Monthly trend
        monthly = pd.read_sql_query('''SELECT strftime('%Y-%m', date) as month, 
                                       SUM(amount) as total 
                                       FROM expenses 
                                       GROUP BY month 
                                       ORDER BY month''', conn)
        
        conn.close()
        
        return jsonify({
            'total': float(total['total'].iloc[0]) if not total['total'].isnull().all() and len(total) > 0 else 0,
            'categories': categories.to_dict('records') if len(categories) > 0 else [],
            'monthly': monthly.to_dict('records') if len(monthly) > 0 else []
        })
    except Exception as e:
        return jsonify({'error': str(e)})

if __name__ == '__main__':
    init_db()
    # Initialize model on startup
    get_model()
    app.run(debug=True, port=5001)