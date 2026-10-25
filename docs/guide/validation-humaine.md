# La validation humaine

Orbith repose sur un principe : **l'IA propose, l'humain décide.** Un agent peut rédiger un brief, une user story
ou une architecture, mais seule une personne peut déclarer ce document **validé**. Ce guide explique comment cela
fonctionne et comment s'y retrouver.

## Pourquoi ?

Un document validé engage l'équipe : on le développe, on le livre, on s'y réfère pour les audits. Il doit donc
avoir été relu par une personne responsable. Orbith garantit trois choses :

1. Un agent ne peut pas s'auto-valider.
2. Une validation porte un nom, une date et une empreinte du contenu.
3. Une modification après validation est détectée.

## Les trois statuts

Chaque document Orbith possède un champ `statut` dans son en-tête (la partie entre les deux lignes `---` en haut du
fichier).

| Statut | Qui le met ? | Signification |
|---|---|---|
| `brouillon` | L'agent | Document rédigé, pas encore relu |
| `en-revue` | L'agent, sur demande | Document prêt à être relu par une personne |
| `validé` | **Seulement** `npx orbith valider` | Document relu et approuvé par une personne |

Voici l'en-tête d'un brief une fois validé :

```yaml
---
type: brief
statut: validé
valide_par: Claire Martin
valide_le: 2026-10-25T10:00:00.000Z
---
```

Les champs `valide_par` et `valide_le` sont ajoutés automatiquement par la commande de validation. Un agent qui
écrit `statut: validé` à la main ne suffit pas : Orbith ne le reconnaîtra pas comme validé (voir plus bas).

## Valider un document

Depuis la racine du projet, lancez :

```bash
npx orbith valider docs/produit/brief.md
```

La commande procède en quatre temps :

1. **Elle affiche un résumé** : type du document, identifiant (par exemple `US-012`) et titre.
2. **Elle vous demande de confirmer** : « Je confirme avoir relu et valider ce document ». Répondez `oui` seulement
   si vous l'avez réellement relu.
3. **Elle récupère votre identité** dans la configuration Git (`user.name` et `user.email`). Si elle est absente,
   la commande s'arrête et vous explique comment la configurer.
4. **Elle enregistre la validation** : elle passe le statut à `validé`, ajoute votre nom et la date, et note
   l'empreinte du contenu dans le registre `.orbith/validations.json`.

### Valider sans question (`--yes`)

L'option `--yes` supprime la confirmation interactive. Elle est prévue pour les scripts, mais **elle ne doit être
utilisée que par une personne**, qui assume la validation. Ne l'intégrez jamais dans une automatisation qui validerait
des documents sans relecture humaine.

## L'empreinte du contenu

Pour savoir si un document a changé depuis sa validation, Orbith calcule une **empreinte** (un code SHA-256) du
contenu. Cette empreinte est calculée sur le **corps** du document, c'est-à-dire ce qui est sous l'en-tête, en
ignorant les différences de fin de ligne (Windows / Linux) et les espaces en début et fin de texte.

Conséquences pratiques :

- **Changer le statut** ou le nom du validateur ne modifie pas l'empreinte : pas besoin de revalider.
- **Modifier le texte** du document change l'empreinte : la validation n'est plus valable.
- **Déplacer une story** d'une colonne à l'autre (`status`) ne modifie pas l'empreinte : une story peut donc passer
  de « Prête » à « En cours » sans être revalidée.

## Les situations possibles

Une fois le document validé, `npx orbith check` le classe dans l'un des états suivants :

| État | Ce que cela veut dire | Que faire ? |
|---|---|---|
| **Validé** | Statut `validé`, et l'empreinte correspond | Rien |
| **Modifié après validation** | Le statut dit `validé`, mais le contenu a changé depuis | Relire le document, puis le revalider avec `npx orbith valider` |
| **Validation non tracée** | Le statut dit `validé`, mais aucune validation n'est enregistrée | Relire, puis valider avec `npx orbith valider` (quelqu'un a modifié le statut à la main) |
| **Non validé** | Statut `brouillon` ou `en-revue` | Relire, corriger, puis valider |

Les états « modifié après validation » et « validation non tracée » sont des **erreurs** pour `npx orbith check` :
la commande échoue. C'est volontaire : une validation qui ne correspond plus au contenu n'a plus de valeur.

## Qui valide quoi ?

Par défaut, Orbith ne fixe pas les personnes qui valident : cela dépend de votre organisation. Si vous le souhaitez,
`.orbith/config.yaml` peut imposer une **matrice des rôles** (qui valide quel type de document) et le **principe des
quatre yeux** (on ne valide pas ce qu'on a soi-même écrit) : voir [changements-roles.md](changements-roles.md).
Voici un exemple de répartition, à adapter à vos pratiques :

| Document | Validateur habituel |
|---|---|
| Brief, PRD, epics | Product Owner, puis sponsor métier si nécessaire |
| UX | Product Owner et référent UX |
| Architecture, ADR | Lead tech ou architecte d'entreprise |
| User stories | Product Owner |
| Revue de code | Un autre développeur (en dehors de la validation Orbith) |

## Questions fréquentes

**Un agent peut-il valider à ma place ?**
Non. Les agents ne peuvent ni écrire `valide_par` ni enregistrer une validation. Seule la commande
`npx orbith valider`, lancée par une personne, le fait.

**J'ai corrigé une faute de frappe après validation. Dois-je tout recommencer ?**
Non, mais vous devez revalider. Relisez la modification, puis relancez `npx orbith valider <fichier>`. La nouvelle
validation remplace l'ancienne.

**Pourquoi `npx orbith valider` demande-t-il mon nom ?**
Il ne le demande pas : il prend le nom configuré dans Git. Si vous n'en avez pas, configurez-le (voir
[demarrage.md](demarrage.md)).

**Où est enregistré l'historique des validations ?**
Dans `.orbith/validations.json`. Ce fichier est versionné avec le projet, pour garder une trace partageable. C'est un
journal **chaîné** : chaque entrée porte l'empreinte de la précédente (champ `precedent`). Ne le modifiez jamais à la
main : `npx orbith check` signalerait une « chaîne d'audit rompue » et `npx orbith valider` refuserait d'écrire (voir
[integrite-sbom.md](integrite-sbom.md)). Quand le projet est un dépôt Git, `npx orbith check` compare aussi le registre à
sa version commitée : retirer une entrée (même la dernière) donne l'erreur « Entrée supprimée ou modifiée ». Seule limite
restante : une réécriture à la main qui garde chaque fichier validé (hash changé, chaîne recalculée) ressemble à une
revalidation et n'est repérable que dans l'historique Git.

**Puis-je annuler une validation ?**
Repassez simplement le statut à `brouillon` ou `en-revue` dans l'en-tête, puis informez l'équipe. Le document n'est
alors plus considéré comme validé. Pour le valider à nouveau, relancez `npx orbith valider <fichier>`.

## Résumé

- Un agent **rédige**, un humain **relit et valide**.
- `npx orbith valider <fichier>` est **le seul** moyen de passer à `validé`.
- Toute modification après validation est **détectée** par `npx orbith check`.
