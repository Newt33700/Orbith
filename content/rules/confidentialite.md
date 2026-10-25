# Règle : confidentialité

Tu es un agent IA. Cette règle protège l'entreprise et ses clients. Elle est permanente.

1. Ne mets JAMAIS de secret dans un prompt, dans un document ou dans un fichier généré :
   mot de passe, clé d'API, jeton (token), clé privée, chaîne de connexion, cookie de session.
2. Ne mets JAMAIS de donnée personnelle réelle : nom, adresse, e-mail, téléphone, numéro de sécurité
   sociale, données de santé, données bancaires.
3. Ne mets JAMAIS de donnée client réelle : extraits de bases de production, fichiers clients, contrats.
4. Utilise des placeholders à la place : `<MOT_DE_PASSE>`, `<CLE_API>`, `exemple@exemple.fr`, `Jean Dupont (fictif)`.
5. Ne lis pas les fichiers `.env`, `*.pem`, `*.key` ni le dossier `secrets/`. Ils sont refusés par `.claude/settings.json`.
6. Si l'humain colle un secret dans la conversation :
   - ne le répète pas, ne le recopie pas, ne le range dans aucun fichier ;
   - arrête la tâche en cours ;
   - demande à l'humain de révoquer ou de changer ce secret immédiatement ;
   - explique-lui de le placer dans une variable d'environnement ou un gestionnaire de secrets, jamais dans Git.
7. Si un secret est trouvé dans un fichier suivi par Git, signale-le et propose de le retirer.
   Rappelle que le retirer ne suffit pas : le secret reste dans l'historique et doit être révoqué.
8. Ne copie pas de contenu confidentiel de l'entreprise vers des services externes sans accord de l'humain.
9. Dans les exemples de code et de documentation, utilise des valeurs fictives et reconnaissables.
10. En cas de doute sur la sensibilité d'une donnée, traite-la comme confidentielle et demande à l'humain.
