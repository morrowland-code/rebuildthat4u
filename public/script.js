document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
   
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;


    const response = await fetch('/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
    });


    const data = await response.json();


    if (data.success) {
        // Redirect to dashboard if login is successful
        window.location.href = 'dashboard.html';
    } else {
        alert('Login failed. Please try again.');
    }
});

