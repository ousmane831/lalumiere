# La Lumière — Gestion scolaire

Application web complète : **React** (interface) + **Django REST** (API) + **PostgreSQL** (base de données).
Interface en français, montants en FCFA, utilisable sur ordinateur, tablette et téléphone.

## Démarrage rapide (Docker)

```bash
docker compose up --build
# dans un second terminal, une seule fois :
docker compose exec backend python manage.py seed      # données de démonstration fictives
```

- Application : http://localhost:5173
- API : http://localhost:8000/api/ — administration Django : http://localhost:8000/admin/
- Comptes de démonstration (mot de passe `lumiere2026`) : `directeur`, `secretaire`, `comptable`, `enseignant`.
  **Supprimez-les ou changez leurs mots de passe avant toute mise en service réelle** (Administration → Utilisateurs).

## Démarrage sans Docker

```bash
# PostgreSQL : créer la base « lumiere » et un utilisateur, puis
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DB_NAME=lumiere DB_USER=lumiere DB_PASSWORD=... DB_HOST=localhost
python manage.py migrate
python manage.py createsuperuser        # le superutilisateur a les droits du directeur
python manage.py runserver

cd frontend && npm install && npm run dev
```

## Ce que contient l’application

| Module | Fonctions |
|---|---|
| **Tableau de bord** | Élèves, enseignants, payés / partiels / impayés du mois, arriérés, recettes, dépenses, trésorerie, caisse et comptes, graphique de l’année. Choix du mois et de l’année. |
| **Élèves** | Matricule automatique, photo, tous les champs du dossier, situation (inscrit / parti), recherche par nom, matricule ou classe, filtre par classe, **réinscription avec historique**, **dossier complet** (historique scolaire, assiduité, mensualités, paiements), export Excel / PDF. |
| **Classes** | Les 16 niveaux (petite section → terminale) et autant de classes que voulu par niveau (CI A, CI B, Terminale L1, S2…), par année scolaire. |
| **Paiements** | Une mensualité = une ligne : payer octobre n’efface pas septembre. Statuts payé / partiel / impayé, arriérés, filtre par classe, 4 modes de règlement, référence, caissier, **reçu PDF** (logo, numéro, reste à payer), exports. |
| **Enseignants** | Fiches, compte de connexion, **affectations** (enseignant × classe × matière × heures), **absences et remplacements**, heures prévues (depuis l’emploi du temps) et réalisées, salaire fixe **ou** à l’heure, versement (crée la dépense), état mensuel exportable. |
| **Emploi du temps** | Cours par jour, classe, matière, enseignant, salle ; **conflits signalés** (enseignant ou classe déjà occupé). |
| **Notes et bulletins** | Matières et coefficients par classe, devoirs et compositions, saisie par l’enseignant (uniquement ses matières), moyennes, rang, appréciation du directeur, **bulletin PDF**, résultats exportables. Trimestres ou semestres au choix. |
| **Absences** | Appel quotidien par classe (présent / absent / retard, justifiée ou non, motif), historique. |
| **Finances** | Dépenses (9 catégories dont salaires administratifs, mode de paiement, bénéficiaire, **pièce justificative**), **recettes** autres que la scolarité (inscription, examen, transport, cantine, autres), **caisse en espèces et comptes Wave / Orange Money / banque séparés**, trésorerie = solde initial + encaissements − décaissements. |
| **Rapports** | Rapport **mensuel** (attendu, encaissé, impayés, dépenses, trésorerie, impayés par classe, modes de règlement, catégories, salaires) et rapport **annuel** ; export **PDF et Excel**. |
| **Administration** | Utilisateurs et rôles, paramètres de l’école (nom, adresse, logo, trimestres/semestres), **historique des opérations** (qui a fait quoi, quand). |

## Rôles

| Profil | Accès |
|---|---|
| **Directeur** | Tout. |
| **Secrétariat** | Élèves et dossiers (sans données financières), classes, affectations, emplois du temps, absences, notes et bulletins, absences d’enseignants. Ne voit ni paiements ni salaires. |
| **Comptable / Caissier** | Tableau de bord, paiements, recettes, dépenses, salaires et heures, finances, rapports. Consulte élèves et enseignants. |
| **Enseignant** | Son emploi du temps, ses classes (sans montants), ses notes et absences. |

Les droits sont vérifiés **côté serveur**, pas seulement masqués dans le menu.

## Sauvegardes et sécurité

- `docker compose` lance un service `backup` : sauvegarde quotidienne de PostgreSQL dans `./backups` (14 jours + 4 semaines). **Copiez régulièrement ce dossier hors du serveur.**
- Connexion par jetons JWT (2 h, renouvelés automatiquement), mots de passe de 8 caractères minimum, historique des opérations consultable par le directeur.
- Données personnelles des élèves : accès limité par profil ; placez l’application derrière HTTPS.

## Mise en production (à faire)

`DEBUG=0`, `SECRET_KEY` aléatoire, `ALLOWED_HOSTS`, `CORS_ORIGINS`, mots de passe de base de données, HTTPS (Nginx ou Caddy), `npm run build` puis servir `frontend/dist` ; servir aussi le dossier `media/` (photos, justificatifs) en dehors de Django. Variables : voir `backend/.env.example`.

## Limites connues

- Les mensualités se calculent de septembre à juin sur le tarif mensuel actuel de l’élève (un changement de tarif s’applique à tout l’historique).
- Pas de paiement en ligne : Wave et Orange Money sont des modes d’enregistrement, sans connexion à leurs services.
- Pas de notifications SMS aux parents.
