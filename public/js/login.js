// public/js/login.js
class LoginManager {
  constructor() {
    this.initializeEventListeners();
    this.loadPlayerStats();
    this.selectDefaultColor();
  }

  initializeEventListeners() {
    document
      .getElementById("loginForm")
      .addEventListener("submit", this.handleLogin.bind(this));

    // Gestion de la sélection de couleur
    document.querySelectorAll(".color-option").forEach((option) => {
      option.addEventListener("click", this.selectColor.bind(this));
    });

    // Charger le nom sauvegardé
    const savedName = localStorage.getItem("playerName");
    if (savedName) {
      document.getElementById("playerName").value = savedName;
    }
  }

  selectColor(event) {
    // Retirer la sélection précédente
    document.querySelectorAll(".color-option").forEach((option) => {
      option.classList.remove("border-white");
      option.classList.add("border-transparent");
    });

    // Sélectionner la nouvelle couleur
    event.target.classList.remove("border-transparent");
    event.target.classList.add("border-white");
    document.getElementById("selectedColor").value = event.target.dataset.color;
  }

  selectDefaultColor() {
    document.querySelector(".color-option").click();
  }

  loadPlayerStats() {
    const stats = this.getPlayerStats();
    document.getElementById("bestScore").textContent = stats.bestScore;
    document.getElementById("gamesPlayed").textContent = stats.gamesPlayed;
  }

  getPlayerStats() {
    const stats = localStorage.getItem("playerStats");
    return stats ? JSON.parse(stats) : { bestScore: 0, gamesPlayed: 0 };
  }

  savePlayerStats(stats) {
    localStorage.setItem("playerStats", JSON.stringify(stats));
  }

  handleLogin(event) {
    event.preventDefault();

    const playerName = document.getElementById("playerName").value.trim();
    const selectedColor = document.getElementById("selectedColor").value;

    if (!playerName) {
      alert("Veuillez entrer un nom de joueur");
      return;
    }

    // Sauvegarder les données du joueur
    localStorage.setItem("playerName", playerName);
    localStorage.setItem("playerColor", selectedColor);

    // Incrémenter le nombre de parties jouées
    const stats = this.getPlayerStats();
    stats.gamesPlayed++;
    this.savePlayerStats(stats);

    // Rediriger vers le jeu
    window.location.href = "/game.html";
  }
}

// Initialiser le gestionnaire de connexion
new LoginManager();
