<p align="right"><a href="README.md">Read in English</a></p>

# Shopify Frequently Bought Together — Widget de vente croisée façon Amazon

[![Theme Check](https://github.com/pteyo032/shopify-frequently-bought-together/actions/workflows/theme-check.yml/badge.svg)](https://github.com/pteyo032/shopify-frequently-bought-together/actions/workflows/theme-check.yml)

Une section "Fréquemment achetés ensemble" intégrée au thème, pour les
fiches produit Shopify : le produit principal plus jusqu'à 3 produits
complémentaires, affichés en vignettes reliées par des "+", avec un total en
direct et un seul bouton qui ajoute tout au panier en un clic — le même
schéma popularisé par Amazon.

Conçu pour le thème **Shopify Horizon**. Aucune application tierce, aucun
abonnement mensuel.

![La section rendue sur une vraie fiche produit : titre, sous-titre, vignettes reliées par des "+", un total en direct, et un bouton "Ajouter au panier", le tout dans un contour configurable](docs/screenshots/frequently-bought-together.png)

## Fonctionnalités

- **Sourcé automatiquement ou manuellement.** Par défaut, les produits
  complémentaires viennent du moteur de recommandations "complémentaires"
  natif de Shopify — aucune configuration marchand nécessaire. Le marchand
  peut passer outre en choisissant jusqu'à 3 produits à la main.
- **Une section, pas un bloc — ajoutable sur n'importe quelle page.**
  Contrairement à un bloc verrouillé à l'endroit où il est imbriqué, c'est
  une section autonome : ajoutez-la sur une fiche produit (elle utilise le
  produit courant par défaut) ou sur n'importe quelle autre page avec un
  sélecteur de produit explicite.
- **Un clic ajoute tout.** Le produit principal (à sa variante actuellement
  sélectionnée) plus chaque produit complémentaire affiché, en une seule
  requête panier multi-articles — pas de cases à cocher par article à gérer.
- **Total en direct.** Recalculé à partir du prix résolu du produit
  principal × la quantité, plus le prix de chaque produit complémentaire.
- **Synchronisé avec un sélecteur de paliers "achetez plus, économisez
  plus"**, si le thème en a un (voir
  [shopify-bundle-selector](https://github.com/pteyo032/shopify-bundle-selector))
  — le prix et la quantité ajoutée suivent le palier sélectionné.
- **Contour, titre, sous-titre et texte du bouton configurables** — aucune
  modification de code nécessaire pour correspondre à une référence visuelle.

## Contenu du dépôt

Ce dépôt contient **uniquement le code personnalisé de cette fonctionnalité**
— pas le thème Horizon complet, qui appartient à Shopify. Vous déposez ces
fichiers dans un thème Horizon (ou basé sur Horizon) existant.

| Chemin | Ce que c'est |
|---|---|
| `sections/frequently-bought-together.liquid` | La section : markup, styles, schema |
| `assets/frequently-bought-together.js` | Le web component `<frequently-bought-together-component>` — synchro variante/palier, total en direct, soumission panier |
| `locales/*.json`, `locales/*.schema.json` | Traductions anglais + français (texte storefront et libellés de l'éditeur) |
| `docs/integration-guide.md` | Comment l'installer, sourcer les produits automatiquement ou manuellement, et la faire apparaître automatiquement sur toutes les fiches produit |
| `docs/product-json-snippet.json` | Un exemple d'entrée de template JSON prêt à adapter pour l'affichage automatique partout |
| `docs/gotchas.md` | Pièges techniques rencontrés en construisant ceci, pour ne pas les redécouvrir |

## Démarrage rapide

1. Copiez `sections/`, `assets/` et les clés de traduction de `locales/`
   dans votre thème.
2. Dans l'éditeur de thème, ajoutez la section **Fréquemment achetés
   ensemble** sur une fiche produit (ou n'importe quelle page, avec un
   produit choisi manuellement).
3. Laissez "Produits complémentaires" vide pour les recommandations
   automatiques, ou choisissez jusqu'à 3 produits manuellement.

Pour la faire apparaître automatiquement sur toutes les fiches produit sans
l'ajouter à la main à chaque fois, voir `docs/integration-guide.md`.

## Limite connue

Les recommandations automatiques de produits complémentaires de Shopify
dépendent de l'historique de commandes. Une boutique récente, ou un produit
avec peu de commandes passées, peut n'afficher rien en mode automatique
pendant un certain temps — c'est un comportement Shopify attendu, pas un bug
de ce code. Utilisez l'override manuel pour un résultat prévisible sur une
nouvelle boutique.

## Licence

MIT — voir `LICENSE`.
