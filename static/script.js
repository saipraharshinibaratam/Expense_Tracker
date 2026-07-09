document.addEventListener('DOMContentLoaded', function() {
    // Set default date to today
    document.getElementById('date').valueAsDate = new Date();
    document.getElementById('predict_date').valueAsDate = new Date();

    // Load expenses on page load
    loadExpenses();
    loadStats();

    // Add expense form submission
    document.getElementById('expenseForm').addEventListener('submit', function(e) {
        e.preventDefault();
        addExpense();
    });

    // Predict expense button
    document.getElementById('predictBtn').addEventListener('click', function() {
        predictExpense();
    });
});

function addExpense() {
    const date = document.getElementById('date').value;
    const category = document.getElementById('category').value;
    const amount = document.getElementById('amount').value;
    const description = document.getElementById('description').value;
    const payment_method = document.getElementById('payment_method').value;

    if (!date || !category || !amount) {
        alert('Please fill in all required fields');
        return;
    }

    fetch('/add_expense', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            date: date,
            category: category,
            amount: parseFloat(amount),
            description: description,
            payment_method: payment_method
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            document.getElementById('expenseForm').reset();
            document.getElementById('date').valueAsDate = new Date();
            loadExpenses();
            loadStats();
            showNotification('Expense added successfully!', 'success');
        } else {
            showNotification('Error: ' + data.message, 'error');
        }
    })
    .catch(error => {
        showNotification('Error adding expense', 'error');
        console.error('Error:', error);
    });
}

function loadExpenses() {
    fetch('/get_expenses')
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('expensesContainer');
        if (data.length === 0) {
            container.innerHTML = '<div class="no-expenses">No expenses recorded yet. Start tracking now!</div>';
            return;
        }

        let html = '';
        data.forEach(expense => {
            html += `
                <div class="expense-item">
                    <div class="expense-info">
                        <span class="expense-date">${expense.date}</span>
                        <span class="expense-category">${expense.category}</span>
                        <span class="expense-amount">$${expense.amount.toFixed(2)}</span>
                        ${expense.description ? `<span class="expense-description">${expense.description}</span>` : ''}
                        <span class="expense-payment">${expense.payment_method}</span>
                    </div>
                    <button class="btn-danger" onclick="deleteExpense(${expense.id})">Delete</button>
                </div>
            `;
        });
        container.innerHTML = html;
    })
    .catch(error => {
        console.error('Error loading expenses:', error);
    });
}

function deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;

    fetch(`/delete_expense/${id}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            loadExpenses();
            loadStats();
            showNotification('Expense deleted successfully!', 'success');
        } else {
            showNotification('Error deleting expense', 'error');
        }
    })
    .catch(error => {
        showNotification('Error deleting expense', 'error');
        console.error('Error:', error);
    });
}

function predictExpense() {
    const category = document.getElementById('predict_category').value;
    const date = document.getElementById('predict_date').value;

    if (!date) {
        alert('Please select a date');
        return;
    }

    // Show loading state
    const resultDiv = document.getElementById('predictionResult');
    const detailsDiv = document.getElementById('predictionDetails');
    resultDiv.innerHTML = '⏳ Predicting...';
    resultDiv.style.display = 'block';
    resultDiv.style.borderColor = '#667eea';
    detailsDiv.innerHTML = '';

    fetch('/predict', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            category: category,
            date: date
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            resultDiv.innerHTML = `❌ ${data.error}`;
            resultDiv.style.borderColor = '#ff6b6b';
            detailsDiv.innerHTML = 'Try adding some expenses first to train the AI model.';
        } else {
            resultDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <span>${data.message}</span>
                    <span style="font-size:1.5rem; color:#667eea; font-weight:700;">$${data.predicted_amount}</span>
                </div>
            `;
            resultDiv.style.borderColor = '#4CAF50';
            
            if (data.details) {
                detailsDiv.innerHTML = `
                    📊 Based on day ${data.details.day} and month ${data.details.month}
                `;
            }
        }
        resultDiv.classList.add('show');
    })
    .catch(error => {
        resultDiv.innerHTML = '❌ Error connecting to server';
        resultDiv.style.borderColor = '#ff6b6b';
        detailsDiv.innerHTML = 'Please check if the server is running.';
        console.error('Error:', error);
    });
}

function loadStats() {
    fetch('/stats')
    .then(response => response.json())
    .then(data => {
        // Total expenses
        document.getElementById('totalExpenses').textContent = `$${data.total.toFixed(2)}`;

        // Category breakdown
        const breakdownDiv = document.getElementById('categoryBreakdown');
        if (!data.categories || data.categories.length === 0) {
            breakdownDiv.innerHTML = '<p style="color:#888;">No data available</p>';
            return;
        }

        let html = '';
        data.categories.forEach(cat => {
            html += `
                <div class="category-item">
                    ${cat.category}: <strong>$${cat.amount.toFixed(2)}</strong>
                </div>
            `;
        });
        breakdownDiv.innerHTML = html;
    })
    .catch(error => {
        console.error('Error loading stats:', error);
    });
}

function showNotification(message, type) {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(el => el.remove());
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        background: ${type === 'success' ? '#4CAF50' : '#ff6b6b'};
        color: white;
        font-weight: 600;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.5s ease;
        max-width: 400px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.5s ease';
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);