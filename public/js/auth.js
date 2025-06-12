// public/js/auth.js
class AuthManager {
  constructor() {
    this.initializeEventListeners();
    this.checkExistingAuth();
    this.selectDefaultColor();
  }

  initializeEventListeners() {
    // Formulaires
    document
      .getElementById("loginForm")
      .addEventListener("submit", this.handleLogin.bind(this));
    document
      .getElementById("registerForm")
      .addEventListener("submit", this.handleRegister.bind(this));

    // Basculer entre connexion et inscription
    document
      .getElementById("showRegister")
      .addEventListener("click", this.showRegisterForm.bind(this));
    document
      .getElementById("showLogin")
      .addEventListener("click", this.showLoginForm.bind(this));

    // Gestion de la sélection de couleur
    document.querySelectorAll(".color-option").forEach((option) => {
      option.addEventListener("click", this.selectColor.bind(this));
    });

    // Validation du mot de passe en temps réel
    document
      .getElementById("confirmPassword")
      .addEventListener("input", this.validatePasswordMatch.bind(this));
  }

  selectColor(event) {
    document.querySelectorAll(".color-option").forEach((option) => {
      option.classList.remove("border-white");
      option.classList.add("border-transparent");
    });

    event.target.classList.remove("border-transparent");
    event.target.classList.add("border-white");
    document.getElementById("selectedColor").value = event.target.dataset.color;
  }

  selectDefaultColor() {
    document.querySelector(".color-option").click();
  }

  validatePasswordMatch() {
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const confirmInput = document.getElementById("confirmPassword");

    if (confirmPassword && password !== confirmPassword) {
      confirmInput.classList.add("border-red-500");
      confirmInput.classList.remove("border-white/20");
    } else {
      confirmInput.classList.remove("border-red-500");
      confirmInput.classList.add("border-white/20");
    }
  }

  showRegisterForm() {
    document.getElementById("loginForm").classList.add("hidden");
    document.getElementById("registerForm").classList.remove("hidden");
    document.getElementById("subtitle").textContent = "Créer un nouveau compte";
    this.hideError();
  }

  showLoginForm() {
    document.getElementById("registerForm").classList.add("hidden");
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("subtitle").textContent =
      "Connectez-vous pour jouer";
    this.hideError();
  }

  showError(message) {
    const errorDiv = document.getElementById("errorMessage");
    errorDiv.textContent = message;
    errorDiv.classList.remove("hidden");
  }

  hideError() {
    document.getElementById("errorMessage").classList.add("hidden");
  }

  showLoading() {
    document.getElementById("loadingIndicator").classList.remove("hidden");
  }

  hideLoading() {
    document.getElementById("loadingIndicator").classList.add("hidden");
  }

  async handleLogin(event) {
    event.preventDefault();

    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!username || !password) {
      this.showError("Veuillez remplir tous les champs");
      return;
    }

    this.showLoading();
    this.hideError();

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Sauvegarder le token et les données utilisateur
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userData", JSON.stringify(data.user));
        localStorage.setItem("playerColor", "#ef4444"); // Couleur par défaut

        // Rediriger vers le jeu
        window.location.href = "/game.html";
      } else {
        this.showError(data.error || "Erreur de connexion");
      }
    } catch (error) {
      this.showError("Erreur de connexion au serveur");
    } finally {
      this.hideLoading();
    }
  }

  async handleRegister(event) {
    event.preventDefault();

    const username = document.getElementById("registerUsername").value.trim();
    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;
    const selectedColor = document.getElementById("selectedColor").value;

    // Validations
    if (!username || !email || !password || !confirmPassword) {
      this.showError("Veuillez remplir tous les champs");
      return;
    }

    if (password !== confirmPassword) {
      this.showError("Les mots de passe ne correspondent pas");
      return;
    }

    if (password.length < 6) {
      this.showError("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }

    if (username.length < 3) {
      this.showError(
        "Le nom d'utilisateur doit contenir au moins 3 caractères"
      );
      return;
    }

    this.showLoading();
    this.hideError();

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        // Sauvegarder le token et les données utilisateur
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userData", JSON.stringify(data.user));
        localStorage.setItem("playerColor", selectedColor);

        // Rediriger vers le jeu
        window.location.href = "/game.html";
      } else {
        this.showError(data.error || "Erreur lors de la création du compte");
      }
    } catch (error) {
      this.showError("Erreur de connexion au serveur");
    } finally {
      this.hideLoading();
    }
  }

  checkExistingAuth() {
    const token = localStorage.getItem("authToken");
    if (token) {
      // Vérifier si le token est encore valide
      window.location.href = "/game.html";
    }
  }
}

// Initialiser le gestionnaire d'authentification
new AuthManager();
