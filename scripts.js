document.getElementById('loginForm').addEventListener('submit', function (e) {
  e.preventDefault();

  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value.trim();

  if (username === "" || password === "") {
    showAlert("Todos os campos são obrigatórios.");
    return;
  }

  if (username === "SiqueiraX" && password === "1234") {
    showAlert("Login bem-sucedido!", "success");
    // Redirecionar ou outra lógica aqui
  } else {
    showAlert("Usuário ou senha incorretos.");
  }
});

function showAlert(message, type = "error") {
  const alertBox = document.getElementById('alert');
  alertBox.textContent = message;
  alertBox.classList.remove('hide');

  // Muda a cor se for sucesso
  if (type === "success") {
    alertBox.style.backgroundColor = "#d4edda";
    alertBox.style.color = "#155724";
  } else {
    alertBox.style.backgroundColor = "#f8d7da";
    alertBox.style.color = "#721c24";
  }

  // Ocultar após 4 segundos
  setTimeout(() => {
    alertBox.classList.add('hide');
  }, 4000);
}
