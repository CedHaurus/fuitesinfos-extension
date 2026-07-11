# › Fuites Infos — extension navigateur

**Fuites Infos : Recensement des fuites de données impactants la France 🇫🇷**

Extension pour **Chrome, Firefox et Safari** qui vous avertit lorsque le site que vous consultez
appartient à une entité déjà victime d'une fuite de données recensée sur
[fuitesinfos.fr](https://fuitesinfos.fr).

![Aperçu de l'alerte](docs/apercu.webp)

## Fonctionnement

- Icône « › F » dans la barre : ardoise = rien à signaler, **rouge** = site concerné.
- Message **overlay** au chargement d'un site concerné, et **popup** détaillant l'incident
  (nom de l'entité, date, statut, lien vers fuitesinfos.fr).
- **Vérification 100 % locale** : aucune donnée de navigation n'est transmise. Le domaine visité
  est comparé à une liste embarquée, mise à jour périodiquement.

## Confidentialité

Aucune collecte de données personnelles. Voir la
[politique de confidentialité](https://fuitesinfos.fr/confidentialite-extension/).

## Installation

- **Chrome / Edge / Brave** : `chrome://extensions` → mode développeur → « Charger l'extension
  non empaquetée ». (Lien Chrome Web Store à venir.)
- **Firefox (desktop et Android)** : `about:debugging` → « Charger un module complémentaire
  temporaire ». (Lien AMO à venir.)
- **Safari** : conversion du dossier via `xcrun safari-web-extension-converter` (Xcode requis).

## Build

La liste des domaines et la clé de rafraîchissement sont **provisionnées au moment du build** et
ne sont pas incluses dans ce dépôt. Copier `src/index-key.example.js` en `src/index-key.js` et
renseigner les valeurs.

## Licence

Distribué sous licence **GPL-3.0-or-later** — voir [LICENSE](LICENSE).
Copyright © 2026 Christophe Boutry — Fuites Infos.

---

[fuitesinfos.fr](https://fuitesinfos.fr)
