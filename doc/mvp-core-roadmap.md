# Overlord MVP Core Roadmap (référence)

Ce document sert de référence pour piloter la construction du MVP Core d'Overlord.

## Vision MVP

Livrer un runtime capable de traiter **une famille d'intents** de bout en bout, avec:
- contrôles de capabilities avant opérations protégées,
- soumission/monitoring via adapter d'exécution,
- audit traçable des transitions majeures,
- architecture portable (backend mémoire / provider interchangeables).

> Aligné avec `doc/technical-scope.md` sections 4, 8 et 9.

---

## Phase 0 — Stabilisation de la base (TypeScript)

### Objectif
Avoir une base de dev cohérente, avec TypeScript comme source de vérité.

### Scope
- Unifier les scripts de dev/test sur les fichiers `.ts`.
- Éviter les doublons divergents JS/TS au niveau logique métier.
- Vérifier que le flux local fonctionne (`npm test`, `npm run dev`).

### Done criteria
- Tous les imports runtime pointent sur les modules TypeScript.
- Les tests exécutés par défaut ciblent le chemin TS.
- Le parcours intent -> plan -> execution -> audit reste vert.

---

## Phase 1 — Intent Gateway

### Objectif
Implémenter l'entrée d'intent robuste (validation + normalisation).

### Livrables
- Validation stricte du `IntentEnvelope`.
- Gestion version de schéma.
- Attribution/propagation correlation id.
- Réponses d'erreurs structurées.

### Done criteria
- Tests: payload invalide, version invalide, intent valide.

---

## Phase 2 — Policy & Capability Guard

### Objectif
Garantir le modèle closed-by-default.

### Livrables
- Composant dédié de policy/capability guard.
- Vérifications avant chaque opération protégée.
- Audit des autorisations (allow/deny).

### Done criteria
- Aucun accès protégé sans check explicite.
- Tests de refus et d'audit de refus.

---

## Phase 3 — Planning Engine + Clarification Loop

### Objectif
Passer d'un plan statique à un moteur de planification MVP.

### Livrables
- Production d'une proposition de plan structurée.
- Branches: `proposal`, `clarification`, `scope_request`, `no_action`.
- Règles déterministes de planification.

### Done criteria
- Tests de déterminisme et de branches de sortie.

---

## Phase 4 — Arbiter + Freeze + Execution Adapter

### Objectif
Valider et figer le plan avant soumission exécution.

### Livrables
- Arbiter de validation sécurité/structure.
- Plan "freeze" (version/hash).
- Suivi d'état via provider (`submit/get/subscribe/cancel`).

### Done criteria
- Tests de transitions d'état et de rollback/annulation.

---

## Phase 5 — Audit E2E & Traceability

### Objectif
Rendre chaque décision/relation observable et retraçable.

### Livrables
- Taxonomie d'événements d'audit MVP.
- Propagation correlation id sur toute la chaîne.
- Vérification d'intégrité minimale des audits.

### Done criteria
- Reconstitution d'une timeline complète pour un intent.

---

## Phase 6 — Portabilité & Contract Tests

### Objectif
Prouver l'indépendance du core runtime.

### Livrables
- Contract tests pour PLOS adapter.
- Contract tests pour Execution provider.
- Second adapter/provider de validation (mock/stub).

### Done criteria
- Changement d'adapter/provider sans réécriture du core.

---

## Cadence recommandée
- Sprint A: Phases 0-1
- Sprint B: Phases 2-3
- Sprint C: Phases 4-5
- Sprint D: Phase 6
